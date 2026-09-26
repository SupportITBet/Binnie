/**
 * Annote les modèles Excel d'import (Backend/docs/Import).
 *
 * Pourquoi : la personne qui remplit le fichier ne peut pas deviner qu'une colonne
 * « Filière » doit porter le libellé EXACT d'une offre du catalogue. Quand elle écrit
 * « Anglais Pro » au lieu d'une offre réelle, l'import réussit — mais le dossier est
 * ensuite rangé en « offre inconnue » et son chiffre d'affaires disparaît des
 * statistiques, sans que personne ne voie l'erreur. C'est exactement ce qui est arrivé
 * à 3 dossiers que le script de reprise n'a pas pu rattacher.
 *
 * Ce script ajoute donc, dans chaque modèle :
 *   - une NOTE sur chaque en-tête de colonne (à quoi elle sert, format attendu) ;
 *   - une feuille « Référentiel » listant les valeurs réellement acceptées ;
 *   - des LISTES DÉROULANTES sur les colonnes à valeurs fermées, pour que la saisie
 *     libre ne soit plus le chemin par défaut.
 *
 * Les référentiels sont lus EN BASE (catalogue d'offres, coachs, assistantes) : rien
 * n'est figé ici. Relancer le script après une évolution du catalogue suffit à remettre
 * les modèles à jour.
 *
 * Usage :  node scripts/annoter_modeles_import.mjs
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// exceljs vit dans dash/ (seul paquet du dépôt à savoir écrire notes et validations) ;
// l'importer d'ici évite de dupliquer la dépendance côté Backend pour un script d'outillage.
const require = createRequire(import.meta.url);
const ExcelJS = require("../../dash/node_modules/exceljs");

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = path.join(ICI, "..", "docs", "Import");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
);

/* ── Référentiels, lus en base ──────────────────────────────────────────── */

const cfg = async (key) => {
  const { data } = await sb.from("plateforme_config").select("valeur").eq("key", key).maybeSingle();
  return Array.isArray(data?.valeur) ? data.valeur : [];
};

const [enLigne, domicile, centres] = await Promise.all([
  cfg("offres_en_ligne"), cfg("offres_domicile"), cfg("centres_master"),
]);

