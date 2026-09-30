/**
 * La confirmation affichée juste avant de basculer vers TouchPoint.
 *
 * POURQUOI ELLE EXISTE. Une fois sur TouchPoint, le paiement part et ne revient pas : aucun
 * remboursement n'est accordé. L'utilisateur quittait pourtant le site sans que rien ne le
 * lui dise, parfois d'un clic sur un bouton qu'il n'avait pas lu jusqu'au bout. Le dernier
 * moment où on peut encore l'arrêter, c'est ici.
 *
 * POURQUOI HORS DE REACT. Elle est appelée depuis `payerAvecTouchPoint`, une fonction
 * utilitaire partagée par les huit écrans qui encaissent. Y brancher un composant React
 * obligerait à monter un fournisseur dans chacun d'eux, et le premier écran ajouté demain
 * l'oublierait - l'avertissement disparaîtrait sans que personne le remarque. Injectée dans
 * le DOM, elle suit la fonction et couvre donc tous les appelants, présents et à venir.
 * Même procédé que la bannière « Session expirée » du tableau de bord.
 *
 * Rend une promesse : `true` si l'utilisateur confirme, `false` s'il renonce.
 */

const ID = "bet-confirmation-paiement";

const formaterMontant = (n) =>
  `${Number(n || 0).toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;

/** Échappe le texte inséré dans le HTML : un libellé d'offre vient d'une base, pas du code. */
const echapper = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function confirmerPaiementDefinitif({ montant, offreLabel }) {
  return new Promise((resoudre) => {
    // Un double-clic sur « Payer » ne doit pas empiler deux voiles : le second appel
    // renonce, et seul le premier décide.
    if (document.getElementById(ID)) return resoudre(false);

    const voile = document.createElement("div");
    voile.id = ID;
    voile.setAttribute("role", "dialog");
    voile.setAttribute("aria-modal", "true");
    voile.style.cssText =
      "position:fixed;inset:0;background:rgba(10,18,35,.72);z-index:999998;display:flex;" +
      "align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px);";

    voile.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:26px 28px;max-width:430px;width:100%;
                  box-shadow:0 30px 80px rgba(0,0,0,.35);font-family:inherit;box-sizing:border-box;">
        <div style="font-size:15px;font-weight:800;color:#0B1220;margin-bottom:6px;">
          ⚠️ Paiement définitif
        </div>
        <div style="font-size:13.5px;color:#4B5563;line-height:1.65;margin-bottom:16px;">
          Vous allez être redirigé(e) vers la page de paiement sécurisée TouchPoint.
        </div>

        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;
                    padding:12px 14px;margin-bottom:16px;font-size:13px;color:#334155;">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <span style="color:#64748B;">Montant</span>
            <strong style="color:#0B1220;">${formaterMontant(montant)}</strong>
          </div>
          ${offreLabel ? `
          <div style="display:flex;justify-content:space-between;gap:12px;margin-top:6px;">
            <span style="color:#64748B;flex-shrink:0;">Objet</span>
            <span style="text-align:right;">${echapper(offreLabel)}</span>
          </div>` : ""}
        </div>

        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;
                    padding:12px 14px;margin-bottom:18px;font-size:12.5px;color:#991B1B;line-height:1.6;">
          Une fois le paiement effectué, <strong>aucun remboursement ne pourra être accordé</strong>.
          <div style="color:#7F1D1D;margin-top:5px;">
            En cas d'erreur, contactez votre conseillère avant de payer.
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
          <button type="button" data-bet="annuler"
            style="padding:10px 18px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;
                   color:#374151;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
            Annuler
          </button>
          <button type="button" data-bet="payer"
            style="padding:10px 20px;border-radius:9px;border:none;background:#0B3C5D;color:#fff;
                   font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
            Payer ${formaterMontant(montant)}
          </button>
        </div>
      </div>
    `;

    const fermer = (reponse) => {
      document.removeEventListener("keydown", surTouche);
      voile.remove();
      resoudre(reponse);
    };
    // Échap renonce - jamais l'inverse : aucune touche ne doit pouvoir déclencher un paiement.
    const surTouche = (e) => { if (e.key === "Escape") fermer(false); };

    voile.addEventListener("click", (e) => {
      const action = e.target?.dataset?.bet;
      if (action === "payer")   return fermer(true);
      if (action === "annuler") return fermer(false);
      // Un clic à côté de la fenêtre vaut renoncement, comme partout ailleurs sur le site.
      if (e.target === voile)   return fermer(false);
    });
    document.addEventListener("keydown", surTouche);

    document.body.appendChild(voile);
    voile.querySelector('[data-bet="annuler"]')?.focus();
  });
}

export default confirmerPaiementDefinitif;
