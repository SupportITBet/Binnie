/**
 * ============================================================================
 *  MOTEUR D'IMPORT EN MASSE
 * ============================================================================
 *
 *  Pourquoi cette route existe
 *  ---------------------------
 *  L'import se déroulait entièrement dans le navigateur : pour UNE ligne de
 *  coaching privé, le dashboard enchaînait 16 allers-retours HTTP (1 dossier,
 *  12 versements, 1 classe, 1 rattachement, 1 apprenant). Mesuré en conditions
 *  réelles : 40 lignes = 640 requêtes = 25 minutes, avec trois conséquences
 *  graves observées :
 *
 *    1. Onglet fermé en cours de route → lot à moitié importé, sans aucun signal.
 *    2. Une ligne échouant après la création du dossier laissait un ORPHELIN
 *       (dossier sans classe), que rien ne nettoyait.
 *    3. Chaque versement passait par /api/paiements/submit, qui envoie un EMAIL
 *       de reçu et notifie PA/onboarding/super_admin. Un import de 40 apprenants
 *       × 12 mensualités déclenchait ~480 emails et ~1 500 notifications - pour
 *       de la donnée historique que personne n'attendait.
 *
 *  Ce que fait ce moteur
 *  ---------------------
 *  Le navigateur envoie des PAQUETS de lignes ; le serveur exécute toutes les
 *  étapes localement (appels base directs) et ne répond qu'une fois le paquet
 *  traité. Les allers-retours passent de 16 par ligne à 1 par paquet.
 *
 *  Trois garanties qui manquaient :
 *
 *  • ATOMICITÉ PAR LIGNE - chaque ligne note ce qu'elle crée ; si une étape
 *    échoue, tout ce que CETTE ligne avait déjà créé est supprimé. Le lot
 *    continue sur les lignes suivantes, mais ne laisse jamais de demi-dossier.
 *
 *  • SILENCE - importer un an d'historique n'est pas encaisser 480 paiements en
 *    direct. Les versements sont écrits en une seule insertion groupée, sans
 *    email ni notification unitaire ; une seule notification de synthèse est
 *    envoyée à la fin du lot.
 *
 *  • TRAÇABILITÉ ET RETOUR ARRIÈRE - chaque ligne créée porte l'`import_id` qui
 *    l'a produite, ce qui rend l'annulation d'un lot exacte et sûre (là où il a
 *    fallu écrire un script de suppression sur mesure pour nettoyer un test).
 *
 *  La logique métier n'est jamais dupliquée : la création d'un dossier réutilise
 *  `creerAssignationCore` (parcours.js) et la création d'un compte apprenant
 *  `creerAccesApprenantCore` (apprenants.js) - les mêmes fonctions que les
 *  écrans de saisie manuelle.
 *
 *  Prérequis : sql/imports_en_masse_migration.sql
 * ============================================================================
 */

import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { creerAssignationCore } from "./parcours.js";
import { creerAccesApprenantCore } from "./apprenants.js";
import { notifyUser, notifyRole } from "../services/notifyRole.js";

const router = express.Router();

/* ══════════════════════════════════════════════════════════════════
   OUTILS
══════════════════════════════════════════════════════════════════ */

/** Normalise un libellé pour comparaison (accents, casse, ponctuation). */
const norm = (s) => String(s || "").toLowerCase().trim()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * Empreinte stable d'une ligne de fichier - c'est elle qui rend un import
 * rejouable sans doublon. Volontairement lisible plutôt que hachée : quand une
 * ligne est sautée, on veut pouvoir lire pourquoi directement en base.
 */
const cleLigne = (type, ligne, contexte) => [
  type,
  contexte.centre_id || contexte.assistante_id || "global",
  norm(ligne.nom),
  norm(ligne.prenom),
  norm(ligne.email) || norm(ligne.telephone) || norm(ligne.nom_parent),
  norm(ligne.classe_nom || ligne.nom_classe || ""),
].join("|");

/** L'offre est encodée dans `inscription`, même convention que /paiements/submit. */
const encoderInscription = (offre, inscription) => [
  offre ? `offre::${String(offre).trim()}` : null,
  inscription ? String(inscription).trim() : null,
].filter(Boolean).join("||") || null;

/**
 * Défait ce qu'une ligne a créé avant d'échouer.
 * Ordre inverse des dépendances, et chaque suppression est isolée : un échec de
 * nettoyage ne doit pas masquer l'erreur d'origine, qui est ce qui intéresse
 * l'utilisateur dans le rapport d'import.
 */
async function nettoyerLigne(trace) {
  const etapes = [
    ["groupes_apprenants",     trace.ga_id],
    ["paiements_parcours",     trace.paiement_ids],
    ["assignations_parcours",  trace.assignation_id],
    ["groupes",                trace.groupe_id],
  ];
  for (const [table, ref] of etapes) {
    if (!ref || (Array.isArray(ref) && ref.length === 0)) continue;
    try {
      const q = supabase.from(table).delete();
      await (Array.isArray(ref) ? q.in("id", ref) : q.eq("id", ref));
    } catch { /* le nettoyage ne doit jamais écraser l'erreur d'origine */ }
  }
  if (trace.user_id) {
    try { await supabase.from("utilisateurs").delete().eq("id", trace.user_id); } catch {}
    try { await supabase.auth.admin.deleteUser(trace.user_id); } catch {}
  }
}

