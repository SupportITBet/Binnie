import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  FIREBASE_ACTIF,
  ecouterConversations,
  ecouterMessages,
  envoyerMessage,
  marquerCommeLu,
  assurerMesInfos,
  obtenirOuCreerConversation,
  definirPresence,
  definirAbsence,
  ecouterPresence,
  ecouterNotifications,
  envoyerNotification,
} from '../services/firebase';

// ── Données mock (fallback si Firebase non configuré) ────────────────────────
const MOCK_CONVERSATIONS = [
  {
    id: 'conv-001',
    participants: ['admin-001', 'teacher-001'],
    participantsInfo: {
      'admin-001':   { prenom: 'Bernard', nom: 'Aka',    role: 'admin_manager',        initiales: 'BA' },
      'teacher-001': { prenom: 'Marie',   nom: 'Dupont', role: 'professeur_titulaire', initiales: 'MD' },
    },
    dernierMessage:   'Bien reçu, merci pour la mise à jour.',
    dernierMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    nonLu: { 'admin-001': false, 'teacher-001': true },
  },
  {
    id: 'conv-002',
    participants: ['admin-001', 'tlg-rh-001'],
    participantsInfo: {
      'admin-001':  { prenom: 'Bernard',   nom: 'Aka',    role: 'admin_manager',    initiales: 'BA' },
      'tlg-rh-001': { prenom: 'Jean-Paul', nom: 'Kouamé', role: 'client_entreprise', initiales: 'JK' },
    },
    dernierMessage:   'Quand démarre la formation du groupe B2 ?',
    dernierMessageAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    nonLu: { 'admin-001': true, 'tlg-rh-001': false },
  },
  {
    id: 'conv-003',
    participants: ['admin-001', 'par-001'],
    participantsInfo: {
      'admin-001': { prenom: 'Bernard', nom: 'Aka',  role: 'admin_manager', initiales: 'BA' },
      'par-001':   { prenom: 'Djeneba', nom: 'Koné', role: 'parent',        initiales: 'DK' },
    },
    dernierMessage:   'Pouvez-vous me donner le dernier bulletin ?',
    dernierMessageAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    nonLu: { 'admin-001': false, 'par-001': false },
  },
];

const MOCK_MESSAGES = {
  'conv-001': [
    { id: 'm-001', envoyeurId: 'teacher-001', envoyeurNom: 'Marie Dupont', contenu: "J'ai mis à jour les notes du groupe A1 pour la session de lundi.", timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), lu: true },
    { id: 'm-002', envoyeurId: 'admin-001',   envoyeurNom: 'Bernard Aka',  contenu: 'Merci Marie, je les ai transmis aux parents concernés.', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), lu: true },
    { id: 'm-003', envoyeurId: 'teacher-001', envoyeurNom: 'Marie Dupont', contenu: 'Parfait ! Aminata pourrait passer au niveau A2 prochainement.', timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), lu: true },
    { id: 'm-004', envoyeurId: 'admin-001',   envoyeurNom: 'Bernard Aka',  contenu: 'Excellent ! Je programme un test de niveau pour la semaine prochaine.', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), lu: true },
    { id: 'm-005', envoyeurId: 'teacher-001', envoyeurNom: 'Marie Dupont', contenu: 'Bien reçu, merci pour la mise à jour.', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), lu: false },
  ],
  'conv-002': [
    { id: 'm-006', envoyeurId: 'tlg-rh-001', envoyeurNom: 'Jean-Paul Kouamé', contenu: "J'aimerais un point sur la progression de nos bénéficiaires.", timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000), lu: true },
    { id: 'm-007', envoyeurId: 'admin-001',  envoyeurNom: 'Bernard Aka',       contenu: '22 bénéficiaires actifs sur 30 - taux de présence moyen de 87%.', timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000), lu: true },
    { id: 'm-008', envoyeurId: 'tlg-rh-001', envoyeurNom: 'Jean-Paul Kouamé', contenu: 'Quand démarre la formation du groupe B2 ?', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), lu: false },
  ],
  'conv-003': [
    { id: 'm-009', envoyeurId: 'par-001',   envoyeurNom: 'Djeneba Koné', contenu: 'Bonjour, comment se passe la scolarité de ma fille Aminata ?', timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), lu: true },
    { id: 'm-010', envoyeurId: 'admin-001', envoyeurNom: 'Bernard Aka',  contenu: 'Aminata progresse très bien - niveau A1 acquis avec 92% de présence.', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), lu: true },
    { id: 'm-011', envoyeurId: 'par-001',   envoyeurNom: 'Djeneba Koné', contenu: 'Pouvez-vous me donner le dernier bulletin ?', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), lu: false },
  ],
};

// ── Contexte ─────────────────────────────────────────────────────────────────
const MessagerieContext = createContext(null);

