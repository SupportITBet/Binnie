import test from "node:test";
import assert from "node:assert/strict";
import { verrousDepuisEl, MOTIF_EL } from "../src/services/lectureSequentielleElearning.js";

/* Le calcul du verrou décide de ce qu'un apprenant peut ouvrir. Les cas ci-dessous sont
   ceux où une erreur ne se verrait pas tout de suite : un verrou définitif, un cours
   bloqué par une classe qui n'est pas la sienne, un contenu qui se bloque lui-même. */

const C = (id, jourPub, { seq = false, classes = ["A"] } = {}) => ({
  id, titre: id, classe_ids: classes, lecture_sequentielle: seq,
  created_at: `2026-10-${String(jourPub).padStart(2, "0")}T09:00:00Z`,
});
const RATT = (classe_id, jourArrivee = 1) =>
  ({ classe_id, date_inscription: `2026-10-${String(jourArrivee).padStart(2, "0")}T08:00:00Z` });

test("sans contenu obligatoire, tout est ouvert", () => {
  const v = verrousDepuisEl([RATT("A")], [C("c1", 1), C("c2", 2), C("c3", 3)], new Set());
  assert.equal(Object.values(v).every(x => !x.verrouille), true);
});

test("un contenu obligatoire non lu ferme ce qui le suit, mais jamais lui-même", () => {
  const contenus = [C("c1", 1, { seq: true }), C("c2", 2), C("c3", 3)];
  const v = verrousDepuisEl([RATT("A")], contenus, new Set());
  // Se bloquer lui-même rendrait le verrou définitif : le premier cours serait inatteignable.
  assert.equal(v.c1.verrouille, false, "le contenu obligatoire reste accessible");
  assert.equal(v.c2.verrouille, true);
  assert.equal(v.c2.bloque_par.id, "c1", "le motif nomme le cours qui retient");
  assert.equal(v.c3.verrouille, true);
});

test("une fois terminé, il libère la suite", () => {
  const contenus = [C("c1", 1, { seq: true }), C("c2", 2), C("c3", 3)];
  const v = verrousDepuisEl([RATT("A")], contenus, new Set(["c1"]));
  assert.equal(Object.values(v).every(x => !x.verrouille), true);
});

test("l'ordre est celui de la PUBLICATION, pas celui du tableau", () => {
  // c3 est passé en premier dans la liste, mais publié en dernier : il doit rester fermé.
  const contenus = [C("c3", 3), C("c1", 1, { seq: true }), C("c2", 2)];
  const v = verrousDepuisEl([RATT("A")], contenus, new Set());
  assert.equal(v.c3.verrouille, true);
  assert.equal(v.c2.verrouille, true);
  assert.equal(v.c1.verrouille, false);
});

test("un cours publié AVANT l'arrivée ne verrouille pas et ne retient personne", () => {
  // Arrivée le 10 ; c0 date du 1er. Il reste lisible, et surtout il ne peut pas servir de
  // prérequis : l'apprenant n'a jamais eu l'occasion de le terminer.
  const contenus = [C("c0", 1, { seq: true }), C("c1", 11), C("c2", 12)];
  const v = verrousDepuisEl([RATT("A", 10)], contenus, new Set());
  assert.equal(v.c0.verrouille, false);
  assert.equal(v.c0.motif, MOTIF_EL.AVANT_ARRIVEE);
  assert.equal(v.c1.verrouille, false, "la séquence repart à l'arrivée de l'apprenant");
  assert.equal(v.c2.verrouille, false);
});

test("la séquence est PAR CLASSE : la classe B ne retient pas l'apprenant de A", () => {
  const contenus = [
    C("b1", 1, { seq: true, classes: ["B"] }),
    C("a1", 2, { classes: ["A"] }),
  ];
  const v = verrousDepuisEl([RATT("A")], contenus, new Set());
  assert.equal(v.a1.verrouille, false);
  assert.equal(v.b1.verrouille, false, "un contenu d'une autre classe est hors séquence");
});

test("accessible dans UNE classe suffit : deux classes ne se retiennent pas mutuellement", () => {
  // c partagé A+B. A le ferme (a0 obligatoire non lu), B l'ouvre. Il doit être ouvert.
  const contenus = [
    C("a0", 1, { seq: true, classes: ["A"] }),
    C("c",  2, { classes: ["A", "B"] }),
  ];
  const v = verrousDepuisEl([RATT("A"), RATT("B")], contenus, new Set());
  assert.equal(v.c.verrouille, false);
});

test("deux obligatoires d'affilée : seul le PREMIER non lu est nommé", () => {
  const contenus = [C("c1", 1, { seq: true }), C("c2", 2, { seq: true }), C("c3", 3)];
  const v = verrousDepuisEl([RATT("A")], contenus, new Set());
  assert.equal(v.c2.bloque_par.id, "c1");
  assert.equal(v.c3.bloque_par.id, "c1", "on ne demande pas de finir c2 avant c1");
});

test("sans rattachement, rien n'est verrouillé", () => {
  const v = verrousDepuisEl([], [C("c1", 1, { seq: true }), C("c2", 2)], new Set());
  assert.equal(Object.values(v).every(x => !x.verrouille), true);
});
