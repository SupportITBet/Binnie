import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, doc, query, orderBy, limit, onSnapshot,
  addDoc, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { FIREBASE_ACTIF } from '../../services/firebase';
import { COULEURS } from '../../constants/couleurs';
import { envoyerFichier, maxMoPour } from '../../utils/uploadFichier';
import { useEnregistreurVocal, microDisponible, dureeLisible } from '../../hooks/useEnregistreurVocal';
import SelecteurEmoji, { insererAuCurseur } from './SelecteurEmoji';

/**
 * Groupes de discussion libres - ceux qui ne suivent pas une classe.
 *
 * ⚠️ SEULE conversation PARTAGÉE avec `dash`. Les chats de classe et la messagerie privée
 * sont propres à chaque plateforme, avec des architectures différentes, et c'est voulu.
 * Un groupe libre, lui, est un objet UNIQUE : son appartenance vit dans une seule table
 * Supabase (`conversations_groupes` + `conversation_membres`), ses membres sont du
 * personnel qui travaille sur les deux plateformes. Lui donner deux fils séparés donnerait
 * deux conversations pour un même groupe - d'où le format de message commun ci-dessous :
 * `chats/libre_{id}/messages` avec `texte · auteur_id · auteur_nom · fichier · createdAt`.
 *
 * Aucun mot de cet écran ne qualifie ces groupes de « privés » : les règles Firestore du
 * projet sont ouvertes, et promettre le secret serait le promettre à tort.
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const FENETRE = 200;

const jeton = () => localStorage.getItem('bet_access_token') || localStorage.getItem('admin_token') || '';

const ROLES_LISIBLES = {
  coach: 'Coach', professeur_titulaire: 'Coach', commercial: 'Commercial',
  onboarding: 'Onboarding', marketing: 'Marketing', rh: 'RH',
  superviseur: 'Superviseur', deputy_superviseur: 'Deputy superviseur',
  pedagogical_advisor: 'Conseil pédagogique', super_admin: 'Super admin', admin: 'Admin',
};
const libelleRole = (r) => ROLES_LISIBLES[r] || r || '-';

const initiales = (nom) =>
  String(nom || '?').trim().split(/\s+/).slice(0, 2).map(m => m[0]).join('').toUpperCase();

const estAudio = (nom = '') =>
  ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'webm', 'opus'].includes(String(nom).split('.').pop().toLowerCase());

const estImage = (nom = '') =>
  ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(String(nom).split('.').pop().toLowerCase());

const S = {
  carte: { background: COULEURS.blanc, borderRadius: 14, border: `1px solid ${COULEURS.gris200}`, padding: 18 },
  champ: { padding: '9px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  bouton: (fond) => ({ padding: '9px 16px', background: fond, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }),
};

/* ══════════════════════════════════════════════════════════════
   Le fil d'un groupe
══════════════════════════════════════════════════════════════ */