/** Une ligne déjà importée (et non annulée) doit être sautée, pas recréée. */
async function dejaImportee(table, cle) {
  const { data } = await supabase.from(table).select("id").eq("import_ligne_cle", cle).maybeSingle();
  return data?.id || null;
}

/* ══════════════════════════════════════════════════════════════════
   TRAITEMENTS PAR TYPE DE LIGNE
   Chacun retourne { statut: "ok"|"erreur"|"ignore", nom, detail }
══════════════════════════════════════════════════════════════════ */

/** Classe / groupe seul - le cas le plus simple : une insertion. */
async function traiterClasse(ligne, ctx, importId) {
  const nom = ligne.nom;
  const cle = cleLigne("classe", ligne, ctx);

  const existant = await dejaImportee("groupes", cle);
  if (existant) return { statut: "ignore", nom, detail: "Déjà importée précédemment - ligne sautée" };

  const { error } = await supabase.from("groupes").insert({
    nom,
    filiere:      ligne.filiere      || null,
    niveau:       ligne.niveau       || null,
    date_debut:   ligne.date_debut   || null,
    date_fin:     ligne.date_fin     || null,
    capacite_max: ligne.capacite_max || 20,
    horaire:      ligne.horaire      || [],
    type_cours:   ctx.type_cours     || "presentiel",
    centre_id:    ctx.centre_id      || null,
    coach_id:     ligne.coach_id     || null,
    created_by:   ctx.acteur_id      || null,
    created_by_nom: ligne.created_by_nom || ctx.acteur_nom || null,
    import_id:      importId,
    import_ligne_cle: cle,
  });

  if (error) return { statut: "erreur", nom, detail: error.message };
  return { statut: "ok", nom, detail: "Classe créée" };
}

/**
 * Résout l'assistante d'une ligne en compte utilisateur.
 *
 * `paiements_parcours.commercial_id` attend un `utilisateurs.id`, alors que
 * `ligne.assistante_id` est un `assistantes.id` : deux tables distinctes, sans colonne
 * de liaison, que seul l'email rapproche (même résolution que parcours.js). Sans elle,
 * les versements d'un import lancé par l'Onboarding POUR plusieurs assistantes étaient
 * tous crédités à l'Onboarding, et n'apparaissaient dans l'onglet Paiements d'aucune
 * commerciale - 254 versements, 14 260 000 F, invisibles de leurs titulaires.
 *
 * Mémoïsé sur le contexte du lot : un import de 58 lignes ne fait plus que quelques
 * requêtes au lieu de deux par ligne.
 */
async function utilisateurIdDeLAssistante(assistanteId, ctx) {
  if (!assistanteId) return null;
  if (!ctx._utilisateursParAssistante) ctx._utilisateursParAssistante = new Map();
  if (ctx._utilisateursParAssistante.has(assistanteId)) return ctx._utilisateursParAssistante.get(assistanteId);

  let idUtilisateur = null;
  const { data: ass } = await supabase
    .from("assistantes").select("email").eq("id", assistanteId).maybeSingle();
  if (ass?.email) {
    const { data: u } = await supabase
      .from("utilisateurs").select("id").ilike("email", ass.email.trim()).maybeSingle();
    idUtilisateur = u?.id || null;
  }
  ctx._utilisateursParAssistante.set(assistanteId, idUtilisateur);
  return idUtilisateur;
}

/**
 * Offre du dossier - lue sur la CLASSE, jamais écrite en dur.
 *
 * `inscription_offre` doit porter le libellé exact d'une offre du catalogue
 * (plateforme_config) : c'est la seule clé qui relie un dossier à son offre dans
 * « Offres & Formations ». La classe le porte déjà, saisi dans la colonne Filière du
 * fichier ; l'apprenant n'a qu'à en hériter.
 *
 * Les replis littéraux d'avant - "Formation" pour un apprenant, "Coaching Privé" pour
 * un privé - n'existaient dans aucun catalogue : les dossiers concernés étaient rangés
 * en « offres inconnues » et leur chiffre d'affaires exclu des statistiques. Mieux vaut
 * null, qui se voit, qu'un libellé inventé qui fausse silencieusement les totaux.
 *
 * Mémoïsé sur le contexte du lot : une classe de 10 apprenants n'est lue qu'une fois.
 */
async function filiereDeLaClasse(classeId, ctx) {
  if (!classeId) return null;
  if (!ctx._filieresParClasse) ctx._filieresParClasse = new Map();
  if (ctx._filieresParClasse.has(classeId)) return ctx._filieresParClasse.get(classeId);

  const { data } = await supabase.from("groupes").select("filiere").eq("id", classeId).maybeSingle();
  const filiere = data?.filiere || null;
  ctx._filieresParClasse.set(classeId, filiere);
  return filiere;
}

/**
 * Versements d'une ligne - insertion GROUPÉE et silencieuse.
 * C'est ici que se joue l'essentiel du gain : 12 requêtes HTTP (chacune avec son
 * email de reçu) deviennent une seule insertion sans effet de bord.
 *
 * Le versement est crédité à l'assistante DU DOSSIER, pas à qui lance l'import : une
 * commerciale présentiel importe pour elle-même (repli sur ctx.acteur_id, comportement
 * inchangé), l'Onboarding importe pour plusieurs assistantes à la fois.
 */
