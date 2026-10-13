import test from "node:test";
import assert from "node:assert/strict";
import { estChronometre, echeanceComposition, compositionExpiree } from "../src/services/minuteurDevoir.js";

/* Le minuteur décide si une copie peut encore être déposée. Une erreur ici se paie d'une
   composition perdue, ou d'un apprenant qui compose sans limite. */

const T0 = "2026-10-13T09:00:00.000Z";
const a = (min) => new Date(Date.parse(T0) + min * 60_000);

test("sans durée, le devoir n'est pas chronométré", () => {
  assert.equal(estChronometre({ duree_min: null, type_rendu: "texte" }), false);
  assert.equal(estChronometre({ duree_min: 0,    type_rendu: "texte" }), false);
});

test("seul le rendu en TEXTE est chronométré", () => {
  // Un rendu de fichier se prépare hors ligne : lui imposer un chrono n'aurait pas le
  // même sens, et c'est la décision qui a été prise.
  assert.equal(estChronometre({ duree_min: 60, type_rendu: "texte" }),    true);
  assert.equal(estChronometre({ duree_min: 60, type_rendu: "fichier" }),  false);
  assert.equal(estChronometre({ duree_min: 60, type_rendu: "les_deux" }), false);
});

test("l'échéance part de l'OUVERTURE, pas de la publication", () => {
  const d = { duree_min: 120, type_rendu: "texte" };
  assert.equal(echeanceComposition(d, T0).toISOString(), a(120).toISOString());
});

test("avant l'échéance on peut déposer, après non", () => {
  const d = { duree_min: 60, type_rendu: "texte" };
  assert.equal(compositionExpiree(d, T0, a(59)), false);
  assert.equal(compositionExpiree(d, T0, a(61)), true);
});

test("à la seconde exacte, le temps est écoulé", () => {
  // La borne est fermée : 60 minutes signifie 60, pas 60 et quelques.
  const d = { duree_min: 60, type_rendu: "texte" };
  assert.equal(compositionExpiree(d, T0, a(60)), true);
});

test("un devoir non chronométré n'expire jamais", () => {
  // Sans ce cas, ajouter le minuteur aurait fermé tous les devoirs existants, dont la
  // colonne `duree_min` est nulle.
  assert.equal(compositionExpiree({ duree_min: null, type_rendu: "texte" }, T0, a(99999)), false);
  assert.equal(compositionExpiree({ duree_min: 60, type_rendu: "fichier" }, T0, a(99999)), false);
});

test("sans date de début, rien n'est expiré", () => {
  // L'apprenant n'a pas encore ouvert : son temps n'a pas commencé à courir.
  const d = { duree_min: 60, type_rendu: "texte" };
  assert.equal(echeanceComposition(d, null), null);
  assert.equal(compositionExpiree(d, null, a(99999)), false);
});

test("une date de début illisible ne ferme pas la copie", () => {
  // Mieux vaut laisser composer que fermer à tort sur une donnée corrompue.
  const d = { duree_min: 60, type_rendu: "texte" };
  assert.equal(echeanceComposition(d, "pas-une-date"), null);
  assert.equal(compositionExpiree(d, "pas-une-date", a(99999)), false);
});
