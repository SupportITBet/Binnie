import supabase from "../config/supabase.js";
import { notifyUser } from "./notifyRole.js";

// ══════════════════════════════════════════════════════════════
// Moteur de gamification BET - grand livre de points + moteur de badges.
// Implémente le schéma validé (artifact "Gamification BET - schéma & propositions").
//
// Principe : points_transactions est la seule vérité. utilisateurs.points_gamif est une
// valeur dénormalisée, recalculée à chaque écriture - jamais modifiée à la main.
// ══════════════════════════════════════════════════════════════

const PLAFONDS_JOURNALIERS = {
  mini_jeu: 40,
  chat_message: 5, // évite qu'un apprenant ne farme des points en spammant le chat de classe
};

// Ordre des niveaux CECR - sert à comparer "supérieur" et à détecter les paliers B1/C1.
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
    .from("points_transactions")
    .select("points")
    .eq("apprenant_id", apprenantId)
    .eq("source_type", sourceType)
    .gte("created_at", debutJourISO());
  return (data || []).reduce((s, t) => s + t.points, 0);
}

// Connexion quotidienne : première activité gamifiée de la journée → +2 points, une fois par
// jour. Détecté indirectement (pas de table de sessions dédiée) : recherche d'une transaction
// 'streak' déjà posée aujourd'hui pour cet apprenant.
async function assurerActiviteDuJour(apprenantId) {
  const { data: dejaAujourdhui } = await supabase
    .from("points_transactions")
    .select("id")
    .eq("apprenant_id", apprenantId)
    .eq("source_type", "streak")
    .gte("created_at", debutJourISO())
    .limit(1)
    .maybeSingle();
  if (dejaAujourdhui) return;

  await inserer(apprenantId, "streak", null, 2, "Connexion quotidienne");

  // Série de jours consécutifs - calculée à partir des dates distinctes de transactions.
  const { data: toutesStreaks } = await supabase
    .from("points_transactions")
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

  // "Le retour" : écart entre aujourd'hui et la dernière journée d'activité connue avant
  // aujourd'hui (joursDistincts[0] = aujourd'hui puisqu'on vient d'insérer).
  let retourApresPause = false;
  if (joursDistincts.length >= 2) {
    const gapJours = Math.round((new Date(joursDistincts[0]) - new Date(joursDistincts[1])) / 86400000);
    retourApresPause = gapJours >= 14;
  }

  // "Lève-tôt" : nombre total de connexions quotidiennes enregistrées avant 8h (heure serveur
  // UTC = heure Abidjan) - toutesStreaks inclut déjà la ligne qu'on vient d'insérer.
  const nbConnexionsMatinales = (toutesStreaks || []).filter(t => new Date(t.created_at).getUTCHours() < 8).length;

  await verifierBadges(apprenantId, "streak", { serie, retourApresPause, nbConnexionsMatinales });
}

async function inserer(apprenantId, sourceType, sourceId, points, description) {
  const { error } = await supabase.from("points_transactions").insert({
    apprenant_id: apprenantId, source_type: sourceType, source_id: sourceId ? String(sourceId) : null,
    points, description,
  });
  if (error) throw error;

  const { data: total } = await supabase
    .from("points_transactions")
    .select("points")
    .eq("apprenant_id", apprenantId);
  const solde = (total || []).reduce((s, t) => s + t.points, 0);
  await supabase.from("utilisateurs").update({ points_gamif: solde }).eq("id", apprenantId);
  return solde;
}

/**
 * Point d'entrée unique pour attribuer des points. Applique le plafond journalier de la
 * source si défini, assure la transaction "connexion quotidienne", insère la transaction
 * principale, recalcule le solde, puis évalue les badges pertinents pour cette source.
 */
export async function attribuerPoints(apprenantId, sourceType, sourceId, points, description, contexte = {}) {
  if (!apprenantId || !points) return;
  try {
    await assurerActiviteDuJour(apprenantId);

    const plafond = PLAFONDS_JOURNALIERS[sourceType];
    if (plafond) {
      const dejaGagnes = await pointsDejaGagnesAujourdhui(apprenantId, sourceType);
      if (dejaGagnes >= plafond) return; // plafond atteint pour aujourd'hui - silencieux
      points = Math.min(points, plafond - dejaGagnes);
      if (points <= 0) return;
    }

    await inserer(apprenantId, sourceType, sourceId, points, description);
    await verifierBadges(apprenantId, sourceType, contexte);
  } catch (err) {
    // La gamification ne doit jamais faire échouer l'action métier (rendre un devoir,
    // marquer une présence, terminer un jeu) qui l'a déclenchée.
    console.error(`[gamification] attribuerPoints(${sourceType})`, err.message);
  }
}

