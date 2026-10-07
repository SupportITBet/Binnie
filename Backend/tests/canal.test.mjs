/**
 * Tests de la compatibilité de canal entre une assistante et un dossier.
 *
 * Chaque bloc correspond à une attribution qui était REFUSÉE à tort par l'égalité stricte
 * qu'on vient de remplacer. Ils existent pour que la correction ne se défasse pas.
 *
 *   node --test tests/canal.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { canauxCompatibles, libelleCanal, libelleCanalPhrase } from "../src/utils/canal.js";

test("un dossier hybride est attribuable - il ne l'était à personne", () => {
  /* Le défaut le plus grave : aucune assistante ne porte le canal `hybride` (elles sont
     `en_ligne` ou `presentiel` en base), donc l'égalité stricte refusait TOUTE attribution sur
     un dossier hybride. Or une migration vers le en ligne en produit un dès que la classe
     d'arrivée est hybride - le cas était garanti, pas théorique. */
  assert.equal(canauxCompatibles("en_ligne", "hybride"), true);
  assert.equal(canauxCompatibles("presentiel", "hybride"), true);
});

test("une assistante « les_deux » peut tout prendre", () => {
  // `/assistantes-ligne` la propose explicitement (type_cours IN en_ligne, les_deux) : l'écran
  // offrait un choix que le serveur rejetait ensuite.
  assert.equal(canauxCompatibles("les_deux", "en_ligne"), true);
  assert.equal(canauxCompatibles("les_deux", "presentiel"), true);
  assert.equal(canauxCompatibles("les_deux", "hybride"), true);
});

test("les deux orthographes du canal mixte valent la même chose", () => {
  // Une assistante dit `les_deux`, une classe dit `hybride`. Deux colonnes, jamais alignées.
  assert.equal(canauxCompatibles("hybride", "en_ligne"), true);
  assert.equal(canauxCompatibles("les_deux", "hybride"), true);
});

test("en ligne contre présentiel reste refusé", () => {
  // C'est la seule opposition franche, et le garde-fou doit la tenir : c'est pour elle que ce
  // contrôle existe.
  assert.equal(canauxCompatibles("en_ligne", "presentiel"), false);
  assert.equal(canauxCompatibles("presentiel", "en_ligne"), false);
});

test("un canal identique passe, évidemment", () => {
  assert.equal(canauxCompatibles("en_ligne", "en_ligne"), true);
  assert.equal(canauxCompatibles("presentiel", "presentiel"), true);
});

test("une information absente ne fait pas refuser", () => {
  // On ne refuse pas une attribution sur un champ qu'on n'a pas : une fiche assistante sans
  // `type_cours` est une saisie incomplète, pas une incompatibilité.
  assert.equal(canauxCompatibles(null, "en_ligne"), true);
  assert.equal(canauxCompatibles("en_ligne", null), true);
  assert.equal(canauxCompatibles(undefined, undefined), true);
});

test("les libellés distinguent le badge de la phrase", () => {
  // « En ligne » au milieu d'une phrase et « en ligne » sur un badge sont tous deux fautifs :
  // d'où deux fonctions plutôt qu'une capitale ajoutée après coup.
  assert.equal(libelleCanal("en_ligne"), "En ligne");
  assert.equal(libelleCanalPhrase("en_ligne"), "en ligne");
  assert.equal(libelleCanal("les_deux"), "Hybride");
  assert.equal(libelleCanalPhrase("hybride"), "hybride");
});

test("un canal inconnu ne rend pas un libellé inventé", () => {
  // `null` permet à l'appelant de ne rien afficher plutôt qu'une parenthèse vide - c'est
  // exactement le bug « (en_ligne) » puis « () » de la notification de transfert.
  assert.equal(libelleCanal(null), null);
  assert.equal(libelleCanal("domicile"), null);
  assert.equal(libelleCanalPhrase(""), null);
});
