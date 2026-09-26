import express from "express";
import cors from "cors";
import testRoutes from "./routes/testRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import levelTestRoutes  from "./routes/levelTest.js";
import levelTestsRouter from "./routes/levelTests.js";
import levelTestAttemptRouter from "./routes/levelTestAttempt.js";
import devisRouter        from "./routes/devis.js";
import contactRouter      from "./routes/contact.js";
import entrepriseRouter   from "./routes/entreprise.js";
import leadsRouter        from "./routes/leads.js";
import inscriptionsRouter from "./routes/inscriptions.js";
import simulateurRouter   from "./routes/simulateur.js";
import newsletterRoutes   from "./routes/newsletter.js";
import adminRoutes        from "./routes/adminRoutes.js";
import uploadRoutes       from "./routes/uploadRoutes.js";
import paiementsRouter    from "./routes/paiements.js";
import jobsPaiementsRouter from "./routes/jobsPaiements.js";
import badgesFideliteRouter from "./routes/badgesFidelite.js";
import jobsBadgesFideliteRouter from "./routes/jobsBadgesFidelite.js";
import jobsNewsletterProgrammeeRouter from "./routes/jobsNewsletterProgrammee.js";
import jobsRappelsSeancesRouter from "./routes/jobsRappelsSeances.js";
import sondageRouter      from "./routes/sondage.js";
import coachsRouter       from "./routes/coachs.js";
import messagesRouter     from "./routes/messages.js";
import centresRouter      from "./routes/centres.js";
import blogRouter         from "./routes/blog.js";
import marketingRouter    from "./routes/marketing.js";
import temoignagesRouter  from "./routes/temoignages.js";
import equipePhotosRouter from "./routes/equipePhotos.js";
import partenairesRouter  from "./routes/partenaires.js";
import boutiqueRouter     from "./routes/boutique.js";
import parcoursRouter     from "./routes/parcours.js";
import importsRouter      from "./routes/imports.js";
import corporateRouter    from "./routes/corporate.js";
import comptabiliteRouter from "./routes/comptabilite.js";
import comptabiliteGeneraleRouter from "./routes/comptabiliteGenerale.js";
import comptabiliteTvaRouter from "./routes/comptabiliteTva.js";
import comptabiliteImmobilisationsRouter from "./routes/comptabiliteImmobilisations.js";
import comptabiliteRrdBcBacnRouter from "./routes/comptabiliteRrdBcBacn.js";
import dashComptabiliteRouter from "./routes/dashComptabilite.js";
import dashComptabiliteGeneraleRouter from "./routes/dashComptabiliteGenerale.js";
import dashComptabiliteTvaRouter from "./routes/dashComptabiliteTva.js";
import dashComptabiliteImmobilisationsRouter from "./routes/dashComptabiliteImmobilisations.js";
import dashComptabiliteRrdBcBacnRouter from "./routes/dashComptabiliteRrdBcBacn.js";
import marqueeRouter      from "./routes/marquee.js";
import codesPromoRouter   from "./routes/codesPromo.js";
import avisRouter         from "./routes/avis.js";
import groupesRouter      from "./routes/groupes.js";
import contratsPrivesRouter from "./routes/contratsPrives.js";
import plaintesRouter       from "./routes/plaintes.js";
import ticketsRouter        from "./routes/tickets.js";
import configContactRouter  from "./routes/configContact.js";
import accessGateRouter     from "./routes/accessGate.js";
import configFooterElearningRouter from "./routes/configFooterElearning.js";
import configCompetencesElearningRouter from "./routes/configCompetencesElearning.js";
import gamificationCoachRouter from "./routes/gamificationCoach.js";
import gamificationCoachDashRouter from "./routes/gamificationCoachDash.js";
import packagesCommerciauxRouter from "./routes/packagesCommerciaux.js";
import faqRouter             from "./routes/faq.js";
import carouselRouter        from "./routes/carousel.js";
import offreMediaRouter      from "./routes/offreMedia.js";
// import cinetpayRouter        from "./routes/cinetpay.js"; // DÉSACTIVÉ - remplacé par TouchPoint (voir touchpoint.js)
import touchpointRouter      from "./routes/touchpoint.js";
import auditRouter           from "./routes/audit.js";
import apprenantRouter       from "./routes/apprenants.js";
import notificationsRouter   from "./routes/notifications.js";
import seancesPriveesRouter  from "./routes/seancesPrivees.js";
import presencesPriveesRouter from "./routes/presencesPrivees.js";
import fichiersPrivesRouter   from "./routes/fichiersPrives.js";
import coursElearningRouter   from "./routes/coursElearning.js";
import monEspaceRouter        from "./routes/monEspace.js";
import appreciationsRouter   from "./routes/appreciations.js";
import campagnesRouter       from "./routes/campagnes.js";
import campagnesPubRouter    from "./routes/campagnesPubliques.js";
import campagnesWaRouter     from "./routes/campagnesWhatsapp.js";
import conversationsRouter   from "./routes/conversations.js";
import kpiRouter             from "./routes/kpi.js";
import marketingKpisRouter   from "./routes/marketingKpis.js";
import remplacementsRouter    from "./routes/remplacements.js";
import superviseurRouterDash  from "./routes/superviseurRoutesDash.js";
import superviseurRouterBet   from "./routes/superviseurRoutesBet.js";
import seancesRouter          from "./routes/seances.js";
import liveVerificationRouter from "./routes/liveVerification.js";
import placementRouter        from "./routes/placementRoutes.js";
import classesElearningRouter      from "./routes/classesElearning.js";
import inscriptionsElearningRouter from "./routes/inscriptionsElearning.js";
import elearningRouter             from "./routes/elearning.js";
import analyticsRouter             from "./routes/analytics.js";
import contenusOnboardingRouter    from "./routes/contenusOnboarding.js";
import contenusOnboardingDashRouter from "./routes/contenusOnboardingDash.js";
import gamificationRouter          from "./routes/gamification.js";
import gamificationDashRouter      from "./routes/gamificationDash.js";
import betElearningTestsNiveauRouter from "./routes/betElearningTestsNiveau.js";
import betLevelTestsRouter   from "./routes/betLevelTests.js";
import betLevelTestRouter    from "./routes/betLevelTest.js";
import betLevelTestAttemptRouter from "./routes/betLevelTestAttempt.js";
import { autoAudit }         from "./middlewares/autoAudit.js";
import { requestContext, plateformeDepuisOrigine } from "./middlewares/requestContext.js";

