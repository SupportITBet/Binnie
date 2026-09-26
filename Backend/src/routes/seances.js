/**
 * /api/seances - Route centralisée des séances BET
 *
 * Couvre les 3 circuits :
 *   circuit=groupe   → séance d'un groupe présentiel (remplace groupes_cours)
 *   circuit=prive    → séance privée coach/apprenant (remplace seances_privees)
 *   circuit=live     → session visio e-learning (remplace sessions_live)
 *
 * Quand une séance passe à statut "realisee" via POST /cloturer/:id :
 *   1. Lit la grille tarifaire depuis la table `parametres`
 *   2. Calcule honoraire = tarif[grade][type] × multiplicateur[niveau] × duree_h
 *   3. Stocke honoraire_montant dans seances
 *   4. Incrémente nb_seances_realisees dans contrats_prives (circuit prive)
 *   5. Met à jour/crée l'agrégat mensuel dans honoraires_mois
 */

import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyRole, notifyUser } from "../services/notifyRole.js";
import { traiterClotureSeanceRemplacement } from "./remplacements.js";
import { groupesDeleguesA, refuserSiTitulaireDelegue } from "../services/delegations.js";

const router = express.Router();

/* ── Helpers ─────────────────────────────────────────────────── */

const GRILLE_DEFAULT = {
  tarifs: {
    "Vacataire": { en_ligne: 5000,  presentiel: 6500,  domicile: 7500  },
    "CDD":       { en_ligne: 6500,  presentiel: 8000,  domicile: 9000  },
    "CDI":       { en_ligne: 8000,  presentiel: 9500,  domicile: 11000 },
    "Freelance": { en_ligne: 6000,  presentiel: 7500,  domicile: 8500  },
  },
  multiplicateurs: { "A1-A2": 1.0, "B1-B2": 1.2, "C1-C2": 1.5 },
};

const MOIS_LABELS = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];

function niveauToGroupe(n) {
  if (!n) return "A1-A2";
  if (["A1","A2"].includes(n)) return "A1-A2";
  if (["B1","B2"].includes(n)) return "B1-B2";
  return "C1-C2";
}

function typeToKey(t) {
  if (!t) return "presentiel";
  const low = t.toLowerCase();
  if (low.includes("ligne") || low === "en_ligne") return "en_ligne";
  if (low.includes("domicile"))                    return "domicile";
  return "presentiel";
}

export async function getGrille() {
  try {
    const { data } = await supabase
      .from("parametres")
      .select("valeur")
      .eq("cle", "grille_tarifaire")
      .single();
    return data?.valeur || GRILLE_DEFAULT;
  } catch {
    return GRILLE_DEFAULT;
  }
}

export function calcHonoraire(grille, grade, type, niveau, dureeH) {
  const typeKey   = typeToKey(type);
  const niveauKey = niveauToGroupe(niveau);
  const base = grille.tarifs?.[grade]?.[typeKey] || 0;
  const mult = grille.multiplicateurs?.[niveauKey] || 1;
  return Math.round(base * (parseFloat(dureeH) || 1.5) * mult);
}

/* ── Mise à jour agrégat mensuel ─────────────────────────────── */
// Recalcule intégralement l'agrégat mensuel d'un coach à partir des séances réalisées
// non rejetées (remplace l'ancien upsertHonoraireMois() qui incrémentait au fil de l'eau
// et ne pouvait jamais se corriger si une séance était rejetée après coup ou si la grille
// tarifaire changeait). Préserve retenues/note_pa/statut déjà saisis par le PA.
export async function recalculerHonoraireMoisDash(coachId, mois, annee) {
  if (!coachId || !mois || !annee) return null;
  const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const fin   = new Date(annee, mois, 0).toISOString().slice(0, 10);

  const { data: seancesRealisees } = await supabase
    .from("seances")
    .select("id, honoraire_montant, duree_h")
    .eq("coach_id", coachId).eq("statut", "realisee")
    .neq("honoraire_statut", "rejete")
    .gte("date_seance", debut).lte("date_seance", fin);

  const rows = seancesRealisees || [];
  const nb_seances    = rows.length;
  const total_heures   = parseFloat(rows.reduce((s, r) => s + (parseFloat(r.duree_h) || 0), 0).toFixed(2));
  const montant_total  = parseFloat(rows.reduce((s, r) => s + (parseFloat(r.honoraire_montant) || 0), 0).toFixed(2));
  const seances_ids    = rows.map(r => r.id);

  const { data: existing } = await supabase
    .from("honoraires_mois").select("retenues, note_pa")
    .eq("coach_id", coachId).eq("mois", mois).eq("annee", annee).maybeSingle();
  const retenues    = existing?.retenues || 0;
  const montant_net = Math.max(0, montant_total - retenues);
  const ficheEtaitInexistante = !existing;

  const { data, error } = await supabase.from("honoraires_mois").upsert({
    coach_id: coachId, mois: Number(mois), annee: Number(annee),
    nb_seances, total_heures, montant_total, retenues, montant_net,
    note_pa: existing?.note_pa || null,
    seances_ids,
    updated_at: new Date().toISOString(),
  }, { onConflict: "coach_id,mois,annee" }).select().single();
  if (error) throw error;

  // Alerte le PA une seule fois, à la toute première apparition de la fiche du mois
  // (les recalculs suivants, à chaque nouvelle séance réalisée, ne renotifient pas).
  if (ficheEtaitInexistante && nb_seances > 0) {
    const { data: coach } = await supabase.from("utilisateurs").select("prenom, nom").eq("id", coachId).maybeSingle();
    const nomCoach = coach ? `${coach.prenom || ""} ${coach.nom || ""}`.trim() : "Un coach";
    await notifyRole(["pedagogical_advisor"], {
      type: "paiement",
      titre: "🆕 Nouvelle fiche d'honoraires à valider",
      message: `${nomCoach} - ${MOIS_LABELS[mois]} ${annee} - prête pour validation.`,
      meta: { coach_id: coachId, mois, annee },
      source: "dash",
    }).catch(() => {});
  }

  return data;
}

// Une fiche déjà transmise (ou payée) à la RH ne doit plus pouvoir être recalculée
// silencieusement - il faut d'abord la remettre "en attente".
export async function verifierFicheModifiableDash(coachId, mois, annee) {
  const { data: existant } = await supabase.from("honoraires_mois")
    .select("statut").eq("coach_id", coachId).eq("mois", mois).eq("annee", annee).maybeSingle();
  if (existant && (existant.statut === "transmis" || existant.statut === "paye")) {
    const err = new Error(`Cette fiche est déjà "${existant.statut === "paye" ? "payée" : "transmise à la RH"}" - remettez-la d'abord en attente avant de la modifier.`);
    err.statusCode = 409;
    throw err;
  }
}

/* ══════════════════════════════════════════════════════════════
   GET /api/seances/grille-tarifaire
   Expose la grille du PA (table parametres) aux coachs
══════════════════════════════════════════════════════════════ */
router.get("/grille-tarifaire", authenticateAdmin, async (req, res) => {
  const grille = await getGrille();
  res.json({ grille });
});