async function insererPaiements(ligne, ctx, importId, assignationId, nomComplet) {
  const versements = ligne.paiements || [];
  if (!versements.length) return { ids: [], erreur: null };

  const proprietaire = (await utilisateurIdDeLAssistante(ligne.assistante_id, ctx)) || ctx.acteur_id || null;

  const lignesPaiement = versements.map((p) => ({
    commercial_id:   proprietaire,
    client:          nomComplet,
    email:           ligne.profil_type === "enfant" ? null : (ligne.email || null),
    telephone:       ligne.profil_type === "enfant" ? null : (ligne.telephone || null),
    inscription:     encoderInscription(ligne.filiere || ctx.offre_defaut, ctx.inscription_label),
    montant_du:      p.montant,
    montant_recu:    p.montant,
    date_paiement:   p.date || ligne.date_debut || new Date().toISOString().slice(0, 10),
    mode_paiement:   p.mode || "Mobile Money",
    statut:          "paye",
    ref_transaction: p.reference || null,
    notes:           "Import en masse",
    assignation_id:  assignationId,
    import_id:       importId,
  }));

  const { data, error } = await supabase.from("paiements_parcours").insert(lignesPaiement).select("id");
  if (error) return { ids: [], erreur: error.message };
  return { ids: (data || []).map((d) => d.id), erreur: null };
}

/** Apprenant rejoignant une classe DÉJÀ existante (import apprenants / global). */
async function traiterApprenant(ligne, ctx, importId) {
  const nomComplet = [ligne.prenom, ligne.nom].filter(Boolean).join(" ");
  const cle = cleLigne("apprenant", ligne, ctx);
  const trace = { paiement_ids: [] };

  const existant = await dejaImportee("assignations_parcours", cle);
  if (existant) return { statut: "ignore", nom: nomComplet, detail: "Déjà importé précédemment - ligne sautée" };

  try {
    const estEnfant = ligne.profil_type === "enfant";
    const typeCours = ligne.type_cours || ctx.type_cours || "presentiel";
    // L'apprenant hérite de l'offre de sa classe : le client ne pose pas `filiere` sur
    // les lignes apprenants, et c'est la classe qui porte le libellé du catalogue.
    const offre = ligne.filiere || (await filiereDeLaClasse(ligne.classe_id, ctx)) || null;

    // 1. Dossier - via la MÊME fonction que la saisie manuelle.
    const rep = await creerAssignationCore({
      prospect_nom:       nomComplet,
      prospect_email:     estEnfant ? null : (ligne.email || null),
      prospect_telephone: estEnfant ? null : (ligne.telephone || null),
      type_cours:         typeCours,
      type_coaching:      "groupe",
      source:             ctx.source,
      // La ligne d'abord, le contexte ensuite : une commerciale présentiel est seule sur
      // son lot (contexte), mais l'Onboarding importe pour PLUSIEURS assistantes en ligne
      // à la fois - chaque ligne porte alors la sienne, résolue depuis son email. Sans ce
      // repli, tout import global de l'Onboarding échouait sur « assistante_id requis ».
      assistante_id:      ligne.assistante_id || ctx.assistante_id || null,
      centre_id:          ctx.centre_id || null,
      inscription_offre:  offre,
      niveau_client:      ligne.niveau || null,
      montant_paye:       ligne.montant_paye ?? null,
      statut_paiement:    ligne.montant_paye ? "confirme" : "en_attente",
      date_debut_formation: ligne.date_debut || null,
      profil_type:        ligne.profil_type || "adulte",
      nom_parent:         estEnfant ? (ligne.nom_parent || null) : null,
      telephone_parent:   estEnfant ? (ligne.telephone_parent || null) : null,
      // L'email du parent n'arrivait qu'au compte d'accès, jamais au dossier : la fiche
      // affichait donc "EMAIL PARENT -" alors que le fichier le renseignait bien.
      email_parent:       estEnfant ? (ligne.email_parent || null) : null,
      notes:              ligne.notes || null,
      commercial_id:      ctx.acteur_id || null,
      statut:             ligne.classe_id ? "converti" : "en_cours",
      routing_statut:     ligne.classe_id ? "centre_assigne" : "assistante_a_traiter",
    }, { authorization: ctx.authorization });

    if (rep.status >= 400) return { statut: "erreur", nom: nomComplet, detail: "Dossier : " + (rep.payload?.error || rep.status) };
    trace.assignation_id = rep.payload?.assignation?.id;
    if (!trace.assignation_id) return { statut: "erreur", nom: nomComplet, detail: "Dossier créé sans identifiant" };

    await supabase.from("assignations_parcours")
      .update({ import_id: importId, import_ligne_cle: cle })
      .eq("id", trace.assignation_id);

    // 2. Versements, groupés et silencieux.
    const pmt = await insererPaiements(ligne, ctx, importId, trace.assignation_id, nomComplet);
    if (pmt.erreur) { await nettoyerLigne(trace); return { statut: "erreur", nom: nomComplet, detail: "Versements : " + pmt.erreur }; }
    trace.paiement_ids = pmt.ids;

    // 3. Plan mensuel + rattachement à la classe si elle est connue.
    const maj = {};
    if (ligne.plan_paiement) maj.plan_paiement = ligne.plan_paiement;
    if (ligne.classe_id) {
      maj.suivi_demarrage = {
        classe_id: ligne.classe_id, classe_nom: ligne.classe_nom || null,
        coach_id: ligne.coach_id || null, coach_nom: ligne.coach_nom || null,
        date_assignation: new Date().toISOString().slice(0, 10),
      };
      maj.routing_statut = "centre_assigne";
      maj.statut = "converti";
    }
    if (Object.keys(maj).length) {
      await supabase.from("assignations_parcours").update(maj).eq("id", trace.assignation_id);
    }

    // 4. Inscription dans la classe (+ compte apprenant), seulement si classe connue.
    //    Sans classe, la ligne reste un dossier à affecter - comportement voulu.
    if (ligne.classe_id) {
      const { data: ga, error: gaErr } = await supabase.from("groupes_apprenants").insert({
        groupe_id:        ligne.classe_id,
        nom_apprenant:    ligne.nom,
        prenom_apprenant: ligne.prenom || null,
        email_apprenant:  estEnfant ? null : (ligne.email || null),
        telephone:        estEnfant ? null : (ligne.telephone || null),
        niveau:           ligne.niveau || null,
        statut:           "actif",
        // Qui a inscrit l'apprenant dans le groupe. La route HTTP le posait
        // (added_by: req.profil.id) ; en écrivant directement dans la table, le moteur
        // l'avait perdu - et la fiche affichait "-" en face de l'assistante ayant
        // réalisé l'affectation, ce champ étant résolu depuis added_by.
        added_by:         ctx.acteur_id || null,
        note: JSON.stringify({
          programme: offre,
          date_debut: ligne.date_debut || null,
          assignation_id: trace.assignation_id,
        }),
        import_id: importId,
      }).select("id").single();

      if (gaErr) { await nettoyerLigne(trace); return { statut: "erreur", nom: nomComplet, detail: "Inscription : " + gaErr.message }; }
      trace.ga_id = ga.id;

      const acces = await creerAccesApprenantCore({
        nom: ligne.nom, prenom: ligne.prenom || null,
        email: estEnfant ? null : (ligne.email || null),
        telephone: estEnfant ? null : (ligne.telephone || null),
        ga_id: ga.id,
        email_parent: estEnfant ? (ligne.email_parent || null) : null,
        telephone_parent: estEnfant ? (ligne.telephone_parent || null) : null,
        acteur: ctx.acteur,
      });
      if (acces?.ok && acces.data?.user_id) {
        trace.user_id = acces.data.user_id;
        await supabase.from("utilisateurs").update({ import_id: importId }).eq("id", acces.data.user_id);
      }
    }

    return {
      statut: "ok", nom: nomComplet,
      detail: (ligne.classe_id ? `Inscrit dans "${ligne.classe_nom || "la classe"}"` : "Dossier créé - classe à affecter")
        + (trace.paiement_ids.length ? ` · ${trace.paiement_ids.length} versement(s)` : ""),
    };
  } catch (err) {
    await nettoyerLigne(trace);
    return { statut: "erreur", nom: nomComplet, detail: err.message };
  }
}