const app = express();

// Déployé derrière le proxy Vercel (vercel.json) - sans ceci, req.ip renvoie l'IP
// du proxy Vercel pour TOUT le monde, et express-rate-limit (accessGateLimiter,
// authLimiter, publicFormLimiter...) bloque/débloque tous les visiteurs en même temps.
app.set("trust proxy", 1);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      ALLOWED_ORIGINS.includes(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error("CORS non autorisé pour : " + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
// verify: capture le corps brut - nécessaire pour vérifier la signature HMAC des
// webhooks Zoom (x-zm-signature calculée sur les octets exacts reçus, un
// JSON.stringify(req.body) ne redonnerait pas forcément la même chaîne).
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));
// Contexte "plateforme d'origine" (dash vs bet-elearning), déduit de l'en-tête Origin/Referer
// (voir requestContext.js) - disponible ensuite dans tout le reste de la requête, y compris
// les ~70 appels manuels logAudit() dans les routes, sans avoir à leur faire passer `req`.
// C'est le seul signal fiable : un rôle (ex: "commercial", "onboarding") peut légitimement
// être utilisé depuis les DEUX apps (bet-elearning a une "façade" pour presque tous les
// rôles dash), donc classer par rôle seul ne suffit pas.
app.use((req, res, next) => {
  requestContext.run({ plateforme: plateformeDepuisOrigine(req) }, next);
});
app.use(autoAudit);

// Empêche le navigateur de mettre en cache les réponses de l'API (ex: statut d'un compte,
// accès parent/apprenant) - sans ça, un navigateur peut réafficher une donnée périmée après
// modification côté serveur, sans même revalider avec une requête réseau.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});



