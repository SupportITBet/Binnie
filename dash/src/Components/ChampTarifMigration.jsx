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
export default function ChampTarifMigration({
  plan, valeur, onChange, accent = "#7A4BC4",
  desLeMoisEnCours = false, onChangeDesLeMoisEnCours,
}) {
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
  const totalPaye = (m) => (m.tranches || []).reduce((t, x) => t + Number(x.montant || 0), 0);

  const futursNonPayes = mois.filter(m => m.periode > periodeCourante && !estPaye(m)).length;
  const futursPayes    = mois.filter(m => m.periode > periodeCourante && estPaye(m)).length;
  const planOuvert     = !plan?.date_fin_formation;

  /* ── LES MOIS QUE LA CASE TOUCHERAIT ──
     Le texte annonçait « s'applique aux mois à venir », en comptant « à venir » au sens strict :
     POSTÉRIEURS au mois courant. Le mois EN COURS n'entrait donc dans aucun avertissement, et
     restait silencieusement à l'ancien prix - un apprenant transféré le 6 octobre gardait un
     octobre non payé au tarif du centre qu'il venait de quitter, sans qu'un mot le signale.
     On compte ici exactement ce que le serveur réécrira : à partir du mois courant, non payés,
     non neutralisés. Annoncer un nombre que l'écriture ne tiendrait pas serait pire que de se
     taire. */
  const moisReprisables = mois.filter(m =>
    m.periode >= periodeCourante && !m.neutralise && totalPaye(m) === 0);
  const moisEnCours = mois.find(m => m.periode === periodeCourante && !m.neutralise && totalPaye(m) === 0);

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

          {/* ── LA CASE, DÉCIDÉE DOSSIER PAR DOSSIER ──
              Par défaut, un nouveau tarif ne vaut que pour les mois CRÉÉS ENSUITE : c'est ce
              qui protège le passé. Mais le mois EN COURS, lui, existe déjà et n'est pas payé —
              un apprenant transféré le 6 octobre se voyait encore réclamer le prix du centre
              qu'il quittait. Ni le passé, ni la suite.
              Décochée par défaut, et la question n'est posée QUE s'il y a réellement quelque
              chose à reprixer : une case sur un plan sans mois intact n'aurait rien à faire. */}
          {moisReprisables.length > 0 && onChangeDesLeMoisEnCours && Number(valeur) > 0
            && Number(valeur) !== mensuelle && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10,
              padding: "9px 11px", borderRadius: 9, cursor: "pointer",
              background: desLeMoisEnCours ? "#fffbeb" : "#f8fafc",
              border: `1px solid ${desLeMoisEnCours ? "#fde68a" : "#e5e7eb"}` }}>
              <input type="checkbox" checked={desLeMoisEnCours}
                onChange={e => onChangeDesLeMoisEnCours(e.target.checked)}
                style={{ marginTop: 2, cursor: "pointer" }} />
              <span style={{ fontSize: 11.5, lineHeight: 1.55, color: desLeMoisEnCours ? "#92400e" : "#475569" }}>
                Appliquer <strong>dès le mois en cours</strong>
                {moisEnCours && <> ({moisEnCours.label || moisEnCours.periode})</>} —{" "}
                {moisReprisables.length} mois non payé{moisReprisables.length > 1 ? "s" : ""} pass
                {moisReprisables.length > 1 ? "eront" : "era"} à {fmt(valeur)}.
                <span style={{ color: "#94a3b8" }}> Les mois déjà réglés, même partiellement,
                ne sont jamais touchés.</span>
              </span>
            </label>
          )}

          <div style={{ fontSize: 11.5, color: "#6b5a8a", marginTop: 7, lineHeight: 1.55 }}>
            {desLeMoisEnCours ? (
              <>S'applique <strong>dès le mois en cours</strong> et aux mois suivants. Les mois
              déjà réglés, même partiellement, gardent leur montant.</>
            ) : (
              <>S'applique aux mois <strong>créés ensuite</strong> : les mois déjà écrits — y
              compris celui en cours — gardent leur montant, et aucun mois payé n'est touché.</>
            )}
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
