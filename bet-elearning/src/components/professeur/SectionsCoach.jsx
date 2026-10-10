import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { COULEURS } from '../../constants/couleurs';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const jeton = () => localStorage.getItem('bet_access_token') || localStorage.getItem('admin_token') || '';

/* `X-Plateforme` EST CE QUI SÉPARE LES DEUX GRILLES DE DISPONIBILITÉS. Sans lui, le serveur
   répond « dash » et le coach déclarerait ses créneaux e-learning dans la grille du
   présentiel - un coach peut être libre le mardi matin en ligne et pas en présentiel, le
   trajet n'est pas le même. */
const hdr = () => ({
  Authorization: `Bearer ${jeton()}`,
  'Content-Type': 'application/json',
  'X-Plateforme': 'bet-elearning',
});

/**
 * Les quatre écrans qui manquaient au coach de bet-elearning face à l'Espace Professeur de
 * dash : Mes tâches, Disponibilités, Mes contrats, Mon profil.
 */

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/* Quinze créneaux d'une heure, de 07h à 22h - LA MÊME DÉFINITION QUE DASH. Les identifiants
   (`h07`…`h21`) sont stockés en base : les faire diverger rendrait les deux grilles
   illisibles l'une pour l'autre. */
const CRENEAUX = Array.from({ length: 15 }, (_, i) => {
  const h = 7 + i;
  const pad = (n) => String(n).padStart(2, '0');
  return { id: `h${pad(h)}`, label: `${pad(h)}h`, debut: `${pad(h)}:00`, fin: `${pad(h + 1)}:00` };
});

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

function Entete({ icone, titre, soustitre }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 }}>{icone} {titre}</div>
      {soustitre && <div style={{ fontSize: 12.5, color: COULEURS.gris400, lineHeight: 1.6, maxWidth: 760 }}>{soustitre}</div>}
    </div>
  );
}

