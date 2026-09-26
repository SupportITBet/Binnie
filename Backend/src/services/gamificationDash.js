import supabase from "../config/supabase.js";
import { notifyUser } from "./notifyRole.js";

// ══════════════════════════════════════════════════════════════
// Moteur de gamification dash - copie indépendante de services/gamification.js
// (bet-elearning), même principe (points_transactions_dash = seule vérité,
// utilisateurs.points_gamif_dash dénormalisé) mais AUCUNE table bet-elearning
// n'est jamais lue ni écrite ici - dash et bet-elearning restent deux systèmes
// de gamification entièrement séparés, comme le reste de la plateforme.
// ══════════════════════════════════════════════════════════════

const PLAFONDS_JOURNALIERS = {
  mini_jeu: 40,
  chat_message: 5, // évite qu'un apprenant ne farme des points en spammant le chat de groupe
};

const ORDRE_CECR = ["A1", "A2", "B1", "B2", "C1", "C2"];
function rangCECR(niveau) {
  const i = ORDRE_CECR.indexOf((niveau || "").toUpperCase());
  return i === -1 ? null : i;
}

function debutJourISO() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function pointsDejaGagnesAujourdhui(apprenantId, sourceType) {
  const { data } = await supabase
    .from("points_transactions_dash")
    .select("points")
    .eq("apprenant_id", apprenantId)
    .eq("source_type", sourceType)
    .gte("created_at", debutJourISO());
  return (data || []).reduce((s, t) => s + t.points, 0);
}

export async function assurerActiviteDuJour(apprenantId) {
  const { data: dejaAujourdhui } = await supabase
    .from("points_transactions_dash")
    .select("id")
    .eq("apprenant_id", apprenantId)
    .eq("source_type", "streak")
    .gte("created_at", debutJourISO())
    .limit(1)
    .maybeSingle();
  if (dejaAujourdhui) return;

  await inserer(apprenantId, "streak", null, 2, "Connexion quotidienne");

  const { data: toutesStreaks } = await supabase
    .from("points_transactions_dash")
    .select("created_at")
    .eq("apprenant_id", apprenantId)
    .eq("source_type", "streak")
    .order("created_at", { ascending: false });
  const joursDistincts = [...new Set((toutesStreaks || []).map(t => t.created_at.slice(0, 10)))].sort().reverse();
  let serie = 0;
  let curseur = new Date();
  for (const jour of joursDistincts) {
    const attendu = curseur.toISOString().slice(0, 10);
    if (jour === attendu) { serie++; curseur.setUTCDate(curseur.getUTCDate() - 1); }
    else break;
  }
  if (serie === 7) await inserer(apprenantId, "streak", "bonus_7", 25, "Série de 7 jours consécutifs");

  let retourApresPause = false;
  if (joursDistincts.length >= 2) {
    const gapJours = Math.round((new Date(joursDistincts[0]) - new Date(joursDistincts[1])) / 86400000);
    retourApresPause = gapJours >= 14;
  }

  const nbConnexionsMatinales = (toutesStreaks || []).filter(t => new Date(t.created_at).getUTCHours() < 8).length;

  await verifierBadges(apprenantId, "streak", { serie, retourApresPause, nbConnexionsMatinales });
}

async function inserer(apprenantId, sourceType, sourceId, points, description) {
  const { error } = await supabase.from("points_transactions_dash").insert({
    apprenant_id: apprenantId, source_type: sourceType, source_id: sourceId ? String(sourceId) : null,
    points, description,
  });
  if (error) throw error;

  const { data: total } = await supabase
    .from("points_transactions_dash")
    .select("points")
    .eq("apprenant_id", apprenantId);
  const solde = (total || []).reduce((s, t) => s + t.points, 0);
  await supabase.from("utilisateurs").update({ points_gamif_dash: solde }).eq("id", apprenantId);
  return solde;
}

export async function attribuerPoints(apprenantId, sourceType, sourceId, points, description, contexte = {}) {
  if (!apprenantId || !points) return;
  try {
    await assurerActiviteDuJour(apprenantId);

    const plafond = PLAFONDS_JOURNALIERS[sourceType];
    if (plafond) {
      const dejaGagnes = await pointsDejaGagnesAujourdhui(apprenantId, sourceType);
      if (dejaGagnes >= plafond) return;
      points = Math.min(points, plafond - dejaGagnes);
      if (points <= 0) return;
    }

    await inserer(apprenantId, sourceType, sourceId, points, description);
    await verifierBadges(apprenantId, sourceType, contexte);
  } catch (err) {
    console.error(`[gamification-dash] attribuerPoints(${sourceType})`, err.message);
  }
}

