import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();

/**
 * Les chiffres du tableau de bord marketing.
 *
 * Tout vient de données RÉELLES - `page_views`, `sondages`, `campagne_*`, `newsletter`,
 * `commandes`. Rien n'est simulé : un tableau de bord qui affiche des valeurs inventées
 * est pire qu'un tableau vide, parce qu'on y prend des décisions.
 *
 * Une seule route et non huit : l'écran les affiche ensemble, et huit allers-retours
 * coûteraient huit fois la latence pour un seul affichage.
 */

const ROLES_MARKETING = ["marketing", "super_admin", "admin", "manager"];
const requireMarketing = (req, res, next) => {
  if (!ROLES_MARKETING.includes(req.role)) {
    return res.status(403).json({ error: "Accès réservé à l'équipe marketing" });
  }
  next();
};

/** Une requête qui échoue ne doit pas emporter tout le tableau : elle rend une valeur vide. */
const sur = (p, defaut) => p.then(r => (r?.error ? defaut : r), () => defaut);

const jourISO = (d) => d.toISOString().slice(0, 10);

router.get("/kpis", authenticateAdmin, requireMarketing, async (req, res) => {
  try {
    const jours = Math.min(365, Math.max(7, Number(req.query.jours) || 30));
    const depuis = new Date(Date.now() - jours * 864e5);
    const precedent = new Date(Date.now() - 2 * jours * 864e5);
    const depuisISO = depuis.toISOString();

    const [
      vues, vuesAvant, sondagesR, reponsesR, visitesR, diffusionsR,
      formulairesR, nlAbonnes, nlCampagnes, commandesR, contenuR,
    ] = await Promise.all([
      sur(supabase.from("page_views").select("path, label, referrer, session_id, duration_ms, created_at")
        .gte("created_at", depuisISO).limit(20000), { data: [] }),
      // La période précédente de même durée : un chiffre seul ne dit pas s'il monte.
      sur(supabase.from("page_views").select("session_id", { count: "exact", head: true })
        .gte("created_at", precedent.toISOString()).lt("created_at", depuisISO), { count: 0 }),
      sur(supabase.from("sondages").select("source, utm_source, utm_medium, utm_campaign, created_at")
        .gte("created_at", depuisISO), { data: [] }),
      sur(supabase.from("campagne_reponses").select("id, statut, consentement, diffusion_id, assignation_id, created_at"), { data: [] }),
      sur(supabase.from("campagne_visites").select("id, diffusion_id, visite_le"), { data: [] }),
      sur(supabase.from("campagne_diffusions").select("id, libelle, code, support, format, nb_visites, actif"), { data: [] }),
      sur(supabase.from("campagne_formulaires").select("id, titre, statut"), { data: [] }),
      sur(supabase.from("newsletter").select("*", { count: "exact", head: true }), { count: 0 }),
      sur(supabase.from("newsletter_campagnes").select("id, sujet, statut, total_destinataires, date_envoi")
        .order("created_at", { ascending: false }).limit(60), { data: [] }),
      sur(supabase.from("commandes").select("total, statut, paye, created_at").gte("created_at", depuisISO), { data: [] }),
      sur(Promise.all([
        supabase.from("carousel_slides").select("*", { count: "exact", head: true }).eq("actif", true),
        supabase.from("partenaires").select("*", { count: "exact", head: true }),
        supabase.from("equipe_photos").select("*", { count: "exact", head: true }),
      ]).then(([a, b, c]) => ({ data: { slides: a.count || 0, partenaires: b.count || 0, equipe: c.count || 0 } })),
        { data: { slides: 0, partenaires: 0, equipe: 0 } }),
    ]);

    const pv = vues.data || [];

    /* ── TRAFIC ─────────────────────────────────────────────── */
    // Une SESSION et non une vue : la même personne qui ouvre six pages n'est pas six
    // visiteurs, et confondre les deux gonfle tous les taux qui en découlent.
    const sessions = new Set(pv.map(v => v.session_id).filter(Boolean));
    const sessionsAvant = new Set();   // le comptage exact coûterait une seconde requête lourde
    /* La MÉDIANE et non la moyenne. Un onglet laissé ouvert toute la nuit compte comme
       huit heures sur une page : la moyenne mesurée ici donnait 35 minutes par page, ce
       qu'aucun visiteur ne fait. La médiane ignore ces valeurs extrêmes.
       Les durées nulles sont écartées : elles signalent une mesure absente, pas une
       visite éclair. */
    const durees = pv.map(v => v.duration_ms).filter(d => d > 0).sort((a, b) => a - b);
    const dureeMed = durees.length ? Math.round(durees[Math.floor(durees.length / 2)] / 1000) : 0;

    const parPage = {};
    pv.forEach(v => {
      const cle = v.label || v.path || "-";
      (parPage[cle] ||= { page: cle, vues: 0, sessions: new Set() });
      parPage[cle].vues++;
      if (v.session_id) parPage[cle].sessions.add(v.session_id);
    });
    const topPages = Object.values(parPage)
      .map(p => ({ page: p.page, vues: p.vues, visiteurs: p.sessions.size }))
      .sort((a, b) => b.vues - a.vues).slice(0, 8);

    // Les référents INTERNES ne disent rien sur l'acquisition : on ne garde que ce qui
    // vient d'ailleurs, et on regroupe par domaine plutôt que par URL complète.
    const parReferent = {};
    pv.forEach(v => {
      if (!v.referrer) return;
      let hote;
      try { hote = new URL(v.referrer).hostname.replace(/^www\./, ""); } catch { return; }
      if (/localhost|binniesenglish|betacademy/.test(hote)) return;
      parReferent[hote] = (parReferent[hote] || 0) + 1;
    });
    const topReferents = Object.entries(parReferent)
      .map(([source, vues]) => ({ source, vues }))
      .sort((a, b) => b.vues - a.vues).slice(0, 6);

    // La courbe, jour par jour, sans trou : un jour sans visite doit valoir 0 et non
    // disparaître, sinon la courbe ment sur la régularité.
    const parJour = {};
    for (let i = jours - 1; i >= 0; i--) parJour[jourISO(new Date(Date.now() - i * 864e5))] = { vues: 0, sessions: new Set() };
    pv.forEach(v => {
      const j = String(v.created_at).slice(0, 10);
      if (parJour[j]) { parJour[j].vues++; if (v.session_id) parJour[j].sessions.add(v.session_id); }
    });
    const courbe = Object.entries(parJour).map(([jour, d]) => ({ jour, vues: d.vues, visiteurs: d.sessions.size }));

    /* ── COLLECTE PAR QR ────────────────────────────────────── */
    const reps = (reponsesR.data || []).filter(r => new Date(r.created_at) >= depuis);
    const visites = (visitesR.data || []).filter(v => new Date(v.visite_le) >= depuis);
    const diffs = diffusionsR.data || [];

    const parDiff = {};
    reps.forEach(r => { if (r.diffusion_id) (parDiff[r.diffusion_id] ||= { reponses: 0, converties: 0 }).reponses++; });
    reps.forEach(r => { if (r.diffusion_id && r.assignation_id) parDiff[r.diffusion_id].converties++; });
    const visitesParDiff = {};
    visites.forEach(v => { if (v.diffusion_id) visitesParDiff[v.diffusion_id] = (visitesParDiff[v.diffusion_id] || 0) + 1; });

    const canaux = diffs.map(d => {
      const vd = visitesParDiff[d.id] || 0;
      const rd = parDiff[d.id]?.reponses || 0;
      return {
        id: d.id, libelle: d.libelle, code: d.code, support: d.support, format: d.format, actif: d.actif,
        visites: vd, reponses: rd, converties: parDiff[d.id]?.converties || 0,
        // Le taux n'a de sens qu'avec des visites : 0/0 n'est pas 0 %, c'est « on ne sait pas ».
        taux: vd ? Math.round((rd / vd) * 100) : null,
      };
    }).sort((a, b) => b.reponses - a.reponses);

    /* ── NEWSLETTER ─────────────────────────────────────────── */
    const nlEnvoyees = (nlCampagnes.data || []).filter(c => c.statut === "envoye" || c.statut === "envoyee");
    const nlDestinataires = nlEnvoyees.reduce((s, c) => s + (c.total_destinataires || 0), 0);

    /* ── BOUTIQUE ───────────────────────────────────────────── */
    const cmd = commandesR.data || [];
    const caPaye = cmd.filter(c => c.paye).reduce((s, c) => s + Number(c.total || 0), 0);

    /* ── ACQUISITION ────────────────────────────────────────── */
    const parSource = {};
    (sondagesR.data || []).forEach(s => {
      const cle = s.utm_source || s.source || "direct";
      parSource[cle] = (parSource[cle] || 0) + 1;
    });
    const sources = Object.entries(parSource).map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n).slice(0, 8);

    res.json({
      periode: { jours, depuis: jourISO(depuis) },
      trafic: {
        vues: pv.length,
        visiteurs: sessions.size,
        visiteurs_precedent: sessionsAvant.size || null,
        vues_precedent: vuesAvant.count || 0,
        duree_mediane_s: dureeMed,
        pages_par_visite: sessions.size ? Math.round((pv.length / sessions.size) * 10) / 10 : 0,
        courbe, top_pages: topPages, top_referents: topReferents,
      },
      collecte: {
        formulaires: (formulairesR.data || []).length,
        formulaires_publies: (formulairesR.data || []).filter(f => f.statut === "publie").length,
        visites: visites.length,
        reponses: reps.length,
        nouvelles: reps.filter(r => r.statut === "nouvelle").length,
        converties: reps.filter(r => r.assignation_id).length,
        avec_consentement: reps.filter(r => r.consentement).length,
        taux_conversion: visites.length ? Math.round((reps.length / visites.length) * 100) : null,
        canaux,
      },
      newsletter: {
        abonnes: nlAbonnes.count || 0,
        campagnes_envoyees: nlEnvoyees.length,
        destinataires_total: nlDestinataires,
        derniere: nlEnvoyees[0]
          ? { sujet: nlEnvoyees[0].sujet, date: nlEnvoyees[0].date_envoi, destinataires: nlEnvoyees[0].total_destinataires }
          : null,
      },
      boutique: {
        commandes: cmd.length,
        payees: cmd.filter(c => c.paye).length,
        en_attente: cmd.filter(c => c.statut === "en_attente").length,
        ca_paye: caPaye,
      },
      contenu: contenuR.data,
      acquisition: { sources, total: (sondagesR.data || []).length },
    });
  } catch (err) {
    console.error("[marketing/kpis]", err.message || err);
    res.status(500).json({ error: "Calcul des indicateurs impossible" });
  }
});

export default router;