app.get("/", (req, res) => res.json({ status: "ok", message: "BET Backend actif", version: "1.0.0" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", testRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/level-test",  levelTestRoutes);
app.use("/api/level-test/attempt", levelTestAttemptRouter);
app.use("/api/level-tests", levelTestsRouter);
app.use("/api/devis",        devisRouter);
app.use("/api/contact",      contactRouter);
app.use("/api/entreprise",   entrepriseRouter);
app.use("/api/leads",        leadsRouter);
app.use("/api/inscriptions", inscriptionsRouter);
app.use("/api/simulateur",   simulateurRouter);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/admin",     adminRoutes);
app.use("/api/upload",    uploadRoutes);
app.use("/api/paiements", paiementsRouter);
app.use("/api/jobs",      jobsPaiementsRouter);
app.use("/api/jobs",      jobsBadgesFideliteRouter);
app.use("/api/jobs",      jobsRappelsSeancesRouter);
app.use("/api/jobs",      jobsNewsletterProgrammeeRouter);
app.use("/api/dash/badges-fidelite", badgesFideliteRouter);
app.use("/api/sondage",   sondageRouter);
app.use("/api/coachs",    coachsRouter);
app.use("/api/messages",  messagesRouter);
app.use("/api/centres",   centresRouter);
app.use("/api/blog",         blogRouter);
app.use("/api/marketing",    marketingRouter);
app.use("/api/temoignages",  temoignagesRouter);
app.use("/api/equipe-photos", equipePhotosRouter);
app.use("/api/partenaires",  partenairesRouter);
app.use("/api/boutique",     boutiqueRouter);
app.use("/api/parcours",     parcoursRouter);
app.use("/api/imports",      importsRouter);
app.use("/api/corporate",   corporateRouter);
app.use("/api/comptabilite", comptabiliteRouter);
app.use("/api/comptabilite-generale", comptabiliteGeneraleRouter);
app.use("/api/comptabilite-tva", comptabiliteTvaRouter);
app.use("/api/comptabilite-immobilisations", comptabiliteImmobilisationsRouter);
app.use("/api/comptabilite-rrd-bc-bacn", comptabiliteRrdBcBacnRouter);
app.use("/api/dash-comptabilite", dashComptabiliteRouter);
app.use("/api/dash-comptabilite-generale", dashComptabiliteGeneraleRouter);
app.use("/api/dash-comptabilite-tva", dashComptabiliteTvaRouter);
app.use("/api/dash-comptabilite-immobilisations", dashComptabiliteImmobilisationsRouter);
app.use("/api/dash-comptabilite-rrd-bc-bacn", dashComptabiliteRrdBcBacnRouter);
app.use("/api/marquee",      marqueeRouter);
app.use("/api/codes-promo",  codesPromoRouter);
app.use("/api/avis",         avisRouter);
app.use("/api/groupes",         groupesRouter);
app.use("/api/contrats-prives", contratsPrivesRouter);
app.use("/api/plaintes",        plaintesRouter);
app.use("/api/tickets",         ticketsRouter);
app.use("/api/config-contact",  configContactRouter);
app.use("/api/access-gate",     accessGateRouter);
app.use("/api/config-footer-elearning", configFooterElearningRouter);
app.use("/api/config-competences-elearning", configCompetencesElearningRouter);
app.use("/api/gamification-coach", gamificationCoachRouter);
app.use("/api/gamification-coach-dash", gamificationCoachDashRouter);
app.use("/api/packages-commerciaux", packagesCommerciauxRouter);
app.use("/api/faq",             faqRouter);
app.use("/api/carousel",        carouselRouter);
app.use("/api/offre-media",     offreMediaRouter);
// app.use("/api/cinetpay",        cinetpayRouter); // DÉSACTIVÉ - remplacé par TouchPoint
app.use("/api/touchpoint",      touchpointRouter);
app.use("/api/audit",           auditRouter);
app.use("/api/placement",           placementRouter);
app.use("/api/analytics",           analyticsRouter);
app.use("/api/classes-elearning",        classesElearningRouter);
app.use("/api/inscriptions-elearning",  inscriptionsElearningRouter);
app.use("/api/elearning",               elearningRouter);
app.use("/api/apprenants",      apprenantRouter);
app.use("/api/notifications",     notificationsRouter);
app.use("/api/seances-privees",   seancesPriveesRouter);
app.use("/api/presences-privees", presencesPriveesRouter);
app.use("/api/fichiers-prives",   fichiersPrivesRouter);
app.use("/api/cours-elearning",   coursElearningRouter);
app.use("/api/mon-espace",        monEspaceRouter);
app.use("/api/appreciations",     appreciationsRouter);
app.use("/api/campagnes",         campagnesRouter);
app.use("/api/campagnes-whatsapp", campagnesWaRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/kpi", kpiRouter);
app.use("/api/marketing",         marketingKpisRouter);
// PUBLIC - aucune authentification : c'est l'adresse qu'ouvre le QR code.
app.use("/api/public",            campagnesPubRouter);
app.use("/api/remplacements",     remplacementsRouter);
// dash et bet-elearning appellent la même URL /api/superviseur/* mais doivent
// exécuter deux routeurs totalement indépendants (aucun chemin de code partagé) -
// bet-elearning envoie toujours le header X-Plateforme, dash ne l'envoie jamais.
app.use("/api/superviseur", (req, res, next) => {
  const router = req.headers["x-plateforme"] === "bet-elearning" ? superviseurRouterBet : superviseurRouterDash;
  router(req, res, next);
});
app.use("/api/webhooks",          liveVerificationRouter);
app.use("/api/seances",           seancesRouter);
app.use("/api/contenus",          contenusOnboardingRouter);
app.use("/api/dash/contenus",     contenusOnboardingDashRouter);
app.use("/api/gamification",      gamificationRouter);
app.use("/api/dash/gamification", gamificationDashRouter);
app.use("/api/bet-elearning/tests-niveau", betElearningTestsNiveauRouter);
app.use("/api/bet-elearning/level-tests", betLevelTestsRouter);
app.use("/api/bet-elearning/level-test",  betLevelTestRouter);
app.use("/api/bet-elearning/level-test/attempt", betLevelTestAttemptRouter);

export default app;