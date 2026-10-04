import React from "react";

/**
 * Le tarif d'une migration de canal, dans l'écran de transfert.
 *
 * POURQUOI MONTRER L'ANCIEN MONTANT. Saisir un nouveau tarif sans voir celui en cours, c'est
 * décider à l'aveugle : l'assistante qui accepte la migration ne connaît pas forcément le
 * dossier, et le prix négocié au comptoir n'est pas toujours celui du catalogue.
 *
 * POURQUOI UN SEUL COMPOSANT POUR DEUX ÉCRANS. L'assistante présentiel et l'onboarding ont
 * chacune leur propre écran de transfert - filtre de niveau, recherche de classes, création à
 * la volée - et la migration emprunte le leur plutôt que de leur en imposer un autre. Mais ce
 * qu'elles lisent sur le tarif doit être identique : deux copies auraient fini par expliquer
 * la règle différemment, alors qu'il n'y en a qu'une.
 *
 * CE QUI SE PASSE RÉELLEMENT, et que le texte doit dire sans mentir : seul `plan.mensualite`
 * est réécrit. Les trois générateurs de mois le lisent au moment de créer un mois, et aucun
 * ne recalcule les mois déjà écrits. Le passé garde son prix, la suite prend le nouveau.
 *
 * @param {object|null} plan   le plan_paiement du dossier, ou null tant qu'il charge
 * @param {string} valeur      le montant saisi
 * @param {Function} onChange
 * @param {string} accent
 */
export default function ChampTarifMigration({ plan, valeur, onChange, accent = "#7A4BC4" }) {
  const chargement = plan === null;
  const mensuelle  = Number(plan?.mensualite) || 0;
  const mois       = Array.isArray(plan?.mois_paiements) ? plan.mois_paiements : [];

  const periodeCourante = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const estPaye = (m) =>
    (m.tranches || []).reduce((t, x) => t + Number(x.montant || 0), 0) >= Number(m.montant || 0)
    && Number(m.montant || 0) > 0;

  const futursNonPayes = mois.filter(m => m.periode > periodeCourante && !estPaye(m)).length;
  const futursPayes    = mois.filter(m => m.periode > periodeCourante && estPaye(m)).length;
  const planOuvert     = !plan?.date_fin_formation;

  const fmt = (n) => `${Number(n || 0).toLocaleString("fr-FR").replace(/ | /g, " ")} F`;

  return (
    <div style={{ background: "#faf8ff", border: "1px solid #e4d9f8", borderRadius: 10, padding: "13px 15px", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#5b3a94", marginBottom: 9 }}>
        💰 Mensualité
      </div>

      {chargement ? (
        <div style={{ fontSize: 12.5, color: "#94a3b8" }}>Chargement du plan de paiement…</div>
      ) : !mensuelle ? (
        <div style={{ fontSize: 12.5, color: "#8b7ab0", lineHeight: 1.55 }}>
          Aucun plan mensuel sur ce dossier — il n'y a pas de mensualité à ajuster.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: "#6b5a8a" }}>Actuelle :</span>
            <strong style={{ fontSize: 15, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{fmt(mensuelle)}</strong>
            <span style={{ fontSize: 11.5, color: "#8b7ab0" }}>
              {planOuvert ? "plan ouvert" : "plan borné"}
              {futursNonPayes > 0 && ` · ${futursNonPayes} mois à venir non payé${futursNonPayes > 1 ? "s" : ""}`}
              {futursPayes > 0 && ` · ${futursPayes} déjà payé${futursPayes > 1 ? "s" : ""} d'avance`}
            </span>
          </div>

          <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#5b3a94", marginBottom: 5 }}>
            Nouvelle mensualité <span style={{ fontWeight: 400, color: "#8b7ab0" }}>(facultatif)</span>
          </label>
          <input type="number" min="0" step="1000" value={valeur}
            onChange={e => onChange(e.target.value)}
            placeholder="Laisser vide pour ne rien changer"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${accent}33`,
              fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />

          <div style={{ fontSize: 11.5, color: "#6b5a8a", marginTop: 7, lineHeight: 1.55 }}>
            S'applique aux mois <strong>à venir</strong> : les mois déjà écrits gardent leur
            montant, et aucun mois payé n'est touché.
            {!planOuvert && (
              <><br />⚠ Plan <strong>borné</strong> : ses mois sont déjà écrits, le nouveau
              montant ne s'appliquera qu'aux mois créés ensuite.</>
            )}
            {futursPayes > 0 && (
              <><br />⚠ {futursPayes} mois à venir {futursPayes > 1 ? "sont" : "est"} déjà
              réglé{futursPayes > 1 ? "s" : ""} à l'ancien tarif — {futursPayes > 1 ? "ils ne seront pas touchés" : "il ne sera pas touché"}.</>
            )}
          </div>
        </>
      )}
    </div>
  );
}
