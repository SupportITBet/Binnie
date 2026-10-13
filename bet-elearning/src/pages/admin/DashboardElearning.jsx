// DashboardElearning.jsx - Module E-Learning extrait de DashboardAdmin.jsx (profil admin_elearning, également utilisé par admin_pa_advisor pour ses sous-routes programme/reporting)
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { COULEURS } from '../../constants/couleurs';
import { exporterExcelStyle } from '../../utils/genererPDF';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}`, 'X-Plateforme': 'bet-elearning' });

export function OngletELearning({ ongletActif = 'overview' }) {
  const EL_COLOR = '#0D9488';
  const navigate = useNavigate();

  const [classes,       setClasses]       = useState([]);
  const [chargement,    setChargement]    = useState(true);
  const [filtreNiveau,  setFiltreNiveau]  = useState('tous');
  const [filtreEnt,     setFiltreEnt]     = useState('tous');
  const [detailEnt,     setDetailEnt]     = useState(null);
  const [reportingClasses,   setReportingClasses]   = useState([]);
  const [reportingChargement, setReportingChargement] = useState(true);
  const [peutGererRapports, setPeutGererRapports] = useState(null);

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setClasses(d.classes || []))
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  // L'onglet Reporting utilise sa propre route, protégée côté serveur par la
  // permission "rapports"/"manage" - contrairement à GET /api/classes-elearning
  // ci-dessus, partagée avec les onglets Vue d'ensemble/Programme et donc non
  // gatée (voir Backend/src/routes/classesElearning.js).
  useEffect(() => {
    if (ongletActif !== 'reporting') return;
    setReportingChargement(true);
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/reporting`, { headers: _authHdrsAdmin() })
      .then(async r => {
        if (r.status === 403) { setPeutGererRapports(false); return null; }
        const d = await r.json();
        if (!r.ok) { setPeutGererRapports(false); return null; }
        setPeutGererRapports(true);
        return d;
      })
      .then(d => setReportingClasses(d?.classes || []))
      .catch(() => setPeutGererRapports(false))
      .finally(() => setReportingChargement(false));
  }, [ongletActif]);

  const NIV_C = { A1:'#6366F1', A2:'#0891B2', B1:'#059669', B2:'#F97316', C1:'#DC2626', C2:'#7C3AED' };
  const FORMAT = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };
  const JOURS_ORDRE = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  const niveauxDispos = ['tous', ...Array.from(new Set(classes.map(c => c.niveau).filter(Boolean))).sort()];
  const entreprisesDispos = ['tous', ...Array.from(new Set(classes.map(c => c.entreprise_nom).filter(Boolean))).sort()];

  const classesFiltrees = classes.filter(c =>
    (filtreNiveau === 'tous' || c.niveau === filtreNiveau) &&
    (filtreEnt    === 'tous' || c.entreprise_nom === filtreEnt)
  );

  const totalApp     = classes.reduce((s, c) => s + (c.nb_apprenants||0), 0);
  const avecCoach    = classes.filter(c => c.coach_id).length;
  const sansCoach    = classes.filter(c => !c.coach_id).length;
  const nbEntreprises= [...new Set(classes.map(c => c.entreprise_id).filter(Boolean))].length;

  // Synthèse par entreprise pour le reporting (basée sur reportingClasses, chargée
  // via la route dédiée /reporting protégée par la permission "rapports")
  const synthEntreprises = Object.values(
    reportingClasses.reduce((acc, c) => {
      const eid = c.entreprise_id || '__sans_ent__';
      const enom = c.entreprise_nom || 'Sans entreprise';
      if (!acc[eid]) acc[eid] = { entreprise_id: eid, nom: enom, classes: [], nb_apprenants: 0 };
      acc[eid].classes.push(c);
      acc[eid].nb_apprenants += c.nb_apprenants || 0;
      return acc;
    }, {})
  );
  const reportingTotalApp = reportingClasses.reduce((s, c) => s + (c.nb_apprenants||0), 0);

  // ── Données pour les courbes de la Vue d'ensemble ──
  const NIVEAU_COULEURS = { A1:'#6366F1', A2:'#0891B2', B1:'#059669', B2:'#F97316', C1:'#DC2626', C2:'#7C3AED' };
  const parNiveau = Object.entries(
    classes.reduce((acc, c) => { const n = c.niveau || 'Non précisé'; acc[n] = (acc[n]||0) + 1; return acc; }, {})
  ).map(([niveau, valeur]) => ({ niveau, valeur }));

  const parEntrepriseChart = Object.values(
    classes.reduce((acc, c) => {
      const nom = c.entreprise_nom || 'Sans entreprise';
      if (!acc[nom]) acc[nom] = { nom, apprenants: 0 };
      acc[nom].apprenants += c.nb_apprenants || 0;
      return acc;
    }, {})
  ).sort((a, b) => b.apprenants - a.apprenants).slice(0, 8);

  return (
    <>
      {/* ══ VUE D'ENSEMBLE ══ */}
      {ongletActif === 'overview' && (
        chargement ? (
          <div style={{ textAlign:'center', padding:'60px', color:COULEURS.gris400 }}>⏳ Chargement des classes…</div>
        ) : (
          <>
            {/* KPIs réels */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))', gap:14, marginBottom:24 }}>
              {[
                { l:'Classes actives',  v: classes.length,   c: EL_COLOR,   i:'🏫' },
                { l:'Avec coach',       v: avecCoach,        c:'#059669',   i:'👨‍🏫' },
                { l:'Sans coach',       v: sansCoach,        c: sansCoach>0?'#EF4444':'#059669', i: sansCoach>0?'⚠️':'✅' },
                { l:'Apprenants total', v: totalApp,         c:'#0891B2',   i:'👥' },
                { l:'Entreprises',      v: nbEntreprises,    c:'#8B5CF6',   i:'🏢' },
              ].map(k => (
                <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${k.c}`, boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{k.i}</div>
                  <div style={{ fontSize:24, fontWeight:800, color:k.c, lineHeight:1, marginBottom:4 }}>{k.v}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.l}</div>
                </div>
              ))}
            </div>

            {/* Courbes */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:16, marginBottom:24 }}>
              <div style={{ background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🎯 Répartition des classes par niveau</div>
                {parNiveau.length === 0 ? (
                  <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400, fontSize:12 }}>Aucune classe pour l'instant.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={parNiveau} dataKey="valeur" nameKey="niveau" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {parNiveau.map((n, i) => <Cell key={i} fill={NIVEAU_COULEURS[n.niveau] || COULEURS.gris400} />)}
                      </Pie>
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div style={{ background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🏢 Apprenants par entreprise</div>
                {parEntrepriseChart.length === 0 ? (
                  <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400, fontSize:12 }}>Aucun apprenant pour l'instant.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={parEntrepriseChart} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize:11 }} />
                      <YAxis type="category" dataKey="nom" width={110} tick={{ fontSize:11 }} />
                      <RTooltip />
                      <Bar dataKey="apprenants" fill={EL_COLOR} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Résumé par entreprise */}
            {synthEntreprises.length > 0 && (
              <>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🏢 Synthèse par entreprise</div>
                <div style={{ background:COULEURS.blanc, borderRadius:14, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', marginBottom:24 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Entreprise</span><span>Classes</span><span>Apprenants</span><span>Avec coach</span>
                  </div>
                  {synthEntreprises.map((ent, idx) => (
                    <div key={ent.entreprise_id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', padding:'13px 20px', borderBottom: idx < synthEntreprises.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center' }}>
                      <div style={{ fontWeight:700, color:COULEURS.navy }}>{ent.nom}</div>
                      <span style={{ fontWeight:600, color:'#6366F1' }}>{ent.classes.length}</span>
                      <span style={{ fontWeight:600, color:COULEURS.navy }}>{ent.nb_apprenants}</span>
                      <span style={{ fontWeight:600, color: ent.classes.filter(c=>c.coach_id).length === ent.classes.length ? '#059669' : '#F59E0B' }}>
                        {ent.classes.filter(c=>c.coach_id).length}/{ent.classes.length}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {sansCoach > 0 && (
              <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 18px', marginBottom:20, fontSize:13, color:'#92400E' }}>
                ⚠️ <strong>{sansCoach} classe{sansCoach>1?'s':''}</strong> sans coach assigné - rendez-vous sur le dashboard principal pour les assigner.
              </div>
            )}
          </>
        )
      )}

      {/* ══ PROGRAMME ══ */}
      {ongletActif === 'programme' && (
        chargement ? (
          <div style={{ textAlign:'center', padding:'60px', color:COULEURS.gris400 }}>⏳ Chargement…</div>
        ) : (
          <>
            {/* Filtres */}
            <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:13, fontWeight:600, color:COULEURS.gris600 }}>Niveau :</span>
              {niveauxDispos.map(n => (
                <button key={n} onClick={() => setFiltreNiveau(n)}
                  style={{ background: filtreNiveau===n ? EL_COLOR : COULEURS.blanc, color: filtreNiveau===n ? '#fff' : COULEURS.navy, border:`1px solid ${filtreNiveau===n ? EL_COLOR : COULEURS.gris200}`, borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  {n === 'tous' ? 'Tous' : n}
                </button>
              ))}
              <span style={{ fontSize:13, fontWeight:600, color:COULEURS.gris600, marginLeft:8 }}>Entreprise :</span>
              <select value={filtreEnt} onChange={e => setFiltreEnt(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none' }}>
                {entreprisesDispos.map(e => <option key={e} value={e}>{e === 'tous' ? 'Toutes' : e}</option>)}
              </select>
            </div>

            {classesFiltrees.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
                <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy }}>Aucune classe trouvée</div>
              </div>
            ) : (
              <>
                {/* Vue calendrier par classe */}
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {classesFiltrees.map(c => {
                    const horaires = Array.isArray(c.horaire) ? c.horaire : [];
                    const horTri = [...horaires].sort((a,b) => JOURS_ORDRE.indexOf(a.jour) - JOURS_ORDRE.indexOf(b.jour));
                    return (
                      <div key={c.id} style={{ background:COULEURS.blanc, borderRadius:14, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                        {/* Header classe */}
                        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                          {c.niveau && <span style={{ background:NIV_C[c.niveau]||'#94A3B8', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:800 }}>{c.niveau}</span>}
                          <div style={{ fontWeight:700, fontSize:14, color:COULEURS.navy, flex:1 }}>{c.nom}</div>
                          {c.entreprise_nom && <span style={{ fontSize:12, color:COULEURS.gris600 }}>🏢 {c.entreprise_nom}</span>}
                          <span style={{ fontSize:12, color:COULEURS.gris400 }}>{FORMAT[c.type_cours]||c.type_cours}</span>
                          <span style={{ fontSize:12, fontWeight:600, color:c.coach_nom ? '#059669' : '#DC2626' }}>
                            {c.coach_nom ? `👨‍🏫 ${c.coach_nom}` : '⚠️ Pas de coach'}
                          </span>
                          <span style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:600 }}>👥 {c.nb_apprenants||0}</span>
                        </div>
                        {/* Créneaux */}
                        {horaires.length > 0 ? (
                          <div style={{ display:'flex', gap:10, padding:'14px 20px', flexWrap:'wrap' }}>
                            {horTri.map((h, i) => {
                              const [hD,mD] = (h.debut||'00:00').split(':').map(Number);
                              const [hF,mF] = (h.fin||'00:00').split(':').map(Number);
                              const dur = (hF*60+mF) - (hD*60+mD);
                              return (
                                <div key={i} style={{ background:'#EFF6FF', borderRadius:10, padding:'10px 16px', border:'1px solid #DBEAFE', minWidth:140 }}>
                                  <div style={{ fontSize:12, fontWeight:800, color:'#1D4ED8', marginBottom:4 }}>📅 {h.jour}</div>
                                  <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{h.debut} – {h.fin}</div>
                                  <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>{dur}min</div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ padding:'14px 20px', fontSize:12, color:COULEURS.gris400 }}>⚠️ Aucun créneau défini</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Vue hebdomadaire globale */}
                <div style={{ marginTop:28 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>📆 Vue hebdomadaire globale</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
                    {['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].map(jour => {
                      const creneauxJour = classesFiltrees.flatMap(c =>
                        (Array.isArray(c.horaire)?c.horaire:[]).filter(h=>h.jour===jour).map(h => ({ ...h, classe: c }))
                      );
                      return (
                        <div key={jour} style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden' }}>
                          <div style={{ padding:'10px 12px', background: creneauxJour.length > 0 ? EL_COLOR : COULEURS.gris100, color: creneauxJour.length > 0 ? '#fff' : COULEURS.gris400, fontSize:12, fontWeight:700, textAlign:'center' }}>
                            {jour} {creneauxJour.length > 0 && <span style={{ background:'rgba(255,255,255,0.3)', borderRadius:20, padding:'0 6px', marginLeft:4 }}>{creneauxJour.length}</span>}
                          </div>
                          <div style={{ padding:'10px 12px' }}>
                            {creneauxJour.length === 0 ? (
                              <div style={{ fontSize:11, color:COULEURS.gris400, textAlign:'center', padding:'8px 0' }}>-</div>
                            ) : creneauxJour.map((cr, i) => (
                              <div key={i} style={{ background:`${NIV_C[cr.classe.niveau]||'#94A3B8'}15`, borderRadius:7, padding:'6px 8px', marginBottom:6, borderLeft:`3px solid ${NIV_C[cr.classe.niveau]||'#94A3B8'}` }}>
                                <div style={{ fontSize:10, fontWeight:700, color:NIV_C[cr.classe.niveau]||'#94A3B8' }}>{cr.debut}–{cr.fin}</div>
                                <div style={{ fontSize:10, color:COULEURS.navy, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cr.classe.nom}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )
      )}

      {/* ══ REPORTING ══ */}
      {ongletActif === 'reporting' && (
        reportingChargement || peutGererRapports === null ? (
          <div style={{ textAlign:'center', padding:'60px', color:COULEURS.gris400 }}>⏳ Chargement…</div>
        ) : peutGererRapports === false ? (
          <div style={{ textAlign:'center', padding:'60px', color:COULEURS.gris400 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
            <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>Accès restreint</div>
            <div style={{ fontSize:13, marginTop:4 }}>Vous n'avez pas la permission de gérer le module Rapports.</div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy }}>📋 Reporting par entreprise</div>
                <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:2 }}>{synthEntreprises.length} entreprise{synthEntreprises.length>1?'s':''} · {reportingClasses.length} classe{reportingClasses.length>1?'s':''} · {reportingTotalApp} apprenant{reportingTotalApp>1?'s':''}</div>
              </div>
              <button onClick={() => exporterExcelStyle({
                nomFichier: `reporting_elearning_${new Date().toISOString().slice(0,10)}`,
                titre: `📋 Reporting E-Learning par entreprise - ${new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}`,
                sousTitre: `${synthEntreprises.length} entreprise${synthEntreprises.length>1?'s':''} · ${reportingClasses.length} classe${reportingClasses.length>1?'s':''} · ${reportingTotalApp} apprenant${reportingTotalApp>1?'s':''}`,
                couleurEntete: '6366F1',
                colonnes: [
                  { label: 'Entreprise', width: 34, bold: true },
                  { label: 'Classes', width: 12, align: 'center' },
                  { label: 'Apprenants', width: 14, align: 'center' },
                  { label: 'Avec coach', width: 14, align: 'center' },
                  { label: 'Taux couverture coach', width: 20, align: 'center', numFmt: '0%' },
                ],
                lignes: synthEntreprises.map(e => {
                  const avecC = e.classes.filter(c => c.coach_id).length;
                  return [e.nom, e.classes.length, e.nb_apprenants, avecC, e.classes.length ? avecC / e.classes.length : 0];
                }),
              })} style={{ background:'#6366F1', color:'#fff', border:'none', borderRadius:9, padding:'10px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                📥 Exporter (Excel)
              </button>
            </div>

            <div style={{ background:COULEURS.blanc, borderRadius:14, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', marginBottom:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                <span>Entreprise</span><span>Classes</span><span>Apprenants</span><span>Avec coach</span><span>Détail</span>
              </div>
              {synthEntreprises.map((ent, idx) => {
                const avecC = ent.classes.filter(c=>c.coach_id).length;
                const toutCoach = avecC === ent.classes.length;
                return (
                  <div key={ent.entreprise_id} onClick={() => setDetailEnt(detailEnt?.entreprise_id === ent.entreprise_id ? null : ent)}
                    style={{ cursor:'pointer', transition:'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', padding:'14px 20px', borderBottom: idx < synthEntreprises.length-1 || detailEnt?.entreprise_id === ent.entreprise_id ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center' }}>
                      <div style={{ fontWeight:700, color:COULEURS.navy }}>{ent.nom}</div>
                      <span style={{ fontWeight:700, color:'#6366F1' }}>{ent.classes.length}</span>
                      <span style={{ fontWeight:700, color:COULEURS.navy }}>{ent.nb_apprenants}</span>
                      <span style={{ fontWeight:700, color: toutCoach ? '#059669' : '#F59E0B' }}>{avecC}/{ent.classes.length} {toutCoach ? '✅' : '⚠️'}</span>
                      <span style={{ fontSize:12, color:EL_COLOR, fontWeight:600 }}>{detailEnt?.entreprise_id === ent.entreprise_id ? '▲ Masquer' : 'Détail →'}</span>
                    </div>
                    {detailEnt?.entreprise_id === ent.entreprise_id && (
                      <div style={{ padding:'14px 20px 18px', background:'#F8FAFC' }}>
                        {ent.classes.map(c => {
                          const horaires = Array.isArray(c.horaire) ? c.horaire : [];
                          return (
                            <div key={c.id} style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 14px', background:COULEURS.blanc, borderRadius:9, marginBottom:8, border:`1px solid ${COULEURS.gris200}`, flexWrap:'wrap' }}>
                              {c.niveau && <span style={{ background:NIV_C[c.niveau]||'#94A3B8', color:'#fff', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:800, flexShrink:0 }}>{c.niveau}</span>}
                              <span style={{ fontWeight:600, color:COULEURS.navy, flex:1 }}>{c.nom}</span>
                              <span style={{ fontSize:12, color:COULEURS.gris600 }}>👥 {c.nb_apprenants||0}</span>
                              <span style={{ fontSize:12, color: c.coach_nom ? '#059669' : '#DC2626', fontWeight:600 }}>
                                {c.coach_nom ? `👨‍🏫 ${c.coach_nom}` : '⚠️ Pas de coach'}
                              </span>
                              {horaires.map((h,i) => <span key={i} style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:6, padding:'2px 7px', fontSize:10, fontWeight:600 }}>📅 {h.jour} {h.debut}–{h.fin}</span>)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )
      )}
    </>
  );
}
