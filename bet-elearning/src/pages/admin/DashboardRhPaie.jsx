// DashboardRhPaie.jsx - Module RH / Paie extrait de DashboardAdmin.jsx (profil admin_rh_paie)
import { useState, useEffect } from 'react';
import { COULEURS } from '../../constants/couleurs';
import { genererPDF, fmtDatePDF, exporterExcelStyle } from '../../utils/genererPDF';
import { useTheme } from '../../contexts/ThemeContext';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}`, 'X-Plateforme': 'bet-elearning' });

export function OngletRHPaieBulletins() {
  const { couleurTheme } = useTheme();
  const now = new Date();
  const MOIS_LABELS = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const [mois, setMois]   = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [bulletins, setBulletins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [payModal, setPayModal] = useState(null); // { hon, coachNom }
  const [payForm, setPayForm] = useState({ mode_paiement:'virement', reference_paiement:'' });
  const [payConfirm, setPayConfirm] = useState(false);
  const [actionEnCours, setActionEnCours] = useState(false);
  const [flash, setFlash] = useState(null);
  const [payModalSeances, setPayModalSeances] = useState([]);
  const [payModalSeancesLoading, setPayModalSeancesLoading] = useState(false);
  const moisLabel = `${MOIS_LABELS[mois]} ${annee}`;

  useEffect(() => {
    if (!payModal) { setPayModalSeances([]); return; }
    setPayModalSeancesLoading(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${payModal.hon.id}/seances`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setPayModalSeances(d.seances || []))
      .catch(() => setPayModalSeances([])).finally(() => setPayModalSeancesLoading(false));
  }, [payModal?.hon?.id]); // eslint-disable-line

  function fetchBulletins() {
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/honoraires?mois=${mois}&annee=${annee}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setBulletins((d.honoraires || []).filter(h => h.statut === 'transmis' || h.statut === 'paye')))
      .catch(() => setBulletins([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => { fetchBulletins(); }, [mois, annee]); // eslint-disable-line

  async function marquerPaye() {
    if (actionEnCours || !payModal) return;
    setActionEnCours(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${payModal.hon.id}/statut`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'paye', mode_paiement: payForm.mode_paiement, reference_paiement: payForm.reference_paiement }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      // Le PATCH ne renvoie pas le coach enrichi (jointure faite uniquement côté GET
      // /honoraires) - on le préserve depuis l'état précédent pour ne pas perdre le nom.
      setBulletins(prev => prev.map(h => h.id === d.honoraire.id ? { ...d.honoraire, coach: h.coach } : h));
      setFlash({ type:'ok', msg:`💵 Paiement enregistré pour ${payModal.coachNom}.` });
      setPayModal(null); setPayForm({ mode_paiement:'virement', reference_paiement:'' }); setPayConfirm(false);
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setActionEnCours(false);
      setTimeout(() => setFlash(null), 5000);
    }
  }

  async function annulerPaiement(b) {
    if (actionEnCours) return;
    const nom = b.coach ? `${b.coach.prenom||''} ${b.coach.nom||''}`.trim() : `Coach #${(b.coach_id||'').slice(0,6)}`;
    setActionEnCours(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${b.id}/statut`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'transmis' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setBulletins(prev => prev.map(h => h.id === d.honoraire.id ? { ...d.honoraire, coach: h.coach } : h));
      setFlash({ type:'ok', msg:`↩️ Paiement annulé pour ${nom} - fiche repassée en "à payer".` });
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setActionEnCours(false);
      setTimeout(() => setFlash(null), 5000);
    }
  }

  const totalTransmis = bulletins.reduce((s,b) => s + (b.montant_net||0), 0);
  const totalPaye     = bulletins.filter(b=>b.statut==='paye').reduce((s,b) => s + (b.montant_net||0), 0);
  const totalAPayer   = bulletins.filter(b=>b.statut==='transmis').reduce((s,b) => s + (b.montant_net||0), 0);
  const nbAPayer      = bulletins.filter(b=>b.statut==='transmis').length;

  function exportPDF() {
    const lignes = bulletins.map(b => {
      const nom = b.coach ? `${b.coach.prenom||''} ${b.coach.nom||''}`.trim() : `Coach #${(b.coach_id||'').slice(0,6)}`;
      return `<tr><td style="font-weight:700">${nom}</td><td>${moisLabel}</td><td class="td-right">${Math.round(b.montant_net).toLocaleString('fr-FR')} FCFA</td><td><span class="badge ${b.statut==='paye'?'badge-green':'badge-orange'}">${b.statut==='paye'?'✅ Payé':'⏳ À payer'}</span></td></tr>`;
    }).join('');
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - RH / Paie</div><div class="doc-header-sub">British English Training · Service Ressources Humaines</div></div><div class="doc-header-right">Période : ${moisLabel}<br/>Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">💰 RÉCAPITULATIF DES HONORAIRES COACHS E-LEARNING - ${moisLabel.toUpperCase()}</div>
      <div class="doc-body">
        <div class="section-title">Synthèse</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val" style="color:#059669">${totalTransmis.toLocaleString('fr-FR')}</div><div class="kpi-lbl">Total transmis (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#0891B2"><div class="kpi-val">${bulletins.length}</div><div class="kpi-lbl">Bulletins</div></div>
          <div class="kpi-card" style="border-top-color:#F59E0B"><div class="kpi-val">${nbAPayer}</div><div class="kpi-lbl">À payer</div></div>
          <div class="kpi-card" style="border-top-color:#7C3AED"><div class="kpi-val">${totalAPayer.toLocaleString('fr-FR')}</div><div class="kpi-lbl">Net à virer (FCFA)</div></div>
        </div>
        <div class="section-title">Détail par coach</div>
        <table><thead><tr><th>Coach</th><th>Mois</th><th>Montant net</th><th>Statut</th></tr></thead><tbody>${lignes || '<tr><td colspan="4" style="text-align:center;color:#94A3B8">Aucun bulletin</td></tr>'}</tbody><tfoot><tr><td colspan="2">TOTAL</td><td style="font-weight:900">${totalTransmis.toLocaleString('fr-FR')} FCFA</td><td></td></tr></tfoot></table>
        <div class="signatures" style="margin-top:36px"><div class="sig-block"><div class="sig-line"></div><div class="sig-name">Responsable RH / Paie</div><div class="sig-role">BET</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-name">Comptable Trésorier</div><div class="sig-role">Pour exécution</div></div></div>
        <div class="doc-footer"><span>BET · Récapitulatif honoraires ${moisLabel} · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, `Récapitulatif honoraires - ${moisLabel}`);
  }

  async function exportExcel() {
    await exporterExcelStyle({
      nomFichier: `Honoraires_coachs_${moisLabel.replace(/\s+/g,'_')}`,
      titre: `💰 Honoraires coachs e-learning - ${moisLabel}`,
      sousTitre: `Total transmis : ${totalTransmis.toLocaleString('fr-FR')} FCFA`,
      couleurEntete: '217346',
      colonnes: [
        { label: 'Coach', width: 24, bold: true }, { label: 'Mois', width: 14 },
        { label: 'Montant net (FCFA)', width: 18, align: 'right' }, { label: 'Statut', width: 14 },
      ],
      lignes: bulletins.map(b => {
        const nom = b.coach ? `${b.coach.prenom||''} ${b.coach.nom||''}`.trim() : `Coach #${(b.coach_id||'').slice(0,6)}`;
        return [nom, moisLabel, Math.round(b.montant_net), b.statut==='paye'?'Payé':'À payer'];
      }),
    });
  }

  async function genererFichePDF(b) {
    const nom = b.coach ? `${b.coach.prenom||''} ${b.coach.nom||''}`.trim() : `Coach #${(b.coach_id||'').slice(0,6)}`;
    let seances = [];
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${b.id}/seances`, { headers: _authHdrsAdmin() });
      const d = await r.json();
      seances = d.seances || [];
    } catch {}

    const lignesSeances = seances.map(s => `
      <tr${s.honoraire_statut_pa==='rejete' ? ' style="opacity:0.5;text-decoration:line-through"' : ''}>
        <td>${s.date ? new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '-'}</td>
        <td>${s.classe_nom||'-'}</td>
        <td>${(s.heure_debut||'').slice(0,5)}–${(s.heure_fin||'').slice(0,5)}</td>
        <td class="td-right">${s.duree_heures.toFixed(2)}h</td>
        <td class="td-right">${Math.round(s.montant).toLocaleString('fr-FR')} FCFA</td>
      </tr>`).join('');

    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - RH / Paie</div><div class="doc-header-sub">British English Training · Fiche d'honoraires</div></div><div class="doc-header-right">Période : ${moisLabel}<br/>Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">💰 FICHE D'HONORAIRES - ${nom.toUpperCase()} - ${moisLabel.toUpperCase()}</div>
      <div class="doc-body">
        <div class="section-title">Coach</div>
        <div class="info-grid">
          <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${nom}</span></div>
          <div class="info-row"><span class="info-label">Période</span><span class="info-value">${moisLabel}</span></div>
          <div class="info-row"><span class="info-label">Statut</span><span class="info-value">${b.statut==='paye'?'✅ Payé':'⏳ À payer'}</span></div>
          <div class="info-row"><span class="info-label">Mode de paiement</span><span class="info-value">${b.mode_paiement||'-'}${b.reference_paiement?` (${b.reference_paiement})`:''}</span></div>
        </div>
        <div class="section-title">Rémunération</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#0EA5E9"><div class="kpi-val">${b.nb_seances||0}</div><div class="kpi-lbl">Séances</div></div>
          <div class="kpi-card" style="border-top-color:#8B5CF6"><div class="kpi-val">${(b.nb_heures||0).toFixed(1)}h</div><div class="kpi-lbl">Heures</div></div>
          <div class="kpi-card" style="border-top-color:#6366F1"><div class="kpi-val">${Math.round(b.tarif_horaire).toLocaleString('fr-FR')}</div><div class="kpi-lbl">Tarif/h (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val">${Math.round(b.montant_net).toLocaleString('fr-FR')}</div><div class="kpi-lbl">Net (FCFA)</div></div>
        </div>
        <table><thead><tr><th>Rubrique</th><th>Montant</th></tr></thead><tbody>
          <tr><td>Montant brut</td><td class="td-right">${Math.round(b.montant_brut).toLocaleString('fr-FR')} FCFA</td></tr>
          <tr><td>Retenues</td><td class="td-right" style="color:#DC2626">${b.retenues ? `- ${Math.round(b.retenues).toLocaleString('fr-FR')} FCFA` : 'Aucune'}</td></tr>
        </tbody><tfoot><tr><td>NET À PAYER</td><td style="font-size:16px">${Math.round(b.montant_net).toLocaleString('fr-FR')} FCFA</td></tr></tfoot></table>
        ${b.note_pa ? `<div class="section-title">Note du PA Advisor</div><div class="info-row"><span class="info-value">${b.note_pa}</span></div>` : ''}
        <div class="section-title">Détail des séances réalisées</div>
        <table><thead><tr><th>Date</th><th>Groupe</th><th>Créneau</th><th>Durée</th><th>Montant</th></tr></thead>
        <tbody>${lignesSeances || '<tr><td colspan="5" style="text-align:center;color:#94A3B8">Aucune séance</td></tr>'}</tbody></table>
        <div class="signatures" style="margin-top:40px"><div class="sig-block"><div class="sig-line"></div><div class="sig-name">Le Coach</div><div class="sig-role">${nom}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-name">Responsable RH</div><div class="sig-role">BET - Service RH</div></div></div>
        <div class="doc-footer"><span>BET · Fiche d'honoraires ${moisLabel} · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, `Fiche honoraires ${nom} - ${moisLabel}`);
  }

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, marginBottom:16 }}>
          {flash.msg}
        </div>
      )}

      {/* En-tête + sélecteur mois/année */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy }}>💰 Honoraires des coachs e-learning - {moisLabel}</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {MOIS_LABELS.slice(1).map((m,i) => (
            <button key={m} onClick={() => setMois(i+1)}
              style={{ padding:'4px 9px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:mois===i+1?couleurTheme:COULEURS.gris100, color:mois===i+1?'#fff':COULEURS.gris600 }}>
              {m}
            </button>
          ))}
          {[2024,2025,2026,2027].map(y => (
            <button key={y} onClick={() => setAnnee(y)}
              style={{ padding:'4px 9px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:annee===y?couleurTheme:COULEURS.gris100, color:annee===y?'#fff':COULEURS.gris600 }}>
              {y}
            </button>
          ))}
          <button onClick={exportPDF} style={{ background:'#D97706', color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>📥 PDF</button>
          <button onClick={exportExcel} style={{ background:'#217346', color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>📊 Excel</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:14, marginBottom:24 }}>
        {[
          { l:'Bulletins',       v:bulletins.length,                                      c:'#0891B2', i:'📄' },
          { l:'À payer',         v:nbAPayer,                                              c:'#F59E0B', i:'⏳' },
          { l:'Net à virer',     v:totalAPayer.toLocaleString('fr-FR')+' FCFA',           c:'#7C3AED', i:'🏦' },
          { l:'Déjà payé',       v:totalPaye.toLocaleString('fr-FR')+' FCFA',             c:'#059669', i:'✅' },
        ].map(k => (
          <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
            <div style={{ fontSize:22, marginBottom:5 }}>{k.i}</div>
            <div style={{ fontSize:14, fontWeight:800, color:k.c }}>{k.v}</div>
            <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:3 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Tableau bulletins */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400 }}>⏳ Chargement…</div>
      ) : bulletins.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', border:'2px dashed #E5E7EB', borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:44, marginBottom:12 }}>💰</div>
          <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6, fontSize:15 }}>Aucun bulletin transmis pour {moisLabel}</div>
          <div style={{ fontSize:12 }}>Les fiches apparaissent ici une fois transmises par le PA Advisor.</div>
        </div>
      ) : (
        <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:`1px solid ${COULEURS.gris200}` }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1.5fr 1fr 1fr 1fr', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            <span>Coach</span><span>Mois</span><span>Montant net</span><span>Statut</span><span>Action</span><span>Fiche</span>
          </div>
          {bulletins.map(b => {
            const nom = b.coach ? `${b.coach.prenom||''} ${b.coach.nom||''}`.trim() : `Coach #${(b.coach_id||'').slice(0,6)}`;
            return (
              <div key={b.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1.5fr 1fr 1fr 1fr', padding:'14px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center' }}>
                <div style={{ fontWeight:700, color:COULEURS.navy }}>{nom}</div>
                <span style={{ color:COULEURS.gris600 }}>{moisLabel}</span>
                <span style={{ fontWeight:700, color:COULEURS.navy }}>{Math.round(b.montant_net).toLocaleString('fr-FR')} FCFA</span>
                <span style={{ padding:'3px 10px', borderRadius:20, background:b.statut==='paye'?'#D1FAE5':'#FEF9C3', color:b.statut==='paye'?'#065F46':'#92400E', fontSize:11, fontWeight:600, width:'fit-content' }}>
                  {b.statut === 'paye' ? '✅ Payé' : '⏳ À payer'}
                </span>
                <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-start' }}>
                  {b.statut === 'transmis' ? (
                    <button onClick={() => { setPayModal({ hon:b, coachNom:nom }); setPayConfirm(false); }}
                      style={{ padding:'5px 12px', borderRadius:8, border:'none', background:couleurTheme, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      💵 Marquer payé
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize:11, color:COULEURS.gris400 }}>
                        {b.mode_paiement || 'virement'}{b.reference_paiement ? ` · ${b.reference_paiement}` : ''}
                      </span>
                      <button onClick={() => annulerPaiement(b)} disabled={actionEnCours}
                        style={{ padding:'2px 8px', borderRadius:6, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#991B1B', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                        ↩️ Annuler le paiement
                      </button>
                    </>
                  )}
                </div>
                <button onClick={() => genererFichePDF(b)}
                  style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  📄 Fiche PDF
                </button>
              </div>
            );
          })}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1.5fr 1fr 1fr 1fr', padding:'12px 20px', background:COULEURS.navy, fontSize:13, alignItems:'center' }}>
            <span style={{ fontWeight:800, color:'#fff' }}>TOTAL</span><span></span>
            <span style={{ fontWeight:900, color:'#FCD34D', fontSize:15 }}>{totalTransmis.toLocaleString('fr-FR')} FCFA</span>
            <span></span><span></span><span></span>
          </div>
        </div>
      )}

      {/* Modal marquer payé - étape 1 : vérification + détails du paiement */}
      {payModal && !payConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:820, maxHeight:'88vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'20px 24px 16px', background:'#F0FDF4', borderBottom:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy }}>💵 Marquer comme payé</div>
              <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:4 }}>{payModal.coachNom} - {moisLabel} - {Math.round(payModal.hon.montant_net).toLocaleString('fr-FR')} FCFA</div>
            </div>

            {/* KPIs de la fiche */}
            <div style={{ padding:'20px 24px 0', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[
                { l:'Séances',      v: payModal.hon.nb_seances||0,                       c:'#0EA5E9' },
                { l:'Heures',       v: `${(payModal.hon.nb_heures||0).toFixed(1)}h`,      c:'#8B5CF6' },
                { l:'Montant brut', v: `${Math.round(payModal.hon.montant_brut).toLocaleString('fr-FR')} FCFA`, c:COULEURS.navy },
                { l:'Retenues',     v: payModal.hon.retenues ? `${Math.round(payModal.hon.retenues).toLocaleString('fr-FR')} FCFA` : 'Aucune', c:'#DC2626' },
              ].map(k => (
                <div key={k.l} style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 14px', border:'1px solid #E5E7EB' }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>{k.l}</div>
                  <div style={{ fontWeight:800, fontSize:14, color:k.c }}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* Détail des séances (lecture seule) */}
            <div style={{ padding:'20px 24px 0' }}>
              <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:8, textTransform:'uppercase', fontWeight:700 }}>📋 Séances prises en compte</div>
              {payModalSeancesLoading ? (
                <div style={{ textAlign:'center', padding:16, color:COULEURS.gris400, fontSize:12 }}>⏳ Chargement…</div>
              ) : payModalSeances.length === 0 ? (
                <div style={{ textAlign:'center', padding:16, color:COULEURS.gris400, fontSize:12, background:'#F8FAFC', borderRadius:10 }}>Aucune séance associée.</div>
              ) : (
                <div style={{ border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden', maxHeight:220, overflowY:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'#F8FAFC', position:'sticky', top:0 }}>
                        {['Date','Groupe','Créneau','Durée','Montant','Statut'].map(col => (
                          <th key={col} style={{ padding:'7px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB' }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payModalSeances.map((s,i) => (
                        <tr key={s.id} style={{ borderBottom:'1px solid #F1F5F9', background: s.honoraire_statut_pa==='rejete' ? '#FEF2F2' : (i%2===0?'#fff':'#FAFAFA') }}>
                          <td style={{ padding:'7px 12px' }}>{s.date ? new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '-'}</td>
                          <td style={{ padding:'7px 12px', fontWeight:600, color:COULEURS.navy }}>{s.classe_nom}</td>
                          <td style={{ padding:'7px 12px', color:COULEURS.gris600 }}>{s.heure_debut?.slice(0,5)}–{s.heure_fin?.slice(0,5)}</td>
                          <td style={{ padding:'7px 12px', color:COULEURS.gris600 }}>{s.duree_heures.toFixed(2)}h</td>
                          <td style={{ padding:'7px 12px', fontWeight:700, color: s.honoraire_statut_pa==='rejete' ? COULEURS.gris400 : '#059669', textDecoration: s.honoraire_statut_pa==='rejete' ? 'line-through' : 'none' }}>{Math.round(s.montant).toLocaleString('fr-FR')} FCFA</td>
                          <td style={{ padding:'7px 12px' }}>
                            <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background: s.honoraire_statut_pa==='rejete'?'#FEE2E2':'#DBEAFE', color: s.honoraire_statut_pa==='rejete'?'#991B1B':'#1D4ED8' }}>
                              {s.honoraire_statut_pa==='rejete'?'Rejetée':'Validée'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Détails du paiement */}
            <div style={{ padding:24, display:'flex', gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:4 }}>Mode de paiement</div>
                <select value={payForm.mode_paiement} onChange={e => setPayForm(f => ({ ...f, mode_paiement: e.target.value }))}
                  style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, width:'100%' }}>
                  <option value="virement">Virement bancaire</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="especes">Espèces</option>
                  <option value="cheque">Chèque</option>
                </select>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:4 }}>Référence (optionnel)</div>
                <input type="text" value={payForm.reference_paiement} onChange={e => setPayForm(f => ({ ...f, reference_paiement: e.target.value }))}
                  placeholder="N° de transaction, référence virement…"
                  style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, width:'100%' }} />
              </div>
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setPayModal(null)}
                style={{ padding:'9px 18px', background:'#F1F5F9', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                Annuler
              </button>
              <button onClick={() => setPayConfirm(true)}
                style={{ padding:'9px 22px', background:'#059669', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal marquer payé - étape 2 : confirmation finale */}
      {payModal && payConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'20px 24px 16px', background:'#F0FDF4', borderBottom:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy }}>✅ Confirmer le paiement</div>
              <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:4 }}>Cette action marque définitivement la fiche comme payée.</div>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:10, fontSize:13 }}>
              <div style={{ background:'#F8FAFC', borderRadius:10, padding:'14px 18px', border:'1px solid #E5E7EB' }}>
                <div style={{ fontSize:12, color:COULEURS.gris500, marginBottom:4 }}>Coach</div>
                <div style={{ fontWeight:700, fontSize:14, color:COULEURS.navy }}>{payModal.coachNom}</div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1, background:'#F0FDF4', borderRadius:10, padding:'12px 16px', border:'1px solid #BBF7D0' }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>Montant net</div>
                  <div style={{ fontWeight:800, fontSize:15, color:'#059669' }}>{Math.round(payModal.hon.montant_net).toLocaleString('fr-FR')} FCFA</div>
                </div>
                <div style={{ flex:1, background:'#EFF6FF', borderRadius:10, padding:'12px 16px', border:'1px solid #BFDBFE' }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>Mode</div>
                  <div style={{ fontWeight:800, fontSize:14, color:'#0369A1' }}>
                    {{ virement:'Virement', mobile_money:'Mobile Money', especes:'Espèces', cheque:'Chèque' }[payForm.mode_paiement]}
                  </div>
                </div>
              </div>
              {payForm.reference_paiement && (
                <div style={{ fontSize:12, color:COULEURS.gris500 }}>Référence : <strong>{payForm.reference_paiement}</strong></div>
              )}
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setPayConfirm(false)}
                style={{ padding:'9px 18px', background:'#F1F5F9', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                Retour
              </button>
              <button onClick={marquerPaye} disabled={actionEnCours}
                style={{ padding:'9px 22px', background:'#059669', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                {actionEnCours ? '⏳…' : '💵 Confirmer le paiement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ONGLET RH - CONTRATS DES COACHS (route /admin/rh/contrats) - remplace le contenu
// mock (MOCK_CONTRATS_PROFS, avec des champs fabriqués comme "salaire"/"fin de contrat"
// qui n'ont aucune donnée réelle derrière) par la vraie liste des coachs e-learning
// (utilisateurs.coach_info) + leur dernier bulletin d'honoraires réel.
const STATUT_HON_RH_DETAIL = {
  en_attente: { lib:'En attente',          bg:'#FEF3C7', c:'#B45309' },
  valide:     { lib:'Validé (à envoyer)',  bg:'#E0E7FF', c:'#4338CA' },
  transmis:   { lib:'Transmis → RH',       bg:'#DBEAFE', c:'#1D4ED8' },
  paye:       { lib:'Payé',                bg:'#D1FAE5', c:'#065F46' },
  litige:     { lib:'Litige',              bg:'#FEE2E2', c:'#991B1B' },
};

export function OngletRHContrats() {
  const [coaches, setCoaches] = useState([]);
  const [honoraires, setHonoraires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailCoach, setDetailCoach] = useState(null);
  const [detailTab, setDetailTab] = useState('infos');
  const [selectedHonId, setSelectedHonId] = useState(null);
  const [detailSeances, setDetailSeances] = useState([]);
  const [detailSeancesLoading, setDetailSeancesLoading] = useState(false);
  const [detailClasses, setDetailClasses] = useState([]);
  const [detailClassesLoading, setDetailClassesLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()),
      fetch(`${_API_URL_ADMIN}/api/elearning/honoraires`, { headers: _authHdrsAdmin() }).then(r => r.json()),
    ]).then(([dCoaches, dHon]) => {
      setCoaches(dCoaches.coaches || []);
      // La RH ne doit voir que les fiches formellement transmises (ou déjà payées) -
      // jamais celles encore en cours de revue par le PA (en_attente/valide/litige).
      setHonoraires((dHon.honoraires || []).filter(h => h.statut === 'transmis' || h.statut === 'paye'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedHonId) { setDetailSeances([]); return; }
    setDetailSeancesLoading(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${selectedHonId}/seances`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setDetailSeances(d.seances || []))
      .catch(() => setDetailSeances([])).finally(() => setDetailSeancesLoading(false));
  }, [selectedHonId]); // eslint-disable-line

  useEffect(() => {
    if (!detailCoach) { setDetailClasses([]); return; }
    setDetailClassesLoading(true);
    fetch(`${_API_URL_ADMIN}/api/classes-elearning?coach_id=${detailCoach.id}`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setDetailClasses(d.classes || []))
      .catch(() => setDetailClasses([])).finally(() => setDetailClassesLoading(false));
  }, [detailCoach?.id]); // eslint-disable-line

  const dernierBulletinParCoach = {};
  honoraires.forEach(h => {
    const cur = dernierBulletinParCoach[h.coach_id];
    if (!cur || h.annee > cur.annee || (h.annee === cur.annee && h.mois > cur.mois)) {
      dernierBulletinParCoach[h.coach_id] = h;
    }
  });

  return (
    <div>
      <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy, marginBottom:20 }}>📝 Coachs e-learning</div>
      <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:-8, marginBottom:20 }}>
        Type de contrat et dernier bulletin d'honoraires réel - pas de suivi de fin de contrat ni de congés pour l'instant (voir onglet Congés).
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400 }}>⏳ Chargement…</div>
      ) : coaches.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', border:'2px dashed #E5E7EB', borderRadius:14, color:COULEURS.gris400 }}>Aucun coach e-learning actif.</div>
      ) : (
        <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:`1px solid ${COULEURS.gris200}` }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1.3fr 1fr', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            <span>Coach</span><span>Type contrat</span><span>Début BET</span><span>Dernier bulletin</span><span>Statut</span>
          </div>
          {coaches.map(c => {
            const info = c.coach_info || {};
            const dernier = dernierBulletinParCoach[c.id];
            return (
              <div key={c.id} onClick={() => { setDetailCoach(c); setDetailTab('infos'); setSelectedHonId(dernierBulletinParCoach[c.id]?.id || null); }}
                style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1.3fr 1fr', padding:'14px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center', cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt={`${c.prenom} ${c.nom}`} style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                  ) : (
                    <div style={{ width:32, height:32, borderRadius:'50%', background:'#0D9488', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>
                      {`${c.prenom?.[0]||''}${c.nom?.[0]||''}`.toUpperCase() || 'CO'}
                    </div>
                  )}
                  <div style={{ fontWeight:700, color:COULEURS.navy }}>{c.prenom} {c.nom}</div>
                </div>
                <span style={{ padding:'3px 8px', borderRadius:10, background:'#EDE9FE', color:'#6D28D9', fontSize:11, fontWeight:700, width:'fit-content' }}>{info.type_contrat || '-'}</span>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>{info.date_debut_bet ? new Date(info.date_debut_bet).toLocaleDateString('fr-FR') : '-'}</span>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>
                  {dernier ? `${Math.round(dernier.montant_net).toLocaleString('fr-FR')} FCFA - ${['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'][dernier.mois]} ${dernier.annee}` : 'Aucun'}
                </span>
                <span style={{ padding:'3px 10px', borderRadius:20, background:c.actif?'#D1FAE5':'#FEE2E2', color:c.actif?'#065F46':'#991B1B', fontSize:11, fontWeight:700, width:'fit-content' }}>{c.actif ? 'Actif' : 'Inactif'}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal détail coach - entièrement en lecture seule (aucune action possible) */}
      {detailCoach && (() => {
        const info = detailCoach.coach_info || {};
        const histo = honoraires.filter(h => h.coach_id === detailCoach.id)
          .sort((a,b) => b.annee - a.annee || b.mois - a.mois);
        const MOIS_L = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
        const TABS = [
          { id:'infos',      lib:'👤 Infos' },
          { id:'honoraires', lib:'💰 Honoraires' },
          { id:'classes',    lib:'🎓 Classes' },
        ];
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
            onClick={e => { if (e.target === e.currentTarget) setDetailCoach(null); }}>
            <div style={{ background:'#fff', borderRadius:16, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)' }}>
              <div style={{ padding:'20px 24px', borderBottom:'1px solid #E5E7EB', background:'#F0FDFA', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  {detailCoach.avatar_url ? (
                    <img src={detailCoach.avatar_url} alt={`${detailCoach.prenom} ${detailCoach.nom}`} style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover' }} />
                  ) : (
                    <div style={{ width:52, height:52, borderRadius:'50%', background:'#0D9488', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#fff' }}>
                      {`${detailCoach.prenom?.[0]||''}${detailCoach.nom?.[0]||''}`.toUpperCase() || 'CO'}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight:800, fontSize:16, color:COULEURS.navy }}>{detailCoach.prenom} {detailCoach.nom}</div>
                    <div style={{ fontSize:12, color:COULEURS.gris500 }}>{detailCoach.email}</div>
                  </div>
                </div>
                <button onClick={() => setDetailCoach(null)}
                  style={{ width:30, height:30, borderRadius:'50%', border:'none', background:'#E2E8F0', cursor:'pointer', fontSize:16 }}>×</button>
              </div>

              {/* Onglets */}
              <div style={{ display:'flex', gap:4, padding:'0 24px', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setDetailTab(t.id)}
                    style={{ padding:'12px 16px', border:'none', borderBottom:`2.5px solid ${detailTab===t.id?'#0D9488':'transparent'}`, background:'none', color:detailTab===t.id?'#0D9488':COULEURS.gris500, fontSize:13, fontWeight:detailTab===t.id?800:600, cursor:'pointer' }}>
                    {t.lib}
                  </button>
                ))}
              </div>

              <div style={{ padding:24, overflowY:'auto', flex:1 }}>
                {/* ── Onglet Infos ── */}
                {detailTab === 'infos' && (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
                      {[
                        { l:'Type contrat',  v: info.type_contrat || '-' },
                        { l:'Début BET',     v: info.date_debut_bet ? new Date(info.date_debut_bet).toLocaleDateString('fr-FR') : '-' },
                        { l:'Lieu',          v: info.lieu_habitation || '-' },
                        { l:'Niveaux enseignés', v: (info.niveaux_enseignes||[]).join(', ') || '-' },
                        { l:'Statut compte', v: detailCoach.actif ? 'Actif' : 'Inactif' },
                        { l:'Rôle',          v: detailCoach.type_coach || detailCoach.role || '-' },
                      ].map(k => (
                        <div key={k.l} style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 14px', border:'1px solid #E5E7EB' }}>
                          <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>{k.l}</div>
                          <div style={{ fontWeight:700, fontSize:13, color:COULEURS.navy }}>{k.v}</div>
                        </div>
                      ))}
                    </div>
                    {(info.certifications||[]).length > 0 && (
                      <div style={{ marginBottom:20 }}>
                        <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:6, textTransform:'uppercase', fontWeight:700 }}>Certifications</div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          {info.certifications.map(cert => (
                            <span key={cert} style={{ padding:'3px 10px', borderRadius:20, background:'#EDE9FE', color:'#6D28D9', fontSize:11, fontWeight:700 }}>{cert}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── Onglet Honoraires ── */}
                {detailTab === 'honoraires' && (
                  histo.length === 0 ? (
                    <div style={{ textAlign:'center', padding:20, color:COULEURS.gris400, fontSize:12, background:'#F8FAFC', borderRadius:10 }}>Aucune fiche d'honoraires transmise pour ce coach.</div>
                  ) : (() => {
                    const honSelectionne = histo.find(h => h.id === selectedHonId) || histo[0];
                    return (
                      <>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
                          {histo.map(h => (
                            <button key={h.id} onClick={() => setSelectedHonId(h.id)}
                              style={{ padding:'5px 11px', borderRadius:20, border:`1.5px solid ${h.id===honSelectionne?.id?'#0D9488':'#E5E7EB'}`, background:h.id===honSelectionne?.id?'#F0FDFA':'#fff', color:h.id===honSelectionne?.id?'#0D9488':COULEURS.gris600, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                              {MOIS_L[h.mois]} {h.annee}
                            </button>
                          ))}
                        </div>

                        {honSelectionne && (() => {
                          const st = STATUT_HON_RH_DETAIL[honSelectionne.statut] || STATUT_HON_RH_DETAIL.en_attente;
                          return (
                            <>
                              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                                <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:st.bg, color:st.c }}>{st.lib}</span>
                                {honSelectionne.note_pa && <span style={{ fontSize:11, color:COULEURS.gris500 }}>Note du PA : {honSelectionne.note_pa}</span>}
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
                                {[
                                  { l:'Séances',      v: honSelectionne.nb_seances||0,                                      c:'#0EA5E9' },
                                  { l:'Heures',       v: `${(honSelectionne.nb_heures||0).toFixed(1)}h`,                    c:'#8B5CF6' },
                                  { l:'Tarif/h',      v: `${Math.round(honSelectionne.tarif_horaire).toLocaleString('fr-FR')} FCFA`, c:'#6366F1' },
                                  { l:'Montant brut', v: `${Math.round(honSelectionne.montant_brut).toLocaleString('fr-FR')} FCFA`, c:COULEURS.navy },
                                  { l:'Retenues',     v: honSelectionne.retenues ? `${Math.round(honSelectionne.retenues).toLocaleString('fr-FR')} FCFA` : 'Aucune', c:'#DC2626' },
                                  { l:'Montant net',  v: `${Math.round(honSelectionne.montant_net).toLocaleString('fr-FR')} FCFA`, c:'#059669' },
                                ].map(k => (
                                  <div key={k.l} style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 12px', border:'1px solid #E5E7EB' }}>
                                    <div style={{ fontSize:10, color:COULEURS.gris500, marginBottom:2 }}>{k.l}</div>
                                    <div style={{ fontWeight:800, fontSize:13, color:k.c }}>{k.v}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:8, textTransform:'uppercase', fontWeight:700 }}>Séances réalisées</div>
                              {detailSeancesLoading ? (
                                <div style={{ textAlign:'center', padding:16, color:COULEURS.gris400, fontSize:12 }}>⏳ Chargement…</div>
                              ) : detailSeances.length === 0 ? (
                                <div style={{ textAlign:'center', padding:16, color:COULEURS.gris400, fontSize:12, background:'#F8FAFC', borderRadius:10 }}>Aucune séance associée.</div>
                              ) : (
                                <div style={{ border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden' }}>
                                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                                    <thead>
                                      <tr style={{ background:'#F8FAFC' }}>
                                        {['Date','Groupe','Créneau','Durée','Apprenants','Montant','Statut'].map(col => (
                                          <th key={col} style={{ padding:'7px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB' }}>{col}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detailSeances.map((s,i) => (
                                        <tr key={s.id} style={{ borderBottom:'1px solid #F1F5F9', background: s.honoraire_statut_pa==='rejete' ? '#FEF2F2' : (i%2===0?'#fff':'#FAFAFA') }}>
                                          <td style={{ padding:'7px 12px' }}>{s.date ? new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '-'}</td>
                                          <td style={{ padding:'7px 12px', fontWeight:600, color:COULEURS.navy }}>{s.classe_nom}</td>
                                          <td style={{ padding:'7px 12px', color:COULEURS.gris600 }}>{s.heure_debut?.slice(0,5)}–{s.heure_fin?.slice(0,5)}</td>
                                          <td style={{ padding:'7px 12px', color:COULEURS.gris600 }}>{s.duree_heures.toFixed(2)}h</td>
                                          <td style={{ padding:'7px 12px', color:COULEURS.gris600 }}>{s.nb_presents||0}</td>
                                          <td style={{ padding:'7px 12px', fontWeight:700, color: s.honoraire_statut_pa==='rejete' ? COULEURS.gris400 : '#059669', textDecoration: s.honoraire_statut_pa==='rejete' ? 'line-through' : 'none' }}>{Math.round(s.montant).toLocaleString('fr-FR')} FCFA</td>
                                          <td style={{ padding:'7px 12px' }}>
                                            <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background: s.honoraire_statut_pa==='rejete'?'#FEE2E2':s.honoraire_statut_pa==='valide'?'#DBEAFE':'#FEF3C7', color: s.honoraire_statut_pa==='rejete'?'#991B1B':s.honoraire_statut_pa==='valide'?'#1D4ED8':'#B45309' }}>
                                              {s.honoraire_statut_pa==='rejete'?'Rejetée':s.honoraire_statut_pa==='valide'?'Validée':'En attente'}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    );
                  })()
                )}

                {/* ── Onglet Classes ── */}
                {detailTab === 'classes' && (
                  detailClassesLoading ? (
                    <div style={{ textAlign:'center', padding:20, color:COULEURS.gris400, fontSize:12 }}>⏳ Chargement…</div>
                  ) : detailClasses.length === 0 ? (
                    <div style={{ textAlign:'center', padding:20, color:COULEURS.gris400, fontSize:12, background:'#F8FAFC', borderRadius:10 }}>Aucune classe assignée à ce coach.</div>
                  ) : (
                    <div style={{ border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'#F8FAFC' }}>
                            {['Classe','Niveau','Apprenants','Statut'].map(col => (
                              <th key={col} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB' }}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detailClasses.map((cl,i) => (
                            <tr key={cl.id} style={{ borderBottom:'1px solid #F1F5F9', background:i%2===0?'#fff':'#FAFAFA' }}>
                              <td style={{ padding:'8px 12px', fontWeight:700, color:COULEURS.navy }}>{cl.nom}</td>
                              <td style={{ padding:'8px 12px', color:COULEURS.gris600 }}>{cl.niveau || '-'}</td>
                              <td style={{ padding:'8px 12px', color:COULEURS.gris600 }}>{cl.nb_apprenants||0}</td>
                              <td style={{ padding:'8px 12px' }}>
                                <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background: cl.statut==='cloture'?'#F1F5F9':'#D1FAE5', color: cl.statut==='cloture'?'#64748B':'#065F46' }}>
                                  {cl.statut==='cloture' ? 'Clôturée' : 'Active'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ONGLET RH - CONGÉS & ABSENCES (route /admin/rh/conges) - l'ancienne version était
// 100% mock (MOCK_CONGES) sans aucune table/workflow réel derrière (pas de demandes de
// congé, pas de validation). Plutôt que d'inventer des données factices, on affiche un
// état honnête : la fonctionnalité n'existe pas encore côté produit.
export function OngletRHConges() {
  return (
    <div>
      <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy, marginBottom:20 }}>📅 Congés & absences des coachs</div>
      <div style={{ textAlign:'center', padding:'56px 20px', border:'2px dashed #E5E7EB', borderRadius:14, color:COULEURS.gris400, marginTop:16 }}>
        <div style={{ fontSize:44, marginBottom:12 }}>🚧</div>
        <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6, fontSize:15 }}>Gestion des congés pas encore disponible</div>
        <div style={{ fontSize:12, maxWidth:420, margin:'0 auto' }}>
          Il n'existe pas encore de suivi des congés/absences des coachs (demande, validation, remplaçant). Les absences ponctuelles se gèrent aujourd'hui via l'onglet <strong>Remplacements</strong>.
        </div>
      </div>
    </div>
  );
}

// Résumé "Vue d'ensemble" RH/Paie - remplace les 4 KPI mock (MOCK_CONTRATS_PROFS/
// MOCK_BULLETINS_PAIE) par un vrai résumé du mois courant des honoraires e-learning.
export function OngletRHPaieApercu() {
  const now = new Date();
  const [kpis, setKpis] = useState({ coachsActifs:null, aPayer:0, montantAPayer:0, dejaPayes:0 });
  useEffect(() => {
    let annule = false;
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => null),
      fetch(`${_API_URL_ADMIN}/api/elearning/honoraires?mois=${now.getMonth()+1}&annee=${now.getFullYear()}`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => null),
    ]).then(([dCoaches, dHon]) => {
      if (annule) return;
      const hons = dHon?.honoraires || [];
      setKpis({
        coachsActifs:   (dCoaches?.coaches || []).length,
        aPayer:         hons.filter(h => h.statut === 'transmis').length,
        montantAPayer:  hons.filter(h => h.statut === 'transmis').reduce((s,h) => s + (h.montant_net||0), 0),
        dejaPayes:      hons.filter(h => h.statut === 'paye').length,
      });
    });
    return () => { annule = true; };
  }, []); // eslint-disable-line

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14, marginBottom:28 }}>
      {[
        { l:'Coachs e-learning actifs', v:kpis.coachsActifs ?? '-',                                  c:'#059669', i:'👥' },
        { l:'Bulletins à payer',        v:kpis.aPayer,                                                c:'#F59E0B', i:'⏳' },
        { l:'Net à virer ce mois',      v:kpis.montantAPayer.toLocaleString('fr-FR')+' FCFA',         c:'#7C3AED', i:'🏦' },
        { l:'Déjà payés ce mois',       v:kpis.dejaPayes,                                              c:'#0891B2', i:'✅' },
      ].map(k => (
        <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'18px 20px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:26, marginBottom:6 }}>{k.i}</div>
          <div style={{ fontSize:22, fontWeight:800, color:k.c }}>{k.v}</div>
          <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:4 }}>{k.l}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   MES TÂCHES & GRILLE TARIFAIRE — portés depuis dash (RHPaieDashboard.jsx)

   LES HONORAIRES SONT SÉPARÉS PAR PLATEFORME, LA GRILLE NE L'EST PAS. C'est volontaire des
   deux côtés, et il faut comprendre pourquoi :

     · les montants dus vivent dans deux tables jumelles — `honoraires_mois` pour dash,
       `honoraires_elearning_mois` ici — parce qu'ils se calculent sur des séances distinctes.
       Les mélanger ferait apparaître dans un bulletin des heures faites sur l'autre
       plateforme.
     · le BARÈME, lui, est unique : une ligne de la table `parametres`, clé
       `grille_tarifaire`. Un coach de catégorie B est payé au même tarif horaire quelle que
       soit la plateforme — avoir deux barèmes aurait été une source d'écart inexplicable sur
       une fiche de paie.

   D'où une seule route pour la grille (`GET /api/seances/grille-tarifaire`, sans notion de
   plateforme) et deux pour les honoraires. L'écran ci-dessous le dit explicitement, pour que
   personne ne cherche une « grille e-learning » qui n'existe pas.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * MES TÂCHES — ce qui attend le service RH.
 *
 * Les deux compteurs portent sur les honoraires e-learning : ceux en attente de validation,
 * et ceux validés mais pas encore transmis au paiement. C'est la file réelle du métier —
 * dash compte exactement ces deux-là sur sa propre table.
 */
export function OngletRHPaieMesTaches() {
  const { couleurTheme } = useTheme();
  const [honoraires, setHonoraires] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires`, { headers: _authHdrsAdmin() });
        const d = await r.json().catch(() => ({}));
        if (vivant) setHonoraires(Array.isArray(d.honoraires) ? d.honoraires : []);
      } catch { if (vivant) setHonoraires([]); }
    })();
    return () => { vivant = false; };
  }, []);

  const chargement = honoraires === null;
  const l = honoraires || [];
  const aValider  = l.filter(h => !h.statut || h.statut === 'brouillon' || h.statut === 'en_attente').length;
  const aTransmettre = l.filter(h => h.statut === 'valide').length;

  const taches = [
    { icone: '🧾', label: 'Honoraires en attente de validation', n: aValider,     vers: '/admin/rh/paie' },
    { icone: '📤', label: 'Honoraires validés à transmettre',    n: aTransmettre, vers: '/admin/rh/paie' },
  ];
  const ouvertes = taches.filter(t => t.n > 0);
  const total = taches.reduce((s, t) => s + t.n, 0);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>✅ Mes tâches</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          {chargement ? 'Calcul en cours…'
            : total > 0 ? `${total} élément${total > 1 ? 's' : ''} à traiter au total.`
            : 'Rien à traiter pour le moment — tout est à jour.'}
        </p>
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : ouvertes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 46, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>Aucune tâche en attente</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 5, maxWidth: 420, margin: '5px auto 0', lineHeight: 1.6 }}>
            {l.length === 0
              ? "Aucun honoraire e-learning n'a encore été calculé. Les honoraires des cours dash se traitent depuis dash."
              : `Les ${l.length} fiches d'honoraires sont traitées.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {ouvertes.map(t => (
            <a key={t.label} href={t.vers}
              style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                background: COULEURS.blanc, border: `1.5px solid ${COULEURS.gris200}`,
                borderLeft: `4px solid ${couleurTheme}`, borderRadius: 12, padding: '15px 18px' }}>
              <span style={{ fontSize: 22 }}>{t.icone}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: COULEURS.navy }}>{t.label}</span>
              <span style={{ background: couleurTheme + '18', color: couleurTheme, borderRadius: 20,
                padding: '4px 12px', fontSize: 13, fontWeight: 800 }}>{t.n}</span>
              <span style={{ color: COULEURS.gris400, fontSize: 16 }}>›</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * GRILLE TARIFAIRE — le barème horaire par catégorie de coach.
 *
 * EN LECTURE SEULE ICI, et c'est un choix. La grille est définie par le PA Advisor sur dash
 * (`parametres.grille_tarifaire`) ; l'exposer en écriture des deux côtés créerait deux chemins
 * pour modifier un barème unique, sans aucun moyen de savoir lequel a servi en dernier. Le RH
 * a besoin de LIRE le tarif appliqué pour vérifier un bulletin — c'est ce que fait cet écran.
 */
export function OngletRHGrilleTarifaire() {
  const { couleurTheme } = useTheme();
  const [grille, setGrille] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${_API_URL_ADMIN}/api/seances/grille-tarifaire`, { headers: _authHdrsAdmin() });
        const d = await r.json().catch(() => ({}));
        if (vivant) setGrille(d.grille && typeof d.grille === 'object' ? d.grille : {});
      } catch { if (vivant) setGrille({}); }
    })();
    return () => { vivant = false; };
  }, []);

  const fmt = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;

  /* LA GRILLE EST IMBRIQUÉE, PAS PLATE. Sa forme réelle en base est
     `{ tarifs: { CDD: { domicile, en_ligne, presentiel }, … }, multiplicateurs: { "A1-A2": 1, … } }`.
     Ma première version itérait les clés du premier niveau et affichait donc une seule ligne
     « tarifs » contenant du JSON brut. On rend ici les deux sections telles qu'elles sont :
     un tarif horaire par contrat et par canal, puis les coefficients de niveau. */
  const tarifs = (grille && typeof grille.tarifs === 'object') ? grille.tarifs : {};
  const multiplicateurs = (grille && typeof grille.multiplicateurs === 'object') ? grille.multiplicateurs : {};
  /* Les canaux sont déduits des données, pas codés en dur : un canal ajouté par le PA
     apparaît sans redéploiement, au lieu d'être silencieusement absent du tableau. */
  const canaux = [...new Set(Object.values(tarifs).flatMap(v => Object.keys(v || {})))];
  const LIB_CANAL = { en_ligne: 'En ligne', presentiel: 'Présentiel', domicile: 'À domicile' };
  const vide = Object.keys(tarifs).length === 0 && Object.keys(multiplicateurs).length === 0;

  const th = { padding: '10px 14px', fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', textAlign: 'left', fontWeight: 700 };
  const td = { padding: '12px 14px', fontSize: 13.5, color: COULEURS.gris900 };
  const tdNum = { ...td, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>💰 Grille tarifaire</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          Barème horaire appliqué au calcul des honoraires
        </p>
      </div>

      <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 12,
        padding: '13px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
        <p style={{ margin: 0, fontSize: 12.5, color: '#3730A3', lineHeight: 1.65 }}>
          <strong>Une seule grille pour les deux plateformes.</strong> Un coach est payé au même
          tarif horaire qu'il enseigne sur dash ou sur BET E-Learning — seuls les montants dus
          sont calculés séparément, sur les séances de chaque plateforme. La grille est définie
          par le PA Advisor depuis dash ; elle est en lecture seule ici, pour qu'il n'existe pas
          deux chemins pour modifier un même barème.
        </p>
      </div>

      {grille === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : vide ? (
        <div style={{ textAlign: 'center', padding: 44, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400, fontSize: 13 }}>
          Aucune grille tarifaire n'est définie. Le PA Advisor la renseigne depuis dash.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {Object.keys(tarifs).length > 0 && (
            <div>
              <h3 style={{ fontSize: 13.5, fontWeight: 800, color: COULEURS.navy, margin: '0 0 10px' }}>
                Tarif horaire par type de contrat
              </h3>
              <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden', background: COULEURS.blanc }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                    <thead>
                      <tr style={{ background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
                        <th style={th}>Contrat</th>
                        {canaux.map(c => (
                          <th key={c} style={{ ...th, textAlign: 'right' }}>{LIB_CANAL[c] || c.replace(/_/g, ' ')}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(tarifs).map(([contrat, parCanal]) => (
                        <tr key={contrat} style={{ borderBottom: `1px solid ${COULEURS.gris100}` }}>
                          <td style={{ ...td, fontWeight: 700 }}>{contrat}</td>
                          {canaux.map(c => (
                            <td key={c} style={{ ...tdNum, color: (parCanal || {})[c] != null ? couleurTheme : COULEURS.gris200 }}>
                              {(parCanal || {})[c] != null ? fmt(parCanal[c]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {Object.keys(multiplicateurs).length > 0 && (
            <div>
              <h3 style={{ fontSize: 13.5, fontWeight: 800, color: COULEURS.navy, margin: '0 0 6px' }}>
                Coefficients par niveau
              </h3>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: COULEURS.gris400 }}>
                Le tarif horaire est multiplié par ce coefficient selon le niveau enseigné.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(multiplicateurs).map(([niveau, coef]) => (
                  <div key={niveau} style={{ background: COULEURS.blanc, border: `1.5px solid ${COULEURS.gris200}`,
                    borderRadius: 12, padding: '13px 20px', minWidth: 118 }}>
                    <div style={{ fontSize: 11, color: COULEURS.gris400, fontWeight: 700, textTransform: 'uppercase' }}>{niveau}</div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: couleurTheme, marginTop: 4,
                      fontVariantNumeric: 'tabular-nums' }}>× {coef}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
