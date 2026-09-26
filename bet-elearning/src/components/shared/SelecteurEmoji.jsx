import React, { useState, useRef, useEffect, useCallback } from "react";

/**
 * Le sélecteur d'emojis de la barre de saisie - celui qu'on attend à côté du micro.
 *
 * ⚠️ COPIE de `dash/src/Components/SelecteurEmoji.jsx`. Les deux applications sont des
 * projets React séparés, sans paquet partagé : un `import` de l'une vers l'autre ne
 * compile pas. Toute correction ici doit être reportée là-bas, et réciproquement.
 *
 * POURQUOI CE FICHIER. La messagerie n'en avait aucun : pour écrire un emoji il fallait le
 * clavier du système, que peu de gens connaissent sur un ordinateur. Un widget existait
 * bien dans `SuperAdminDashboard`, mais local au fichier et pensé pour choisir UNE icône de
 * rubrique - pas pour écrire au fil de la conversation. Celui-ci vit à part pour que les
 * six espaces qui montent une messagerie partagent le même.
 *
 * Deux détails qui font la différence à l'usage :
 *
 *  · L'INSERTION SE FAIT À LA POSITION DU CURSEUR, pas en fin de texte. Ajouter un emoji au
 *    milieu d'une phrase déjà écrite est le cas normal ; le coller à la fin oblige à
 *    couper-coller derrière.
 *
 *  · LES RÉCENTS SONT MÉMORISÉS dans le navigateur. On réutilise presque toujours les mêmes
 *    cinq ou six ; les chercher à chaque fois dans la grille use la patience.
 */

const CLE_RECENTS = "bet_emojis_recents";
const MAX_RECENTS = 16;

/* Les catégories, volontairement courtes. Une palette exhaustive - plus de 3 000 emojis -
   se parcourt moins vite qu'elle ne se cherche, et personne n'en utilise le dixième. */
const CATEGORIES = [
  { cle: "visages", ico: "😊", nom: "Visages", liste: [
    "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
    "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥳","😏","😒","😞","😔","😟","😕","🙁","😣","😖","😫",
    "😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🤭",
    "🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢",
    "🤮","🤧","😷","🤒","🤕","🤑","🤠","😈","👻","💀","🤖","🎃","😺","😹","😻","😼","😽","🙀","😿","😾",
  ]},
  { cle: "gestes", ico: "👍", nom: "Gestes", liste: [
    "👍","👎","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋",
    "🤝","🙏","✍️","💪","🦾","👏","🙌","👐","🤲","🫶","❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️",
    "💕","💞","💓","💗","💖","💘","💝","💯","💢","💥","💫","💦","💨","🔥","✨","⭐","🌟","💡","🎉","🎊",
  ]},
  { cle: "travail", ico: "💼", nom: "Travail & école", liste: [
    "💼","📅","🗓️","⏰","⏳","📌","📍","📎","🖇️","📏","📐","✂️","🗃️","🗂️","📂","📁","📋","📝","✏️","🖊️",
    "📖","📚","🎓","🏫","🏢","🏠","💻","🖥️","🖨️","⌨️","🖱️","📱","📲","☎️","📞","📠","📧","📨","📩","✉️",
    "📤","📥","📦","🔖","🏷️","💰","💵","💸","🪙","💳","🧾","📊","📈","📉","🔍","🔎","🔑","🔒","🔓","⚙️",
    "🛠️","🔧","🧰","✅","☑️","❌","⚠️","❗","❓","💬","🗨️","🗯️","💭","🔔","🔕","📢","📣","📡","🌐","🎯",
  ]},
  { cle: "divers", ico: "🎈", nom: "Divers", liste: [
    "🎈","🎁","🎀","🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎪","🎭","🎨","🎬","🎤","🎧","🎵","🎶","🥁","🎸",
    "⚽","🏀","🏈","🎾","🏐","🏓","🏸","🥊","🏋️","🚴","🏃","🚶","🧘","☀️","🌙","⭐","☁️","🌧️","⛈️","🌈",
    "❄️","🌊","🌍","🌎","🌏","🗺️","✈️","🚌","🚗","🚕","🚀","⛵","🍎","🍌","🍕","🍔","🍟","☕","🍵","🥤",
    "🎂","🍰","🍫","🍬","🌱","🌳","🌵","🌺","🌻","🌹","💐","🐶","🐱","🦁","🐉","🦋","🐝","🕊️","🇨🇮","🇫🇷",
  ]},
];

/** Les emojis récemment utilisés. Ne lève jamais : un navigateur peut refuser le stockage. */
function lireRecents() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_RECENTS) || "[]");
    return Array.isArray(brut) ? brut.filter(e => typeof e === "string").slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

/**
 * @param {Function} onInsert   reçoit l'emoji choisi ; au composant parent de l'insérer
 * @param {string}   accent     la couleur de l'espace, pour que le bouton s'y fonde
 * @param {boolean}  disabled
 */
