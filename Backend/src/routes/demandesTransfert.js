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

const ROLES_ONBOARDING = ["onboarding", "admin_onboarding", "super_admin", "admin"];
const ROLES_PLACEMENT  = ["placement_test", "admin_placement", "super_admin", "admin"];
const ROLES_COACH      = ["coach", "professeur_titulaire", "professeur_remplacant"];

const estOnboarding = (r) => ROLES_ONBOARDING.includes(r);
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
      .from("groupes").select("id, nom, niveau, coach_id").eq("id", ga.groupe_id).maybeSingle();

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

    const { data: demande, error } = await supabase
      .from("demandes_transfert").insert(ligne).select().single();
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
    // Un coach ne voit QUE les demandes de ses propres classes : celles des collègues ne le
    // regardent pas, et son écran n'a pas à lui montrer des dossiers sur lesquels il ne peut rien.
    if (estCoach(req.role)) q = q.eq("coach_id", req.profil.id);

    const { data, error } = await q;
    if (error) {
      if (tableAbsente(error)) return res.json({ demandes: [], non_installe: true });
      throw error;
    }

    res.json({
      demandes: data || [],
      motifs: MOTIFS_TRANSFERT,
      // L'écran sait ainsi quels boutons présenter, sans dupliquer la matrice des rôles.
      je_peux_reaffecter: estOnboarding(req.role),
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
    }

    /* ── L'onboarding referme le dossier ──────────────────────────────────────── */
    if (req.body.statut === "traitee") {
      if (!estOnboarding(req.role)) {
        return res.status(403).json({ error: "Seule l'équipe onboarding peut réaffecter un apprenant." });
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
      maj.statut          = "traitee";
      maj.groupe_cible_id = req.body.groupe_cible_id || null;
      maj.traite_le       = new Date().toISOString();
      maj.traite_par      = req.profil.id;
      action = "traitee";
    }

    /* ── Refus ────────────────────────────────────────────────────────────────── */
    if (req.body.statut === "refusee") {
      if (!estOnboarding(req.role)) {
        return res.status(403).json({ error: "Seule l'équipe onboarding peut refuser une demande." });
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
      const cible = action === "test" ? [demande.coach_id, demande.cree_par] : [demande.coach_id, demande.cree_par];
      const ids = [...new Set(cible.filter(Boolean))];
      if (ids.length && messages[action]) {
        await notifyUsers(ids, { type: "demande_transfert", ...messages[action], meta: { demande_id: demande.id } })
          .catch(e => console.warn("[demandes-transfert PATCH] notification:", e.message));
      }
    })();

    res.json({ demande: data });
  } catch (err) {
    console.error("[demandes-transfert PATCH]", err.message || err);
    res.status(500).json({ error: "Mise à jour impossible" });
  }
});

export default router;