function Vide({ icone, titre, detail }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 20px', background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
      <div style={{ fontSize: 33, marginBottom: 10 }}>{icone}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>{titre}</div>
      {detail && <div style={{ fontSize: 12.5, color: COULEURS.gris400, marginTop: 6, maxWidth: 450, margin: '6px auto 0', lineHeight: 1.6 }}>{detail}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   1. MES TÂCHES
   ══════════════════════════════════════════════════════════════
   Comme pour les autres rôles : cet écran ne crée rien, il compte ce que les autres onglets
   affichent déjà et renvoie vers eux. */
export function SectionCoachMesTaches({ couleur, profile }) {
  const [chargement, setChargement] = useState(true);
  const [t, setT] = useState({ dispoVide: false, demandes: 0, seancesSemaine: 0 });

  useEffect(() => {
    if (!profile?.id) return;
    const now = new Date();
    let vivant = true;
    const lire = (url) => fetch(`${API}${url}`, { headers: hdr() }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));

    Promise.all([
      lire(`/api/coachs/disponibilites?mois=${now.getMonth() + 1}&annee=${now.getFullYear()}`),
      lire(`/api/remplacements?absent_id=${profile.id}&plateforme=bet-elearning`),
      lire(`/api/elearning/seances?coach_id=${profile.id}`),
    ]).then(([dd, dr, ds]) => {
      if (!vivant) return;
      const dans7j = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
      const seances = Array.isArray(ds.seances) ? ds.seances : [];
      setT({
        // « Aucun créneau déclaré » ET « tous déclarés indisponibles » sont deux choses
        // différentes : seule l'absence totale de ligne est une tâche à faire.
        dispoVide: (dd.disponibilites || []).length === 0,
        demandes: (dr.remplacements || []).filter(r => r.statut === 'a_pourvoir').length,
        seancesSemaine: seances.filter(s => {
          const d = new Date(`${s.date_seance || s.date}T${(s.heure_debut || '00:00').slice(0, 5)}:00`);
          return d >= now && d <= dans7j;
        }).length,
      });
    }).finally(() => { if (vivant) setChargement(false); });
    return () => { vivant = false; };
  }, [profile?.id]);

  const taches = [
    { icone: '🗓️', label: `Déclarer vos disponibilités de ${MOIS_FR[new Date().getMonth()]}`, n: t.dispoVide ? 1 : 0, vers: '/professeur/disponibilites', urgent: true },
    { icone: '📨', label: 'Demandes de remplacement à pourvoir', n: t.demandes, vers: '/professeur/demandes' },
    { icone: '📅', label: 'Séances dans les 7 prochains jours',  n: t.seancesSemaine, vers: '/professeur/planning' },
  ];
  const ouvertes = taches.filter(x => x.n > 0);
  const total = taches.reduce((s, x) => s + x.n, 0);

  return (
    <div>
      <Entete icone="✅" titre="Mes tâches"
        soustitre={chargement ? 'Calcul en cours…'
          : total > 0 ? `${total} élément${total > 1 ? 's' : ''} à traiter.`
          : 'Rien à traiter pour le moment — tout est à jour.'} />

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 56, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
      ) : ouvertes.length === 0 ? (
        <Vide icone="🎉" titre="Aucune tâche en attente"
          detail="Vos disponibilités sont déclarées, aucune demande n'attend et aucune séance n'est programmée dans les sept prochains jours." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
          {ouvertes.map(x => (
            <a key={x.label} href={x.vers}
              style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', background: COULEURS.blanc,
                border: `1.5px solid ${COULEURS.gris200}`, borderLeft: `4px solid ${x.urgent ? '#DC2626' : couleur}`,
                borderRadius: 14, padding: '16px 18px' }}>
              <span style={{ fontSize: 23 }}>{x.icone}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>{x.label}</span>
              {!x.urgent && (
                <span style={{ background: `${couleur}18`, color: couleur, borderRadius: 99, fontSize: 13, fontWeight: 800, padding: '3px 11px' }}>{x.n}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   2. DISPONIBILITÉS
   ══════════════════════════════════════════════════════════════
   LA GRILLE EST PROPRE À BET E-LEARNING. Jusqu'ici aucun écran ne permettait d'en déclarer
   ici : les 840 lignes en base venaient toutes de l'Espace Professeur de dash, et le dossier
   coach du superviseur affichait donc des créneaux pris pour le présentiel. Cet écran est la
   source qui manquait. */
export function SectionCoachDisponibilites({ couleur }) {
  const maintenant = new Date();
  const [mois, setMois]   = useState(maintenant.getMonth() + 1);
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [grille, setGrille] = useState({});     // { "Lundi|h07": true }
  const [verrous, setVerrous] = useState({});   // créneaux posés par l'administration
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [avertissement, setAvertissement] = useState(null);

  const charger = useCallback(async (m, a) => {
    setChargement(true);
    try {
      const r = await fetch(`${API}/api/coachs/disponibilites?mois=${m}&annee=${a}`, { headers: hdr() });
      const d = r.ok ? await r.json() : {};
      const g = {}, v = {};
      (d.disponibilites || []).forEach(s => {
        const cle = `${s.jour}|${s.creneau}`;
        g[cle] = !!s.dispo;
        if (s.verrouille) v[cle] = true;
      });
      setGrille(g); setVerrous(v);
    } catch { setGrille({}); setVerrous({}); }
    finally { setChargement(false); }
  }, []);

  useEffect(() => { charger(mois, annee); }, [charger, mois, annee]);

  const basculer = (jour, creneau) => {
    const cle = `${jour}|${creneau}`;
    // Un créneau VERROUILLÉ a été posé par l'administration : le coach le voit mais ne le
    // change pas. Le masquer serait pire - il croirait s'être trompé.
    if (verrous[cle]) { toast('Ce créneau est verrouillé par l\'administration.', { icon: '🔒' }); return; }
    setGrille(g => ({ ...g, [cle]: !g[cle] }));
  };

  const basculerJour = (jour) => {
    const tout = CRENEAUX.every(c => grille[`${jour}|${c.id}`] || verrous[`${jour}|${c.id}`]);
    setGrille(g => {
      const n = { ...g };
      CRENEAUX.forEach(c => { if (!verrous[`${jour}|${c.id}`]) n[`${jour}|${c.id}`] = !tout; });
      return n;
    });
  };

  async function enregistrer() {
    if (envoi) return;
    setEnvoi(true); setAvertissement(null);
    try {
      const slots = [];
      JOURS.forEach(j => CRENEAUX.forEach(c => {
        slots.push({ jour: j, creneau: c.id, debut: c.debut, fin: c.fin, dispo: !!grille[`${j}|${c.id}`] });
      }));
      const r = await fetch(`${API}/api/coachs/disponibilites`, {
        method: 'POST', headers: hdr(), body: JSON.stringify({ slots, mois, annee }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Enregistrement impossible');
      // Le serveur prévient si la séparation par plateforme n'est pas encore installée :
      // les créneaux seraient alors communs aux deux, ce qui n'est pas ce qu'on annonce.
      if (d.avertissement) setAvertissement(d.avertissement);
      toast.success(`Disponibilités de ${MOIS_FR[mois - 1]} enregistrées ✓`);
    } catch (e) { toast.error(e.message); }
    finally { setEnvoi(false); }
  }

  const nbCoches = Object.entries(grille).filter(([, v]) => v).length;
  const select = { padding: '7px 11px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12.5, fontFamily: 'inherit', color: COULEURS.navy };

  return (
    <div>
      <Entete icone="🗓️" titre="Mes disponibilités"
        soustitre={"Indiquez vos créneaux libres pour les cours EN LIGNE. Ils sont distincts de ceux "
          + "que vous déclarez pour le présentiel : vous pouvez être disponible ici et pas là-bas. "
          + "La disponibilité se renseigne chaque mois."} />

      {avertissement && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '11px 15px', marginBottom: 16, fontSize: 12.5, color: '#78350F', lineHeight: 1.6 }}>
          ⚠️ {avertissement}
        </div>
      )}

      <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={mois} onChange={e => setMois(Number(e.target.value))} style={select} aria-label="Mois">
          {MOIS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={select} aria-label="Année">
          {[maintenant.getFullYear(), maintenant.getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={{ fontSize: 12, color: COULEURS.gris400 }}>
          {nbCoches} créneau{nbCoches > 1 ? 'x' : ''} déclaré{nbCoches > 1 ? 's' : ''}
        </span>
        <button onClick={enregistrer} disabled={envoi || chargement}
          style={{ marginLeft: 'auto', padding: '9px 20px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
            background: (envoi || chargement) ? COULEURS.gris200 : couleur, color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: (envoi || chargement) ? 'default' : 'pointer' }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 56, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
      ) : (
        <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11.5, minWidth: 640, width: '100%' }}>
              <thead>
                <tr style={{ background: COULEURS.gris50 }}>
                  <th style={{ padding: '9px 11px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase' }}>Jour</th>
                  {CRENEAUX.map(c => (
                    <th key={c.id} style={{ padding: '9px 3px', fontSize: 10, fontWeight: 700, color: COULEURS.gris600 }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {JOURS.map(j => (
                  <tr key={j} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                    <td style={{ padding: '7px 11px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => basculerJour(j)} title="Tout cocher ou tout décocher pour ce jour"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 12.5, fontWeight: 700, color: COULEURS.navy, padding: 0 }}>
                        {j}
                      </button>
                    </td>
                    {CRENEAUX.map(c => {
                      const cle = `${j}|${c.id}`;
                      const actif = !!grille[cle];
                      const bloque = !!verrous[cle];
                      return (
                        <td key={c.id} style={{ padding: 2, textAlign: 'center' }}>
                          <button onClick={() => basculer(j, c.id)}
                            title={bloque ? 'Verrouillé par l\'administration' : `${j} ${c.debut} – ${c.fin}`}
                            style={{ width: 26, height: 26, borderRadius: 6, cursor: bloque ? 'not-allowed' : 'pointer',
                              border: `1px solid ${actif ? couleur : COULEURS.gris200}`,
                              background: bloque ? COULEURS.gris200 : actif ? couleur : COULEURS.blanc,
                              color: '#fff', fontSize: 11, lineHeight: 1, padding: 0 }}>
                            {bloque ? '🔒' : actif ? '✓' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: COULEURS.gris400, marginTop: 12, lineHeight: 1.6 }}>
        Cliquez sur un nom de jour pour cocher ou décocher toute la ligne. Les créneaux
        marqués 🔒 ont été posés par l'administration et ne peuvent pas être modifiés ici.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   3. MES CONTRATS
   ══════════════════════════════════════════════════════════════
   Les classes dont le coach est titulaire. Comme chez dash, le COACHING PRIVÉ en est exclu :
   une classe d'une seule place n'est pas un contrat de groupe, et la mêler aux autres
   fausserait le compte d'engagements. */
export function SectionCoachContrats({ couleur, profile }) {
  const [classes, setClasses] = useState(null);

  useEffect(() => {
    if (!profile?.id) return;
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/classes-elearning?coach_id=${profile.id}`, { headers: hdr() });
        const d = r.ok ? await r.json() : {};
        if (vivant) setClasses(Array.isArray(d.classes) ? d.classes : []);
      } catch { if (vivant) setClasses([]); }
    })();
    return () => { vivant = false; };
  }, [profile?.id]);

  if (classes === null) return <div style={{ textAlign: 'center', padding: 56, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>;

  const groupes = classes.filter(c => Number(c.capacite_max) !== 1);
  const actifs = groupes.filter(c => c.statut === 'actif');

  return (
    <div>
      <Entete icone="📋" titre="Mes contrats"
        soustitre="Les classes de groupe dont vous êtes titulaire sur BET E-Learning. Le coaching privé n'y figure pas." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 20 }}>
        {[
          ['Contrats actifs', actifs.length, '#16A34A'],
          ['Toutes périodes', groupes.length, couleur],
          ['Apprenants suivis', groupes.reduce((s, c) => s + (c.nb_apprenants || 0), 0), '#8B5CF6'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderTop: `3px solid ${c}`, borderRadius: 12, padding: '15px 17px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
            <div style={{ fontSize: 21, fontWeight: 900, color: c, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>

      {groupes.length === 0 ? (
        <Vide icone="📋" titre="Aucun contrat de groupe"
          detail="Vous n'êtes titulaire d'aucune classe de groupe e-learning. Vos éventuelles classes présentiel relèvent de dash." />
      ) : (
        <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: COULEURS.gris50 }}>
                  {['Classe', 'Niveau', 'Entreprise', 'Apprenants', 'Début', 'Fin', 'Statut'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupes.map(c => (
                  <tr key={c.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: COULEURS.navy }}>{c.nom}</td>
                    <td style={{ padding: '10px 14px' }}>{c.niveau || '-'}</td>
                    <td style={{ padding: '10px 14px' }}>{c.entreprise_nom || '-'}</td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_apprenants ?? '-'}{c.capacite_max ? ` / ${c.capacite_max}` : ''}</td>
                    <td style={{ padding: '10px 14px' }}>{fmtDate(c.date_debut)}</td>
                    <td style={{ padding: '10px 14px' }}>{fmtDate(c.date_fin)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '3px 10px',
                        background: c.statut === 'actif' ? '#D1FAE5' : COULEURS.gris100,
                        color: c.statut === 'actif' ? '#065F46' : COULEURS.gris600 }}>
                        {c.statut || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   4. MON PROFIL
   ══════════════════════════════════════════════════════════════ */
export function SectionCoachProfil({ couleur }) {
  const [profil, setProfil] = useState(null);
  const [surnom, setSurnom] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/mon-espace/profil`, { headers: hdr() });
        const d = r.ok ? await r.json() : {};
        if (vivant && d.profil) { setProfil(d.profil); setSurnom(d.profil.surnom || ''); }
      } catch { /* l'écran dira qu'il n'a rien pu charger */ }
    })();
    return () => { vivant = false; };
  }, []);

  async function enregistrer() {
    setEnvoi(true);
    try {
      const r = await fetch(`${API}/api/mon-espace/profil`, {
        method: 'PATCH', headers: hdr(), body: JSON.stringify({ surnom: surnom.trim() || null }),
      });
      if (!r.ok) throw new Error('Enregistrement impossible');
      setProfil(p => ({ ...p, surnom: surnom.trim() || null }));
      toast.success('Profil mis à jour ✓');
    } catch (e) { toast.error(e.message); }
    finally { setEnvoi(false); }
  }

  if (!profil) return <Vide icone="👤" titre="Profil indisponible" detail="Impossible de charger votre fiche pour le moment." />;

  const champ = {
    width: '100%', padding: '10px 13px', borderRadius: 9, border: `1.5px solid ${COULEURS.gris200}`,
    fontSize: 13.5, fontFamily: 'inherit', color: COULEURS.navy, boxSizing: 'border-box', outline: 'none',
  };
  const label = { display: 'block', fontSize: 11.5, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 };

  return (
    <div>
      <Entete icone="👤" titre="Mon profil"
        soustitre="Votre identité telle qu'elle figure sur votre fiche coach." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14, marginBottom: 22 }}>
        {[['Prénom', profil.prenom || '-'], ['Nom', profil.nom || '-'], ['Adresse e-mail', profil.email || '-']].map(([l, v]) => (
          <div key={l} style={{ background: COULEURS.gris50, borderRadius: 10, padding: '12px 15px' }}>
            <div style={label}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '20px 22px', maxWidth: 520 }}>
        <label style={label} htmlFor="surnom-coach">Comment souhaitez-vous qu'on vous appelle ?</label>
        <input id="surnom-coach" value={surnom} onChange={e => setSurnom(e.target.value)} maxLength={40}
          placeholder={profil.prenom || 'Votre surnom'} style={champ} />
        <div style={{ fontSize: 11.5, color: COULEURS.gris400, marginTop: 7, lineHeight: 1.6 }}>
          Ce surnom remplace votre prénom dans l'application. Votre nom officiel reste celui de
          votre fiche — il figure sur les bulletins et les attestations de vos apprenants, et ne
          se change que par l'administration.
        </div>
        <button onClick={enregistrer} disabled={envoi}
          style={{ marginTop: 14, padding: '10px 20px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
            background: envoi ? COULEURS.gris200 : couleur, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: envoi ? 'default' : 'pointer' }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
