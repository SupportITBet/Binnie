import "dotenv/config";
import app from "./app.js";
import { testSupabase } from "./tests/testSupabase.js";
import { testFirebase } from "./tests/testFirebase.js";
import { demarrerPurgeNotifications } from "./jobs/cleanupNotifications.js";
import { demarrerNettoyageFichiersChat } from "./jobs/cleanupChatFiles.js";
import { demarrerNotificationDevoirsClotures } from "./jobs/notifierDevoirsClotures.js";
import { demarrerNotificationEvaluationsGroupesClotures } from "./jobs/notifierEvaluationsGroupesClotures.js";
import { demarrerGamificationCoachMensuel } from "./jobs/gamificationCoachMensuel.js";
import { demarrerGamificationCoachMensuelDash } from "./jobs/gamificationCoachMensuelDash.js";
import { demarrerRelancesFacturesImpayees } from "./jobs/relancesFacturesImpayees.js";
import { demarrerNotificationEcheancesPaiement } from "./jobs/notifierEcheancesPaiement.js";
import { demarrerRelancesMarketing } from "./jobs/relancesMarketing.js";
import { demarrerEnvoiCampagnesProgrammees } from "./jobs/envoyerCampagnesProgrammees.js";

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, async () => {
  console.log(`🚀 BET Backend lancé sur le port ${PORT}`);
  console.log(`🔍 SUPABASE_URL        = ${process.env.SUPABASE_URL        ? "✅" : "❌ manquante"}`);
  console.log(`🔍 SUPABASE_SERVICE_KEY = ${process.env.SUPABASE_SERVICE_KEY ? "✅" : "❌ manquante"}`);
  await testSupabase();
  await testFirebase();
  demarrerPurgeNotifications();
  demarrerNettoyageFichiersChat();
  demarrerNotificationDevoirsClotures();
  demarrerNotificationEvaluationsGroupesClotures();
  demarrerGamificationCoachMensuel();
  demarrerGamificationCoachMensuelDash();
  demarrerRelancesFacturesImpayees();
  demarrerNotificationEcheancesPaiement();
  demarrerRelancesMarketing();
  demarrerEnvoiCampagnesProgrammees();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} déjà utilisé - tue l'ancien processus avec : lsof -ti :${PORT} | xargs kill -9`);
    process.exit(1);
  } else {
    console.error("❌ Erreur serveur :", err.message);
    process.exit(1);
  }
});

// Capture les erreurs non gérées pour éviter un crash silencieux
process.on("uncaughtException",  (err) => console.error("💥 uncaughtException :", err.message));
process.on("unhandledRejection", (err) => console.error("💥 unhandledRejection :", err?.message ?? err));