export async function attribuerBonusProgression(apprenantId, jeuId) {
  try {
    const { data: dejaDonne } = await supabase
      .from("points_transactions_dash")
      .select("id")
      .eq("apprenant_id", apprenantId)
      .eq("source_type", "mini_jeu_progression")
      .eq("source_id", String(jeuId))
      .maybeSingle();
    if (dejaDonne) return;
    await inserer(apprenantId, "mini_jeu_progression", jeuId, 5, "Progression au réessai");
  } catch (err) {
    console.error("[gamification-dash] attribuerBonusProgression", err.message);
  }
}

async function debloquer(apprenantId, code) {
  const { data: badge } = await supabase.from("badges_dash").select("id, nom, icone, description").eq("code", code).maybeSingle();
  if (!badge) return;
  const { data: deja } = await supabase.from("badges_obtenus_dash").select("id").eq("apprenant_id", apprenantId).eq("badge_id", badge.id).maybeSingle();
  if (deja) return;
  await supabase.from("badges_obtenus_dash").insert({ apprenant_id: apprenantId, badge_id: badge.id });
  await notifyUser(apprenantId, {
    type: "badge_obtenu",
    titre: `${badge.icone} Nouveau badge : ${badge.nom}`,
    message: badge.description,
    source: "dash",
  });
}

