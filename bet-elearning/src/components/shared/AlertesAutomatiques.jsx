import { useState } from 'react';
import { COULEURS } from '../../constants/couleurs';

const CFG_GRAVITE = {
  critique: { bg: '#FEF2F2', bord: '#FECACA', txt: '#991B1B', badge: '#EF4444', libBadge: '🔴 Critique' },
  warning:  { bg: '#FFFBEB', bord: '#FDE68A', txt: '#92400E', badge: '#F59E0B', libBadge: '⚠️ Attention' },
};

const CFG_TYPE = {
  absence_consecutive: { couleur: '#EF4444', iconeType: '📅' },
  devoir_non_rendu:    { couleur: '#F59E0B', iconeType: '📝' },
  note_faible:         { couleur: '#7C3AED', iconeType: '📉' },
  absence_prof:        { couleur: '#0891B2', iconeType: '👨‍🏫' },
};

/**
 * Panneau d'alertes automatiques.
 * Props :
 *   alertes   - tableau d'alertes (depuis detecterAlertes / alertesPourRole)
 *   titre     - titre du panneau (optionnel)
 *   compact   - si true, affiche une version réduite (pour dashboards secondaires)
 */
export default function AlertesAutomatiques({ alertes = [], titre = '🔔 Alertes automatiques', compact = false }) {
  const [ouvert, setOuvert] = useState(true);
  const [fermeesIds, setFermeesIds] = useState([]);

  const visibles = alertes.filter(a => !fermeesIds.includes(a.id));

  if (alertes.length === 0) return null;

  const nbCritiques = alertes.filter(a => a.gravite === 'critique').length;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* En-tête cliquable */}
      <button
        onClick={() => setOuvert(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: nbCritiques > 0
            ? 'linear-gradient(135deg, #FEF2F2, #FFF5F5)'
            : 'linear-gradient(135deg, #FFFBEB, #FEF9C3)',
          border: `1.5px solid ${nbCritiques > 0 ? '#FECACA' : '#FDE68A'}`,
          borderRadius: ouvert ? '12px 12px 0 0' : 12,
          padding: '12px 18px',
          cursor: 'pointer',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          transition: 'border-radius 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{nbCritiques > 0 ? '🚨' : '⚠️'}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: nbCritiques > 0 ? '#991B1B' : '#92400E' }}>
            {titre}
          </span>
          <span style={{
            background: nbCritiques > 0 ? '#EF4444' : '#F59E0B',
            color: '#fff', borderRadius: 20, padding: '2px 10px',
            fontSize: 12, fontWeight: 800,
          }}>
            {alertes.length} alerte{alertes.length > 1 ? 's' : ''}
          </span>
          {nbCritiques > 0 && (
            <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
              {nbCritiques} critique{nbCritiques > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span style={{ fontSize: 16, color: '#92400E', transform: ouvert ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {/* Corps */}
      {ouvert && (
        <div style={{
          border: `1.5px solid ${nbCritiques > 0 ? '#FECACA' : '#FDE68A'}`,
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          overflow: 'hidden',
        }}>
          {visibles.length === 0 ? (
            <div style={{ padding: '16px 20px', fontSize: 13, color: COULEURS.gris400, fontStyle: 'italic', textAlign: 'center', background: '#FFFBEB' }}>
              Toutes les alertes ont été traitées ✓
            </div>
          ) : (
            visibles.map((alerte, i) => {
              const g   = CFG_GRAVITE[alerte.gravite] || CFG_GRAVITE.warning;
              const cfg = CFG_TYPE[alerte.type] || {};
              const isLast = i === visibles.length - 1;

              return (
                <div
                  key={alerte.id}
                  style={{
                    display: 'flex',
                    gap: 14,
                    alignItems: 'flex-start',
                    padding: compact ? '12px 18px' : '16px 20px',
                    background: g.bg,
                    borderBottom: isLast ? 'none' : `1px solid ${g.bord}`,
                    borderLeft: `4px solid ${cfg.couleur || g.badge}`,
                  }}
                >
                  {/* Icône */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: (cfg.couleur || g.badge) + '18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0,
                  }}>
                    {alerte.icone}
                  </div>

                  {/* Contenu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: g.txt }}>{alerte.titre}</span>
                      <span style={{ padding: '1px 8px', borderRadius: 10, background: g.badge + '20', color: g.badge, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {g.libBadge}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: g.txt, lineHeight: 1.6, margin: 0 }}>
                      {alerte.message}
                    </p>
                    {!compact && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {/* Lien action primaire */}
                        {(alerte.lien_admin || alerte.lien_prof || alerte.lien_parent || alerte.lien_apprenant) && (
                          <a
                            href={alerte.lien_admin || alerte.lien_prof || alerte.lien_parent || alerte.lien_apprenant}
                            style={{
                              fontSize: 11, fontWeight: 700, color: cfg.couleur || g.badge,
                              background: (cfg.couleur || g.badge) + '15',
                              border: `1px solid ${(cfg.couleur || g.badge) + '40'}`,
                              borderRadius: 6, padding: '4px 10px',
                              textDecoration: 'none', display: 'inline-block',
                            }}
                          >
                            Voir →
                          </a>
                        )}
                        <button
                          onClick={() => setFermeesIds(p => [...p, alerte.id])}
                          style={{
                            fontSize: 11, fontWeight: 600, color: COULEURS.gris600,
                            background: 'transparent',
                            border: `1px solid ${COULEURS.gris200}`,
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                            fontFamily: '"Plus Jakarta Sans", sans-serif',
                          }}
                        >
                          ✓ Traité
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Heure */}
                  <div style={{ fontSize: 10, color: g.txt, opacity: 0.6, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                    {new Date(alerte.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
