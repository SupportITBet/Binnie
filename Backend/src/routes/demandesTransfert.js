import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { notifyUsers } from "../services/notifyRole.js";
import { logAudit } from "../middlewares/logAudit.js";

const router = express.Router();

/**
 * DEMANDES DE TRANSFERT — un dossier qui traverse trois métiers.
 *
 * Le coach constate qu'un apprenant n'est plus à sa place et le signale. L'agent placement
 * test le fait passer et rend un niveau. L'onboarding, et lui seul, exécute le changement de
 * classe. Aucun des trois ne peut mener le dossier seul, et c'est ce passage de relais que
 * ces routes rendent visible - jusqu'ici il se faisait de vive voix, ou pas du tout.
 *
 * LE NIVEAU COMMANDE LA CLASSE CIBLE. D'où le verrou : tant que le test n'est pas revenu, la
 * réaffectation reste fermée. Réaffecter avant, ce serait replacer l'apprenant au jugé -
 * exactement ce que la demande cherchait à corriger.
 *
 * CE QUI SE REMPLIT TOUT SEUL. Le changement de classe passe ensuite par la route de
 * transfert existante, qui pose `statut = transfere`, `date_retrait` et le motif sur
 * l'ancienne inscription. L'archive du coach d'origine - le classeur « LEARNERS' PROFILE » -
 * en est dérivée : rien à écrire de plus ici.
 */

/* Les motifs, en liste fermée. Le texte libre vit dans `detail`.
   POURQUOI UNE LISTE : elle alimente la colonne REASON FOR STOPPING du classeur des coachs,
   qui doit rester dénombrable - en texte libre, « niveau trop bas » et « pas le bon niveau »
   deviennent deux motifs distincts. Et c'est elle qui dira, plus tard, quels motifs
   n'exigent pas de test de niveau. */
export const MOTIFS_TRANSFERT = {
  niveau_trop_eleve:  "Niveau de la classe trop élevé pour l'apprenant",
  niveau_trop_bas:    "Niveau de la classe trop bas pour l'apprenant",
  rythme_inadapte:    "Rythme de la classe inadapté",
  horaire:            "Horaires qui ne conviennent plus",
  relation_groupe:    "Difficulté d'intégration dans le groupe",
  autre:              "Autre (précisé par le coach)",
};

const STATUTS = ["en_attente_test", "test_fait", "traitee", "refusee"];

/* LES ASSISTANTES PRÉSENTIEL RÉAFFECTENT AUSSI. L'onboarding ne s'occupe que des classes en
   ligne ; en présentiel, c'est la commerciale qui affecte classe et coach. Réserver la
   réaffectation à l'onboarding aurait laissé tous les dossiers présentiel sans personne pour
   les traiter - le coach aurait émis sa demande dans le vide. */
const ROLES_ONBOARDING = ["onboarding", "admin_onboarding", "commercial", "admin_commercial", "super_admin", "admin"];
const ROLES_PLACEMENT  = ["placement_test", "admin_placement", "super_admin", "admin"];
const ROLES_COACH      = ["coach", "professeur_titulaire", "professeur_remplacant"];

const estOnboarding = (r) => ROLES_ONBOARDING.includes(r);
const estCommerciale = (r) => r === "commercial" || r === "admin_commercial";

/**
 * Cette commerciale peut-elle réaffecter ?
 *
 * SEULEMENT SI ELLE EST SUR LE PRÉSENTIEL. En présentiel, l'assistante est son propre
 * onboarding : c'est elle qui affecte classe et coach, personne d'autre ne le fera. En ligne,
 * ce travail revient à l'équipe onboarding - une assistante en ligne qui réaffecterait
 * doublerait leur décision sans qu'ils le sachent.
 *
 * Elle garde l'onglet en LECTURE : elle suit ses apprenants et doit savoir qu'un transfert est
 * demandé pour l'un d'eux. Voir n'est pas décider.
 */
async function canalDeLAssistante(profil) {
  if (!profil?.email) return null;
  const { data } = await supabase
    .from("assistantes").select("type_cours").ilike("email", profil.email).maybeSingle();
  return data?.type_cours || null;   // presentiel | en_ligne | les_deux | null
}