const OFFRES = [...new Set([
  ...enLigne.filter((o) => o.actif !== false).map((o) => o.label),
  ...domicile.filter((o) => o.actif !== false).map((o) => o.label),
  ...centres.flatMap((c) => (c.offres || []).map((o) => o.label)),
].filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

const { data: coachsRaw } = await sb
  .from("utilisateurs").select("email, nom, prenom").eq("role", "coach").order("nom");
const COACHS = (coachsRaw || []).filter((c) => c.email)
  .map((c) => ({ email: c.email, nom: `${c.prenom || ""} ${c.nom || ""}`.trim() }));

const { data: assRaw } = await sb
  .from("assistantes").select("email, nom, prenom, type_cours").order("nom");
const ASSISTANTES = (assRaw || []).filter((a) => a.email).map((a) => ({
  email: a.email,
  nom: `${a.prenom || ""} ${a.nom || ""}`.trim(),
  canal: a.type_cours === "presentiel" ? "Présentiel" : "En ligne",
}));

const NIVEAUX = ["A1", "A2", "B1", "B2", "C1", "C2"];

console.log(`référentiels : ${OFFRES.length} offres · ${COACHS.length} coachs · ${ASSISTANTES.length} assistantes`);

/* ── Notes par colonne ──────────────────────────────────────────────────────
   La clé est un fragment cherché dans l'en-tête : les modèles nomment la même
   colonne « Nom classe* » ou « Nom groupe* » selon le canal.                  */

const FORMAT_PAIEMENTS =
  "Versements déjà encaissés, séparés par des points-virgules.\n\n"
  + "Format d'un versement :  montant@date@référence\n"
  + "  • montant   : obligatoire, en chiffres, sans espace ni symbole (80000)\n"
  + "  • date      : AAAA-MM-JJ (facultatif — la date de début est prise à défaut)\n"
  + "  • référence : facultative (n° de reçu, transaction…)\n\n"
  + "Exemple :  80000@2025-09-01@REC-014; 80000@2025-10-01\n\n"
  + "La MENSUALITÉ du plan de paiement est déduite du PREMIER versement : "
  + "si les montants varient, mettez d'abord celui qui fait référence.\n"
  + "Colonne vide = aucun plan mensuel créé pour cet apprenant.";

const FORMAT_HORAIRES =
  "Créneaux hebdomadaires, séparés par des points-virgules.\n\n"
  + "Format :  Jour HH:MM-HH:MM\n"
  + "Exemple :  Lun 08:00-10:00; Mer 14:00-16:00\n\n"
  + "Jours acceptés : Lun, Mar, Mer, Jeu, Ven, Sam, Dim.";

const NOTE_OFFRE =
  "⚠️ Colonne déterminante pour les statistiques.\n\n"
  + "Doit contenir le libellé EXACT d'une offre du catalogue — la liste déroulante de "
  + "cette cellule ne propose que des valeurs valides, et la feuille « Référentiel » les "
  + "récapitule.\n\n"
  + "Un libellé inventé (« Anglais Pro », « Formation »…) n'empêche PAS l'import : "
  + "l'apprenant est bien créé, mais son dossier est ensuite classé en « offre inconnue » "
  + "et son chiffre d'affaires est exclu du tableau Offres & Formations. L'erreur est donc "
  + "invisible tant que personne ne consulte les statistiques.\n\n"
  + "Offres actuellement au catalogue :\n" + OFFRES.map((o) => "  • " + o).join("\n");

const NOTES = [
  [/^nom (classe|groupe)/i, "Nom de la classe.\n\nToutes les lignes portant le MÊME nom sont regroupées dans une seule classe : c'est ainsi qu'on inscrit plusieurs apprenants dans le même groupe.\n\nSi une classe de ce nom existe déjà, les apprenants la rejoignent au lieu d'en créer une seconde."],
  [/filière|filiere|formation/i, NOTE_OFFRE],
  [/^niveau/i, "Niveau CECR : " + NIVEAUX.join(", ") + ".\n\nUne valeur non reconnue n'est pas bloquante : elle est simplement ignorée et le niveau reste vide."],
  [/date début|date de début/i, "Format AAAA-MM-JJ (ex. 2025-09-01).\n\nAttention au format de la cellule : si Excel l'affiche « 01/09/2025 », mettez la colonne au format Texte avant de saisir."],
  [/date fin|date de fin/i, "Format AAAA-MM-JJ.\n\nLaisser VIDE pour un engagement sans terme : le plan de paiement reste alors ouvert et se prolonge automatiquement de mois en mois.\nRenseigner une date borne le plan à cette échéance."],
  [/capacité max/i, "Nombre maximum d'apprenants. 20 par défaut si vide.\n\nNe bloque pas l'import : un dépassement génère seulement un avertissement, les places étant déjà réelles."],
  [/coach.*\(email\)/i, "E-mail du coach, tel qu'enregistré dans la plateforme — un coach introuvable BLOQUE la ligne.\n\nCoachs disponibles :\n" + COACHS.map((c) => `  • ${c.email}${c.nom ? "  (" + c.nom + ")" : ""}`).join("\n")],
  [/assistante.*\(email\)/i, "E-mail de la commerciale en charge du dossier — obligatoire, et une assistante introuvable BLOQUE la ligne.\n\nC'est elle qui verra l'apprenant dans son espace et à qui les versements seront crédités.\n\nAssistantes :\n" + ASSISTANTES.map((a) => `  • ${a.email}  (${a.nom} · ${a.canal})`).join("\n")],
  [/horaires/i, FORMAT_HORAIRES],
  [/disponibilités/i, FORMAT_HORAIRES.replace("Créneaux hebdomadaires", "Créneaux de disponibilité")],
  [/^paiements$/i, FORMAT_PAIEMENTS],
  [/profil \(adulte/i, "adulte ou enfant.\n\nPour un profil « enfant », les colonnes Nom du parent et Téléphone du parent deviennent OBLIGATOIRES : sans elles la ligne est bloquée."],
  [/nom du parent/i, "Obligatoire si Profil = enfant."],
  [/téléphone du parent/i, "Obligatoire si Profil = enfant."],
  [/email du parent/i, "Fortement recommandé pour un enfant : c'est cette adresse qui reçoit les accès à la plateforme.\n\nSans elle, l'enfant reçoit un identifiant technique et la famille ne reçoit jamais ses codes."],
  [/pack \(classique/i, "classique ou intensive.\n\nDétermine la mensualité appliquée, selon la grille tarifaire du coaching privé et le lieu du cours."],
  [/lieu \(cabinet/i, "cabinet ou domicile.\n\nSi domicile, renseignez la colonne Adresse."],
  [/^adresse/i, "À renseigner uniquement si Lieu = domicile."],
  [/^nom apprenant/i, "Nom de famille de l'apprenant — obligatoire, une ligne sans nom est bloquée."],
  [/^prénom apprenant|^prénom$/i, "Prénom de l'apprenant."],
  [/^email apprenant|^email$/i, "Sert d'identifiant de connexion.\n\nSi vide, un identifiant technique est généré et l'apprenant ne recevra pas ses accès."],
  [/^téléphone/i, "Numéro de l'apprenant (facultatif)."],
  [/^objectif client/i, "Objectif exprimé par le client (facultatif) — repris dans son dossier."],
  [/^notes$/i, "Commentaire libre, repris dans le dossier de l'apprenant."],
];

const noteDe = (entete) => (NOTES.find(([re]) => re.test(entete)) || [])[1] || null;

/* ── Listes déroulantes ─────────────────────────────────────────────────── */

const LISTES = [
  [/filière|filiere|formation/i, "Offres"],
  [/coach.*\(email\)/i, "Coachs"],
  [/assistante.*\(email\)/i, "Assistantes"],
  [/^niveau/i, "Niveaux"],
  [/profil \(adulte/i, "Profils"],
  [/pack \(classique/i, "Packs"],
  [/lieu \(cabinet/i, "Lieux"],
];

const COLONNES_REF = {
  Offres:      OFFRES,
  Coachs:      COACHS.map((c) => c.email),
  Assistantes: ASSISTANTES.map((a) => a.email),
  Niveaux:     NIVEAUX,
  Profils:     ["adulte", "enfant"],
  Packs:       ["classique", "intensive"],
  Lieux:       ["cabinet", "domicile"],
};

/* ── Traitement des fichiers ────────────────────────────────────────────── */

const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~") && !f.startsWith("."));
let total = 0;

for (const fichier of fichiers) {
  const chemin = path.join(DOSSIER, fichier);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(chemin);
  const ws = wb.worksheets[0];

  // Feuille de référence, reconstruite à chaque passage pour rester à jour.
  const ancienne = wb.getWorksheet("Référentiel");
  if (ancienne) wb.removeWorksheet(ancienne.id);
  const ref = wb.addWorksheet("Référentiel");
  ref.getCell("A1").value = "Valeurs acceptées — ne pas modifier cette feuille";
  ref.getCell("A1").font = { bold: true, size: 12 };
  ref.getRow(2).values = Object.keys(COLONNES_REF);
  ref.getRow(2).font = { bold: true };
  Object.entries(COLONNES_REF).forEach(([titre, valeurs], i) => {
    valeurs.forEach((v, j) => { ref.getCell(3 + j, i + 1).value = v; });
    ref.getColumn(i + 1).width = Math.max(14, ...valeurs.map((v) => String(v).length + 2));
    // Repère nommé : la validation y fait référence, et le nom survit à l'insertion de lignes.
    wb.definedNames.add(`Référentiel!$${String.fromCharCode(65 + i)}$3:$${String.fromCharCode(65 + i)}$${2 + valeurs.length}`, `ref_${titre}`);
  });

  // Notes + validations, colonne par colonne, d'après l'en-tête réellement présent.
  let nbNotes = 0, nbListes = 0;
  for (let c = 1; c <= ws.columnCount; c++) {
    const entete = String(ws.getCell(1, c).value || "").trim();
    if (!entete) continue;

    const note = noteDe(entete);
    if (note) { ws.getCell(1, c).note = note; nbNotes++; }

    const cle = (LISTES.find(([re]) => re.test(entete)) || [])[1];
    if (cle && COLONNES_REF[cle]?.length) {
      const lettre = String.fromCharCode(65 + Object.keys(COLONNES_REF).indexOf(cle));
      const plage = `Référentiel!$${lettre}$3:$${lettre}$${2 + COLONNES_REF[cle].length}`;
      // Appliquée largement sous l'en-tête : le fichier sert de modèle, on ajoute des lignes.
      for (let r = 2; r <= Math.max(ws.rowCount, 200); r++) {
        ws.getCell(r, c).dataValidation = {
          type: "list", allowBlank: true, formulae: [plage],
          showErrorMessage: true, errorStyle: "warning",
          errorTitle: "Valeur hors référentiel",
          error: "Cette valeur ne figure pas dans la feuille « Référentiel ». Vérifiez l'orthographe exacte.",
        };
      }
      nbListes++;
    }
  }

  await wb.xlsx.writeFile(chemin);
  total++;
  console.log(`  ${fichier} — ${nbNotes} notes, ${nbListes} listes déroulantes`);
}

console.log(`\n${total} modèle(s) annoté(s).`);
process.exit(0);
