import { useState, useEffect, useRef, useCallback } from 'react';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import GroupesLibres from '../../components/shared/GroupesLibres';
import PastilleGroupe from '../../components/shared/PastilleGroupe';
import SelecteurEmoji, { insererAuCurseur } from '../../components/shared/SelecteurEmoji';
import { useGroupesLibresNonLus } from '../../hooks/useGroupesLibresNonLus';
import { useMessagerie } from '../../contexts/MessagerieContext';
import { useAuth } from '../../contexts/AuthContext';
import { LIBELLES_ROLES } from '../../constants/roles';
import { MOCK_APPRENANTS } from '../../mock/apprenants';
import { MOCK_USERS_INTERNES } from '../../mock/usersInternes';
import { envoyerFichier, maxMoPour } from '../../utils/uploadFichier';
import { useEnregistreurVocal, microDisponible, dureeLisible } from '../../hooks/useEnregistreurVocal';
import { useAgeInterface } from '../../hooks/useAgeInterface';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { FIREBASE_ACTIF } from '../../services/firebase';
import { db } from '../../config/firebase';
import {
  collection, doc, addDoc, setDoc, query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function authToken() {
  return localStorage.getItem('bet_access_token') || localStorage.getItem('admin_token') || '';
}

const MAX_FICHIERS = 5;

function iconeFichier(nom = '') {
  const ext = nom.split('.').pop().toLowerCase();
  if (ext === 'pdf')                          return '📄';
  if (['doc', 'docx'].includes(ext))          return '📝';
  if (['xls', 'xlsx'].includes(ext))          return '📊';
  if (['ppt', 'pptx'].includes(ext))          return '📑';
  if (['zip', 'rar', '7z'].includes(ext))     return '🗜️';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return '🎵';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return '🖼️';
  return '📎';
}

function tailleLisible(octets) {
  if (!octets) return '';
  if (octets < 1024)        return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

// Tous les rôles de la plateforme bet-elearning peuvent se contacter
const ROLES_PLATEFORME = [
  'admin_manager', 'admin_superviseur', 'admin_placement', 'admin_onboarding',
  'admin_elearning', 'admin_customer_care', 'admin_pa_advisor',
  'admin_rh_paie', 'admin_comptable', 'admin_commercial',
  'professeur_titulaire', 'professeur_remplacant',
  'client_entreprise', 'apprenant', 'parent',
];

function enfantsDuParent(parentId) {
  if (!parentId) return [];
  return MOCK_APPRENANTS.filter(a => a.parent_id === parentId);
}

const COULEUR_ROLE = {
  admin_manager:        COULEURS.cyan,
  admin_superviseur:    '#8B5CF6',
  admin_placement:      COULEURS.succes,
  admin_onboarding:     '#F97316',
  admin_elearning:      '#06B6D4',
  admin_customer_care:  '#EC4899',
  professeur_titulaire: '#0D9488',
  professeur_remplacant:'#64748B',
  apprenant:            '#3B82F6',
  parent:               '#8B5CF6',
  client_entreprise:    '#F97316',
};

function formatHeure(date) {
  if (!date) return '';
  const d   = date instanceof Date ? date : new Date(date?.seconds ? date.seconds * 1000 : date);
  const now = new Date();
  const diff = now - d;
  if (diff < 60 * 1000)             return "À l'instant";
  if (diff < 60 * 60 * 1000)        return `Il y a ${Math.round(diff / 60000)} min`;
  if (diff < 24 * 60 * 60 * 1000)   return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 24 * 60 * 60 * 1000) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/**
 * L'avatar d'une personne : sa photo de compte, ou ses initiales à défaut.
 *
 * LA PHOTO EST CELLE DU COMPTE - `utilisateurs.avatar_url`, la colonne qu'alimente
 * l'administrateur BET depuis le SuperAdmin de dash. Les deux plateformes lisent la MÊME,
 * il n'y a donc jamais deux photos pour une même personne.
 *
 * Elle manquait ici : la messagerie privée ne montrait que des initiales, alors que les
 * fils de groupe affichent le visage - le même collègue avait deux apparences selon
 * l'écran. Une URL morte retombe sur les initiales, comme si aucune photo n'existait.
 */
function Avatar({ initiales, role, taille = 38, enligne = false, url = null }) {
  const couleur = COULEUR_ROLE[role] || COULEURS.cyan;
  const [casse, setCasse] = useState(false);
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {url && !casse ? (
        <img src={url} alt={initiales || ''} onError={() => setCasse(true)}
          style={{
            width: taille, height: taille, borderRadius: '50%', objectFit: 'cover',
            border: `2px solid ${couleur}40`, display: 'block',
          }} />
      ) : (
      <div style={{
        width: taille, height: taille, borderRadius: '50%',
        background: couleur + '20', border: `2px solid ${couleur}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: taille * 0.35, fontWeight: 800, color: couleur,
      }}>
        {initiales}
      </div>
      )}
      {enligne && (
        <div style={{
          position: 'absolute', bottom: 1, right: 1,
          width: taille * 0.28, height: taille * 0.28,
          borderRadius: '50%', background: '#22C55E',
          border: '2px solid #fff',
        }} />
      )}
    </div>
  );
}

// ── Chat de groupe de la classe (apprenant) ─────────────────────────────────
// Backend réel (classe_messages) - PAS Firebase. La messagerie 1-à-1 de cette page dépend
// de Firebase (jamais configuré ici, cf. useMessagerie), mais ce chat de classe utilise les
// mêmes routes /api/classes-elearning/:id/messages que le chat de groupe du coach.
function SectionChatClasse({ classeId, classeNom, classePhoto, profile, couleurTheme }) {
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(false);
  const endRef = useRef(null);

  // Chat de groupe temps réel Firestore - même collection classe_chats/{classeId}/messages
  // que le chat de classe du coach (DashboardProfesseur.jsx), couverte par les règles Firestore.
  useEffect(() => {
    if (!classeId) return;
    if (!FIREBASE_ACTIF || !db) { setErreur(true); return; }
    setErreur(false);
    const q = query(collection(db, 'classe_chats', classeId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => setErreur(true));
    return () => unsub();
  }, [classeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function envoyer() {
    const contenu = texte.trim();
    if (!contenu || envoi || !profile || !FIREBASE_ACTIF || !db) return;
    setEnvoi(true);
    setTexte('');
    try {
      await addDoc(collection(db, 'classe_chats', classeId, 'messages'), {
        contenu,
        envoyeurId:   profile.id,
        envoyeurNom:  `${profile.prenom} ${profile.nom}`,
        envoyeurRole: profile.role,
        timestamp:    serverTimestamp(),
      });
      await setDoc(doc(db, 'classe_chats', classeId), {
        dernierMessage:   contenu,
        dernierMessageAt: serverTimestamp(),
      }, { merge: true });
      // Gamification : le chat vit dans Firebase, invisible du backend - on le "ping" après
      // un envoi réussi pour faire progresser les badges "Esprit de classe" / "Bon camarade".
      fetch(`${API_URL}/api/gamification/chat-message`, {
        method: 'POST', headers: { Authorization: `Bearer ${authToken()}` },
      }).catch(() => {});
    } catch {
      setErreur(true);
    }
    setEnvoi(false);
  }

  const fmtHeure = ts => {
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date());
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };
  const estMoi = msg => msg.envoyeurId === profile?.id;

  /* La photo des auteurs, résolue depuis leur identifiant - le message ne porte que le nom
     et le rôle. Même endpoint groupé que le fil des groupes, et même raison : l'historique
     déjà écrit en bénéficie, et un changement de photo se propage partout. */
  const [profilsClasse, setProfilsClasse] = useState({});
  const idsDemandesClasse = useRef(new Set());
  useEffect(() => {
    const manquants = [...new Set(messages.map(m => m.envoyeurId).filter(Boolean))]
      .filter(id => !idsDemandesClasse.current.has(id));
    if (!manquants.length) return;
    manquants.forEach(id => idsDemandesClasse.current.add(id));
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/admin/profils-chat?ids=${manquants.join(',')}`, {
          headers: { Authorization: `Bearer ${authToken()}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.profils && Object.keys(d.profils).length) setProfilsClasse(p => ({ ...p, ...d.profils }));
      } catch { /* les initiales et le nom seul restent un repli acceptable */ }
    })();
  }, [messages]);

  if (!classeId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: COULEURS.gris400, padding: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🏫</div>
        <div style={{ fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
          Vous n'êtes pas encore inscrit(e) dans une classe - le chat de classe sera disponible dès votre assignation.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: COULEURS.gris50 }}>
      {/* LA CLASSE EN TÊTE DE SON FIL - sa photo et son nom. La même image que sur la
          fiche de la classe : deux visuels pour le même endroit sèmeraient le doute.
          En lecture seule ici, un apprenant ne modifie pas la photo de sa classe. */}
      <div style={{ padding: '14px 20px', background: COULEURS.blanc, borderBottom: `1px solid ${COULEURS.gris200}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <PastilleGroupe nom={classeNom || 'Classe'} url={classePhoto} taille={40} accent={couleurTheme} agrandissable />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy }}>🏫 {classeNom || 'Chat de classe'}</div>
          <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>Visible par le coach et tous les apprenants de la classe</div>
          <div style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 4 }}>📎 Fichiers partagés automatiquement supprimés après 30 jours</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {erreur && (
          <div style={{ textAlign: 'center', padding: '10px 16px', background: '#FEF2F2', color: '#991B1B', borderRadius: 8, fontSize: 12, marginBottom: 8 }}>
            ⚠️ Chat indisponible - Firebase non joignable. Réessayez plus tard.
          </div>
        )}
        {!erreur && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: COULEURS.gris400 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
            <div style={{ fontSize: 13 }}>Aucun message pour le moment. Soyez le premier à écrire !</div>
          </div>
        )}
        {messages.map(msg => {
          const moi = estMoi(msg);
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: moi ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: moi ? 'flex-end' : 'flex-start' }}>
                {/* QUI ÉCRIT : sa photo, son nom, son rôle - coach et apprenants partagent
                    ce fil, et le seul nom ne disait pas lequel des deux parlait. */}
                {!moi && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingLeft: 2 }}>
                    <PastilleGroupe nom={msg.envoyeurNom} url={profilsClasse[msg.envoyeurId]?.avatar_url} taille={20} accent={couleurTheme} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: couleurTheme }}>{msg.envoyeurNom}</span>
                    {(profilsClasse[msg.envoyeurId]?.role || msg.envoyeurRole) && (
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: COULEURS.gris400 }}>
                        · {LIBELLES_ROLES[profilsClasse[msg.envoyeurId]?.role || msg.envoyeurRole] || (profilsClasse[msg.envoyeurId]?.role || msg.envoyeurRole)}
                      </span>
                    )}
                  </span>
                )}
                {msg.fichierUrl ? (
                  <a href={msg.fichierUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '10px 14px', borderRadius: moi ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: moi ? couleurTheme : COULEURS.blanc, color: moi ? '#fff' : COULEURS.navy, fontSize: 13, lineHeight: 1.4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: moi ? 'none' : `1px solid ${COULEURS.gris200}`, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{iconeFichier(msg.fichierNom)}</span>
                    <span style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.fichierNom}</div>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>{tailleLisible(msg.fichierTaille)} · Télécharger</div>
                    </span>
                  </a>
                ) : (
                  <div style={{ padding: '10px 14px', borderRadius: moi ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: moi ? couleurTheme : COULEURS.blanc, color: moi ? '#fff' : COULEURS.navy, fontSize: 13, lineHeight: 1.5, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: moi ? 'none' : `1px solid ${COULEURS.gris200}` }}>
                    {msg.contenu}
                  </div>
                )}
                <span style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 4 }}>{fmtHeure(msg.timestamp)}</span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={{ padding: '12px 16px', background: COULEURS.blanc, borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 10, flexShrink: 0 }}>
        <input
          value={texte}
          onChange={e => setTexte(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
          placeholder="Écrire un message à la classe…"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.gris50 }}
        />
        <button
          onClick={envoyer}
          disabled={!texte.trim() || envoi}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: texte.trim() ? couleurTheme : COULEURS.gris200, color: '#fff', cursor: texte.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