/* ══════════════════════════════════════════════════════════════
   GET /api/seances/coachs
   Liste des coachs réels (utilisateurs.role='coach') - pour les
   écrans PA/RH d'honoraires. Volontairement distinct de GET /api/coachs
   (table `coachs`, fiches d'affichage/vitrine pouvant exister sans
   compte auth) : ici on ne veut que des id garantis = utilisateurs.id,
   la même clé étrangère que seances.coach_id / honoraires_mois.coach_id.
══════════════════════════════════════════════════════════════ */
router.get("/coachs", authenticateAdmin, requirePermission("honoraires", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, avatar_url, actif, coach_info, type_coach")
      .eq("role", "coach")
      .order("nom");
    if (error) throw error;
    res.json({ coachs: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération coachs" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/seances
   Filtrages : circuit, coach_id, groupe_id, contrat_prive_id,
               statut, honoraire_statut, mois, annee, pa_id
══════════════════════════════════════════════════════════════ */
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { circuit, coach_id, groupe_id, contrat_prive_id,
            statut, honoraire_statut, mois, annee, pa_id } = req.query;

    let q = supabase
      .from("seances")
      .select("*")
      .order("date_seance", { ascending: false });

    if (circuit)           q = q.eq("circuit", circuit);
    if (coach_id)          q = q.eq("coach_id", coach_id);
    if (groupe_id)         q = q.eq("groupe_id", groupe_id);
    if (contrat_prive_id)  q = q.eq("contrat_prive_id", contrat_prive_id);
    if (pa_id)             q = q.eq("pa_id", pa_id);
    if (statut)            q = q.eq("statut", statut);
    if (honoraire_statut)  q = q.eq("honoraire_statut", honoraire_statut);

    if (mois && annee) {
      const debut = `${annee}-${String(mois).padStart(2,"0")}-01`;
      const fin   = new Date(annee, mois, 0).toISOString().slice(0, 10);
      q = q.gte("date_seance", debut).lte("date_seance", fin);
    }

    // Coach ne voit que ses propres séances - élargi aux séances de groupes qui lui sont
    // délégués (remplacement en cours), sinon un remplaçant assigné ne verrait jamais les
    // séances qu'il doit couvrir dans son planning.
    if (req.role === "coach") {
      const groupeIdsDelegues = await groupesDeleguesA(req.profil.id);
      q = groupeIdsDelegues.length
        ? q.or(`coach_id.eq.${req.profil.id},groupe_id.in.(${groupeIdsDelegues.join(",")})`)
        : q.eq("coach_id", req.profil.id);
    }

    const { data, error } = await q;
    if (error) throw error;

    // Présences enregistrées - permet au superviseur/deputy de vérifier qu'un cours "réalisé"
    // avait bien de vrais apprenants présents, pas juste clôturé pour la forme.
    const seanceIds = (data || []).map(s => s.id);
    let presCountMap = {};
    if (seanceIds.length) {
      const { data: pres } = await supabase
        .from("seances_presences")
        .select("seance_id, statut")
        .in("seance_id", seanceIds);
      (pres || []).forEach(p => {
        if (!presCountMap[p.seance_id]) presCountMap[p.seance_id] = { presents: 0, total: 0 };
        presCountMap[p.seance_id].total += 1;
        if (p.statut === "present") presCountMap[p.seance_id].presents += 1;
      });
    }
    // Repli sur groupes_presences - même raison que dans /planning et GET /:id/presences :
    // le coach pointe le plus souvent depuis son onglet « Présences », qui écrit dans
    // `groupes_presences` SANS renseigner seance_id. `seances_presences` n'est alimentée
    // qu'à une clôture transmettant explicitement `liste_presences`. Sans ce repli, l'écran
    // « Observer un cours » du superviseur affichait « ⚠️ Présences non renseignées » sur des
    // séances pourtant bel et bien pointées - et c'est précisément ce qu'il vient vérifier.
    //
    // Limite assumée, identique aux deux autres : deux séances d'une même classe le même jour
    // partagent le même pointage, faute de seance_id sur ces lignes.
    const sansPresence = (data || []).filter(x => !presCountMap[x.id] && x.groupe_id && x.date_seance);
    if (sansPresence.length) {
      const { data: gp } = await supabase
        .from("groupes_presences")
        .select("groupe_id, date_seance, statut")
        .in("groupe_id", [...new Set(sansPresence.map(x => x.groupe_id))])
        .in("date_seance", [...new Set(sansPresence.map(x => x.date_seance))]);

      const parGroupeDate = {};
      for (const pr of gp || []) {
        const e = (parGroupeDate[`${pr.groupe_id}|${pr.date_seance}`] ??= { presents: 0, total: 0 });
        e.total++;
        if (pr.statut === "present") e.presents++;
      }
      for (const x of sansPresence) {
        const e = parGroupeDate[`${x.groupe_id}|${x.date_seance}`];
        if (e) presCountMap[x.id] = e;
      }
    }

    // Traçabilité de la salle - portée par `sessions_live`, pas par `seances`.
    //
    // C'est cette route que lisent la fiche classe du PA et celle de l'onboarding. Sans ce
    // rapprochement, le temps réellement passé en cours ne leur parvenait tout simplement
    // jamais : ils voyaient une séance « réalisée » sans pouvoir dire si elle avait duré
    // 90 minutes ou 5. Seule la commerciale, qui passe par /planning, en disposait.
    let liveMap = {};
    if (seanceIds.length) {
      const { data: lives } = await supabase
        .from("sessions_live")
        .select("seance_id, plateforme, lien, duree, demarree_at, terminee_at, duree_reelle_s")
        .in("seance_id", seanceIds);
      (lives || []).forEach(l => { if (l.seance_id) liveMap[l.seance_id] = l; });
    }

    // Nom de la classe - le superviseur et le PA affichent des listes de séances de plusieurs
    // classes à la fois ; sans ce nom, chaque écran refaisait sa propre résolution à partir
    // d'une liste de groupes qu'il n'avait pas toujours chargée.
    let groupeNomMap = {};
    const groupeIdsSeances = [...new Set((data || []).map(s => s.groupe_id).filter(Boolean))];
    if (groupeIdsSeances.length) {
      const { data: gs } = await supabase.from("groupes").select("id, nom").in("id", groupeIdsSeances);
      groupeNomMap = Object.fromEntries((gs || []).map(g => [g.id, g.nom]));
    }

    const enriched = (data || []).map(s => {
      const live = liveMap[s.id] || null;
      return {
        ...s,
        groupe_nom: s.groupe_id ? (groupeNomMap[s.groupe_id] || null) : null,
        nb_presents: presCountMap[s.id]?.presents ?? null,
        nb_presences_total: presCountMap[s.id]?.total ?? null,
        plateforme:       live?.plateforme ?? null,
        duree_prevue_min: live?.duree ?? null,
        demarree_at:      live?.demarree_at ?? null,
        terminee_at:      live?.terminee_at ?? null,
        duree_reelle_s:   live?.duree_reelle_s ?? null,
      };
    });

    res.json({ seances: enriched });
  } catch (err) {
    console.error("[seances GET]", err.message);
    res.status(500).json({ error: "Erreur récupération séances" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/seances/honoraires-mois
   Récap mensuel par coach pour le PA
══════════════════════════════════════════════════════════════ */
router.get("/honoraires-mois", authenticateAdmin, requirePermission("honoraires", "read"), async (req, res) => {
  try {
    const { mois, annee, statut } = req.query;
    // Un coach ne peut voir que ses propres honoraires - jamais se substituer à un autre
    // coach via un coach_id passé en query (réservé aux rôles PA/RH/admin).
    const coach_id = req.role === "coach" ? req.profil?.id : req.query.coach_id;
    let q = supabase.from("honoraires_mois").select("*").order("annee", { ascending: false }).order("mois", { ascending: false });
    if (mois)     q = q.eq("mois", mois);
    if (annee)    q = q.eq("annee", annee);
    if (coach_id) q = q.eq("coach_id", coach_id);
    if (statut)   q = q.eq("statut", statut);

    const { data, error } = await q;
    if (error) throw error;

    const coachIds = [...new Set((data || []).map(h => h.coach_id))];
    let coachMap = {};
    if (coachIds.length) {
      const { data: coaches } = await supabase.from("utilisateurs")
        .select("id, prenom, nom, role, avatar_url").in("id", coachIds);
      (coaches || []).forEach(c => { coachMap[c.id] = c; });
    }
    const enriched = (data || []).map(h => ({ ...h, coach: coachMap[h.coach_id] || null }));
    res.json({ honoraires: enriched });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération honoraires mensuels" });
  }
});

// Détail des séances réalisées ayant servi au calcul d'une fiche d'honoraires
router.get("/honoraires-mois/:id/seances", authenticateAdmin, requirePermission("honoraires", "read"), async (req, res) => {
  try {
    const { data: hon, error: errH } = await supabase.from("honoraires_mois")
      .select("coach_id, mois, annee").eq("id", req.params.id).maybeSingle();
    if (errH) throw errH;
    if (!hon) return res.json({ seances: [] });
    if (req.role === "coach" && hon.coach_id !== req.profil?.id) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const debut = `${hon.annee}-${String(hon.mois).padStart(2, "0")}-01`;
    const fin   = new Date(hon.annee, hon.mois, 0).toISOString().slice(0, 10);
    const { data: seances, error: errS } = await supabase.from("seances")
      .select("id, circuit, groupe_id, contrat_prive_id, titre, date_seance, heure_debut, duree_h, lieu, type_cours, niveau, objectif, notes, honoraire_montant, honoraire_statut, honoraire_statut_note, remplacement_id, date_seance_initiale, reprogrammee_le, reprogrammee_motif")
      .eq("coach_id", hon.coach_id).eq("statut", "realisee")
      .gte("date_seance", debut).lte("date_seance", fin)
      .order("date_seance");
    if (errS) throw errS;

    // Enrichir avec le nom de la classe (groupe) quand disponible - évite un aller-retour
    // supplémentaire côté client pour afficher un détail lisible.
    const groupeIds = [...new Set((seances || []).map(s => s.groupe_id).filter(Boolean))];
    let groupeMap = {};
    if (groupeIds.length > 0) {
      const { data: groupes } = await supabase.from("groupes").select("id, nom").in("id", groupeIds);
      groupeMap = Object.fromEntries((groupes || []).map(g => [g.id, g.nom]));
    }

    // Séances honorées suite à un remplacement - `remplacement_id` est posé par
    // reattribuerEtRecalculer() lors de la réattribution comptable au remplaçant (voir
    // remplacements.js) : sert à badger "🔄 Remplacement" ces lignes dans le détail des
    // honoraires, avec le nom du titulaire d'origine pour contexte.
    const remplacementIds = [...new Set((seances || []).map(s => s.remplacement_id).filter(Boolean))];
    let remplacementMap = {};
    if (remplacementIds.length > 0) {
      const { data: remps } = await supabase.from("remplacements").select("id, absent_nom, groupe_nom").in("id", remplacementIds);
      remplacementMap = Object.fromEntries((remps || []).map(r => [r.id, r]));
    }

    // Traçabilité de la salle - portée par `sessions_live`, jamais par `seances`, et
    // rattachée par `sessions_live.seance_id` (la colonne miroir `seances.session_live_id`
    // n'est pas renseignée). Sans ce rapprochement, le détail d'une séance dans les
    // honoraires du PA ne pouvait rien dire du temps réellement passé en cours.
    const seanceIdsHon = (seances || []).map(s => s.id);
    let liveMapHon = {};
    if (seanceIdsHon.length) {
      const { data: lives } = await supabase
        .from("sessions_live")
        .select("seance_id, plateforme, lien, duree, demarree_at, terminee_at, duree_reelle_s")
        .in("seance_id", seanceIdsHon);
      (lives || []).forEach(l => { if (l.seance_id) liveMapHon[l.seance_id] = l; });
    }

    // Comptage des présences, avec le même repli sur `groupes_presences` que les routes
    // voisines : le coach pointe le plus souvent via l'onglet Présences, qui n'écrit pas
    // `seance_id`.
    let presHonMap = {};
    if (seanceIdsHon.length) {
      const { data: presDirectes } = await supabase
        .from("seances_presences").select("seance_id, statut").in("seance_id", seanceIdsHon);
      (presDirectes || []).forEach(p => {
        const e = presHonMap[p.seance_id] || (presHonMap[p.seance_id] = { presents: 0, total: 0 });
        e.total += 1;
        if (p.statut === "present" || p.statut === "retard") e.presents += 1;
      });
      const sansPres = (seances || []).filter(x => !presHonMap[x.id] && x.groupe_id && x.date_seance);
      if (sansPres.length) {
        const { data: presGroupe } = await supabase
          .from("groupes_presences").select("groupe_id, date_seance, statut")
          .in("groupe_id", [...new Set(sansPres.map(x => x.groupe_id))])
          .in("date_seance", [...new Set(sansPres.map(x => x.date_seance))]);
        const parGroupeDate = {};
        (presGroupe || []).forEach(p => {
          const k = `${p.groupe_id}|${p.date_seance}`;
          const e = parGroupeDate[k] || (parGroupeDate[k] = { presents: 0, total: 0 });
          e.total += 1;
          if (p.statut === "present" || p.statut === "retard") e.presents += 1;
        });
        for (const x of sansPres) {
          const e = parGroupeDate[`${x.groupe_id}|${x.date_seance}`];
          if (e) presHonMap[x.id] = e;
        }
      }
    }

    const enrichies = (seances || []).map(s => {
      const live = liveMapHon[s.id] || null;
      return {
        ...s,
        groupe_nom: s.groupe_id ? (groupeMap[s.groupe_id] || null) : null,
        remplacement_absent_nom: s.remplacement_id ? (remplacementMap[s.remplacement_id]?.absent_nom || null) : null,
        nb_presents:        presHonMap[s.id]?.presents ?? null,
        nb_presences_total: presHonMap[s.id]?.total ?? null,
        plateforme:       live?.plateforme ?? null,
        duree_prevue_min: live?.duree ?? null,
        demarree_at:      live?.demarree_at ?? null,
        terminee_at:      live?.terminee_at ?? null,
        duree_reelle_s:   live?.duree_reelle_s ?? null,
      };
    });

    res.json({ seances: enrichies });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération séances" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/seances/:id/presences
══════════════════════════════════════════════════════════════ */
router.get("/:id/presences", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("seances_presences")
      .select("*")
      .eq("seance_id", req.params.id)
      .order("nom_apprenant");
    if (error) throw error;
    if (data?.length) return res.json({ presences: data });

    // Repli sur groupes_presences (groupe_id + date_seance) - le coach prend le plus
    // souvent les présences via l'onglet "Présences" dédié, qui écrit dans
    // groupes_presences SANS jamais renseigner seance_id sur ces lignes, et la clôture
    // (POST /cloturer/:id) ne synchronise seances_presences que si `liste_presences` est
    // explicitement transmis à cet appel précis. Sans ce repli, le modal Honoraires
    // affichait "Aucune présence" pour une séance pourtant bien pointée et visible dans
    // l'onglet Présences du coach.
    const { data: seance } = await supabase
      .from("seances").select("groupe_id, date_seance").eq("id", req.params.id).maybeSingle();
    if (!seance?.groupe_id || !seance?.date_seance) return res.json({ presences: [] });

    const { data: gp, error: gpErr } = await supabase
      .from("groupes_presences")
      .select("nom_apprenant, prenom_apprenant, statut, note")
      .eq("groupe_id", seance.groupe_id)
      .eq("date_seance", seance.date_seance)
      .order("nom_apprenant");
    if (gpErr) throw gpErr;
    res.json({ presences: gp || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération présences" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/seances
   Créer une séance (planifiée par défaut)
══════════════════════════════════════════════════════════════ */
router.post("/", authenticateAdmin, async (req, res) => {
  try {
    const {
      circuit = "groupe",
      coach_id,
      groupe_id, contrat_prive_id, session_live_id, assignation_id,
      titre, date_seance, heure_debut, duree_h = 1.5,
      lieu, type_cours = "presentiel", niveau, grade_coach,
      objectif, notes,
    } = req.body;

    if (!date_seance) return res.status(400).json({ error: "date_seance est requis" });

    if (groupe_id) {
      const msgDelegue = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, groupe_id);
      if (msgDelegue) return res.status(403).json({ error: msgDelegue });
    }

    const effectiveCoachId = coach_id || req.profil.id;

    // Chercher le grade du coach si non fourni
    let gradeEffectif = grade_coach;
    if (!gradeEffectif && effectiveCoachId) {
      const { data: coachData } = await supabase
        .from("utilisateurs")
        .select("coach_info")
        .eq("id", effectiveCoachId)
        .single();
      gradeEffectif = coachData?.coach_info?.type_contrat || "Vacataire";
    }

    const { data, error } = await supabase.from("seances").insert({
      circuit,
      coach_id:         effectiveCoachId,
      pa_id:            req.role === "pedagogical_advisor" ? req.profil.id : null,
      groupe_id:        groupe_id        || null,
      contrat_prive_id: contrat_prive_id || null,
      session_live_id:  session_live_id  || null,
      assignation_id:   assignation_id   || null,
      titre:            titre            || null,
      date_seance,
      heure_debut:      heure_debut      || null,
      duree_h:          parseFloat(duree_h) || 1.5,
      lieu:             lieu             || null,
      type_cours,
      niveau:           niveau           || null,
      grade_coach:      gradeEffectif    || "Vacataire",
      objectif:         objectif         || null,
      notes:            notes            || null,
      statut:           "planifiee",
    }).select().single();

    if (error) throw error;
    res.status(201).json({ seance: data });
  } catch (err) {
    console.error("[seances POST]", err.message);
    res.status(500).json({ error: "Erreur création séance" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/seances/:id/presences
   Enregistrer la feuille de présences d'une séance
   liste = [{ nom_apprenant, prenom_apprenant, apprenant_id, ga_id, statut, motif, note_seance }]
══════════════════════════════════════════════════════════════ */
router.post("/:id/presences", authenticateAdmin, async (req, res) => {
  try {
    const seanceId = req.params.id;
    const { liste } = req.body;
    if (!Array.isArray(liste) || !liste.length)
      return res.status(400).json({ error: "liste[] est requis" });

    // Remplacer toute la feuille (upsert manuel)
    await supabase.from("seances_presences").delete().eq("seance_id", seanceId);

    const rows = liste.map(l => ({
      seance_id:        seanceId,
      apprenant_id:     l.apprenant_id   || null,
      ga_id:            l.ga_id          || null,
      nom_apprenant:    l.nom_apprenant  || "-",
      prenom_apprenant: l.prenom_apprenant || null,
      email_apprenant:  l.email_apprenant  || null,
      statut:           l.statut          || "present",
      motif:            l.motif           || null,
      note_seance:      l.note_seance     || null,
    }));

    const { data, error } = await supabase.from("seances_presences").insert(rows).select();
    if (error) throw error;
    res.status(201).json({ presences: data });
  } catch (err) {
    console.error("[seances presences POST]", err.message);
    res.status(500).json({ error: "Erreur enregistrement présences" });
  }
});

/* ══════════════════════════════════════════════════════════════
   clotureSeance - ═══ POINT CENTRAL DU SYSTÈME ═══
   Le coach clôture une séance → calcul honoraire automatique.
   Extrait en fonction exportée (au lieu de vivre uniquement dans le handler
   POST /cloturer/:id) car `coachs.js` (PATCH /sessions-live/:id) avait besoin
   de déclencher cette même logique lors de la clôture d'une session live -
   il le faisait via un auto-appel HTTP `fetch("http://localhost:...")`, qui
   ne fonctionne JAMAIS en production sur Vercel (déploiement serverless,
   aucun serveur n'écoute réellement sur ce port dans l'exécution de la
   fonction) : l'erreur était avalée silencieusement (`.catch(()=>{})`), donc
   cette clôture - et les notifications apprenant/PA/onboarding qu'elle
   déclenche plus bas - ne s'exécutait tout simplement jamais en prod.
══════════════════════════════════════════════════════════════ */
export async function clotureSeance(seanceId, { statut = "realisee", liste_presences } = {}) {
    // 1. Récupérer la séance
    const { data: seance, error: errSeance } = await supabase
      .from("seances").select("*").eq("id", seanceId).single();
    if (errSeance || !seance) { const e = new Error("Séance introuvable"); e.status = 404; throw e; }
    if (seance.statut === "realisee") { const e = new Error("Séance déjà clôturée"); e.status = 400; throw e; }

    // 2. Lire la grille tarifaire
    const grille = await getGrille();

    // 3. Calculer l'honoraire
    const montant = calcHonoraire(
      grille,
      seance.grade_coach || "Vacataire",
      seance.type_cours  || "presentiel",
      seance.niveau      || "",
      seance.duree_h     || 1.5,
    );

    // 4. Mettre à jour la séance
    const { data: updated, error: errUpdate } = await supabase
      .from("seances")
      .update({
        statut,
        honoraire_montant: montant,
        updated_at: new Date().toISOString(),
      })
      .eq("id", seanceId)
      .select().single();
    if (errUpdate) throw errUpdate;

    // 4bis. Si cette séance était couverte par un remplacement dash en cours,
    // réattribue-la au remplaçant et clôture automatiquement le remplacement dès
    // que toutes ses séances couvertes sont traitées (voir remplacements.js).
    if (seance.groupe_id) {
      traiterClotureSeanceRemplacement(seanceId, seance.groupe_id, "dash").catch(() => {});
    }

    // 5. Enregistrer les présences si fournies
    if (Array.isArray(liste_presences) && liste_presences.length) {
      await supabase.from("seances_presences").delete().eq("seance_id", seanceId);
      const rows = liste_presences.map(l => ({
        seance_id:        seanceId,
        apprenant_id:     l.apprenant_id    || null,
        ga_id:            l.ga_id           || null,
        nom_apprenant:    l.nom_apprenant   || "-",
        prenom_apprenant: l.prenom_apprenant || null,
        email_apprenant:  l.email_apprenant  || null,
        statut:           l.statut           || "present",
        motif:            l.motif            || null,
        note_seance:      l.note_seance      || null,
      }));
      await supabase.from("seances_presences").insert(rows);
    }

    // 6. Incrémenter nb_seances_realisees dans contrats_prives (circuit prive)
    if (seance.circuit === "prive" && seance.contrat_prive_id && statut === "realisee") {
      const { data: contrat } = await supabase
        .from("contrats_prives")
        .select("nb_seances_realisees")
        .eq("id", seance.contrat_prive_id)
        .single();
      if (contrat) {
        await supabase.from("contrats_prives").update({
          nb_seances_realisees: (contrat.nb_seances_realisees || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", seance.contrat_prive_id);
      }
    }

    // 7. Recalculer l'agrégat mensuel des honoraires - tant que la fiche n'a pas
    // encore été transmise/payée (sinon on laisse le PA la remettre en attente
    // explicitement avant de la recalculer, pour ne jamais changer silencieusement
    // un montant déjà transmis à la RH).
    if (statut === "realisee") {
      const d = new Date(seance.date_seance);
      const mois = d.getMonth() + 1, annee = d.getFullYear();
      try {
        await verifierFicheModifiableDash(seance.coach_id, mois, annee);
        await recalculerHonoraireMoisDash(seance.coach_id, mois, annee);
      } catch (e) {
        console.warn(`[seances cloturer] fiche ${mois}/${annee} non recalculée (${e.message})`);
      }
    }

    const resultat = {
      ok: true,
      seance: updated,
      honoraire_calcule: montant,
      message: `Séance clôturée - honoraire calculé : ${montant.toLocaleString("fr-FR")} FCFA`,
    };

    // Notifier apprenants + PA Advisor + onboarding que la séance est terminée - jusqu'ici
    // la clôture ne notifiait strictement personne (seul l'honoraire était calculé).
    // Best-effort, après la réponse : ne doit jamais faire échouer la clôture elle-même.
    if (statut === "realisee") {
      (async () => {
        try {
          const dateLabel = new Date(seance.date_seance).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
          const emailsConcernes = new Set();
          const apprenantUserIds = new Set();

          if (seance.groupe_id) {
            const { data: gas } = await supabase
              .from("groupes_apprenants")
              .select("apprenant_id, email_apprenant")
              .eq("groupe_id", seance.groupe_id)
              .eq("statut", "actif");
            for (const ga of gas || []) {
              if (ga.apprenant_id) apprenantUserIds.add(ga.apprenant_id);
              if (ga.email_apprenant) emailsConcernes.add(ga.email_apprenant.toLowerCase());
            }
          } else if (seance.assignation_id) {
            const { data: asgDirect } = await supabase
              .from("assignations_parcours").select("prospect_email").eq("id", seance.assignation_id).maybeSingle();
            if (asgDirect?.prospect_email) emailsConcernes.add(asgDirect.prospect_email.toLowerCase());
          }

          // Apprenants sans apprenant_id direct (ex. circuit privé) : résoudre via email
          for (const email of emailsConcernes) {
            const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", email).maybeSingle();
            if (u?.id) apprenantUserIds.add(u.id);
          }

          if (apprenantUserIds.size) {
            const notifsAppr = [...apprenantUserIds].map(uid => ({
              user_id: uid, type: "cours", lu: false,
              titre: `✅ Séance terminée - ${seance.titre || "cours"}`,
              message: `Votre séance du ${dateLabel} a été clôturée par le coach.`,
              meta: { seance_id: seance.id, groupe_id: seance.groupe_id || null },
            }));
            await supabase.from("notifications").insert(notifsAppr);
          }

          // Tous les PA Advisors actifs (pa_advisor_id par dossier reste null pour la
          // quasi-totalité des dossiers "groupe" - voir même remarque dans sessions-live) +
          // l'onboarding responsable si connu via l'assignation.
          const onboardingIds = new Set();
          for (const email of emailsConcernes) {
            const { data: asg } = await supabase
              .from("assignations_parcours").select("onboarding_id")
              .ilike("prospect_email", email).maybeSingle();
            if (asg?.onboarding_id) onboardingIds.add(asg.onboarding_id);
          }
          const payloadSuivi = {
            type: "cours",
            titre: `✅ Séance clôturée - ${seance.titre || "cours"}`,
            message: `La séance du ${dateLabel} (${seance.groupe_id ? "groupe" : "coaching privé"}) a été clôturée par le coach. Honoraire calculé : ${montant.toLocaleString("fr-FR")} FCFA.`,
            meta: { seance_id: seance.id, groupe_id: seance.groupe_id || null },
          };
          await notifyRole(["pedagogical_advisor", "admin_pa_advisor"], payloadSuivi);
          if (onboardingIds.size) {
            const notifsOb = [...onboardingIds].map(uid => ({ ...payloadSuivi, user_id: uid, lu: false, source: "dash" }));
            await supabase.from("notifications").insert(notifsOb);
          }
        } catch (e) {
          console.warn("[seances cloturer] notifications échouées:", e.message);
        }
      })();
    }

    return resultat;
}

router.post("/cloturer/:id", authenticateAdmin, async (req, res) => {
  try {
    const resultat = await clotureSeance(req.params.id, req.body || {});
    res.json(resultat);
  } catch (err) {
    console.error("[seances cloturer]", err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : "Erreur clôture séance" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/seances/:id
   Modifier une séance (planifiée uniquement, sauf PA/admin)
══════════════════════════════════════════════════════════════ */
router.patch("/:id", authenticateAdmin, async (req, res) => {
  try {
    const allowed = [
      "titre","date_seance","heure_debut","duree_h","lieu",
      "type_cours","niveau","grade_coach","objectif","notes","statut",
    ];
    // honoraire_montant / honoraire_statut passent exclusivement par
    // PATCH /:id/honoraire-statut (garde-fous + recalcul de la fiche mensuelle) -
    // jamais par cette route générique, pour ne pas contourner les vérifications.

    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const { data: seanceAvant } = await supabase.from("seances").select("groupe_id").eq("id", req.params.id).maybeSingle();
    if (seanceAvant?.groupe_id) {
      const msgDelegue = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, seanceAvant.groupe_id);
      if (msgDelegue) return res.status(403).json({ error: msgDelegue });
    }

    const { data, error } = await supabase
      .from("seances").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ seance: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur mise à jour séance" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/seances/honoraires-mois/calculer
   Calcule/recalcule la fiche mensuelle d'un coach (action PA)
══════════════════════════════════════════════════════════════ */
router.post("/honoraires-mois/calculer", authenticateAdmin, requirePermission("honoraires", "manage"), async (req, res) => {
  try {
    const { coach_id, mois, annee } = req.body;
    if (!coach_id || !mois || !annee) return res.status(400).json({ error: "coach_id, mois, annee requis" });
    await verifierFicheModifiableDash(coach_id, Number(mois), Number(annee));
    const data = await recalculerHonoraireMoisDash(coach_id, Number(mois), Number(annee));
    res.json({ honoraire: data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/seances/historique-contrat
   Les cours dispensés, regroupés par mois, pour UN contrat.

   L'onglet « Mes Contrats » du coach n'affichait qu'une estimation
   théorique - heures/semaine × 4 - tirée de l'emploi du temps. Le coach
   voyait donc ce qu'il DEVRAIT faire, jamais ce qu'il a fait.

   `seances` est une table unifiée : une séance porte `groupe_id` OU
   `contrat_prive_id` selon son circuit, mais les honoraires se calculent
   de la même façon dans les deux cas. Une seule route sert donc les deux,
   en choisissant la colonne selon le paramètre reçu.

   On ne recalcule rien : `honoraire_montant` est déjà posé sur chaque
   séance par le circuit de validation. On regroupe.
══════════════════════════════════════════════════════════════ */
router.get("/historique-contrat", authenticateAdmin, async (req, res) => {
  try {
    const { groupe_id, contrat_prive_id } = req.query;
    if (!groupe_id && !contrat_prive_id) {
      return res.status(400).json({ error: "groupe_id ou contrat_prive_id requis" });
    }

    let q = supabase
      .from("seances")
      .select("id, titre, date_seance, heure_debut, duree_h, statut, circuit, honoraire_montant, honoraire_statut, coach_id")
      .order("date_seance", { ascending: false });

    q = groupe_id ? q.eq("groupe_id", groupe_id) : q.eq("contrat_prive_id", contrat_prive_id);

    // Un coach ne consulte que ses propres séances ; les rôles de suivi voient tout.
    if (req.role === "coach") q = q.eq("coach_id", req.profil.id);

    const { data, error } = await q;
    if (error) throw error;

    const parMois = {};
    for (const s of data || []) {
      const periode = String(s.date_seance || "").slice(0, 7);   // AAAA-MM
      if (!periode) continue;
      const m = (parMois[periode] ??= {
        periode,
        nb_seances: 0, nb_realisees: 0, nb_annulees: 0,
        total_heures: 0, montant_total: 0, montant_valide: 0,
        seances: [],
      });
      m.nb_seances++;
      if (s.statut === "realisee" || s.statut === "terminee") m.nb_realisees++;
      if (s.statut === "annulee") m.nb_annulees++;
      m.total_heures  += parseFloat(s.duree_h) || 0;
      m.montant_total += parseFloat(s.honoraire_montant) || 0;
      // Le montant validé est celui sur lequel le coach sera réellement payé : le
      // distinguer du total évite de lui faire attendre une somme encore en litige.
      if (s.honoraire_statut === "valide") m.montant_valide += parseFloat(s.honoraire_montant) || 0;
      m.seances.push(s);
    }

    const mois = Object.values(parMois)
      .map((m) => ({
        ...m,
        total_heures:   parseFloat(m.total_heures.toFixed(2)),
        montant_total:  Math.round(m.montant_total),
        montant_valide: Math.round(m.montant_valide),
      }))
      .sort((a, b) => b.periode.localeCompare(a.periode));

    res.json({
      mois,
      totaux: {
        nb_seances:     mois.reduce((s, m) => s + m.nb_seances, 0),
        total_heures:   parseFloat(mois.reduce((s, m) => s + m.total_heures, 0).toFixed(2)),
        montant_total:  mois.reduce((s, m) => s + m.montant_total, 0),
        montant_valide: mois.reduce((s, m) => s + m.montant_valide, 0),
      },
    });
  } catch (e) {
    console.error("[historique-contrat]", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/seances/planning
   Toutes les séances programmées - présentiel ET en ligne - avec le
   lien de visioconférence quand il existe.

   Les séances vivent dans deux tables : `seances` les porte toutes
   (présences, honoraires), `sessions_live` ne porte que celles en
   ligne, mais c'est elle qui détient `plateforme` et `lien`. Le
   planning des superviseurs n'interroge que la seconde et ne voit donc
   jamais le présentiel. Cette route fusionne les deux, pour que la
   commerciale suive un coach quel que soit le mode de cours et puisse
   vérifier, lien à l'appui, qu'un cours en ligne a bien eu lieu.

   L'accès est donné par liste de rôles explicite, et non par le module
   `classes` : la commerciale n'en a pas la lecture, et la lui accorder
   lui ouvrirait tous les écrans de classes alors qu'on ne veut ouvrir
   que ce planning.
══════════════════════════════════════════════════════════════ */
const ROLES_PLANNING_ELARGI = [
  "commercial", "admin_commercial",
  "superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur",
  "pedagogical_advisor", "admin_pa_advisor",
  "onboarding", "admin_onboarding",
  "manager", "admin_manager", "admin", "super_admin",
];

router.get("/planning", authenticateAdmin, async (req, res) => {
  try {
    if (!ROLES_PLANNING_ELARGI.includes(req.role)) {
      return res.status(403).json({ error: "Accès au planning non autorisé pour ce rôle" });
    }

    const { date_debut, date_fin, coach_id, groupe_id, statut, type_cours } = req.query;

    /* ── PÉRIMÈTRE DE LA COMMERCIALE ────────────────────────────────────────────
       Cette route rendait TOUTES les séances à tous les rôles autorisés. Pour un
       superviseur ou un manager c'est le métier ; pour une assistante, cela revenait à
       lui ouvrir les cours des classes d'autres assistantes et d'autres centres.

       Son périmètre réunit DEUX ensembles, et il faut les deux :
         · les classes où se trouve au moins un de ses apprenants - car en ligne, les
           classes sont créées par l'Onboarding, jamais par elle ;
         · les classes qu'elle a créées - car une classe présentiel qu'elle vient
           d'ouvrir n'a pas encore d'apprenant.
       S'en tenir à l'un des deux viderait le planning d'un des deux canaux.

       Le filtre est POSÉ ICI, pas à l'écran : masquer des lignes déjà envoyées au
       navigateur ne protège rien. */
    let groupesAutorises = null;
    if (req.role === "commercial") {
      const monId = req.profil?.id || req.user?.id || null;
      const { data: ass } = await supabase
        .from("assistantes").select("id").eq("email", req.profil?.email || "").maybeSingle();

      const ids = new Set();
      if (ass?.id) {
        const { data: dossiers } = await supabase
          .from("assignations_parcours").select("prospect_email").eq("assistante_id", ass.id);
        const emails = [...new Set((dossiers || [])
          .map(d => (d.prospect_email || "").toLowerCase()).filter(Boolean))];
        // Par tranches : une liste d'emails trop longue ferait dépasser la taille d'URL
        // acceptée par PostgREST, et la requête échouerait d'un coup - donc sans planning.
        for (let i = 0; i < emails.length; i += 100) {
          const { data: ga } = await supabase
            .from("groupes_apprenants").select("groupe_id").in("email_apprenant", emails.slice(i, i + 100));
          (ga || []).forEach(g => g.groupe_id && ids.add(g.groupe_id));
        }
      }
      if (monId) {
        const { data: crees } = await supabase.from("groupes").select("id").eq("created_by", monId);
        (crees || []).forEach(g => ids.add(g.id));
      }
      groupesAutorises = [...ids];
      // Aucune classe dans son périmètre : un planning vide, jamais le planning de tous.
      if (groupesAutorises.length === 0) return res.json({ seances: [] });
    }

    let q = supabase
      .from("seances")
      .select("*")
      .order("date_seance", { ascending: false });

    if (groupesAutorises) q = q.in("groupe_id", groupesAutorises);

    if (coach_id)   q = q.eq("coach_id", coach_id);
    if (groupe_id)  q = q.eq("groupe_id", groupe_id);
    if (statut)     q = q.eq("statut", statut);
    if (date_debut) q = q.gte("date_seance", date_debut);
    if (date_fin)   q = q.lte("date_seance", date_fin);

    const { data: seances, error } = await q;
    if (error) throw error;
    if (!seances?.length) return res.json({ seances: [] });

    const ids       = seances.map((s) => s.id);
    const coachIds  = [...new Set(seances.map((s) => s.coach_id).filter(Boolean))];
    const groupeIds = [...new Set(seances.map((s) => s.groupe_id).filter(Boolean))];

    // Les trois enrichissements sont indépendants : les lancer ensemble évite trois
    // allers-retours en série sur un planning qui peut compter plusieurs centaines de lignes.
    const [{ data: lives }, { data: coachs }, { data: groupes }, { data: presences }] = await Promise.all([
      supabase.from("sessions_live")
        .select("seance_id, plateforme, lien, heure, heure_fin, statut, duree, demarree_at, terminee_at, duree_reelle_s")
        .in("seance_id", ids).neq("is_corbeille", true),
      coachIds.length
        ? supabase.from("utilisateurs").select("id, nom, prenom, email").in("id", coachIds)
        : Promise.resolve({ data: [] }),
      groupeIds.length
        ? supabase.from("groupes").select("id, nom, niveau, type_cours").in("id", groupeIds)
        : Promise.resolve({ data: [] }),
      supabase.from("seances_presences").select("seance_id, statut").in("seance_id", ids),
    ]);

    const liveParSeance = {};
    for (const l of lives || []) if (l.seance_id) liveParSeance[l.seance_id] = l;

    const coachParId = {};
    for (const c of coachs || []) coachParId[c.id] = `${c.prenom || ""} ${c.nom || ""}`.trim();

    const groupeParId = {};
    for (const g of groupes || []) groupeParId[g.id] = g;

    const presParSeance = {};
    for (const p of presences || []) {
      const e = (presParSeance[p.seance_id] ??= { presents: 0, total: 0 });
      e.total++;
      if (p.statut === "present") e.presents++;
    }

    // Repli sur groupes_presences - même raison que dans GET /:id/presences : le coach pointe
    // le plus souvent depuis son onglet « Présences », qui écrit dans groupes_presences sans
    // renseigner seance_id. `seances_presences` n'est alimentée qu'à une clôture transmettant
    // explicitement `liste_presences`. Sans ce repli, le planning affichait « aucune présence »
    // sur des séances pourtant bel et bien pointées, y compris clôturées.
    const sansPresence = seances.filter((s) => !presParSeance[s.id] && s.groupe_id && s.date_seance);
    if (sansPresence.length) {
      const { data: gp } = await supabase
        .from("groupes_presences")
        .select("groupe_id, date_seance, statut")
        .in("groupe_id", [...new Set(sansPresence.map((s) => s.groupe_id))])
        .in("date_seance", [...new Set(sansPresence.map((s) => s.date_seance))]);

      const parGroupeDate = {};
      for (const p of gp || []) {
        const e = (parGroupeDate[`${p.groupe_id}|${p.date_seance}`] ??= { presents: 0, total: 0 });
        e.total++;
        if (p.statut === "present") e.presents++;
      }
      // Limite assumée, identique à celle de GET /:id/presences : deux séances d'une même
      // classe le même jour partagent le même pointage, faute de seance_id sur ces lignes.
      for (const s of sansPresence) {
        const e = parGroupeDate[`${s.groupe_id}|${s.date_seance}`];
        if (e) presParSeance[s.id] = e;
      }
    }

    const enrichies = seances.map((s) => {
      const live   = liveParSeance[s.id] || null;
      const groupe = groupeParId[s.groupe_id] || null;
      // Le type de cours vient du groupe ; à défaut, la présence d'un lien de visio
      // suffit à classer la séance comme « en ligne » (cas des coachings privés, qui
      // n'ont pas toujours de groupe rattaché).
      const typeCours = groupe?.type_cours || (live?.lien ? "en_ligne" : null);
      return {
        id: s.id,
        titre: s.titre,
        date_seance: s.date_seance,
        heure_debut: s.heure_debut || live?.heure || null,
        heure_fin: s.heure_fin || live?.heure_fin || null,
        duree_h: s.duree_h,
        // Le statut de la SALLE prime tant qu'elle est ouverte : `sessions_live.statut`
        // bascule en « en_cours » au démarrage, alors que `seances.statut` reste
        // « planifiee » jusqu'à la clôture. Renvoyer ce dernier rendait le direct invisible.
        statut: live?.statut === "en_cours" ? "en_cours" : s.statut,
        statut_seance: s.statut,
        statut_live: live?.statut || null,
        circuit: s.circuit,
        coach_id: s.coach_id,
        coach_nom: coachParId[s.coach_id] || "-",
        groupe_id: s.groupe_id,
        groupe_nom: groupe?.nom || "-",
        groupe_niveau: groupe?.niveau || null,
        type_cours: typeCours,
        plateforme: live?.plateforme || null,
        lien: live?.lien || null,
        // Traçabilité de la séance en direct - c'est ce que le PA, la commerciale,
        // l'onboarding et le superviseur n'avaient aucun moyen de connaître une fois
        // la fenêtre du coach refermée.
        duree_prevue_min: live?.duree ?? null,
        duree_reelle_s:   live?.duree_reelle_s ?? null,
        demarree_at:      live?.demarree_at ?? null,
        terminee_at:      live?.terminee_at ?? null,
        nb_presents: presParSeance[s.id]?.presents ?? null,
        nb_presences_total: presParSeance[s.id]?.total ?? null,
        // Report : sans la date d'origine, une séance déplacée redevient une séance
        // ordinaire à sa nouvelle date, et le fait qu'un cours n'ait pas eu lieu au
        // moment prévu disparaît du suivi.
        date_seance_initiale: s.date_seance_initiale ?? null,
        reprogrammee_le:      s.reprogrammee_le ?? null,
        reprogrammee_motif:   s.reprogrammee_motif ?? null,
      };
    });

    const filtrees = type_cours
      ? enrichies.filter((s) => s.type_cours === type_cours)
      : enrichies;

    res.json({ seances: filtrees });
  } catch (err) {
    console.error("[seances/planning]", err.message);
    res.status(500).json({ error: "Erreur récupération du planning" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/seances/a-facturer?mois=&annee=
   Nombre de séances facturables par coach sur le mois.

   L'écran du PA listait les coachs sans fiche sans jamais dire s'ils
   avaient quoi que ce soit à facturer : il invitait donc à créer des
   fiches vides à 0 FCFA, indistinguables des vraies. Ce décompte permet
   de griser ceux qui n'ont aucune séance, et de ne proposer le calcul
   qu'à ceux qui en ont.
══════════════════════════════════════════════════════════════ */
router.get("/a-facturer", authenticateAdmin, async (req, res) => {
  try {
    const mois  = Number(req.query.mois);
    const annee = Number(req.query.annee);
    if (!mois || !annee) return res.status(400).json({ error: "mois et annee requis" });

    const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
    const fin   = new Date(annee, mois, 0).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("seances")
      .select("coach_id, honoraire_statut")
      .gte("date_seance", debut)
      .lte("date_seance", fin);
    if (error) throw error;

    const parCoach = {};
    for (const s of data || []) {
      if (!s.coach_id) continue;
      const e = (parCoach[s.coach_id] ??= { total: 0, rejetees: 0 });
      e.total++;
      if (s.honoraire_statut === "rejete") e.rejetees++;
    }

    res.json({ mois, annee, total_seances: (data || []).length, par_coach: parCoach });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/seances/honoraires-mois/calculer-lot
   Calcule les fiches de plusieurs coachs en une seule requête.

   L'écran du PA affichait un bouton par coach sans fiche - 186 un mois
   donné. Tout calculer voulait dire 186 requêtes, plus autant de
   rechargements de la liste. Le lot fait le tour côté serveur et ne
   répond qu'une fois.

   Un coach en échec n'interrompt pas les autres : sa fiche peut être
   verrouillée (déjà transmise à la RH) alors que les suivantes sont
   parfaitement calculables. Les échecs sont donc collectés et rendus,
   pas levés.
══════════════════════════════════════════════════════════════ */
router.post("/honoraires-mois/calculer-lot", authenticateAdmin, requirePermission("honoraires", "manage"), async (req, res) => {
  try {
    const { coach_ids, mois, annee } = req.body;
    if (!Array.isArray(coach_ids) || !coach_ids.length) return res.status(400).json({ error: "coach_ids requis" });
    if (!mois || !annee) return res.status(400).json({ error: "mois et annee requis" });
    if (coach_ids.length > 500) return res.status(400).json({ error: "500 coachs maximum par lot" });

    const m = Number(mois), a = Number(annee);
    const calcules = [];
    const echecs = [];

    for (const coachId of coach_ids) {
      try {
        await verifierFicheModifiableDash(coachId, m, a);
        const fiche = await recalculerHonoraireMoisDash(coachId, m, a);
        calcules.push({ coach_id: coachId, nb_seances: fiche?.nb_seances ?? 0, montant_total: fiche?.montant_total ?? 0 });
      } catch (e) {
        echecs.push({ coach_id: coachId, erreur: e.message });
      }
    }

    res.json({ calcules: calcules.length, echecs, detail: calcules });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/seances/:id/honoraire-statut
   Le PA valide/rejette/remet en attente UNE séance individuelle -
   recalcule aussitôt la fiche mensuelle du coach concerné.
══════════════════════════════════════════════════════════════ */
router.patch("/:id/honoraire-statut", authenticateAdmin, requirePermission("honoraires", "manage"), async (req, res) => {
  try {
    const { statut, note } = req.body;
    const allowed = ["en_attente", "valide", "rejete"];
    if (!allowed.includes(statut)) return res.status(400).json({ error: "statut invalide" });

    const { data: seanceAvant } = await supabase.from("seances").select("coach_id, date_seance").eq("id", req.params.id).maybeSingle();
    if (seanceAvant) {
      const dAvant = new Date(seanceAvant.date_seance);
      await verifierFicheModifiableDash(seanceAvant.coach_id, dAvant.getMonth() + 1, dAvant.getFullYear());
    }

    const { data: seance, error: errSeance } = await supabase.from("seances")
      .update({
        honoraire_statut: statut,
        honoraire_statut_note: note || null,
        honoraire_valide_par: req.profil?.id || null,
        honoraire_valide_at: new Date().toISOString(),
      })
      .eq("id", req.params.id).select("id, coach_id, date_seance").single();
    if (errSeance) throw errSeance;

    const d = new Date(seance.date_seance);
    const honoraire = await recalculerHonoraireMoisDash(seance.coach_id, d.getMonth() + 1, d.getFullYear());

    if (statut === "rejete") {
      await notifyUser(seance.coach_id, {
        type: "paiement",
        titre: "🚫 Séance rejetée de vos honoraires",
        message: `Une séance du ${d.toLocaleDateString("fr-FR")} a été rejetée par le PA${note ? ` : ${note}` : "."}`,
        meta: { seance_id: seance.id, honoraire_id: honoraire.id },
        source: "dash",
      }).catch(() => {});
    } else if (statut === "valide") {
      await notifyUser(seance.coach_id, {
        type: "paiement",
        titre: "✅ Séance validée",
        message: `Votre séance du ${d.toLocaleDateString("fr-FR")} a été validée par le PA pour vos honoraires.`,
        meta: { seance_id: seance.id, honoraire_id: honoraire.id },
        source: "dash",
      }).catch(() => {});
    } else if (statut === "en_attente") {
      await notifyUser(seance.coach_id, {
        type: "paiement",
        titre: "⏳ Séance remise en attente",
        message: `Votre séance du ${d.toLocaleDateString("fr-FR")}, déjà traitée, a été remise en attente par le PA${note ? ` : ${note}` : "."}`,
        meta: { seance_id: seance.id, honoraire_id: honoraire.id },
        source: "dash",
      }).catch(() => {});
    }

    res.json({ seance, honoraire });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/seances/honoraires-mois/:id/statut
   Cycle de vie complet de la fiche : en_attente → valide → transmis
   → paye, ou litige à tout moment. Étapes séparées et volontaires
   (le coach peut contester entre validation et transmission).
══════════════════════════════════════════════════════════════ */
router.patch("/honoraires-mois/:id/statut", authenticateAdmin, requirePermission("honoraires", "manage"), async (req, res) => {
  try {
    const { statut, mode_paiement, reference_paiement, retenues, note_pa } = req.body;
    const allowed = ["valide", "transmis", "paye", "en_attente", "litige"];
    if (!allowed.includes(statut)) return res.status(400).json({ error: "statut invalide" });

    // Avant transmission : aucune séance du mois ne doit rester "en_attente".
    if (statut === "transmis") {
      const { data: hon } = await supabase.from("honoraires_mois")
        .select("coach_id, mois, annee").eq("id", req.params.id).maybeSingle();
      if (!hon) return res.status(404).json({ error: "Fiche introuvable" });
      const debut = `${hon.annee}-${String(hon.mois).padStart(2, "0")}-01`;
      const fin   = new Date(hon.annee, hon.mois, 0).toISOString().slice(0, 10);
      const { count: nbEnAttente } = await supabase.from("seances")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", hon.coach_id).eq("statut", "realisee")
        .eq("honoraire_statut", "en_attente")
        .gte("date_seance", debut).lte("date_seance", fin);
      if (nbEnAttente > 0) {
        return res.status(400).json({
          error: `Impossible de transmettre : ${nbEnAttente} séance${nbEnAttente > 1 ? "s" : ""} encore en attente de validation. Validez ou rejetez-les toutes d'abord.`,
        });
      }
    }

    const payload = { statut, updated_at: new Date().toISOString() };
    if (note_pa)          payload.note_pa = note_pa;
    if (retenues != null) payload.retenues = retenues;
    if (statut === "valide")   { payload.valide_par = req.profil?.id; payload.valide_at = new Date().toISOString(); }
    if (statut === "transmis") { payload.transmis_par = req.profil?.id; payload.transmis_at = new Date().toISOString(); }
    if (statut === "paye") {
      payload.paye_at = new Date().toISOString();
      if (mode_paiement)      payload.mode_paiement = mode_paiement;
      if (reference_paiement) payload.reference_paiement = reference_paiement;
    } else {
      payload.paye_at = null;
      payload.mode_paiement = null;
      payload.reference_paiement = null;
    }

    if (retenues != null) {
      const { data: h } = await supabase.from("honoraires_mois").select("montant_total").eq("id", req.params.id).single();
      if (h) payload.montant_net = Math.max(0, (h.montant_total || 0) - retenues);
    }

    const { data, error } = await supabase.from("honoraires_mois")
      .update(payload).eq("id", req.params.id).select().single();
    if (error) throw error;

    const periode = `${MOIS_LABELS[data.mois]} ${data.annee}`;
    const montantFmt = `${Math.round(data.montant_net ?? data.montant_total).toLocaleString("fr-FR")} FCFA`;

    if (statut === "transmis") {
      const { data: coach } = await supabase.from("utilisateurs").select("prenom, nom").eq("id", data.coach_id).maybeSingle();
      const nomCoach = coach ? `${coach.prenom || ""} ${coach.nom || ""}`.trim() : "un coach";
      await notifyRole(["rh"], {
        type: "paiement",
        titre: "💰 Honoraires transmis pour paiement",
        message: `${nomCoach} - ${periode} - ${montantFmt} net à verser.`,
        meta: { honoraire_id: data.id, coach_id: data.coach_id, mois: data.mois, annee: data.annee },
        source: "dash",
      }).catch(() => {});
    }

    // La RH ferme la boucle : le PA qui avait transmis la fiche sait que le paiement est fait.
    if (statut === "paye" && data.transmis_par) {
      const { data: coach } = await supabase.from("utilisateurs").select("prenom, nom").eq("id", data.coach_id).maybeSingle();
      const nomCoach = coach ? `${coach.prenom || ""} ${coach.nom || ""}`.trim() : "un coach";
      await notifyUser(data.transmis_par, {
        type: "paiement",
        titre: "💵 Paiement confirmé par la RH",
        message: `${nomCoach} - ${periode} - ${montantFmt} versés par la RH.`,
        meta: { honoraire_id: data.id, coach_id: data.coach_id, mois: data.mois, annee: data.annee },
        source: "dash",
      }).catch(() => {});
    }

    const NOTIF_COACH = {
      valide:   { titre: "✅ Vos honoraires ont été validés", message: `Votre fiche ${periode} (${montantFmt}) a été validée par le PA et sera bientôt transmise à la RH. Vous pouvez encore signaler un désaccord avant la transmission.` },
      transmis: { titre: "📤 Vos honoraires ont été transmis à la RH", message: `Votre fiche ${periode} (${montantFmt}) a été transmise à la RH/Paie pour paiement.` },
      litige:   { titre: "🚫 Votre fiche d'honoraires a été refusée", message: `Votre fiche ${periode} a été mise en litige par le PA${note_pa ? ` : ${note_pa}` : "."}` },
      paye:     { titre: "💵 Vous avez été payé", message: `Le paiement de votre fiche ${periode} (${montantFmt}) a été enregistré par la RH.` },
    };
    if (NOTIF_COACH[statut]) {
      await notifyUser(data.coach_id, { type: "paiement", ...NOTIF_COACH[statut], meta: { honoraire_id: data.id, mois: data.mois, annee: data.annee }, source: "dash" }).catch(() => {});
    }

    res.json({ honoraire: data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════════
   DELETE /api/seances/:id
══════════════════════════════════════════════════════════════ */
router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data: seanceAvant } = await supabase.from("seances").select("groupe_id").eq("id", req.params.id).maybeSingle();
    if (seanceAvant?.groupe_id) {
      const msgDelegue = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, seanceAvant.groupe_id);
      if (msgDelegue) return res.status(403).json({ error: msgDelegue });
    }
    await supabase.from("seances").delete().eq("id", req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur suppression séance" });
  }
});

export default router;
