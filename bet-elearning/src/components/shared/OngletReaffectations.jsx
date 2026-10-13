import { useState, useEffect, useCallback } from 'react';
import { COULEURS } from '../../constants/couleurs';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`, 'X-Plateforme': 'bet-elearning' });

const fmtDateSup = (d) =>
  (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

/* ═══════════════════════════════════════════════════════════════════════════
   DOSSIERS À RÉAFFECTER
   ═══════════════════════════════════════════════════════════════════════════
   Un prospect suivi par DEUX assistantes sur deux canaux différents (présentiel et en
   ligne) a deux dossiers pour une seule personne. Celui qui ouvre cet écran tranche : il
   désigne l'assistante qui consolide le dossier.

   PARTAGÉ ENTRE LE CONSEILLER PÉDAGOGIQUE ET L'ONBOARDING, parce que les deux arbitrent les
   mêmes doubles affectations - chez dash l'onglet existe des deux côtés. Un composant et non
   deux copies : la seconde aurait divergé au premier ajustement, et les deux écrans
   n'auraient plus proposé les mêmes assistantes.

   LA SOURCE EST LA BOÎTE DE NOTIFICATIONS DE CELUI QUI REGARDE
   (`/api/notifications/mes-notifs`), pas une table de plateforme : ce sont ses alertes,
   celles qu'on lui a adressées. Il n'y a donc rien à filtrer par plateforme ici - et rien à
   inventer non plus, le signalement est posé par le parcours au moment où la double
   affectation est détectée.

   Deux compteurs de la Vue d'ensemble de l'Onboarding attendaient cet onglet.
═══════════════════════════════════════════════════════════════════════════ */
export default function OngletReaffectations({ couleur = '#8B5CF6' }) {
  const [signalements, setSignalements] = useState([]);
  const [assistantes, setAssistantes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [choix, setChoix] = useState({});        // { [notifId]: assistanteId }
  const [enCours, setEnCours] = useState(null);  // notifId en cours de traitement
  const [flash, setFlash] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [dn, da] = await Promise.all([
        fetch(`${_API_URL_ADMIN}/api/notifications/mes-notifs?limit=50`, { headers: _authHdrsAdmin() }).then(r => (r.ok ? r.json() : { notifications: [] })).catch(() => ({ notifications: [] })),
        fetch(`${_API_URL_ADMIN}/api/parcours/assistantes`, { headers: _authHdrsAdmin() }).then(r => (r.ok ? r.json() : { assistantes: [] })).catch(() => ({ assistantes: [] })),
      ]);
      // Le marqueur d'une double affectation : `meta.autre_assignation_id`. Les alertes
      // déjà lues sortent de la file - elles ont été traitées.
      setSignalements((dn.notifications || []).filter(n => n.meta?.autre_assignation_id && !n.lu));
      setAssistantes(da.assistantes || []);
    } finally { setChargement(false); }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  async function reaffecter(notif) {
    const assistanteId = choix[notif.id];
    if (!assistanteId || enCours) return;
    setEnCours(notif.id);
    setFlash(null);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/parcours/${notif.meta.assignation_id || notif.meta.autre_assignation_id}`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ assistante_id: assistanteId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Réaffectation impossible');
      // L'alerte est marquée lue : sans cela elle reviendrait à chaque chargement, et
      // rien ne distinguerait un dossier traité d'un dossier en attente.
      await fetch(`${_API_URL_ADMIN}/api/notifications/${notif.id}/lu`, { method: 'PATCH', headers: _authHdrsAdmin() }).catch(() => {});
      setSignalements(prev => prev.filter(n => n.id !== notif.id));
      const a = assistantes.find(x => x.id === assistanteId);
      setFlash({ type: 'ok', msg: `✅ Dossier réaffecté à ${a ? `${a.prenom || ''} ${a.nom || ''}`.trim() : 'l\'assistante choisie'}.` });
    } catch (e) {
      setFlash({ type: 'err', msg: `Erreur : ${e.message}` });
    } finally { setEnCours(null); }
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>🔀 Dossiers à réaffecter</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.6, maxWidth: 680 }}>
          Prospects suivis par deux assistantes sur deux canaux différents (présentiel et en ligne).
          Choisissez celle qui consolide le dossier — l'autre suivi est abandonné.
        </div>
      </div>

      {flash && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, fontSize: 12.5,
          background: flash.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${flash.type === 'ok' ? '#BBF7D0' : '#FCA5A5'}`,
          color: flash.type === 'ok' ? '#15803D' : '#991B1B' }}>
          {flash.msg}
        </div>
      )}

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 13 }}>⏳ Chargement…</div>
      ) : signalements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 46, background: '#F8FAFC', borderRadius: 14, border: '1px dashed #E2E8F0' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Aucun dossier en attente de réaffectation</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5, maxWidth: 460, margin: '5px auto 0', lineHeight: 1.6 }}>
            Les doubles affectations vous sont signalées automatiquement dès qu'un prospect
            est suivi par deux assistantes sur deux canaux différents.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {signalements.map(n => {
            const choisie = choix[n.id] || '';
            const occupe = enCours === n.id;
            return (
              <div key={n.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderLeft: '4px solid #F59E0B', borderRadius: 12, padding: '15px 18px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{n.titre || 'Double affectation détectée'}</div>
                {n.message && <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6, marginBottom: 10 }}>{n.message}</div>}
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>Signalé le {fmtDateSup(n.created_at)}</div>

                <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={choisie} onChange={e => setChoix(p => ({ ...p, [n.id]: e.target.value }))}
                    disabled={occupe}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 12.5, fontFamily: 'inherit', color: '#0f172a', minWidth: 260 }}>
                    <option value="">— Choisir l'assistante qui garde le dossier —</option>
                    {assistantes.map(a => (
                      <option key={a.id} value={a.id}>
                        {`${a.prenom || ''} ${a.nom || ''}`.trim() || a.email}{a.canal ? ` · ${a.canal}` : ''}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => reaffecter(n)} disabled={!choisie || occupe}
                    style={{ padding: '8px 16px', borderRadius: 9, border: 'none', fontSize: 12.5, fontWeight: 700,
                      fontFamily: 'inherit', cursor: (!choisie || occupe) ? 'default' : 'pointer',
                      background: (!choisie || occupe) ? '#E2E8F0' : couleur,
                      color: (!choisie || occupe) ? '#94a3b8' : '#fff' }}>
                    {occupe ? '⏳ Réaffectation…' : 'Confirmer la réaffectation'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
