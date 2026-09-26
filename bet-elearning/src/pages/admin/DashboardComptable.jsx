// pages/admin/DashboardComptable.jsx - Module Comptabilité BET (extrait de DashboardAdmin.jsx
// pour ne pas surcharger ce dernier). Facturation, encaissements, fournisseurs, trésorerie,
// et comptabilité générale en partie double (SYSCOHADA) - tout consomme /api/comptabilite/*
// et /api/comptabilite-generale/* (Backend/src/routes/comptabilite.js + comptabiliteGenerale.js).
// Système entièrement indépendant des tables dash (cf. commentaires dans ces fichiers backend).

import { useState, useEffect } from 'react';
import { COULEURS } from '../../constants/couleurs';
import { useTheme } from '../../contexts/ThemeContext';
import { genererPDF, fmtDatePDF, exporterExcelStyle } from '../../utils/genererPDF';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend } from 'recharts';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` });

// ── Mock Comptable Trésorier ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// COMPTABILITÉ - Facturation / Paiements / Trésorerie (réel, /api/comptabilite/*)
// Système indépendant de dash (aucune table partagée) - voir Backend/src/routes/comptabilite.js
// ─────────────────────────────────────────────────────────────────────────────
// `styles` (titreSec/tableauProfs...) est une const locale au composant DashboardAdmin -
// inaccessible depuis ces composants déclarés au niveau module. Équivalents autonomes :
const _comptaTitreSec = { fontSize:16, fontWeight:700, color:COULEURS.navy, marginBottom:20 };
const _comptaTableau  = { background:COULEURS.blanc, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', border:`1px solid ${COULEURS.gris200}` };

// ── Kit visuel "logiciel comptable" (Sage/QuickBooks-like) : montants en chiffres
// tabulaires monospace alignés à droite, badges de statut compacts et sobres, cartes
// KPI à accent latéral plutôt que ludiques - réutilisé dans tous les onglets Comptable.
const _finMono = { fontFamily:"'SF Mono','Roboto Mono','Consolas',monospace", fontVariantNumeric:'tabular-nums' };
const _finNumCell = { ..._finMono, fontWeight:700, textAlign:'right', color:COULEURS.navy };
const _finThead = { display:'grid', gap:14, padding:'9px 16px', background:'#F8FAFC', borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10.5, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', position:'sticky', top:0, zIndex:1 };
const _finRow   = (i, extra) => ({ display:'grid', gap:14, padding:'11px 16px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center', background: i%2===1 ? '#FAFBFC' : COULEURS.blanc, transition:'background .1s', ...extra });
const _finFoot  = { display:'grid', gap:14, padding:'12px 16px', background:'#F8FAFC', borderTop:`2px solid ${COULEURS.gris200}`, fontSize:13, fontWeight:800, color:COULEURS.navy, alignItems:'center' };
function finBadge(lib, txt, bg) {
  return <span style={{ padding:'3px 9px', borderRadius:4, background:bg, color:txt, fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.03em', width:'fit-content', border:`1px solid ${txt}22` }}>{lib}</span>;
}
function FinKpiCard({ icone, valeur, label, accent, sombre }) {
  return (
    <div style={{ background: sombre ? `linear-gradient(135deg,${accent},${accent}dd)` : COULEURS.blanc, borderRadius:10, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, borderLeft:`4px solid ${accent}`, display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ width:38, height:38, borderRadius:8, background: sombre ? 'rgba(255,255,255,0.18)' : `${accent}14`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{icone}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ ..._finMono, fontSize:19, fontWeight:800, color: sombre ? '#fff' : COULEURS.navy, lineHeight:1.15, whiteSpace:'nowrap' }}>{valeur}</div>
        <div style={{ fontSize:11, color: sombre ? 'rgba(255,255,255,0.75)' : COULEURS.gris600, marginTop:2, fontWeight:600 }}>{label}</div>
      </div>
    </div>
  );
}

const STATUT_FACTURE_MAP = {
  payee:               { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Payée' },
  partiellement_payee: { bg:'#DBEAFE', txt:'#1D4ED8', lib:'🔵 Partiel' },
  envoyee:             { bg:'#FEF9C3', txt:'#92400E', lib:'⏳ En attente' },
  en_retard:           { bg:'#FEE2E2', txt:'#991B1B', lib:'🔴 En retard' },
  brouillon:           { bg:'#F1F5F9', txt:'#475569', lib:'📝 Brouillon' },
  annulee:             { bg:'#F1F5F9', txt:'#94A3B8', lib:'✕ Annulée' },
};

const _APERCU_CAT_LABELS = {
  encaissement_client_entreprise: 'Entreprises', encaissement_client_particulier: 'Particuliers',
  paiement_coach:'Honoraires coachs', paiement_fournisseur:'Fournisseurs', depense:'Dépenses générales',
  tva:'TVA', manuel:'Mouvements manuels',
};
const _APERCU_PIE_COLORS = ['#0F172A','#0891B2','#7C3AED','#059669','#D97706','#DC2626','#64748B'];

function _apercuTuile({ titre, enfant, action }) {
  return (
    <div style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 1px 3px rgba(15,23,42,0.06)', padding:'18px 20px', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={{ fontSize:13.5, fontWeight:800, color:COULEURS.navy }}>{titre}</div>
        {action}
      </div>
      {enfant}
    </div>
  );
}

export function OngletComptaApercu() {
  const [synthese, setSynthese] = useState(null);
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let annule = false;
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/comptabilite/tresorerie/synthese?mois_historique=6`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => null),
      fetch(`${_API_URL_ADMIN}/api/comptabilite/factures`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => null),
    ]).then(([dSynth, dFact]) => {
      if (annule) return;
      setSynthese(dSynth);
      setFactures(dFact?.factures || []);
    }).finally(() => !annule && setLoading(false));
    return () => { annule = true; };
  }, []); // eslint-disable-line

  const totalPaye   = factures.filter(f => f.statut === 'payee').reduce((s,f) => s + Number(f.montant_ttc||0), 0);
  const totalDu     = factures.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').reduce((s,f) => s + (Number(f.montant_ttc||0) - Number(f.montant_paye||0)), 0);
  const tauxRecouv  = (totalPaye + totalDu) > 0 ? Math.round((totalPaye / (totalPaye + totalDu)) * 100) : 0;
  const enRetard    = factures.filter(f => f.statut === 'en_retard').length;
  const resultatMois = (synthese?.entrees_mois ?? 0) - (synthese?.sorties_mois ?? 0);

  const fluxData = (synthese?.flux_mensuels ?? []).map(f => ({
    mois: f.label ? f.label.charAt(0).toUpperCase() + f.label.slice(1, 3) : `${f.mois}/${String(f.annee).slice(2)}`,
    Entrées: f.entrees, Sorties: f.sorties,
  }));

  const repartitionCharges = Object.entries(synthese?.sorties_par_categorie ?? {})
    .map(([k, v]) => ({ name: _APERCU_CAT_LABELS[k] || k, value: v }))
    .filter(d => d.value > 0)
    .sort((a,b) => b.value - a.value);

  const statutsFactures = ['payee','partiellement_payee','envoyee','en_retard'].map(s => ({
    statut: STATUT_FACTURE_MAP[s]?.lib || s,
    nombre: factures.filter(f => f.statut === s).length,
    couleur: s==='payee' ? '#059669' : s==='en_retard' ? '#DC2626' : s==='partiellement_payee' ? '#D97706' : '#64748B',
  })).filter(d => d.nombre > 0);

  const derniers6 = factures.slice(0, 6);

  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:12, marginBottom:24 }}>
        <FinKpiCard icone="🏦" valeur={(synthese?.solde ?? 0).toLocaleString('fr-FR')+' FCFA'} label="Solde courant" accent="#059669" sombre />
        <FinKpiCard icone="⬆️" valeur={(synthese?.entrees_mois ?? 0).toLocaleString('fr-FR')+' FCFA'} label="Entrées (mois)" accent={COULEURS.succes} />
        <FinKpiCard icone="⬇️" valeur={(synthese?.sorties_mois ?? 0).toLocaleString('fr-FR')+' FCFA'} label="Sorties (mois)" accent="#EF4444" />
        <FinKpiCard icone={resultatMois>=0?'📈':'📉'} valeur={(resultatMois>=0?'+':'')+resultatMois.toLocaleString('fr-FR')+' FCFA'} label="Résultat net (mois)" accent={resultatMois>=0?'#059669':'#DC2626'} />
        <FinKpiCard icone="🔴" valeur={enRetard} label="Factures en retard" accent="#EF4444" />
      </div>

      {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}

      {!loading && (
        <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:16, marginBottom:4 }}>
          {_apercuTuile({
            titre: '📊 Flux de trésorerie - 6 derniers mois',
            enfant: (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={fluxData}>
                  <defs>
                    <linearGradient id="gradEntrees" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradSorties" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#DC2626" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={COULEURS.gris100} vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize:11, fill:COULEURS.gris600 }} axisLine={{ stroke:COULEURS.gris200 }} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:COULEURS.gris400 }} axisLine={false} tickLine={false} tickFormatter={v => v>=1000000?`${(v/1000000).toFixed(1)}M`:v>=1000?`${Math.round(v/1000)}k`:v} />
                  <RTooltip formatter={v => `${Number(v).toLocaleString('fr-FR')} FCFA`} contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${COULEURS.gris200}` }} />
                  <Legend wrapperStyle={{ fontSize:12 }} />
                  <Area type="monotone" dataKey="Entrées" stroke="#059669" fill="url(#gradEntrees)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Sorties" stroke="#DC2626" fill="url(#gradSorties)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ),
          })}

          {_apercuTuile({
            titre: '🥧 Charges du mois par catégorie',
            enfant: repartitionCharges.length === 0
              ? <div style={{ padding:'40px 0', textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucune dépense ce mois</div>
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={repartitionCharges} dataKey="value" nameKey="name" cx="50%" cy="48%" outerRadius={85} innerRadius={48} paddingAngle={2}>
                      {repartitionCharges.map((_, i) => <Cell key={i} fill={_APERCU_PIE_COLORS[i % _APERCU_PIE_COLORS.length]} />)}
                    </Pie>
                    <RTooltip formatter={v => `${Number(v).toLocaleString('fr-FR')} FCFA`} contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${COULEURS.gris200}` }} />
                    <Legend wrapperStyle={{ fontSize:11 }} layout="vertical" verticalAlign="middle" align="right" />
                  </PieChart>
                </ResponsiveContainer>
              ),
          })}
        </div>
      )}

      {!loading && statutsFactures.length > 0 && _apercuTuile({
        titre: '📑 Répartition des factures par statut',
        enfant: (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={statutsFactures} layout="vertical" margin={{ left:20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COULEURS.gris100} horizontal={false} />
              <XAxis type="number" tick={{ fontSize:10, fill:COULEURS.gris400 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="statut" tick={{ fontSize:12, fill:COULEURS.navy, fontWeight:600 }} axisLine={false} tickLine={false} width={110} />
              <RTooltip contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${COULEURS.gris200}` }} />
              <Bar dataKey="nombre" radius={[0,6,6,0]} barSize={20}>
                {statutsFactures.map((d,i) => <Cell key={i} fill={d.couleur} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ),
      })}

      <div style={_comptaTitreSec}>🧾 Dernières factures</div>
      <div style={_comptaTableau}>
        <div style={{ ..._finThead, gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr' }}>
          <span>Client</span><span>Référence</span><span style={{textAlign:'right'}}>Montant</span><span>Échéance</span><span>Statut</span>
        </div>
        {derniers6.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucune facture</div>}
        {derniers6.map((f, i) => {
          const st = STATUT_FACTURE_MAP[f.statut] || STATUT_FACTURE_MAP.brouillon;
          return (
            <div key={f.id} style={_finRow(i, { gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr' })}>
              <span style={{ fontWeight:600, color:COULEURS.navy }}>{f.client_nom}</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{f.numero}</span>
              <span style={_finNumCell}>{Number(f.montant_ttc).toLocaleString('fr-FR')} FCFA</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{f.date_echeance || '-'}</span>
              {finBadge(st.lib, st.txt, st.bg)}
            </div>
          );
        })}
      </div>

      <div style={{ background:COULEURS.blanc, borderRadius:12, padding:'18px 20px', border:`1px solid ${COULEURS.gris200}`, marginBottom:32, marginTop:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>Taux de recouvrement global</span>
          <span style={{ fontSize:16, fontWeight:800, color:COULEURS.attention }}>{tauxRecouv}%</span>
        </div>
        <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden', marginBottom:8 }}>
          <div style={{ width:`${tauxRecouv}%`, height:'100%', background:`linear-gradient(90deg,${COULEURS.succes},${COULEURS.attention})`, borderRadius:5 }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:COULEURS.gris400 }}>
          <span>Payées : {totalPaye.toLocaleString('fr-FR')} FCFA</span>
          <span>En attente : {totalDu.toLocaleString('fr-FR')} FCFA</span>
        </div>
      </div>
    </>
  );
}

export function OngletComptaFacturation() {
  const { couleurTheme } = useTheme();
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ client_nom:'', client_type:'entreprise', client_email:'', montant_ht:'', tva_taux:0, date_echeance:'', notes:'' });
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [relanceDetail, setRelanceDetail] = useState(null); // facture sélectionnée
  const [relances, setRelances] = useState([]);
  const [relancing, setRelancing] = useState(false);

  function fetchFactures() {
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/comptabilite/factures`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setFactures(d.factures || []))
      .catch(() => setFactures([])).finally(() => setLoading(false));
  }
  useEffect(() => { fetchFactures(); }, []); // eslint-disable-line

  async function creerFacture(e) {
    e.preventDefault();
    if (!form.client_nom.trim() || !form.montant_ht) { setFlash({ type:'err', msg:'Client et montant HT obligatoires' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/factures`, {
        method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:`Facture ${d.facture.numero} créée.` });
      setShowForm(false);
      setForm({ client_nom:'', client_type:'entreprise', client_email:'', montant_ht:'', tva_taux:0, date_echeance:'', notes:'' });
      fetchFactures();
    } catch (err) {
      setFlash({ type:'err', msg: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 4000);
    }
  }

  function ouvrirRelances(f) {
    setRelanceDetail(f);
    fetch(`${_API_URL_ADMIN}/api/comptabilite/factures/${f.id}/relances`, { headers: _authHdrsAdmin() })
      .then(r=>r.json()).then(d=>setRelances(d.relances||[])).catch(()=>setRelances([]));
  }

  async function envoyerRelance() {
    if (!relanceDetail) return;
    setRelancing(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/factures/${relanceDetail.id}/relancer`, { method:'POST', headers: _authHdrsAdmin() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setRelances(prev => [d.relance, ...prev]);
    } catch (err) { setFlash({ type:'err', msg: err.message }); setTimeout(()=>setFlash(null),4000); }
    finally { setRelancing(false); }
  }

  const totalFacture = factures.reduce((s,f) => s + Number(f.montant_ttc||0), 0);
  const payees   = factures.filter(f => f.statut === 'payee').length;
  const attente  = factures.filter(f => f.statut === 'envoyee' || f.statut === 'partiellement_payee').length;
  const retard   = factures.filter(f => f.statut === 'en_retard').length;
  const totalPaye = factures.filter(f => f.statut === 'payee').reduce((s,f) => s + Number(f.montant_ttc||0), 0);
  const totalDu   = factures.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').reduce((s,f) => s + (Number(f.montant_ttc||0) - Number(f.montant_paye||0)), 0);
  const tauxRecouv = (totalPaye + totalDu) > 0 ? Math.round((totalPaye / (totalPaye + totalDu)) * 100) : 0;

  const STATUT_LIB_FACT = { payee:'Payée', partiellement_payee:'Partiel', envoyee:'En attente', en_retard:'En retard', brouillon:'Brouillon', annulee:'Annulée' };

  function exportFacturesPDF() {
    const lignes = factures.map(f => `<tr><td style="font-weight:700">${f.client_nom}</td><td>${f.numero}</td><td>${f.client_type==='entreprise'?'Entreprise':'Particulier'}</td><td class="td-right">${Number(f.montant_ttc).toLocaleString('fr-FR')} FCFA</td><td>${f.date_echeance||'-'}</td><td>${STATUT_LIB_FACT[f.statut]||f.statut}</td></tr>`).join('');
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Comptabilité</div><div class="doc-header-sub">British English Training · Facturation</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">🧾 REGISTRE DES FACTURES</div>
      <div class="doc-body">
        <div class="section-title">Synthèse</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#0891B2"><div class="kpi-val">${totalFacture.toLocaleString('fr-FR')}</div><div class="kpi-lbl">Total facturé (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val">${payees}</div><div class="kpi-lbl">Payées</div></div>
          <div class="kpi-card" style="border-top-color:#F59E0B"><div class="kpi-val">${attente}</div><div class="kpi-lbl">En attente</div></div>
          <div class="kpi-card" style="border-top-color:#EF4444"><div class="kpi-val">${retard}</div><div class="kpi-lbl">En retard</div></div>
        </div>
        <div class="section-title">Détail des factures</div>
        <table><thead><tr><th>Client</th><th>Référence</th><th>Type</th><th>Montant TTC</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>${lignes || '<tr><td colspan="6" style="text-align:center;color:#94A3B8">Aucune facture</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Registre des factures · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, 'Registre des factures');
  }

  async function exportFacturesExcel() {
    await exporterExcelStyle({
      nomFichier: 'Factures_BET',
      titre: '🧾 Registre des factures',
      sousTitre: `Total facturé : ${totalFacture.toLocaleString('fr-FR')} FCFA`,
      couleurEntete: '0891B2',
      colonnes: [
        { label:'Client', width:24, bold:true }, { label:'Référence', width:16 }, { label:'Type', width:14 },
        { label:'Montant TTC (FCFA)', width:18, align:'right' }, { label:'Échéance', width:14 }, { label:'Statut', width:16 },
      ],
      lignes: factures.map(f => [f.client_nom, f.numero, f.client_type==='entreprise'?'Entreprise':'Particulier', Number(f.montant_ttc), f.date_echeance||'-', STATUT_LIB_FACT[f.statut]||f.statut]),
    });
  }

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>
          {flash.msg}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>🧾 Gestion de la facturation</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportFacturesPDF} style={{ background:'#D97706', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📥 PDF</button>
          <button onClick={exportFacturesExcel} style={{ background:'#217346', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📊 Excel</button>
          <button onClick={() => setShowForm(v => !v)} style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            {showForm ? '✕ Annuler' : '+ Nouvelle facture'}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>🧾 Nouvelle facture</div>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={creerFacture} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, width:'100%', boxSizing:'border-box' }}>
              <input placeholder="Nom du client *" value={form.client_nom} onChange={e=>setForm(f=>({...f,client_nom:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }} />
              <select value={form.client_type} onChange={e=>setForm(f=>({...f,client_type:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }}>
                <option value="entreprise">Entreprise</option><option value="particulier">Particulier</option>
              </select>
              <input type="email" placeholder="Email" value={form.client_email} onChange={e=>setForm(f=>({...f,client_email:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 2' }} />
              <input type="number" placeholder="Montant HT *" value={form.montant_ht} onChange={e=>setForm(f=>({...f,montant_ht:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="number" placeholder="TVA %" value={form.tva_taux} onChange={e=>setForm(f=>({...f,tva_taux:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="date" value={form.date_echeance} onChange={e=>setForm(f=>({...f,date_echeance:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input placeholder="Notes" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }} />
              <div style={{ gridColumn:'span 3', display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:couleurTheme, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Création…':'Créer la facture'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
        <FinKpiCard icone="🧾" valeur={totalFacture.toLocaleString('fr-FR')+' FCFA'} label="Total facturé" accent="#0891B2" />
        <FinKpiCard icone="✅" valeur={payees} label="Payées" accent={COULEURS.succes} />
        <FinKpiCard icone="⏳" valeur={attente} label="En attente" accent="#F59E0B" />
        <FinKpiCard icone="🔴" valeur={retard} label="En retard" accent="#EF4444" />
      </div>

      <div style={_comptaTableau}>
        <div style={{ ..._finThead, gridTemplateColumns:'2fr 1.3fr 1.3fr 1fr 1fr 1fr' }}>
          <span>Client</span><span>Référence</span><span style={{textAlign:'right'}}>Montant TTC</span><span>Émission</span><span>Échéance</span><span>Statut</span>
        </div>
        {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}
        {!loading && factures.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucune facture</div>}
        {factures.map((f, i) => {
          const st = STATUT_FACTURE_MAP[f.statut] || STATUT_FACTURE_MAP.brouillon;
          const relancable = ['envoyee','partiellement_payee','en_retard'].includes(f.statut);
          return (
            <div key={f.id} onClick={() => relancable && ouvrirRelances(f)}
              style={_finRow(i, { gridTemplateColumns:'2fr 1.3fr 1.3fr 1fr 1fr 1fr', background: f.statut==='en_retard' ? '#FEF2F2' : (i%2===1?'#FAFBFC':COULEURS.blanc), cursor: relancable?'pointer':'default' })}>
              <span style={{ fontWeight:700, color:COULEURS.navy }}>{f.client_nom}</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{f.numero}</span>
              <span style={_finNumCell}>{Number(f.montant_ttc).toLocaleString('fr-FR')} FCFA</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris400 }}>{f.date_emission}</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{f.date_echeance || '-'}</span>
              {finBadge(st.lib, st.txt, st.bg)}
            </div>
          );
        })}
        {factures.length > 0 && (
          <div style={{ ..._finFoot, gridTemplateColumns:'2fr 1.3fr 1.3fr 1fr 1fr 1fr' }}>
            <span>TOTAL ({factures.length})</span><span /><span style={_finNumCell}>{totalFacture.toLocaleString('fr-FR')} FCFA</span><span /><span /><span />
          </div>
        )}
      </div>

      <div style={{ background:COULEURS.blanc, borderRadius:12, padding:'18px 20px', border:`1px solid ${COULEURS.gris200}`, marginTop:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>Taux de recouvrement global</span>
          <span style={{ fontSize:18, fontWeight:800, color:COULEURS.attention }}>{tauxRecouv}%</span>
        </div>
        <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden', marginBottom:8 }}>
          <div style={{ width:`${tauxRecouv}%`, height:'100%', background:`linear-gradient(90deg,${COULEURS.succes},${COULEURS.attention})`, borderRadius:5 }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:COULEURS.gris400 }}>
          <span>✅ Payées : {totalPaye.toLocaleString('fr-FR')} FCFA</span>
          <span>⏳ Restant : {totalDu.toLocaleString('fr-FR')} FCFA</span>
        </div>
      </div>

      {relanceDetail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setRelanceDetail(null); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'min(520px,92vw)', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>🔔 Relances - {relanceDetail.numero}</div>
              <button onClick={() => setRelanceDetail(null)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:16 }}>{relanceDetail.client_nom} - reste dû {(Number(relanceDetail.montant_ttc)-Number(relanceDetail.montant_paye||0)).toLocaleString('fr-FR')} FCFA</div>
            <button onClick={envoyerRelance} disabled={relancing} style={{ width:'100%', background:'#DC2626', color:'#fff', border:'none', borderRadius:8, padding:'10px 16px', fontSize:13, fontWeight:700, cursor:'pointer', marginBottom:18 }}>{relancing?'Envoi…':'📨 Relancer maintenant'}</button>
            <div style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', marginBottom:8 }}>Historique</div>
            {relances.length === 0 && <div style={{ fontSize:13, color:COULEURS.gris400 }}>Aucune relance envoyée</div>}
            {relances.map(r => (
              <div key={r.id} style={{ padding:'10px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12.5 }}>
                  <span style={{ fontWeight:700 }}>{r.type==='auto'?'🤖 Automatique':'👤 Manuelle'} - niveau {r.niveau}</span>
                  <span style={{ color:COULEURS.gris400 }}>{r.date_relance}</span>
                </div>
                <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>{r.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OngletComptaPaiements() {
  const { couleurTheme } = useTheme();
  const [paiements, setPaiements] = useState([]);
  const [factures, setFactures]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm] = useState({ facture_id:'', client_nom:'', montant:'', date_paiement:'', mode_paiement:'virement', notes:'' });
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);

  function fetchAll() {
    setLoading(true);
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/comptabilite/paiements`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({ paiements: [] })),
      fetch(`${_API_URL_ADMIN}/api/comptabilite/factures`,  { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({ factures: [] })),
    ]).then(([dP, dF]) => { setPaiements(dP.paiements || []); setFactures(dF.factures || []); }).finally(() => setLoading(false));
  }
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  async function enregistrerPaiement(e) {
    e.preventDefault();
    if (!form.client_nom.trim() || !form.montant) { setFlash({ type:'err', msg:'Client et montant obligatoires' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/paiements`, {
        method:'POST', headers: _authHdrsAdmin(),
        body: JSON.stringify({ ...form, facture_id: form.facture_id || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:'Paiement enregistré.' });
      setShowForm(false);
      setForm({ facture_id:'', client_nom:'', montant:'', date_paiement:'', mode_paiement:'virement', notes:'' });
      fetchAll();
    } catch (err) {
      setFlash({ type:'err', msg: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 4000);
    }
  }

  async function toggleRapproche(p) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/paiements/${p.id}`, {
        method:'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ rapproche: !p.rapproche }),
      });
      if (!r.ok) throw new Error();
      setPaiements(prev => prev.map(x => x.id === p.id ? { ...x, rapproche: !p.rapproche } : x));
    } catch { setFlash({ type:'err', msg:'Erreur mise à jour' }); setTimeout(() => setFlash(null), 3000); }
  }

  const recus    = paiements.filter(p => p.statut === 'recu');
  const enAttente = paiements.filter(p => p.statut === 'en_attente').length;
  const enRetard  = paiements.filter(p => p.statut === 'en_retard').length;

  const factureMap = Object.fromEntries(factures.map(f => [f.id, f]));
  const typeDe = p => p.client_type || factureMap[p.facture_id]?.client_type || 'particulier';
  const totalEntreprises  = recus.filter(p => typeDe(p) === 'entreprise').reduce((s,p) => s + Number(p.montant||0), 0);
  const totalParticuliers = recus.filter(p => typeDe(p) === 'particulier').reduce((s,p) => s + Number(p.montant||0), 0);

  const STATUT_LIB_PMT = { recu:'Reçu', en_attente:'En attente', en_retard:'En retard' };

  function exportPaiementsPDF() {
    const lignes = paiements.map(p => `<tr><td style="font-weight:700">${p.client_nom}</td><td>${p.reference||'-'}</td><td>${typeDe(p)==='entreprise'?'Entreprise':'Particulier'}</td><td class="td-right">${Number(p.montant).toLocaleString('fr-FR')} FCFA</td><td>${p.date_paiement||'-'}</td><td>${p.mode_paiement}</td><td>${STATUT_LIB_PMT[p.statut]||p.statut}</td></tr>`).join('');
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Comptabilité</div><div class="doc-header-sub">British English Training · Suivi des paiements</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">💳 REGISTRE DES PAIEMENTS</div>
      <div class="doc-body">
        <div class="section-title">Synthèse</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val">${recus.reduce((s,p)=>s+Number(p.montant||0),0).toLocaleString('fr-FR')}</div><div class="kpi-lbl">Total reçu (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#0891B2"><div class="kpi-val">${totalEntreprises.toLocaleString('fr-FR')}</div><div class="kpi-lbl">dont Entreprises (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#7C3AED"><div class="kpi-val">${totalParticuliers.toLocaleString('fr-FR')}</div><div class="kpi-lbl">dont Particuliers (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#F59E0B"><div class="kpi-val">${enAttente}</div><div class="kpi-lbl">En attente</div></div>
        </div>
        <div class="section-title">Détail des paiements</div>
        <table><thead><tr><th>Client</th><th>Référence</th><th>Type</th><th>Montant</th><th>Date</th><th>Mode</th><th>Statut</th></tr></thead><tbody>${lignes || '<tr><td colspan="7" style="text-align:center;color:#94A3B8">Aucun paiement</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Registre des paiements · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, 'Registre des paiements');
  }

  async function exportPaiementsExcel() {
    await exporterExcelStyle({
      nomFichier: 'Paiements_BET',
      titre: '💳 Registre des paiements',
      sousTitre: `Total reçu : ${recus.reduce((s,p)=>s+Number(p.montant||0),0).toLocaleString('fr-FR')} FCFA`,
      couleurEntete: '059669',
      colonnes: [
        { label:'Client', width:24, bold:true }, { label:'Référence', width:16 }, { label:'Type', width:14 },
        { label:'Montant (FCFA)', width:16, align:'right' }, { label:'Date', width:14 }, { label:'Mode', width:16 }, { label:'Statut', width:14 },
      ],
      lignes: paiements.map(p => [p.client_nom, p.reference||'-', typeDe(p)==='entreprise'?'Entreprise':'Particulier', Number(p.montant), p.date_paiement||'-', p.mode_paiement, STATUT_LIB_PMT[p.statut]||p.statut]),
    });
  }

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>
          {flash.msg}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>💳 Suivi des paiements</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportPaiementsPDF} style={{ background:'#D97706', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📥 PDF</button>
          <button onClick={exportPaiementsExcel} style={{ background:'#217346', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📊 Excel</button>
          <button onClick={() => setShowForm(v => !v)} style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {showForm ? '✕ Annuler' : '+ Enregistrer un paiement'}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>💳 Enregistrer un paiement</div>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={enregistrerPaiement} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, width:'100%', boxSizing:'border-box' }}>
              <select value={form.facture_id} onChange={e=>{
                const fact = factures.find(f=>f.id===e.target.value);
                setForm(f=>({...f, facture_id:e.target.value, client_nom: fact?.client_nom || f.client_nom }));
              }} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }}>
                <option value="">- Facture liée (optionnel) -</option>
                {factures.filter(f=>f.statut!=='payee'&&f.statut!=='annulee').map(f => <option key={f.id} value={f.id}>{f.numero} - {f.client_nom} ({Number(f.montant_ttc).toLocaleString('fr-FR')} FCFA)</option>)}
              </select>
              <input placeholder="Client *" value={form.client_nom} onChange={e=>setForm(f=>({...f,client_nom:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 2' }} />
              <input type="number" placeholder="Montant *" value={form.montant} onChange={e=>setForm(f=>({...f,montant:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="date" value={form.date_paiement} onChange={e=>setForm(f=>({...f,date_paiement:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <select value={form.mode_paiement} onChange={e=>setForm(f=>({...f,mode_paiement:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }}>
                <option value="virement">Virement</option><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option>
              </select>
              <input placeholder="Notes" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }} />
              <div style={{ gridColumn:'span 3', display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:couleurTheme, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Enregistrement…':'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
        <FinKpiCard icone="💰" valeur={recus.reduce((s,p)=>s+Number(p.montant||0),0).toLocaleString('fr-FR')+' FCFA'} label="Reçus (total)" accent={COULEURS.succes} />
        <FinKpiCard icone="🏢" valeur={totalEntreprises.toLocaleString('fr-FR')+' FCFA'} label="dont Entreprises" accent="#0891B2" />
        <FinKpiCard icone="👤" valeur={totalParticuliers.toLocaleString('fr-FR')+' FCFA'} label="dont Particuliers" accent="#7C3AED" />
        <FinKpiCard icone="⏳" valeur={enAttente} label="En attente" accent="#F59E0B" />
        <FinKpiCard icone="🔴" valeur={enRetard} label="En retard" accent="#EF4444" />
      </div>

      <div style={_comptaTableau}>
        <div style={{ ..._finThead, gridTemplateColumns:'1.3fr 1.5fr 1.3fr 1fr 1fr 0.8fr 1fr' }}>
          <span>Référence</span><span>Client</span><span style={{textAlign:'right'}}>Montant</span><span>Date paiement</span><span>Mode</span><span style={{textAlign:'center'}}>Rapproché</span><span>Statut</span>
        </div>
        {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}
        {!loading && paiements.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun paiement</div>}
        {paiements.map((p, i) => {
          const stMap = { recu:{bg:'#D1FAE5',txt:'#065F46',lib:'Reçu'}, en_attente:{bg:'#FEF9C3',txt:'#92400E',lib:'En attente'}, en_retard:{bg:'#FEE2E2',txt:'#991B1B',lib:'En retard'} };
          const st = stMap[p.statut] || stMap.en_attente;
          return (
            <div key={p.id} style={_finRow(i, { gridTemplateColumns:'1.3fr 1.5fr 1.3fr 1fr 1fr 0.8fr 1fr', background: p.statut==='en_retard' ? '#FEF2F2' : (i%2===1?'#FAFBFC':COULEURS.blanc) })}>
              <span style={{ ..._finMono, fontWeight:700, color:couleurTheme, fontSize:12 }}>{p.reference || '-'}</span>
              <span style={{ fontWeight:600, color:COULEURS.navy }}>{p.client_nom}</span>
              <span style={_finNumCell}>{Number(p.montant).toLocaleString('fr-FR')} FCFA</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{p.date_paiement || '-'}</span>
              <span style={{ fontSize:12, color:COULEURS.gris600, textTransform:'capitalize' }}>{p.mode_paiement}</span>
              <span onClick={() => toggleRapproche(p)} style={{ textAlign:'center', fontSize:16, cursor:'pointer' }} title="Basculer le rapprochement">{p.rapproche ? '✅' : '-'}</span>
              {finBadge(st.lib, st.txt, st.bg)}
            </div>
          );
        })}
        {paiements.length > 0 && (
          <div style={{ ..._finFoot, gridTemplateColumns:'1.3fr 1.5fr 1.3fr 1fr 1fr 0.8fr 1fr' }}>
            <span>TOTAL ({paiements.length})</span><span /><span style={_finNumCell}>{paiements.reduce((s,p)=>s+Number(p.montant||0),0).toLocaleString('fr-FR')} FCFA</span><span /><span /><span /><span />
          </div>
        )}
      </div>
    </div>
  );
}

export function OngletComptaTresorerie() {
  const { couleurTheme } = useTheme();
  const [synthese, setSynthese] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ categorie:'autre', libelle:'', montant:'', date_depense:'', mode_paiement:'virement', beneficiaire:'' });
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);

  function fetchSynthese() {
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/comptabilite/tresorerie/synthese?mois_historique=6`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setSynthese(d))
      .catch(() => setSynthese(null)).finally(() => setLoading(false));
  }
  useEffect(() => { fetchSynthese(); }, []); // eslint-disable-line

  async function enregistrerDepense(e) {
    e.preventDefault();
    if (!form.libelle.trim() || !form.montant) { setFlash({ type:'err', msg:'Libellé et montant obligatoires' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/depenses`, {
        method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:'Dépense enregistrée.' });
      setShowForm(false);
      setForm({ categorie:'autre', libelle:'', montant:'', date_depense:'', mode_paiement:'virement', beneficiaire:'' });
      fetchSynthese();
    } catch (err) {
      setFlash({ type:'err', msg: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 4000);
    }
  }

  const solde        = synthese?.solde ?? 0;
  const entreesMois   = synthese?.entrees_mois ?? 0;
  const sortiesMois    = synthese?.sorties_mois ?? 0;
  const flux          = synthese?.flux_mensuels ?? [];
  const sortiesCat     = synthese?.sorties_par_categorie ?? {};
  const entreesCat     = synthese?.entrees_par_categorie ?? {};
  const CAT_LABELS = {
    encaissement_client_entreprise: 'Encaissements - Entreprises', encaissement_client_particulier: 'Encaissements - Particuliers',
    paiement_coach:'Honoraires coachs', paiement_fournisseur:'Paiements fournisseurs', depense:'Dépenses générales', manuel:'Mouvements manuels',
  };

  function exportTresoreriePDF() {
    const lignesFlux = flux.map(f => `<tr><td style="font-weight:700;text-transform:capitalize">${f.label}</td><td class="td-right" style="color:#059669">${f.entrees.toLocaleString('fr-FR')} FCFA</td><td class="td-right" style="color:#EF4444">${f.sorties.toLocaleString('fr-FR')} FCFA</td><td class="td-right" style="font-weight:800">${(f.entrees-f.sorties).toLocaleString('fr-FR')} FCFA</td></tr>`).join('');
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Comptabilité</div><div class="doc-header-sub">British English Training · Trésorerie</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">💰 TRÉSORERIE & FLUX FINANCIERS</div>
      <div class="doc-body">
        <div class="section-title">Synthèse</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val">${solde.toLocaleString('fr-FR')}</div><div class="kpi-lbl">Solde courant (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#0891B2"><div class="kpi-val" style="color:#059669">${entreesMois.toLocaleString('fr-FR')}</div><div class="kpi-lbl">Entrées mois (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#EF4444"><div class="kpi-val" style="color:#EF4444">${sortiesMois.toLocaleString('fr-FR')}</div><div class="kpi-lbl">Sorties mois (FCFA)</div></div>
        </div>
        <div class="section-title">Flux mensuels</div>
        <table><thead><tr><th>Mois</th><th>Entrées</th><th>Sorties</th><th>Solde net</th></tr></thead><tbody>${lignesFlux || '<tr><td colspan="4" style="text-align:center;color:#94A3B8">Aucune donnée</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Trésorerie · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, 'Trésorerie & flux financiers');
  }

  async function exportTresorerieExcel() {
    await exporterExcelStyle({
      nomFichier: 'Tresorerie_BET',
      titre: '💰 Trésorerie & flux financiers',
      sousTitre: `Solde courant : ${solde.toLocaleString('fr-FR')} FCFA`,
      couleurEntete: '7C3AED',
      colonnes: [
        { label:'Mois', width:20, bold:true }, { label:'Entrées (FCFA)', width:16, align:'right' },
        { label:'Sorties (FCFA)', width:16, align:'right' }, { label:'Solde net (FCFA)', width:16, align:'right' },
      ],
      lignes: flux.map(f => [f.label, f.entrees, f.sorties, f.entrees - f.sorties]),
    });
  }

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>
          {flash.msg}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>💰 Trésorerie & Flux financiers</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportTresoreriePDF} style={{ background:'#D97706', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📥 PDF</button>
          <button onClick={exportTresorerieExcel} style={{ background:'#217346', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📊 Excel</button>
          <button onClick={() => setShowForm(v => !v)} style={{ background:'#EF4444', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {showForm ? '✕ Annuler' : '+ Saisir une dépense'}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>💸 Saisir une dépense</div>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={enregistrerDepense} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, width:'100%', boxSizing:'border-box' }}>
              <select value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }}>
                <option value="loyer">Loyer</option><option value="salaires">Salaires</option><option value="marketing">Marketing</option>
                <option value="materiel">Matériel</option><option value="utilities">Utilities</option><option value="autre">Autre</option>
              </select>
              <input placeholder="Libellé *" value={form.libelle} onChange={e=>setForm(f=>({...f,libelle:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }} />
              <input type="number" placeholder="Montant *" value={form.montant} onChange={e=>setForm(f=>({...f,montant:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="date" value={form.date_depense} onChange={e=>setForm(f=>({...f,date_depense:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input placeholder="Bénéficiaire" value={form.beneficiaire} onChange={e=>setForm(f=>({...f,beneficiaire:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <div style={{ gridColumn:'span 3', display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:'#EF4444', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Enregistrement…':'Enregistrer la dépense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:24 }}>
        <FinKpiCard icone="🏦" valeur={solde.toLocaleString('fr-FR')+' FCFA'} label="Solde courant" accent="#059669" sombre />
        <FinKpiCard icone="⬆️" valeur={entreesMois.toLocaleString('fr-FR')+' FCFA'} label="Entrées (mois)" accent={COULEURS.succes} />
        <FinKpiCard icone="⬇️" valeur={sortiesMois.toLocaleString('fr-FR')+' FCFA'} label="Sorties (mois)" accent="#EF4444" />
        <FinKpiCard icone="📈" valeur={(entreesMois-sortiesMois).toLocaleString('fr-FR')+' FCFA'} label="Résultat net (mois)" accent={(entreesMois-sortiesMois)>=0?COULEURS.succes:'#EF4444'} />
      </div>

      <div style={_comptaTitreSec}>📊 Flux mensuels</div>
      <div style={_comptaTableau}>
        <div style={{ ..._finThead, gridTemplateColumns:'2fr 1.3fr 1.3fr 1fr 1fr' }}>
          <span>Mois</span><span style={{textAlign:'right'}}>Entrées</span><span style={{textAlign:'right'}}>Sorties</span><span style={{textAlign:'right'}}>Solde net</span><span>Statut</span>
        </div>
        {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}
        {!loading && flux.map((f, i) => {
          const net = f.entrees - f.sorties;
          return (
            <div key={i} style={_finRow(i, { gridTemplateColumns:'2fr 1.3fr 1.3fr 1fr 1fr' })}>
              <span style={{ fontWeight:700, color:COULEURS.navy, textTransform:'capitalize' }}>{f.label}</span>
              <span style={{ ..._finNumCell, color:COULEURS.succes }}>{f.entrees.toLocaleString('fr-FR')} FCFA</span>
              <span style={{ ..._finNumCell, color:'#EF4444' }}>{f.sorties.toLocaleString('fr-FR')} FCFA</span>
              <span style={{ ..._finNumCell, color:net>0?COULEURS.succes:'#EF4444' }}>{net>0?'+':''}{net.toLocaleString('fr-FR')}</span>
              {finBadge(net>0?'Excédent':'Déficit', net>0?'#065F46':'#991B1B', net>0?'#D1FAE5':'#FEE2E2')}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop:20, background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}` }}>
        <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>Répartition des entrées par catégorie - mois courant</div>
        {Object.keys(entreesCat).length === 0 && <div style={{ fontSize:12, color:COULEURS.gris400, marginBottom:20 }}>Aucune entrée enregistrée</div>}
        {Object.entries(entreesCat).map(([cat, val]) => (
          <div key={cat} style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:13 }}>
              <span style={{ fontWeight:600, color:COULEURS.navy }}>{CAT_LABELS[cat] || cat}</span>
              <span style={{ fontWeight:700, color:COULEURS.succes }}>{Number(val).toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden' }}>
              <div style={{ width:`${entreesMois>0?Math.round(val/entreesMois*100):0}%`, height:'100%', background:COULEURS.succes, borderRadius:5 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop:20, background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}` }}>
        <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>Répartition des sorties par catégorie - mois courant</div>
        {Object.keys(sortiesCat).length === 0 && <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucune sortie enregistrée</div>}
        {Object.entries(sortiesCat).map(([cat, val]) => (
          <div key={cat} style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:13 }}>
              <span style={{ fontWeight:600, color:COULEURS.navy }}>{CAT_LABELS[cat] || cat}</span>
              <span style={{ fontWeight:700, color:'#EF4444' }}>{Number(val).toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden' }}>
              <div style={{ width:`${sortiesMois>0?Math.round(val/sortiesMois*100):0}%`, height:'100%', background:'#EF4444', borderRadius:5 }} />
            </div>
          </div>
        ))}
        <div style={{ marginTop:12, padding:'10px 14px', background: (entreesMois-sortiesMois)>=0 ? '#F0FDF4' : '#FEF2F2', borderRadius:8, display:'flex', justifyContent:'space-between', fontSize:13 }}>
          <span style={{ fontWeight:600, color:COULEURS.navy }}>Résultat net (mois courant)</span>
          <span style={{ fontWeight:800, color:(entreesMois-sortiesMois)>=0?COULEURS.succes:'#EF4444' }}>{(entreesMois-sortiesMois)>=0?'+':''}{(entreesMois-sortiesMois).toLocaleString('fr-FR')} FCFA</span>
        </div>
      </div>
    </div>
  );
}

const STATUT_FACTACHAT_MAP = {
  payee:               { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Payée' },
  partiellement_payee: { bg:'#DBEAFE', txt:'#1D4ED8', lib:'🔵 Partiel' },
  recue:               { bg:'#FEF9C3', txt:'#92400E', lib:'⏳ Reçue' },
  en_retard:           { bg:'#FEE2E2', txt:'#991B1B', lib:'🔴 En retard' },
  annulee:             { bg:'#F1F5F9', txt:'#94A3B8', lib:'✕ Annulée' },
};

export function OngletComptaFournisseurs() {
  const { couleurTheme } = useTheme();
  const [sousTab, setSousTab] = useState('fournisseurs'); // fournisseurs | factures | paiements
  const [fournisseurs, setFournisseurs] = useState([]);
  const [facturesAchat, setFacturesAchat] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showFournForm, setShowFournForm] = useState(false);
  const [fournForm, setFournForm] = useState({ nom:'', contact_nom:'', email:'', telephone:'', adresse:'', ncc:'', categorie:'autre', notes:'' });

  const [showFactForm, setShowFactForm] = useState(false);
  const [factForm, setFactForm] = useState({ fournisseur_id:'', reference_fournisseur:'', categorie:'autre', montant_ht:'', tva_taux:0, date_facture:'', date_echeance:'', notes:'' });

  const [showPmtForm, setShowPmtForm] = useState(false);
  const [pmtForm, setPmtForm] = useState({ facture_achat_id:'', fournisseur_id:'', montant:'', date_paiement:'', mode_paiement:'virement', reference:'', notes:'' });

  function fetchAll() {
    setLoading(true);
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/comptabilite/fournisseurs`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({ fournisseurs: [] })),
      fetch(`${_API_URL_ADMIN}/api/comptabilite/factures-achat`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({ factures: [] })),
      fetch(`${_API_URL_ADMIN}/api/comptabilite/paiements-fournisseurs`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({ paiements: [] })),
    ]).then(([dF, dFa, dP]) => {
      setFournisseurs(dF.fournisseurs || []); setFacturesAchat(dFa.factures || []); setPaiements(dP.paiements || []);
    }).finally(() => setLoading(false));
  }
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  async function creerFournisseur(e) {
    e.preventDefault();
    if (!fournForm.nom.trim()) { setFlash({ type:'err', msg:'Le nom du fournisseur est obligatoire' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/fournisseurs`, { method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify(fournForm) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:`Fournisseur "${d.fournisseur.nom}" créé.` });
      setShowFournForm(false);
      setFournForm({ nom:'', contact_nom:'', email:'', telephone:'', adresse:'', ncc:'', categorie:'autre', notes:'' });
      fetchAll();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(() => setFlash(null), 4000); }
  }

  async function creerFactureAchat(e) {
    e.preventDefault();
    if (!factForm.fournisseur_id || !factForm.montant_ht) { setFlash({ type:'err', msg:'Fournisseur et montant HT obligatoires' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/factures-achat`, { method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify(factForm) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:`Facture d'achat ${d.facture.numero} créée.` });
      setShowFactForm(false);
      setFactForm({ fournisseur_id:'', reference_fournisseur:'', categorie:'autre', montant_ht:'', tva_taux:0, date_facture:'', date_echeance:'', notes:'' });
      fetchAll();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(() => setFlash(null), 4000); }
  }

  async function enregistrerPaiementFournisseur(e) {
    e.preventDefault();
    if (!pmtForm.fournisseur_id || !pmtForm.montant) { setFlash({ type:'err', msg:'Fournisseur et montant obligatoires' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/paiements-fournisseurs`, {
        method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify({ ...pmtForm, facture_achat_id: pmtForm.facture_achat_id || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:'Paiement fournisseur enregistré.' });
      setShowPmtForm(false);
      setPmtForm({ facture_achat_id:'', fournisseur_id:'', montant:'', date_paiement:'', mode_paiement:'virement', reference:'', notes:'' });
      fetchAll();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(() => setFlash(null), 4000); }
  }

  const fournisseursActifs = fournisseurs.filter(f => f.actif).length;
  const totalDu    = facturesAchat.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').reduce((s,f) => s + (Number(f.montant_ttc||0) - Number(f.montant_paye||0)), 0);
  const enRetard   = facturesAchat.filter(f => f.statut === 'en_retard').length;
  const totalPayeMois = paiements.filter(p => (p.date_paiement||'').slice(0,7) === new Date().toISOString().slice(0,7)).reduce((s,p) => s + Number(p.montant||0), 0);

  function exportFournisseursPDF() {
    const lignes = facturesAchat.map(f => `<tr><td style="font-weight:700">${f.fournisseur?.nom||'-'}</td><td>${f.numero}</td><td class="td-right">${Number(f.montant_ttc).toLocaleString('fr-FR')} FCFA</td><td>${f.date_echeance||'-'}</td><td>${STATUT_FACTACHAT_MAP[f.statut]?.lib||f.statut}</td></tr>`).join('');
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Comptabilité</div><div class="doc-header-sub">British English Training · Fournisseurs & Achats</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">📦 REGISTRE DES FACTURES D'ACHAT</div>
      <div class="doc-body">
        <div class="section-title">Synthèse</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#DC2626"><div class="kpi-val">${fournisseursActifs}</div><div class="kpi-lbl">Fournisseurs actifs</div></div>
          <div class="kpi-card" style="border-top-color:#F59E0B"><div class="kpi-val">${totalDu.toLocaleString('fr-FR')}</div><div class="kpi-lbl">Total dû (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#EF4444"><div class="kpi-val">${enRetard}</div><div class="kpi-lbl">En retard</div></div>
        </div>
        <div class="section-title">Détail des factures d'achat</div>
        <table><thead><tr><th>Fournisseur</th><th>Référence</th><th>Montant TTC</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>${lignes || '<tr><td colspan="5" style="text-align:center;color:#94A3B8">Aucune facture</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Fournisseurs & Achats · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, 'Registre des factures d\'achat');
  }

  async function exportFournisseursExcel() {
    await exporterExcelStyle({
      nomFichier: 'Fournisseurs_Achats_BET',
      titre: '📦 Registre des factures d\'achat',
      sousTitre: `Total dû : ${totalDu.toLocaleString('fr-FR')} FCFA`,
      couleurEntete: 'DC2626',
      colonnes: [
        { label:'Fournisseur', width:24, bold:true }, { label:'Référence', width:16 },
        { label:'Montant TTC (FCFA)', width:18, align:'right' }, { label:'Échéance', width:14 }, { label:'Statut', width:16 },
      ],
      lignes: facturesAchat.map(f => [f.fournisseur?.nom||'-', f.numero, Number(f.montant_ttc), f.date_echeance||'-', STATUT_FACTACHAT_MAP[f.statut]?.lib||f.statut]),
    });
  }

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>
          {flash.msg}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>📦 Fournisseurs & Achats</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportFournisseursPDF} style={{ background:'#D97706', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📥 PDF</button>
          <button onClick={exportFournisseursExcel} style={{ background:'#217346', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📊 Excel</button>
          <button onClick={() => setShowFournForm(true)} style={{ background:'#DC2626', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Fournisseur</button>
          <button onClick={() => setShowFactForm(true)} style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Facture d'achat</button>
          <button onClick={() => setShowPmtForm(true)} style={{ background:'#059669', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Payer</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
        <FinKpiCard icone="📦" valeur={fournisseursActifs} label="Fournisseurs actifs" accent="#DC2626" />
        <FinKpiCard icone="⏳" valeur={totalDu.toLocaleString('fr-FR')+' FCFA'} label="Total dû" accent="#F59E0B" />
        <FinKpiCard icone="🔴" valeur={enRetard} label="En retard" accent="#EF4444" />
        <FinKpiCard icone="✅" valeur={totalPayeMois.toLocaleString('fr-FR')+' FCFA'} label="Payé ce mois" accent={COULEURS.succes} />
      </div>

      {/* Sous-onglets */}
      <div style={{ display:'flex', gap:6, marginBottom:18, borderBottom:`1px solid ${COULEURS.gris200}` }}>
        {[{k:'fournisseurs',l:'📇 Fournisseurs'},{k:'factures',l:'📄 Factures d\'achat'},{k:'paiements',l:'💸 Paiements'}].map(t => (
          <button key={t.k} onClick={() => setSousTab(t.k)}
            style={{ padding:'9px 16px', background:'none', border:'none', borderBottom: sousTab===t.k?`2.5px solid #DC2626`:'2.5px solid transparent',
              fontSize:13, fontWeight: sousTab===t.k?800:500, color: sousTab===t.k?'#DC2626':COULEURS.gris600, cursor:'pointer' }}>
            {t.l}
          </button>
        ))}
      </div>

      {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}

      {!loading && sousTab === 'fournisseurs' && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'2fr 1.5fr 1.5fr 1fr 1fr' }}>
            <span>Nom</span><span>Contact</span><span>Email / Téléphone</span><span>Catégorie</span><span>Statut</span>
          </div>
          {fournisseurs.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun fournisseur</div>}
          {fournisseurs.map((f, i) => (
            <div key={f.id} style={_finRow(i, { gridTemplateColumns:'2fr 1.5fr 1.5fr 1fr 1fr' })}>
              <span style={{ fontWeight:700, color:COULEURS.navy }}>{f.nom}</span>
              <span style={{ fontSize:12, color:COULEURS.gris600 }}>{f.contact_nom || '-'}</span>
              <span style={{ fontSize:12, color:COULEURS.gris600 }}>{f.email || f.telephone || '-'}</span>
              <span style={{ fontSize:12, color:COULEURS.gris600, textTransform:'capitalize' }}>{f.categorie}</span>
              {finBadge(f.actif?'Actif':'Inactif', f.actif?'#065F46':'#94A3B8', f.actif?'#D1FAE5':'#F1F5F9')}
            </div>
          ))}
        </div>
      )}

      {!loading && sousTab === 'factures' && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'2fr 1.3fr 1.3fr 1fr 1fr 1fr' }}>
            <span>Fournisseur</span><span>Référence</span><span style={{textAlign:'right'}}>Montant TTC</span><span>Facture</span><span>Échéance</span><span>Statut</span>
          </div>
          {facturesAchat.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucune facture d'achat</div>}
          {facturesAchat.map((f, i) => {
            const st = STATUT_FACTACHAT_MAP[f.statut] || STATUT_FACTACHAT_MAP.recue;
            return (
              <div key={f.id} style={_finRow(i, { gridTemplateColumns:'2fr 1.3fr 1.3fr 1fr 1fr 1fr', background: f.statut==='en_retard' ? '#FEF2F2' : (i%2===1?'#FAFBFC':COULEURS.blanc) })}>
                <span style={{ fontWeight:700, color:COULEURS.navy }}>{f.fournisseur?.nom || '-'}</span>
                <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{f.numero}</span>
                <span style={_finNumCell}>{Number(f.montant_ttc).toLocaleString('fr-FR')} FCFA</span>
                <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris400 }}>{f.date_facture}</span>
                <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{f.date_echeance || '-'}</span>
                {finBadge(st.lib, st.txt, st.bg)}
              </div>
            );
          })}
          {facturesAchat.length > 0 && (
            <div style={{ ..._finFoot, gridTemplateColumns:'2fr 1.3fr 1.3fr 1fr 1fr 1fr' }}>
              <span>TOTAL ({facturesAchat.length})</span><span /><span style={_finNumCell}>{facturesAchat.reduce((s,f)=>s+Number(f.montant_ttc||0),0).toLocaleString('fr-FR')} FCFA</span><span /><span /><span />
            </div>
          )}
        </div>
      )}

      {!loading && sousTab === 'paiements' && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'2fr 1.5fr 1.5fr 1fr 1fr' }}>
            <span>Fournisseur</span><span>Référence</span><span style={{textAlign:'right'}}>Montant</span><span>Date</span><span>Mode</span>
          </div>
          {paiements.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun paiement</div>}
          {paiements.map((p, i) => (
            <div key={p.id} style={_finRow(i, { gridTemplateColumns:'2fr 1.5fr 1.5fr 1fr 1fr' })}>
              <span style={{ fontWeight:700, color:COULEURS.navy }}>{p.fournisseur?.nom || '-'}</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{p.reference || '-'}</span>
              <span style={{ ..._finNumCell, color:'#EF4444' }}>{Number(p.montant).toLocaleString('fr-FR')} FCFA</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{p.date_paiement}</span>
              <span style={{ fontSize:12, color:COULEURS.gris600, textTransform:'capitalize' }}>{p.mode_paiement}</span>
            </div>
          ))}
          {paiements.length > 0 && (
            <div style={{ ..._finFoot, gridTemplateColumns:'2fr 1.5fr 1.5fr 1fr 1fr' }}>
              <span>TOTAL ({paiements.length})</span><span /><span style={{ ..._finNumCell, color:'#EF4444' }}>{paiements.reduce((s,p)=>s+Number(p.montant||0),0).toLocaleString('fr-FR')} FCFA</span><span /><span />
            </div>
          )}
        </div>
      )}

      {/* Modal Nouveau fournisseur */}
      {showFournForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowFournForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>📇 Nouveau fournisseur</div>
              <button onClick={() => setShowFournForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={creerFournisseur} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, width:'100%', boxSizing:'border-box' }}>
              <input placeholder="Nom du fournisseur *" value={fournForm.nom} onChange={e=>setFournForm(f=>({...f,nom:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }} />
              <input placeholder="Contact" value={fournForm.contact_nom} onChange={e=>setFournForm(f=>({...f,contact_nom:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="email" placeholder="Email" value={fournForm.email} onChange={e=>setFournForm(f=>({...f,email:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input placeholder="Téléphone" value={fournForm.telephone} onChange={e=>setFournForm(f=>({...f,telephone:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input placeholder="Adresse" value={fournForm.adresse} onChange={e=>setFournForm(f=>({...f,adresse:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 2' }} />
              <input placeholder="NCC (fiscal)" value={fournForm.ncc} onChange={e=>setFournForm(f=>({...f,ncc:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <select value={fournForm.categorie} onChange={e=>setFournForm(f=>({...f,categorie:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }}>
                <option value="loyer">Loyer</option><option value="marketing">Marketing</option><option value="materiel">Matériel</option>
                <option value="services">Services</option><option value="utilities">Utilities</option><option value="autre">Autre</option>
              </select>
              <input placeholder="Notes" value={fournForm.notes} onChange={e=>setFournForm(f=>({...f,notes:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }} />
              <div style={{ gridColumn:'span 3', display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                <button type="button" onClick={() => setShowFournForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:'#DC2626', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Création…':'Créer le fournisseur'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nouvelle facture d'achat */}
      {showFactForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowFactForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>📄 Nouvelle facture d'achat</div>
              <button onClick={() => setShowFactForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            {fournisseurs.length === 0 ? (
              <div style={{ padding:16, background:'#FEF3C7', borderRadius:8, fontSize:13, color:'#92400E' }}>Crée d'abord un fournisseur.</div>
            ) : (
              <form onSubmit={creerFactureAchat} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, width:'100%', boxSizing:'border-box' }}>
                <select value={factForm.fournisseur_id} onChange={e=>setFactForm(f=>({...f,fournisseur_id:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }}>
                  <option value="">- Fournisseur * -</option>
                  {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
                <input placeholder="Référence fournisseur" value={factForm.reference_fournisseur} onChange={e=>setFactForm(f=>({...f,reference_fournisseur:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 2' }} />
                <select value={factForm.categorie} onChange={e=>setFactForm(f=>({...f,categorie:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }}>
                  <option value="loyer">Loyer</option><option value="marketing">Marketing</option><option value="materiel">Matériel</option>
                  <option value="services">Services</option><option value="utilities">Utilities</option><option value="autre">Autre</option>
                </select>
                <input type="number" placeholder="Montant HT *" value={factForm.montant_ht} onChange={e=>setFactForm(f=>({...f,montant_ht:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <input type="number" placeholder="TVA %" value={factForm.tva_taux} onChange={e=>setFactForm(f=>({...f,tva_taux:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <input type="date" value={factForm.date_facture} onChange={e=>setFactForm(f=>({...f,date_facture:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <input type="date" placeholder="Échéance" value={factForm.date_echeance} onChange={e=>setFactForm(f=>({...f,date_echeance:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <input placeholder="Notes" value={factForm.notes} onChange={e=>setFactForm(f=>({...f,notes:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }} />
                <div style={{ gridColumn:'span 3', display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                  <button type="button" onClick={() => setShowFactForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                  <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:couleurTheme, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Création…':'Créer la facture'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Paiement fournisseur */}
      {showPmtForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowPmtForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>💸 Payer un fournisseur</div>
              <button onClick={() => setShowPmtForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            {fournisseurs.length === 0 ? (
              <div style={{ padding:16, background:'#FEF3C7', borderRadius:8, fontSize:13, color:'#92400E' }}>Crée d'abord un fournisseur.</div>
            ) : (
              <form onSubmit={enregistrerPaiementFournisseur} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, width:'100%', boxSizing:'border-box' }}>
                <select value={pmtForm.fournisseur_id} onChange={e=>{
                  const fid = e.target.value;
                  setPmtForm(f=>({...f, fournisseur_id:fid, facture_achat_id:''}));
                }} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }}>
                  <option value="">- Fournisseur * -</option>
                  {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
                <select value={pmtForm.facture_achat_id} onChange={e=>setPmtForm(f=>({...f,facture_achat_id:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }}>
                  <option value="">- Facture liée (optionnel) -</option>
                  {facturesAchat.filter(f=>f.fournisseur_id===pmtForm.fournisseur_id && f.statut!=='payee' && f.statut!=='annulee').map(f => <option key={f.id} value={f.id}>{f.numero} - {Number(f.montant_ttc).toLocaleString('fr-FR')} FCFA</option>)}
                </select>
                <input type="number" placeholder="Montant *" value={pmtForm.montant} onChange={e=>setPmtForm(f=>({...f,montant:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <input type="date" value={pmtForm.date_paiement} onChange={e=>setPmtForm(f=>({...f,date_paiement:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <select value={pmtForm.mode_paiement} onChange={e=>setPmtForm(f=>({...f,mode_paiement:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }}>
                  <option value="virement">Virement</option><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option>
                </select>
                <input placeholder="Référence" value={pmtForm.reference} onChange={e=>setPmtForm(f=>({...f,reference:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <div style={{ gridColumn:'span 3', display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                  <button type="button" onClick={() => setShowPmtForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                  <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:'#059669', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Enregistrement…':'Enregistrer le paiement'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RRD / BC / BACN - /api/comptabilite-rrd-bc-bacn/* (Backend/src/routes/comptabiliteRrdBcBacn.js)
// - RRD : registre chronologique en lecture seule (solde cumulé), calculé sur
//   comptabilite_tresorerie_mouvements - pas de saisie ici.
// - BC (Bon de Caisse) : sortie de caisse formalisée et numérotée.
// - BACN (Bordereau d'Achat Conforme aux Normes) : bon d'achat émis par
//   l'acheteur, lignes multiples, ne génère pas de mouvement de trésorerie.
// ─────────────────────────────────────────────────────────────────────────────
const STATUT_BC_MAP = {
  valide: { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Validé' },
  brouillon: { bg:'#FEF3C7', txt:'#92400E', lib:'📝 Brouillon' },
  annule: { bg:'#F1F5F9', txt:'#64748B', lib:'✕ Annulé' },
};
const STATUT_BACN_MAP = {
  brouillon: { bg:'#FEF3C7', txt:'#92400E', lib:'📝 Brouillon' },
  valide: { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Validé' },
  annule: { bg:'#F1F5F9', txt:'#64748B', lib:'✕ Annulé' },
};
const LIGNE_BACN_VIDE = { designation:'', quantite:1, prix_unitaire:'' };

export function OngletComptaRrdBcBacn() {
  const { couleurTheme } = useTheme();
  const [sousTab, setSousTab] = useState('rrd'); // rrd | bc | bacn
  const [registre, setRegistre] = useState([]);
  const [rrdTotaux, setRrdTotaux] = useState({ total_recettes:0, total_depenses:0, solde_final:0 });
  const [bonsCaisse, setBonsCaisse] = useState([]);
  const [bordereaux, setBordereaux] = useState([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showBcForm, setShowBcForm] = useState(false);
  const [bcForm, setBcForm] = useState({ beneficiaire:'', motif:'', montant:'', date_bc:'', mode_paiement:'especes', notes:'' });

  const [showBacnForm, setShowBacnForm] = useState(false);
  const [bacnForm, setBacnForm] = useState({ fournisseur_nom:'', date_bacn:'', notes:'' });
  const [bacnLignes, setBacnLignes] = useState([{ ...LIGNE_BACN_VIDE }]);

  function fetchAll() {
    setLoading(true);
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/comptabilite-rrd-bc-bacn/rrd`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({ registre: [] })),
      fetch(`${_API_URL_ADMIN}/api/comptabilite-rrd-bc-bacn/bons-caisse`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({ bons_caisse: [] })),
      fetch(`${_API_URL_ADMIN}/api/comptabilite-rrd-bc-bacn/bordereaux-achat`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({ bordereaux_achat: [] })),
    ]).then(([dR, dBc, dBacn]) => {
      setRegistre(dR.registre || []);
      setRrdTotaux({ total_recettes: dR.total_recettes||0, total_depenses: dR.total_depenses||0, solde_final: dR.solde_final||0 });
      setBonsCaisse(dBc.bons_caisse || []);
      setBordereaux(dBacn.bordereaux_achat || []);
    }).finally(() => setLoading(false));
  }
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  async function creerBonCaisse(e) {
    e.preventDefault();
    if (!bcForm.beneficiaire.trim() || !bcForm.motif.trim() || !bcForm.montant) { setFlash({ type:'err', msg:'Bénéficiaire, motif et montant obligatoires' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-rrd-bc-bacn/bons-caisse`, { method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify(bcForm) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:`Bon de caisse ${d.bon_caisse.numero} créé.` });
      setShowBcForm(false);
      setBcForm({ beneficiaire:'', motif:'', montant:'', date_bc:'', mode_paiement:'especes', notes:'' });
      fetchAll();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(() => setFlash(null), 4000); }
  }

  async function annulerBonCaisse(id) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-rrd-bc-bacn/bons-caisse/${id}/annuler`, { method:'PATCH', headers: _authHdrsAdmin() });
      if (!r.ok) throw new Error((await r.json()).error || 'Erreur');
      fetchAll();
    } catch (err) { setFlash({ type:'err', msg: err.message }); setTimeout(() => setFlash(null), 4000); }
  }

  function majLigneBacn(idx, champ, val) {
    setBacnLignes(ls => ls.map((l,i) => i===idx ? { ...l, [champ]: val } : l));
  }
  function ajouterLigneBacn() { setBacnLignes(ls => [...ls, { ...LIGNE_BACN_VIDE }]); }
  function retirerLigneBacn(idx) { setBacnLignes(ls => ls.length>1 ? ls.filter((_,i)=>i!==idx) : ls); }
  const totalBacnForm = bacnLignes.reduce((s,l) => s + (Number(l.quantite)||0)*(Number(l.prix_unitaire)||0), 0);

  async function creerBordereauAchat(e) {
    e.preventDefault();
    if (!bacnForm.fournisseur_nom.trim()) { setFlash({ type:'err', msg:'Le fournisseur est obligatoire' }); return; }
    const lignesValides = bacnLignes.filter(l => l.designation.trim() && Number(l.quantite)>0 && Number(l.prix_unitaire)>0);
    if (lignesValides.length === 0) { setFlash({ type:'err', msg:'Au moins une ligne complète est requise' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-rrd-bc-bacn/bordereaux-achat`, { method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify({ ...bacnForm, lignes: lignesValides }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:`Bordereau d'achat ${d.bordereau_achat.numero} créé.` });
      setShowBacnForm(false);
      setBacnForm({ fournisseur_nom:'', date_bacn:'', notes:'' });
      setBacnLignes([{ ...LIGNE_BACN_VIDE }]);
      fetchAll();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(() => setFlash(null), 4000); }
  }

  async function validerBordereau(id) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-rrd-bc-bacn/bordereaux-achat/${id}/valider`, { method:'PATCH', headers: _authHdrsAdmin() });
      if (!r.ok) throw new Error((await r.json()).error || 'Erreur');
      fetchAll();
    } catch (err) { setFlash({ type:'err', msg: err.message }); setTimeout(() => setFlash(null), 4000); }
  }
  async function annulerBordereau(id) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-rrd-bc-bacn/bordereaux-achat/${id}/annuler`, { method:'PATCH', headers: _authHdrsAdmin() });
      if (!r.ok) throw new Error((await r.json()).error || 'Erreur');
      fetchAll();
    } catch (err) { setFlash({ type:'err', msg: err.message }); setTimeout(() => setFlash(null), 4000); }
  }

  const bcTotalMois = bonsCaisse.filter(b => b.statut==='valide' && (b.date_bc||'').slice(0,7)===new Date().toISOString().slice(0,7)).reduce((s,b)=>s+Number(b.montant||0),0);
  const bacnEnAttente = bordereaux.filter(b => b.statut==='brouillon').length;

  function exportRrdExcel() {
    exporterExcelStyle({
      nomFichier: 'RRD_BET',
      titre: '📒 Registre des Recettes et Dépenses',
      sousTitre: `Solde final : ${rrdTotaux.solde_final.toLocaleString('fr-FR')} FCFA`,
      couleurEntete: '0891B2',
      colonnes: [
        { label:'Date', width:14 }, { label:'Description', width:30 }, { label:'Recette (FCFA)', width:16, align:'right' },
        { label:'Dépense (FCFA)', width:16, align:'right' }, { label:'Solde cumulé (FCFA)', width:18, align:'right' },
      ],
      lignes: registre.map(m => [m.date_mouvement, m.description||'-', m.recette||0, m.depense||0, m.solde_cumule]),
    });
  }

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>
          {flash.msg}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>📒 RRD · BC · BACN</div>
        <div style={{ display:'flex', gap:8 }}>
          {sousTab === 'rrd' && <button onClick={exportRrdExcel} style={{ background:'#217346', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📊 Excel</button>}
          {sousTab === 'bc' && <button onClick={() => setShowBcForm(true)} style={{ background:'#DC2626', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Bon de caisse</button>}
          {sousTab === 'bacn' && <button onClick={() => setShowBacnForm(true)} style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Bordereau d'achat</button>}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
        <FinKpiCard icone="💰" valeur={rrdTotaux.total_recettes.toLocaleString('fr-FR')+' FCFA'} label="Total recettes" accent={COULEURS.succes} />
        <FinKpiCard icone="💸" valeur={rrdTotaux.total_depenses.toLocaleString('fr-FR')+' FCFA'} label="Total dépenses" accent="#DC2626" />
        <FinKpiCard icone="🏦" valeur={rrdTotaux.solde_final.toLocaleString('fr-FR')+' FCFA'} label="Solde" accent="#0891B2" sombre />
        <FinKpiCard icone="📋" valeur={bacnEnAttente} label="Bordereaux en attente" accent="#F59E0B" />
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:18, borderBottom:`1px solid ${COULEURS.gris200}` }}>
        {[{k:'rrd',l:'📒 RRD - Registre'},{k:'bc',l:'🧾 Bons de caisse'},{k:'bacn',l:'📋 Bordereaux d\'achat'}].map(t => (
          <button key={t.k} onClick={() => setSousTab(t.k)}
            style={{ padding:'9px 16px', background:'none', border:'none', borderBottom: sousTab===t.k?`2.5px solid #0891B2`:'2.5px solid transparent',
              fontSize:13, fontWeight: sousTab===t.k?800:500, color: sousTab===t.k?'#0891B2':COULEURS.gris600, cursor:'pointer' }}>
            {t.l}
          </button>
        ))}
      </div>

      {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}

      {!loading && sousTab === 'rrd' && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'1fr 2.5fr 1.2fr 1.2fr 1.3fr' }}>
            <span>Date</span><span>Description</span><span style={{textAlign:'right'}}>Recette</span><span style={{textAlign:'right'}}>Dépense</span><span style={{textAlign:'right'}}>Solde cumulé</span>
          </div>
          {registre.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun mouvement</div>}
          {registre.map((m, i) => (
            <div key={m.id} style={_finRow(i, { gridTemplateColumns:'1fr 2.5fr 1.2fr 1.2fr 1.3fr' })}>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{m.date_mouvement}</span>
              <span style={{ fontSize:12, color:COULEURS.navy }}>{m.description || '-'}</span>
              <span style={{ ..._finNumCell, color: m.recette>0?COULEURS.succes:COULEURS.gris400 }}>{m.recette>0 ? m.recette.toLocaleString('fr-FR')+' FCFA' : '-'}</span>
              <span style={{ ..._finNumCell, color: m.depense>0?'#DC2626':COULEURS.gris400 }}>{m.depense>0 ? m.depense.toLocaleString('fr-FR')+' FCFA' : '-'}</span>
              <span style={{ ..._finNumCell, color:'#0891B2' }}>{m.solde_cumule.toLocaleString('fr-FR')} FCFA</span>
            </div>
          ))}
          {registre.length > 0 && (
            <div style={{ ..._finFoot, gridTemplateColumns:'1fr 2.5fr 1.2fr 1.2fr 1.3fr' }}>
              <span>TOTAL</span><span/>
              <span style={_finNumCell}>{rrdTotaux.total_recettes.toLocaleString('fr-FR')} FCFA</span>
              <span style={_finNumCell}>{rrdTotaux.total_depenses.toLocaleString('fr-FR')} FCFA</span>
              <span style={{ ..._finNumCell, color:'#0891B2' }}>{rrdTotaux.solde_final.toLocaleString('fr-FR')} FCFA</span>
            </div>
          )}
        </div>
      )}

      {!loading && sousTab === 'bc' && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'1.2fr 2fr 1.6fr 1.2fr 1fr 1fr' }}>
            <span>N°</span><span>Bénéficiaire / Motif</span><span style={{textAlign:'right'}}>Montant</span><span>Date</span><span>Statut</span><span>Actions</span>
          </div>
          {bonsCaisse.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun bon de caisse</div>}
          {bonsCaisse.map((b, i) => {
            const st = STATUT_BC_MAP[b.statut] || STATUT_BC_MAP.brouillon;
            return (
              <div key={b.id} style={_finRow(i, { gridTemplateColumns:'1.2fr 2fr 1.6fr 1.2fr 1fr 1fr' })}>
                <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{b.numero}</span>
                <span style={{ fontSize:12, color:COULEURS.navy }}><strong>{b.beneficiaire}</strong> - {b.motif}</span>
                <span style={{ ..._finNumCell, color:'#DC2626' }}>{Number(b.montant).toLocaleString('fr-FR')} FCFA</span>
                <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{b.date_bc}</span>
                {finBadge(st.lib, st.txt, st.bg)}
                <span>
                  {b.statut === 'valide' && (
                    <button onClick={() => annulerBonCaisse(b.id)} style={{ background:'none', border:`1px solid ${COULEURS.gris200}`, borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:600, color:COULEURS.gris600, cursor:'pointer' }}>Annuler</button>
                  )}
                </span>
              </div>
            );
          })}
          {bonsCaisse.length > 0 && (
            <div style={{ ..._finFoot, gridTemplateColumns:'1.2fr 2fr 1.6fr 1.2fr 1fr 1fr' }}>
              <span>CE MOIS (validés)</span><span/><span style={{ ..._finNumCell, color:'#DC2626' }}>{bcTotalMois.toLocaleString('fr-FR')} FCFA</span><span/><span/><span/>
            </div>
          )}
        </div>
      )}

      {!loading && sousTab === 'bacn' && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'1.2fr 2fr 1.6fr 1.2fr 1fr 1fr' }}>
            <span>N°</span><span>Fournisseur</span><span style={{textAlign:'right'}}>Montant total</span><span>Date</span><span>Statut</span><span>Actions</span>
          </div>
          {bordereaux.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun bordereau d'achat</div>}
          {bordereaux.map((b, i) => {
            const st = STATUT_BACN_MAP[b.statut] || STATUT_BACN_MAP.brouillon;
            return (
              <div key={b.id} style={_finRow(i, { gridTemplateColumns:'1.2fr 2fr 1.6fr 1.2fr 1fr 1fr' })}>
                <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{b.numero}</span>
                <span style={{ fontWeight:700, fontSize:12, color:COULEURS.navy }}>{b.fournisseur_nom}</span>
                <span style={_finNumCell}>{Number(b.montant_total).toLocaleString('fr-FR')} FCFA</span>
                <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{b.date_bacn}</span>
                {finBadge(st.lib, st.txt, st.bg)}
                <span style={{ display:'flex', gap:6 }}>
                  {b.statut === 'brouillon' && (
                    <button onClick={() => validerBordereau(b.id)} style={{ background:'#D1FAE5', border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, color:'#065F46', cursor:'pointer' }}>Valider</button>
                  )}
                  {b.statut !== 'annule' && (
                    <button onClick={() => annulerBordereau(b.id)} style={{ background:'none', border:`1px solid ${COULEURS.gris200}`, borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:600, color:COULEURS.gris600, cursor:'pointer' }}>Annuler</button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nouveau bon de caisse */}
      {showBcForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowBcForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'60vw', maxWidth:'60vw', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>🧾 Nouveau bon de caisse</div>
              <button onClick={() => setShowBcForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={creerBonCaisse} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, width:'100%', boxSizing:'border-box' }}>
              <input placeholder="Bénéficiaire *" value={bcForm.beneficiaire} onChange={e=>setBcForm(f=>({...f,beneficiaire:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input placeholder="Motif *" value={bcForm.motif} onChange={e=>setBcForm(f=>({...f,motif:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 2' }} />
              <input type="number" placeholder="Montant *" value={bcForm.montant} onChange={e=>setBcForm(f=>({...f,montant:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="date" value={bcForm.date_bc} onChange={e=>setBcForm(f=>({...f,date_bc:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <select value={bcForm.mode_paiement} onChange={e=>setBcForm(f=>({...f,mode_paiement:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }}>
                <option value="especes">Espèces</option><option value="cheque">Chèque</option><option value="virement">Virement</option><option value="mobile_money">Mobile Money</option>
              </select>
              <input placeholder="Notes" value={bcForm.notes} onChange={e=>setBcForm(f=>({...f,notes:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 3' }} />
              <div style={{ gridColumn:'span 3', display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                <button type="button" onClick={() => setShowBcForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:'#DC2626', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Création…':'Créer le bon de caisse'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nouveau bordereau d'achat */}
      {showBacnForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowBacnForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>📋 Nouveau bordereau d'achat</div>
              <button onClick={() => setShowBacnForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={creerBordereauAchat} style={{ display:'flex', flexDirection:'column', gap:14, width:'100%', boxSizing:'border-box' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12 }}>
                <input placeholder="Fournisseur *" value={bacnForm.fournisseur_nom} onChange={e=>setBacnForm(f=>({...f,fournisseur_nom:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <input type="date" value={bacnForm.date_bacn} onChange={e=>setBacnForm(f=>({...f,date_bacn:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              </div>

              <div>
                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Lignes d'achat</div>
                {bacnLignes.map((l, idx) => (
                  <div key={idx} style={{ display:'grid', gridTemplateColumns:'2.2fr 0.8fr 1fr 1fr auto', gap:8, marginBottom:8, alignItems:'center' }}>
                    <input placeholder="Désignation" value={l.designation} onChange={e=>majLigneBacn(idx,'designation',e.target.value)} style={{ padding:'8px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12.5, width:'100%', boxSizing:'border-box' }} />
                    <input type="number" placeholder="Qté" value={l.quantite} onChange={e=>majLigneBacn(idx,'quantite',e.target.value)} style={{ padding:'8px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12.5, width:'100%', boxSizing:'border-box' }} />
                    <input type="number" placeholder="Prix unitaire" value={l.prix_unitaire} onChange={e=>majLigneBacn(idx,'prix_unitaire',e.target.value)} style={{ padding:'8px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12.5, width:'100%', boxSizing:'border-box' }} />
                    <span style={{ ..._finNumCell, fontSize:12.5 }}>{((Number(l.quantite)||0)*(Number(l.prix_unitaire)||0)).toLocaleString('fr-FR')}</span>
                    <button type="button" onClick={()=>retirerLigneBacn(idx)} style={{ background:'none', border:'none', color:'#DC2626', fontSize:16, cursor:'pointer' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={ajouterLigneBacn} style={{ background:'none', border:`1px dashed ${COULEURS.gris200}`, borderRadius:7, padding:'6px 14px', fontSize:12, fontWeight:600, color:couleurTheme, cursor:'pointer' }}>+ Ajouter une ligne</button>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', fontSize:14, fontWeight:800, color:COULEURS.navy, paddingTop:8, borderTop:`1px solid ${COULEURS.gris200}` }}>
                Total : {totalBacnForm.toLocaleString('fr-FR')} FCFA
              </div>

              <input placeholder="Notes" value={bacnForm.notes} onChange={e=>setBacnForm(f=>({...f,notes:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" onClick={() => setShowBacnForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:couleurTheme, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Création…':'Créer le bordereau'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const JOURNAL_LABELS = { VT:'Ventes', AC:'Achats', BQ:'Banque', OD:'Opérations diverses' };
const JOURNAL_COLORS = { VT:'#0891B2', AC:'#DC2626', BQ:'#059669', OD:'#7C3AED' };

export function OngletComptaGenerale() {
  const [sousTab, setSousTab] = useState('journal'); // journal | grandlivre | balance | bilan | resultat | plancomptable | cloture
  const [comptes, setComptes] = useState([]);
  const [ecritures, setEcritures] = useState([]);
  const [compteSelectionne, setCompteSelectionne] = useState('');
  const [grandLivre, setGrandLivre] = useState(null);
  const [balance, setBalance] = useState(null);
  const [bilan, setBilan] = useState(null);
  const [resultat, setResultat] = useState(null);
  const [exercices, setExercices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  const [showOdForm, setShowOdForm] = useState(false);
  const [odForm, setOdForm] = useState({ date_ecriture:'', libelle:'', lignes:[{compte_numero:'',debit:'',credit:''},{compte_numero:'',debit:'',credit:''}] });
  const [saving, setSaving] = useState(false);
  const [showCompteForm, setShowCompteForm] = useState(false);
  const [compteForm, setCompteForm] = useState({ numero:'', libelle:'', classe:6, type:'charge' });
  const [confirmCloture, setConfirmCloture] = useState(null); // { annee }

  function rechargerComptes() {
    fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/plan-comptable`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setComptes(d.comptes || [])).catch(() => {});
  }
  function rechargerExercices() {
    fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/exercices`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setExercices(d.exercices || [])).catch(() => {});
  }

  async function toggleCompteActif(compte) {
    await fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/plan-comptable/${compte.numero}`, {
      method:'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ actif: !compte.actif }),
    });
    rechargerComptes();
  }

  async function ajouterCompte(e) {
    e.preventDefault();
    if (!compteForm.numero.trim() || !compteForm.libelle.trim()) { setFlash({ type:'err', msg:'Numéro et libellé obligatoires' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/plan-comptable`, {
        method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify(compteForm),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:'Compte ajouté.' });
      setShowCompteForm(false);
      setCompteForm({ numero:'', libelle:'', classe:6, type:'charge' });
      rechargerComptes();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(() => setFlash(null), 4000); }
  }

  async function cloturerExercice(annee) {
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/exercices/${annee}/cloturer`, { method:'POST', headers: _authHdrsAdmin() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:`Exercice ${annee} clôturé - résultat ${Number(d.exercice.resultat_exercice).toLocaleString('fr-FR')} FCFA.` });
      setConfirmCloture(null);
      rechargerExercices();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(() => setFlash(null), 5000); }
  }

  useEffect(() => { rechargerComptes(); }, []); // eslint-disable-line

  useEffect(() => {
    setLoading(true);
    if (sousTab === 'journal') {
      fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/journal`, { headers: _authHdrsAdmin() })
        .then(r => r.json()).then(d => setEcritures(d.ecritures || [])).catch(() => setEcritures([])).finally(() => setLoading(false));
    } else if (sousTab === 'balance') {
      fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/balance`, { headers: _authHdrsAdmin() })
        .then(r => r.json()).then(d => setBalance(d)).catch(() => setBalance(null)).finally(() => setLoading(false));
    } else if (sousTab === 'bilan') {
      fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/bilan`, { headers: _authHdrsAdmin() })
        .then(r => r.json()).then(d => setBilan(d)).catch(() => setBilan(null)).finally(() => setLoading(false));
    } else if (sousTab === 'resultat') {
      fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/compte-resultat`, { headers: _authHdrsAdmin() })
        .then(r => r.json()).then(d => setResultat(d)).catch(() => setResultat(null)).finally(() => setLoading(false));
    } else if (sousTab === 'cloture') {
      rechargerExercices();
      setLoading(false);
    } else if (sousTab === 'plancomptable') {
      rechargerComptes();
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [sousTab]); // eslint-disable-line

  useEffect(() => {
    if (sousTab !== 'grandlivre' || !compteSelectionne) { setGrandLivre(null); return; }
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/grand-livre/${compteSelectionne}`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setGrandLivre(d)).catch(() => setGrandLivre(null)).finally(() => setLoading(false));
  }, [sousTab, compteSelectionne]); // eslint-disable-line

  function updateLigneOd(i, champ, val) {
    setOdForm(f => ({ ...f, lignes: f.lignes.map((l, j) => j === i ? { ...l, [champ]: val } : l) }));
  }
  function ajouterLigneOd() {
    setOdForm(f => ({ ...f, lignes: [...f.lignes, { compte_numero:'', debit:'', credit:'' }] }));
  }
  const totalDebitOd  = odForm.lignes.reduce((s,l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCreditOd = odForm.lignes.reduce((s,l) => s + (parseFloat(l.credit) || 0), 0);
  const odEquilibree = totalDebitOd > 0 && Math.round(totalDebitOd*100) === Math.round(totalCreditOd*100);

  async function passerEcritureManuelle(e) {
    e.preventDefault();
    if (!odForm.libelle.trim()) { setFlash({ type:'err', msg:'Libellé obligatoire' }); return; }
    if (!odEquilibree) { setFlash({ type:'err', msg:'Le total débit doit égaler le total crédit' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-generale/journal/manuel`, {
        method:'POST', headers: _authHdrsAdmin(),
        body: JSON.stringify({
          date_ecriture: odForm.date_ecriture, libelle: odForm.libelle,
          lignes: odForm.lignes.filter(l=>l.compte_numero).map(l => ({ compte_numero:l.compte_numero, debit:parseFloat(l.debit)||0, credit:parseFloat(l.credit)||0 })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:`Écriture ${d.ecriture.numero_piece} enregistrée.` });
      setShowOdForm(false);
      setOdForm({ date_ecriture:'', libelle:'', lignes:[{compte_numero:'',debit:'',credit:''},{compte_numero:'',debit:'',credit:''}] });
      setSousTab('journal');
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(() => setFlash(null), 4000); }
  }

  function exportBalancePDF() {
    if (!balance) return;
    const lignes = balance.balance.map(c => `<tr><td>${c.numero}</td><td>${c.libelle}</td><td class="td-right">${c.total_debit.toLocaleString('fr-FR')}</td><td class="td-right">${c.total_credit.toLocaleString('fr-FR')}</td><td class="td-right">${c.solde_debiteur.toLocaleString('fr-FR')}</td><td class="td-right">${c.solde_crediteur.toLocaleString('fr-FR')}</td></tr>`).join('');
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Comptabilité générale</div><div class="doc-header-sub">British English Training · Balance générale</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">📊 BALANCE GÉNÉRALE</div>
      <div class="doc-body">
        <table><thead><tr><th>Compte</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th>Solde débiteur</th><th>Solde créditeur</th></tr></thead><tbody>${lignes}</tbody>
        <tfoot><tr><td colspan="2">TOTAUX</td><td style="font-weight:900">${balance.totaux.debit.toLocaleString('fr-FR')}</td><td style="font-weight:900">${balance.totaux.credit.toLocaleString('fr-FR')}</td><td></td><td></td></tr></tfoot></table>
        <div class="doc-footer"><span>BET · Balance générale · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, 'Balance générale');
  }

  async function exportBalanceExcel() {
    if (!balance) return;
    await exporterExcelStyle({
      nomFichier: 'Balance_generale_BET', titre: '📊 Balance générale', couleurEntete: '0F172A',
      colonnes: [{label:'Compte',width:12},{label:'Libellé',width:32,bold:true},{label:'Débit',width:16,align:'right'},{label:'Crédit',width:16,align:'right'},{label:'Solde débiteur',width:16,align:'right'},{label:'Solde créditeur',width:16,align:'right'}],
      lignes: balance.balance.map(c => [c.numero, c.libelle, c.total_debit, c.total_credit, c.solde_debiteur, c.solde_crediteur]),
    });
  }

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>
          {flash.msg}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>📚 Comptabilité générale (SYSCOHADA)</div>
        <button onClick={() => setShowOdForm(true)} style={{ background:'#0F172A', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Écriture manuelle (OD)</button>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:18, borderBottom:`1px solid ${COULEURS.gris200}`, flexWrap:'wrap' }}>
        {[{k:'journal',l:'📖 Journal'},{k:'grandlivre',l:'📗 Grand livre'},{k:'balance',l:'⚖️ Balance'},{k:'bilan',l:'🏛️ Bilan'},{k:'resultat',l:'📈 Compte de résultat'},{k:'plancomptable',l:'🗂️ Plan comptable'},{k:'cloture',l:'🔒 Clôture'}].map(t => (
          <button key={t.k} onClick={() => setSousTab(t.k)}
            style={{ padding:'9px 14px', background:'none', border:'none', borderBottom: sousTab===t.k?'2.5px solid #0F172A':'2.5px solid transparent',
              fontSize:13, fontWeight: sousTab===t.k?800:500, color: sousTab===t.k?'#0F172A':COULEURS.gris600, cursor:'pointer' }}>
            {t.l}
          </button>
        ))}
      </div>

      {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}

      {/* ── JOURNAL ── */}
      {!loading && sousTab === 'journal' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {ecritures.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13, background:COULEURS.blanc, borderRadius:10, border:`1px solid ${COULEURS.gris200}` }}>Aucune écriture</div>}
          {ecritures.map(e => {
            const totDebit = (e.lignes||[]).reduce((s,l)=>s+Number(l.debit||0),0);
            return (
              <div key={e.id} style={{ ..._comptaTableau, padding:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'#F8FAFC', borderBottom:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ ..._finMono, fontWeight:800, color:COULEURS.navy, fontSize:12 }}>{e.numero_piece}</span>
                    {finBadge(JOURNAL_LABELS[e.journal]||e.journal, JOURNAL_COLORS[e.journal]||'#64748B', `${JOURNAL_COLORS[e.journal]||'#64748B'}18`)}
                    <span style={{ fontSize:13, color:COULEURS.navy, fontWeight:600 }}>{e.libelle}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{e.date_ecriture}</span>
                    <span style={{ ..._finNumCell, fontSize:13 }}>{totDebit.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>
                {(e.lignes||[]).sort((a,b)=>a.ordre-b.ordre).map(l => (
                  <div key={l.id} style={{ display:'grid', gridTemplateColumns:'100px 2fr 1fr 1fr', padding:'7px 16px 7px 32px', fontSize:12.5, borderBottom:`1px solid ${COULEURS.gris100}` }}>
                    <span style={{ ..._finMono, color:COULEURS.gris600 }}>{l.compte_numero}</span>
                    <span style={{ color:COULEURS.gris600 }}>{comptes.find(c=>c.numero===l.compte_numero)?.libelle || l.libelle}</span>
                    <span style={{ ..._finNumCell, fontSize:12.5 }}>{Number(l.debit)>0 ? Number(l.debit).toLocaleString('fr-FR') : ''}</span>
                    <span style={{ ..._finNumCell, fontSize:12.5 }}>{Number(l.credit)>0 ? Number(l.credit).toLocaleString('fr-FR') : ''}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── GRAND LIVRE ── */}
      {!loading && sousTab === 'grandlivre' && (
        <div>
          <select value={compteSelectionne} onChange={e=>setCompteSelectionne(e.target.value)} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, marginBottom:16, minWidth:320 }}>
            <option value="">- Choisir un compte -</option>
            {comptes.map(c => <option key={c.numero} value={c.numero}>{c.numero} - {c.libelle}</option>)}
          </select>
          {!compteSelectionne && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Sélectionne un compte pour voir ses mouvements</div>}
          {grandLivre && (
            <div style={_comptaTableau}>
              <div style={{ ..._finThead, gridTemplateColumns:'1fr 0.8fr 1.5fr 3fr 1fr 1fr 1fr' }}>
                <span>Pièce</span><span>Journal</span><span>Libellé</span><span></span><span style={{textAlign:'right'}}>Débit</span><span style={{textAlign:'right'}}>Crédit</span><span style={{textAlign:'right'}}>Solde</span>
              </div>
              {grandLivre.mouvements.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun mouvement</div>}
              {grandLivre.mouvements.map((m, i) => (
                <div key={i} style={_finRow(i, { gridTemplateColumns:'1fr 0.8fr 1.5fr 3fr 1fr 1fr 1fr' })}>
                  <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{m.piece}</span>
                  {finBadge(m.journal, JOURNAL_COLORS[m.journal]||'#64748B', `${JOURNAL_COLORS[m.journal]||'#64748B'}18`)}
                  <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris400 }}>{m.date}</span>
                  <span style={{ fontSize:13, color:COULEURS.navy }}>{m.libelle}</span>
                  <span style={_finNumCell}>{m.debit>0?m.debit.toLocaleString('fr-FR'):''}</span>
                  <span style={_finNumCell}>{m.credit>0?m.credit.toLocaleString('fr-FR'):''}</span>
                  <span style={{ ..._finNumCell, color: m.solde_progressif>=0?COULEURS.navy:'#EF4444' }}>{m.solde_progressif.toLocaleString('fr-FR')}</span>
                </div>
              ))}
              {grandLivre.mouvements.length > 0 && (
                <div style={{ ..._finFoot, gridTemplateColumns:'1fr 0.8fr 1.5fr 3fr 1fr 1fr 1fr' }}>
                  <span>SOLDE FINAL</span><span/><span/><span/><span/><span/><span style={_finNumCell}>{grandLivre.solde_final.toLocaleString('fr-FR')} FCFA</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BALANCE ── */}
      {!loading && sousTab === 'balance' && balance && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginBottom:12 }}>
            <button onClick={exportBalancePDF} style={{ background:'#D97706', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📥 PDF</button>
            <button onClick={exportBalanceExcel} style={{ background:'#217346', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>📊 Excel</button>
          </div>
          <div style={_comptaTableau}>
            <div style={{ ..._finThead, gridTemplateColumns:'0.9fr 2fr 1fr 1fr 1fr 1fr' }}>
              <span>Compte</span><span>Libellé</span><span style={{textAlign:'right'}}>Débit</span><span style={{textAlign:'right'}}>Crédit</span><span style={{textAlign:'right'}}>Solde débiteur</span><span style={{textAlign:'right'}}>Solde créditeur</span>
            </div>
            {balance.balance.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun mouvement comptabilisé</div>}
            {balance.balance.map((c, i) => (
              <div key={c.numero} style={_finRow(i, { gridTemplateColumns:'0.9fr 2fr 1fr 1fr 1fr 1fr' })}>
                <span style={{ ..._finMono, fontWeight:700, color:COULEURS.navy }}>{c.numero}</span>
                <span style={{ fontSize:13, color:COULEURS.navy }}>{c.libelle}</span>
                <span style={_finNumCell}>{c.total_debit.toLocaleString('fr-FR')}</span>
                <span style={_finNumCell}>{c.total_credit.toLocaleString('fr-FR')}</span>
                <span style={{ ..._finNumCell, color:COULEURS.succes }}>{c.solde_debiteur>0?c.solde_debiteur.toLocaleString('fr-FR'):''}</span>
                <span style={{ ..._finNumCell, color:'#EF4444' }}>{c.solde_crediteur>0?c.solde_crediteur.toLocaleString('fr-FR'):''}</span>
              </div>
            ))}
            {balance.balance.length > 0 && (
              <div style={{ ..._finFoot, gridTemplateColumns:'0.9fr 2fr 1fr 1fr 1fr 1fr' }}>
                <span>TOTAUX</span><span/><span style={_finNumCell}>{balance.totaux.debit.toLocaleString('fr-FR')}</span><span style={_finNumCell}>{balance.totaux.credit.toLocaleString('fr-FR')}</span><span/><span/>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BILAN ── */}
      {!loading && sousTab === 'bilan' && bilan && (
        <div>
          {!bilan.equilibre && (
            <div style={{ padding:'10px 16px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, color:'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>
              ⚠️ Bilan non équilibré (Actif {bilan.total_actif.toLocaleString('fr-FR')} ≠ Passif {bilan.total_passif.toLocaleString('fr-FR')}) - vérifier les écritures.
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div style={_comptaTableau}>
              <div style={{ padding:'12px 16px', background:'#EFF6FF', borderBottom:`1px solid ${COULEURS.gris200}`, fontWeight:800, color:'#1D4ED8', fontSize:13 }}>ACTIF</div>
              {bilan.actif.map((a,i) => (
                <div key={a.numero} style={_finRow(i, { gridTemplateColumns:'1fr 2fr 1fr' })}>
                  <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{a.numero}</span>
                  <span style={{ fontSize:13 }}>{a.libelle}</span>
                  <span style={_finNumCell}>{a.montant.toLocaleString('fr-FR')}</span>
                </div>
              ))}
              <div style={{ ..._finFoot, gridTemplateColumns:'1fr 2fr 1fr' }}><span>TOTAL ACTIF</span><span/><span style={_finNumCell}>{bilan.total_actif.toLocaleString('fr-FR')} FCFA</span></div>
            </div>
            <div style={_comptaTableau}>
              <div style={{ padding:'12px 16px', background:'#FEF2F2', borderBottom:`1px solid ${COULEURS.gris200}`, fontWeight:800, color:'#991B1B', fontSize:13 }}>PASSIF</div>
              {bilan.passif.map((p,i) => (
                <div key={p.numero} style={_finRow(i, { gridTemplateColumns:'1fr 2fr 1fr' })}>
                  <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{p.numero}</span>
                  <span style={{ fontSize:13 }}>{p.libelle}</span>
                  <span style={_finNumCell}>{p.montant.toLocaleString('fr-FR')}</span>
                </div>
              ))}
              <div style={{ ..._finFoot, gridTemplateColumns:'1fr 2fr 1fr' }}><span>TOTAL PASSIF</span><span/><span style={_finNumCell}>{bilan.total_passif.toLocaleString('fr-FR')} FCFA</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPTE DE RÉSULTAT ── */}
      {!loading && sousTab === 'resultat' && resultat && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
            <div style={_comptaTableau}>
              <div style={{ padding:'12px 16px', background:'#FEF2F2', borderBottom:`1px solid ${COULEURS.gris200}`, fontWeight:800, color:'#991B1B', fontSize:13 }}>CHARGES</div>
              {resultat.charges.map((c,i) => (
                <div key={c.numero} style={_finRow(i, { gridTemplateColumns:'1fr 2fr 1fr' })}>
                  <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{c.numero}</span>
                  <span style={{ fontSize:13 }}>{c.libelle}</span>
                  <span style={_finNumCell}>{c.montant.toLocaleString('fr-FR')}</span>
                </div>
              ))}
              <div style={{ ..._finFoot, gridTemplateColumns:'1fr 2fr 1fr' }}><span>TOTAL CHARGES</span><span/><span style={_finNumCell}>{resultat.total_charges.toLocaleString('fr-FR')} FCFA</span></div>
            </div>
            <div style={_comptaTableau}>
              <div style={{ padding:'12px 16px', background:'#F0FDF4', borderBottom:`1px solid ${COULEURS.gris200}`, fontWeight:800, color:'#065F46', fontSize:13 }}>PRODUITS</div>
              {resultat.produits.map((p,i) => (
                <div key={p.numero} style={_finRow(i, { gridTemplateColumns:'1fr 2fr 1fr' })}>
                  <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{p.numero}</span>
                  <span style={{ fontSize:13 }}>{p.libelle}</span>
                  <span style={_finNumCell}>{p.montant.toLocaleString('fr-FR')}</span>
                </div>
              ))}
              <div style={{ ..._finFoot, gridTemplateColumns:'1fr 2fr 1fr' }}><span>TOTAL PRODUITS</span><span/><span style={_finNumCell}>{resultat.total_produits.toLocaleString('fr-FR')} FCFA</span></div>
            </div>
          </div>
          <div style={{ padding:'16px 20px', background: resultat.resultat_net>=0?'linear-gradient(135deg,#059669,#047857)':'linear-gradient(135deg,#DC2626,#991B1B)', borderRadius:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ color:'#fff', fontWeight:700, fontSize:15 }}>{resultat.resultat_net>=0?'✅ Résultat net (bénéfice)':'⚠️ Résultat net (perte)'}</span>
            <span style={{ ..._finMono, color:'#fff', fontWeight:900, fontSize:22 }}>{resultat.resultat_net>=0?'+':''}{resultat.resultat_net.toLocaleString('fr-FR')} FCFA</span>
          </div>
        </div>
      )}

      {/* ── PLAN COMPTABLE ── */}
      {!loading && sousTab === 'plancomptable' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={() => setShowCompteForm(true)} style={{ background:'#0F172A', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Ajouter un compte</button>
          </div>
          <div style={_comptaTableau}>
            <div style={{ ..._finThead, gridTemplateColumns:'1fr 3fr 0.8fr 1fr 0.8fr' }}>
              <span>Numéro</span><span>Libellé</span><span>Classe</span><span>Type</span><span style={{textAlign:'center'}}>Actif</span>
            </div>
            {comptes.map((c,i) => (
              <div key={c.numero} style={_finRow(i, { gridTemplateColumns:'1fr 3fr 0.8fr 1fr 0.8fr', opacity: c.actif===false?0.5:1 })}>
                <span style={{ ..._finMono, fontWeight:700, color:COULEURS.navy, fontSize:12 }}>{c.numero}</span>
                <span style={{ fontSize:13 }}>{c.libelle}</span>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>Classe {c.classe}</span>
                <span style={{ fontSize:12, color:COULEURS.gris600, textTransform:'capitalize' }}>{c.type}</span>
                <span onClick={() => toggleCompteActif(c)} style={{ textAlign:'center', fontSize:16, cursor:'pointer' }} title="Activer/désactiver">{c.actif===false ? '⚪' : '✅'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CLÔTURE D'EXERCICE ── */}
      {!loading && sousTab === 'cloture' && (
        <div>
          <div style={_comptaTableau}>
            <div style={{ ..._finThead, gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr' }}>
              <span>Exercice</span><span>Statut</span><span style={{textAlign:'right'}}>Résultat</span><span>Date de clôture</span><span></span>
            </div>
            {exercices.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun exercice clôturé pour l'instant</div>}
            {exercices.map((ex,i) => (
              <div key={ex.id} style={_finRow(i, { gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr' })}>
                <span style={{ fontWeight:700 }}>{ex.annee}</span>
                {ex.statut==='cloture' ? finBadge('Clôturé','#065F46','#D1FAE5') : finBadge('Ouvert','#92400E','#FEF9C3')}
                <span style={_finNumCell}>{ex.resultat_exercice!=null ? Number(ex.resultat_exercice).toLocaleString('fr-FR')+' FCFA' : '-'}</span>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>{ex.date_cloture ? new Date(ex.date_cloture).toLocaleDateString('fr-FR') : '-'}</span>
                <span></span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:20, padding:18, background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10 }}>
            <div style={{ fontWeight:800, fontSize:13, color:'#92400E', marginBottom:8 }}>⚠️ Clôturer un exercice</div>
            <div style={{ fontSize:12.5, color:'#92400E', marginBottom:12 }}>Action irréversible : solde tous les comptes de charges/produits de l'année vers le résultat, et bloque toute nouvelle écriture datée dans cet exercice.</div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <select id="cloture-annee-select" defaultValue={new Date().getFullYear()} style={{ padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
                {[0,1,2].map(d => { const a = new Date().getFullYear()-d; return <option key={a} value={a}>{a}</option>; })}
              </select>
              <button onClick={() => setConfirmCloture({ annee: parseInt(document.getElementById('cloture-annee-select').value,10) })} style={{ background:'#DC2626', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Clôturer l'exercice</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation clôture */}
      {confirmCloture && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'min(440px,90vw)', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy, marginBottom:10 }}>Clôturer l'exercice {confirmCloture.annee} ?</div>
            <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:18 }}>Cette action est irréversible. Toutes les écritures OD/VT/AC/BQ datées en {confirmCloture.annee} seront verrouillées.</div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setConfirmCloture(null)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
              <button disabled={saving} onClick={() => cloturerExercice(confirmCloture.annee)} style={{ padding:'9px 20px', background:'#DC2626', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Clôture…':'Confirmer la clôture'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajout compte plan comptable */}
      {showCompteForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCompteForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'min(480px,92vw)', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy, marginBottom:18 }}>🗂️ Ajouter un compte</div>
            <form onSubmit={ajouterCompte} style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <input placeholder="Numéro (ex: 622100) *" value={compteForm.numero} onChange={e=>setCompteForm(f=>({...f,numero:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }} />
              <input placeholder="Libellé *" value={compteForm.libelle} onChange={e=>setCompteForm(f=>({...f,libelle:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <select value={compteForm.classe} onChange={e=>setCompteForm(f=>({...f,classe:parseInt(e.target.value,10)}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
                  {[1,2,3,4,5,6,7,8,9].map(c => <option key={c} value={c}>Classe {c}</option>)}
                </select>
                <select value={compteForm.type} onChange={e=>setCompteForm(f=>({...f,type:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
                  <option value="actif">Actif</option><option value="passif">Passif</option><option value="charge">Charge</option><option value="produit">Produit</option>
                </select>
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                <button type="button" onClick={() => setShowCompteForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:'#0F172A', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Enregistrement…':'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal écriture manuelle (OD) */}
      {showOdForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowOdForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'92vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', boxSizing:'border-box' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>📝 Écriture manuelle (Opérations diverses)</div>
              <button onClick={() => setShowOdForm(false)} style={{ background:'none', border:'none', fontSize:20, color:COULEURS.gris400, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={passerEcritureManuelle}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, marginBottom:16 }}>
                <input type="date" value={odForm.date_ecriture} onChange={e=>setOdForm(f=>({...f,date_ecriture:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
                <input placeholder="Libellé de l'écriture *" value={odForm.libelle} onChange={e=>setOdForm(f=>({...f,libelle:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                {odForm.lignes.map((l, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr)', gap:8 }}>
                    <select value={l.compte_numero} onChange={e=>updateLigneOd(i,'compte_numero',e.target.value)} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12.5, width:'100%', boxSizing:'border-box', minWidth:0 }}>
                      <option value="">- Compte -</option>
                      {comptes.map(c => <option key={c.numero} value={c.numero}>{c.numero} - {c.libelle}</option>)}
                    </select>
                    <input type="number" placeholder="Débit" value={l.debit} onChange={e=>updateLigneOd(i,'debit',e.target.value)} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12.5, width:'100%', boxSizing:'border-box', minWidth:0 }} />
                    <input type="number" placeholder="Crédit" value={l.credit} onChange={e=>updateLigneOd(i,'credit',e.target.value)} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12.5, width:'100%', boxSizing:'border-box', minWidth:0 }} />
                  </div>
                ))}
              </div>
              <button type="button" onClick={ajouterLigneOd} style={{ background:'none', border:`1px dashed ${COULEURS.gris200}`, borderRadius:8, padding:'7px 14px', fontSize:12, color:COULEURS.gris600, cursor:'pointer', marginBottom:14 }}>+ Ajouter une ligne</button>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', background: odEquilibree?'#F0FDF4':'#FEF2F2', borderRadius:8, marginBottom:16, fontSize:13 }}>
                <span>Débit : <strong>{totalDebitOd.toLocaleString('fr-FR')}</strong> - Crédit : <strong>{totalCreditOd.toLocaleString('fr-FR')}</strong></span>
                <span style={{ fontWeight:700, color: odEquilibree?'#065F46':'#991B1B' }}>{odEquilibree?'✓ Équilibrée':'✕ Déséquilibrée'}</span>
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" onClick={() => setShowOdForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving || !odEquilibree} style={{ padding:'9px 20px', background: odEquilibree?'#0F172A':COULEURS.gris200, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor: odEquilibree?'pointer':'not-allowed' }}>{saving?'Enregistrement…':'Passer l\'écriture'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TVA - synthèse & déclarations
══════════════════════════════════════════════════════════════ */
export function OngletComptaTva() {
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [synthese, setSynthese] = useState(null);
  const [declarations, setDeclarations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);

  function recharger() {
    setLoading(true);
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/comptabilite-tva/synthese?mois=${mois}&annee=${annee}`, { headers: _authHdrsAdmin() }).then(r=>r.json()),
      fetch(`${_API_URL_ADMIN}/api/comptabilite-tva/declarations`, { headers: _authHdrsAdmin() }).then(r=>r.json()),
    ]).then(([s,d]) => { setSynthese(s); setDeclarations(d.declarations||[]); }).finally(()=>setLoading(false));
  }
  useEffect(() => { recharger(); }, [mois, annee]); // eslint-disable-line

  async function genererDeclaration() {
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-tva/declarations`, { method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify({ mois, annee }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:'Déclaration générée.' });
      recharger();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(()=>setFlash(null),4000); }
  }

  async function changerStatut(decl, statut) {
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-tva/declarations/${decl.id}`, { method:'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ statut }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg: statut==='declaree' ? 'Déclaration validée.' : 'Paiement enregistré.' });
      recharger();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(()=>setFlash(null),4000); }
  }

  const stMap = { brouillon:{bg:'#F1F5F9',txt:'#475569',lib:'Brouillon'}, declaree:{bg:'#FEF9C3',txt:'#92400E',lib:'Déclarée'}, payee:{bg:'#D1FAE5',txt:'#065F46',lib:'Payée'} };

  return (
    <div>
      {flash && <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>{flash.msg}</div>}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>🧮 TVA - Synthèse & déclarations</div>
        <div style={{ display:'flex', gap:8 }}>
          <select value={mois} onChange={e=>setMois(parseInt(e.target.value,10))} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{new Date(2000,m-1,1).toLocaleDateString('fr-FR',{month:'long'})}</option>)}
          </select>
          <select value={annee} onChange={e=>setAnnee(parseInt(e.target.value,10))} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
            {[0,1,2].map(d => { const a = now.getFullYear()-d; return <option key={a} value={a}>{a}</option>; })}
          </select>
          <button onClick={genererDeclaration} disabled={saving} style={{ background:'#0F172A', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Générer la déclaration</button>
        </div>
      </div>

      {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}
      {!loading && synthese && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
          <FinKpiCard icone="📤" valeur={synthese.tva_collectee.toLocaleString('fr-FR')+' FCFA'} label="TVA collectée (période)" accent="#0891B2" />
          <FinKpiCard icone="📥" valeur={synthese.tva_deductible.toLocaleString('fr-FR')+' FCFA'} label="TVA déductible (période)" accent="#7C3AED" />
          <FinKpiCard icone="⚖️" valeur={synthese.tva_a_payer.toLocaleString('fr-FR')+' FCFA'} label="TVA à payer (période)" accent={synthese.tva_a_payer>=0?'#DC2626':'#059669'} />
        </div>
      )}

      <div style={_comptaTableau}>
        <div style={{ ..._finThead, gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr' }}>
          <span>Période</span><span style={{textAlign:'right'}}>Collectée</span><span style={{textAlign:'right'}}>Déductible</span><span style={{textAlign:'right'}}>À payer</span><span>Statut</span><span></span>
        </div>
        {declarations.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucune déclaration</div>}
        {declarations.map((d,i) => {
          const st = stMap[d.statut] || stMap.brouillon;
          return (
            <div key={d.id} style={_finRow(i, { gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr' })}>
              <span style={{ fontWeight:700 }}>{String(d.periode_mois).padStart(2,'0')}/{d.periode_annee}</span>
              <span style={_finNumCell}>{Number(d.tva_collectee).toLocaleString('fr-FR')}</span>
              <span style={_finNumCell}>{Number(d.tva_deductible).toLocaleString('fr-FR')}</span>
              <span style={_finNumCell}>{Number(d.tva_a_payer).toLocaleString('fr-FR')}</span>
              {finBadge(st.lib, st.txt, st.bg)}
              <span>
                {d.statut==='brouillon' && <button onClick={()=>changerStatut(d,'declaree')} disabled={saving} style={{ background:'none', border:`1px solid ${COULEURS.gris200}`, borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>Déclarer</button>}
                {d.statut==='declaree' && <button onClick={()=>changerStatut(d,'payee')} disabled={saving} style={{ background:'none', border:`1px solid ${COULEURS.gris200}`, borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>Marquer payée</button>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   IMMOBILISATIONS & AMORTISSEMENTS
══════════════════════════════════════════════════════════════ */
export function OngletComptaImmobilisations() {
  const [immos, setImmos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ libelle:'', categorie:'materiel', valeur_acquisition:'', date_acquisition:'', duree_amortissement_annees:5, valeur_residuelle:0, notes:'' });

  function recharger() {
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/comptabilite-immobilisations`, { headers: _authHdrsAdmin() })
      .then(r=>r.json()).then(d=>setImmos(d.immobilisations||[])).catch(()=>setImmos([])).finally(()=>setLoading(false));
  }
  useEffect(() => { recharger(); }, []); // eslint-disable-line

  async function ajouter(e) {
    e.preventDefault();
    if (!form.libelle.trim() || !form.valeur_acquisition) { setFlash({ type:'err', msg:'Libellé et valeur obligatoires' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-immobilisations`, { method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:'Immobilisation ajoutée.' });
      setShowForm(false);
      setForm({ libelle:'', categorie:'materiel', valeur_acquisition:'', date_acquisition:'', duree_amortissement_annees:5, valeur_residuelle:0, notes:'' });
      recharger();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(()=>setFlash(null),4000); }
  }

  async function amortirTout() {
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite-immobilisations/amortir-tout`, { method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify({ exercice_annee: new Date().getFullYear() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:`${d.generes}/${d.traites} amortissement(s) généré(s) pour ${new Date().getFullYear()}.` });
      recharger();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(()=>setFlash(null),5000); }
  }

  const valeurTotale = immos.reduce((s,i)=>s+Number(i.valeur_acquisition||0),0);
  const vncTotale = immos.reduce((s,i)=>s+Number(i.valeur_nette_comptable||0),0);

  return (
    <div>
      {flash && <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>{flash.msg}</div>}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>🏢 Immobilisations & amortissements</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={amortirTout} disabled={saving} style={{ background:'none', border:`1px solid ${COULEURS.gris200}`, borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Calculer les amortissements {new Date().getFullYear()}</button>
          <button onClick={()=>setShowForm(true)} style={{ background:'#0F172A', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Ajouter</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
        <FinKpiCard icone="🏢" valeur={valeurTotale.toLocaleString('fr-FR')+' FCFA'} label="Valeur d'acquisition" accent="#0891B2" />
        <FinKpiCard icone="📉" valeur={(valeurTotale-vncTotale).toLocaleString('fr-FR')+' FCFA'} label="Cumul amortissements" accent="#DC2626" />
        <FinKpiCard icone="💎" valeur={vncTotale.toLocaleString('fr-FR')+' FCFA'} label="Valeur nette comptable" accent="#059669" />
      </div>

      {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}
      {!loading && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr' }}>
            <span>Libellé</span><span style={{textAlign:'right'}}>Valeur acq.</span><span>Acquisition</span><span>Durée</span><span style={{textAlign:'right'}}>Cumul amorti</span><span style={{textAlign:'right'}}>VNC</span>
          </div>
          {immos.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucune immobilisation</div>}
          {immos.map((i,idx) => (
            <div key={i.id} style={_finRow(idx, { gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr' })}>
              <span style={{ fontWeight:600, color:COULEURS.navy }}>{i.libelle}</span>
              <span style={_finNumCell}>{Number(i.valeur_acquisition).toLocaleString('fr-FR')}</span>
              <span style={{ ..._finMono, fontSize:12, color:COULEURS.gris600 }}>{i.date_acquisition}</span>
              <span style={{ fontSize:12, color:COULEURS.gris600 }}>{i.duree_amortissement_annees} ans</span>
              <span style={_finNumCell}>{Number(i.cumul_amortissement||0).toLocaleString('fr-FR')}</span>
              <span style={{ ..._finNumCell, color:'#059669' }}>{Number(i.valeur_nette_comptable||0).toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, width:'70vw', maxWidth:'70vw', maxHeight:'92vh', overflowY:'auto', overflowX:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', boxSizing:'border-box' }}>
            <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy, marginBottom:18 }}>🏢 Ajouter une immobilisation</div>
            <form onSubmit={ajouter} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10 }}>
              <input placeholder="Libellé *" value={form.libelle} onChange={e=>setForm(f=>({...f,libelle:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 2' }} />
              <select value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }}>
                <option value="materiel">Matériel informatique</option><option value="mobilier">Mobilier</option><option value="vehicule">Véhicule</option><option value="autre">Autre</option>
              </select>
              <input type="number" placeholder="Valeur d'acquisition *" value={form.valeur_acquisition} onChange={e=>setForm(f=>({...f,valeur_acquisition:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="date" value={form.date_acquisition} onChange={e=>setForm(f=>({...f,date_acquisition:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="number" placeholder="Durée d'amortissement (années)" value={form.duree_amortissement_annees} onChange={e=>setForm(f=>({...f,duree_amortissement_annees:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input type="number" placeholder="Valeur résiduelle" value={form.valeur_residuelle} onChange={e=>setForm(f=>({...f,valeur_residuelle:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box' }} />
              <input placeholder="Notes" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:'100%', boxSizing:'border-box', gridColumn:'span 2' }} />
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', gridColumn:'1/-1', marginTop:8 }}>
                <button type="button" onClick={()=>setShowForm(false)} style={{ padding:'9px 16px', background:COULEURS.gris100, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', background:'#0F172A', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Enregistrement…':'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   BUDGETS / PRÉVISIONNEL
══════════════════════════════════════════════════════════════ */
export function OngletComptaBudgets() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [suivi, setSuivi] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [form, setForm] = useState({ categorie:'loyer', type:'charge', montant_prevu:'' });

  function recharger() {
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/comptabilite/budgets/suivi?annee=${annee}`, { headers: _authHdrsAdmin() })
      .then(r=>r.json()).then(d=>{ setSuivi(d.suivi||[]); setCategories(d.categories_charge_disponibles||[]); }).finally(()=>setLoading(false));
  }
  useEffect(() => { recharger(); }, [annee]); // eslint-disable-line

  async function enregistrerBudget(e) {
    e.preventDefault();
    if (!form.montant_prevu) { setFlash({ type:'err', msg:'Montant prévu obligatoire' }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/comptabilite/budgets`, { method:'POST', headers: _authHdrsAdmin(), body: JSON.stringify({ ...form, annee }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setFlash({ type:'ok', msg:'Budget enregistré.' });
      setForm({ categorie:'loyer', type:'charge', montant_prevu:'' });
      recharger();
    } catch (err) { setFlash({ type:'err', msg: err.message }); }
    finally { setSaving(false); setTimeout(()=>setFlash(null),4000); }
  }

  return (
    <div>
      {flash && <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>{flash.msg}</div>}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>🎯 Budgets & prévisionnel</div>
        <select value={annee} onChange={e=>setAnnee(parseInt(e.target.value,10))} style={{ padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
          {[0,1,2].map(d => { const a = new Date().getFullYear()-d; return <option key={a} value={a}>{a}</option>; })}
        </select>
      </div>

      <form onSubmit={enregistrerBudget} style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap', alignItems:'center', background:'#F8FAFC', padding:14, borderRadius:10, border:`1px solid ${COULEURS.gris200}` }}>
        <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value, categorie: e.target.value==='produit'?'ventes':'loyer'}))} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
          <option value="charge">Charge</option><option value="produit">Produit</option>
        </select>
        {form.type==='charge' ? (
          <select value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
            {(categories.length?categories:['loyer','salaires','marketing','materiel','services','utilities','autre']).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input placeholder="Catégorie (ex: ventes)" value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }} />
        )}
        <input type="number" placeholder="Montant prévu *" value={form.montant_prevu} onChange={e=>setForm(f=>({...f,montant_prevu:e.target.value}))} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, width:160 }} />
        <button type="submit" disabled={saving} style={{ background:'#0F172A', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>{saving?'…':'Enregistrer'}</button>
      </form>

      {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}
      {!loading && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1.5fr' }}>
            <span>Catégorie</span><span>Type</span><span style={{textAlign:'right'}}>Prévu</span><span style={{textAlign:'right'}}>Réel</span><span style={{textAlign:'right'}}>Écart</span><span>Progression</span>
          </div>
          {suivi.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucun budget défini pour {annee}</div>}
          {suivi.map((s,i) => (
            <div key={s.id} style={_finRow(i, { gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1.5fr' })}>
              <span style={{ fontWeight:600, textTransform:'capitalize' }}>{s.categorie}</span>
              <span style={{ fontSize:12, color:COULEURS.gris600, textTransform:'capitalize' }}>{s.type}</span>
              <span style={_finNumCell}>{s.prevu.toLocaleString('fr-FR')}</span>
              <span style={_finNumCell}>{s.reel.toLocaleString('fr-FR')}</span>
              <span style={{ ..._finNumCell, color: s.type==='charge' ? (s.ecart>0?'#DC2626':'#059669') : (s.ecart<0?'#DC2626':'#059669') }}>{s.ecart>=0?'+':''}{s.ecart.toLocaleString('fr-FR')}</span>
              <span>
                <div style={{ background:COULEURS.gris100, borderRadius:6, height:8, overflow:'hidden' }}>
                  <div style={{ width:`${Math.min(s.pct||0,100)}%`, height:'100%', background: s.pct>100 && s.type==='charge' ? '#DC2626' : '#0F172A' }} />
                </div>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   COMPTABILITÉ ANALYTIQUE
══════════════════════════════════════════════════════════════ */
export function OngletComptaAnalytique() {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [repartition, setRepartition] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/comptabilite/analytique/repartition?annee=${annee}`, { headers: _authHdrsAdmin() })
      .then(r=>r.json()).then(d=>{ setRepartition(d.repartition||[]); setTotal(d.total||0); }).finally(()=>setLoading(false));
  }, [annee]);

  const couleurs = ['#0891B2','#7C3AED','#059669','#DC2626','#F59E0B','#64748B'];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={_comptaTitreSec}>📐 Comptabilité analytique - répartition des charges par axe</div>
        <select value={annee} onChange={e=>setAnnee(parseInt(e.target.value,10))} style={{ padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13 }}>
          {[0,1,2].map(d => { const a = now.getFullYear()-d; return <option key={a} value={a}>{a}</option>; })}
        </select>
      </div>

      {loading && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400 }}>Chargement…</div>}
      {!loading && (
        <div style={_comptaTableau}>
          <div style={{ ..._finThead, gridTemplateColumns:'2fr 1fr 1.5fr' }}>
            <span>Axe analytique</span><span style={{textAlign:'right'}}>Montant</span><span>Part</span>
          </div>
          {repartition.length === 0 && <div style={{ padding:20, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Aucune charge affectée sur {annee}</div>}
          {repartition.map((r,i) => (
            <div key={r.axe_id||'na'} style={_finRow(i, { gridTemplateColumns:'2fr 1fr 1.5fr' })}>
              <span style={{ fontWeight:600, color:COULEURS.navy }}>{r.libelle}</span>
              <span style={_finNumCell}>{r.montant.toLocaleString('fr-FR')} FCFA</span>
              <span>
                <div style={{ background:COULEURS.gris100, borderRadius:6, height:10, overflow:'hidden' }}>
                  <div style={{ width:`${total>0?Math.round(r.montant/total*100):0}%`, height:'100%', background: couleurs[i%couleurs.length] }} />
                </div>
              </span>
            </div>
          ))}
          {repartition.length > 0 && (
            <div style={{ ..._finFoot, gridTemplateColumns:'2fr 1fr 1.5fr' }}><span>TOTAL</span><span style={_finNumCell}>{total.toLocaleString('fr-FR')} FCFA</span><span/></div>
          )}
        </div>
      )}
    </div>
  );
}