async function commercialePeutReaffecter(profil) {
  const canal = await canalDeLAssistante(profil);
  // `type_cours` absent : on refuse. Un droit d'écriture ne s'accorde pas par défaut.
  return canal === "presentiel" || canal === "les_deux";
}
const estPlacement  = (r) => ROLES_PLACEMENT.includes(r);
const estCoach      = (r) => ROLES_COACH.includes(r);

/** La table peut ne pas exister encore : le SQL est livré à part. */
const tableAbsente = (e) => e?.code === "42P01" || /demandes_transfert/i.test(e?.message || "") && /does not exist/i.test(e?.message || "");

const nomDe = (p) => `${p?.prenom || ""} ${p?.nom || ""}`.trim() || "Un membre de l'équipe";

/* ══════════════════════════════════════════════════════════════
   POST /api/demandes-transfert — le coach émet la demande
══════════════════════════════════════════════════════════════ */
router.post("/", authenticateAdmin, async (req, res) => {
  try {
    const { ga_id, motif, detail, type_demande } = req.body || {};
    if (!ga_id) return res.status(400).json({ error: "L'apprenant concerné est requis." });
    if (!motif || !MOTIFS_TRANSFERT[motif]) {
      return res.status(400).json({ error: "Choisissez un motif dans la liste." });
    }

    const { data: ga } = await supabase
      .from("groupes_apprenants")
      .select("id, groupe_id, apprenant_id, nom_apprenant, prenom_apprenant, email_apprenant, niveau, statut")
      .eq("id", ga_id).maybeSingle();
    if (!ga) return res.status(404).json({ error: "Inscription introuvable." });
    if (ga.statut === "transfere") {
      return res.status(409).json({ error: "Cet apprenant a déjà quitté cette classe." });
    }

    const { data: groupe } = await supabase
      .from("groupes").select("id, nom, niveau, coach_id, type_cours").eq("id", ga.groupe_id).maybeSingle();

    /* UN COACH NE DEMANDE QUE POUR SES PROPRES APPRENANTS. L'onboarding et le placement
       peuvent en émettre une aussi - ils voient des cas que le coach ne voit pas - mais
       personne ne doit pouvoir déplacer l'apprenant d'un collègue. */
    if (estCoach(req.role) && groupe?.coach_id !== req.profil.id) {
      return res.status(403).json({ error: "Cet apprenant n'est pas dans l'une de vos classes." });
    }

    // Une demande déjà ouverte sur la même inscription : on ne crée pas de doublon, la file
    // de l'onboarding se remplirait de dossiers identiques.
    const { data: dejaOuverte } = await supabase
      .from("demandes_transfert").select("id, statut")
      .eq("ga_id", ga_id).in("statut", ["en_attente_test", "test_fait"]).limit(1);
    if (dejaOuverte?.length) {
      return res.status(409).json({
        error: "Une demande est déjà en cours pour cet apprenant.",
        demande_id: dejaOuverte[0].id,
      });
    }

    const ligne = {
      ga_id,
      apprenant_id:     ga.apprenant_id || null,
      nom_apprenant:    ga.nom_apprenant || null,
      prenom_apprenant: ga.prenom_apprenant || null,
      email_apprenant:  ga.email_apprenant || null,
      groupe_id:        ga.groupe_id || null,
      groupe_nom:       groupe?.nom || null,
      niveau_actuel:    ga.niveau || groupe?.niveau || null,
      // Le canal décide de l'équipe qui traitera : en ligne → onboarding, présentiel →
      // assistante du centre. Copié ici car la classe peut changer d'ici le traitement.
      type_cours:       groupe?.type_cours || null,
      coach_id:         groupe?.coach_id || null,
      coach_nom:        null,   // renseigné juste après
      type_demande:     type_demande === "changement_coaching" ? "changement_coaching" : "changement_groupe",
      motif,
      detail:           (detail || "").trim() || null,
      statut:           "en_attente_test",
      cree_par:         req.profil.id,
    };

    if (ligne.coach_id) {
      const { data: c } = await supabase.from("utilisateurs").select("nom, prenom").eq("id", ligne.coach_id).maybeSingle();
      ligne.coach_nom = c ? `${c.prenom || ""} ${c.nom || ""}`.trim() : null;
    }

    /* LE PROFIL DE L'APPRENANT, pour verrouiller le formulaire de test.
       C'est un transfert, pas une première inscription : le profil est déjà connu, et le
       laisser modifiable exposait à ce que l'apprenant le change par inadvertance - le
       formulaire s'ouvre sur « Particulier » présélectionné par défaut.
       On le cherche d'abord par le dossier posé dans `note` (lien direct et fiable), puis
       par e-mail. Si rien ne sort, on laisse `null` : un choix ouvert vaut mieux qu'une
       valeur figée à tort. */
    try {
      let assignationId = null;
      try { assignationId = JSON.parse(ga.note || "{}").assignation_id || null; } catch { /* note libre */ }
      let dossier = null;
      if (assignationId) {
        ({ data: dossier } = await supabase
          .from("assignations_parcours").select("profil_type").eq("id", assignationId).maybeSingle());
      }
      if (!dossier?.profil_type && ligne.email_apprenant) {
        ({ data: dossier } = await supabase
          .from("assignations_parcours").select("profil_type")
          .ilike("prospect_email", ligne.email_apprenant)
          .order("created_at", { ascending: false }).limit(1).maybeSingle());
      }
      if (dossier?.profil_type) ligne.profil_type = dossier.profil_type;
    } catch (e) {
      console.warn("[demandes-transfert POST] profil non résolu:", e.message);
    }

    let { data: demande, error } = await supabase
      .from("demandes_transfert").insert(ligne).select().single();

    // `profil_type` a été ajouté après coup : sur une base où l'ALTER n'a pas encore été
    // joué, on crée la demande sans lui plutôt que de la refuser. Le formulaire de test
    // restera simplement modifiable, ce qui est l'ancien comportement.
    if (error && /profil_type|type_cours/.test(error.message || "")) {
      const { profil_type: _absent, type_cours: _absent2, ...sansProfil } = ligne;
      ({ data: demande, error } = await supabase
        .from("demandes_transfert").insert(sansProfil).select().single());
    }

    if (error) {
      if (tableAbsente(error)) {
        return res.status(503).json({ error: "Les demandes de transfert ne sont pas encore activées sur cette base (Backend/sql/demandes_transfert.sql)." });
      }
      throw error;
    }

    /* PRÉVENIR LES DEUX MÉTIERS D'UN COUP. Le placement test parce que c'est lui qui fait
       avancer le dossier, l'onboarding pour qu'il le voie arriver. Ne prévenir que l'un des
       deux immobiliserait le dossier chez celui qui n'attend rien. */
    (async () => {
      try {
        const { data: destinataires } = await supabase
          .from("utilisateurs").select("id, role")
          .in("role", [...new Set([...ROLES_ONBOARDING, ...ROLES_PLACEMENT])].filter(r => r !== "super_admin" && r !== "admin"))
          .eq("actif", true);
        const apprenant = `${ligne.prenom_apprenant || ""} ${ligne.nom_apprenant || ""}`.trim() || "Un apprenant";
        const pourPlacement = (destinataires || []).filter(u => estPlacement(u.role)).map(u => u.id);
        const pourOnboarding = (destinataires || []).filter(u => estOnboarding(u.role)).map(u => u.id);

        if (pourPlacement.length) {
          await notifyUsers(pourPlacement, {
            type:  "demande_transfert",
            titre: `🧪 Test de niveau à faire passer — ${apprenant}`,
            message: `${nomDe(req.profil)} demande le transfert de ${apprenant} (${ligne.groupe_nom || "classe"}). `
                   + `Motif : ${MOTIFS_TRANSFERT[motif]}. Le dossier attend votre test de niveau pour avancer.`,
            meta: { demande_id: demande.id, ga_id },
          });
        }
        if (pourOnboarding.length) {
          await notifyUsers(pourOnboarding, {
            type:  "demande_transfert",
            titre: `🔄 Nouveau dossier à réaffecter — ${apprenant}`,
            message: `${nomDe(req.profil)} demande le transfert de ${apprenant} (${ligne.groupe_nom || "classe"}). `
                   + `Motif : ${MOTIFS_TRANSFERT[motif]}. La réaffectation sera possible dès que le test de niveau sera passé.`,
            meta: { demande_id: demande.id, ga_id },
          });
        }
      } catch (e) {
        console.warn("[demandes-transfert POST] notification:", e.message);
      }
    })();

    logAudit({
      acteur_id: req.profil.id, acteur_nom: nomDe(req.profil), acteur_email: req.profil.email,
      acteur_role: req.role, action_type: "creation", module: "inscriptions",
      entite_type: "demande_transfert", entite_id: demande.id,
      detail: `Demande de transfert de ${ligne.prenom_apprenant || ""} ${ligne.nom_apprenant || ""} — ${MOTIFS_TRANSFERT[motif]}`,
    }).catch(() => {});

    res.status(201).json({ demande });
  } catch (err) {
    console.error("[demandes-transfert POST]", err.message || err);
    res.status(500).json({ error: "Demande impossible à enregistrer" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/demandes-transfert — la file de travail
══════════════════════════════════════════════════════════════ */
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    let q = supabase.from("demandes_transfert").select("*").order("created_at", { ascending: false });

    if (req.query.statut && STATUTS.includes(req.query.statut)) q = q.eq("statut", req.query.statut);

    /* CHACUN SA FILE. Les classes EN LIGNE relèvent de l'équipe onboarding, le PRÉSENTIEL de
       l'assistante du centre qui y est son propre onboarding. Sans ce partage, les deux
       voyaient les mêmes dossiers et pouvaient traiter celui de l'autre - deux équipes se
       marchant dessus sur les mêmes apprenants, sans le savoir.
       Le placement test, lui, teste TOUT LE MONDE : sa file reste entière.
       `type_cours` nul = demande créée avant cette colonne : montrée aux deux plutôt que
       cachée à tous, un dossier invisible étant pire qu'un dossier vu par le mauvais métier.

       L'HYBRIDE APPARAÎT DANS LES DEUX FILES, et il le faut : une classe hybride se donne au
       centre ET en ligne, les deux équipes la suivent. La demande recopie le `type_cours` de
       la classe (voir plus haut), donc une classe hybride produit une demande « hybride » :
       sans cette liste, le filtre `= en_ligne` l'aurait rendue invisible à l'onboarding comme
       à l'assistante en ligne, et seule la présentiel l'aurait vue - l'inverse du partage
       voulu. Côté présentiel, `neq.en_ligne` la laisse déjà passer.
       QUI VOIT N'EST PAS QUI AGIT : `commercialePeutReaffecter` est inchangé, l'assistante en
       ligne suit ses dossiers sans les réaffecter - c'est l'onboarding qui affecte la classe. */
    const CANAUX_EN_LIGNE = "en_ligne,hybride";
    if (estCommerciale(req.role)) {
      /* Le canal de l'assistante, pas une règle unique : celle du présentiel traite ses
         dossiers, celle du en ligne suit les siens sans pouvoir agir. Lui montrer la file de
         l'autre lui donnerait du travail qui n'est pas le sien - et lui cacherait le sien. */
      const canal = await canalDeLAssistante(req.profil);
      if (canal === "presentiel")     q = q.or("type_cours.neq.en_ligne,type_cours.is.null");
      else if (canal === "en_ligne")  q = q.or(`type_cours.in.(${CANAUX_EN_LIGNE}),type_cours.is.null`);
      // `les_deux` ou canal inconnu : on ne filtre pas, elle suit les deux périmètres.
    } else if (req.role === "onboarding" || req.role === "admin_onboarding") {
      q = q.or(`type_cours.in.(${CANAUX_EN_LIGNE}),type_cours.is.null`);
    }
    // Un coach ne voit QUE les demandes de ses propres classes : celles des collègues ne le
    // regardent pas, et son écran n'a pas à lui montrer des dossiers sur lesquels il ne peut rien.
    if (estCoach(req.role)) q = q.eq("coach_id", req.profil.id);

    let { data, error } = await q;

    /* La colonne `type_cours` est livrée à part : sur une base non migrée, la filtrer ferait
       échouer la requête et viderait l'onglet ENTIER - pas seulement le cloisonnement. On
       rejoue alors sans le partage par canal : chacun revoit tous les dossiers, comme avant.
       Une file trop large se corrige d'un coup d'œil ; une file vide passe pour une panne. */
    if (error && /type_cours/.test(error.message || "")) {
      let sansCanal = supabase.from("demandes_transfert").select("*").order("created_at", { ascending: false });
      if (req.query.statut && STATUTS.includes(req.query.statut)) sansCanal = sansCanal.eq("statut", req.query.statut);
      if (estCoach(req.role)) sansCanal = sansCanal.eq("coach_id", req.profil.id);
      ({ data, error } = await sansCanal);
    }

    if (error) {
      if (tableAbsente(error)) return res.json({ demandes: [], non_installe: true });
      throw error;
    }

    res.json({
      demandes: data || [],
      motifs: MOTIFS_TRANSFERT,
      /* L'écran sait ainsi quels boutons présenter, sans dupliquer la matrice des rôles - et
         sans se tromper : une assistante EN LIGNE voit la file mais ne réaffecte pas, ce que
         son rôle seul ne suffit pas à dire. La réponse du serveur fait foi. */
      je_peux_reaffecter: estCommerciale(req.role)
        ? await commercialePeutReaffecter(req.profil)
        : estOnboarding(req.role),
      je_peux_tester:     estPlacement(req.role),
    });
  } catch (err) {
    console.error("[demandes-transfert GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/demandes-transfert/:id — faire avancer le dossier
══════════════════════════════════════════════════════════════ */
router.patch("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data: demande, error: errLecture } = await supabase
      .from("demandes_transfert").select("*").eq("id", req.params.id).maybeSingle();
    if (errLecture && tableAbsente(errLecture)) {
      return res.status(503).json({ error: "Les demandes de transfert ne sont pas encore activées sur cette base." });
    }
    if (!demande) return res.status(404).json({ error: "Demande introuvable" });
    if (demande.statut === "traitee" || demande.statut === "refusee") {
      return res.status(409).json({ error: "Cette demande est déjà close." });
    }

    const maj = { updated_at: new Date().toISOString() };
    let action = null;

    /* ── Le placement test rend le niveau ─────────────────────────────────────── */
    if (req.body.niveau_obtenu !== undefined) {
      if (!estPlacement(req.role)) {
        return res.status(403).json({ error: "Seul l'agent placement test peut enregistrer le niveau." });
      }
      const niveau = String(req.body.niveau_obtenu || "").trim();
      if (!niveau) return res.status(400).json({ error: "Le niveau obtenu est requis." });
      maj.niveau_obtenu = niveau;
      maj.level_test_id = req.body.level_test_id || null;
      maj.teste_le      = new Date().toISOString();
      maj.teste_par     = req.profil.id;
      maj.statut        = "test_fait";
      action = "test";

      /* UN NIVEAU ÉVALUÉ EN PRÉSENTIEL EST UN TEST, et doit s'enregistrer comme tel.
         Sans cela il ne vivait que sur ce dossier : la fiche de l'apprenant, son espace, les
         exports et l'historique continuaient d'afficher son ancien niveau comme s'il n'avait
         jamais repassé de test - « B1 » seul, là où la réalité est « B1 → C1 ».
         On ne l'écrit QUE si l'agent a saisi le niveau à la main : quand il vient d'un test
         passé en ligne (`level_test_id` fourni), l'enregistrement existe déjà et le dupliquer
         inventerait un second passage. */
      if (demande.email_apprenant) {
        try {
          /* RATTACHER LE TEST À SON DOSSIER. Sans `assignation_id` ni `commercial_id`, le test
             existe sans propriétaire : le dashboard de la commerciale filtre sa liste sur
             `commercial_id`, la ligne partait donc dans « tests sans conseillère assignée » et
             la fiche de l'apprenant restait sur son ancien niveau. Le rapprochement par
             e-mail seul ne suffit pas non plus - un parent et son enfant la partagent.
             La conseillère se lit dans `assistante_id` : la colonne `commercial_id` décrite
             par sql/CONSOLIDATION_assignations_parcours.sql n'existe pas en base, et la
             demander faisait échouer toute la requête - donc le rattachement entier.
             Vaut pour les DEUX voies : le test passé en ligne via le lien du transfert arrive
             lui aussi sans dossier, le lien ne transportant que l'e-mail et l'id de demande. */
          let assignation = null;
          const { data: gaRow } = await supabase
            .from("groupes_apprenants").select("note").eq("id", demande.ga_id).maybeSingle();
          let assignationId = null;
          try { assignationId = JSON.parse(gaRow?.note || "{}").assignation_id || null; } catch { /* note libre */ }
          if (assignationId) {
            ({ data: assignation } = await supabase.from("assignations_parcours")
              .select("id, assistante_id").eq("id", assignationId).maybeSingle());
          }
          if (!assignation) {
            ({ data: assignation } = await supabase.from("assignations_parcours")
              .select("id, assistante_id").ilike("prospect_email", demande.email_apprenant)
              .order("created_at", { ascending: false }).limit(1).maybeSingle());
          }

          if (req.body.level_test_id) {
            /* Le test existe déjà (passé en ligne) : le dupliquer inventerait un second
               passage. On se contente de lui poser le dossier qui lui manque. */
            if (assignation?.id) {
              await supabase.from("level_test_results")
                .update({ assignation_id: assignation.id, commercial_id: assignation.assistante_id || null })
                .eq("id", req.body.level_test_id).is("assignation_id", null);
            }
          } else {
            /* UN NIVEAU ÉVALUÉ EN PRÉSENTIEL EST UN TEST, et doit s'enregistrer comme tel.
               Sans cela il ne vivait que sur ce dossier : la fiche de l'apprenant, son espace,
               les exports et l'historique continuaient d'afficher son ancien niveau comme s'il
               n'avait jamais repassé de test - « B1 » seul, là où la réalité est « B1 → C1 ». */
            await supabase.from("level_test_results").insert({
              fullname:     [demande.prenom_apprenant, demande.nom_apprenant].filter(Boolean).join(" ") || null,
              email:        demande.email_apprenant,
              assignation_id: assignation?.id || null,
              commercial_id:  assignation?.assistante_id || null,
              level:        niveau,
              source:       "oral",            // évalué par l'agent, pas passé en ligne
              format_test:  "oral",
              correction_statut: "manuelle",
              notes_oral:   `Évaluation lors d'une demande de transfert — ${MOTIFS_TRANSFERT[demande.motif] || demande.motif}`,
              submitted_at: new Date().toISOString(),
            });
          }
        } catch (e) {
          // Non bloquant : le niveau est porté par le dossier, qui suffit à débloquer la
          // réaffectation. L'historique sera simplement incomplet, pas le circuit.
          console.warn("[demandes-transfert PATCH] test non rattaché:", e.message);
        }
      }
    }

    /* ── L'onboarding referme le dossier ──────────────────────────────────────── */
    if (req.body.statut === "traitee") {
      if (!estOnboarding(req.role)) {
        return res.status(403).json({ error: "Seule l'équipe onboarding peut réaffecter un apprenant." });
      }
      if (estCommerciale(req.role) && !(await commercialePeutReaffecter(req.profil))) {
        return res.status(403).json({
          error: "Les classes en ligne sont réaffectées par l'équipe onboarding. "
               + "Vous suivez le dossier, mais le changement de classe ne vous revient pas.",
        });
      }
      /* LE VERROU. Le niveau détermine la classe cible : refermer le dossier sans lui, ce
         serait replacer l'apprenant au jugé, et la demande n'aurait servi à rien. L'écran
         grise déjà le bouton ; on le refuse aussi ici, car un bouton grisé n'est pas un droit
         retiré. */
      if (demande.statut !== "test_fait") {
        return res.status(409).json({
          error: "Le test de niveau n'a pas encore été passé : la réaffectation n'est pas possible.",
          en_attente_test: true,
        });
      }
      /* PAS DE DOSSIER CLOS SANS CLASSE D'ARRIVÉE. « Réaffecté » veut dire que l'apprenant est
         quelque part : sans `groupe_cible_id`, le dossier quittait la file alors que personne
         n'avait bougé, et l'apprenant restait dans la classe qu'il devait justement quitter -
         une disparition silencieuse, pire que l'absence de bouton. C'est arrivé.
         L'écran demande désormais la classe avant d'appeler ; on l'exige aussi ici, car un
         écran qui pose la question n'est pas une garantie que la réponse arrive. */
      if (!req.body.groupe_cible_id) {
        return res.status(400).json({
          error: "Indiquez la classe d'arrivée : un dossier ne peut pas être marqué réaffecté sans elle.",
        });
      }
      maj.statut          = "traitee";
      maj.groupe_cible_id = req.body.groupe_cible_id;
      maj.traite_le       = new Date().toISOString();
      maj.traite_par      = req.profil.id;
      action = "traitee";

      /* LE NIVEAU DU TEST DEVIENT CELUI DE L'APPRENANT, et l'ancien est conservé à côté.
         Sans cela, le test aurait servi à choisir la classe puis aurait été oublié : la fiche
         de l'apprenant aurait continué d'afficher le niveau qui justement ne lui convenait
         pas. Non bloquant - la réaffectation est l'acte principal, et un échec ici ne doit pas
         l'annuler ; le niveau reste alors lisible sur le dossier. */
      if (demande.niveau_obtenu && demande.ga_id) {
        try {
          const { data: gaAvant } = await supabase
            .from("groupes_apprenants")
            .select("niveau, apprenant_id, email_apprenant, note").eq("id", demande.ga_id).maybeSingle();

          /* SUR L'INSCRIPTION OÙ IL EST MAINTENANT, PAS SUR CELLE QU'IL VIENT DE QUITTER.
             Le transfert ne modifie pas la ligne existante : il la ferme et en crée une neuve
             dans la classe d'arrivée, en y RECOPIANT l'ancien niveau. Écrire sur `demande.ga_id`
             mettait donc à jour une ligne close que plus personne ne lit, pendant que la
             nouvelle gardait le niveau périmé - l'apprenant s'affichait en C1 au milieu d'une
             classe de B2, alors même que son test venait de dire B2. */
          let cible = demande.ga_id;
          if (req.body.groupe_cible_id) {
            let q = supabase.from("groupes_apprenants")
              .select("id, niveau").eq("groupe_id", req.body.groupe_cible_id).eq("statut", "actif")
              .order("date_ajout", { ascending: false }).limit(1);
            q = gaAvant?.apprenant_id
              ? q.eq("apprenant_id", gaAvant.apprenant_id)
              : q.ilike("email_apprenant", gaAvant?.email_apprenant || "");
            const { data: nouvelle } = await q.maybeSingle();
            if (nouvelle?.id) cible = nouvelle.id;
          }

          const ancien = (gaAvant?.niveau || "").toUpperCase();
          if (ancien !== demande.niveau_obtenu.toUpperCase()) {
            const { error: errNiveau } = await supabase.from("groupes_apprenants").update({
              niveau:           demande.niveau_obtenu,
              niveau_precedent: gaAvant?.niveau || null,
              niveau_change_le: new Date().toISOString(),
            }).eq("id", cible);
            // La migration peut ne pas être jouée : on écrit au moins le niveau.
            if (errNiveau && /niveau_precedent|niveau_change_le/.test(errNiveau.message || "")) {
              await supabase.from("groupes_apprenants")
                .update({ niveau: demande.niveau_obtenu }).eq("id", cible);
            }

            /* LE DOSSIER COMMERCIAL AUSSI. « Le niveau de l'apprenant » s'écrit à deux endroits :
               sur son inscription en classe (`groupes_apprenants.niveau`) et sur son dossier
               (`assignations_parcours.niveau_client`). Les fiches de la commerciale et du
               conseiller pédagogique lisent le SECOND. Ne mettre à jour que le premier laissait
               donc l'apprenant affiché à son ancien niveau là où on le consulte le plus -
               « A2 » sur sa fiche alors qu'il venait de passer B1. */
            try {
              let assignationId = null;
              try { assignationId = JSON.parse(gaAvant?.note || "{}").assignation_id || null; } catch { /* note libre */ }
              let maj = null;
              if (assignationId) {
                ({ data: maj } = await supabase.from("assignations_parcours")
                  .update({ niveau_client: demande.niveau_obtenu }).eq("id", assignationId).select("id"));
              }
              if (!maj?.length && gaAvant?.email_apprenant) {
                await supabase.from("assignations_parcours")
                  .update({ niveau_client: demande.niveau_obtenu })
                  .ilike("prospect_email", gaAvant.email_apprenant);
              }
            } catch (e) {
              console.warn("[demandes-transfert PATCH] niveau_client non mis à jour:", e.message);
            }
          }
        } catch (e) {
          console.warn("[demandes-transfert PATCH] report du niveau:", e.message);
        }
      }
    }

    /* ── Refus ────────────────────────────────────────────────────────────────── */
    if (req.body.statut === "refusee") {
      if (!estOnboarding(req.role)) {
        return res.status(403).json({ error: "Seule l'équipe onboarding peut refuser une demande." });
      }
      if (estCommerciale(req.role) && !(await commercialePeutReaffecter(req.profil))) {
        return res.status(403).json({
          error: "Les classes en ligne sont réaffectées par l'équipe onboarding. "
               + "Vous suivez le dossier, mais le changement de classe ne vous revient pas.",
        });
      }
      if (!String(req.body.motif_refus || "").trim()) {
        // Refuser sans dire pourquoi laisserait le coach sans réponse, et il réémettrait
        // la même demande la semaine suivante.
        return res.status(400).json({ error: "Indiquez le motif du refus : le coach doit savoir pourquoi." });
      }
      maj.statut      = "refusee";
      maj.motif_refus = String(req.body.motif_refus).trim();
      maj.traite_le   = new Date().toISOString();
      maj.traite_par  = req.profil.id;
      action = "refusee";
    }

    if (!action) return res.status(400).json({ error: "Aucune modification demandée." });

    const { data, error } = await supabase
      .from("demandes_transfert").update(maj).eq("id", demande.id).select().single();
    if (error) throw error;

    /* Tenir le coach au courant à chaque étape : c'est lui qui a signalé le cas, et il perdait
       le dossier de vue dès qu'il l'avait émis. */
    (async () => {
      const apprenant = `${demande.prenom_apprenant || ""} ${demande.nom_apprenant || ""}`.trim() || "votre apprenant";
      const messages = {
        test:    { titre: `🧪 Test de niveau passé — ${apprenant}`,
                   message: `Le test de ${apprenant} rend le niveau ${maj.niveau_obtenu}. L'onboarding peut maintenant procéder à la réaffectation.` },
        traitee: { titre: `✅ Transfert effectué — ${apprenant}`,
                   message: `${nomDe(req.profil)} a réaffecté ${apprenant}. L'apprenant apparaît désormais dans votre archive, avec sa date de sortie et le motif.` },
        refusee: { titre: `↩️ Demande de transfert refusée — ${apprenant}`,
                   message: `${nomDe(req.profil)} n'a pas donné suite à votre demande concernant ${apprenant}. Motif : ${maj.motif_refus}` },
      };
      const ids = [...new Set([demande.coach_id, demande.cree_par].filter(Boolean))];
      if (ids.length && messages[action]) {
        await notifyUsers(ids, { type: "demande_transfert", ...messages[action], meta: { demande_id: demande.id } })
          .catch(e => console.warn("[demandes-transfert PATCH] notification:", e.message));
      }

      /* LE RÉSULTAT DU TEST VA AUSSI À CEUX QUI RÉAFFECTENT. C'est le moment où le dossier
         devient actionnable pour eux : sans cette notification, il resterait à attendre dans
         l'onglet que quelqu'un pense à l'ouvrir. On prévient l'onboarding ET les assistantes
         présentiel, puisque les deux réaffectent selon le type de classe. */
      if (action === "test") {
        try {
          const { data: reaffecteurs } = await supabase
            .from("utilisateurs").select("id")
            .in("role", ROLES_ONBOARDING.filter(r => r !== "super_admin" && r !== "admin"))
            .eq("actif", true);
          const pour = (reaffecteurs || []).map(u => u.id).filter(id => !ids.includes(id));
          if (pour.length) {
            await notifyUsers(pour, {
              type:  "demande_transfert",
              titre: `✅ Niveau connu — ${apprenant} peut être réaffecté`,
              message: `Le test de ${apprenant} rend le niveau ${maj.niveau_obtenu}`
                     + `${demande.groupe_nom ? ` (actuellement en ${demande.groupe_nom})` : ""}. `
                     + `Le dossier est prêt dans l'onglet « Dossiers à réaffecter ».`,
              meta: { demande_id: demande.id, niveau: maj.niveau_obtenu },
            });
          }
        } catch (e) {
          console.warn("[demandes-transfert PATCH] notification réaffecteurs:", e.message);
        }
      }
    })();

    res.json({ demande: data });
  } catch (err) {
    console.error("[demandes-transfert PATCH]", err.message || err);
    res.status(500).json({ error: "Mise à jour impossible" });
  }
});

export default router;
