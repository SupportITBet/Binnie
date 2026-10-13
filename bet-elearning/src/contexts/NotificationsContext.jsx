import { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import {
  ecouterNotifications,
  marquerNotificationLue,
  toutMarquerNotificationsLues,
  FIREBASE_ACTIF,
} from '../services/firebase';
import { supabase } from '../config/supabase';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const ROLES_APPRENANT = ['apprenant', 'apprenant_adulte', 'parent'];

export const COULEUR_TYPE = {
  alerte: { fond: '#FEF2F2', texte: '#991B1B', bord: '#FECACA', icone: '🔴' },
  info:   { fond: '#EFF6FF', texte: '#1E40AF', bord: '#BFDBFE', icone: '🔵' },
  succes: { fond: '#F0FDF4', texte: '#166534', bord: '#BBF7D0', icone: '🟢' },
};

function iconeParType(type) {
  if (type === 'alerte' || type === 'suspension') return '⚠️';
  if (type === 'succes' || type === 'inscription' || type === 'reinstatement') return '✅';
  if (type === 'cours' || type === 'ressource') return '📚';
  return 'ℹ️';
}

function normaliserType(type) {
  if (['suspension', 'alerte'].includes(type)) return 'alerte';
  if (['inscription', 'succes', 'reinstatement'].includes(type)) return 'succes';
  return 'info';
}

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { profile } = useAuth();
  const role   = profile?.role;
  const userId = profile?.id;

  const [lues,           setLues]           = useState({});
  const [firebaseNotifs, setFirebaseNotifs] = useState([]);
  const [supabaseNotifs, setSupabaseNotifs] = useState([]);
  const channelRef  = useRef(null);
  const intervalRef = useRef(null);

  const getToken = () =>
    localStorage.getItem('bet_access_token') ||
    localStorage.getItem('admin_token') ||
    '';

  // ── Endpoints selon le rôle ──
  const endpoints = useMemo(() => {
    if (ROLES_APPRENANT.includes(role)) {
      return {
        fetch:       `${API_URL}/api/apprenants/mes-notifs?source=bet-elearning`,
        markRead:    (id) => `${API_URL}/api/apprenants/notifs/${id}/lu`,
        markAllRead: `${API_URL}/api/apprenants/notifs/tout-lire`,
      };
    }
    return {
      fetch:       `${API_URL}/api/notifications/mes-notifs?source=bet-elearning`,
      markRead:    (id) => `${API_URL}/api/notifications/${id}/lu`,
      markAllRead: `${API_URL}/api/notifications/tout-lire`,
    };
  }, [role]);

  // ── Fetch Supabase notifications ──
  const fetchSupabase = useCallback(async () => {
    if (!userId || !role) return;
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch(endpoints.fetch, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        console.warn('[NotificationsContext] fetch échoué:', r.status, r.statusText);
        return;
      }
      const d = await r.json();
      const list = (d.notifications || []).map(n => ({
        id:      n.id,
        _source: 'supabase',
        role,
        type:    normaliserType(n.type),
        /* LE TYPE D'ORIGINE EST CONSERVÉ À CÔTÉ DU TYPE NORMALISÉ.
           `normaliserType` écrase une soixantaine de valeurs métier ('paiement',
           'remplacement_confirme', 'coach_change'…) en trois états d'affichage
           (alerte / succes / info) : c'est ce qu'il faut pour colorer une carte, et
           c'est insuffisant pour la classer. Le classement par catégorie métier lit
           `type_origine`, le reste de l'écran continue de lire `type`. */
        type_origine: n.type || null,
        source:  n.source || null,
        icone:   n.icone || iconeParType(n.type),
        titre:   n.titre || n.title || 'Notification',
        message: n.message || n.corps || '',
        date:    n.created_at,
        lu:      n.lu || false,
        lien:    n.meta?.lien || n.lien || null,
      }));
      setSupabaseNotifs(list);
    } catch (err) {
      console.warn('[NotificationsContext] erreur fetch:', err);
    }
  }, [userId, role, endpoints.fetch]);

  // ── Supabase Realtime + polling backup ──
  useEffect(() => {
    if (!userId) return;
    fetchSupabase();

    // Date.now() seul peut produire des doublons si le double-mount de StrictMode retombe
    // dans la même milliseconde, ce qui recrée le même nom de canal et fait réutiliser un
    // canal déjà souscrit par Supabase (erreur "cannot add postgres_changes callbacks").
    const channelName = `notifs-bet-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        /* Le temps réel filtre comme la requête initiale : une notification écrite
           depuis dash n'a pas à surgir dans la cloche de bet-elearning. Les deux
           chemins disent la même chose — c'est leur divergence qui, auparavant, faisait
           apparaître au rechargement ce que le direct avait écarté. */
        if (payload.new.source && payload.new.source !== 'bet-elearning') return;
        const n = payload.new;
        setSupabaseNotifs(prev => [{
          id:      n.id,
          _source: 'supabase',
          role,
          type:    normaliserType(n.type),
          type_origine: n.type || null,
          source:  n.source || null,
          icone:   n.icone || iconeParType(n.type),
          titre:   n.titre || 'Notification',
          message: n.message || '',
          date:    n.created_at,
          lu:      false,
          lien:    n.meta?.lien || null,
        }, ...prev]);

        // Reste affiché tant que la personne ne la ferme pas elle-même (pas de disparition
        // automatique) - sinon une notification arrivée pendant qu'on regarde ailleurs passe
        // inaperçue. Avant : toast() simple, sans bouton de fermeture, auto-fermé après 5s.
        toast.custom((t) => (
          <div onClick={() => toast.dismiss(t.id)} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff',
            border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            padding: '12px 14px', maxWidth: 360, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans",sans-serif',
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{n.icone || iconeParType(n.type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{n.titre || 'Notification'}</div>
              {n.message && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{n.message}</div>}
            </div>
            <button onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0, flexShrink: 0 }}>✕</button>
          </div>
        ), { duration: Infinity });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.new.source && payload.new.source !== 'bet-elearning') return;
        const upd = payload.new;
        setSupabaseNotifs(prev => prev.map(n => n.id === upd.id ? { ...n, lu: upd.lu } : n));
      })
      .subscribe();
    channelRef.current = channel;

    intervalRef.current = setInterval(fetchSupabase, 60_000);

    return () => {
      clearInterval(intervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchSupabase]);

  // ── Firebase (conservé pour compatibilité) ──
  useEffect(() => {
    if (!FIREBASE_ACTIF || !userId) return;
    const unsub = ecouterNotifications(userId, (notifs) => {
      setFirebaseNotifs(
        notifs.map(n => ({
          id:      `fb_${n.id}`,
          _fbId:   n.id,
          _source: 'firebase',
          role,
          type:    normaliserType(n.type || 'info'),
          icone:   n.icone || '🔔',
          titre:   n.titre || n.title || '',
          message: n.message || n.body || '',
          date:    n.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          lu:      n.lue || false,
          lien:    n.lien || null,
        }))
      );
    });
    return () => unsub();
  }, [userId, role]);

  // Fusion : Supabase (réel) + Firebase (réel) - pas de mock
  const toutesNotifs = useMemo(
    () => [...supabaseNotifs, ...firebaseNotifs],
    [supabaseNotifs, firebaseNotifs]
  );

  const notifsAvecEtat = toutesNotifs.map(n => ({
    ...n,
    lu: lues[n.id] !== undefined ? lues[n.id] : n.lu,
  }));

  const nbNonLus = notifsAvecEtat.filter(n => !n.lu).length;

  const marquerLue = useCallback(async (id) => {
    setLues(prev => ({ ...prev, [id]: true }));
    const notif = toutesNotifs.find(n => n.id === id);
    if (!notif) return;
    const token = getToken();
    if (notif._source === 'supabase') {
      try {
        await fetch(endpoints.markRead(id), {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    } else if (notif._source === 'firebase' && notif._fbId && userId) {
      await marquerNotificationLue(userId, notif._fbId).catch(() => {});
    }
  }, [toutesNotifs, endpoints, userId]);

  const toutMarquerLu = useCallback(async () => {
    const obj = {};
    toutesNotifs.forEach(n => { obj[n.id] = true; });
    setLues(obj);
    const token = getToken();
    if (endpoints.markAllRead) {
      try {
        await fetch(endpoints.markAllRead, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    if (FIREBASE_ACTIF && userId) {
      const fbIds = firebaseNotifs.filter(n => !n.lu).map(n => n._fbId).filter(Boolean);
      if (fbIds.length) await toutMarquerNotificationsLues(userId, fbIds).catch(() => {});
    }
  }, [toutesNotifs, firebaseNotifs, endpoints, userId]);

  return (
    <NotificationsContext.Provider value={{ notifs: notifsAvecEtat, nbNonLus, marquerLue, toutMarquerLu, COULEUR_TYPE }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
