// _mount.js — Colle ce bloc dans ton app.js backend
// (le fichier levelTest.js que tu as déjà reste inchangé)

import devisRouter        from "./routes/devis.js";
import contactRouter      from "./routes/contact.js";
import entrepriseRouter   from "./routes/entreprise.js";
import leadsRouter        from "./routes/leads.js";
import inscriptionsRouter from "./routes/inscriptions.js";
import simulateurRouter   from "./routes/simulateur.js";

// CORS — autorise le front React
import cors from "cors";
app.use(cors({
  origin: ["http://localhost:3000", "https://ton-domaine-prod.ci"],
}));

// Montage des routes
app.use("/api/devis",        devisRouter);
app.use("/api/contact",      contactRouter);
app.use("/api/entreprise",   entrepriseRouter);
app.use("/api/leads",        leadsRouter);
app.use("/api/inscriptions", inscriptionsRouter);
app.use("/api/simulateur",   simulateurRouter);
// /api/level-test  →  déjà monté dans ton app.js (inchangé)
