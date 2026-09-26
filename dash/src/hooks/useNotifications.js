import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../config/supabase';

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

function getToken() {
  return localStorage.getItem("coach_token")
    || localStorage.getItem("admin_token")
    || "";
}

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]);
  const [nbNonLues, setNbNonLues]         = useState(0);
  const intervalRef   = useRef(null);
  const channelRef    = useRef(null);

  const fetchNotifs = useCallback(async () => {
    if (!userId) return;
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch(`${API_URL}/api/notifications/mes-notifs?source=dash`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;
      const data = await r.json();
      const list = (data.notifications || []).map(n => ({ ...n, createdAt: n.created_at }));
      setNotifications(list);
      setNbNonLues(list.filter(n => !n.lu).length);
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Chargement initial
    fetchNotifs();

    // Supabase Realtime - nom unique par souscription pour éviter l'erreur StrictMode
    // "cannot add postgres_changes callbacks after subscribe()". Date.now() seul ne suffit
    // pas : le double-invoke de StrictMode peut retomber dans la même milliseconde, ce qui
    // recrée le même nom de canal et fait réutiliser un canal déjà souscrit par Supabase.
    const channelName = `notifs-user-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new.source && payload.new.source !== 'dash') return;
          const n = { ...payload.new, createdAt: payload.new.created_at };
          setNotifications(prev => [n, ...prev]);
          setNbNonLues(prev => prev + 1);
          // Reste affiché tant que la personne ne la ferme pas elle-même (pas de disparition
          // automatique) - sinon une notification arrivée pendant qu'on regarde ailleurs
          // passe inaperçue.
          toast.custom((t) => (
            <div onClick={() => toast.dismiss(t.id)} style={{
              display: "flex", alignItems: "flex-start", gap: 10, background: "#fff",
              border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)",
              padding: "12px 14px", maxWidth: 360, cursor: "pointer",
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{n.icon || "🔔"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{n.titre}</div>
                {n.message && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{n.message}</div>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 0, flexShrink: 0 }}>✕</button>
            </div>
          ), { duration: Infinity });
        }
      )
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new.source && payload.new.source !== 'dash') return;
          const updated = payload.new;
          setNotifications(prev =>
            prev.map(n => n.id === updated.id ? { ...n, ...updated, createdAt: updated.created_at } : n)
          );
          setNbNonLues(prev => {
            const wasUnread = !payload.old?.lu;
            const isNowRead = updated.lu;
            return wasUnread && isNowRead ? Math.max(0, prev - 1) : prev;
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Polling de secours toutes les 60s (au cas où Realtime est coupé)
    intervalRef.current = setInterval(fetchNotifs, 60_000);

    return () => {
      clearInterval(intervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifs]);

  const marquerLue = async (id) => {
    const token = getToken();
    try {
      await fetch(`${API_URL}/api/notifications/${id}/lu`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n));
      setNbNonLues(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const fermerNotif = async (id) => {
    const token = getToken();
    const wasUnread = !notifications.find(n => n.id === id)?.lu;
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread) setNbNonLues(prev => Math.max(0, prev - 1));
    try {
      await fetch(`${API_URL}/api/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  };

  return { notifications, nbNonLues, marquerLue, fermerNotif, refresh: fetchNotifs };
}