export function MessagerieProvider({ children }) {
  const { profile } = useAuth();
  const [conversations,    setConversations]    = useState([]);
  const [messagesParConv,  setMessagesParConv]  = useState({});
  const [convActive,       setConvActive]       = useState(null);
  const [presences,        setPresences]        = useState({});
  const [notifications,    setNotifications]    = useState([]);
  const unsubs = useRef([]);

  const userId = profile?.id;

  // ── Présence en ligne ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !FIREBASE_ACTIF) return;
    const infoUser = {
      prenom:    profile?.prenom || '',
      nom:       profile?.nom    || '',
      role:      profile?.role   || '',
      initiales: `${profile?.prenom?.[0] || ''}${profile?.nom?.[0] || ''}`,
    };
    definirPresence(userId, infoUser);

    const gererFermeture = () => definirAbsence(userId);
    window.addEventListener('beforeunload', gererFermeture);
    return () => {
      definirAbsence(userId);
      window.removeEventListener('beforeunload', gererFermeture);
    };
  }, [userId]);

  // ── Conversations ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    if (FIREBASE_ACTIF) {
      const unsub = ecouterConversations(userId, setConversations);
      unsubs.current.push(unsub);
      return () => unsub();
    } else {
      const convsMock = MOCK_CONVERSATIONS.filter(c => c.participants.includes(userId));
      setConversations(convsMock.length > 0 ? convsMock : MOCK_CONVERSATIONS);
      setMessagesParConv(MOCK_MESSAGES);
    }
  }, [userId]);

  // ── Messages de la conversation active ──────────────────────────────────
  useEffect(() => {
    if (!convActive || !FIREBASE_ACTIF) return;
    const unsub = ecouterMessages(convActive, (msgs) => {
      setMessagesParConv(prev => ({ ...prev, [convActive]: msgs }));
    });
    unsubs.current.push(unsub);
    return () => unsub();
  }, [convActive]);

  // ── Présence des interlocuteurs ──────────────────────────────────────────
  useEffect(() => {
    if (!FIREBASE_ACTIF || !conversations.length) return;
    const autresIds = [...new Set(
      conversations.flatMap(c => c.participants).filter(id => id !== userId)
    )];
    const unsubPresences = autresIds.map(id =>
      ecouterPresence(id, (data) => {
        setPresences(prev => ({ ...prev, [id]: data }));
      })
    );
    return () => unsubPresences.forEach(u => u());
  }, [conversations, userId]);

  // ── Notifications non lues ───────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !FIREBASE_ACTIF) return;
    const unsub = ecouterNotifications(userId, setNotifications);
    unsubs.current.push(unsub);
    return () => unsub();
  }, [userId]);

  // ── Cleanup global ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => unsubs.current.forEach(u => u());
  }, []);

  // ── Dérivés ──────────────────────────────────────────────────────────────
  const nbNonLus = conversations.reduce((total, conv) => {
    return total + (conv.nonLu?.[userId] ? 1 : 0);
  }, 0);

  const nbNotifications = notifications.length;

  // ── Actions ──────────────────────────────────────────────────────────────
  /**
   * @param {object|null} repondA  le message cité : `{ id, auteur_nom, extrait }`.
   *   Firestore n'ayant pas de schéma, les messages déjà écrits n'ont pas ce champ et
   *   restent parfaitement lisibles.
   */
  async function envoyerMsg(convId, contenu, attachments = [], repondA = null) {
    const texte = (contenu || '').trim();
    if (!texte && attachments.length === 0) return;
    if (!profile) return;
    const conv = conversations.find(c => c.id === convId);
    const destinataireId = conv?.participants?.find(p => p !== userId);
    const infoExp = {
      prenom:    profile?.prenom || '',
      nom:       profile?.nom    || '',
      role:      profile?.role   || '',
      initiales: `${profile?.prenom?.[0] || '?'}${profile?.nom?.[0] || '?'}`,
    };
    // L'aperçu de la liste des conversations : une note vocale y était annoncée
    // « 📎 note-vocale-2026-…webm », illisible. On la nomme.
    const estVocal = attachments.length > 0 && /^note-vocale/.test(attachments[0].name || '');
    const apercu = texte
      || (estVocal ? '🎙️ Note vocale'
        : attachments.length > 0 ? `📎 ${attachments[0].name}` : '');
    const msg = {
      envoyeurId:    userId,
      envoyeurNom:   `${profile.prenom} ${profile.nom}`,
      contenu:       texte,
      attachments,
      repondA:       repondA || null,
      destinataireId,
      // Toujours ré-écrit à chaque envoi pour "réparer" une conv créée sans participantsInfo.
      // On n'écrit jamais d'objet vide : un {} serait "truthy" et casserait le fallback d'affichage.
      participantsInfo: {
        [userId]: infoExp,
        ...(destinataireId && conv?.participantsInfo?.[destinataireId]?.prenom
          ? { [destinataireId]: conv.participantsInfo[destinataireId] }
          : {}),
      },
    };

    if (FIREBASE_ACTIF) {
      await envoyerMessage(convId, msg, apercu);
      // Notifier le destinataire
      if (destinataireId) {
        await envoyerNotification(destinataireId, {
          type:       'message',
          titre:      `Nouveau message de ${profile.prenom} ${profile.nom}`,
          contenu:    apercu.slice(0, 80),
          convId,
          envoyeurId: userId,
        });
      }
    } else {
      const nvMsg = { ...msg, id: `m-${Date.now()}`, timestamp: new Date(), lu: false };
      setMessagesParConv(prev => ({
        ...prev,
        [convId]: [...(prev[convId] || []), nvMsg],
      }));
      setConversations(prev => prev.map(c =>
        c.id === convId
          ? { ...c, dernierMessage: apercu, dernierMessageAt: new Date() }
          : c
      ));
    }
  }

  function ouvrirConversation(convId) {
    setConvActive(convId);
    if (FIREBASE_ACTIF) {
      marquerCommeLu(convId, userId);
      // Répare mon propre nom/rôle pour l'interlocuteur, sans attendre un envoi de message
      assurerMesInfos(convId, userId, {
        prenom:    profile?.prenom || '',
        nom:       profile?.nom    || '',
        role:      profile?.role   || '',
        initiales: `${profile?.prenom?.[0] || '?'}${profile?.nom?.[0] || '?'}`,
      }).catch(() => {});
    } else {
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, nonLu: { ...c.nonLu, [userId]: false } } : c
      ));
    }
  }

  function getInterlocuteur(conv) {
    if (!conv?.participants || !userId) return null;
    const autreId = conv.participants?.find(p => p !== userId);
    if (!autreId) return null;
    // Chercher dans participantsInfo (clé = ID ou sous forme d'objet)
    const info = conv.participantsInfo?.[autreId];
    if (info && (info.prenom || info.nom)) return { ...info, id: autreId };
    // Fallback minimal si participantsInfo absent ou incomplet (ex: {} écrit avant connaissance du contact)
    return { id: autreId, prenom: 'Utilisateur', nom: '', role: info?.role || '', initiales: '?' };
  }

  function estEnLigne(interlocuteurId) {
    return presences[interlocuteurId]?.enligne === true;
  }

  async function ouvrirOuCreerConversation(contactInfo) {
    if (!userId || !contactInfo?.id) return;

    /* `avatar_url` est recopiée ici pour que le visage apparaisse DÈS l'ouverture, sans
       attendre la résolution par compte que fait l'écran. Elle reste un secours, jamais la
       référence : c'est `utilisateurs.avatar_url` qui fait foi, et l'écran la relit - sans
       quoi une photo changée resterait figée dans les conversations déjà ouvertes. */
    const infoExp = {
      prenom:    profile?.prenom || '',
      nom:       profile?.nom    || '',
      role:      profile?.role   || '',
      initiales: `${profile?.prenom?.[0] || '?'}${profile?.nom?.[0] || '?'}`,
      avatar_url: profile?.avatar_url || null,
    };
    const infoRec = {
      prenom:    contactInfo.prenom    || '',
      nom:       contactInfo.nom       || '',
      role:      contactInfo.role      || '',
      initiales: contactInfo.initiales || '??',
      avatar_url: contactInfo.avatar_url || null,
    };

    // ID déterministe basé sur les deux participants
    const convId = FIREBASE_ACTIF
      ? [userId, contactInfo.id].sort().join('_')
      : `conv-cc-${Date.now()}`;

    // Vérifier si la conversation existe déjà
    const existing = conversations.find(c => c.id === convId || c.participants.includes(contactInfo.id));
    if (existing) { ouvrirConversation(existing.id); return; }

    // Mise à jour optimiste immédiate → la zone de chat s'ouvre tout de suite
    const newConv = {
      id: convId,
      participants: [userId, contactInfo.id],
      participantsInfo: { [userId]: infoExp, [contactInfo.id]: infoRec },
      dernierMessage:   '',
      dernierMessageAt: new Date(),
      nonLu: { [userId]: false, [contactInfo.id]: false },
    };
    setConversations(prev => {
      if (prev.find(c => c.id === convId)) return prev;
      return [newConv, ...prev];
    });
    setMessagesParConv(prev => ({ ...prev, [convId]: [] }));
    setConvActive(convId);

    // Sync Firebase en arrière-plan (non bloquant)
    if (FIREBASE_ACTIF) {
      obtenirOuCreerConversation(userId, contactInfo.id, { [userId]: infoExp, [contactInfo.id]: infoRec })
        .catch(err => console.warn('[Messagerie] Firebase sync échoué:', err));
    }
  }

  return (
    <MessagerieContext.Provider value={{
      conversations,
      messagesParConv,
      convActive,
      nbNonLus,
      nbNotifications,
      notifications,
      presences,
      ouvrirConversation,
      ouvrirOuCreerConversation,
      envoyerMsg,
      getInterlocuteur,
      estEnLigne,
      FIREBASE_ACTIF,
    }}>
      {children}
    </MessagerieContext.Provider>
  );
}

export const useMessagerie = () => useContext(MessagerieContext);