export default function SelecteurEmoji({ onInsert, accent = "#0369a1", disabled = false }) {
  const [ouvert, setOuvert]   = useState(false);
  const [onglet, setOnglet]   = useState("visages");
  const [recents, setRecents] = useState(lireRecents);
  const [pos, setPos]         = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const LARGEUR = 300;
  const HAUTEUR = 290;

  /* Le panneau est en `position: fixed` et placé à la main : la barre de saisie vit au fond
     d'un conteneur qui défile, et un panneau en `absolute` y serait coupé. On l'ouvre
     au-dessus du bouton quand le bas de l'écran manque de place. */
  const basculer = () => {
    if (disabled) return;
    if (!ouvert && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const placeDessous = window.innerHeight - r.bottom;
      setPos({
        top:  placeDessous >= HAUTEUR ? r.bottom + 6 : Math.max(8, r.top - HAUTEUR - 6),
        left: Math.max(8, Math.min(r.left, window.innerWidth - LARGEUR - 8)),
      });
    }
    setOuvert(o => !o);
  };

  // Fermeture au clic extérieur et à Échap - sans quoi le panneau reste ouvert par-dessus
  // la conversation et masque les derniers messages.
  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (popRef.current && !popRef.current.contains(e.target)) setOuvert(false);
    };
    const auClavier = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert]);

  const choisir = useCallback((emoji) => {
    onInsert?.(emoji);
    setRecents(prev => {
      const suite = [emoji, ...prev.filter(e => e !== emoji)].slice(0, MAX_RECENTS);
      try { localStorage.setItem(CLE_RECENTS, JSON.stringify(suite)); } catch { /* stockage refusé */ }
      return suite;
    });
    // Le panneau RESTE ouvert : on enchaîne souvent deux ou trois emojis.
  }, [onInsert]);

  const categorie = CATEGORIES.find(c => c.cle === onglet) || CATEGORIES[0];

  return (
    <div style={{ display: "inline-block", flexShrink: 0 }}>
      <button ref={btnRef} type="button" onClick={basculer} disabled={disabled} title="Insérer un emoji"
        style={{ padding: "8px 10px", background: ouvert ? "#eef2ff" : "#f1f5f9",
          border: `1px solid ${ouvert ? accent : "#e5e7eb"}`, borderRadius: 8,
          cursor: disabled ? "not-allowed" : "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
        😊
      </button>

      {ouvert && (
        <div ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999, width: LARGEUR,
            background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 12,
            boxShadow: "0 10px 34px rgba(0,0,0,.18)", overflow: "hidden" }}>

          {recents.length > 0 && (
            <div style={{ padding: "8px 9px 4px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                Récents
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 1 }}>
                {recents.slice(0, 8).map(e => (
                  <button key={`r-${e}`} type="button" onClick={() => choisir(e)} title={e}
                    style={boutonEmoji}
                    onMouseEnter={ev => { ev.currentTarget.style.background = "#f1f5f9"; }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = "transparent"; }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxHeight: 178, overflowY: "auto", padding: "7px 9px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 1 }}>
              {categorie.liste.map(e => (
                <button key={e} type="button" onClick={() => choisir(e)} title={e}
                  style={boutonEmoji}
                  onMouseEnter={ev => { ev.currentTarget.style.background = "#f1f5f9"; }}
                  onMouseLeave={ev => { ev.currentTarget.style.background = "transparent"; }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>
            {CATEGORIES.map(c => (
              <button key={c.cle} type="button" onClick={() => setOnglet(c.cle)} title={c.nom}
                style={{ flex: 1, padding: "8px 0", fontSize: 16, background: onglet === c.cle ? "#fff" : "transparent",
                  border: "none", borderTop: `2px solid ${onglet === c.cle ? accent : "transparent"}`,
                  cursor: "pointer", lineHeight: 1 }}>
                {c.ico}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const boutonEmoji = {
  fontSize: 19, background: "transparent", border: "none", borderRadius: 6,
  cursor: "pointer", padding: "3px 0", lineHeight: 1.35,
};

/**
 * Insère `emoji` dans `texte` à la position du curseur, et dit où replacer ce dernier.
 *
 * Exporté plutôt que recopié : chaque barre de saisie a son propre `useState` et sa propre
 * `ref`, mais la règle - remplacer la sélection courante, puis poser le curseur juste après
 * l'emoji - est la même partout.
 *
 * @returns {{ texte: string, curseur: number }}
 */
export function insererAuCurseur(texte, emoji, champ) {
  const valeur = String(texte || "");
  // Sans champ focalisé (panneau ouvert avant d'avoir cliqué dans la zone), on ajoute
  // à la fin : c'est ce que l'utilisateur attend, et non un emoji surgi au début.
  const debut = typeof champ?.selectionStart === "number" ? champ.selectionStart : valeur.length;
  const fin   = typeof champ?.selectionEnd   === "number" ? champ.selectionEnd   : valeur.length;
  return {
    texte: valeur.slice(0, debut) + emoji + valeur.slice(fin),
    curseur: debut + emoji.length,
  };
}
