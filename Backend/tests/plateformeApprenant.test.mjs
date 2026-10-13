import test from "node:test";
import assert from "node:assert/strict";
import { plateformeDe, estElearning, inscriptionCourante, classeIdsDe } from "../src/services/plateformeApprenant.js";

/* L'AIGUILLAGE DÉCIDE QUELLES DONNÉES UN APPRENANT REÇOIT. Une erreur ici se paie soit d'un
   apprenant e-learning devant un espace vide — le défaut qu'on corrige —, soit, bien pire,
   d'un apprenant de BET Languages basculé sans raison sur des tables qui ne sont pas les
   siennes. D'où le soin mis au cas « par défaut ». */

const req = (headers) => ({ headers: headers || {} });

test("sans en-tête, on reste sur dash : les clients existants ne bougent pas", () => {
  // C'est LA garantie de non-régression : l'espace web de dash et les apprenants BET
  // Languages déjà sur le mobile n'envoient rien, et doivent continuer comme avant.
  assert.equal(plateformeDe(req()), "dash");
  assert.equal(plateformeDe(req({})), "dash");
  assert.equal(estElearning(req()), false);
});

test("l'en-tête bet-elearning ouvre la branche e-learning", () => {
  assert.equal(plateformeDe(req({ "x-plateforme": "bet-elearning" })), "bet-elearning");
  assert.equal(estElearning(req({ "x-plateforme": "bet-elearning" })), true);
});

test("la casse et les espaces ne font pas rater l'aiguillage", () => {
  // Les en-têtes HTTP sont insensibles à la casse côté nom ; la valeur, elle, arrive telle
  // que le client l'écrit. Un « BET-Elearning » ne doit pas retomber silencieusement sur dash.
  for (const v of ["BET-ELEARNING", "Bet-Elearning", "  bet-elearning  "]) {
    assert.equal(plateformeDe(req({ "x-plateforme": v })), "bet-elearning", v);
  }
});

test("une valeur inconnue reste sur dash plutôt que d'inventer une plateforme", () => {
  for (const v of ["", "dash", "elearning", "bet", "null", "undefined"]) {
    assert.equal(plateformeDe(req({ "x-plateforme": v })), "dash", v);
  }
});

test("une requête malformée ne fait pas tomber la route", () => {
  // Appelée depuis un test, un job ou un middleware, `req` peut ne pas avoir d'en-têtes.
  assert.equal(plateformeDe(undefined), "dash");
  assert.equal(plateformeDe({}), "dash");
  assert.equal(estElearning(null), false);
});

test("l'inscription courante écarte un parcours retiré", () => {
  const liste = [
    { id: "a", statut: "retire",  classe_id: "c1" },
    { id: "b", statut: "actif",   classe_id: "c2" },
  ];
  assert.equal(inscriptionCourante(liste).id, "b");
});

test("un apprenant suspendu n'est pas « courant », mais reste visible s'il n'y a que lui", () => {
  // Il garde ses anciennes données consultables : rendre `null` lui afficherait un espace
  // vide au lieu de son parcours, ce qui ressemble à une panne plutôt qu'à une suspension.
  const seulementSuspendu = [{ id: "a", statut: "suspendu", classe_id: "c1" }];
  assert.equal(inscriptionCourante(seulementSuspendu).id, "a");

  const avecActif = [{ id: "a", statut: "suspendu" }, { id: "b", statut: "actif" }];
  assert.equal(inscriptionCourante(avecActif).id, "b");
});

test("sans inscription, rien — et surtout pas une erreur", () => {
  assert.equal(inscriptionCourante([]), null);
  assert.equal(inscriptionCourante(undefined), null);
});

test("les identifiants de classe sont dédoublonnés et sans trous", () => {
  const liste = [{ classe_id: "c1" }, { classe_id: "c2" }, { classe_id: "c1" }, { classe_id: null }, {}];
  assert.deepEqual(classeIdsDe(liste), ["c1", "c2"]);
  assert.deepEqual(classeIdsDe([]), []);
  assert.deepEqual(classeIdsDe(undefined), []);
});
