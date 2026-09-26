import React, { useState, useEffect } from "react";
import MessagerieTab from "./MessagerieTab";
import ChatGroupe from "./ChatGroupe";
import GroupesLibres from "./GroupesLibres";
import { useGroupesChatUnreadTotal, useGroupesLibresNonLus } from "../hooks/useGroupeChat";

/**
 * Les trois canaux de messagerie réunis, pour un écran qui n'a pas sa propre liste de classes.
 *
 * Le superviseur et le conseil pédagogique construisent déjà la leur et câblent les trois
 * onglets à la main. Le SuperAdmin, lui, n'avait QUE la messagerie privée : ni chat de
 * classe, ni groupes. Ce composant lui apporte les trois sans imposer de tenir une liste de
 * classes dans un fichier qui dépasse déjà vingt mille lignes - il va la chercher lui-même.
 *
 * Les trois canaux restent distincts, et c'est délibéré : écrire à une classe atteint des
 * apprenants et leurs parents, écrire à un groupe n'atteint que du personnel. Les fondre en
 * un seul onglet ferait un jour partir un message interne devant des familles.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export default function MessagerieComplete({ accent = "#0f172a", accentClair = "#e2e8f0", profil }) {
  const [onglet, setOnglet] = useState("prive");
  const [classes, setClasses] = useState([]);
  const token = localStorage.getItem("admin_token");

  // Le profil vient du stockage local si l'écran hôte ne le passe pas : il sert à
  // identifier l'auteur des messages, et un message sans auteur n'est pas lisible.
  const moi = profil || (() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "null"); } catch { return null; }
  })();

  useEffect(() => {
    // Chargé une seule fois, et seulement si l'onglet des classes est ouvert au moins une
    // fois : la plupart des visites ne concernent que la messagerie privée.
    if (onglet !== "classe" || classes.length) return;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/groupes`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        setClasses(Array.isArray(d) ? d : (d.groupes || []));
      } catch { /* l'onglet affichera « aucune classe », ce qui est le comportement prévu */ }
    })();
  }, [onglet, classes.length, token]);

  /* Les non-lus du chat de classe ne peuvent être comptés que sur les classes CHARGÉES.
     Elles ne le sont qu'à l'ouverture de l'onglet : la pastille du chat de classe
     n'apparaît donc qu'après une première visite, et c'est assumé - précharger 24 classes
     pour une pastille coûterait plus que ce qu'elle rapporte. Celle des groupes, elle,
     repose sur une seule requête et fonctionne dès l'arrivée. */
  const classesNonLues = useGroupesChatUnreadTotal(classes.map(c => c.id), moi?.id);
  const groupesNonLus  = useGroupesLibresNonLus(token, moi?.id);

  const ONGLETS = [
    { cle: "prive",  libelle: "💬 Messagerie privée", badge: 0 },
    { cle: "classe", libelle: "👥 Chat de classe",    badge: classesNonLues },
    { cle: "libre",  libelle: "💬 Groupes",           badge: groupesNonLus },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 18, flexWrap: "wrap" }}>
        {ONGLETS.map(o => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            style={{ padding: "10px 20px", border: "none", marginBottom: -1, fontSize: 13, fontWeight: 600,
              cursor: "pointer", background: "transparent",
              borderBottom: onglet === o.cle ? `2px solid ${accent}` : "2px solid transparent",
              color: onglet === o.cle ? accent : "#64748b" }}>
            {o.libelle}
            {o.badge > 0 && (
              <span style={{ marginLeft: 7, display: "inline-block", minWidth: 18, padding: "1px 6px", borderRadius: 99, background: "#dc2626", color: "#fff", fontSize: 10.5, fontWeight: 800, lineHeight: "16px", textAlign: "center" }}>
                {o.badge > 99 ? "99+" : o.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {onglet === "prive" && <MessagerieTab accentColor={accent} profil={moi} token={token} />}
      {onglet === "classe" && (
        <ChatGroupe groupes={classes} profil={moi} token={token} accent={accent} accentClair={accentClair} />
      )}
      {onglet === "libre" && (
        <GroupesLibres profil={moi} token={token} accent={accent} accentClair={accentClair} />
      )}
    </div>
  );
}
