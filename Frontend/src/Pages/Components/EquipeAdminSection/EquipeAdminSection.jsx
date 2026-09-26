import React, { useState, useEffect, useRef, useCallback } from "react";

/**
 * L'équipe administrative de BET, sur la page publique.
 *
 * Volontairement une GRILLE et non le défilement continu de la section coachs. Les deux
 * populations n'ont pas la même taille ni le même usage : on fait défiler 146 coachs pour
 * donner une impression d'ampleur, mais on lit une dizaine de dirigeants - on veut voir qui
 * ils sont, pas les regarder passer. Un carrousel les rendrait illisibles.
 *
 * Même source que les coachs (`equipe_photos`), distinguée par `categorie` : une seule
 * table, un seul écran d'administration, deux affichages.
 */

/**
 * Détecte l'entrée de la section dans le champ de vision.
 *
 * Un `ref` classique observé dans un `useEffect` ne convient PAS ici : cette section ne se
 * rend qu'une fois les membres chargés. Au montage, elle renvoie `null`, donc `ref.current`
 * vaut `null`, l'observateur n'observe rien - et quand la section apparaît enfin, plus
 * personne ne la regarde. Le titre et les cartes, dont l'opacité dépend de cette détection,
 * restent alors invisibles pour toujours.
 *
 * Un CALLBACK ref est appelé au moment exact où le nœud entre dans le DOM, quelle que soit
 * la date à laquelle cela arrive.
 */
function useInView(seuil = 0.15) {
  const [vu, setVu] = useState(false);
  const observateur = useRef(null);

  const ref = useCallback((noeud) => {
    if (observateur.current) { observateur.current.disconnect(); observateur.current = null; }
    if (!noeud || vu) return;
    observateur.current = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVu(true); },
      { threshold: seuil }
    );
    observateur.current.observe(noeud);
  }, [seuil, vu]);

  // Le navigateur peut ne pas fournir IntersectionObserver (vieux Safari, certains
  // navigateurs intégrés) : sans ce repli, la section resterait invisible chez eux.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") setVu(true);
    return () => observateur.current?.disconnect();
  }, []);

  return [ref, vu];
}

const MembreCarte = ({ membre, index, visible }) => {
  const [hov, setHov] = useState(false);
  const [imgKo, setImgKo] = useState(false);

  const initiales = (membre.nom || "")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(m => m[0]).join("").toUpperCase() || "BET";

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e8ecf5",
        overflow: "hidden",
        boxShadow: hov ? "0 16px 36px rgba(1,20,81,.13)" : "0 2px 10px rgba(1,20,81,.05)",
        transform: visible ? (hov ? "translateY(-5px)" : "none") : "translateY(18px)",
        opacity: visible ? 1 : 0,
        // Le décalage par index fait apparaître les cartes en cascade plutôt que d'un bloc.
        transition: `opacity .55s ease ${index * 0.06}s, transform .35s ease, box-shadow .35s ease`,
      }}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: "#eef2fb", overflow: "hidden" }}>
        {membre.img && !imgKo ? (
          <img
            src={membre.img}
            alt={membre.nom || "Membre de l'équipe BET"}
            loading="lazy"
            onError={() => setImgKo(true)}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              transform: hov ? "scale(1.06)" : "none", transition: "transform .45s ease",
            }}
          />
        ) : (
          // Repli sur les initiales : une carte sans visage reste une carte lisible,
          // là où une image cassée laisserait un trou gris.
          <div style={{
            width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg,#011451,#0c33ac)", color: "#fff",
            fontSize: "2rem", fontWeight: 800, letterSpacing: ".04em",
          }}>{initiales}</div>
        )}
      </div>

      <div style={{ padding: "14px 16px 18px", textAlign: "center" }}>
        <div style={{ fontSize: ".95rem", fontWeight: 800, color: "#011451", lineHeight: 1.3 }}>
          {membre.nom || "-"}
        </div>
        {membre.fonction && (
          <div style={{ fontSize: ".78rem", color: "#ff2945", fontWeight: 700, marginTop: 5 }}>
            {membre.fonction}
          </div>
        )}
        {membre.titre && membre.titre !== membre.fonction && (
          <div style={{ fontSize: ".76rem", color: "#64748b", marginTop: 3 }}>
            {membre.titre}
          </div>
        )}
      </div>
    </div>
  );
};

const EquipeAdminSection = ({ background = "#fff" }) => {
  const [ref, inView] = useInView();
  const [membres, setMembres] = useState([]);

  useEffect(() => {
    const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
    fetch(`${API}/api/equipe-photos/publics?categorie=administration`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (Array.isArray(data)) {
          setMembres(data.map(m => ({
            id: m.id, img: m.photo_url,
            nom: m.nom || "", fonction: m.fonction || "", titre: m.titre || "",
          })));
        }
      })
      .catch(() => {});
  }, []);

  // Tant que personne n'est publié, la section ne s'affiche pas du tout : un titre
  // « Notre direction » suivi du vide serait pire que son absence.
  if (membres.length === 0) return null;

  const FF = "'Montserrat','Segoe UI',sans-serif";
  const FD = "'DM Serif Display',Georgia,serif";

  return (
    <section ref={ref} style={{ padding: "80px 0", background, fontFamily: FF }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px" }}>

        <div style={{ textAlign: "center", marginBottom: 46 }}>
          <span style={{
            display: "inline-block", background: "#eef2fb", color: "#0c33ac",
            border: "1px solid #c7d4f5", borderRadius: 999, padding: "5px 16px",
            fontSize: ".72rem", fontWeight: 800, letterSpacing: ".08em", marginBottom: 14,
          }}>
            🏛️ ÉQUIPE ADMINISTRATIVE
          </span>
          <h2 style={{
            fontFamily: FD, fontSize: "clamp(1.8rem,4vw,2.6rem)", fontWeight: 400,
            margin: "0 0 14px", lineHeight: 1.15, color: "#011451",
            opacity: inView ? 1 : 0, transform: inView ? "none" : "translateY(20px)",
            transition: "all .6s ease",
          }}>
            Celles et ceux qui<br />
            <span style={{ color: "#ff2945", fontStyle: "italic" }}>font tourner BET</span>
          </h2>
          <div style={{ width: 60, height: 3, borderRadius: 2, margin: "0 auto 18px", background: "#e2e8f0" }} />
          <p style={{
            fontSize: "1rem", lineHeight: 1.6, maxWidth: 560, margin: "0 auto", color: "#64748b",
            opacity: inView ? 1 : 0, transition: "all .6s ease .15s",
          }}>
            Direction, encadrement pédagogique et accompagnement : l'équipe qui rend chaque
            formation possible.
          </p>
        </div>

        {/* `auto-fit` plutôt qu'un nombre de colonnes figé : la grille se remplit aussi
            bien avec quatre dirigeants qu'avec quinze, sans laisser de colonne vide. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 20,
        }}>
          {membres.map((m, i) => (
            <MembreCarte key={m.id} membre={m} index={i} visible={inView} />
          ))}
        </div>

      </div>
    </section>
  );
};

export default EquipeAdminSection;