function FilGroupe({ conversation, profile, couleur }) {
  const [messages, setMessages] = useState([]);
  const [fenetre, setFenetre] = useState(FENETRE);
  const [encorePlus, setEncorePlus] = useState(false);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  // La zone de saisie, pour insérer un emoji là où est le curseur.
  const champSaisieRef = useRef(null);
  /* LA PIÈCE JOINTE EST RÉSERVÉE AU PERSONNEL. Le type d'upload `piece-jointe` exige un
     jeton d'administration : la sélection d'un apprenant échouait en 403, sans
     explication. Le bouton est grisé et dit la raison ; micro et emojis restent ouverts. */
  const sansPieceJointe = ['apprenant', 'parent'].includes(profile?.role);
  const [citation, setCitation] = useState(null);
  const [surligne, setSurligne] = useState(null);
  const [pct, setPct] = useState(0);
  const finRef = useRef(null);
  const fichierRef = useRef(null);
  const vocal = useEnregistreurVocal({ dureeMaxS: 180 });

  const convId = `libre_${conversation.id}`;

  useEffect(() => { setFenetre(FENETRE); setCitation(null); setSurligne(null); vocal.annuler(); }, [conversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!FIREBASE_ACTIF || !db) return;
    const parent = doc(db, 'chats', convId);
    getDoc(parent).then(snap => {
      if (!snap.exists()) {
        setDoc(parent, { type: 'libre', groupe_id: conversation.id, created_at: serverTimestamp() }, { merge: true }).catch(() => {});
      }
    }).catch(() => {});

    /* Tri DESCENDANT puis remise à l'endroit : en ascendant, `limit` renvoie les messages
       les plus ANCIENS, et passé le plafond la conversation se fige sur son début - aucun
       message nouveau n'apparaît plus. Même correctif que côté dash. */
    const q = query(collection(db, 'chats', convId, 'messages'), orderBy('createdAt', 'desc'), limit(fenetre));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
      setEncorePlus(snap.size >= fenetre);
    });
    return unsub;
  }, [convId, conversation.id, fenetre]);

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, convId]);

  /* MARQUER COMME LU. Sans cet horodatage, la pastille de l'onglet ne s'éteindrait jamais.
     Objet IMBRIQUÉ et non clé pointée : `setDoc` n'interprète pas les chemins pointés -
     seul `updateDoc` le fait - et `{ "lastRead.uid": … }` créerait un champ portant
     littéralement un point dans son nom, que la lecture ne retrouverait pas. */
  useEffect(() => {
    if (!FIREBASE_ACTIF || !db || !profile?.id || !messages.length) return;
    setDoc(doc(db, 'chats', convId), { lastRead: { [profile.id]: serverTimestamp() } }, { merge: true }).catch(() => {});
  }, [convId, profile?.id, messages.length]);

  const auteur = `${profile?.prenom || ''} ${profile?.nom || ''}`.trim() || '-';

  /** L'extrait FIGÉ du message cité : le résoudre à l'affichage donnerait une citation
   *  vide dès que le message d'origine sort de la fenêtre chargée. */
  const extraitDe = (m) => {
    if (m.fichier) return `${estAudio(m.fichier.nom) ? '🎙️' : '📎'} ${m.fichier.nom || 'pièce jointe'}`;
    const t = String(m.texte || '').replace(/\s+/g, ' ').trim();
    return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  };

  const allerAuMessage = (id) => {
    const el = document.getElementById(`msg-gl-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setSurligne(id);
    setTimeout(() => setSurligne(v => (v === id ? null : v)), 1600);
  };

  const ecrire = async (contenu, fichier = null) => {
    if (!FIREBASE_ACTIF || !db) return;
    await addDoc(collection(db, 'chats', convId, 'messages'), {
      auteur_id: profile?.id, auteur_nom: auteur,
      texte: contenu || '', fichier: fichier || null,
      type: fichier ? 'fichier' : 'texte',
      repond_a: citation || null,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'chats', convId), { lastMessageAt: serverTimestamp() }, { merge: true }).catch(() => {});
    setCitation(null);
  };

  const envoyerTexte = async () => {
    const t = texte.trim();
    if (!t || envoi) return;
    setEnvoi(true); setTexte('');
    try { await ecrire(t); } finally { setEnvoi(false); }
  };

  const envoyerFichierChoisi = async (f) => {
    if (!f || envoi) return;
    const max = maxMoPour('piece-jointe', f.type);
    if (f.size > max * 1024 * 1024) { alert(`Fichier trop lourd - maximum ${max} Mo`); return; }
    setEnvoi(true); setPct(0);
    try {
      const d = await envoyerFichier(f, 'piece-jointe', { onProgress: setPct });
      if (d?.url) await ecrire('', { nom: f.name, url: d.url, type: f.type });
    } catch (e) { alert(e.message || 'Envoi impossible'); }
    finally { setEnvoi(false); setPct(0); }
  };

  const envoyerVocal = async () => {
    const f = vocal.fichier();
    if (!f || envoi) return;
    setEnvoi(true); setPct(0);
    try {
      /* `message` et non `piece-jointe` : ce dernier exige un jeton d'administration, et
         la note vocale d'un apprenant échouait donc en 403. 5 Mo couvrent largement les
         trois minutes de l'enregistreur. */
      const d = await envoyerFichier(f, 'message', { onProgress: setPct });
      if (d?.url) { await ecrire('', { nom: f.name, url: d.url, type: 'audio' }); vocal.reinitialiser(); }
    } catch (e) { alert(e.message || 'Envoi impossible'); }
    finally { setEnvoi(false); setPct(0); }
  };

  return (
    <div style={{ background: COULEURS.blanc, borderRadius: 14, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${COULEURS.gris200}`, background: `${couleur}0D`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: couleur }}>💬 {conversation.nom}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: COULEURS.gris400 }}>
          Visible par les membres du groupe · lisible par la direction
        </span>
      </div>

      <div style={{ height: 380, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: COULEURS.gris400, paddingTop: 60, fontSize: 13 }}>
            Aucun message - commencez la conversation !
          </div>
        )}

        {/* Remonter dans l'historique. Le bouton disparaît au début du fil. */}
        {encorePlus && (
          <button onClick={() => setFenetre(f => f + FENETRE)}
            style={{ alignSelf: 'center', background: COULEURS.gris100, border: `1px solid ${COULEURS.gris200}`, color: COULEURS.gris600, borderRadius: 99, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
            ↑ Messages précédents
          </button>
        )}

        {messages.map(m => {
          const moi = m.auteur_id === profile?.id;
          const bulle = {
            padding: '10px 14px', maxWidth: '100%',
            borderRadius: moi ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            background: moi ? couleur : COULEURS.gris100,
            color: moi ? '#fff' : COULEURS.navy, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
          };
          return (
            <div key={m.id} id={`msg-gl-${m.id}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: moi ? 'flex-end' : 'flex-start',
                background: surligne === m.id ? `${couleur}18` : 'transparent',
                borderRadius: 10, padding: surligne === m.id ? '4px 6px' : 0, transition: 'background .35s ease' }}>
              {!moi && <span style={{ fontSize: 10, fontWeight: 700, color: couleur, marginBottom: 2, paddingLeft: 4 }}>{m.auteur_nom}</span>}

              {m.repond_a && (
                <button onClick={() => allerAuMessage(m.repond_a.id)} title="Aller au message cité"
                  style={{ maxWidth: '72%', textAlign: 'left', cursor: 'pointer', border: 'none',
                    borderLeft: `3px solid ${moi ? couleur : COULEURS.gris400}`,
                    background: moi ? `${couleur}1A` : COULEURS.gris100,
                    borderRadius: '10px 10px 0 0', padding: '6px 10px', marginBottom: 2, fontFamily: 'inherit' }}>
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: moi ? couleur : COULEURS.gris600 }}>{m.repond_a.auteur_nom || '-'}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: COULEURS.gris600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.repond_a.extrait || '…'}</span>
                </button>
              )}

              <div style={{ maxWidth: '72%' }}>
                {m.fichier && estAudio(m.fichier.nom) ? (
                  <div style={{ ...bulle, minWidth: 230, display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, opacity: .85 }}>
                      <span>🎙️</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(m.fichier.nom || '').startsWith('note-vocale') ? 'Note vocale' : m.fichier.nom}
                      </span>
                    </div>
                    {/* `preload="metadata"` : la durée s'affiche sans télécharger tout le son. */}
                    <audio controls preload="metadata" src={m.fichier.url} style={{ width: '100%', height: 34, borderRadius: 6 }} />
                  </div>
                ) : m.fichier ? (
                  <a href={m.fichier.url} target="_blank" rel="noreferrer"
                    style={{ ...bulle, display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
                    <span style={{ fontSize: 20 }}>{estImage(m.fichier.nom) ? '🖼️' : '📎'}</span>
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fichier.nom}</span>
                  </a>
                ) : (
                  <div style={bulle}>{m.texte}</div>
                )}
              </div>

              <span style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                <button onClick={() => setCitation({ id: m.id, auteur_nom: m.auteur_nom, extrait: extraitDe(m) })}
                  title="Répondre à ce message"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COULEURS.gris400, fontSize: 12, padding: 0, lineHeight: 1 }}>
                  ↩︎
                </button>
              </span>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {citation && (
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${COULEURS.gris200}`, background: COULEURS.gris50, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, color: COULEURS.gris400 }}>↩︎</span>
          <div style={{ flex: 1, minWidth: 0, borderLeft: `3px solid ${couleur}`, paddingLeft: 9 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: couleur }}>Réponse à {citation.auteur_nom}</div>
            <div style={{ fontSize: 11.5, color: COULEURS.gris600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{citation.extrait || '…'}</div>
          </div>
          <button onClick={() => setCitation(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: COULEURS.gris400, padding: 4 }}>✕</button>
        </div>
      )}

      {vocal.etat === 'enregistrement' && (
        <div style={{ padding: '9px 16px', borderTop: `1px solid ${COULEURS.gris200}`, background: '#FEF2F2', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#DC2626' }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#991B1B', fontVariantNumeric: 'tabular-nums' }}>{dureeLisible(vocal.duree)}</span>
          <span style={{ fontSize: 11.5, color: '#B91C1C', flex: 1 }}>Enregistrement… arrêt automatique à {dureeLisible(vocal.dureeMaxS)}</span>
          <button onClick={vocal.annuler} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#991B1B', fontWeight: 700, padding: '4px 8px', fontFamily: 'inherit' }}>Annuler</button>
          <button onClick={vocal.arreter} style={{ ...S.bouton('#DC2626'), padding: '6px 14px', fontSize: 12 }}>⏹ Terminer</button>
        </div>
      )}

      {vocal.etat === 'pret' && (
        <div style={{ padding: '9px 16px', borderTop: `1px solid ${COULEURS.gris200}`, background: '#F0FDF4', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17 }}>🎙️</span>
          <audio controls src={vocal.url} style={{ flex: 1, minWidth: 170, height: 34 }} />
          <span style={{ fontSize: 11.5, color: '#15803D', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{dureeLisible(vocal.duree)}</span>
          <button onClick={vocal.reinitialiser} disabled={envoi} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: COULEURS.gris600, fontWeight: 700, padding: '4px 8px', fontFamily: 'inherit' }}>Refaire</button>
          <button onClick={envoyerVocal} disabled={envoi} style={{ ...S.bouton(envoi ? COULEURS.gris200 : '#16A34A'), padding: '6px 14px', fontSize: 12 }}>
            {envoi ? (pct > 0 && pct < 100 ? `${pct}%` : 'Envoi…') : 'Envoyer'}
          </button>
        </div>
      )}

      {vocal.erreur && (
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${COULEURS.gris200}`, background: '#FFFBEB', fontSize: 11.5, color: '#92400E' }}>{vocal.erreur}</div>
      )}

      <div style={{ padding: '10px 14px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input ref={fichierRef} type="file" style={{ display: 'none' }} disabled={sansPieceJointe}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; envoyerFichierChoisi(f); }} />
        <button onClick={() => !sansPieceJointe && fichierRef.current?.click()} disabled={envoi || sansPieceJointe}
          title={sansPieceJointe
            ? "L'envoi de fichiers n'est pas ouvert aux apprenants - vous pouvez écrire un message ou envoyer une note vocale."
            : 'Joindre un fichier - tout format'}
          style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: couleur, fontSize: 15, cursor: (envoi || sansPieceJointe) ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: sansPieceJointe ? 0.45 : 1 }}>
          📎
        </button>

        {/* Le micro n'apparaît que s'il est utilisable : les navigateurs exigent HTTPS ou
            localhost, et un bouton qui échoue toujours vaut moins que pas de bouton. */}
        {microDisponible() && vocal.etat === 'repos' && (
          <button onClick={vocal.demarrer} disabled={envoi} title="Enregistrer une note vocale"
            style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: couleur, fontSize: 15, cursor: envoi ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
            🎤
          </button>
        )}

        {/* Les emojis, juste après le micro - insertion à la position du curseur. */}
        <SelecteurEmoji accent={couleur}
          onInsert={emoji => {
            const champ = champSaisieRef.current;
            const { texte: nouveau, curseur } = insererAuCurseur(texte, emoji, champ);
            setTexte(nouveau);
            requestAnimationFrame(() => {
              if (!champ) return;
              champ.focus();
              champ.setSelectionRange(curseur, curseur);
            });
          }} />

        <textarea ref={champSaisieRef} value={texte} onChange={e => setTexte(e.target.value)} rows={1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerTexte(); } }}
          placeholder={citation ? `Répondre à ${citation.auteur_nom}…` : `Message au groupe "${conversation.nom}"…`}
          style={{ flex: 1, padding: '9px 14px', borderRadius: 12, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none', background: COULEURS.gris50 }} />

        <button onClick={envoyerTexte} disabled={!texte.trim() || envoi}
          style={{ ...S.bouton(!texte.trim() || envoi ? COULEURS.gris200 : couleur), padding: '9px 16px', flexShrink: 0 }}>
          {envoi ? (pct > 0 && pct < 100 ? `${pct}%` : '⏳') : '✉️'}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   L'écran
══════════════════════════════════════════════════════════════ */

export default function GroupesLibres({ profile, couleur = '#0891B2' }) {
  const [conversations, setConversations] = useState([]);
  const [peutCreer, setPeutCreer] = useState(false);
  const [nonInstalle, setNonInstalle] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState(null);
  const [modalCreation, setModalCreation] = useState(false);
  const [modalMembres, setModalMembres] = useState(null);

  const hdr = useCallback(() => ({ Authorization: `Bearer ${jeton()}`, 'Content-Type': 'application/json' }), []);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/conversations`, { headers: hdr() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Lecture impossible');
      setConversations(d.conversations || []);
      setPeutCreer(!!d.peut_creer);
      setNonInstalle(!!d.non_installe);
      setOuvert(o => (d.conversations || []).find(c => c.id === o?.id) || (d.conversations || [])[0] || null);
    } catch { /* l'écran affichera l'état vide */ }
    finally { setChargement(false); }
  }, [hdr]);

  useEffect(() => { charger(); }, [charger]);

  if (chargement) {
    return <div style={{ textAlign: 'center', color: COULEURS.gris400, padding: '40px 20px', fontSize: 13 }}>Chargement…</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: COULEURS.navy }}>💬 Groupes de discussion</div>
          <div style={{ fontSize: 12.5, color: COULEURS.gris600, marginTop: 3 }}>
            Des groupes qui ne suivent pas les classes - une équipe, un centre, un projet. Personnel BET uniquement.
          </div>
        </div>
        {peutCreer && (
          <button onClick={() => setModalCreation(true)} disabled={nonInstalle}
            style={{ ...S.bouton(nonInstalle ? COULEURS.gris200 : couleur), cursor: nonInstalle ? 'not-allowed' : 'pointer' }}>
            + Nouveau groupe
          </button>
        )}
      </div>

      {nonInstalle && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 15px', marginBottom: 14, fontSize: 12.5, color: '#78350F', lineHeight: 1.6 }}>
          <strong>Fonctionnalité pas encore activée sur cette base.</strong> Le script
          <code style={{ background: '#FEF3C7', padding: '1px 5px', borderRadius: 3, margin: '0 3px' }}>Backend/sql/conversations_libres.sql</code>
          doit être exécuté dans Supabase.
        </div>
      )}

      {conversations.length === 0 ? (
        <div style={{ ...S.carte, textAlign: 'center', padding: 44, color: COULEURS.gris400 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>💬</div>
          <div style={{ fontWeight: 700, color: COULEURS.navy }}>Aucun groupe pour l'instant</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>
            {peutCreer ? 'Créez-en un et choisissez qui en fait partie.' : "Vous verrez ici les groupes auxquels on vous aura ajouté."}
          </div>
        </div>
      ) : (
        <>
          {/* Les groupes SUPERVISÉS - lus sans en être membre - dans une rangée à part :
              les mêler aux siens ferait croire qu'on y a été ajouté. */}
          {[
            { titre: null, liste: conversations.filter(c => !c.supervision) },
            { titre: "Supervision - groupes dont vous n'êtes pas membre", liste: conversations.filter(c => c.supervision) },
          ].filter(g => g.liste.length).map(g => (
            <div key={g.titre || 'miens'} style={{ marginBottom: 12 }}>
              {g.titre && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B45309', marginBottom: 6 }}>👁️ {g.titre}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {g.liste.map(c => (
                  <button key={c.id} onClick={() => setOuvert(c)}
                    style={{ ...S.champ, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7,
                      background: ouvert?.id === c.id ? `${couleur}14` : (c.supervision ? '#FFFBEB' : COULEURS.gris50),
                      borderColor: ouvert?.id === c.id ? couleur : (c.supervision ? '#FDE68A' : COULEURS.gris200),
                      color: ouvert?.id === c.id ? couleur : COULEURS.navy }}>
                    <span>{c.nom}</span>
                    <span style={{ fontSize: 11, color: COULEURS.gris400, fontWeight: 500 }}>{c.nb_membres}</span>
                    <span onClick={e => { e.stopPropagation(); setModalMembres(c); }} title="Voir les membres"
                      style={{ fontSize: 12, color: COULEURS.gris400 }}>👥</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {ouvert && <FilGroupe conversation={ouvert} profile={profile} couleur={couleur} />}
        </>
      )}

      {modalCreation && (
        <ModalCreation hdr={hdr} couleur={couleur}
          onFermer={() => setModalCreation(false)}
          onCree={() => { setModalCreation(false); charger(); }} />
      )}
      {modalMembres && (
        <ModalMembres conversation={modalMembres} hdr={hdr} couleur={couleur}
          onFermer={() => setModalMembres(null)} onChange={charger} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Sélecteur de personnel
══════════════════════════════════════════════════════════════ */

/** La recherche est faite par le SERVEUR : la base compte près de 190 coachs, et
 *  transmettre la liste entière à chaque frappe coûterait autant que la requête. */
function SelecteurPersonnel({ hdr, couleur, selection, onToggle, exclus = [], source = 'personnel' }) {
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState([]);
  const [tronque, setTronque] = useState(false);
  const minuteur = useRef(null);
  /* Le même sélecteur sert au personnel et aux apprenants : deux composants jumeaux
     auraient divergé au premier ajustement. */
  const estApprenants = source === 'apprenants';

  useEffect(() => {
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API_URL}/api/conversations/${source}?q=${encodeURIComponent(q)}`, { headers: hdr() });
        const d = await r.json();
        if (r.ok) { setResultats(d[source] || []); setTronque(!!d.tronque); }
      } catch { /* la liste précédente demeure */ }
    }, 280);
    return () => clearTimeout(minuteur.current);
  }, [q, hdr, source]);

  const exclusSet = new Set(exclus);
  const visibles = resultats.filter(p => !exclusSet.has(p.id));

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} autoFocus
        placeholder={estApprenants ? '🔍 Chercher un apprenant par nom ou e-mail…' : '🔍 Chercher un collègue par nom ou e-mail…'}
        style={{ ...S.champ, width: '100%', marginBottom: 10 }} />

      {selection.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {selection.map(p => (
            <button key={p.id} onClick={() => onToggle(p)} title={p.email}
              style={{ background: couleur, color: '#fff', border: 'none', borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p.nom_complet}
              {/* Le RÔLE accompagne le nom : deux comptes distincts portent parfois le
                  même nom, et deux étiquettes identiques feraient croire à un doublon. */}
              <span style={{ opacity: .75, fontWeight: 500 }}> · {libelleRole(p.role)}</span> ✕
            </button>
          ))}
        </div>
      )}

      <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${COULEURS.gris200}`, borderRadius: 9 }}>
        {!visibles.length && (
          <div style={{ padding: 20, textAlign: 'center', color: COULEURS.gris400, fontSize: 12.5 }}>
            {q ? `Personne ne correspond à « ${q} »` : 'Aucun collègue à proposer.'}
          </div>
        )}
        {visibles.map(p => {
          const choisi = selection.some(s => s.id === p.id);
          return (
            <button key={p.id} onClick={() => onToggle(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 13px',
                border: 'none', borderBottom: `1px solid ${COULEURS.gris100}`, background: choisi ? `${couleur}12` : COULEURS.blanc, cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: COULEURS.gris200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: COULEURS.gris600 }}>
                {initiales(p.nom_complet)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom_complet}</span>
                <span style={{ display: 'block', fontSize: 11, color: COULEURS.gris400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {libelleRole(p.role)}{p.email ? ` · ${p.email}` : ''}
                </span>
              </span>
              <span style={{ fontSize: 15, color: choisi ? couleur : COULEURS.gris200 }}>{choisi ? '☑' : '☐'}</span>
            </button>
          );
        })}
      </div>

      {tronque && (
        <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 7 }}>
          Liste tronquée - affinez la recherche pour trouver quelqu'un qui n'apparaît pas.
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Modals
══════════════════════════════════════════════════════════════ */

const Voile = ({ children, onFermer }) => (
  <div onClick={e => { if (e.target === e.currentTarget) onFermer(); }}
    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.65)', zIndex: 9900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
    {children}
  </div>
);

function ModalCreation({ hdr, couleur, onFermer, onCree }) {
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [selection, setSelection] = useState([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  /* Le groupe accueille-t-il des apprenants ? Décidé ici et jamais après : cocher plus
     tard exposerait ce que le personnel s'est déjà dit dans ce fil. */
  const [avecApprenants, setAvecApprenants] = useState(false);
  const [ongletSel, setOngletSel] = useState('personnel');

  const basculer = (p) => setSelection(s => s.some(x => x.id === p.id) ? s.filter(x => x.id !== p.id) : [...s, p]);

  const creer = async () => {
    setOccupe(true); setErreur(null);
    try {
      const r = await fetch(`${API_URL}/api/conversations`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ nom, description, membres: selection.map(p => p.id), avec_apprenants: avecApprenants }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Création impossible');
      onCree();
    } catch (e) { setErreur(e.message); }
    finally { setOccupe(false); }
  };

  const nomValide = nom.trim().length >= 2 && nom.trim().length <= 80;

  return (
    <Voile onFermer={() => !occupe && onFermer()}>
      <div style={{ ...S.carte, width: '92vw', maxWidth: 1020, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>💬 Nouveau groupe</div>
            <div style={{ fontSize: 12.5, color: COULEURS.gris600, marginTop: 3 }}>
              Vous en serez l'administrateur : vous seul pourrez ajouter ou retirer des membres.
            </div>
          </div>
          {!occupe && <button onClick={onFermer} style={{ ...S.bouton(COULEURS.gris100), color: COULEURS.gris600, padding: '6px 12px' }}>✕</button>}
        </div>

        {erreur && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 9, padding: '10px 13px', marginBottom: 14, fontSize: 12.5, color: '#991B1B' }}>{erreur}</div>
        )}

        {/* Deux colonnes : l'identité à gauche, le choix des membres à droite - c'est lui
            qui prend du temps et de la place. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 22, alignItems: 'start' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: COULEURS.gris600, marginBottom: 5 }}>Nom du groupe</label>
            <input value={nom} onChange={e => setNom(e.target.value)} maxLength={80}
              placeholder="Ex. Coachs Angré - rentrée 2026" style={{ ...S.champ, width: '100%', marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: COULEURS.gris600, marginBottom: 5 }}>
              Objet <span style={{ fontWeight: 400, color: COULEURS.gris400 }}>(facultatif)</span>
            </label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="À quoi sert ce groupe ?" style={{ ...S.champ, width: '100%', marginBottom: 16 }} />

            <div style={{ background: COULEURS.gris50, borderRadius: 9, padding: '11px 14px', fontSize: 12, color: COULEURS.gris600, lineHeight: 1.6 }}>
              <strong style={{ color: COULEURS.navy }}>Vous êtes membre d'office</strong>, en tant qu'administrateur -
              inutile de vous chercher dans la liste.<br />
              {avecApprenants
                ? 'Ce groupe accueille des apprenants : ils pourront y lire et y écrire. Les familles et les comptes entreprise restent exclus.'
                : 'Les apprenants et les familles ne peuvent pas être ajoutés à un groupe de ce type.'}
              <br />Un membre ne peut pas se retirer lui-même : c'est à vous de le faire.
            </div>

            <div style={{ marginTop: 12, background: avecApprenants ? '#F0FDF4' : COULEURS.gris50, border: `1.5px solid ${avecApprenants ? '#BBF7D0' : COULEURS.gris200}`, borderRadius: 9, padding: '11px 14px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={avecApprenants}
                  onChange={e => { setAvecApprenants(e.target.checked); setSelection([]); }}
                  style={{ width: 16, height: 16, marginTop: 1, accentColor: '#059669', cursor: 'pointer', flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: avecApprenants ? '#15803D' : COULEURS.navy }}>
                    👥 Inclure des apprenants
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: COULEURS.gris600, marginTop: 2, lineHeight: 1.5 }}>
                    Pour un événement, une session d'information ou une annonce à des apprenants de plusieurs classes.
                    Ce choix est définitif pour ce groupe.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: COULEURS.gris600, marginBottom: 5 }}>
              Membres <span style={{ fontWeight: 400, color: COULEURS.gris400 }}>({selection.length} sélectionné{selection.length > 1 ? 's' : ''})</span>
            </label>
            {avecApprenants && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
                {[['personnel', '🏢 Personnel BET'], ['apprenants', '👥 Apprenants actifs']].map(([cle, lib]) => (
                  <button key={cle} type="button" onClick={() => setOngletSel(cle)}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${ongletSel === cle ? couleur : COULEURS.gris200}`,
                      background: ongletSel === cle ? COULEURS.gris50 : '#fff',
                      color: ongletSel === cle ? couleur : COULEURS.gris600 }}>
                    {lib}
                  </button>
                ))}
              </div>
            )}
            <SelecteurPersonnel hdr={hdr} couleur={couleur} selection={selection} onToggle={basculer}
              source={avecApprenants ? ongletSel : 'personnel'} />
          </div>
        </div>

        <button onClick={creer} disabled={occupe || !nomValide}
          style={{ ...S.bouton(occupe || !nomValide ? COULEURS.gris200 : couleur), width: '100%', padding: 13, fontSize: 14, marginTop: 18 }}>
          {occupe ? 'Création…' : selection.length ? `Créer le groupe avec ${selection.length} membre${selection.length > 1 ? 's' : ''}` : 'Créer le groupe'}
        </button>
      </div>
    </Voile>
  );
}

function ModalMembres({ conversation, hdr, couleur, onFermer, onChange }) {
  const [membres, setMembres] = useState([]);
  const [estAdmin, setEstAdmin] = useState(false);
  const [ajout, setAjout] = useState(false);
  const [selection, setSelection] = useState([]);
  const [occupe, setOccupe] = useState(false);
  const [aRetirer, setARetirer] = useState(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}/membres`, { headers: hdr() });
      const d = await r.json();
      if (r.ok) { setMembres(d.membres || []); setEstAdmin(!!d.je_suis_admin); }
    } catch { /* l'écran reste utilisable */ }
  }, [conversation.id, hdr]);

  useEffect(() => { charger(); }, [charger]);

  const ajouter = async () => {
    setOccupe(true);
    try {
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}/membres`, {
        method: 'POST', headers: hdr(), body: JSON.stringify({ membres: selection.map(p => p.id) }),
      });
      if (r.ok) { setSelection([]); setAjout(false); charger(); onChange?.(); }
    } finally { setOccupe(false); }
  };

  const retirer = async (m) => {
    setARetirer(null);
    try {
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}/membres/${m.user_id}`, { method: 'DELETE', headers: hdr() });
      if (r.ok) { charger(); onChange?.(); }
    } catch { /* rien : la liste reste telle quelle */ }
  };

  return (
    <Voile onFermer={onFermer}>
      <div style={{ ...S.carte, width: '92vw', maxWidth: 940, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>{conversation.nom}</div>
            <div style={{ fontSize: 12.5, color: COULEURS.gris600, marginTop: 3 }}>
              {membres.length} membre{membres.length > 1 ? 's' : ''}{conversation.description ? ` · ${conversation.description}` : ''}
            </div>
          </div>
          <button onClick={onFermer} style={{ ...S.bouton(COULEURS.gris100), color: COULEURS.gris600, padding: '6px 12px' }}>✕</button>
        </div>

        {ajout ? (
          <>
            <SelecteurPersonnel hdr={hdr} couleur={couleur} selection={selection} exclus={membres.map(m => m.user_id)}
              onToggle={p => setSelection(s => s.some(x => x.id === p.id) ? s.filter(x => x.id !== p.id) : [...s, p])} />
            <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
              <button onClick={() => { setAjout(false); setSelection([]); }} style={{ ...S.bouton(COULEURS.gris100), color: COULEURS.gris600, flex: 1, padding: 12 }}>Annuler</button>
              <button onClick={ajouter} disabled={occupe || !selection.length} style={{ ...S.bouton(occupe || !selection.length ? COULEURS.gris200 : couleur), flex: 1.6, padding: 12 }}>
                {occupe ? 'Ajout…' : `Ajouter ${selection.length || ''}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 9, overflow: 'hidden', marginBottom: 14 }}>
              {membres.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderBottom: `1px solid ${COULEURS.gris100}` }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: COULEURS.gris200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: COULEURS.gris600 }}>
                    {initiales(m.nom_complet)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nom_complet}</span>
                    <span style={{ display: 'block', fontSize: 11, color: COULEURS.gris400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {libelleRole(m.utilisateur?.role)}{m.utilisateur?.email ? ` · ${m.utilisateur.email}` : ''}
                    </span>
                  </span>
                  {m.role === 'admin' ? (
                    <span style={{ fontSize: 10.5, background: `${couleur}1A`, color: couleur, padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>admin</span>
                  ) : estAdmin ? (
                    <button onClick={() => setARetirer(m)}
                      style={{ background: '#FEE2E2', color: '#B91C1C', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Retirer
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {estAdmin ? (
              <button onClick={() => setAjout(true)} style={{ ...S.bouton(couleur), width: '100%', padding: 12 }}>+ Ajouter des membres</button>
            ) : (
              <div style={{ fontSize: 12.5, color: COULEURS.gris600, textAlign: 'center', lineHeight: 1.6 }}>
                Seul le créateur du groupe peut en modifier les membres.
              </div>
            )}
          </>
        )}

        {/* Confirmation du retrait : un retrait ne se rattrape pas. */}
        {aRetirer && (
          <Voile onFermer={() => setARetirer(null)}>
            <div style={{ ...S.carte, width: '100%', maxWidth: 440 }}>
              <div style={{ fontSize: 30, textAlign: 'center', marginBottom: 8 }}>🚪</div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: COULEURS.navy, textAlign: 'center', marginBottom: 6 }}>
                Retirer {aRetirer.nom_complet} ?
              </div>
              <div style={{ fontSize: 12.5, color: COULEURS.gris600, textAlign: 'center', lineHeight: 1.6, marginBottom: 16 }}>
                Cette personne perdra l'accès au groupe <strong>« {conversation.nom} »</strong> et à tout
                son historique de messages. Elle n'en sera pas avertie.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setARetirer(null)} style={{ ...S.bouton(COULEURS.gris100), color: COULEURS.gris600, flex: 1, padding: 12 }}>Annuler</button>
                <button onClick={() => retirer(aRetirer)} style={{ ...S.bouton('#B91C1C'), flex: 1.3, padding: 12 }}>Retirer du groupe</button>
              </div>
            </div>
          </Voile>
        )}
      </div>
    </Voile>
  );
}