export async function verifierBadges(apprenantId, sourceType, contexte = {}) {
  try {
    if (sourceType === "streak" || sourceType === "mini_jeu" || sourceType === "devoir" || sourceType === "session" || sourceType === "onboarding") {
      await debloquer(apprenantId, "bienvenue");
    }

    if (sourceType === "onboarding") {
      await debloquer(apprenantId, "pret_a_apprendre");
    }

    if (sourceType === "streak") {
      if (contexte.serie >= 7)  await debloquer(apprenantId, "serie_7");
      if (contexte.serie >= 14) await debloquer(apprenantId, "serie_14");
      if (contexte.serie >= 30) await debloquer(apprenantId, "serie_30");
      if (contexte.retourApresPause) await debloquer(apprenantId, "le_retour");
      if (contexte.nbConnexionsMatinales >= 5) await debloquer(apprenantId, "leve_tot");
      const { data: u } = await supabase.from("utilisateurs").select("date_creation").eq("id", apprenantId).maybeSingle();
      if (u?.date_creation) {
        const joursDepuis = Math.floor((Date.now() - new Date(u.date_creation).getTime()) / 86400000);
        if (joursDepuis >= 30)  await debloquer(apprenantId, "un_mois");
        if (joursDepuis >= 90)  await debloquer(apprenantId, "habitue");
        if (joursDepuis >= 365) await debloquer(apprenantId, "veteran_bet");
      }
    }

    if (sourceType === "session") {
      const { data: gaRows } = await supabase.from("groupes_apprenants").select("id").eq("apprenant_id", apprenantId);
      const gaIds = (gaRows || []).map(g => g.id);
      if (gaIds.length) {
        const { data: presencesToutes } = await supabase
          .from("groupes_presences")
          .select("statut, created_at")
          .in("ga_id", gaIds)
          .order("created_at", { ascending: false });
        const cinqDernieres = (presencesToutes || []).slice(0, 5);
        if (cinqDernieres.length === 5 && cinqDernieres.every(p => p.statut === "present" || p.statut === "retard")) {
          await debloquer(apprenantId, "presence_parfaite");
        }
        const nbPresent = (presencesToutes || []).filter(p => p.statut === "present").length;
        const nbTotal   = (presencesToutes || []).filter(p => p.statut === "present" || p.statut === "retard").length;
        if (nbPresent >= 3)  await debloquer(apprenantId, "ponctuel");
        if (nbTotal   >= 20) await debloquer(apprenantId, "marathonien_live");
      }
    }

    if (sourceType === "devoir" || sourceType === "devoir_bonus") {
      const { data: gaRows } = await supabase.from("groupes_apprenants").select("id").eq("apprenant_id", apprenantId);
      const gaIds = (gaRows || []).map(g => g.id);
      if (gaIds.length) {
        const { data: rendusRaw } = await supabase
          .from("resultats_evaluations_groupes")
          .select("evaluation_id, rendu_at, fichier_url, evaluations_groupes!inner(categorie, date_evaluation, heure_debut)")
          .in("ga_id", gaIds)
          .eq("evaluations_groupes.categorie", "devoir")
          .not("rendu_at", "is", null);
        const rendus = rendusRaw || [];
        const nbRendus = rendus.length;
        if (nbRendus >= 1)  await debloquer(apprenantId, "premier_devoir");
        if (nbRendus >= 10) await debloquer(apprenantId, "travailleur_regulier");
        if (rendus.some(r => r.fichier_url)) await debloquer(apprenantId, "dossier_complet");

        const nbEnAvance = rendus.filter(r => {
          const dl = r.evaluations_groupes?.date_evaluation;
          if (!dl || !r.rendu_at) return false;
          const limite = new Date(`${dl}T${(r.evaluations_groupes.heure_debut || "23:59").slice(0,5)}:00`);
          return (limite.getTime() - new Date(r.rendu_at).getTime()) >= 24 * 3600 * 1000;
        }).length;
        if (nbEnAvance >= 5) await debloquer(apprenantId, "en_avance");
      }

      if (contexte.note != null && contexte.noteMax) {
        if (contexte.note / contexte.noteMax >= 1) await debloquer(apprenantId, "perfectionniste");
      }
    }

    if (sourceType === "devoir_correction") {
      const { data: gaRows } = await supabase.from("groupes_apprenants").select("id").eq("apprenant_id", apprenantId);
      const gaIds = (gaRows || []).map(g => g.id);
      if (gaIds.length) {
        const { data: corriges } = await supabase
          .from("resultats_evaluations_groupes")
          .select("note, note_max, corrige_at")
          .in("ga_id", gaIds)
          .not("corrige_at", "is", null)
          .not("note", "is", null)
          .order("corrige_at", { ascending: false })
          .limit(2);
        if ((corriges || []).length === 2) {
          const [recent, precedent] = corriges;
          if (recent.note_max > 0 && precedent.note_max > 0) {
            const pctRecent    = (recent.note    / recent.note_max)    * 100;
            const pctPrecedent = (precedent.note / precedent.note_max) * 100;
            if (pctRecent - pctPrecedent >= 30) await debloquer(apprenantId, "grand_progres");
          }
        }
      }
    }

    if (sourceType === "niveau_progression") {
      await debloquer(apprenantId, "ca_grimpe");
      const rang = rangCECR(contexte.niveau);
      if (rang !== null) {
        if (rang >= rangCECR("B1")) await debloquer(apprenantId, "bilingue_en_herbe");
        if (rang >= rangCECR("C1")) await debloquer(apprenantId, "niveau_maitrise");
      }
    }

    if (sourceType === "chat_message") {
      const { count } = await supabase
        .from("points_transactions_dash")
        .select("id", { count: "exact", head: true })
        .eq("apprenant_id", apprenantId)
        .eq("source_type", "chat_message");
      if ((count || 0) >= 1)  await debloquer(apprenantId, "esprit_de_classe");
      if ((count || 0) >= 10) await debloquer(apprenantId, "bon_camarade");
    }

    if (sourceType === "contenu_vue") {
      const { data: vues } = await supabase
        .from("contenus_vues_apprenant_dash")
        .select("cat")
        .eq("apprenant_id", apprenantId);
      const total = (vues || []).length;
      if (total >= 5) await debloquer(apprenantId, "curieux");
      const categories = new Set((vues || []).map(v => v.cat).filter(Boolean));
      if (categories.size >= 4) await debloquer(apprenantId, "collectionneur");
    }

    if (sourceType === "mini_jeu") {
      const { data: resultats } = await supabase
        .from("contenus_mini_jeux_resultats_dash")
        .select("jeu_id, pourcentage, contenus_mini_jeux_dash(type)")
        .eq("apprenant_id", apprenantId);
      const total = (resultats || []).length;
      if (total >= 1) await debloquer(apprenantId, "joueur_debutant");
      if (total >= 10) await debloquer(apprenantId, "increvable");
      if ((resultats || []).some(r => r.pourcentage >= 100)) await debloquer(apprenantId, "score_parfait");

      const typesJoues = new Set((resultats || []).map(r => r.contenus_mini_jeux_dash?.type).filter(Boolean));
      const { data: jeuxActifs } = await supabase.from("contenus_mini_jeux_dash").select("type").eq("actif", true);
      const typesActifs = new Set((jeuxActifs || []).map(j => j.type));
      if (typesActifs.size > 0 && [...typesActifs].every(t => typesJoues.has(t))) {
        await debloquer(apprenantId, "touche_a_tout");
      }
    }
  } catch (err) {
    console.error(`[gamification-dash] verifierBadges(${sourceType})`, err.message);
  }
}