// Bonus "progression au réessai" - mini-jeu uniquement, une fois par jeu.
export async function attribuerBonusProgression(apprenantId, jeuId) {
  try {
    const { data: dejaDonne } = await supabase
      .from("points_transactions")
      .select("id")
      .eq("apprenant_id", apprenantId)
      .eq("source_type", "mini_jeu_progression")
      .eq("source_id", String(jeuId))
      .maybeSingle();
    if (dejaDonne) return;
    await inserer(apprenantId, "mini_jeu_progression", jeuId, 5, "Progression au réessai");
  } catch (err) {
    console.error("[gamification] attribuerBonusProgression", err.message);
  }
}

async function debloquer(apprenantId, code) {
  const { data: badge } = await supabase.from("badges").select("id, nom, icone, description").eq("code", code).maybeSingle();
  if (!badge) return;
  const { data: deja } = await supabase.from("badges_obtenus").select("id").eq("apprenant_id", apprenantId).eq("badge_id", badge.id).maybeSingle();
  if (deja) return;
  await supabase.from("badges_obtenus").insert({ apprenant_id: apprenantId, badge_id: badge.id });
  await notifyUser(apprenantId, {
    type: "badge_obtenu",
    titre: `${badge.icone} Nouveau badge : ${badge.nom}`,
    message: badge.description,
    source: "bet-elearning",
  });
}

/**
 * Évalue les conditions de badges pertinentes pour le type de source qui vient de générer
 * une transaction. Ne réévalue pas tout le catalogue à chaque appel - seulement les badges
 * dont la famille correspond à sourceType, pour rester rapide.
 */