/** Coaching privé - dossier + classe dédiée (1 place) + apprenant. */
async function traiterPrive(ligne, ctx, importId) {
  const nomComplet = [ligne.prenom, ligne.nom].filter(Boolean).join(" ");
  const cle = cleLigne("prive", ligne, ctx);
  const trace = { paiement_ids: [] };

  const existant = await dejaImportee("assignations_parcours", cle);
  if (existant) return { statut: "ignore", nom: nomComplet, detail: "Déjà importé précédemment - ligne sautée" };

  try {
    const estEnfant = ligne.profil_type === "enfant";
    const enLigne   = ctx.type_cours === "en_ligne";
    const typeCours = enLigne ? "en_ligne" : (ligne.lieu === "domicile" ? "domicile" : "presentiel");

    // 1. Dossier privé, dans son état final (relation déjà réelle).
    const rep = await creerAssignationCore({
      prospect_nom:       nomComplet,
      prospect_email:     estEnfant ? null : (ligne.email || null),
      prospect_telephone: estEnfant ? null : (ligne.telephone || null),
      type_cours:         typeCours,
      type_coaching:      "prive",
      source:             ctx.source,
      assistante_id:      ligne.assistante_id || ctx.assistante_id || null,
      centre_id:          enLigne ? null : (ctx.centre_id || null),
      inscription_offre:  ligne.filiere || null,
      pack_coaching:      ligne.pack,
      lieu_coaching:      enLigne ? "en_ligne" : ligne.lieu,
      formation_souhaitee: ligne.filiere || null,
      centre_coaching:    (!enLigne && ligne.lieu === "cabinet") ? (ctx.centre_id || null) : null,
      adresse_coaching:   ligne.lieu === "domicile" ? (ligne.adresse || null) : null,
      niveau_client:      ligne.niveau || null,
      date_debut_formation: ligne.date_debut || null,
      commercial_id:      ctx.acteur_id || null,
      profil_type:        ligne.profil_type || "adulte",
      nom_parent:         estEnfant ? (ligne.nom_parent || null) : null,
      telephone_parent:   estEnfant ? (ligne.telephone_parent || null) : null,
      // L'email du parent n'arrivait qu'au compte d'accès, jamais au dossier : la fiche
      // affichait donc "EMAIL PARENT -" alors que le fichier le renseignait bien.
      email_parent:       estEnfant ? (ligne.email_parent || null) : null,
      disponibilites:     ligne.horaire?.length ? { horaires: ligne.horaire } : null,
      montant_paye:       ligne.montant_paye ?? null,
      objectif_client:    ligne.objectif || null,
      notes:              ligne.notes || null,
      statut_paiement:    ligne.montant_paye ? "confirme" : "en_attente",
      statut:             "converti",
      routing_statut:     enLigne ? "onboarding_affecte" : "centre_assigne",
    }, { authorization: ctx.authorization });

    if (rep.status >= 400) return { statut: "erreur", nom: nomComplet, detail: "Dossier : " + (rep.payload?.error || rep.status) };
    trace.assignation_id = rep.payload?.assignation?.id;
    if (!trace.assignation_id) return { statut: "erreur", nom: nomComplet, detail: "Dossier créé sans identifiant" };

    const suiviInitial = rep.payload?.assignation?.suivi_demarrage || {};
    await supabase.from("assignations_parcours")
      .update({ import_id: importId, import_ligne_cle: cle })
      .eq("id", trace.assignation_id);

    // 2. Versements groupés et silencieux.
    const pmt = await insererPaiements(ligne, ctx, importId, trace.assignation_id, nomComplet);
    if (pmt.erreur) { await nettoyerLigne(trace); return { statut: "erreur", nom: nomComplet, detail: "Versements : " + pmt.erreur }; }
    trace.paiement_ids = pmt.ids;

    // 3. Classe privée dédiée (1 place) avec le coach déjà assigné.
    const { data: grp, error: grpErr } = await supabase.from("groupes").insert({
      nom:          `Coaching privé - ${nomComplet}`,
      niveau:       ligne.niveau || null,
      filiere:      ligne.filiere || null,
      type_cours:   enLigne ? "prive" : typeCours,
      coach_id:     ligne.coach_id || null,
      centre_id:    enLigne ? null : (ctx.centre_id || null),
      capacite_max: 1,
      date_debut:   ligne.date_debut || null,
      date_fin:     ligne.date_fin || null,
      horaire:      ligne.horaire || [],
      created_by:   ctx.acteur_id || null,
      // created_by reste le compte qui a lancé l'import ; ce libellé, lui, nomme
      // l'assistante réellement en charge de la ligne - sans quoi les classes d'un
      // même lot semblaient toutes appartenir à la personne ayant importé.
      created_by_nom: ligne.assistante_nom
        ? `${ligne.assistante_nom} (assistante en ligne)`
        : (ctx.acteur_nom || null),
      import_id:    importId,
    }).select("id").single();

    if (grpErr) { await nettoyerLigne(trace); return { statut: "erreur", nom: nomComplet, detail: "Classe : " + grpErr.message }; }
    trace.groupe_id = grp.id;

    // 4. Rattachement - FUSION de suivi_demarrage, jamais remplacement : sinon
    //    lieu_coaching, disponibilités et formation déjà posés à l'étape 1 sont
    //    écrasés en silence (bug déjà constaté : "cabinet" affiché sur un dossier
    //    à domicile, disponibilités vides).
    const maj = {
      suivi_demarrage: {
        ...suiviInitial,
        classe_id: grp.id, classe_nom: `Coaching privé - ${nomComplet}`,
        coach_id: ligne.coach_id || null, coach_nom: ligne.coach_nom || null,
        date_assignation: new Date().toISOString().slice(0, 10),
      },
      routing_statut: enLigne ? "onboarding_affecte" : "centre_assigne",
      statut: "converti", dossier_statut: null,
    };
    if (ligne.plan_paiement) maj.plan_paiement = ligne.plan_paiement;
    await supabase.from("assignations_parcours").update(maj).eq("id", trace.assignation_id);

    // 5. Apprenant dans sa classe + compte d'accès.
    const { data: ga, error: gaErr } = await supabase.from("groupes_apprenants").insert({
      groupe_id:        grp.id,
      nom_apprenant:    ligne.nom,
      prenom_apprenant: ligne.prenom || null,
      email_apprenant:  estEnfant ? null : (ligne.email || null),
      telephone:        estEnfant ? null : (ligne.telephone || null),
      niveau:           ligne.niveau || null,
      statut:           "actif",
      // Voir traiterApprenant : sans added_by, la fiche n'affiche aucune assistante
      // en face de l'affectation, ce champ étant résolu depuis cette colonne.
      added_by:         ctx.acteur_id || null,
      note: JSON.stringify({
        programme: ligne.filiere || null,
        date_debut: ligne.date_debut || null,
        assignation_id: trace.assignation_id,
      }),
      import_id: importId,
    }).select("id").single();

    if (gaErr) { await nettoyerLigne(trace); return { statut: "erreur", nom: nomComplet, detail: "Apprenant : " + gaErr.message }; }
    trace.ga_id = ga.id;

    const acces = await creerAccesApprenantCore({
      nom: ligne.nom, prenom: ligne.prenom || null,
      email: estEnfant ? null : (ligne.email || null),
      telephone: estEnfant ? null : (ligne.telephone || null),
      ga_id: ga.id,
      email_parent: estEnfant ? (ligne.email_parent || null) : null,
      telephone_parent: estEnfant ? (ligne.telephone_parent || null) : null,
      acteur: ctx.acteur,
    });
    if (acces?.ok && acces.data?.user_id) {
      trace.user_id = acces.data.user_id;
      await supabase.from("utilisateurs").update({ import_id: importId }).eq("id", acces.data.user_id);
    }

    return {
      statut: "ok", nom: nomComplet,
      detail: `Coaching privé créé${trace.paiement_ids.length ? ` · ${trace.paiement_ids.length} versement(s)` : ""}`,
    };
  } catch (err) {
    await nettoyerLigne(trace);
    return { statut: "erreur", nom: nomComplet, detail: err.message };
  }
}

