import { useState, useEffect, useCallback } from 'react';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { exporterExcelStyle } from '../../utils/genererPDF';

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` });

const COULEUR_NIV = { A1: '#10B981', A2: '#0891B2', B1: '#7C3AED', B2: '#D97706', C1: '#F59E0B', C2: '#DC2626' };
const STATUT_CONTRAT = {
  actif:     { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  brouillon: { bg: '#F1F5F9', txt: '#475569', lib: 'Brouillon' },
  suspendu:  { bg: '#FEF3C7', txt: '#92400E', lib: 'Suspendu' },
  expire:    { bg: '#FEE2E2', txt: '#991B1B', lib: 'Expiré' },
  resilie:   { bg: '#FEE2E2', txt: '#991B1B', lib: 'Résilié' },
};

function BarreProgression({ valeur, max, couleur, hauteur = 120 }) {
  const pct = max > 0 ? Math.round((valeur / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: couleur }}>{(valeur / 1000000).toFixed(1)}M</div>
      <div style={{ width: 28, height: hauteur, background: COULEURS.gris100, borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ width: '100%', height: `${pct}%`, background: couleur, borderRadius: 6, transition: 'height 0.5s' }} />
      </div>
    </div>
  );
}

export default function ReportingExecutif() {
  const { couleurTheme } = useTheme();
  const [onglet, setOnglet]   = useState('global');
  const [periode, setPeriode] = useState('annuel');
  const [chargement, setChargement] = useState(true);
  const [data, setData] = useState(null);

  const fetchReporting = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${_API}/api/elearning/reporting-executif`, { headers: _authHdrs() });
      const d = await r.json();
      if (r.ok) setData(d);
    } catch {}
    setChargement(false);
  }, []);

  useEffect(() => { fetchReporting(); }, [fetchReporting]);

  const kpis        = data?.kpis || {};
  const ca_mensuel   = data?.ca_mensuel || [];
  const niveaux_cecr = data?.niveaux_cecr || [];
  const tranches_age = data?.tranches_age || [];
  const contrats      = data?.contrats || [];
  const entreprises    = data?.entreprises || [];

  const nbApprenants    = kpis.apprenants_total || 0;
  const nbActifs         = kpis.apprenants_actifs || 0;
  const nbSessions       = kpis.sessions_total || 0;
  const nbSessionsReal   = kpis.sessions_realisees || 0;
  const tauxRealisation  = nbSessions > 0 ? Math.round((nbSessionsReal / nbSessions) * 100) : 0;
  const caTotal           = kpis.ca_total_contrats_actifs || 0;
  const maxCA             = Math.max(1, ...ca_mensuel.map(m => m.ca));

  const stats = [
    { label: 'CA contrats actifs', valeur: `${(caTotal / 1000000).toFixed(1)}M FCFA`, couleur: '#FBBF24' },
    { label: 'Apprenants actifs',  valeur: nbActifs,       couleur: couleurTheme },
    { label: 'Sessions réalisées', valeur: nbSessionsReal, couleur: COULEURS.succes },
    { label: 'Taux réalisation',   valeur: `${tauxRealisation}%`, couleur: '#A78BFA' },
  ];

  const ONGLETS = [
    { id: 'global',      lib: 'Vue globale',     icone: '📊' },
    { id: 'financier',   lib: 'Financier',        icone: '💰' },
    { id: 'apprenants',  lib: 'Apprenants',       icone: '👩‍🎓' },
    { id: 'entreprises', lib: 'Entreprises',      icone: '🏢' },
    { id: 'exports',     lib: 'Exports',          icone: '📥' },
  ];

  const S = {
    page:      { padding: 32, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    hd:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
    titre:     { fontSize: 22, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 },
    sous:      { fontSize: 13, color: COULEURS.gris400 },
    hdDroite:  { display: 'flex', gap: 10, alignItems: 'center' },
    selectPer: { padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.blanc, color: COULEURS.navy },
    btnExp:    { padding: '9px 18px', borderRadius: 8, border: 'none', background: couleurTheme, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    tabs:      { display: 'flex', gap: 2, marginBottom: 28, borderBottom: `2px solid ${COULEURS.gris200}`, overflowX: 'auto', scrollbarWidth: 'none' },
    tab:       (a) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: a ? `2px solid ${couleurTheme}` : '2px solid transparent', color: a ? couleurTheme : COULEURS.gris600, fontWeight: a ? 700 : 500, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: -2, whiteSpace: 'nowrap', flexShrink: 0 }),
    grilleKpi: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 },
    carteKpi:  (c) => ({ background: COULEURS.blanc, borderRadius: 12, padding: '18px 20px', border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }),
    kpiIcn:    { fontSize: 22, marginBottom: 8 },
    kpiLbl:    { fontSize: 11, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
    kpiVal:    (c) => ({ fontSize: 26, fontWeight: 800, color: c || COULEURS.navy, lineHeight: 1, marginBottom: 4 }),
    kpiSub:    { fontSize: 11, color: COULEURS.gris400 },
    section:   { background: COULEURS.blanc, borderRadius: 12, padding: 24, border: `1px solid ${COULEURS.gris200}`, marginBottom: 20 },
    secTitre:  { fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    deuxCol:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 },
    tabHead:   (cols) => ({ display: 'grid', gridTemplateColumns: cols, padding: '8px 16px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`, fontSize: 10, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }),
    tabLigne:  (cols) => ({ display: 'grid', gridTemplateColumns: cols, padding: '12px 16px', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 13, alignItems: 'center' }),
    badge:     (bg, txt) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: bg, color: txt, fontSize: 11, fontWeight: 600 }),
    barreH:    (pct, couleur) => ({ height: 8, background: COULEURS.gris100, borderRadius: 4, overflow: 'hidden', marginTop: 6 }),
    barreHFill:(pct, couleur) => ({ height: '100%', width: `${pct}%`, background: couleur, borderRadius: 4, transition: 'width 0.6s' }),
    ligneExp:  { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: COULEURS.blanc, borderRadius: 10, border: `1px solid ${COULEURS.gris200}`, marginBottom: 8 },
    btnDl:     { padding: '7px 16px', borderRadius: 8, border: `1px solid ${couleurTheme}`, background: COULEURS.blanc, color: couleurTheme, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif', flexShrink: 0 },
  };

  if (chargement) {
    return (
      <TopNavLayout stats={stats}>
        <div style={{ ...S.page, textAlign: 'center', padding: 80, color: COULEURS.gris400 }}>⏳ Chargement du reporting…</div>
      </TopNavLayout>
    );
  }

  return (
    <TopNavLayout stats={stats}>
      <div style={S.page}>

        {/* En-tête */}
        <div style={S.hd}>
          <div>
            <div style={S.titre}>📈 Reporting exécutif</div>
            <div style={S.sous}>Tableau de bord de pilotage stratégique BET E-Learning - données en temps réel</div>
          </div>
          <div style={S.hdDroite}>
            <select style={S.selectPer} value={periode} onChange={e => setPeriode(e.target.value)}>
              <option value="mensuel">Ce mois</option>
              <option value="trimestriel">Ce trimestre</option>
              <option value="annuel">Cette année</option>
            </select>
            <button style={S.btnExp} onClick={() => exporterExcelStyle({
              nomFichier: 'reporting_executif_global',
              titre: '📈 Reporting exécutif - Vue globale',
              sousTitre: `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
              couleurEntete: couleurTheme.replace('#', ''),
              colonnes: [
                { label: 'Indicateur', width: 30, bold: true },
                { label: 'Valeur', width: 20, align: 'right' },
              ],
              lignes: [
                ['Apprenants totaux', nbApprenants],
                ['Apprenants actifs', nbActifs],
                ['Sessions réalisées', `${nbSessionsReal}/${nbSessions}`],
                ['Entreprises actives', `${kpis.entreprises_actives || 0}/${kpis.entreprises_total || 0}`],
                ['CA contrats actifs (FCFA)', caTotal],
              ],
            })}>
              ⬇️ Exporter Excel
            </button>
          </div>
        </div>

        {/* Sous-onglets */}
        <div style={S.tabs}>
          {ONGLETS.map(o => (
            <button key={o.id} style={S.tab(onglet === o.id)} onClick={() => setOnglet(o.id)}>
              <span>{o.icone}</span><span>{o.lib}</span>
            </button>
          ))}
        </div>

        {/* ── VUE GLOBALE ── */}
        {onglet === 'global' && (
          <>
            <div style={S.grilleKpi}>
              {[
                { icone: '👩‍🎓', lbl: 'Apprenants totaux',    val: nbApprenants,         sub: `${nbActifs} actifs`,           c: couleurTheme },
                { icone: '👨‍🏫', lbl: 'Sessions réalisées',   val: nbSessionsReal,       sub: `${tauxRealisation}% du planifié`,  c: COULEURS.succes },
                { icone: '🏢', lbl: 'Entreprises actives',  val: kpis.entreprises_actives || 0, sub: `${kpis.entreprises_total || 0} partenaires`, c: '#F97316' },
                { icone: '💰', lbl: 'CA contrats actifs',   val: `${(caTotal/1000000).toFixed(1)}M`, sub: 'FCFA',    c: '#FBBF24' },
              ].map(({ icone, lbl, val, sub, c }) => (
                <div key={lbl} style={S.carteKpi(c)}>
                  <div style={S.kpiIcn}>{icone}</div>
                  <div style={S.kpiLbl}>{lbl}</div>
                  <div style={S.kpiVal(c)}>{val}</div>
                  <div style={S.kpiSub}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Graphique CA mensuel */}
            <div style={S.section}>
              <div style={S.secTitre}>
                <span>CA signé par mois - 12 derniers mois (FCFA)</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: couleurTheme, display: 'inline-block' }} />Montant des contrats signés
                </span>
              </div>
              {ca_mensuel.every(m => m.ca === 0) ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Aucun contrat signé sur les 12 derniers mois.</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 160, padding: '0 8px' }}>
                  {ca_mensuel.map(m => (
                    <div key={m.cle} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <BarreProgression valeur={m.ca} max={maxCA} couleur={couleurTheme} hauteur={120} />
                      <div style={{ fontSize: 10, color: COULEURS.gris400, fontWeight: 600 }}>{m.mois}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* KPIs qualitatifs */}
            <div style={S.deuxCol}>
              <div style={S.section}>
                <div style={S.secTitre}><span>Taux de réalisation des sessions</span></div>
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 48, fontWeight: 900, color: tauxRealisation >= 80 ? COULEURS.succes : COULEURS.attention }}>{tauxRealisation}%</div>
                  <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 4 }}>{nbSessionsReal} réalisées / {nbSessions} planifiées</div>
                </div>
                <div style={{ height: 10, background: COULEURS.gris100, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${tauxRealisation}%`, background: tauxRealisation >= 80 ? COULEURS.succes : COULEURS.attention, borderRadius: 5 }} />
                </div>
              </div>
              <div style={S.section}>
                <div style={S.secTitre}><span>Taux d'activité des apprenants</span></div>
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 48, fontWeight: 900, color: COULEURS.succes }}>
                    {nbApprenants > 0 ? Math.round((nbActifs / nbApprenants) * 100) : 0}%
                  </div>
                  <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 4 }}>
                    {nbActifs} actifs / {nbApprenants} inscrits
                  </div>
                </div>
                <div style={{ height: 10, background: COULEURS.gris100, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${nbApprenants > 0 ? Math.round((nbActifs / nbApprenants) * 100) : 0}%`, background: COULEURS.succes, borderRadius: 5 }} />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── FINANCIER ── */}
        {onglet === 'financier' && (
          <>
            <div style={S.grilleKpi}>
              {[
                { lbl: 'CA contrats actifs', val: `${(caTotal/1000000).toFixed(2)}M FCFA`, c: '#FBBF24', icone: '📋' },
                { lbl: 'Contrats actifs',    val: contrats.filter(c=>c.statut==='actif').length, c: COULEURS.succes, icone: '✅' },
                { lbl: 'Contrats totaux',    val: contrats.length, c: couleurTheme, icone: '📄' },
              ].map(({ lbl, val, c, icone }) => (
                <div key={lbl} style={S.carteKpi()}>
                  <div style={S.kpiIcn}>{icone}</div>
                  <div style={S.kpiLbl}>{lbl}</div>
                  <div style={S.kpiVal(c)}>{val}</div>
                </div>
              ))}
            </div>

            <div style={S.section}>
              <div style={S.secTitre}><span>💰 Détail par contrat</span></div>
              {contrats.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Aucun contrat enregistré.</div>
              ) : (
                <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${COULEURS.gris200}` }}>
                  <div style={S.tabHead('2fr 1fr 1fr 1fr 1fr')}>
                    <span>Entreprise</span><span>Licences</span><span>Montant HT</span><span>Période</span><span>Statut</span>
                  </div>
                  {contrats.map(c => {
                    const sc = STATUT_CONTRAT[c.statut] || STATUT_CONTRAT.actif;
                    return (
                      <div key={c.id} style={S.tabLigne('2fr 1fr 1fr 1fr 1fr')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {c.entreprise && <div style={{ width: 24, height: 24, borderRadius: 6, background: (c.entreprise.couleur||'#0891B2') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: c.entreprise.couleur||'#0891B2' }}>{c.entreprise.initiales}</div>}
                          <span style={{ fontWeight: 600, color: COULEURS.navy, fontSize: 12 }}>{c.entreprise?.nom || '-'}</span>
                        </div>
                        <span style={{ fontSize: 12, color: COULEURS.navy }}>{c.nb_licences || 0}</span>
                        <span style={{ fontSize: 12, color: COULEURS.navy, fontWeight: 600 }}>{((c.montant_ht||0)/1000000).toFixed(2)}M {c.devise||'FCFA'}</span>
                        <span style={{ fontSize: 11, color: COULEURS.gris600 }}>{c.date_debut} → {c.date_fin}</span>
                        <span style={S.badge(sc.bg, sc.txt)}>{sc.lib}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── APPRENANTS ── */}
        {onglet === 'apprenants' && (
          <>
            <div style={S.grilleKpi}>
              {[
                { lbl: 'Total inscrits',  val: nbApprenants, c: couleurTheme,   icone: '👩‍🎓', sub: 'tous statuts' },
                { lbl: 'Actifs',          val: nbActifs,     c: COULEURS.succes, icone: '✅',   sub: nbApprenants > 0 ? `${Math.round((nbActifs/nbApprenants)*100)}% du total` : '-' },
                { lbl: 'Niveau B2+',      val: niveaux_cecr.filter(n=>['B2','C1','C2'].includes(n.niveau)).reduce((s,n)=>s+n.count,0), c: '#818CF8', icone: '🎓', sub: 'avancé / autonome' },
                { lbl: 'Suspendus',       val: nbApprenants - nbActifs, c: COULEURS.attention, icone: '⏸️', sub: 'accès bloqué' },
              ].map(({ lbl, val, c, icone, sub }) => (
                <div key={lbl} style={S.carteKpi()}>
                  <div style={S.kpiIcn}>{icone}</div>
                  <div style={S.kpiLbl}>{lbl}</div>
                  <div style={S.kpiVal(c)}>{val}</div>
                  <div style={S.kpiSub}>{sub}</div>
                </div>
              ))}
            </div>

            <div style={S.deuxCol}>
              {/* Répartition par niveau */}
              <div style={S.section}>
                <div style={S.secTitre}><span>Répartition par niveau CECR</span></div>
                {niveaux_cecr.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: COULEURS.gris400, fontSize: 13 }}>Aucun niveau CECR renseigné pour le moment.</div>
                ) : niveaux_cecr.map(n => (
                  <div key={n.niveau} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: COULEUR_NIV[n.niveau] }}>{n.niveau}</span>
                      <span style={{ color: COULEURS.gris600 }}>{n.count} apprenant{n.count > 1 ? 's' : ''} ({n.pct}%)</span>
                    </div>
                    <div style={S.barreH()}>
                      <div style={S.barreHFill(n.pct, COULEUR_NIV[n.niveau])} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Répartition par tranche d'âge */}
              <div style={S.section}>
                <div style={S.secTitre}><span>Répartition par tranche d'âge</span></div>
                {tranches_age.map(t => (
                  <div key={t.tranche} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: COULEURS.navy }}>{t.lib}</span>
                      <span style={{ color: COULEURS.gris600 }}>{t.count} ({t.pct}%)</span>
                    </div>
                    <div style={S.barreH()}>
                      <div style={S.barreHFill(t.pct, t.tranche === 'enfant' ? '#10B981' : t.tranche === 'adolescent' ? '#7C3AED' : couleurTheme)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── ENTREPRISES ── */}
        {onglet === 'entreprises' && (
          <div style={S.section}>
            <div style={S.secTitre}><span>Performance par entreprise partenaire</span></div>
            {entreprises.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Aucune entreprise enregistrée.</div>
            ) : (
              <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${COULEURS.gris200}` }}>
                <div style={S.tabHead('2fr 1fr 1fr 1fr 1fr')}>
                  <span>Entreprise</span><span>Secteur</span><span>Apprenants actifs</span><span>Taux d'usage licences</span><span>Statut</span>
                </div>
                {entreprises.map(e => {
                  const pct = e.nb_licences > 0 ? Math.round((e.nb_apprenants_actifs / e.nb_licences) * 100) : 0;
                  const statutCfg = { actif: { bg:'#D1FAE5', txt:'#065F46', lib:'Actif' }, inactif: { bg:'#FEE2E2', txt:'#991B1B', lib:'Inactif' }, prospect: { bg:'#EDE9FE', txt:'#5B21B6', lib:'Prospect' } };
                  const sc = statutCfg[e.statut] || statutCfg.actif;
                  return (
                    <div key={e.id} style={S.tabLigne('2fr 1fr 1fr 1fr 1fr')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: (e.couleur||'#0891B2') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: e.couleur||'#0891B2' }}>{e.initiales}</div>
                        <span style={{ fontWeight: 600, color: COULEURS.navy, fontSize: 12 }}>{e.nom}</span>
                      </div>
                      <span style={{ fontSize: 11, color: COULEURS.gris600 }}>{e.secteur || '-'}</span>
                      <span style={{ fontWeight: 700, color: COULEURS.navy }}>{e.nb_apprenants_actifs}{e.nb_licences ? `/${e.nb_licences}` : ''}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {e.nb_licences > 0 ? (
                          <>
                            <div style={{ flex: 1, height: 6, background: COULEURS.gris100, borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(pct,100)}%`, background: e.couleur||couleurTheme, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: e.couleur||couleurTheme, minWidth: 30 }}>{pct}%</span>
                          </>
                        ) : <span style={{ fontSize: 11, color: COULEURS.gris400 }}>-</span>}
                      </div>
                      <span style={S.badge(sc.bg, sc.txt)}>{sc.lib}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── EXPORTS ── */}
        {onglet === 'exports' && (
          <>
            <div style={{ fontSize: 13, color: COULEURS.gris400, marginBottom: 20 }}>
              Exportez les données actuelles de la plateforme au format Excel (.xlsx).
            </div>
            {[
              { lib: 'Contrats & CA par entreprise', icone: '💰', fn: () => exporterExcelStyle({
                  nomFichier: 'contrats_elearning',
                  titre: '💰 Contrats & CA par entreprise',
                  sousTitre: `${contrats.length} contrat${contrats.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                  couleurEntete: '0891B2',
                  colonnes: [
                    { label: 'Entreprise', width: 28, bold: true }, { label: 'Licences', width: 12, align: 'center' },
                    { label: 'Montant HT', width: 16, align: 'right' }, { label: 'Devise', width: 10, align: 'center' },
                    { label: 'Date début', width: 13 }, { label: 'Date fin', width: 13 }, { label: 'Statut', width: 12 },
                  ],
                  lignes: contrats.map(c => [c.entreprise?.nom||'', c.nb_licences||0, c.montant_ht||0, c.devise||'FCFA', c.date_debut||'', c.date_fin||'', c.statut]),
                }) },
              { lib: 'Répartition apprenants par niveau CECR', icone: '📊', fn: () => exporterExcelStyle({
                  nomFichier: 'niveaux_cecr',
                  titre: '📊 Répartition des apprenants par niveau CECR',
                  sousTitre: `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                  couleurEntete: '7C3AED',
                  colonnes: [
                    { label: 'Niveau', width: 16, bold: true }, { label: 'Nombre', width: 14, align: 'center' },
                    { label: 'Pourcentage', width: 16, align: 'center' },
                  ],
                  lignes: niveaux_cecr.map(n => [n.niveau, n.count, `${n.pct}%`]),
                }) },
              { lib: 'Performance par entreprise', icone: '🏢', fn: () => exporterExcelStyle({
                  nomFichier: 'entreprises',
                  titre: '🏢 Performance par entreprise partenaire',
                  sousTitre: `${entreprises.length} entreprise${entreprises.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                  couleurEntete: 'F97316',
                  colonnes: [
                    { label: 'Entreprise', width: 28, bold: true }, { label: 'Secteur', width: 18 },
                    { label: 'Apprenants actifs', width: 16, align: 'center' }, { label: 'Licences', width: 12, align: 'center' },
                    { label: 'Statut', width: 12 },
                  ],
                  lignes: entreprises.map(e => [e.nom, e.secteur||'', e.nb_apprenants_actifs, e.nb_licences||0, e.statut]),
                }) },
            ].map(r => (
              <div key={r.lib} style={S.ligneExp}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: couleurTheme + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {r.icone}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COULEURS.navy }}>{r.lib}</div>
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>Généré à la demande, données en temps réel</div>
                </div>
                <button style={S.btnDl} onClick={r.fn}>⬇️ Excel</button>
              </div>
            ))}
          </>
        )}
      </div>
    </TopNavLayout>
  );
}