export async function verifierBadges(apprenantId, sourceType, contexte = {}) {
  try {
    if (sourceType === "streak" || sourceType === "mini_jeu" || sourceType === "devoir" || sourceType === "session" || sourceType === "onboarding") {
      await debloquer(apprenantId, "bienvenue"); // 1ʳᵉ activité gamifiée, tous types confondus
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
      // presences_elearning est indexée par inscription_id, pas apprenant_id directement.
      const { data: inscriptions } = await supabase.from("classes_elearning_apprenants").select("id").eq("apprenant_id", apprenantId);
      const inscriptionIds = (inscriptions || []).map(i => i.id);
      if (inscriptionIds.length) {
        const { data: presences5 } = await supabase
          .from("presences_elearning")
          .select("statut, created_at")
          .in("inscription_id", inscriptionIds)
          .order("created_at", { ascending: false })
          .limit(5);
        if ((presences5 || []).length === 5 && presences5.every(p => p.statut === "present" || p.statut === "retard")) {
          await debloquer(apprenantId, "presence_parfaite");
        }

        const { data: presencesToutes } = await supabase
          .from("presences_elearning")
          .select("statut")
          .in("inscription_id", inscriptionIds);
        const nbPresent = (presencesToutes || []).filter(p => p.statut === "present").length;
        const nbTotal   = (presencesToutes || []).filter(p => p.statut === "present" || p.statut === "retard").length;
        if (nbPresent >= 3)  await debloquer(apprenantId, "ponctuel");
        if (nbTotal   >= 20) await debloquer(apprenantId, "marathonien_live");
      }
    }

    if (sourceType === "devoir" || sourceType === "devoir_bonus") {
      // devoirs_rendus_elearning est aussi indexée par inscription_id.
      const { data: inscriptions } = await supabase.from("classes_elearning_apprenants").select("id").eq("apprenant_id", apprenantId);
      const inscriptionIds = (inscriptions || []).map(i => i.id);
      if (inscriptionIds.length) {
        const { data: rendus } = await supabase
          .from("devoirs_rendus_elearning")
          .select("rendu_at, type_soumission, devoir_id")
          .in("inscription_id", inscriptionIds)
          .not("rendu_at", "is", null);
        const nbRendus = (rendus || []).length;
        if (nbRendus >= 1)  await debloquer(apprenantId, "premier_devoir");
        if (nbRendus >= 10) await debloquer(apprenantId, "travailleur_regulier");
        if ((rendus || []).some(r => r.type_soumission === "fichier" || r.type_soumission === "les_deux")) {
          await debloquer(apprenantId, "dossier_complet");
        }

        // "En avance" : rendu au moins 24h avant la deadline du devoir correspondant.
        const devoirIds = [...new Set((rendus || []).map(r => r.devoir_id).filter(Boolean))];
        if (devoirIds.length) {
          const { data: devoirsInfo } = await supabase
            .from("devoirs_elearning")
            .select("id, date_limite, heure_limite")
            .in("id", devoirIds);
          const limiteParDevoir = {};
          (devoirsInfo || []).forEach(d => {
            if (!d.date_limite) return;
            limiteParDevoir[d.id] = new Date(`${d.date_limite}T${(d.heure_limite || "23:59").slice(0, 5)}:00`);
          });
          const nbEnAvance = (rendus || []).filter(r => {
            const limite = limiteParDevoir[r.devoir_id];
            if (!limite || !r.rendu_at) return false;
            return (limite.getTime() - new Date(r.rendu_at).getTime()) >= 24 * 3600 * 1000;
          }).length;
          if (nbEnAvance >= 5) await debloquer(apprenantId, "en_avance");
        }
      }

      if (contexte.note != null && contexte.noteMax) {
        if (contexte.note / contexte.noteMax >= 1) await debloquer(apprenantId, "perfectionniste");
      }
    }

    if (sourceType === "devoir_correction") {
      // "Grand progrès" : comparé aux deux dernières notes corrigées (en %), la plus récente
      // étant celle qui vient d'être posée (passée en contexte, avant même son insertion DB
      // si nécessaire - ici on relit simplement l'historique qui l'inclut déjà).
      const { data: inscriptions } = await supabase.from("classes_elearning_apprenants").select("id").eq("apprenant_id", apprenantId);
      const inscriptionIds = (inscriptions || []).map(i => i.id);
      if (inscriptionIds.length) {
        const { data: corriges } = await supabase
          .from("devoirs_rendus_elearning")
          .select("note, note_max, corrige_at")
          .in("inscription_id", inscriptionIds)
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
        .from("points_transactions")
        .select("id", { count: "exact", head: true })
        .eq("apprenant_id", apprenantId)
        .eq("source_type", "chat_message");
      if ((count || 0) >= 1)  await debloquer(apprenantId, "esprit_de_classe");
      if ((count || 0) >= 10) await debloquer(apprenantId, "bon_camarade");
    }

    if (sourceType === "contenu_vue") {
      const { data: vues } = await supabase
        .from("contenus_vues_apprenant")
        .select("cat")
        .eq("apprenant_id", apprenantId);
      const total = (vues || []).length;
      if (total >= 5) await debloquer(apprenantId, "curieux");
      const categories = new Set((vues || []).map(v => v.cat).filter(Boolean));
      if (categories.size >= 4) await debloquer(apprenantId, "collectionneur");
    }

    if (sourceType === "mini_jeu") {
      const { data: resultats } = await supabase
        .from("contenus_mini_jeux_resultats")
        .select("jeu_id, pourcentage, contenus_mini_jeux(type)")
        .eq("apprenant_id", apprenantId);
      const total = (resultats || []).length;
      if (total >= 1) await debloquer(apprenantId, "joueur_debutant");
      if (total >= 10) await debloquer(apprenantId, "increvable");
      if ((resultats || []).some(r => r.pourcentage >= 100)) await debloquer(apprenantId, "score_parfait");

      const typesJoues = new Set((resultats || []).map(r => r.contenus_mini_jeux?.type).filter(Boolean));
      const { data: jeuxActifs } = await supabase.from("contenus_mini_jeux").select("type").eq("actif", true);
      const typesActifs = new Set((jeuxActifs || []).map(j => j.type));
      if (typesActifs.size > 0 && [...typesActifs].every(t => typesJoues.has(t))) {
        await debloquer(apprenantId, "touche_a_tout");
      }
    }
  } catch (err) {
    console.error(`[gamification] verifierBadges(${sourceType})`, err.message);
  }
}