const TRAITEMENTS = {
  classe:           traiterClasse,
  groupe:           traiterClasse,   // même traitement, libellé différent selon le dashboard
  apprenant:        traiterApprenant,
  prive_presentiel: traiterPrive,
  prive_en_ligne:   traiterPrive,
};

/* ══════════════════════════════════════════════════════════════════
   ROUTES
══════════════════════════════════════════════════════════════════ */

/**
 * Rôles autorisés à voir et annuler les imports de TOUT LE MONDE. Les autres
 * (commerciale, onboarding) ne voient et n'annulent que les leurs : chacune peut
 * défaire sa propre erreur, sans jamais pouvoir toucher au lot d'une collègue
 * (une commerciale d'un centre annulant l'import d'un autre centre).
 */
const ROLES_VUE_TOTALE = ["super_admin", "admin", "manager", "responsable", "gestionnaire"];
const voitTout = (req) => ROLES_VUE_TOTALE.includes(req.role);

/** Ouvre un import et renvoie son identifiant. */
router.post("/", authenticateAdmin, async (req, res) => {
  try {
    const { type, fichier_nom, nb_lignes, contexte, lignes_source } = req.body;
    if (!TRAITEMENTS[type]) return res.status(400).json({ error: `Type d'import inconnu : ${type}` });

    const base = {
      type,
      fichier_nom:    fichier_nom || null,
      lance_par_id:   req.profil?.id || null,
      lance_par_nom:  [req.profil?.prenom, req.profil?.nom].filter(Boolean).join(" ") || null,
      lance_par_role: req.role || null,
      contexte:       contexte || {},
      nb_lignes:      nb_lignes || 0,
      statut:         "en_cours",
    };

    // Les lignes source servent uniquement à "Relancer" sans le fichier d'origine.
    // Si la migration correspondante n'a pas encore été jouée, l'import doit continuer
    // de fonctionner normalement - on se contente alors de perdre le rejeu en un clic,
    // jamais l'import lui-même (voir sql/imports_lignes_source_migration.sql).
    let { data, error } = await supabase.from("imports")
      .insert({ ...base, lignes_source: Array.isArray(lignes_source) ? lignes_source : null })
      .select("id, type, nb_lignes, created_at").single();

    if (error && (error.message || "").includes("lignes_source")) {
      console.warn("[imports] colonne lignes_source absente - import sans possibilité de relance");
      ({ data, error } = await supabase.from("imports").insert(base)
        .select("id, type, nb_lignes, created_at").single());
    }

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ import: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Traite un paquet de lignes. C'est LE point chaud : le navigateur n'envoie plus
 * qu'une requête par paquet au lieu de 16 par ligne.
 */
router.post("/:id/lot", authenticateAdmin, async (req, res) => {
  try {
    const { lignes } = req.body;
    if (!Array.isArray(lignes) || !lignes.length) return res.status(400).json({ error: "Aucune ligne à traiter" });

    const { data: job, error: jobErr } = await supabase
      .from("imports").select("id, type, statut, contexte, nb_ok, nb_erreur, nb_ignore, resultats")
      .eq("id", req.params.id).maybeSingle();
    if (jobErr || !job) return res.status(404).json({ error: "Import introuvable" });
    if (job.statut === "annule") return res.status(409).json({ error: "Cet import a été annulé" });

    // Un paquet peut porter un type propre, différent de celui du lot. C'est ce qui
    // permet à l'Import global de créer d'abord ses classes puis ses apprenants DANS LE
    // MÊME lot : sans ça les classes naissaient hors du moteur, sans import_id, et
    // survivaient donc à l'annulation (classes vides laissées derrière elle).
    const typeLot = req.body.type || job.type;
    const traiter = TRAITEMENTS[typeLot];
    if (!traiter) return res.status(400).json({ error: `Type d'import inconnu : ${typeLot}` });

    const ctx = {
      ...(job.contexte || {}),
      acteur_id:  req.profil?.id || null,
      acteur_nom: [req.profil?.prenom, req.profil?.nom].filter(Boolean).join(" ") || null,
      acteur: {
        id: req.profil?.id || null, nom: req.profil?.nom, prenom: req.profil?.prenom,
        email: req.profil?.email || null, role: req.role || null,
        ip_address: req.headers["x-forwarded-for"] || req.ip || null,
      },
      authorization: req.headers.authorization,
    };

    // Séquentiel volontairement : les lignes d'un même fichier peuvent viser la
    // même classe ou le même apprenant. En parallèle, deux lignes jumelles
    // passeraient toutes deux le test d'idempotence avant que l'une n'ait écrit.
    const resultats = [];
    for (const ligne of lignes) resultats.push(await traiter(ligne, ctx, job.id));

    const compte = (s) => resultats.filter((r) => r.statut === s).length;
    const { data: maj } = await supabase.from("imports").update({
      nb_ok:     (job.nb_ok     || 0) + compte("ok"),
      nb_erreur: (job.nb_erreur || 0) + compte("erreur"),
      nb_ignore: (job.nb_ignore || 0) + compte("ignore"),
      resultats: [...(job.resultats || []), ...resultats],
    }).eq("id", job.id).select("nb_ok, nb_erreur, nb_ignore, nb_lignes").single();

    res.json({ resultats, avancement: maj });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Clôture l'import et envoie l'UNIQUE notification de synthèse. */
router.post("/:id/terminer", authenticateAdmin, async (req, res) => {
  try {
    const { data: job, error } = await supabase.from("imports")
      .update({ statut: req.body?.interrompu ? "interrompu" : "termine", termine_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select("id, type, statut, nb_ok, nb_erreur, nb_ignore, nb_lignes, lance_par_id, fichier_nom, termine_at")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Une seule notification pour tout le lot - là où l'ancien import en envoyait
    // une par versement (≈1 500 pour un fichier de 40 lignes sur 12 mensualités).
    if (job.lance_par_id) {
      await notifyUser(job.lance_par_id, {
        type:  "import",
        titre: `📥 Import terminé - ${job.nb_ok} ligne(s) créée(s)`,
        message: `${job.fichier_nom || "Fichier"} : ${job.nb_ok} créée(s)`
          + (job.nb_erreur ? `, ${job.nb_erreur} en erreur` : "")
          + (job.nb_ignore ? `, ${job.nb_ignore} déjà présente(s)` : "") + ".",
        meta:   { import_id: job.id },
        source: "dash",
      }).catch(() => {});
    }

    // ── Les autres personnes concernées ───────────────────────────────────────
    // Jusqu'ici la seule notification partait vers celui qui avait lancé l'import :
    // le PA ne voyait jamais passer 58 apprenants, et les coachs découvraient leurs
    // nouveaux inscrits en ouvrant leur classe. On reste au niveau du LOT - une
    // synthèse, pas une notification par ligne, sans quoi on retomberait dans le
    // déluge que ce moteur a précisément supprimé.
    if (job.nb_ok > 0) {
      await notifierApresImport(job).catch((e) =>
        console.warn("[imports] notifications de fin de lot :", e.message));
    }

    res.json({ import: job });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Synthèse de fin de lot pour le PA et pour chaque coach concerné.
 *
 * Le PA reçoit une notification par lot ; un coach en reçoit une par CLASSE dont il a
 * la charge, jamais une par apprenant - dix arrivées dans la même classe sont un seul
 * événement de son point de vue.
 */
async function notifierApresImport(job) {
  // Les classes touchées par ce lot, et les apprenants qui y sont entrés. Le tampon
  // import_id porté par chaque ligne rend ce décompte exact, sans heuristique.
  const { data: lignes } = await supabase
    .from("groupes_apprenants")
    .select("groupe_id")
    .eq("import_id", job.id)
    .not("groupe_id", "is", null);

  const parGroupe = new Map();
  for (const l of lignes || []) parGroupe.set(l.groupe_id, (parGroupe.get(l.groupe_id) || 0) + 1);

  let groupes = [];
  if (parGroupe.size) {
    const { data } = await supabase
      .from("groupes").select("id, nom, coach_id").in("id", [...parGroupe.keys()]);
    groupes = data || [];
  }

  const nbClasses = parGroupe.size;
  const detail = `${job.fichier_nom || "Fichier"} - ${job.nb_ok} apprenant(s)`
    + (nbClasses ? ` dans ${nbClasses} classe(s)` : "")
    + (job.nb_erreur ? `, ${job.nb_erreur} ligne(s) en erreur` : "") + ".";

  // Le PA : une seule notification pour tout le lot.
  await notifyRole(["pedagogical_advisor", "admin_pa_advisor"], {
    type:    "import",
    titre:   `📥 Import en masse - ${job.nb_ok} apprenant(s) ajouté(s)`,
    message: detail,
    meta:    { import_id: job.id, nb_ok: job.nb_ok, nb_classes: nbClasses },
    source:  "dash",
  }).catch(() => {});

  // Chaque coach : UNE notification pour tout le lot, avec le détail par classe dans le
  // corps. Un import de coachings privés crée une classe par apprenant - notifier par
  // classe aurait envoyé trois messages « 1 nouvel apprenant » au même coach.
  const parCoach = new Map();
  for (const g of groupes) {
    if (!g.coach_id) continue;
    if (!parCoach.has(g.coach_id)) parCoach.set(g.coach_id, []);
    parCoach.get(g.coach_id).push({ nom: g.nom || "-", n: parGroupe.get(g.id) || 0 });
  }

  for (const [coachId, classes] of parCoach) {
    const total = classes.reduce((s2, c) => s2 + c.n, 0);
    const detailClasses = classes.map((c) => `« ${c.nom} » (${c.n})`).join(", ");
    await notifyUser(coachId, {
      type:    "inscription",
      titre:   `📥 ${total} nouvel(le)(s) apprenant(s) dans ${classes.length > 1 ? "vos classes" : "votre classe"}`,
      message: `${detailClasses}. Consultez la liste pour préparer votre prochaine séance.`,
      meta:    { import_id: job.id, nb_apprenants: total, groupe_ids: classes.map((c) => c.nom) },
      source:  "dash",
    }).catch(() => {});
  }
}

/**
 * Marque un lot interrompu comme REPRIS, une fois qu'il a été relancé.
 *
 * Sans cela, l'ancien lot resterait "interrompu" indéfiniment : la relance crée un
 * nouveau lot, et l'ancien ne peut pas être effacé puisqu'il a des données vivantes.
 * Son badge d'alerte ne s'éteindrait jamais - et un badge permanent cesse d'être lu.
 */
router.post("/:id/marquer-repris", authenticateAdmin, async (req, res) => {
  try {
    const { data: job } = await supabase.from("imports")
      .select("id, lance_par_id").eq("id", req.params.id).maybeSingle();
    if (!job) return res.status(404).json({ error: "Import introuvable" });
    if (!voitTout(req) && job.lance_par_id !== req.profil?.id) {
      return res.status(403).json({ error: "Cet import a été lancé par quelqu'un d'autre" });
    }
    const { error } = await supabase.from("imports")
      .update({ statut: "repris" }).eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Historique - pour retrouver, relancer ou annuler un lot après coup. */
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    let q = supabase.from("imports")
      .select("id, type, fichier_nom, lance_par_id, lance_par_nom, nb_lignes, nb_ok, nb_erreur, nb_ignore, statut, created_at, termine_at, annule_at, annule_par_nom")
      .order("created_at", { ascending: false })
      .limit(Math.min(Number(req.query.limit) || 30, 100));
    if (req.query.type) q = q.eq("type", req.query.type);
    // Chacune ne voit que ses propres imports, sauf les rôles à vue totale.
    if (!voitTout(req)) q = q.eq("lance_par_id", req.profil?.id || "");
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ imports: data || [], vueTotale: voitTout(req) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Détail d'un import - inclut les lignes source, nécessaires pour le relancer. */
router.get("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("imports").select("*").eq("id", req.params.id).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Import introuvable" });
    if (!voitTout(req) && data.lance_par_id !== req.profil?.id) {
      return res.status(403).json({ error: "Cet import a été lancé par quelqu'un d'autre" });
    }
    res.json({ import: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Annule un import : supprime tout ce que CE lot a créé, et rien d'autre.
 * Sûr par construction - le filtre porte sur `import_id`, estampillé à la
 * création : rien de saisi manuellement ne peut être atteint.
 */
router.post("/:id/annuler", authenticateAdmin, async (req, res) => {
  try {
    const importId = req.params.id;
    const { data: job } = await supabase.from("imports").select("id, statut, lance_par_id").eq("id", importId).maybeSingle();
    if (!job) return res.status(404).json({ error: "Import introuvable" });
    // Chacune peut défaire SON import - c'est le pendant naturel du droit de le créer.
    // Annuler celui d'une autre reste réservé aux rôles à vue totale.
    if (!voitTout(req) && job.lance_par_id !== req.profil?.id) {
      return res.status(403).json({ error: "Cet import a été lancé par quelqu'un d'autre - vous ne pouvez pas l'annuler" });
    }
    if (job.statut === "annule") return res.status(409).json({ error: "Cet import est déjà annulé" });

    // Les comptes d'accès doivent être relevés AVANT la suppression des lignes.
    const { data: comptes } = await supabase.from("utilisateurs").select("id").eq("import_id", importId);
    const userIds = (comptes || []).map((u) => u.id);

    const supprime = {};
    for (const table of ["groupes_apprenants", "paiements_parcours", "assignations_parcours", "groupes"]) {
      const { count, error } = await supabase.from(table).delete({ count: "exact" }).eq("import_id", importId);
      if (error) return res.status(500).json({ error: `${table} : ${error.message}` });
      supprime[table] = count || 0;
    }

    let comptesSupprimes = 0;
    for (const id of userIds) {
      await supabase.from("utilisateurs").delete().eq("id", id);
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (!error) comptesSupprimes++;
    }
    supprime.comptes = comptesSupprimes;

    await supabase.from("imports").update({
      statut: "annule",
      annule_at: new Date().toISOString(),
      annule_par_nom: [req.profil?.prenom, req.profil?.nom].filter(Boolean).join(" ") || null,
    }).eq("id", importId);

    res.json({ ok: true, supprime });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Efface une entrée du JOURNAL - pas les données importées.
 *
 * Sert à nettoyer la liste des lots ratés ou déjà annulés, qui n'ont plus d'intérêt.
 *
 * Refusé tant que le lot a encore des données vivantes : la clé étrangère est en
 * ON DELETE SET NULL, donc supprimer l'entrée mettrait `import_id` à null sur tout
 * ce que le lot a créé - les lignes deviendraient définitivement inatteignables par
 * "Annuler cet import", sans plus aucun moyen de les retrouver en bloc. Il faut donc
 * annuler d'abord, effacer ensuite.
 */
router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data: job } = await supabase.from("imports")
      .select("id, statut, nb_ok, lance_par_id, fichier_nom").eq("id", req.params.id).maybeSingle();
    if (!job) return res.status(404).json({ error: "Import introuvable" });

    if (!voitTout(req) && job.lance_par_id !== req.profil?.id) {
      return res.status(403).json({ error: "Cet import a été lancé par quelqu'un d'autre" });
    }

    const aDesDonneesVivantes = job.statut !== "annule" && (job.nb_ok || 0) > 0;
    if (aDesDonneesVivantes) {
      return res.status(409).json({
        error: `Cet import a créé ${job.nb_ok} ligne(s) encore présentes en base. `
          + "Annulez-le d'abord - sinon ces données deviendraient impossibles à retrouver en bloc.",
      });
    }

    const { error } = await supabase.from("imports").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
