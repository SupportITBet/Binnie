import React from "react";

/**
 * L'identifiant avec lequel un apprenant se connecte - et rien d'autre à sa place.
 *
 * Le tableau commercial affichait le NUMÉRO DE TÉLÉPHONE à la place de l'identifiant quand
 * celui-ci commençait par `tel.`. L'assistante voyait donc « +2250777880082 » alors que
 * l'apprenant doit taper `tel.2250777880082.doumbiaseydou@betacademy.app` : impossible de
 * l'aider à se connecter, et impossible de deviner l'écart.
 *
 * Ici, la règle est simple : **la chaîne de connexion est toujours affichée**, telle
 * qu'elle se saisit. Le téléphone vient en dessous, comme contexte - c'est une information
 * utile, mais ce n'est pas l'identifiant.
 *
 * Sur 74 apprenants, 22 portent un identifiant technique : ce n'est pas un cas marginal.
 */

/** Ce que l'identifiant est réellement, pour que l'assistante sache à quoi s'attendre. */
export function natureIdentifiant(email = "") {
  const e = String(email || "");
  if (e.startsWith("tel.")) {
    return {
      cle: "telephone",
      label: "IDENTIFIANT (BASÉ SUR LE TÉLÉPHONE)",
      // Un compte sans adresse ne reçoit aucun courrier : le dire évite qu'on attende
      // une réponse à un e-mail qui n'est jamais parti.
      aide: "Compte créé sans adresse e-mail - cet apprenant ne reçoit aucun courrier.",
    };
  }
  if (e.endsWith("@betacademy.app")) {
    return {
      cle: "technique",
      label: "IDENTIFIANT TECHNIQUE",
      aide: "Adresse générée par la plateforme - cet apprenant ne reçoit aucun courrier.",
    };
  }
  return { cle: "email", label: "EMAIL DE CONNEXION", aide: null };
}

export default function IdentifiantConnexion({
  email, telephone, compact = false, style,
}) {
  const n = natureIdentifiant(email);
  const identifiant = String(email || "").trim();

  return (
    <div style={style}>
      <div style={{ fontSize: compact ? 9 : 9.5, color: "#9ca3af", fontWeight: 700, marginBottom: 3 }}>
        {n.label}
      </div>

      <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: "#0f172a", wordBreak: "break-all", lineHeight: 1.35 }}>
        {identifiant || "-"}
      </div>

      {/* Le téléphone EN DESSOUS, jamais à la place : c'est un moyen de joindre la
          personne, pas ce qu'elle tape pour entrer. */}
      {telephone && (
        <div style={{ fontSize: compact ? 10.5 : 11, color: "#64748b", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
          <span>📞</span>
          <span style={{ fontFamily: "monospace" }}>{telephone}</span>
        </div>
      )}

      {n.aide && (
        <div style={{ fontSize: compact ? 10 : 10.5, color: "#b45309", marginTop: 4, lineHeight: 1.45 }}>
          {n.aide}
        </div>
      )}
    </div>
  );
}
