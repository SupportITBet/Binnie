import { useState, useEffect } from 'react';
import { COULEURS } from '../../constants/couleurs';

/**
 * Pièces justificatives d'un versement entreprise, et statut de vérification.
 *
 * Quatre écrans montrent les mêmes versements - l'espace RH, la modale entreprise
 * de l'assistante/commerciale, sa jumelle du SuperAdmin, et la page Gestion des
 * entreprises. Ils doivent dire la même chose du même justificatif : d'où ce
 * fichier unique plutôt que quatre rendus qui divergeraient au premier correctif.
 */

// ── Les trois états d'un versement ───────────────────────────────────────────
// 'recu' est le statut HISTORIQUE (défaut de la table) : tout versement saisi par
// un admin naît validé, et c'est le seul que les totaux comptent. Les deux autres
// n'existent que pour les versements déclarés par l'entreprise elle-même.
export const STATUT_VERSEMENT = {
  declare: { lib: 'À vérifier', icone: '🕐', bg: '#FEF3C7', txt: '#92400E', bord: '#FCD34D' },
  recu:    { lib: 'Validé',     icone: '✅', bg: '#D1FAE5', txt: '#065F46', bord: '#6EE7B7' },
  rejete:  { lib: 'Rejeté',     icone: '⚠️', bg: '#FEE2E2', txt: '#991B1B', bord: '#FCA5A5' },
};

export function cfgStatutVersement(statut) {
  return STATUT_VERSEMENT[statut] || STATUT_VERSEMENT.recu;
}

/** Un versement compte-t-il dans les totaux ? Seul 'recu' est de l'argent encaissé. */
export function estVerse(p) { return (p?.statut || 'recu') === 'recu'; }

export function BadgeStatutVersement({ statut, compact = false }) {
  const c = cfgStatutVersement(statut);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
      padding: compact ? '2px 7px' : '3px 10px', borderRadius: 20,
      background: c.bg, color: c.txt, border: `1px solid ${c.bord}`,
      fontSize: compact ? 9 : 10, fontWeight: 700,
    }}>
      {c.icone} {c.lib}
    </span>
  );
}

const estImage = (p) => (p?.type || '').startsWith('image/');

/**
 * Les vignettes, à côté du bouton Valider.
 *
 * Une image s'ouvre dans la visionneuse interne : la vérificatrice doit pouvoir
 * lire un montant sur un reçu photographié sans quitter la fiche. Un PDF part
 * dans un nouvel onglet - le visualiseur natif du navigateur fait mieux qu'un
 * iframe, et Cloudinary sert certains PDF en `raw`, que l'iframe téléchargerait
 * au lieu de l'afficher.
 */
export function VignettesPreuves({ preuves, taille = 38, vertical = false }) {
  const [apercu, setApercu] = useState(null);
  const liste = Array.isArray(preuves) ? preuves.filter(p => p?.url) : [];
  if (liste.length === 0) return null;

  const ouvrir = (p, e) => {
    e?.stopPropagation();
    if (estImage(p)) setApercu(p);
    else window.open(p.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 6, flexWrap: 'wrap', alignItems: vertical ? 'stretch' : 'center' }}>
        {liste.map((p, i) => (
          <button
            key={p.url + i}
            onClick={e => ouvrir(p, e)}
            title={`${p.nom || 'Justificatif'} — cliquer pour ouvrir`}
            style={{
              width: vertical ? '100%' : taille, height: taille,
              padding: 0, borderRadius: 7, overflow: 'hidden', cursor: 'pointer',
              border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.gris50,
              display: 'flex', alignItems: 'center', justifyContent: vertical ? 'flex-start' : 'center',
              gap: 7, flexShrink: 0, fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            {estImage(p) ? (
              <img src={p.url} alt={p.nom || 'Justificatif'}
                style={{ width: vertical ? taille : '100%', height: '100%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: 16, width: vertical ? taille : 'auto', textAlign: 'center' }}>📄</span>
            )}
            {vertical && (
              <span style={{ fontSize: 11, fontWeight: 600, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {p.nom || 'Justificatif'}
              </span>
            )}
          </button>
        ))}
      </div>

      {apercu && <VisionneusePreuve preuve={apercu} onFermer={() => setApercu(null)} />}
    </>
  );
}

/** Visionneuse plein écran pour une preuve image. Échap ferme, comme partout ailleurs. */
export function VisionneusePreuve({ preuve, onFermer }) {
  useEffect(() => {
    const auClavier = e => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, [onFermer]);

  return (
    <div onClick={onFermer}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.92)', zIndex: 100001, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: '100%', maxHeight: '100%' }}>
        <img src={preuve.url} alt={preuve.nom || 'Justificatif'}
          style={{ maxWidth: '92vw', maxHeight: '78vh', borderRadius: 10, boxShadow: '0 24px 64px rgba(0,0,0,0.6)', objectFit: 'contain' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>{preuve.nom || 'Justificatif'}</span>
          <a href={preuve.url} target="_blank" rel="noopener noreferrer"
            style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
            ↗ Ouvrir en grand
          </a>
          <button onClick={onFermer}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            ✕ Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export default VignettesPreuves;