export default function PageMessages() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile } = useAuth();
  /* LA PIÈCE JOINTE EST RÉSERVÉE AU PERSONNEL - le type d'upload employé exige un jeton
     d'administration, et la sélection d'un apprenant échouait en 403 sans explication. */
  const sansPieceJointe = ['apprenant', 'parent'].includes(profile?.role);
  const _apprenant = profile?.role === 'apprenant'
    ? (MOCK_APPRENANTS.find(a => a.profile_id === profile?.id) || MOCK_APPRENANTS[0])
    : null;
  const _ui = useAgeInterface(_apprenant);
  const menuRole = profile?.role === 'apprenant' ? _ui.menuRole : undefined;

  const {
    conversations, messagesParConv, convActive,
    nbNonLus, nbNotifications, notifications,
    ouvrirConversation, ouvrirOuCreerConversation,
    envoyerMsg, getInterlocuteur, estEnLigne,
    FIREBASE_ACTIF,
  } = useMessagerie();

  const [texte,         setTexte]       = useState('');
  const [recherche,     setRech]        = useState('');
  const [voirNotifs,    setVoirNotifs]  = useState(false);
  const [voirContacts,  setVoirContacts] = useState(false);
  const [contacts,      setContacts]    = useState([]);
  const [contactsCharge, setContactsCharge] = useState(false);
  const [rechContact,   setRechContact] = useState('');
  const [fichiersEnAttente, setFichiersEnAttente] = useState([]); // [{id,name,size,status,url}]
  // Les non-lus des groupes, pour la pastille de l'onglet : calculés ici pour qu'elle
  // s'allume même quand l'onglet n'est pas ouvert.
  const groupesNonLus = useGroupesLibresNonLus(profile?.role !== 'apprenant' ? profile?.id : null);
  const [citation, setCitation] = useState(null);   // le message auquel on répond
  const [surligne, setSurligne] = useState(null);   // cible d'un clic sur citation
  const [envoiVocal, setEnvoiVocal] = useState(false);
  const [pctVocal, setPctVocal] = useState(0);
  // Trois minutes, comme partout ailleurs : au-delà ce n'est plus un message mais un appel.
  const vocal = useEnregistreurVocal({ dureeMaxS: 180 });
  const messagesRef = useRef(null);
  const fileInputRef = useRef(null);
  // La zone de saisie, pour insérer un emoji là où est le curseur.
  const champSaisieRef = useRef(null);

  // ── Onglet Messages privés / Chat de classe (apprenant uniquement) ─────────
  const [vueMessages, setVueMessages] = useState('perso'); // 'perso' | 'classe'
  const [classeApprenant, setClasseApprenant] = useState(null); // { id, nom }
  useEffect(() => {
    if (profile?.role !== 'apprenant' || !profile?.id || !supabase) return;
    (async () => {
      const { data: inscr } = await supabase
        .from('classes_elearning_apprenants')
        .select('classe_id, classe:classes_elearning(nom, photo_url)')
        .eq('apprenant_id', profile.id)
        .neq('statut', 'suspendu')
        .limit(1)
        .maybeSingle();
      if (inscr?.classe_id) {
        setClasseApprenant({
          id: inscr.classe_id,
          nom: inscr.classe?.nom || null,
          photo_url: inscr.classe?.photo_url || null,
        });
      }
    })();
  }, [profile?.role, profile?.id]);

  const uploaderFichier = useCallback(async (file) => {
    const id = `${Date.now()}-${Math.random()}`;
    /* Le plafond suit la NATURE du fichier (vidéo 100 Mo, audio 20, reste 10) au lieu des
       5 Mo du relais - en réalité 4,5, limite que Vercel impose au corps d'une requête.
       L'envoi direct vers Cloudinary rend ce plafond obsolète. */
    const maxMo = maxMoPour('piece-jointe', file.type);
    if (file.size > maxMo * 1024 * 1024) {
      setFichiersEnAttente(p => [...p, { id, name: file.name, size: file.size, status: 'erreur', url: null, erreur: `Fichier trop lourd (max ${maxMo} Mo)` }]);
      return;
    }
    setFichiersEnAttente(p => [...p, { id, name: file.name, size: file.size, status: 'upload', url: null }]);
    try {
      const data = await envoyerFichier(file, 'piece-jointe', {
        onProgress: (pct) => setFichiersEnAttente(p => p.map(f => f.id === id ? { ...f, progress: pct } : f)),
      });
      if (!data?.url) throw new Error("Réponse serveur invalide (pas d'URL)");
      setFichiersEnAttente(p => p.map(f => f.id === id ? { ...f, status: 'ok', url: data.url } : f));
    } catch (err) {
      console.error('[Messagerie] échec upload pièce jointe:', err);
      setFichiersEnAttente(p => p.map(f => f.id === id ? { ...f, status: 'erreur', erreur: err.message } : f));
    }
  }, []);

  const onChoisirFichiers = (e) => {
    const files = Array.from(e.target.files || []);
    const restant = MAX_FICHIERS - fichiersEnAttente.length;
    files.slice(0, restant).forEach(uploaderFichier);
    e.target.value = '';
  };

  const chargerContacts = useCallback(async () => {
    if (contactsCharge) return;
    setContactsCharge(true);

    // Fallback : tous les profils mock de la plateforme sauf l'utilisateur courant
    const mockFallback = () => MOCK_USERS_INTERNES
      .filter(u => u.id !== profile?.id && ROLES_PLATEFORME.includes(u.role) && u.est_actif !== false)
      .map(u => ({
        id:        u.id,
        prenom:    u.prenom || '',
        nom:       u.nom   || '',
        role:      u.role,
        initiales: u.initiales || `${(u.prenom || '')[0] || ''}${(u.nom || '')[0] || ''}`.toUpperCase(),
        email:     u.email || '',
      }));

    try {
      const token = authToken();
      if (token) {
        const r = await fetch(`${API_URL}/api/admin/messages/contacts`, {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        });
        if (r.ok) {
          const data = await r.json();
          // Tous les contacts retournés par l'API sauf soi-même
          const liste = (data.contacts || []).filter(u => u.id !== profile?.id);
          if (liste.length > 0) { setContacts(liste); return; }
        }
      }
      setContacts(mockFallback());
    } catch {
      setContacts(mockFallback());
    } finally { setContactsCharge(false); }
  }, [profile?.id, contactsCharge]);

  useEffect(() => {
    if (voirContacts && contacts.length === 0) chargerContacts();
  }, [voirContacts]);

  /* LES PHOTOS DES INTERLOCUTEURS, résolues depuis leur identifiant.
     `participantsInfo` est figé dans Firestore au moment où la conversation est créée : les
     fils déjà ouverts n'y portent aucune photo, et ceux qui en portent une garderaient
     l'ancienne après un changement. On interroge donc le compte, comme dans les fils de
     groupe - l'historique entier en bénéficie, et une photo remplacée se propage partout. */
  const [profilsPrives, setProfilsPrives] = useState({});
  const idsDemandesPrives = useRef(new Set());
  useEffect(() => {
    const ids = [...new Set(conversations.flatMap(c => c.participants || []))]
      .filter(id => id && id !== profile?.id && !idsDemandesPrives.current.has(id));
    if (!ids.length) return;
    ids.forEach(id => idsDemandesPrives.current.add(id));
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/admin/profils-chat?ids=${ids.join(',')}`, {
          headers: { Authorization: `Bearer ${authToken()}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.profils && Object.keys(d.profils).length) setProfilsPrives(p => ({ ...p, ...d.profils }));
      } catch { /* les initiales restent un repli acceptable */ }
    })();
  }, [conversations, profile?.id]);

  /** La photo d'une personne : celle du compte d'abord, celle figée dans le fil ensuite. */
  const photoDe = (id, secours = null) => profilsPrives[id]?.avatar_url || secours || null;

  const convsFiltrees = conversations.filter(c => {
    if (!recherche) return true;
    const inter = getInterlocuteur(c);
    return `${inter?.prenom} ${inter?.nom}`.toLowerCase().includes(recherche.toLowerCase());
  });

  const messages       = convActive ? (messagesParConv[convActive] || []) : [];
  const convActiveObj  = conversations.find(c => c.id === convActive);
  const interlocuteur  = convActiveObj ? getInterlocuteur(convActiveObj) : null;
  const interlocuteurId = convActiveObj?.participants?.find(p => p !== profile?.id);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const fichiersPrets    = fichiersEnAttente.filter(f => f.status === 'ok');
  const uploadEnCours    = fichiersEnAttente.some(f => f.status === 'upload');
  const peutEnvoyer      = (texte.trim() || fichiersPrets.length > 0) && !uploadEnCours;

  async function envoyer(e) {
    e?.preventDefault();
    if (!peutEnvoyer || !convActive) return;
    const attachments = fichiersPrets.map(({ name, size, url }) => ({ name, size, url }));
    await envoyerMsg(convActive, texte, attachments, citation);
    setTexte('');
    setFichiersEnAttente([]);
    setCitation(null);
  }

  /** Un fichier qui s'écoute plutôt qu'il ne se télécharge. */
  const estAudio = (nom = '') =>
    ['mp3','wav','ogg','oga','m4a','aac','webm','opus'].includes(String(nom).split('.').pop().toLowerCase());

  /** Le résumé FIGÉ d'un message : le résoudre à l'affichage donnerait une citation vide
   *  dès que le message d'origine sort de la fenêtre chargée. */
  function extraitDe(m) {
    const att = (m.attachments || [])[0];
    if (!m.contenu && att) return `${estAudio(att.name) ? '🎙️' : '📎'} ${att.name || 'pièce jointe'}`;
    const t = String(m.contenu || '').replace(/\s+/g, ' ').trim();
    return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  }

  function citer(m, nomAuteur) {
    setCitation({ id: m.id, auteur_nom: nomAuteur || '-', extrait: extraitDe(m) });
  }

  function allerAuMessage(id) {
    const el = document.getElementById(`msg-pv-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setSurligne(id);
    setTimeout(() => setSurligne(v => (v === id ? null : v)), 1600);
  }

  /** La note vocale emprunte EXACTEMENT le chemin d'une pièce jointe. Envoi immédiat :
   *  on vient de se réécouter dans l'aperçu, une étape de plus serait du zèle. */
  async function envoyerVocal() {
    const f = vocal.fichier();
    if (!f || envoiVocal || !convActive) return;
    setEnvoiVocal(true); setPctVocal(0);
    try {
      /* `message` et non `piece-jointe` : ce dernier exige un jeton d'administration, et
         la note vocale d'un apprenant échouait donc en 403. 5 Mo couvrent largement les
         trois minutes de l'enregistreur. */
      const d = await envoyerFichier(f, 'message', { onProgress: setPctVocal });
      if (d?.url) {
        await envoyerMsg(convActive, '', [{ name: f.name, size: f.size, url: d.url }], citation);
        setCitation(null);
        vocal.reinitialiser();
      }
    } catch { /* l'aperçu reste : on peut réessayer sans réenregistrer */ }
    finally { setEnvoiVocal(false); setPctVocal(0); }
  }

  /* Changer d'interlocuteur ABANDONNE citation et enregistrement : les envoyer à la
     mauvaise personne ne se rattrape pas, et laisser le micro ouvert est pire encore. */
  useEffect(() => { setCitation(null); setSurligne(null); vocal.annuler(); }, [convActive]); // eslint-disable-line react-hooks/exhaustive-deps

  function gererTouche(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
  }

  const stats = [
    { label: 'Conversations', valeur: conversations.length, couleur: COULEURS.blanc },
    { label: 'Non lus',       valeur: nbNonLus,             couleur: nbNonLus > 0 ? '#FCA5A5' : COULEURS.succes },
  ];

  const S = {
    /* `TopNavLayout` ne pose aucun padding sur son conteneur : chaque page met le sien, et
       celle-ci n'en avait pas - le contenu touchait les deux bords de l'écran. Les 44px
       verticaux ajoutés ici sont retirés de la hauteur de `page`, sinon la messagerie
       déborderait de la fenêtre d'autant. */
    enveloppe: { padding: '20px 32px 24px' },
    page:      { height: 'calc(100vh - 224px)', display: 'flex', fontFamily: '"Plus Jakarta Sans", sans-serif', overflow: 'hidden' },
    sidebar:   { width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc },
    sideHead:  { padding: '16px 16px 12px', borderBottom: `1px solid ${COULEURS.gris200}`, flexShrink: 0 },
    sideTitre: { fontSize: 16, fontWeight: 800, color: COULEURS.navy, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    inputRech: { width: '100%', padding: '8px 12px', borderRadius: 20, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.gris50, boxSizing: 'border-box' },
    listeConvs:{ flex: 1, overflowY: 'auto' },
    itemConv:  (actif, nonLu) => ({
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      cursor: 'pointer',
      background: actif ? couleurTheme + '10' : 'transparent',
      borderLeft: actif ? `3px solid ${couleurTheme}` : '3px solid transparent',
      borderBottom: `1px solid ${COULEURS.gris100}`,
      transition: 'background 0.1s',
    }),
    convNom:   { fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 2 },
    convAper:  (nonLu) => ({ fontSize: 12, color: nonLu ? COULEURS.navy : COULEURS.gris400, fontWeight: nonLu ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }),
    convHeure: { fontSize: 10, color: COULEURS.gris400, flexShrink: 0 },
    badgeNonLu:{ width: 8, height: 8, borderRadius: '50%', background: couleurTheme, flexShrink: 0 },
    chat:      { flex: 1, display: 'flex', flexDirection: 'column', background: COULEURS.gris50 },
    chatHead:  { padding: '14px 20px', background: COULEURS.blanc, borderBottom: `1px solid ${COULEURS.gris200}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
    chatNom:   { fontSize: 15, fontWeight: 700, color: COULEURS.navy },
    chatRole:  { fontSize: 11, color: COULEURS.gris400, marginTop: 2 },
    chatBadge: (c) => ({ padding: '2px 8px', borderRadius: 10, background: (COULEUR_ROLE[c] || couleurTheme) + '15', color: COULEUR_ROLE[c] || couleurTheme, fontSize: 10, fontWeight: 700 }),
    msgs:      { flex: 1, overflowY: 'auto', padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', gap: 12 },
    bulleZone: (moi) => ({ display: 'flex', justifyContent: moi ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }),
    bulle:     (moi) => ({
      maxWidth: '70%', padding: '10px 14px',
      borderRadius: moi ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      background: moi ? couleurTheme : COULEURS.blanc,
      color: moi ? '#fff' : COULEURS.navy,
      fontSize: 13, lineHeight: 1.5,
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      border: moi ? 'none' : `1px solid ${COULEURS.gris200}`,
    }),
    bulleTime: { fontSize: 10, color: COULEURS.gris400, marginTop: 4, textAlign: 'right' },
    inputZone: { padding: '12px 16px', background: COULEURS.blanc, borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0 },
    textarea:  { flex: 1, padding: '10px 14px', borderRadius: 20, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', resize: 'none', maxHeight: 120, minHeight: 40, lineHeight: 1.5 },
    btnEnvoyer:{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: peutEnvoyer ? couleurTheme : COULEURS.gris200, color: '#fff', cursor: peutEnvoyer ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, transition: 'background 0.15s' },
    vide:      { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: COULEURS.gris400, padding: 32 },
    // Notifications dropdown
    notifBtn:  { position: 'relative', width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
    notifBadge:{ position: 'absolute', top: -2, right: -2, background: '#EF4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    notifPanel:{ position: 'absolute', top: 44, right: 0, width: 300, background: COULEURS.blanc, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: `1px solid ${COULEURS.gris200}`, zIndex: 100, overflow: 'hidden' },
    notifItem: { padding: '10px 14px', borderBottom: `1px solid ${COULEURS.gris100}`, cursor: 'pointer' },
  };

  return (
    <TopNavLayout stats={stats} menuRole={menuRole}>
      <div style={S.enveloppe}>
      {/* Le personnel a deux canaux : sa messagerie privée et les groupes de discussion.
          Les apprenants gardent leur propre barre juste en dessous - ils n'ont pas accès
          aux groupes, réservés au personnel BET. */}
      {profile?.role !== 'apprenant' && (
        <div style={{ display: 'flex', gap: 0, background: COULEURS.gris100, borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 14 }}>
          {[['perso', '💬 Messagerie privée', 0], ['groupes', '💬 Groupes', groupesNonLus]].map(([id, lib, badge]) => (
            <button key={id} onClick={() => setVueMessages(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: vueMessages === id ? COULEURS.blanc : 'transparent', color: vueMessages === id ? COULEURS.navy : COULEURS.gris600, fontWeight: vueMessages === id ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', boxShadow: vueMessages === id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
              {lib}
              {badge > 0 && (
                <span style={{ marginLeft: 7, display: 'inline-block', minWidth: 18, padding: '1px 6px', borderRadius: 99, background: '#DC2626', color: '#fff', fontSize: 10.5, fontWeight: 800, lineHeight: '16px', textAlign: 'center' }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {profile?.role === 'apprenant' && (
        <div style={{ display: 'flex', gap: 0, background: COULEURS.gris100, borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 14 }}>
          {[['perso', '💬 Messages privés'], ['classe', '🏫 Chat de classe']].map(([id, lib]) => (
            <button key={id} onClick={() => setVueMessages(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: vueMessages === id ? COULEURS.blanc : 'transparent', color: vueMessages === id ? COULEURS.navy : COULEURS.gris600, fontWeight: vueMessages === id ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', boxShadow: vueMessages === id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
              {lib}
            </button>
          ))}
        </div>
      )}

      {vueMessages === 'groupes' && profile?.role !== 'apprenant' ? (
        <GroupesLibres profile={profile} couleur={couleurTheme} />
      ) : vueMessages === 'classe' && profile?.role === 'apprenant' ? (
        <div style={{ ...S.page, background: COULEURS.blanc, borderRadius: 14, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
          <SectionChatClasse classeId={classeApprenant?.id} classeNom={classeApprenant?.nom}
            classePhoto={classeApprenant?.photo_url} profile={profile} couleurTheme={couleurTheme} />
        </div>
      ) : (
      <div style={S.page}>

        {/* ── Sidebar conversations ── */}
        <div style={S.sidebar}>
          <div style={S.sideHead}>
            <div style={S.sideTitre}>
              <span>
                💬 Messages
                {nbNonLus > 0 && (
                  <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 10, background: couleurTheme, color: '#fff', fontSize: 11, fontWeight: 700 }}>
                    {nbNonLus}
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Bouton nouvelle conversation */}
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${voirContacts ? couleurTheme : COULEURS.gris200}`,
                    background: voirContacts ? couleurTheme : COULEURS.blanc,
                    color: voirContacts ? '#fff' : couleurTheme,
                    fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => { setVoirContacts(v => !v); setVoirNotifs(false); }}
                  title="Nouvelle conversation"
                >
                  <span style={{ fontSize: 15 }}>+</span>
                  <span>Nouveau</span>
                </button>
                {/* Bouton notifications */}
                {FIREBASE_ACTIF && (
                  <div style={{ position: 'relative' }}>
                    <button style={S.notifBtn} onClick={() => { setVoirNotifs(v => !v); setVoirContacts(false); }} title="Notifications">
                      🔔
                      {nbNotifications > 0 && (
                        <div style={S.notifBadge}>{nbNotifications > 9 ? '9+' : nbNotifications}</div>
                      )}
                    </button>
                    {voirNotifs && (
                      <div style={S.notifPanel}>
                        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COULEURS.gris200}`, fontWeight: 700, fontSize: 13, color: COULEURS.navy }}>
                          Notifications ({nbNotifications})
                        </div>
                        {notifications.length === 0 ? (
                          <div style={{ padding: '20px 14px', textAlign: 'center', color: COULEURS.gris400, fontSize: 12 }}>
                            Aucune notification non lue
                          </div>
                        ) : (
                          notifications.slice(0, 8).map(n => (
                            <div key={n.id} style={S.notifItem} onClick={() => { if (n.convId) ouvrirConversation(n.convId); setVoirNotifs(false); }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: COULEURS.navy, marginBottom: 2 }}>{n.titre}</div>
                              <div style={{ fontSize: 11, color: COULEURS.gris400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.contenu}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {!voirContacts && (
              <input
                style={S.inputRech}
                placeholder="Rechercher une conversation…"
                value={recherche}
                onChange={e => setRech(e.target.value)}
              />
            )}
          </div>

          {/* ── Panneau Contacts (nouvelle conv) ── */}
          {voirContacts && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${COULEURS.gris100}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: couleurTheme, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Nouvelle conversation
                </div>
                <input
                  style={{ ...S.inputRech, marginBottom: 0 }}
                  placeholder="Rechercher un contact…"
                  value={rechContact}
                  onChange={e => setRechContact(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {contactsCharge ? (
                  <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, fontSize: 13 }}>
                    Chargement des contacts…
                  </div>
                ) : contacts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, fontSize: 13 }}>
                    Aucun contact disponible
                  </div>
                ) : (
                  contacts
                    .filter(c => `${c.prenom} ${c.nom}`.toLowerCase().includes(rechContact.toLowerCase()) || (LIBELLES_ROLES[c.role] || '').toLowerCase().includes(rechContact.toLowerCase()))
                    .map(c => (
                      <div
                        key={c.id}
                        onClick={async () => {
                          await ouvrirOuCreerConversation(c);
                          setVoirContacts(false);
                          setRechContact('');
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', borderBottom: `1px solid ${COULEURS.gris100}`, transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = couleurTheme + '08'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Avatar initiales={c.initiales} role={c.role} taille={36} url={photoDe(c.id, c.avatar_url)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>{c.prenom} {c.nom}</div>
                          <div style={{ fontSize: 11, color: COULEUR_ROLE[c.role] || COULEURS.gris400, fontWeight: 600 }}>
                            {LIBELLES_ROLES[c.role] || c.role}
                          </div>
                        </div>
                        <span style={{ fontSize: 16, color: couleurTheme }}>→</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* Liste conversations (cachée quand panneau contacts ouvert) */}
          {!voirContacts && (
            <>
              <div style={S.listeConvs}>
                {convsFiltrees.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: COULEURS.gris400, fontSize: 13 }}>
                    Aucune conversation
                  </div>
                ) : (
                  convsFiltrees.map(conv => {
                    const inter = getInterlocuteur(conv);
                    const nonLu = conv.nonLu?.[profile?.id];
                    const actif = conv.id === convActive;
                    const autreId = conv.participants?.find(p => p !== profile?.id);
                    const enligne = estEnLigne(autreId);
                    return (
                      <div key={conv.id} style={S.itemConv(actif, nonLu)} onClick={() => ouvrirConversation(conv.id)}>
                        <Avatar initiales={inter?.initiales || '?'} role={inter?.role} taille={40} enligne={enligne}
                          url={photoDe(autreId, inter?.avatar_url)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={S.convNom}>{inter ? `${inter.prenom} ${inter.nom}` : 'Inconnu'}</span>
                            <span style={S.convHeure}>{formatHeure(conv.dernierMessageAt)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={S.convAper(nonLu)}>{conv.dernierMessage || '…'}</span>
                            {nonLu && <div style={S.badgeNonLu} />}
                          </div>
                          {inter?.role && (
                            <span style={{ fontSize: 10, color: COULEUR_ROLE[inter.role] || COULEURS.gris400, fontWeight: 600, marginTop: 2, display: 'block' }}>
                              {LIBELLES_ROLES[inter.role] || inter.role}
                              {enligne && <span style={{ marginLeft: 6, color: '#22C55E' }}>● En ligne</span>}
                            </span>
                          )}
                          {inter?.role === 'parent' && (() => {
                            const enfants = enfantsDuParent(autreId);
                            if (!enfants.length) return null;
                            return (
                              <span style={{ fontSize: 10, color: '#8B5CF6', display: 'block', marginTop: 1 }}>
                                👦 {enfants.map(e => e.prenom).join(' · ')}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Zone de chat ── */}
        <div style={S.chat}>
          {convActive && convActiveObj ? (
            <>
              {/* Header chat */}
              <div style={S.chatHead}>
                <Avatar
                  initiales={interlocuteur?.initiales || '?'}
                  role={interlocuteur?.role || ''}
                  taille={40}
                  enligne={estEnLigne(interlocuteurId)}
                  url={photoDe(interlocuteurId, interlocuteur?.avatar_url)}
                />
                <div>
                  <div style={S.chatNom}>
                    {interlocuteur
                      ? `${interlocuteur.prenom} ${interlocuteur.nom}`.trim() || 'Utilisateur'
                      : 'Conversation'}
                  </div>
                  <div style={S.chatRole}>
                    {interlocuteur?.role && (
                      <span style={S.chatBadge(interlocuteur.role)}>
                        {LIBELLES_ROLES[interlocuteur.role] || interlocuteur.role}
                      </span>
                    )}
                    {FIREBASE_ACTIF && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: estEnLigne(interlocuteurId) ? '#22C55E' : COULEURS.gris400 }}>
                        {estEnLigne(interlocuteurId) ? '● En ligne' : '○ Hors ligne'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={S.msgs} ref={messagesRef}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: COULEURS.gris400, fontSize: 13, padding: 24 }}>
                    Démarrez la conversation en envoyant un message.
                  </div>
                )}
                {messages.map((msg, i) => {
                  const moi = msg.envoyeurId === profile?.id;
                  const afficherNom = !moi && (i === 0 || messages[i - 1]?.envoyeurId !== msg.envoyeurId);
                  return (
                    <div key={msg.id || i}>
                      {afficherNom && (
                        <div style={{ fontSize: 11, color: COULEURS.gris400, marginBottom: 4, marginLeft: 48 }}>
                          {msg.envoyeurNom}
                        </div>
                      )}
                      <div id={`msg-pv-${msg.id}`} style={{ ...S.bulleZone(moi),
                        background: surligne === msg.id ? `${couleurTheme}18` : 'transparent',
                        borderRadius: 10, transition: 'background .35s ease' }}>
                        {!moi && (
                          <Avatar initiales={interlocuteur?.initiales || msg.envoyeurNom?.[0] || '?'} role={interlocuteur?.role || ''} taille={28}
                            url={photoDe(msg.envoyeurId, interlocuteur?.avatar_url)} />
                        )}
                        <div>
                          {/* LA CITATION - cliquable pour remonter au message d'origine. */}
                          {msg.repondA && (
                            <button onClick={() => allerAuMessage(msg.repondA.id)} title="Aller au message cité"
                              style={{ display:'block', textAlign:'left', cursor:'pointer', border:'none', maxWidth:280,
                                borderLeft:`3px solid ${moi ? couleurTheme : COULEURS.gris400}`,
                                background: moi ? `${couleurTheme}1A` : COULEURS.gris100,
                                borderRadius:'10px 10px 0 0', padding:'6px 10px', marginBottom:3, fontFamily:'inherit' }}>
                              <span style={{ display:'block', fontSize:10, fontWeight:800, color: moi ? couleurTheme : COULEURS.gris600 }}>
                                {msg.repondA.auteur_nom || '-'}
                              </span>
                              <span style={{ display:'block', fontSize:11.5, color:COULEURS.gris600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {msg.repondA.extrait || '…'}
                              </span>
                            </button>
                          )}

                          {msg.contenu && <div style={S.bulle(moi)}>{msg.contenu}</div>}

                          {/* L'AUDIO S'ÉCOUTE DANS LE FIL : il devenait un lien de
                              téléchargement, alors qu'une note vocale doit s'écouter
                              sans quitter la conversation. */}
                          {(msg.attachments || []).filter(a => estAudio(a.name)).map((att, j) => (
                            <div key={`a${j}`} style={{ marginTop: msg.contenu || j > 0 ? 6 : 0, background: COULEURS.blanc,
                              border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'8px 10px', maxWidth:280,
                              display:'flex', flexDirection:'column', gap:5, boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:11.5, fontWeight:700, color:COULEURS.navy }}>
                                <span>🎙️</span>
                                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {String(att.name || '').startsWith('note-vocale') ? 'Note vocale' : att.name}
                                </span>
                              </div>
                              {/* `preload="metadata"` : la durée s'affiche sans télécharger tout le son. */}
                              <audio controls preload="metadata" src={att.url} style={{ width:'100%', height:34, borderRadius:6 }} />
                            </div>
                          ))}

                          {(msg.attachments || []).filter(a => !estAudio(a.name)).map((att, j) => (
                            <a key={j} href={att.url} target="_blank" rel="noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                                marginTop: msg.contenu || j > 0 ? 6 : 0, borderRadius: 12, textDecoration: 'none',
                                background: moi ? couleurTheme : COULEURS.blanc,
                                border: moi ? 'none' : `1px solid ${COULEURS.gris200}`,
                                boxShadow: '0 1px 4px rgba(0,0,0,0.08)', maxWidth: 240,
                              }}>
                              <span style={{ fontSize: 20, flexShrink: 0 }}>{iconeFichier(att.name)}</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: moi ? '#fff' : COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {att.name}
                                </div>
                                <div style={{ fontSize: 10, color: moi ? 'rgba(255,255,255,0.75)' : COULEURS.gris400 }}>
                                  {tailleLisible(att.size)}
                                </div>
                              </div>
                            </a>
                          ))}
                          <div style={{ ...S.bulleTime, display:'flex', alignItems:'center', gap:8 }}>
                            {formatHeure(msg.timestamp)}
                            <button onClick={() => citer(msg, moi ? 'Vous' : (interlocuteur?.prenom || msg.envoyeurNom || '-'))}
                              title="Répondre à ce message"
                              style={{ border:'none', background:'transparent', cursor:'pointer', color:COULEURS.gris400, fontSize:12, padding:0, lineHeight:1 }}>
                              ↩︎
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* BANDEAU DE CITATION - il doit rester visible pendant qu'on écrit : une
                  réponse dont on ne voit plus la cible finit à côté du sujet. */}
              {citation && (
                <div style={{ padding:'8px 16px', background:COULEURS.gris50, borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:15, color:COULEURS.gris400, flexShrink:0 }}>↩︎</span>
                  <div style={{ flex:1, minWidth:0, borderLeft:`3px solid ${couleurTheme}`, paddingLeft:9 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:couleurTheme }}>Réponse à {citation.auteur_nom}</div>
                    <div style={{ fontSize:11.5, color:COULEURS.gris600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{citation.extrait || '…'}</div>
                  </div>
                  <button onClick={() => setCitation(null)} title="Annuler la réponse"
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:COULEURS.gris400, lineHeight:1, padding:4 }}>✕</button>
                </div>
              )}

              {/* ENREGISTREMENT EN COURS - minuteur et sortie de secours. */}
              {vocal.etat === 'enregistrement' && (
                <div style={{ padding:'9px 16px', background:'#FEF2F2', borderTop:`1px solid #FCA5A5`, display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:9, height:9, borderRadius:'50%', background:'#DC2626', flexShrink:0 }} />
                  <span style={{ fontSize:12.5, fontWeight:800, color:'#991B1B', fontVariantNumeric:'tabular-nums' }}>{dureeLisible(vocal.duree)}</span>
                  <span style={{ fontSize:11.5, color:'#B91C1C', flex:1 }}>Enregistrement… arrêt automatique à {dureeLisible(vocal.dureeMaxS)}</span>
                  <button onClick={vocal.annuler} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#991B1B', fontWeight:700, padding:'4px 8px', fontFamily:'inherit' }}>Annuler</button>
                  <button onClick={vocal.arreter} style={{ padding:'6px 14px', background:'#DC2626', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12, fontFamily:'inherit' }}>⏹ Terminer</button>
                </div>
              )}

              {/* APERÇU AVANT ENVOI - une note vocale partie ne se reprend pas. */}
              {vocal.etat === 'pret' && (
                <div style={{ padding:'9px 16px', background:'#F0FDF4', borderTop:'1px solid #BBF7D0', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <span style={{ fontSize:17 }}>🎙️</span>
                  <audio controls src={vocal.url} style={{ flex:1, minWidth:170, height:34 }} />
                  <span style={{ fontSize:11.5, color:'#15803D', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{dureeLisible(vocal.duree)}</span>
                  <button onClick={vocal.reinitialiser} disabled={envoiVocal}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:COULEURS.gris600, fontWeight:700, padding:'4px 8px', fontFamily:'inherit' }}>Refaire</button>
                  <button onClick={envoyerVocal} disabled={envoiVocal}
                    style={{ padding:'6px 14px', background: envoiVocal ? COULEURS.gris200 : '#16A34A', color:'#fff', border:'none', borderRadius:8, cursor: envoiVocal ? 'wait' : 'pointer', fontWeight:700, fontSize:12, fontFamily:'inherit' }}>
                    {envoiVocal ? (pctVocal > 0 && pctVocal < 100 ? `${pctVocal}%` : 'Envoi…') : 'Envoyer'}
                  </button>
                </div>
              )}

              {vocal.erreur && (
                <div style={{ padding:'8px 16px', background:'#FFFBEB', borderTop:'1px solid #FDE68A', fontSize:11.5, color:'#92400E' }}>
                  {vocal.erreur}
                </div>
              )}

              {/* Pièces jointes en attente */}
              {fichiersEnAttente.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 16px 0', background: COULEURS.blanc }}>
                  {fichiersEnAttente.map(f => (
                    <div key={f.id} title={f.erreur || ''} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10,
                      background: f.status === 'erreur' ? '#FEF2F2' : COULEURS.gris50, border: `1px solid ${f.status === 'erreur' ? '#FCA5A5' : COULEURS.gris200}`,
                      fontSize: 11, maxWidth: f.status === 'erreur' ? 260 : 180,
                    }}>
                      <span>{f.status === 'upload' ? '⏳' : f.status === 'erreur' ? '⚠️' : iconeFichier(f.name)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: f.status === 'erreur' ? '#991B1B' : COULEURS.navy, fontWeight: 600 }}>
                        {f.status === 'erreur' ? (f.erreur || `Échec : ${f.name}`) : f.name}
                      </span>
                      <button onClick={() => setFichiersEnAttente(p => p.filter(x => x.id !== f.id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: COULEURS.gris400, fontSize: 13, padding: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input */}
              <div style={S.inputZone}>
                <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} disabled={sansPieceJointe}
                  onChange={onChoisirFichiers} />
                <button
                  onClick={() => !sansPieceJointe && fichiersEnAttente.length < MAX_FICHIERS && fileInputRef.current?.click()}
                  disabled={sansPieceJointe || fichiersEnAttente.length >= MAX_FICHIERS}
                  title={sansPieceJointe
                    ? "L'envoi de fichiers n'est pas ouvert aux apprenants - vous pouvez écrire un message ou envoyer une note vocale."
                    : fichiersEnAttente.length >= MAX_FICHIERS ? `Max ${MAX_FICHIERS} fichiers` : 'Joindre un fichier'}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${COULEURS.gris200}`,
                    background: COULEURS.blanc, cursor: (!sansPieceJointe && fichiersEnAttente.length < MAX_FICHIERS) ? 'pointer' : 'not-allowed',
                    fontSize: 17, flexShrink: 0, color: COULEURS.gris600, opacity: sansPieceJointe ? 0.45 : 1,
                  }}>
                  📎
                </button>

                {/* Le micro n'apparaît que s'il est utilisable : les navigateurs exigent
                    HTTPS ou localhost, et un bouton qui échoue toujours vaut moins que
                    pas de bouton. */}
                {microDisponible() && vocal.etat === 'repos' && (
                  <button
                    onClick={vocal.demarrer}
                    disabled={envoiVocal}
                    title="Enregistrer une note vocale"
                    style={{
                      width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${COULEURS.gris200}`,
                      background: COULEURS.blanc, cursor: envoiVocal ? 'not-allowed' : 'pointer',
                      fontSize: 17, flexShrink: 0, color: COULEURS.gris600,
                    }}>
                    🎤
                  </button>
                )}

                {/* Les emojis, juste après le micro. */}
                <SelecteurEmoji accent={COULEURS.bleu || '#0369a1'}
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

                <textarea
                  ref={champSaisieRef}
                  style={S.textarea}
                  value={texte}
                  onChange={e => setTexte(e.target.value)}
                  onKeyDown={gererTouche}
                  placeholder={citation ? `Répondre à ${citation.auteur_nom}…` : "Écrivez votre message… (Entrée pour envoyer)"}
                  rows={1}
                />
                <button style={S.btnEnvoyer} onClick={envoyer} disabled={!peutEnvoyer}>
                  ➤
                </button>
              </div>
            </>
          ) : (
            <div style={S.vide}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>💬</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: COULEURS.navy, marginBottom: 8 }}>
                Messagerie interne BET
              </div>
              <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
                Sélectionnez une conversation dans la liste pour commencer à échanger.
              </div>
              {!FIREBASE_ACTIF && (
                <div style={{ marginTop: 20, padding: '12px 16px', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 10, fontSize: 12, color: '#92400E', maxWidth: 360, textAlign: 'left', lineHeight: 1.6 }}>
                  <strong>🔧 Firebase non configuré</strong><br />
                  Ajoutez vos clés dans <code>.env</code> :<br /><br />
                  <code>REACT_APP_FIREBASE_API_KEY=…</code><br />
                  <code>REACT_APP_FIREBASE_PROJECT_ID=…</code>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}
      </div>
    </TopNavLayout>
  );
}
