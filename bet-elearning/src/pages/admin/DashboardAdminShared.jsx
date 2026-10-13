// DashboardAdminShared.jsx - composants réellement partagés entre plusieurs profils
// admin_* de DashboardAdmin.jsx (extraits pour éviter la duplication).
import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import * as XLSX_ADMIN from 'xlsx';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAlerte, useConfirm, usePrompt } from '../../contexts/ConfirmContext';
import { BadgeStatutVersement, VignettesPreuves, estVerse } from '../../components/shared/PreuvesPaiement';
import { COULEURS } from '../../constants/couleurs';
import PastilleGroupe from '../../components/shared/PastilleGroupe';
import PhotoClasseEntete from '../../components/shared/PhotoClasseEntete';
import { genererPDF, fmtDatePDF, exporterExcelStyle } from '../../utils/genererPDF';
import { chargerPackages } from '../../constants/packagesCommerciaux';
import { genererRecuVersement } from '../../utils/recuVersement';
import { ModalSoumissionParcours, ModalRenouvellementContrat, STATUT_CONTRAT_LIB } from './GestionEntreprises';

import { fetchUpload } from "../../utils/fetchUpload";
import { estRole } from '../../constants/roles';
const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}`, 'X-Plateforme': 'bet-elearning' });

const PAR_PAGE_ENT = 15;
const STATUT_ENT = {
  actif:          { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  expire_bientot: { bg: '#FEF3C7', txt: '#92400E', lib: 'Expire bientôt' },
  prospect:       { bg: '#EDE9FE', txt: '#5B21B6', lib: 'Prospect' },
  suspendu:       { bg: '#FEE2E2', txt: '#991B1B', lib: 'Suspendu' },
  en_attente:     { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente de validation' },
  refuse:         { bg: '#FEE2E2', txt: '#991B1B', lib: 'Refusé' },
};
const STATUT_BEN = {
  actif:               { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  certifie:            { bg: '#EDE9FE', txt: '#5B21B6', lib: 'Certifié' },
  en_attente:          { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente' },
  test_niveau_pending: { bg: '#FEF3C7', txt: '#92400E', lib: 'Test en cours' },
  suspendu:            { bg: '#FEE2E2', txt: '#991B1B', lib: 'Suspendu' },
};
const NIV_COULEUR = {
  A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316',
};
function genererMdp() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const specials = '!@#$%';
  let mdp = '';
  for (let i = 0; i < 7; i++) mdp += chars[Math.floor(Math.random() * chars.length)];
  mdp += specials[Math.floor(Math.random() * specials.length)];
  return mdp;
}
function genererEmailApprenant(prenom, nom) {
  const p = prenom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  const n = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  return `${p}.${n}@betlearning.ci`;
}

// Partagé entre admin_superviseur et admin_pa_advisor (route "Remplacements")
export function OngletRemplacements() {
  const { profile } = useAuth();
  // Le flux "Remplacement définitif" sonde PATCH /api/coachs/:id/suspension (classes:update)
  // puis transfère chaque classe via PATCH /api/classes-elearning/:id/suspendre-coach
  // (classes:manage) - il faut les deux droits pour aller jusqu'au bout.
  const peutRemplacementDefinitif = profile?.permissions?.classes?.update === true && profile?.permissions?.classes?.manage === true;
  const STATUT_STYLE = {
    termine:    { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Terminé'    },
    en_cours:   { bg:'#DBEAFE', txt:'#1D4ED8', lib:'🔵 En cours'  },
    a_pourvoir: { bg:'#FEE2E2', txt:'#991B1B', lib:'🔴 À pourvoir' },
    refuse:     { bg:'#F3F4F6', txt:'#374151', lib:'❌ Refusé'     },
  };

  const [remplacements, setRemplacements] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modalOuvert,   setModalOuvert]   = useState(null);
  const [filtreDateDebut, setFiltreDateDebut] = useState('');
  const [filtreDateFin,   setFiltreDateFin]   = useState('');
  const [filtreStatut,    setFiltreStatut]    = useState('tous');
  const [filtreRecherche, setFiltreRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [modalManuelOuvert, setModalManuelOuvert] = useState(false);
  const [modalDefinitifOuvert, setModalDefinitifOuvert] = useState(false);
  const PAR_PAGE = 10;

  const charger = useCallback(() => {
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/remplacements?plateforme=bet-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setRemplacements(d.remplacements || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    charger();
    // La clôture d'une délégation peut se déclencher automatiquement côté serveur (dès que la
    // dernière séance couverte passe à "réalisée", voir traiterClotureSeanceRemplacement côté
    // Backend) pendant que cet onglet reste ouvert. Sans rafraîchissement périodique, le PA
    // continuait de voir "En cours" avec le bouton "Clôturer la délégation" bien après la
    // clôture réelle - donnant à tort l'impression qu'il fallait cliquer pour finaliser.
    const intervalId = setInterval(charger, 30000);
    return () => clearInterval(intervalId);
  }, [charger]);

  function surAssigne(remplacementMisAJour) {
    setRemplacements(prev => prev.map(r => r.id === remplacementMisAJour.id ? { ...r, ...remplacementMisAJour } : r));
  }
  const [delegationsEnCloture, setDelegationsEnCloture] = useState(new Set()); // empêche le double-clic clôturer délégation

  async function cloturerDelegation(remplacementId) {
    if (delegationsEnCloture.has(remplacementId)) return;
    setDelegationsEnCloture(prev => new Set(prev).add(remplacementId));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/remplacements/${remplacementId}`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ statut: 'termine' }),
      });
      if (r.ok) {
        charger();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Clôture refusée', { duration: 5000 });
      }
    } catch {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
    } finally {
      setDelegationsEnCloture(prev => { const n = new Set(prev); n.delete(remplacementId); return n; });
    }
  }

  const nbEnCours   = remplacements.filter(r => r.statut === 'en_cours').length;
  const nbAPourvoir = remplacements.filter(r => r.statut === 'a_pourvoir').length;

  const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) : '-';
  const fmtDateLongue = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : '-';

  // Export - respecte les filtres statut/date actuellement appliqués (pas seulement la page
  // affichée), pour produire un rapport complet plutôt qu'un simple export de la page visible.
  function exporterRemplacementsPDF() {
    const lignes = remplacementsFiltres.map(r => {
      const st = STATUT_STYLE[r.statut] || STATUT_STYLE.a_pourvoir;
      const badgeClasse = r.statut === 'termine' ? 'badge-green' : r.statut === 'en_cours' ? 'badge-blue' : r.statut === 'refuse' ? 'badge-red' : 'badge-orange';
      return `<tr>
        <td style="font-weight:700">${r.absent_nom || '-'}</td>
        <td>${r.remplacant_nom || '<em>Non assigné</em>'}</td>
        <td>${r.groupe_nom || '-'}</td>
        <td>${fmtDateLongue(r.date_debut)}</td>
        <td>${fmtDateLongue(r.date_fin)}</td>
        <td class="td-right">${r.nb_sessions ?? 0}</td>
        <td>${r.motif || '-'}</td>
        <td><span class="badge ${badgeClasse}">${st.lib}</span></td>
        <td>${r.statut === 'refuse' ? (r.motif_refus || '-') : '-'}</td>
        <td>${r.assigne_par_nom || r.refuse_par_nom || '-'}</td>
      </tr>`;
    }).join('');
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET E-Learning - PA Advisor</div><div class="doc-header-sub">British English Training · Continuité pédagogique</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}<br/>${remplacementsFiltres.length} remplacement${remplacementsFiltres.length>1?'s':''}</div></div>
      <div class="doc-title-band">🔄 RAPPORT DES REMPLACEMENTS</div>
      <div class="doc-body">
        <div class="section-title">Synthèse</div>
        <div class="kpi-row">
          <div class="kpi-card"><div class="kpi-val">${remplacementsFiltres.length}</div><div class="kpi-lbl">Total (filtre actif)</div></div>
          <div class="kpi-card" style="border-top-color:#EF4444"><div class="kpi-val" style="color:#EF4444">${remplacementsFiltres.filter(r=>r.statut==='a_pourvoir').length}</div><div class="kpi-lbl">À pourvoir</div></div>
          <div class="kpi-card" style="border-top-color:#2563EB"><div class="kpi-val" style="color:#2563EB">${remplacementsFiltres.filter(r=>r.statut==='en_cours').length}</div><div class="kpi-lbl">En cours</div></div>
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val" style="color:#059669">${remplacementsFiltres.filter(r=>r.statut==='termine').length}</div><div class="kpi-lbl">Terminés</div></div>
        </div>
        <div class="section-title">Détail</div>
        <table><thead><tr><th>Coach absent</th><th>Remplaçant</th><th>Groupe</th><th>Début</th><th>Fin</th><th>Séances</th><th>Motif absence</th><th>Statut</th><th>Motif refus</th><th>PA Advisor</th></tr></thead><tbody>${lignes || '<tr><td colspan="10" style="text-align:center;color:#94A3B8">Aucun remplacement sur cette sélection</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET E-Learning · Rapport des remplacements · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, 'Rapport des remplacements');
  }

  function exporterRemplacementsExcel() {
    exporterExcelStyle({
      nomFichier: `Remplacements_${new Date().toISOString().slice(0,10)}`,
      titre: '🔄 Rapport des remplacements - BET E-Learning',
      sousTitre: `Émis le ${fmtDateLongue(new Date().toISOString())} · ${remplacementsFiltres.length} remplacement${remplacementsFiltres.length>1?'s':''}`,
      couleurEntete: '7C3AED',
      colonnes: [
        { label: 'Coach absent', width: 22, bold: true }, { label: 'Remplaçant', width: 22 },
        { label: 'Groupe', width: 20 }, { label: 'Date début', width: 13 }, { label: 'Date fin', width: 13 },
        { label: 'Nb séances', width: 11, align: 'center' }, { label: 'Motif absence', width: 18 },
        { label: 'Message', width: 24 }, { label: 'Statut', width: 14 }, { label: 'Motif refus', width: 18 },
        { label: 'PA Advisor (assignation/refus)', width: 24 }, { label: 'Signalé le', width: 16 },
      ],
      lignes: remplacementsFiltres.map(r => [
        r.absent_nom || '', r.remplacant_nom || 'Non assigné', r.groupe_nom || '',
        r.date_debut || '', r.date_fin || '', r.nb_sessions ?? 0,
        r.motif || '', r.message || '',
        (STATUT_STYLE[r.statut] || STATUT_STYLE.a_pourvoir).lib.replace(/^[^\s]+\s/, ''),
        r.statut === 'refuse' ? (r.motif_refus || '') : '',
        r.assigne_par_nom || r.refuse_par_nom || '',
        r.created_at ? fmtDateLongue(r.created_at) : '',
      ]),
    });
  }

  // Filtrage par statut + date (sur date_debut) + pagination - la liste grossit avec le temps,
  // sans ça le PA se retrouve avec des dizaines de lignes non triables à parcourir.
  const qFiltre = filtreRecherche.trim().toLowerCase();
  const remplacementsFiltres = remplacements.filter(r => {
    if (filtreStatut !== 'tous' && r.statut !== filtreStatut) return false;
    if (filtreDateDebut && r.date_debut < filtreDateDebut) return false;
    if (filtreDateFin   && r.date_debut > filtreDateFin)   return false;
    if (qFiltre && !(
      (r.absent_nom||'').toLowerCase().includes(qFiltre) ||
      (r.remplacant_nom||'').toLowerCase().includes(qFiltre) ||
      (r.groupe_nom||'').toLowerCase().includes(qFiltre)
    )) return false;
    return true;
  });
  const filtreActif = filtreStatut !== 'tous' || !!filtreDateDebut || !!filtreDateFin || !!filtreRecherche;
  const nbPages     = Math.max(1, Math.ceil(remplacementsFiltres.length / PAR_PAGE));
  const pageSafe    = Math.min(page, nbPages);
  const remplacementsPage = remplacementsFiltres.slice((pageSafe-1)*PAR_PAGE, pageSafe*PAR_PAGE);

  return (
    <>
      {/* Bandeau */}
      <div style={{ background:'linear-gradient(135deg,#5B21B6,#7C3AED)', borderRadius:14, padding:'18px 24px', marginBottom:24, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:3 }}>🔄 Gestion des remplacements</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>Clôture automatique dès que toutes les séances assignées sont réalisées</div>
        </div>
        <div style={{ display:'flex', gap:16, alignItems:'center' }}>
          {[{ l:'En cours', v:nbEnCours, c:'#C4B5FD' },{ l:'À pourvoir', v:nbAPourvoir, c:'#FCA5A5' }].map(k => (
            <div key={k.l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', textTransform:'uppercase' }}>{k.l}</div>
            </div>
          ))}
          <button onClick={() => setModalManuelOuvert(true)}
            style={{ background:'rgba(255,255,255,0.18)', border:'1.5px solid rgba(255,255,255,0.4)', borderRadius:10, color:'#fff', fontWeight:700, fontSize:13, padding:'9px 18px', cursor:'pointer', whiteSpace:'nowrap', backdropFilter:'blur(4px)' }}>
            ➕ Remplacement manuel
          </button>
          <button onClick={() => peutRemplacementDefinitif && setModalDefinitifOuvert(true)}
            disabled={!peutRemplacementDefinitif}
            title={peutRemplacementDefinitif ? "Remplacement définitif" : "Vous n'avez pas la permission pour cette action"}
            style={{ background:'rgba(220,38,38,0.25)', border:'1.5px solid rgba(252,165,165,0.6)', borderRadius:10, color:'#fff', fontWeight:700, fontSize:13, padding:'9px 18px', cursor: peutRemplacementDefinitif ? 'pointer' : 'not-allowed', whiteSpace:'nowrap', backdropFilter:'blur(4px)', opacity: peutRemplacementDefinitif ? 1 : 0.5 }}>
            🔒 Remplacement définitif
          </button>
        </div>
      </div>

      {modalManuelOuvert && (
        <ModalRemplacementManuel
          onFermer={() => setModalManuelOuvert(false)}
          onCree={(nouveau) => setRemplacements(prev => [nouveau, ...prev])}
        />
      )}

      {modalDefinitifOuvert && (
        <ModalRemplacementDefinitifGlobal onFermer={() => setModalDefinitifOuvert(false)} />
      )}

      {/* Alerte non assignés */}
      {nbAPourvoir > 0 && (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderLeft:'4px solid #EF4444', borderRadius:10, padding:'12px 16px', marginBottom:20, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>🚨</span>
          <div style={{ fontSize:13, color:'#991B1B', fontWeight:600 }}>
            {nbAPourvoir} remplacement{nbAPourvoir>1?'s':''} sans remplaçant assigné - cliquez sur la ligne pour assigner
          </div>
        </div>
      )}

      {/* Filtres statut + date */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
        {[
          { id:'tous',       lib:'Tous' },
          { id:'a_pourvoir', lib:'🔴 À pourvoir' },
          { id:'en_cours',   lib:'🔵 En cours' },
          { id:'termine',    lib:'✅ Terminé' },
          { id:'refuse',     lib:'❌ Refusé' },
        ].map(o => (
          <button key={o.id} onClick={() => { setFiltreStatut(o.id); setPage(1); }}
            style={{
              padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border:`1.5px solid ${filtreStatut===o.id?'#7C3AED':COULEURS.gris200}`,
              background: filtreStatut===o.id?'#7C3AED':COULEURS.blanc,
              color: filtreStatut===o.id?'#fff':COULEURS.gris600,
              fontFamily:'inherit',
            }}>
            {o.lib}
          </button>
        ))}
        <span style={{ width:1, height:20, background:COULEURS.gris200, margin:'0 4px' }} />
        <span style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600 }}>📅 Début entre</span>
        <input type="date" value={filtreDateDebut} onChange={e => { setFiltreDateDebut(e.target.value); setPage(1); }}
          style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', color:COULEURS.navy }} />
        <span style={{ fontSize:12, color:COULEURS.gris400 }}>et</span>
        <input type="date" value={filtreDateFin} onChange={e => { setFiltreDateFin(e.target.value); setPage(1); }}
          style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', color:COULEURS.navy }} />
        <input value={filtreRecherche} onChange={e => { setFiltreRecherche(e.target.value); setPage(1); }}
          placeholder="🔎 Coach absent, remplaçant ou groupe…"
          style={{ padding:'6px 12px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', color:COULEURS.navy, minWidth:200 }} />
        {filtreActif && (
          <button onClick={() => { setFiltreStatut('tous'); setFiltreDateDebut(''); setFiltreDateFin(''); setFiltreRecherche(''); setPage(1); }}
            style={{ padding:'5px 11px', borderRadius:8, border:'1px solid #FECACA', background:'#FEF2F2', color:'#DC2626', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            ✕ Effacer
          </button>
        )}
        <span style={{ fontSize:12, color:COULEURS.gris400, marginLeft:'auto' }}>
          {remplacementsFiltres.length} remplacement{remplacementsFiltres.length>1?'s':''} · page {pageSafe}/{nbPages}
        </span>
      </div>

      {/* Export - respecte le filtre statut/date actif */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginBottom:14 }}>
        <button onClick={exporterRemplacementsPDF} disabled={remplacementsFiltres.length===0}
          style={{ background:'#D97706', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12.5, fontWeight:700, cursor: remplacementsFiltres.length===0?'not-allowed':'pointer', opacity: remplacementsFiltres.length===0?0.5:1, fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
          📥 PDF
        </button>
        <button onClick={exporterRemplacementsExcel} disabled={remplacementsFiltres.length===0}
          style={{ background:'#217346', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12.5, fontWeight:700, cursor: remplacementsFiltres.length===0?'not-allowed':'pointer', opacity: remplacementsFiltres.length===0?0.5:1, fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
          📊 Excel
        </button>
      </div>

      {/* Tableau cliquable */}
      <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:`1px solid ${COULEURS.gris200}` }}>
        <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1.4fr 1.8fr 1fr 1fr 1fr 1fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
          <span>Coach absent</span><span>Remplaçant</span><span>Groupe</span><span>Début</span><span>Fin</span><span>Séances</span><span>Statut</span>
        </div>
        {loading ? (
          <div style={{ padding:24, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Chargement…</div>
        ) : remplacementsFiltres.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>
            {filtreActif ? 'Aucun remplacement sur cette période.' : 'Aucun remplacement signalé pour l\'instant.'}
          </div>
        ) : (
          remplacementsPage.map((r, idx) => {
            const st = STATUT_STYLE[r.statut] || STATUT_STYLE.a_pourvoir;
            return (
              <div
                key={r.id}
                onClick={() => setModalOuvert(r)}
                style={{
                  display:'grid', gridTemplateColumns:'1.6fr 1.4fr 1.8fr 1fr 1fr 1fr 1fr',
                  padding:'14px 20px',
                  borderBottom: idx < remplacementsPage.length-1 ? `1px solid ${COULEURS.gris100}` : 'none',
                  fontSize:13, alignItems:'center',
                  background: r.statut==='a_pourvoir' ? '#FFF5F5' : COULEURS.blanc,
                  cursor:'pointer', transition:'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = r.statut==='a_pourvoir' ? '#FEE2E2' : COULEURS.gris50}
                onMouseLeave={e => e.currentTarget.style.background = r.statut==='a_pourvoir' ? '#FFF5F5' : COULEURS.blanc}
              >
                <div>
                  <div style={{ fontWeight:700, color:COULEURS.navy, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {r.absent_nom}
                    {r.urgent && (
                      <span style={{ fontSize:10, fontWeight:800, background:'#FEE2E2', color:'#DC2626', padding:'1px 7px', borderRadius:8 }}>🚨 Urgent</span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:COULEURS.attention, marginTop:2 }}>{r.motif}</div>
                  {r.message && <div style={{ fontSize:10, color:'#64748B', fontStyle:'italic', marginTop:1 }}>"{r.message}"</div>}
                </div>
                {r.remplacant_nom
                  ? <span style={{ fontWeight:600, color:'#5B21B6' }}>{r.remplacant_nom}</span>
                  : <span style={{ fontSize:11, color:'#EF4444', fontWeight:700, background:'#FEE2E2', padding:'3px 9px', borderRadius:20 }}>Non assigné</span>
                }
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>{r.groupe_nom || '-'}</span>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>{fmtDate(r.date_debut)}</span>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>{fmtDate(r.date_fin)}</span>
                <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>{r.nb_sessions}</span>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }} onClick={e => e.stopPropagation()}>
                  <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, background:st.bg, color:st.txt, width:'fit-content' }}>{st.lib}</span>
                  {(r.statut === 'en_cours') && r.remplacant_id && (
                    <button
                      onClick={() => cloturerDelegation(r.id)}
                      style={{ padding:'2px 8px', borderRadius:6, border:'1px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:9, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', width:'fit-content' }}
                    >
                      🔒 Clôturer
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {nbPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:6, marginTop:16 }}>
          <button onClick={() => setPage(1)} disabled={pageSafe===1}
            style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:pageSafe===1?COULEURS.gris100:COULEURS.blanc, color:pageSafe===1?COULEURS.gris400:COULEURS.navy, cursor:pageSafe===1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>«</button>
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={pageSafe===1}
            style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:pageSafe===1?COULEURS.gris100:COULEURS.blanc, color:pageSafe===1?COULEURS.gris400:COULEURS.navy, cursor:pageSafe===1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>‹</button>
          {Array.from({length:nbPages},(_,i)=>i+1).filter(i=>Math.abs(i-pageSafe)<=2).map(i=>(
            <button key={i} onClick={() => setPage(i)}
              style={{ padding:'5px 11px', borderRadius:7, border:`1px solid ${i===pageSafe?'#7C3AED':COULEURS.gris200}`, background:i===pageSafe?'#7C3AED':COULEURS.blanc, color:i===pageSafe?'#fff':COULEURS.navy, fontWeight:i===pageSafe?800:400, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>{i}</button>
          ))}
          <button onClick={() => setPage(p => Math.min(nbPages,p+1))} disabled={pageSafe===nbPages}
            style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:pageSafe===nbPages?COULEURS.gris100:COULEURS.blanc, color:pageSafe===nbPages?COULEURS.gris400:COULEURS.navy, cursor:pageSafe===nbPages?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>›</button>
          <button onClick={() => setPage(nbPages)} disabled={pageSafe===nbPages}
            style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:pageSafe===nbPages?COULEURS.gris100:COULEURS.blanc, color:pageSafe===nbPages?COULEURS.gris400:COULEURS.navy, cursor:pageSafe===nbPages?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>»</button>
        </div>
      )}

      {/* Modal */}
      {modalOuvert && (
        <ModalDetailRemplacement
          // Toujours préférer la version à jour dans la liste (rafraîchie périodiquement) à
          // l'instantané figé au moment de l'ouverture - sinon la modale reste bloquée sur
          // "En cours" même après une clôture automatique survenue pendant qu'elle est ouverte.
          remplacement={remplacements.find(r => r.id === modalOuvert.id) || modalOuvert}
          onFermer={() => setModalOuvert(null)}
          onAssigner={surAssigne}
          onCloturer={cloturerDelegation}
        />
      )}
    </>
  );
}

// Partagé entre admin_onboarding, admin_elearning et admin_commercial (résidu) - route "Entreprises"
/* `lectureSeule` : la direction consulte le portefeuille entreprises sans le modifier — la
   création d'une entreprise relève du commercial et de l'onboarding. */
export function OngletEntreprises({ lectureSeule = false }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile } = useAuth();
  const alerte = useAlerte();
  const [modalEnt,      setModalEnt]      = useState(null);
  const [modalParcours, setModalParcours] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [recherche,     setRecherche]     = useState('');
  const [filtre,        setFiltre]        = useState('tous');
  const [page,          setPage]          = useState(1);
  const [entreprises,   setEntreprises]   = useState([]);
  const [beneficiaires, setBeneficiaires] = useState([]);
  const [chargement,    setChargement]    = useState(true);

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/liste`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => { setEntreprises(d.entreprises || []); setBeneficiaires(d.beneficiaires || []); })
      .catch(console.error)
      .finally(() => setChargement(false));
    const t = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (t) chargerPackages(t);
  }, []);

  // Soumission d'une nouvelle entreprise par l'assistante - même flux que côté BET admin :
  // l'entreprise part en statut "en_attente" et atterrit dans l'onglet "Entreprise Parcours"
  // de l'admin BET, avec tous les champs déjà remplis, pour validation.
  async function soumettreInscription(form) {
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/soumettre-parcours`, {
        method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la soumission', { duration: 5000 }); return; }
      setEntreprises(prev => [d.entreprise, ...prev]);
      setModalParcours(false);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  const COLS = '2.5fr 1.5fr 1.5fr 1fr 1fr 1fr 100px';

  const toutes = entreprises.filter(e => e.statut !== 'prospect');
  const liste  = toutes.filter(e => {
    if (filtre !== 'tous' && e.statut !== filtre) return false;
    if (recherche) {
      const q = recherche.toLowerCase();
      if (!`${e.nom} ${e.secteur} ${e.referent_rh_nom || ''} ${e.ville || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const listePage = liste.slice((page - 1) * PAR_PAGE_ENT, page * PAR_PAGE_ENT);

  const totalBenef = beneficiaires.length;
  const actifsB    = beneficiaires.filter(b => b.statut === 'actif').length;
  const certifiesB = beneficiaires.filter(b => b.statut === 'certifie').length;
  const enAttenteB = beneficiaires.filter(b => b.statut === 'en_attente' || b.statut === 'test_niveau_pending').length;

  if (chargement) return <div style={{ padding:40, textAlign:'center', color:COULEURS.gris400 }}>Chargement des entreprises…</div>;

  const S = {
    tableau:    { background:COULEURS.blanc, borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:`1px solid ${COULEURS.gris200}` },
    filtreBarre:{ padding:'14px 20px', borderBottom:`1px solid ${COULEURS.gris200}`, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' },
    input:      { padding:'9px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none', flex:1, minWidth:200 },
    select:     { padding:'9px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none', background:COULEURS.blanc, color:COULEURS.navy },
    tHead:      { display:'grid', gridTemplateColumns:COLS, padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' },
    tLigne:     { display:'grid', gridTemplateColumns:COLS, padding:'14px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center' },
    avatar: (c) => ({ width:38, height:38, borderRadius:10, background:`${c}20`, border:`1.5px solid ${c}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:c, flexShrink:0 }),
    badge:  (bg,txt) => ({ display:'inline-block', padding:'3px 10px', borderRadius:20, background:bg, color:txt, fontSize:11, fontWeight:600 }),
    btnEdit:    { padding:'5px 12px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:11, fontFamily:'"Plus Jakarta Sans", sans-serif' },
  };

  return (
    <>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:16, marginBottom:28 }}>
        {[
          { l:'Entreprises clientes', v:toutes.length,  c:couleurTheme,      i:'🏢' },
          { l:'Total bénéficiaires',  v:totalBenef,     c:'#8B5CF6',          i:'👥' },
          { l:'Actifs',               v:actifsB,        c:COULEURS.succes,    i:'✅' },
          { l:'Certifiés',            v:certifiesB,     c:couleurThemeFonce, i:'🏅' },
          { l:'En attente',           v:enAttenteB,     c:COULEURS.attention, i:'⏳' },
        ].map(k => (
          <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${k.c}`, boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{k.i}</div>
            <div style={{ fontSize:24, fontWeight:800, color:COULEURS.navy, lineHeight:1, marginBottom:4 }}>{k.v}</div>
            <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* En-tête + bouton nouvelle entreprise (Onboarding n'a pas le droit de créer une entreprise) */}
      {!lectureSeule && !estRole(profile?.role, 'admin_onboarding') && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
          <button
            onClick={() => setModalParcours(true)}
            style={{ padding:'10px 18px', borderRadius:8, border:'none', background:couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
          >
            ＋ Nouvelle entreprise
          </button>
        </div>
      )}

      {/* Filtres rapides par statut */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {[
          { v:'tous',       lib:'Tous',       n: toutes.length },
          { v:'en_attente', lib:'⏳ En attente', n: toutes.filter(e => e.statut === 'en_attente').length },
          { v:'actif',      lib:'✅ Actif',      n: toutes.filter(e => e.statut === 'actif').length },
          { v:'refuse',     lib:'❌ Refusé',     n: toutes.filter(e => e.statut === 'refuse').length },
        ].map(f => (
          <button key={f.v} onClick={() => { setFiltre(f.v); setPage(1); }}
            style={{
              padding:'7px 14px', borderRadius:20, border:`1.5px solid ${filtre === f.v ? couleurTheme : COULEURS.gris200}`,
              background: filtre === f.v ? couleurTheme : COULEURS.blanc, color: filtre === f.v ? '#fff' : COULEURS.gris600,
              fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif',
            }}>
            {f.lib} ({f.n})
          </button>
        ))}
      </div>

      {/* Tableau */}
      <div style={S.tableau}>
        {/* Barre filtre */}
        <div style={S.filtreBarre}>
          <input
            style={S.input}
            placeholder="🔍 Rechercher une entreprise, secteur, responsable…"
            value={recherche}
            onChange={e => { setRecherche(e.target.value); setPage(1); }}
          />
          <select style={S.select} value={filtre} onChange={e => { setFiltre(e.target.value); setPage(1); }}>
            <option value="tous">Tous les statuts</option>
            <option value="actif">Actif</option>
            <option value="expire_bientot">Expire bientôt</option>
            <option value="en_attente">En attente de validation</option>
            <option value="refuse">Refusé</option>
            <option value="suspendu">Suspendu</option>
          </select>
          <span style={{ fontSize:12, color:COULEURS.gris600, whiteSpace:'nowrap' }}>{liste.length} entreprise{liste.length>1?'s':''}</span>
        </div>

        {/* En-tête colonnes */}
        <div style={S.tHead}>
          <span>Entreprise</span>
          <span>Secteur</span>
          <span>Responsable</span>
          <span>Bénéficiaires</span>
          <span>Contrat</span>
          <span>Statut</span>
          <span>Action</span>
        </div>

        {liste.length === 0 && (
          <div style={{ padding:'40px 20px', textAlign:'center', color:COULEURS.gris400 }}>Aucune entreprise trouvée.</div>
        )}

        {listePage.map(e => {
          const cfg    = STATUT_ENT[e.statut] || STATUT_ENT.actif;
          const nbB    = beneficiaires.filter(b => b.entreprise_id === e.id).length;
          const nbL    = e.nb_licences || 0;
          const pct    = nbL > 0 ? Math.round((nbB / nbL) * 100) : 0;

          return (
            <div key={e.id} style={S.tLigne}>
              <div
                style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}
                onClick={() => setModalEnt(e)}
              >
                <div style={{ ...S.avatar(e.couleur), overflow:'hidden' }}>
                  {e.logo_url && !e.logo_url.startsWith('blob:')
                    ? <img src={e.logo_url} alt={e.nom} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : e.initiales}
                </div>
                <div>
                  <div style={{ fontWeight:700, color:couleurTheme, textDecoration:'underline', fontSize:13 }}>{e.nom}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris400 }}>{e.ville || '-'}</div>
                </div>
              </div>

              <span style={{ fontSize:12, color:COULEURS.gris600 }}>{e.secteur}</span>
              <span style={{ fontSize:12, color:COULEURS.gris600 }}>{e.referent_rh_nom || '-'}</span>

              <div>
                <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:13, marginBottom:3 }}>{nbB}/{nbL}</div>
                <div style={{ height:4, background:COULEURS.gris100, borderRadius:2, overflow:'hidden', width:60 }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:e.couleur, borderRadius:2 }} />
                </div>
                <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{pct}%</div>
              </div>

              <span style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>{e.package_elearning || '-'}</span>

              <div>
                <span style={S.badge(cfg.bg, cfg.txt)}>{cfg.lib}</span>
                {(e.date_debut_contrat || e.date_fin_contrat) && (
                  <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:4, whiteSpace:'nowrap' }}>
                    {e.date_debut_contrat || '-'} → {e.date_fin_contrat || '-'}
                  </div>
                )}
              </div>

              <button style={S.btnEdit} onClick={() => setModalEnt(e)}>👁 Détails</button>
            </div>
          );
        })}
        <PaginationSimple total={liste.length} parPage={PAR_PAGE_ENT} page={page} onChange={setPage} />
      </div>

      {/* Modal entreprise */}
      {modalEnt && (
        <ModalOnboardingEntreprise entreprise={modalEnt} onFermer={() => setModalEnt(null)}
          onPreuveSupprimee={() => {
            const patch = { fichier_preuve_url: null, fichier_preuve_nom: null };
            setModalEnt(prev => prev ? { ...prev, ...patch } : prev);
            setEntreprises(prev => prev.map(e => e.id === modalEnt?.id ? { ...e, ...patch } : e));
          }}
          onEntrepriseMaj={(entMaj) => {
            setModalEnt(prev => prev ? { ...prev, ...entMaj } : prev);
            setEntreprises(prev => prev.map(e => e.id === entMaj?.id ? { ...e, ...entMaj } : e));
          }}
        />
      )}

      {/* Modale soumission nouvelle entreprise - envoyée à l'admin BET pour validation */}
      {modalParcours && (
        <ModalSoumissionParcours
          onFermer={() => !saving && setModalParcours(false)}
          onSauvegarder={soumettreInscription}
        />
      )}
    </>
  );
}


// ── Modal Import Excel ────────────────────────────────────────────────────────
const COLONNES_MODELE_EXCEL = ['nom','prenom','date_naissance','classe','niveau_cecr_estime','prenom_parent','nom_parent','email_parent','telephone_parent'];

// Normalise un en-tête de colonne pour la correspondance (strip accents, minuscule, trim)
function _normH(h) {
  return (h || '').toString().trim().toLowerCase()
    .replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a').replace(/[ùûü]/g,'u').replace(/[îï]/g,'i').replace(/[ôö]/g,'o')
    .replace(/[^a-z0-9_]/g,'');
}

// Déduit le profil (adulte/adolescent/enfant) à partir de la date de naissance - plus fiable
// que de deviner via la simple présence d'un contact parent (un ado peut avoir sa propre
// adresse email et aucun contact parent renseigné, sans pour autant être un adulte).
function _trancheDepuisNaissance(dateStr) {
  if (!dateStr) return null;
  const dn = new Date(dateStr);
  if (isNaN(dn.getTime())) return null;
  const age = Math.floor((Date.now() - dn.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age <= 12) return 'enfant';
  if (age <= 17) return 'adolescent';
  return 'adulte';
}

// Extrait les données d'un tableau de lignes (array of objects ou array of arrays avec entetes)
function _parseRows(rows, entetes) {
  const h = (entetes || []).map(_normH);
  // exclude : indices déjà attribués à un champ plus spécifique, à ne pas reproposer pour un
  // champ générique (ex: la colonne "email_parent" ne doit pas aussi être choisie pour "email").
  const idx = (mots, exclude = []) => h.findIndex((e, i) => !exclude.includes(i) && mots.some(m => e.includes(m)));
  const iPrenom     = idx(['prenom','firstname']);
  const iNom        = idx(['nom','name','lastname']);
  const iDN         = idx(['date_naissance','datenaissance','birthdate','naissance']);
  const iAge        = idx(['age']);
  const iClasse     = idx(['classe','class','level']);
  const iNiveau     = idx(['niveau_cecr','niveaucecr','niveau']);
  const iPP         = idx(['prenom_parent','prenomparent','prenompar']);
  const iNP         = idx(['nom_parent','nomparent','nompar']);
  const iTelParent  = idx(['telephone_parent','telephoneparent','telparent']);
  const iEmailParent= idx(['email_parent','emailparent','email_tuteur','courriel_parent']);
  const iEmail      = idx(['email','mail','courriel'], iEmailParent >= 0 ? [iEmailParent] : []);
  const iTel        = idx(['telephone','tel','phone','mobile'], iTelParent >= 0 ? [iTelParent] : []);
  const get = (c, i) => i >= 0 ? ((Array.isArray(c) ? c[i] : c[h[i]]) || '').toString().trim().replace(/^["']|["']$/g, '') : '';
  return rows.map((c, i) => {
    const dateNaissance = get(c,iDN) || null;
    const emailParent   = get(c,iEmailParent) || null;
    const email         = get(c,iEmail) || null;
    const prenomParent  = get(c,iPP) || null;
    const nomParent      = get(c,iNP) || null;
    return {
      prenom:           get(c,iPrenom) || `Bénéficiaire${i+1}`,
      nom:              get(c,iNom),
      date_naissance:   dateNaissance,
      age:              parseInt(get(c,iAge),10) || null,
      classe:           get(c,iClasse) || null,
      niveau_cecr_estime: get(c,iNiveau) || null,
      email:            email || emailParent, // repli sur le parent si l'apprenant n'a pas sa propre adresse
      telephone:        get(c,iTel) || get(c,iTelParent) || null,
      prenomParent,
      nomParent,
      emailParent,
      telParent:        get(c,iTelParent) || null,
      profilType:       _trancheDepuisNaissance(dateNaissance) || ((emailParent || prenomParent || nomParent) ? 'enfant' : 'adulte'),
    };
  }).filter(r => r.prenom && r.nom);
}

function parseCsvInscriptions(texte) {
  const lignes = texte.trim().split('\n').filter(l => l.trim());
  if (lignes.length < 2) return { ok:false, erreur:"Le fichier doit contenir au moins une ligne de données après l'en-tête." };
  const sep    = lignes[0].includes(';') ? ';' : lignes[0].includes('\t') ? '\t' : ',';
  const entetes = lignes[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g,''));
  const rows   = lignes.slice(1).map(l => l.split(sep));
  const data   = _parseRows(rows, entetes);
  if (data.length === 0) return { ok:false, erreur:'Aucune ligne valide trouvée. Vérifiez les colonnes Prénom et Nom.' };
  return { ok:true, lignes:data };
}

function parseXlsxInscriptions(buffer) {
  try {
    const wb = XLSX_ADMIN.read(buffer, { type:'array', cellDates:true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows = XLSX_ADMIN.utils.sheet_to_json(ws, { header:1, defval:'' });
    // Trouver la ligne d'en-tête (première ligne non vide contenant "prenom" ou "nom")
    let headerIdx = 0;
    for (let i = 0; i < Math.min(allRows.length, 5); i++) {
      const norm = allRows[i].map(_normH);
      if (norm.some(h => h.includes('prenom') || h.includes('nom'))) { headerIdx = i; break; }
    }
    const entetes = allRows[headerIdx];
    const rows    = allRows.slice(headerIdx + 1).filter(r => r.some(v => v !== '' && v != null));
    const data    = _parseRows(rows, entetes);
    if (data.length === 0) return { ok:false, erreur:"Aucune ligne valide trouvée dans le fichier Excel. Vérifiez que les colonnes 'prenom' et 'nom' sont présentes." };
    return { ok:true, lignes:data };
  } catch (e) {
    return { ok:false, erreur:`Erreur de lecture Excel : ${e.message}` };
  }
}

export function ModalImportExcel({ entreprise, entreprisesDisponibles = [], onFermer, onImported }) {
  const [fichier,    setFichier]    = useState(null);
  const [lignes,     setLignes]     = useState([]);
  // Doublons détectés à blanc (déjà en base ou en double dans le fichier) - bloque l'import
  // tant qu'ils ne sont pas corrigés ou retirés de l'aperçu.
  const [doublons,        setDoublons]        = useState([]);
  const [verifiantDoublons, setVerifiantDoublons] = useState(false);

  useEffect(() => {
    if (lignes.length === 0) { setDoublons([]); return; }
    let annule = false;
    setVerifiantDoublons(true);
    fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/verifier-doublons`, {
      method: 'POST', headers: _authHdrsAdmin(),
      body: JSON.stringify({ beneficiaires: lignes.map(l => ({ nom_complet: `${l.prenom} ${l.nom}`.trim(), date_naissance: l.date_naissance, email: l.email, prenom_parent: l.prenomParent, nom_parent: l.nomParent, email_parent: l.emailParent, telephone_parent: l.telParent, profil_type: l.profilType })) }),
    })
      .then(r => r.json())
      .then(d => { if (!annule) setDoublons(d.resultats || []); })
      .catch(() => { if (!annule) setDoublons([]); })
      .finally(() => { if (!annule) setVerifiantDoublons(false); });
    return () => { annule = true; };
  }, [lignes]); // eslint-disable-line react-hooks/exhaustive-deps

  function retirerLigne(i) {
    setLignes(ls => ls.filter((_, idx) => idx !== i));
  }
  const [errFichier, setErrFichier] = useState('');
  const [etape,      setEtape]      = useState('upload'); // 'upload' | 'preview' | 'resultats'
  const [resultats,  setResultats]  = useState([]);
  const [modeMdp,    setModeMdp]    = useState('auto');
  const [processing, setProcessing] = useState(false);
  // Si l'entreprise n'est pas déjà connue via les props (import depuis "Dossiers d'inscription",
  // hors contexte d'une fiche entreprise précise), l'agent doit la choisir ici - sans ça les
  // bénéficiaires importés restent orphelins (entreprise_id null) et aucune classe ne peut leur
  // être rattachée ensuite.
  const [entrepriseChoisieId, setEntrepriseChoisieId] = useState('');
  const entrepriseChoisie = entreprise || entreprisesDisponibles.find(e => e.id === entrepriseChoisieId) || null;

  const nomEntreprise = entrepriseChoisie?.nom || '';

  const LIGNES_DEMO = [
    { prenom:'Adjoa',   nom:'Coulibaly', age:10, classe:'CM1',  prenomParent:'Bintou',   nomParent:'Coulibaly', emailParent:`bintou.coulibaly@${nomEntreprise.toLowerCase().replace(/\s+/g,'') || 'entreprise'}.ci`, telParent:'+225 07 11 22 33' },
    { prenom:'Moussa',  nom:'Keita',     age:13, classe:'4e',   prenomParent:'Aminata',  nomParent:'Keita',     emailParent:`aminata.keita@${nomEntreprise.toLowerCase().replace(/\s+/g,'') || 'entreprise'}.ci`,    telParent:'+225 05 33 44 55' },
    { prenom:'Laure',   nom:'Gbaka',     age:8,  classe:'CE2',  prenomParent:'Serge',    nomParent:'Gbaka',     emailParent:`serge.gbaka@${nomEntreprise.toLowerCase().replace(/\s+/g,'') || 'entreprise'}.ci`,      telParent:'+225 01 77 88 99' },
    { prenom:'Ibrahim', nom:'Sangaré',   age:15, classe:'2nde', prenomParent:'Fatouma',  nomParent:'Sangaré',   emailParent:`fatouma.sangare@${nomEntreprise.toLowerCase().replace(/\s+/g,'') || 'entreprise'}.ci`,  telParent:'+225 05 55 66 77' },
  ];

  function gererFichier(f) {
    if (!f) return;
    setFichier(f);
    setErrFichier('');
    const ext = f.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    if (['csv','txt','tsv'].includes(ext)) {
      reader.onload = ev => {
        const res = parseCsvInscriptions(ev.target.result);
        if (res.ok) { setLignes(res.lignes); setEtape('preview'); }
        else setErrFichier(res.erreur);
      };
      reader.readAsText(f, 'utf-8');
    } else if (['xlsx','xls','ods','xlsm','xlsb'].includes(ext)) {
      reader.onload = ev => {
        const res = parseXlsxInscriptions(new Uint8Array(ev.target.result));
        if (res.ok) { setLignes(res.lignes); setEtape('preview'); }
        else setErrFichier(res.erreur);
      };
      reader.readAsArrayBuffer(f);
    } else {
      setErrFichier('Format non supporté. Utilisez un fichier .xlsx, .xls, .ods, .xlsm, .xlsb, .csv, .txt ou .tsv.');
    }
  }

  function telechargerModele() {
    const header = COLONNES_MODELE_EXCEL.join(',');
    const ex = [
      'Koné,Aminata,2015-03-12,CM1,A1,Djeneba,Koné,djeneba.kone@gmail.com,+225 07 11 22 33',
      'Traoré,Ibrahim,2014-07-05,CM2,A1,Moussa,Traoré,moussa.traore@orange.ci,+225 05 44 55 66',
    ].join('\n');
    const blob = new Blob([header + '\n' + ex], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'modele_inscriptions_enfants_BET.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function creerInscriptionsEtComptes() {
    if (processing) return;
    setProcessing(true);
    try {
      const beneficiaires = lignes.map(l => ({
        nom_complet:        `${l.prenom} ${l.nom}`.trim(),
        prenom:             l.prenom,
        nom:                l.nom,
        email:              l.email     || null,
        telephone:          l.telephone || null,
        date_naissance:     l.date_naissance || null,
        classe:             l.classe || null,
        niveau_cecr_estime: l.niveau_cecr_estime || null,
        prenom_parent:      l.prenomParent || null,
        nom_parent:         l.nomParent    || null,
        email_parent:       l.emailParent  || null,
        telephone_parent:   l.telParent    || null,
        profil_type:        l.profilType || 'adulte',
      }));

      const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/bulk`, {
        method: 'POST',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({
          beneficiaires,
          entreprise_id:  entrepriseChoisie?.id  || null,
          entreprise_nom: entrepriseChoisie?.nom || 'Particuliers (sans entreprise)',
          source: 'onboarding_excel',
        }),
      });

      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);

      // Construire les résultats pour l'affichage récap
      const inscs = body.inscriptions || [];
      const res = lignes.map((l, i) => {
        const emailApp = genererEmailApprenant(l.prenom, l.nom);
        const mdpApp   = genererMdp();
        const mdpP     = modeMdp === 'auto' ? genererMdp() : null;
        const insc = {
          id:           inscs[i]?.id || `insc-xl-${i}`,
          prenom:       l.prenom,
          nom:          l.nom,
          classe:       l.classe,
          prenomParent: l.prenomParent,
          nomParent:    l.nomParent,
          emailParent:  l.emailParent,
          telParent:    l.telParent,
          entreprise:   entrepriseChoisie?.nom || 'Particuliers (sans entreprise)',
          source:       'excel',
          dateReception: new Date().toISOString().slice(0,10),
          statut:       'comptes_crees',
        };
        return { inscription:insc, apprenant:{ email:emailApp, mdp:mdpApp }, parent:{ email:l.emailParent, mdp:mdpP, modeLien:modeMdp==='lien' } };
      });

      if (onImported) onImported(res.map(r => r.inscription));
      setResultats(res);
      setEtape('resultats');
    } catch (err) {
      setErrFichier(`❌ Erreur lors de l'import : ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  function telechargerResultats() {
    exporterExcelStyle({
      nomFichier: 'comptes_crees_BET',
      titre: '✅ Comptes créés - inscriptions enfants BET',
      sousTitre: `${resultats.length} compte${resultats.length>1?'s':''} créé${resultats.length>1?'s':''} le ${new Date().toLocaleDateString('fr-FR')}`,
      couleurEntete: '16A34A',
      colonnes: [
        { label: 'Bénéficiaire', width: 26, bold: true },
        { label: 'Email apprenant', width: 28 },
        { label: 'MDP apprenant', width: 18 },
        { label: 'Email parent', width: 28 },
        { label: 'MDP parent', width: 18 },
      ],
      lignes: resultats.map(r => [
        `${r.inscription.prenom} ${r.inscription.nom}`, r.apprenant.email, r.apprenant.mdp,
        r.parent.email, r.parent.mdp || '(lien envoyé)',
      ]),
    });
  }

  const ETAPES = [['upload','📁 Import','1'],['preview','👁 Aperçu','2'],['resultats','✅ Résultats','3']];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200, backdropFilter:'blur(2px)' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg, #16A34A 0%, #15803D 100%)', padding:'20px 26px', borderRadius:'18px 18px 0 0', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:4 }}>
              📊 Import Excel {entrepriseChoisie ? `- ${entrepriseChoisie.nom}` : ''}
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>
              {etape === 'upload'    && 'Importez la liste des bénéficiaires depuis un fichier Excel ou CSV'}
              {etape === 'preview'   && `${lignes.length} bénéficiaire${lignes.length>1?'s':''} détecté${lignes.length>1?'s':''} - vérifiez avant de créer les comptes`}
              {etape === 'resultats' && `${resultats.length} compte${resultats.length>1?'s':''} créé${resultats.length>1?'s':''} avec succès`}
            </div>
          </div>
          <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
        </div>

        {/* Barre étapes */}
        <div style={{ display:'flex', borderBottom:`1px solid ${COULEURS.gris200}`, padding:'0 24px' }}>
          {ETAPES.map(([id, lib, num]) => {
            const actif  = etape === id;
            const passe  = (etape==='preview'&&id==='upload') || (etape==='resultats'&&id!=='resultats');
            return (
              <div key={id} style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:8, borderBottom: actif ? '2px solid #16A34A' : '2px solid transparent', color: actif ? '#16A34A' : passe ? COULEURS.succes : COULEURS.gris400, fontWeight: actif ? 700 : 500, fontSize:13 }}>
                <span style={{ width:20, height:20, borderRadius:'50%', background: actif ? '#16A34A' : passe ? COULEURS.succes : COULEURS.gris200, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700 }}>
                  {passe ? '✓' : num}
                </span>
                {lib}
              </div>
            );
          })}
        </div>

        <div style={{ padding:24 }}>

          {/* ── Étape 1 : Upload ── */}
          {etape === 'upload' && (
            <>
              {/* Entreprise - obligatoire si non déjà fixée par le contexte (fiche entreprise) :
                  sans ça, les bénéficiaires importés restent orphelins et aucune classe ne peut
                  leur être rattachée ensuite. */}
              {!entreprise && (
                <div style={{ marginBottom:18 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 }}>
                    Entreprise concernée *
                  </label>
                  <select
                    value={entrepriseChoisieId}
                    onChange={e => setEntrepriseChoisieId(e.target.value)}
                    style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${entrepriseChoisieId ? COULEURS.gris200 : '#FCA5A5'}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc }}
                  >
                    <option value="">- Sélectionner une entreprise -</option>
                    <option value="__particuliers__" disabled>· ou laissez vide si aucun lien avec une entreprise ·</option>
                    {entreprisesDisponibles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </select>
                  {!entrepriseChoisieId && (
                    <div style={{ fontSize:11, color:'#B91C1C', marginTop:6 }}>
                      ⚠️ Sans entreprise sélectionnée, ces bénéficiaires ne pourront pas être rattachés à une classe d'entreprise par la suite.
                    </div>
                  )}
                </div>
              )}

              <label style={{ display:'block', border:`2px dashed ${errFichier ? '#FCA5A5' : COULEURS.gris200}`, borderRadius:14, padding:40, textAlign:'center', cursor:'pointer' }}>
                <input type="file" accept=".xlsx,.xls,.ods,.xlsm,.xlsb,.csv,.txt,.tsv" style={{ display:'none' }}
                  onChange={e => { if (e.target.files[0]) gererFichier(e.target.files[0]); }} />
                <div style={{ fontSize:48, marginBottom:12 }}>📊</div>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>
                  Glissez votre fichier ou cliquez pour sélectionner
                </div>
                <div style={{ fontSize:12, color:COULEURS.gris600, marginBottom:16 }}>
                  Formats acceptés : .xlsx · .xls · .ods · .xlsm · .xlsb · .csv · .txt · .tsv
                </div>
                {fichier && !errFichier ? (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#D1FAE5', color:'#065F46', padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600 }}>
                    ✅ {fichier.name}
                  </span>
                ) : (
                  <span style={{ display:'inline-block', background:'#16A34A', color:'#fff', padding:'8px 20px', borderRadius:8, fontSize:12, fontWeight:700 }}>
                    Choisir un fichier
                  </span>
                )}
              </label>
              {errFichier && (
                <div style={{ background:'#FEE2E2', color:'#991B1B', borderRadius:8, padding:'10px 14px', fontSize:12, marginTop:12 }}>⚠️ {errFichier}</div>
              )}
              <div style={{ marginTop:20, background:COULEURS.gris50, borderRadius:12, padding:'14px 18px', border:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:2 }}>📋 Modèle de fichier attendu</div>
                  <div style={{ fontSize:11, color:COULEURS.gris600 }}>Colonnes : {COLONNES_MODELE_EXCEL.join(' · ')}</div>
                </div>
                <button onClick={telechargerModele} style={{ background:COULEURS.blanc, color:COULEURS.navy, border:`1.5px solid ${COULEURS.gris200}`, borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', whiteSpace:'nowrap' }}>
                  ⬇️ Télécharger modèle CSV
                </button>
              </div>
            </>
          )}

          {/* ── Étape 2 : Aperçu ── */}
          {etape === 'preview' && (
            <>
              {/* Mode MDP parent */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Mode de création du mot de passe parent :</div>
                <div style={{ display:'flex', gap:8 }}>
                  {[['auto','🔑 Mot de passe auto','Généré et envoyé par email'],['lien','🔗 Lien de définition','Le parent choisit lui-même']].map(([id,lib,desc]) => (
                    <div key={id} onClick={() => setModeMdp(id)} style={{ flex:1, padding:'10px 12px', borderRadius:10, cursor:'pointer', border:`2px solid ${modeMdp===id?'#15803D':COULEURS.gris200}`, background:modeMdp===id?'#DCFCE7':COULEURS.blanc, transition:'all 0.15s' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:modeMdp===id?'#15803D':COULEURS.navy }}>{lib}</div>
                      <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alerte doublons */}
              {verifiantDoublons ? (
                <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'10px 16px', marginBottom:14, fontSize:12, color:COULEURS.gris600 }}>
                  ⏳ Vérification des doublons…
                </div>
              ) : doublons.some(d => d.doublon) && (
                <div style={{ background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:10, padding:'12px 16px', marginBottom:14, fontSize:12, color:'#991B1B' }}>
                  ⚠️ <strong>{doublons.filter(d=>d.doublon).length} doublon(s) détecté(s)</strong> - corrigez ou retirez (✕) les lignes surlignées ci-dessous avant de continuer. L'import est bloqué tant qu'il en reste.
                </div>
              )}

              {/* Tableau aperçu */}
              <div style={{ border:`1px solid ${COULEURS.gris200}`, borderRadius:12, overflow:'hidden', marginBottom:20 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1.1fr 0.9fr 0.7fr 1.8fr 1fr 34px', padding:'10px 16px', background:COULEURS.gris50, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', borderBottom:`1px solid ${COULEURS.gris200}` }}>
                  <span>Bénéficiaire</span><span>Parent</span><span>Naissance</span><span>Classe</span><span>Email parent</span><span>Tél. parent</span><span></span>
                </div>
                {lignes.map((l, i) => {
                  const d = doublons.find(x => x.index === i);
                  const estDoublon = d?.doublon;
                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'1.4fr 1.1fr 0.9fr 0.7fr 1.8fr 1fr 34px', padding:'11px 16px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:12, alignItems:'center', background: estDoublon ? '#FEF2F2' : 'transparent' }}>
                      <span style={{ fontWeight:600, color:COULEURS.navy }}>
                        {l.prenom} {l.nom}
                        {estDoublon && (
                          <div style={{ fontSize:10, color:'#DC2626', fontWeight:700, marginTop:2 }}>
                            ⚠️ {d.raison === 'deja_en_base' ? 'Déjà importé précédemment' : `Doublon avec la ligne ${d.ligneOriginale} de ce fichier`}
                          </div>
                        )}
                      </span>
                      <span style={{ color:COULEURS.gris600 }}>{l.prenomParent ? `${l.prenomParent} ${l.nomParent||''}`.trim() : '-'}</span>
                      <span style={{ color:COULEURS.gris600 }}>{l.date_naissance || (l.age ? `${l.age} ans` : '-')}</span>
                      <span style={{ color:COULEURS.navy }}>{l.classe||'-'}</span>
                      <span style={{ color: l.emailParent ? COULEURS.gris600 : '#EF4444', fontSize:11, fontWeight: l.emailParent ? 400 : 600 }}>{l.emailParent||'⚠️ manquant'}</span>
                      <span style={{ color:COULEURS.gris600, fontSize:11 }}>{l.telParent||'-'}</span>
                      <button onClick={() => retirerLigne(i)} title="Retirer cette ligne"
                        style={{ background:'none', border:'none', color:'#DC2626', fontSize:14, cursor:'pointer', fontWeight:700 }}>
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={creerInscriptionsEtComptes} disabled={processing || verifiantDoublons || doublons.some(d=>d.doublon)}
                  title={doublons.some(d=>d.doublon) ? 'Corrigez ou retirez les doublons avant de continuer' : undefined}
                  style={{ flex:2, background: (processing || verifiantDoublons || doublons.some(d=>d.doublon)) ? COULEURS.gris200 : '#16A34A', color: (processing || verifiantDoublons || doublons.some(d=>d.doublon)) ? COULEURS.gris400 : '#fff', border:'none', borderRadius:9, padding:'12px 0', fontSize:13, fontWeight:700, cursor: (processing || verifiantDoublons || doublons.some(d=>d.doublon)) ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  {processing ? '⏳ Création en cours…' : doublons.some(d=>d.doublon) ? '🚫 Doublons à corriger' : `✅ Créer ${lignes.length} inscription${lignes.length>1?'s':''} + comptes →`}
                </button>
                <button onClick={() => setEtape('upload')}
                  style={{ flex:1, background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:9, padding:'12px 0', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  ← Retour
                </button>
              </div>
            </>
          )}

          {/* ── Étape 3 : Résultats ── */}
          {etape === 'resultats' && (
            <>
              <div style={{ textAlign:'center', marginBottom:20 }}>
                <div style={{ fontSize:44, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>{resultats.length} compte{resultats.length>1?'s':''} créé{resultats.length>1?'s':''} !</div>
                <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:4 }}>Inscriptions enregistrées · Emails de bienvenue envoyés · Tests de placement en file d'attente</div>
              </div>
              <div style={{ maxHeight:320, overflowY:'auto', marginBottom:20 }}>
                {resultats.map((r, i) => (
                  <div key={i} style={{ background:COULEURS.gris50, borderRadius:12, padding:'14px 16px', marginBottom:10, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:8, fontSize:13 }}>
                      👤 {r.inscription.prenom} {r.inscription.nom}
                      <span style={{ marginLeft:8, fontSize:11, color:COULEURS.gris600, fontWeight:400 }}>{r.inscription.classe} · {r.inscription.entreprise}</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      <div style={{ background:'#EFF6FF', borderRadius:8, padding:'8px 10px' }}>
                        <div style={{ fontSize:10, color:'#1D4ED8', fontWeight:700, marginBottom:4 }}>🎓 Apprenant</div>
                        <div style={{ fontSize:11, fontFamily:'monospace', color:COULEURS.navy }}>{r.apprenant.email}</div>
                        <div style={{ fontSize:11, fontFamily:'monospace', color:COULEURS.navy, marginTop:2 }}>🔑 {r.apprenant.mdp}</div>
                      </div>
                      <div style={{ background:'#F0FDF4', borderRadius:8, padding:'8px 10px' }}>
                        <div style={{ fontSize:10, color:'#15803D', fontWeight:700, marginBottom:4 }}>👨‍👩‍👧 Parent</div>
                        <div style={{ fontSize:11, fontFamily:'monospace', color:COULEURS.navy }}>{r.parent.email}</div>
                        {r.parent.mdp
                          ? <div style={{ fontSize:11, fontFamily:'monospace', color:COULEURS.navy, marginTop:2 }}>🔑 {r.parent.mdp}</div>
                          : <div style={{ fontSize:10, color:'#1D4ED8', marginTop:2 }}>🔗 Lien de définition envoyé (48h)</div>
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={telechargerResultats}
                  style={{ flex:1, background:COULEURS.gris100, color:COULEURS.navy, border:`1.5px solid ${COULEURS.gris200}`, borderRadius:9, padding:'11px 0', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  ⬇️ Exporter les comptes (CSV)
                </button>
                <button onClick={onFermer}
                  style={{ flex:1, background:'#16A34A', color:'#fff', border:'none', borderRadius:9, padding:'11px 0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  Fermer ✓
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Partagé entre admin_placement (OngletGestionTests) et admin_onboarding (OngletClasses)
export function ageDepuisNaissance(dateNaissance) {
  if (!dateNaissance) return null;
  const dn = new Date(dateNaissance);
  if (Number.isNaN(dn.getTime())) return null;
  const auj = new Date();
  let age = auj.getFullYear() - dn.getFullYear();
  const m = auj.getMonth() - dn.getMonth();
  if (m < 0 || (m === 0 && auj.getDate() < dn.getDate())) age--;
  return age;
}

// ── Modal Envoi Groupé ────────────────────────────────────────────────────────
export function testsCompatibles(tests, apprenant) {
  const tranche = apprenant?.tranche_age || (apprenant?.age <= 12 ? 'enfant' : apprenant?.age <= 17 ? 'adolescent' : 'adulte');
  return tests.filter(t => !t.tranche_cible || t.tranche_cible === 'tous' || t.tranche_cible === tranche);
}

export function ModalEnvoiGroupé({ apprenants, tests, onFermer, onConfirmer }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const TYPE_IC = { qcm:'📋', listening:'🎬', audio:'🎧', quiz:'🎯', speaking:'🎤' };
  const TRANCHE_IC = { tous:'🌍', enfant:'🧒', adolescent:'🧑', adulte:'👔' };

  // ── Mode : même test OU personnalisé ──────────────────────────────────────
  const [mode,     setMode]    = useState('meme');   // 'meme' | 'perso'
  const [testGlobal, setTestGlobal] = useState(tests[0]?.id || '');
  // { [apprenantId]: testId } - pré-rempli avec le 1er test
  const [testParApp, setTestParApp] = useState(() => {
    const init = {};
    apprenants.forEach(a => { init[a.id] = tests[0]?.id || ''; });
    return init;
  });

  const [copies,   setCopies]  = useState({});
  const [confirme, setConfirme]= useState(false);

  const inp = { width:'100%', padding:'7px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc, boxSizing:'border-box' };

  // Appliquer un test à tous (mode perso)
  function appliquerATous(tid) {
    const next = {};
    apprenants.forEach(a => { next[a.id] = tid; });
    setTestParApp(next);
  }

  // Récupérer le test d'un apprenant selon le mode
  function getTest(a) {
    const tid = mode === 'meme' ? testGlobal : (testParApp[a.id] || testGlobal);
    return tests.find(t => t.id === tid) || null;
  }

  function genLien(a) {
    const t = getTest(a);
    return t ? `${window.location.origin}/level-test/${t.id}?a=${a.id}` : '';
  }

  function copierUn(a) {
    const lien = genLien(a);
    if (!lien) return;
    navigator.clipboard?.writeText(lien);
    setCopies(c => ({ ...c, [a.id]: true }));
    setTimeout(() => setCopies(c => { const n = {...c}; delete n[a.id]; return n; }), 2500);
  }

  function copierTout() {
    const lignes = apprenants.map(a => {
      const t = getTest(a);
      return `${a.prenom} ${a.nom} (${t?.titre || '-'}) - ${genLien(a)}`;
    }).join('\n');
    navigator.clipboard?.writeText(lignes);
    const all = {};
    apprenants.forEach(a => { all[a.id] = true; });
    setCopies(all);
    setTimeout(() => setCopies({}), 2500);
  }

  const tousConfigures = apprenants.every(a => getTest(a));
  const tousCopies = Object.keys(copies).length === apprenants.length;
  const testChoisi = tests.find(t => t.id === testGlobal) || tests[0];

  if (tests.length === 0) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }} onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:16, padding:32, textAlign:'center', width:400 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:40, marginBottom:12 }}>📚</div>
        <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun test disponible</div>
        <div style={{ fontSize:13, color:COULEURS.gris400, marginBottom:20 }}>Créez d'abord un test dans la bibliothèque.</div>
        <button onClick={onFermer} style={{ padding:'9px 22px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontSize:13 }}>Fermer</button>
      </div>
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, padding:'24px 16px' }} onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', height:'90vh', maxWidth:'98vw', maxHeight:'96vh', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ background:`linear-gradient(135deg, ${couleurTheme} 0%, ${couleurThemeFonce} 100%)`, padding:'20px 26px', borderRadius:'18px 18px 0 0', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:4 }}>
              🔗 Envoi groupé - {apprenants.length} apprenant{apprenants.length > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>
              Choisissez un mode d'assignation, vérifiez les liens, puis confirmez.
            </div>
          </div>
          <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
        </div>

        <div style={{ padding:24, flex:1, overflowY:'auto' }}>

          {/* ── Toggle mode ── */}
          <div style={{ display:'flex', gap:0, background:COULEURS.gris100, borderRadius:10, padding:4, marginBottom:20 }}>
            {[
              ['meme',  '🎯 Même test pour tous',          'Un seul test assigné à toute la sélection'],
              ['perso', '🎭 Test personnalisé par apprenant','Choisissez un test différent pour chacun'],
            ].map(([id, lib, desc]) => (
              <button key={id} onClick={() => setMode(id)} style={{ flex:1, padding:'10px 14px', borderRadius:8, border:'none', background: mode===id ? COULEURS.blanc : 'transparent', color: mode===id ? COULEURS.navy : COULEURS.gris600, fontWeight: mode===id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', boxShadow: mode===id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition:'all 0.15s', textAlign:'left' }}>
                <div>{lib}</div>
                <div style={{ fontSize:10, color: mode===id ? COULEURS.gris400 : COULEURS.gris400, fontWeight:400, marginTop:2 }}>{desc}</div>
              </button>
            ))}
          </div>

          {/* ── Mode : même test pour tous ── */}
          {mode === 'meme' && (
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 }}>Test à envoyer à tous *</label>
              <select value={testGlobal} onChange={e => setTestGlobal(e.target.value)} style={{ ...inp, fontSize:13, padding:'9px 12px' }}>
                {tests.map(t => (
                  <option key={t.id} value={t.id}>
                    {TYPE_IC[t.type] || '📝'} {t.titre} - {t.type?.toUpperCase()} · Niv. {t.niveau} · {t.dureeMin} min
                  </option>
                ))}
              </select>
              {testChoisi && (
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  {[
                    ['Format',    `${TYPE_IC[testChoisi.type]} ${testChoisi.type?.toUpperCase()}`],
                    ['Niveau',    testChoisi.niveau],
                    ['Durée',     `${testChoisi.dureeMin} min`],
                    ['Questions', testChoisi.questions?.length > 0 ? `${testChoisi.questions.length} Q` : 'Libre'],
                  ].map(([l, v]) => (
                    <div key={l} style={{ flex:1, background:COULEURS.gris50, borderRadius:8, padding:'8px 10px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                      <div style={{ fontSize:10, color:COULEURS.gris400 }}>{l}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginTop:2 }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Mode : personnalisé ── */}
          {mode === 'perso' && (
            <div style={{ marginBottom:16 }}>
              {/* Appliquer un test à tous rapidement */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'10px 14px', background:COULEURS.gris50, borderRadius:9, border:`1px solid ${COULEURS.gris200}` }}>
                <span style={{ fontSize:12, color:COULEURS.gris600, fontWeight:600, flexShrink:0 }}>⚡ Appliquer à tous :</span>
                <select
                  defaultValue=""
                  onChange={e => { if(e.target.value) appliquerATous(e.target.value); e.target.value=''; }}
                  style={{ ...inp, flex:1, fontSize:12 }}
                >
                  <option value="">- Choisir un test à appliquer à tous -</option>
                  {tests.map(t => (
                    <option key={t.id} value={t.id}>{TYPE_IC[t.type]} {t.titre} · {t.niveau}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── Liste apprenants ── */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                {mode === 'meme' ? `Liens générés (${apprenants.length})` : `Assignation individuelle (${apprenants.length})`}
              </label>
              <button
                onClick={copierTout}
                style={{ padding:'4px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: tousCopies ? '#D1FAE5' : COULEURS.blanc, color: tousCopies ? '#065F46' : COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
              >
                {tousCopies ? '✓ Tous copiés' : '📋 Copier tous les liens'}
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:320, overflowY:'auto', paddingRight:4 }}>
              {apprenants.map(a => {
                const testA  = getTest(a);
                const lien   = genLien(a);
                const copie  = copies[a.id];
                const initials = `${a.prenom?.[0]||''}${a.nom?.[0]||''}`.toUpperCase();
                return (
                  <div key={a.id} style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${testA ? COULEURS.gris200 : '#FCA5A5'}`, transition:'border-color 0.15s' }}>

                    {/* Ligne infos apprenant */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: mode==='perso' ? 8 : 6 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:`${couleurTheme}20`, border:`1.5px solid ${couleurTheme}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:couleurThemeFonce, flexShrink:0 }}>
                        {initials}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:COULEURS.navy }}>{a.prenom} {a.nom}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {a.entreprise} · {a.emailApp || a.emailParent || '-'}
                        </div>
                      </div>
                      {/* Badge tranche de l'apprenant */}
                      {(() => {
                        const tr = a.tranche_age || (a.age <= 12 ? 'enfant' : a.age <= 17 ? 'adolescent' : 'adulte');
                        const ic = TRANCHE_IC[tr] || '🌍';
                        return <span style={{ fontSize:13, flexShrink:0 }} title={tr}>{ic}</span>;
                      })()}
                      {testA && (
                        <span style={{ padding:'2px 8px', borderRadius:10, background:`${couleurTheme}15`, color:couleurThemeFonce, fontSize:10, fontWeight:700, flexShrink:0 }}>
                          {TYPE_IC[testA.type]} {testA.niveau}
                        </span>
                      )}
                      <button
                        onClick={() => copierUn(a)}
                        disabled={!lien}
                        style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${copie ? COULEURS.succes : COULEURS.gris200}`, background: copie ? '#D1FAE5' : COULEURS.blanc, color: copie ? '#065F46' : COULEURS.navy, fontSize:11, fontWeight:600, cursor: lien ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif', flexShrink:0 }}
                      >
                        {copie ? '✓' : '📋'}
                      </button>
                    </div>

                    {/* Sélecteur de test INDIVIDUEL (mode perso) - filtré par tranche */}
                    {mode === 'perso' && (() => {
                      const compatibles = testsCompatibles(tests, a);
                      const incompatibles = tests.filter(t => !compatibles.includes(t));
                      return (
                        <select
                          value={testParApp[a.id] || ''}
                          onChange={e => setTestParApp(p => ({ ...p, [a.id]: e.target.value }))}
                          style={{ ...inp, marginBottom:6, borderColor: testParApp[a.id] ? COULEURS.gris200 : '#FCA5A5' }}
                        >
                          <option value="">- Choisir un test pour cet apprenant -</option>
                          {compatibles.length > 0 && (
                            <optgroup label={`✅ Compatible (${compatibles.length})`}>
                              {compatibles.map(t => (
                                <option key={t.id} value={t.id}>
                                  {TYPE_IC[t.type]} {t.titre} · Niv. {t.niveau} · {t.dureeMin} min
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {incompatibles.length > 0 && (
                            <optgroup label={`⚠️ Autre tranche (${incompatibles.length})`}>
                              {incompatibles.map(t => (
                                <option key={t.id} value={t.id}>
                                  {TYPE_IC[t.type]} {t.titre} · {TRANCHE_IC[t.tranche_cible || 'tous']} · Niv. {t.niveau}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      );
                    })()}

                    {/* Lien généré */}
                    <div style={{ fontFamily:'monospace', fontSize:10, color: lien ? couleurThemeFonce : '#EF4444', background: lien ? `${couleurTheme}08` : '#FEF2F2', padding:'5px 8px', borderRadius:6, wordBreak:'break-all' }}>
                      {lien || '⚠️ Sélectionnez un test pour générer le lien'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Confirmation ── */}
          {!confirme ? (
            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => { if (tousConfigures) setConfirme(true); }}
                disabled={!tousConfigures}
                style={{ flex:2, padding:'12px 0', borderRadius:9, border:'none', background: tousConfigures ? COULEURS.succes : COULEURS.gris200, color: tousConfigures ? '#fff' : COULEURS.gris400, fontWeight:700, fontSize:13, cursor: tousConfigures ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
              >
                {tousConfigures
                  ? `✅ Confirmer l'envoi à ${apprenants.length} apprenant${apprenants.length > 1 ? 's' : ''}`
                  : `⚠️ Assignez un test à chaque apprenant`}
              </button>
              <button onClick={onFermer} style={{ flex:1, padding:'12px 0', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                Annuler
              </button>
            </div>
          ) : (
            <div style={{ background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:12, padding:'20px 24px', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              <div style={{ fontWeight:800, color:'#065F46', fontSize:15, marginBottom:6 }}>
                Liens envoyés à {apprenants.length} apprenant{apprenants.length > 1 ? 's' : ''} !
              </div>
              <div style={{ fontSize:12, color:'#065F46', marginBottom:8 }}>
                {mode === 'meme'
                  ? `Tous ont reçu le même test : "${testChoisi?.titre}"`
                  : 'Chaque apprenant a reçu son test personnalisé.'}
              </div>
              <div style={{ fontSize:11, color:'#065F46', marginBottom:18, opacity:0.8 }}>
                Un email avec le lien unique a été envoyé à chaque parent/apprenant.
              </div>
              <button onClick={() => onConfirmer(apprenants.length)} style={{ padding:'10px 32px', borderRadius:9, border:'none', background:'#065F46', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal Résultats Détaillés ─────────────────────────────────────────────────
export function ModalResultatsTest({ apprenantId, apprenantNom, onFermer }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const [resultats, setResultats] = useState(null); // null = chargement
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/bet-elearning/tests-niveau/resultats/${apprenantId}`, { headers: _authHdrsAdmin() })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) console.error('[ModalResultatsTest] fetch résultats a échoué', d);
        setResultats(d.resultats || []);
      })
      .catch(e => { console.error('[ModalResultatsTest] fetch résultats', e); setResultats([]); });
  }, [apprenantId]);

  if (resultats === null) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }} onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:16, padding:32, textAlign:'center', width:300, color:COULEURS.gris400, fontSize:13 }} onClick={e => e.stopPropagation()}>
        Chargement des résultats…
      </div>
    </div>
  );

  if (resultats.length === 0) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }} onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:16, padding:32, textAlign:'center', width:400 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
        <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun résultat enregistré</div>
        <div style={{ fontSize:13, color:COULEURS.gris400, marginBottom:20 }}>Ce test n'a pas encore été passé via le lien en ligne.</div>
        <button onClick={onFermer} style={{ padding:'9px 22px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontSize:13 }}>Fermer</button>
      </div>
    </div>
  );

  const r = resultats[idx];
  const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : null;
  const barColor = pct >= 80 ? COULEURS.succes : pct >= 60 ? COULEURS.attention : COULEURS.erreur;
  const TYPE_IC = { qcm:'📋', listening:'🎬', audio:'🎧', quiz:'🎯', speaking:'🎤' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, padding:'24px 16px' }} onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', height:'90vh', maxWidth:'98vw', maxHeight:'96vh', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${COULEURS.navy} 0%, #1E3A5F 100%)`, padding:'22px 28px', borderRadius:'18px 18px 0 0', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:4 }}>
              {TYPE_IC[r.type] || '📝'} Résultats du test - {apprenantNom}
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.65)' }}>{r.titreTest || 'Test de niveau'} · {new Date(r.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
          </div>
          <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
        </div>

        {/* Sélecteur si plusieurs tentatives */}
        {resultats.length > 1 && (
          <div style={{ padding:'10px 24px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
            <span style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600 }}>Tentative :</span>
            {resultats.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} style={{ padding:'4px 12px', borderRadius:6, border:`1px solid ${i===idx ? couleurTheme : COULEURS.gris200}`, background: i===idx ? `${couleurTheme}15` : COULEURS.blanc, color: i===idx ? couleurThemeFonce : COULEURS.gris600, fontSize:11, fontWeight: i===idx ? 700 : 400, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                #{i+1} - {new Date(resultats[i].date).toLocaleDateString('fr-FR')}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding:24, flex:1, overflowY:'auto' }}>

          {/* KPIs résultats */}
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${r.type === 'speaking' ? 2 : 4}, 1fr)`, gap:12, marginBottom:20 }}>
            {r.type !== 'speaking' && r.total > 0 && <>
              <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy }}>{r.score}<span style={{ fontSize:14, fontWeight:400, color:COULEURS.gris400 }}>/{r.total}</span></div>
                <div style={{ fontSize:11, color:COULEURS.gris400 }}>Score</div>
              </div>
              <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:900, color:barColor }}>{pct}%</div>
                <div style={{ fontSize:11, color:COULEURS.gris400 }}>Réussite</div>
              </div>
            </>}
            <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:900, color: NIV_COULEUR[r.niveauDetecte] || COULEURS.navy }}>{r.niveauDetecte}</div>
              <div style={{ fontSize:11, color:COULEURS.gris400 }}>Niveau détecté</div>
            </div>
            <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy }}>{r.dureeMin}<span style={{ fontSize:14, fontWeight:400, color:COULEURS.gris400 }}>min</span></div>
              <div style={{ fontSize:11, color:COULEURS.gris400 }}>Durée</div>
            </div>
          </div>

          {/* Barre progression (QCM) */}
          {r.total > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:COULEURS.gris400, marginBottom:5 }}>
                <span>0%</span><span style={{ fontWeight:700, color:barColor }}>{pct}%</span><span>100%</span>
              </div>
              <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg, ${barColor}, ${barColor}CC)`, borderRadius:5, transition:'width 0.6s' }} />
              </div>
            </div>
          )}

          {/* Notes agent */}
          {r.notes_agent && (
            <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#92400E' }}>
              <strong>💬 Note de l'agent :</strong> {r.notes_agent}
            </div>
          )}

          {/* Speaking - consigne */}
          {r.type === 'speaking' && (
            <div style={{ background:`${couleurTheme}10`, border:`1px solid ${couleurTheme}30`, borderRadius:10, padding:'14px 18px', marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:couleurThemeFonce, marginBottom:6, textTransform:'uppercase' }}>Consigne du test Speaking</div>
              <div style={{ fontSize:14, color:COULEURS.navy, lineHeight:1.6 }}>{r.speakConsigne || '-'}</div>
              <div style={{ marginTop:8, fontSize:12, color:COULEURS.gris400 }}>
                Format : {r.speakType === 'independant' ? '💭 Opinion libre' : r.speakType === 'integre_lecture' ? '📖 Lecture + Expression' : r.speakType === 'integre_audio' ? '🎧 Audio + Expression' : r.speakType} · Réponse orale enregistrée par l'apprenant
              </div>
              {r.audioUrl ? (
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:couleurThemeFonce, marginBottom:6, textTransform:'uppercase' }}>🎙️ Enregistrement de l'apprenant</div>
                  <audio controls src={r.audioUrl} style={{ width:'100%' }} />
                </div>
              ) : (
                <div style={{ marginTop:14, fontSize:12, color:COULEURS.erreur, fontStyle:'italic' }}>
                  ⚠️ Aucun enregistrement audio disponible pour ce résultat (soumis avant la correction de l'upload).
                </div>
              )}
            </div>
          )}

          {/* Tableau détail questions */}
          {r.detailReponses?.length > 0 && (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>
                📋 Détail des réponses ({r.detailReponses.filter(d => d.isCorrect).length}/{r.detailReponses.length} correctes)
              </div>
              <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                <div style={{ display:'grid', gridTemplateColumns:'30px 1fr 1fr 1fr 36px', padding:'9px 14px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', gap:8 }}>
                  <span>#</span><span>Question</span><span>Réponse apprenant</span><span>Bonne réponse</span><span>✓/✗</span>
                </div>
                {r.detailReponses.map((d, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'30px 1fr 1fr 1fr 36px', padding:'11px 14px', borderBottom: i < r.detailReponses.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'start', gap:8, background: d.isCorrect === false ? '#FEF2F2' : d.isCorrect === true ? '#F0FDF4' : COULEURS.blanc }}>
                    <span style={{ fontWeight:700, color:COULEURS.gris400 }}>{i+1}</span>
                    <span style={{ color:COULEURS.navy, lineHeight:1.5 }}>{d.question}</span>
                    <span style={{ color: d.isCorrect === false ? '#DC2626' : d.isCorrect === true ? '#15803D' : COULEURS.gris600, fontWeight: d.isCorrect !== null ? 600 : 400 }}>
                      {d.reponseApprenant || <em style={{ color:COULEURS.gris400 }}>Sans réponse</em>}
                    </span>
                    <span style={{ color:'#15803D', fontWeight:600 }}>{d.correcte || <em style={{ color:COULEURS.gris400, fontWeight:400 }}>Libre</em>}</span>
                    <span style={{ fontSize:16, textAlign:'center' }}>
                      {d.isCorrect === true ? '✅' : d.isCorrect === false ? '❌' : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ padding:'16px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', flexShrink:0 }}>
          <button onClick={onFermer} style={{ padding:'9px 24px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal assignation de tests groupés par entreprise ────────────────────────
export function ModalAssignationEntreprise({ entreprise, tests, onFermer, onDemarrer, onConfirmer, couleurTheme, couleurThemeFonce, couleurThemeClair }) {
  const NIV_COULEUR_E = { A0:'#94A3B8', A1:'#60A5FA', A2:'#34D399', B1:'#818CF8', B2:'#F59E0B', C1:'#F97316', C2:'#DC2626' };
  const TYPE_IC_E = { qcm:'📋', listening:'🎬', audio:'🎧', quiz:'🎯', speaking:'🎤' };

  const [mode,       setMode]       = useState('meme'); // 'meme' | 'perso'
  const [testGlobal, setTestGlobal] = useState(tests[0]?.id || '');
  const [testParApp, setTestParApp] = useState(() => {
    const init = {};
    entreprise.apprenants.forEach(a => { init[a.id] = tests[0]?.id || ''; });
    return init;
  });
  const [copie,    setCopie]    = useState({});   // { [appId]: true } lien copié
  const [envoyes,  setEnvoyes]  = useState({});   // { [appId]: true } lien envoyé (démarré)
  const [flash,    setFlash]    = useState(null);
  const [saving,   setSaving]   = useState(false);

  const apprenants = entreprise.apprenants;

  function getTestId(a) { return mode === 'meme' ? testGlobal : (testParApp[a.id] || testGlobal); }
  function getTest(a)   { return tests.find(t => t.id === getTestId(a)) || null; }
  function genLien(a)   {
    const t = getTest(a);
    return t ? `${window.location.origin}/level-test/${t.id}?a=${a.id}` : '';
  }

  function copierLien(a) {
    const lien = genLien(a);
    if (!lien) return;
    navigator.clipboard?.writeText(lien);
    setCopie(c => ({ ...c, [a.id]: true }));
    setTimeout(() => setCopie(c => { const n = {...c}; delete n[a.id]; return n; }), 2500);
  }

  async function demarrerTous() {
    if (tests.length === 0) { setFlash('Créez d\'abord un test dans la bibliothèque.'); return; }
    if (saving) return;
    setSaving(true);
    const enAttenteListe = apprenants.filter(a => a.statut === 'en_attente_test');
    for (const a of enAttenteListe) {
      try {
        await fetch(`${_API_URL_ADMIN}/api/placement/${a.id}/statut`, {
          method: 'PATCH', headers: _authHdrsAdmin(),
          body: JSON.stringify({ statut: 'test_en_cours' }),
        });
        setEnvoyes(e => ({ ...e, [a.id]: true }));
      } catch {}
    }
    setSaving(false);
    setFlash(`${enAttenteListe.length} apprenant${enAttenteListe.length > 1 ? 's' : ''} passé${enAttenteListe.length > 1 ? 's' : ''} en "Test en cours".`);
    setTimeout(() => { setFlash(null); onConfirmer(); }, 2500);
  }

  async function demarrerUn(a) {
    if (envoyes[a.id]) return;
    setEnvoyes(e => ({ ...e, [a.id]: true }));
    try {
      await fetch(`${_API_URL_ADMIN}/api/placement/${a.id}/statut`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ statut: 'test_en_cours' }),
      });
      setEnvoyes(e => ({ ...e, [a.id]: true }));
      if (onDemarrer) onDemarrer(a.id);
    } catch (e) { setFlash('Erreur réseau'); }
  }

  const inp = { width:'100%', padding:'8px 11px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy, background:COULEURS.blanc, boxSizing:'border-box' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1300, padding:'24px 16px', backdropFilter:'blur(2px)' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', height:'90vh', maxWidth:'98vw', maxHeight:'96vh', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,${couleurTheme},${couleurThemeFonce})`, padding:'20px 26px', borderRadius:'18px 18px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:3 }}>
              🏢 {entreprise.nom}
            </div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)' }}>
              {apprenants.length} apprenant{apprenants.length > 1 ? 's' : ''} - assignation des tests de niveau
            </div>
          </div>
          <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ padding:'20px 24px', flex:1, overflowY:'auto' }}>

          {flash && (
            <div style={{ background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:9, padding:'10px 16px', fontSize:12, color:'#065F46', marginBottom:16 }}>✅ {flash}</div>
          )}

          {tests.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400 }}>
              <div style={{ fontSize:36, marginBottom:10 }}>📚</div>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:6, color:COULEURS.navy }}>Aucun test disponible</div>
              <div style={{ fontSize:13 }}>Créez d'abord un test dans la bibliothèque (onglet "Bibliothèque de tests").</div>
            </div>
          ) : (
            <>
              {/* Toggle mode */}
              <div style={{ display:'flex', gap:0, background:COULEURS.gris100, borderRadius:10, padding:4, marginBottom:20 }}>
                {[
                  ['meme',  '🎯 Même test pour tous',          'Un seul test assigné à toute l\'entreprise'],
                  ['perso', '🎭 Test personnalisé par apprenant','Choisissez un test différent pour chacun'],
                ].map(([id, lib, desc]) => (
                  <button key={id} onClick={() => setMode(id)} style={{ flex:1, padding:'9px 14px', borderRadius:8, border:'none', background: mode===id ? COULEURS.blanc : 'transparent', color: mode===id ? COULEURS.navy : COULEURS.gris600, fontWeight: mode===id ? 700 : 500, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', boxShadow: mode===id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition:'all 0.15s', textAlign:'left' }}>
                    <div style={{ fontSize:13 }}>{lib}</div>
                    <div style={{ fontSize:10, color:COULEURS.gris400, fontWeight:400, marginTop:1 }}>{desc}</div>
                  </button>
                ))}
              </div>

              {/* Sélecteur test global */}
              {mode === 'meme' && (
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 }}>Test à envoyer à tous</label>
                  <select style={inp} value={testGlobal} onChange={e => setTestGlobal(e.target.value)}>
                    {tests.map(t => (
                      <option key={t.id} value={t.id}>{TYPE_IC_E[t.type]||'📝'} {t.titre} - {t.type?.toUpperCase()} · Niv. {t.niveau} · {t.dureeMin} min</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Liste apprenants */}
              <div style={{ border:`1px solid ${COULEURS.gris200}`, borderRadius:12, overflow:'hidden', marginBottom:20 }}>
                {/* En-tête */}
                <div style={{ display:'grid', gridTemplateColumns: mode==='perso' ? '2fr 2fr auto' : '2fr 1fr auto', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                  <span>Apprenant</span>
                  {mode === 'perso' && <span>Test assigné</span>}
                  {mode === 'meme'  && <span>Statut</span>}
                  <span>Actions</span>
                </div>

                {apprenants.map((a, i) => {
                  const initials = `${a.prenom?.[0]||''}${a.nom?.[0]||''}`.toUpperCase();
                  const estEnCours = a.statut === 'test_en_cours' || envoyes[a.id];
                  const lien = genLien(a);
                  return (
                    <div key={a.id} style={{ display:'grid', gridTemplateColumns: mode==='perso' ? '2fr 2fr auto' : '2fr 1fr auto', padding:'12px 16px', borderBottom: i < apprenants.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', background: envoyes[a.id] ? '#F0FDF4' : 'transparent', transition:'background 0.2s' }}>

                      {/* Apprenant */}
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background: estEnCours ? '#D1FAE5' : `${couleurTheme}18`, border:`1.5px solid ${estEnCours ? '#6EE7B7' : couleurTheme+'40'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color: estEnCours ? '#065F46' : couleurThemeFonce, flexShrink:0 }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{a.prenom} {a.nom}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:1 }}>{a.email || a.telephone || '-'}</div>
                          {a.notes && <div style={{ fontSize:10, color:COULEURS.gris500, fontStyle:'italic', marginTop:1 }}>📝 {a.notes}</div>}
                        </div>
                      </div>

                      {/* Test personnalisé */}
                      {mode === 'perso' && (
                        <select style={{ ...inp, width:'auto', marginRight:8 }} value={testParApp[a.id]||''} onChange={e => setTestParApp(p => ({ ...p, [a.id]: e.target.value }))}>
                          <option value=''>- Choisir un test -</option>
                          {tests.map(t => <option key={t.id} value={t.id}>{TYPE_IC_E[t.type]||'📝'} {t.titre} ({t.niveau})</option>)}
                        </select>
                      )}

                      {/* Statut (mode meme) */}
                      {mode === 'meme' && (
                        <span style={{ fontSize:11, fontWeight:700, color: estEnCours ? '#065F46' : '#92400E', background: estEnCours ? '#D1FAE5' : '#FEF3C7', borderRadius:6, padding:'3px 9px' }}>
                          {estEnCours ? '✅ En cours' : '⏳ En attente'}
                        </span>
                      )}

                      {/* Actions */}
                      <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
                        {/* Copier lien */}
                        {lien && !estEnCours && (
                          <button title='Copier le lien de test' onClick={() => copierLien(a)}
                            style={{ padding:'5px 9px', borderRadius:7, border:`1px solid ${couleurTheme}`, background: copie[a.id] ? `${couleurTheme}20` : COULEURS.blanc, color: couleurThemeFonce, fontSize:12, cursor:'pointer', fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            {copie[a.id] ? '✅' : '🔗'}
                          </button>
                        )}
                        {/* Démarrer test en salle */}
                        {!estEnCours && a.statut === 'en_attente_test' && (
                          <button onClick={() => demarrerUn(a)}
                            style={{ padding:'5px 10px', borderRadius:7, border:'none', background:COULEURS.attention, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                            📝 En salle
                          </button>
                        )}
                        {estEnCours && (
                          <span style={{ fontSize:11, color:'#065F46', fontWeight:700, padding:'5px 0' }}>📝 Test lancé</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions globales */}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', alignItems:'center' }}>
                <button onClick={onFermer} style={{ padding:'10px 20px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  Fermer
                </button>
                <button onClick={demarrerTous} disabled={saving}
                  style={{ padding:'10px 22px', borderRadius:9, border:'none', background: saving ? COULEURS.gris200 : couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:8 }}>
                  {saving ? '⏳ Lancement…' : `🚀 Lancer le test pour ${apprenants.filter(a => a.statut === 'en_attente_test' && !envoyes[a.id]).length} apprenant${apprenants.filter(a => a.statut === 'en_attente_test' && !envoyes[a.id]).length > 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Utilisés par OngletEntreprises (onboarding/elearning/commercial)
export function ModalOnboardingEntreprise({ entreprise, onFermer, onPreuveSupprimee, onEntrepriseMaj }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile } = useAuth();
  const confirm = useConfirm();
  const alerte = useAlerte();
  const demander = usePrompt();
  /* `super_admin` ajouté : le repli `profile.permissions.crm_entreprises` ne les
       rattrapait PAS. La base leur accorde le module `crm`, et le serveur sait que
       `crm_entreprises` retombe sur `crm` (MODULE_FALLBACK_PARENT) — mais ce repli n'existe
       que dans `requirePermission`. L'interface, elle, lit la clé exacte : absente, donc
       bouton grisé pour qui a pourtant le droit.
       L'Administrateur, lui, reste en lecture sur les entreprises — demande explicite. */
    const peutModifier = estRole(profile?.role, ['super_admin', 'admin_elearning', 'admin_commercial']) || profile?.permissions?.crm_entreprises?.update === true;

  const [tab, setTab]           = useState('beneficiaires');
  const [benDetail, setBen]     = useState(null);
  const [typesSessionsLocal, setTypesSessionsLocal] = useState(entreprise.types_sessions || ['ligne']);

  // ── Contrat (renouvellement + statut) - module dédié "contrat", distinct de "crm_entreprises" ──
  const peutGererContrat = estRole(profile?.role, ['admin_manager', 'admin_superviseur']) || profile?.permissions?.contrat?.update === true;
  // L'assistante e-learning a le droit "créer" (pas "modifier") sur ce module : elle peut donc
  // proposer un renouvellement, mais seul l'admin BET (peutGererContrat) peut le valider.
  const peutProposerRenouvellement = !peutGererContrat && profile?.permissions?.contrat?.create === true;
  const [contratActif, setContratActif] = useState(null);
  const [contratsHistorique, setContratsHistorique] = useState([]);
  const [modalRenouvellement, setModalRenouvellement] = useState(false);
  const [contratHistoriqueOuvert, setContratHistoriqueOuvert] = useState(null);
  useEffect(() => {
    if (tab !== 'contrat') return;
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/contrats`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => {
        const ceux = (d.contrats || []).filter(c => c.entreprise_id === entreprise.id);
        setContratActif(ceux.find(c => c.statut === 'actif') || ceux[0] || null);
        setContratsHistorique(ceux);
      })
      .catch(() => {});
  }, [tab, entreprise.id]);

  async function changerStatutContratLocal(statut) {
    if (!contratActif) return;
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/contrat/${contratActif.id}/statut`, {
        method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ statut }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors du changement de statut'); return; }
      setContratActif(d.contrat);
      toast.success('Statut du contrat mis à jour ✓');
    } catch (e) {
      toast.error('Erreur réseau');
    }
  }

  async function renouvelerContratLocal(form) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/renouveler-contrat`, {
        method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors du renouvellement du contrat'); return false; }
      setContratActif(d.contrat);
      setContratsHistorique(prev => [d.contrat, ...prev.map(c => c.id !== d.contrat.id ? { ...c, statut: 'expire' } : c)]);
      onEntrepriseMaj?.(d.entreprise);
      toast.success('Contrat renouvelé ✓');
      return true;
    } catch (e) {
      toast.error('Erreur réseau');
      return false;
    }
  }

  async function proposerRenouvellementLocal(form) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/proposer-renouvellement`, {
        method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la proposition de renouvellement'); return false; }
      setContratsHistorique(prev => [d.contrat, ...prev]);
      toast.success('Renouvellement proposé - en attente de validation par l\'admin BET ✓');
      return true;
    } catch (e) {
      toast.error('Erreur réseau');
      return false;
    }
  }

  async function validerRenouvellementLocal(contratId) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/contrat/${contratId}/valider-renouvellement`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la validation du renouvellement'); return; }
      setContratActif(d.contrat);
      setContratsHistorique(prev => prev.map(c => {
        if (c.id === d.contrat.id) return d.contrat;
        if (c.entreprise_id === d.contrat.entreprise_id && c.id !== d.contrat.id && c.statut === 'actif') return { ...c, statut: 'expire' };
        return c;
      }));
      onEntrepriseMaj?.(d.entreprise);
      toast.success('Renouvellement validé ✓');
    } catch (e) {
      toast.error('Erreur réseau');
    }
  }

  // ── Documents entreprise ──
  const [documents, setDocuments]       = useState([]);
  const [docsEnSuppression, setDocsEnSuppression] = useState(new Set()); // empêche le double-clic supprimer document
  const [chargDocs, setChargDocs]       = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  // La "preuve d'inscription" est désormais une ligne réelle de entreprise_documents
  // (type='preuve_inscription', voir syncPreuveDocument côté backend) - plus besoin de la
  // fabriquer côté client à partir de entreprise.fichier_preuve_url.
  const documentsAffiches = documents;
  useEffect(() => {
    if (tab !== 'documents') return;
    setChargDocs(true);
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/documents`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setDocuments(d.documents || []))
      .catch(() => {})
      .finally(() => setChargDocs(false));
  }, [tab, entreprise.id]);

  const [docFichierEnAttente, setDocFichierEnAttente] = useState(null); // { file } - sélectionné mais pas encore déposé
  function deposerDocument(e) {
    const fichier = e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) { alerte('Fichier trop lourd (max 10 Mo).', { danger: true }); return; }
    setDocFichierEnAttente(fichier);
  }
  async function validerDepotDocument() {
    const fichier = docFichierEnAttente;
    if (!fichier || docUploading) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', fichier);
      const resUpload = await fetchUpload(`${_API_URL_ADMIN}/api/upload/document`, {
        method: 'POST', headers: { Authorization: _authHdrsAdmin().Authorization }, body: fd,
      });
      const dataUpload = await resUpload.json();
      if (!resUpload.ok) throw new Error(dataUpload.error || 'Erreur serveur');

      const resDoc = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/documents`, {
        method: 'POST', headers: _authHdrsAdmin(),
        body: JSON.stringify({ nom: fichier.name, url: dataUpload.file.url, format: dataUpload.file.format, taille: dataUpload.file.size }),
      });
      const dataDoc = await resDoc.json();
      if (!resDoc.ok) throw new Error(dataDoc.error || 'Erreur serveur');
      setDocuments(prev => [dataDoc.document, ...prev]);
      setDocFichierEnAttente(null);
    } catch (err) {
      await alerte('Impossible de déposer le document : ' + err.message, { danger: true });
    } finally {
      setDocUploading(false);
    }
  }

  async function supprimerDocument(docId) {
    if (docsEnSuppression.has(docId)) return;
    if (!(await confirm('Supprimer ce document ?', { titre: 'Supprimer le document' }))) return;
    setDocsEnSuppression(prev => new Set(prev).add(docId));
    try {
      const docSupprime = documents.find(d => d.id === docId);
      const res = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/documents/${docId}`, {
        method: 'DELETE', headers: _authHdrsAdmin(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur serveur'); }
      setDocuments(prev => prev.filter(d => d.id !== docId));
      // Le backend vide déjà comptes_entreprises.fichier_preuve_url dans ce cas - on répercute
      // ça sur l'état local pour que le formulaire d'édition ne le fasse pas réapparaître.
      if (docSupprime?.type === 'preuve_inscription') onPreuveSupprimee?.();
    } catch (err) {
      await alerte('Impossible de supprimer : ' + err.message, { danger: true });
    } finally {
      setDocsEnSuppression(prev => { const n = new Set(prev); n.delete(docId); return n; });
    }
  }

  // ── Classes e-learning ──
  const [classes,      setClasses]      = useState([]);
  const [chargClasses, setChargClasses] = useState(true);
  const [modalCl,      setModalCl]      = useState(null); // classe ouverte en modal
  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/classes`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setClasses(d.classes || []))
      .catch(() => {})
      .finally(() => setChargClasses(false));
  }, [entreprise.id]);

  function handleStatutBenefAdmin(benefId, newStatut) {
    setModalCl(prev => prev ? ({
      ...prev,
      apprenants: (prev.apprenants || []).map(a => a.id === benefId ? { ...a, statut: newStatut } : a),
    }) : prev);
  }

  // ── Bénéficiaires réels ──
  const [benefs,      setBenefs]      = useState([]);
  const [chargBenefs, setChargBenefs] = useState(true);
  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/beneficiaires`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setBenefs(d.beneficiaires || []))
      .catch(console.error)
      .finally(() => setChargBenefs(false));
  }, [entreprise.id]);

  // ── Credentials RH ──
  const [credentials,  setCredentials]  = useState(null);
  const [chargCred,    setChargCred]    = useState(false);
  const [showCred,     setShowCred]     = useState(false);
  const [mdpVisible,   setMdpVisible]   = useState(false);
  const [copie,        setCopie]        = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [createForm,   setCreateForm]   = useState({ prenom:'', nom:'', email: entreprise.referent_rh_email || '' });
  const [createLoading,setCreateLoading]= useState(false);

  function voirAcces() {
    if (credentials) { setShowCred(true); return; }
    setChargCred(true);
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/credentials`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => { if (d.credentials) setCredentials(d.credentials); else setCredentials({ error: d.error }); setShowCred(true); })
      .catch(() => setCredentials({ error: 'Erreur réseau' }))
      .finally(() => setChargCred(false));
  }

  async function reinitialiserMdp() {
    if (resetLoading) return;
    setResetLoading(true);
    try {
      const res = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/reset-password`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur serveur');
      setCredentials(prev => ({ ...prev, mdp_initial: d.nouveau_mdp, mdp_temporaire: true }));
      setMdpVisible(true);
      setResetConfirm(false);
    } catch (err) {
      await alerte('Erreur : ' + err.message, { danger: true });
    } finally { setResetLoading(false); }
  }

  function copier(texte, champ) {
    navigator.clipboard.writeText(texte).then(() => { setCopie(champ); setTimeout(() => setCopie(''), 2000); });
  }

  // ── Versements (table paiements_entreprises, partagée avec GestionEntreprises.jsx) ──
  // ⚠️ La façade "admin_elearning" est partagée entre un éventuel admin e-learning ET le rôle
  // physique "commercial" (l'assistante e-learning) - voir ROLE_MAP_BET dans constants/roles.js.
  // La whitelister ici court-circuiterait TOUJOURS la matrice de permissions pour l'assistante,
  // quoi que l'admin configure dans Gestion des droits. Seul "admin_manager" (super_admin/admin/
  // manager) est une façade sans ambiguïté - on peut la garder comme accès admin implicite.
  const entrepriseRefusee = entreprise.statut === 'refuse';
  /* LE SUPER ADMIN CONSULTE, IL NE SAISIT PAS. Les versements entreprise sont le
     travail de l'assistante e-learning et de la commerciale ; le SuperAdmin les
     surveille. Rien ici ne relève de la sécurité - `requirePermission` laisse de
     toute façon passer le super_admin côté serveur (requireAdmin.js:411) - c'est
     une répartition du travail, et elle se dit donc dans l'interface.
     `profile.role` porte le rôle BRUT de la base, pas la façade : on peut viser
     le seul super_admin sans emporter `admin` ni `manager`, qui gardent la main. */
  const estSuperAdminLectureSeule = profile?.role === 'super_admin';
  const peutSaisirVersement = !entrepriseRefusee && !estSuperAdminLectureSeule && (estRole(profile?.role, 'admin_manager') || profile?.permissions?.finances?.create === true);
  const peutModifierVersement = !entrepriseRefusee && !estSuperAdminLectureSeule && (estRole(profile?.role, 'admin_manager') || profile?.permissions?.finances?.update === true);
  // Suppression réservée à l'admin BET - jamais à l'assistante e-learning, même si un rôle
  // "commercial" venait un jour à cocher "Modifier" sur le module Finances.
  const peutSupprimerVersement = !estSuperAdminLectureSeule && (estRole(profile?.role, ['admin_manager', 'admin_superviseur']) || profile?.permissions?.finances?.delete === true);
  /* Vérifier une déclaration d'entreprise, c'est modifier un versement : même droit.
     L'assistante e-learning le reçoit par `finances.update` (accordé en base par
     paiements_entreprises_preuves.sql), et non par une exception de rôle - la
     matrice de droits reste la seule autorité, conformément à la note ci-dessus. */
  const peutValiderVersement = !entrepriseRefusee && peutModifierVersement;
  /* CONSULTER UN VERSEMENT ET EN IMPRIMER LE REÇU SONT DES LECTURES, et elles ne
     dépendent donc d'aucun droit d'écriture.
     Elles étaient adossées à `peutSaisirVersement` : un rôle sans `finances.create`
     - l'assistante e-learning tant que la matrice ne le lui accorde pas, le
     SuperAdmin désormais - perdait non seulement les boutons de saisie mais la
     colonne Actions entière, donc le reçu, et jusqu'à la fiche détail où se lisent
     les justificatifs. Qui voit déjà l'onglet Paiements a `finances.read` ; lui
     refuser la lecture de ce qu'il a sous les yeux n'avait aucun sens.
     La seule exception est l'Onboarding, tenu à l'écart du volet financier par
     choix d'organisation : l'argent est du ressort de la commerciale. */
  const estOnboarding = estRole(profile?.role, 'admin_onboarding');
  const peutVoirDetailVersement = !estOnboarding;
  const [versements, setVersements] = useState([]);
  const [chargVersements, setChargVersements] = useState(false);
  const [showFormVers, setShowFormVers] = useState(false);
  const [savingVers, setSavingVers] = useState(false);
  const [paiementDetail, setPaiementDetail] = useState(null);
  const [editVersId, setEditVersId] = useState(null);
  const [traitementVers, setTraitementVers] = useState(null);   // id du versement en cours de validation/rejet
  const [formVers, setFormVers] = useState({ montant:'', date: new Date().toISOString().split('T')[0], mode:'virement', reference:'', note:'' });

  const chargerVersements = useCallback(() => {
    setChargVersements(true);
    return fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setVersements(d.paiements || []))
      .catch(() => {})
      .finally(() => setChargVersements(false));
  }, [entreprise.id]);

  useEffect(() => {
    if (tab !== 'paiements') return;
    chargerVersements();
  }, [tab, chargerVersements]);

  /* Validation / rejet d'un versement déclaré par l'entreprise. Le rejet exige un
     motif : sans lui, le RH ne sait pas quoi corriger et redéclare à l'identique. */
  async function trancherVersement(v, action) {
    let motif = null;
    if (action === 'rejeter') {
      motif = await demander(
        `Pourquoi le versement de ${formatFCFA(v.montant)} déclaré par ${entreprise.nom} ne peut-il pas être validé ?\n\nCe motif sera envoyé au RH de l'entreprise.`,
        { titre: 'Rejeter le versement', placeholder: 'ex : le montant du justificatif ne correspond pas', confirmLabel: 'Rejeter le versement' }
      );
      if (!motif || !motif.trim()) return;
    } else {
      const ok = await confirm(
        `Valider le versement de ${formatFCFA(v.montant)} déclaré par ${entreprise.nom} ?\n\nLe montant sera enregistré sur le contrat et entrera en trésorerie. Vérifiez d'abord le justificatif.`,
        { titre: 'Valider le versement', confirmLabel: 'Oui, j\'ai vérifié', danger: false }
      );
      if (!ok) return;
    }

    setTraitementVers(v.id);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements/${v.id}/${action}`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'rejeter' ? { motif: motif.trim() } : {}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Opération impossible');
      await chargerVersements();
      onEntrepriseMaj?.();   // le « Total versé » du contrat change, la liste derrière aussi
      toast.success(action === 'valider' ? 'Versement validé et enregistré.' : 'Versement rejeté, le RH est notifié.');
    } catch (err) {
      await alerte(err.message, { titre: 'Opération impossible', danger: true });
    } finally {
      setTraitementVers(null);
    }
  }

  // ── Champs réels de l'entreprise ──
  const cfg         = STATUT_ENT[entreprise.statut] || STATUT_ENT.actif;
  const nbLicences  = entreprise.nb_licences || 0;
  const nbActifs    = benefs.filter(b => b.statut === 'actif').length;
  const pct         = nbLicences > 0 ? Math.round((nbActifs / nbLicences) * 100) : 0;
  const jours       = entreprise.date_fin_contrat ? joursRestants(entreprise.date_fin_contrat) : null;
  const montantContrat = Number(entreprise.montant_contrat || 0);
  /* SEUL CE QUI EST VALIDÉ EST VERSÉ. Un versement déclaré par le RH et pas
     encore vérifié resterait sinon compté comme encaissé - le solde afficherait
     une dette éteinte sur la foi d'une pièce que personne n'a ouverte. */
  const versementsEnAttente = versements.filter(v => v.statut === 'declare');
  const totalVerse  = versements.filter(estVerse).reduce((s, v) => s + Number(v.montant || 0), 0);
  const totalEnAttente = versementsEnAttente.reduce((s, v) => s + Number(v.montant || 0), 0);
  const soldeRestant = Math.max(0, montantContrat - totalVerse);
  const pctPaie     = montantContrat > 0 ? Math.round((totalVerse / montantContrat) * 100) : 0;

  const ACTIVITE = [
    { icone:'📝', lib:'Entreprise créée',        detail:`Package ${entreprise.package_elearning || '-'}`,              date: (entreprise.created_at || '').slice(0,10) || '-' },
    { icone:'👤', lib:'Bénéficiaires inscrits',  detail:`${benefs.length} bénéficiaire(s) ajouté(s)`,                  date: entreprise.date_debut_contrat || '-' },
    { icone:'📧', lib:'Contact RH',               detail:`${entreprise.referent_rh_nom || '-'} - ${entreprise.referent_rh_email || '-'}`, date: '-' },
    { icone:'📊', lib:'Tests de niveau',          detail:`${benefs.filter(b => b.niveau_cecr || b.niveau).length} bénéf(s) évalué(s)`, date:'-' },
  ];

  const TABS = [
    { id:'infos',         lib:'Informations',   icone:'🏢' },
    { id:'beneficiaires', lib:'Bénéficiaires',  icone:'👥', badge: benefs.length },
    { id:'contrat',       lib:'Contrat',         icone:'📄' },
    { id:'paiements',     lib:'Paiements',       icone:'💳', badge: versements.length },
    { id:'documents',     lib:'Documents',       icone:'📁', badge: documents.length || null },
    { id:'activite',      lib:'Activité',        icone:'📋' },
  ];

  const S = {
    overlay:   { position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, backdropFilter:'blur(3px)' },
    modal:     { background:COULEURS.gris50, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden' },
    header:    { background:`linear-gradient(135deg, ${entreprise.couleur}CC 0%, ${entreprise.couleur} 100%)`, padding:'24px 28px', flexShrink:0 },
    headerTop: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 },
    avatar:    { width:56, height:56, borderRadius:14, background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'#fff', flexShrink:0, overflow:'hidden' },
    btnX:      { background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:8, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, color:'#fff', flexShrink:0 },
    hStat:     { textAlign:'center' },
    hSep:      { width:1, background:'rgba(255,255,255,0.2)', alignSelf:'stretch' },
    tabs:      { display:'flex', background:COULEURS.blanc, borderBottom:`1px solid ${COULEURS.gris200}`, padding:'0 8px', flexShrink:0, overflowX:'auto', scrollbarWidth:'none' },
    tab:    (a) => ({ display:'flex', alignItems:'center', gap:5, padding:'10px 12px', cursor:'pointer', border:'none', background:'transparent', borderBottom:a?`2px solid ${entreprise.couleur}`:'2px solid transparent', color:a?entreprise.couleur:COULEURS.gris600, fontWeight:a?700:500, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif', marginBottom:-1, transition:'all 0.15s', whiteSpace:'nowrap', flexShrink:0 }),
    badge:  (a) => ({ background:a?entreprise.couleur:COULEURS.gris200, color:a?'#fff':COULEURS.gris600, borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700 }),
    corps:     { flex:1, overflowY:'auto', padding:24 },
    carteInfo: { background:COULEURS.blanc, borderRadius:12, padding:'14px 18px', border:`1px solid ${COULEURS.gris200}` },
    lbl:       { fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 },
    val:       { fontSize:14, fontWeight:600, color:COULEURS.navy },
    ligneC:    { display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${COULEURS.gris50}`, fontSize:13 },
    ligneBen:  { display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:`1px solid ${COULEURS.gris100}` },
    footer:    { padding:'16px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', background:COULEURS.blanc, flexShrink:0 },
    statBadge: (bg,txt) => ({ display:'inline-block', padding:'3px 10px', borderRadius:20, background:bg, color:txt, fontSize:11, fontWeight:600 }),
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* ── Header coloré ── */}
        <div style={S.header}>
          <div style={S.headerTop}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={S.avatar}>
                {entreprise.logo_url && !entreprise.logo_url.startsWith('blob:')
                  ? <img src={entreprise.logo_url} alt={entreprise.nom} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'inherit' }} onError={e => { e.target.style.display='none'; }} />
                  : entreprise.initiales || '🏢'
                }
              </div>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:'#fff', lineHeight:1.2, marginBottom:4 }}>{entreprise.nom}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>{[entreprise.secteur, entreprise.ville].filter(Boolean).join(' · ')}</div>
                <div style={{ marginTop:6, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ ...S.statBadge(cfg.bg, cfg.txt), fontSize:10 }}>{cfg.lib}</span>
                  {!peutModifier && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'rgba(0,0,0,0.3)', color:'rgba(255,255,255,0.85)', letterSpacing:'0.03em' }}>🔒 Lecture seule</span>
                  )}
                </div>
              </div>
            </div>
            <button style={S.btnX} onClick={onFermer}>×</button>
          </div>
          {/* Mini stats */}
          <div style={{ display:'flex', gap:20 }}>
            {[
              { l:'Bénéficiaires', v:`${nbActifs}/${nbLicences}` },
              { l:'Contrat',       v: montantContrat > 0 ? `${(montantContrat/1000000).toFixed(1)}M FCFA` : '-' },
              { l:'Remplissage',   v:`${pct}%` },
              ...(jours !== null ? [{ l:'Fin contrat', v: jours > 0 ? `J-${jours}` : 'Expiré', alert: jours < 60 }] : []),
            ].map((s, i, arr) => (
              <div key={i} style={{ display:'flex', gap:20, alignItems:'stretch' }}>
                {i > 0 && <div style={S.hSep} />}
                <div style={S.hStat}>
                  <div style={{ fontSize:18, fontWeight:800, color: s.alert ? '#FCA5A5' : '#fff' }}>{s.v}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              <span>{t.icone}</span><span>{t.lib}</span>
              {t.badge != null && <span style={S.badge(tab === t.id)}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ── Corps ── */}
        <div style={S.corps}>

          {/* INFORMATIONS */}
          {tab === 'infos' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {[
                  ['Secteur d\'activité', entreprise.secteur],
                  ['Référent RH', entreprise.referent_rh_nom],
                  ['Email RH', entreprise.referent_rh_email],
                  ['Téléphone RH', entreprise.referent_rh_telephone],
                  ['Package', entreprise.package_elearning],
                  ['Licences', entreprise.nb_licences ? `${entreprise.nb_licences} places` : '-'],
                ].map(([l, v]) => (
                  <div key={l} style={S.carteInfo}>
                    <div style={S.lbl}>{l}</div>
                    <div style={{ ...S.val, color: l === 'Email RH' ? couleurTheme : COULEURS.navy }}>{v || '-'}</div>
                  </div>
                ))}
                <div style={{ ...S.carteInfo, gridColumn:'1 / -1' }}>
                  <div style={S.lbl}>Adresse</div>
                  <div style={S.val}>{[entreprise.adresse, entreprise.ville].filter(Boolean).join(' · ') || '-'}</div>
                </div>
              </div>
              {/* Barre occupation */}
              <div style={S.carteInfo}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={S.lbl}>Taux d'occupation des places</div>
                  <span style={{ fontSize:13, fontWeight:700, color:entreprise.couleur }}>{pct}%</span>
                </div>
                <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:entreprise.couleur, borderRadius:4, transition:'width 0.5s' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:COULEURS.gris400, marginTop:6 }}>
                  <span>{nbActifs} actifs</span>
                  <span>{nbLicences} places</span>
                </div>
              </div>
              {/* ── Types de sessions ── */}
              <div style={{ ...S.carteInfo, marginTop:16 }}>
                <div style={{ ...S.lbl, marginBottom:10 }}>Modalités de sessions souscrites</div>
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  {[
                    { val:'presentiel', ic:'🏢', lib:'Présentiel', sub:'Cours en salle', col:'#F59E0B' },
                    { val:'ligne',      ic:'📹', lib:'En ligne',   sub:'Zoom · Meet · Teams', col:couleurTheme },
                  ].map(({ val, ic, lib, sub, col }) => {
                    const actif = typesSessionsLocal.includes(val);
                    return (
                      <button key={val} type="button"
                        onClick={() => {
                          if (!peutModifier) return;
                          if (actif && typesSessionsLocal.length === 1) return;
                          setTypesSessionsLocal(prev =>
                            actif ? prev.filter(t => t !== val) : [...prev, val]
                          );
                        }}
                        style={{ flex:1, padding:'12px 10px', borderRadius:10, border:`2px solid ${actif ? col : COULEURS.gris200}`, background: actif ? `${col}15` : COULEURS.blanc, cursor: !peutModifier ? 'default' : (typesSessionsLocal.length === 1 && actif ? 'not-allowed' : 'pointer'), textAlign:'center', transition:'all 0.15s', opacity: (!peutModifier || (typesSessionsLocal.length === 1 && actif)) ? 0.7 : 1, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                      >
                        <div style={{ fontSize:22, marginBottom:3 }}>{ic}</div>
                        <div style={{ fontSize:13, fontWeight:700, color: actif ? col : COULEURS.navy }}>{lib}</div>
                        <div style={{ fontSize:10, color: actif ? col : COULEURS.gris400 }}>{sub}</div>
                        {actif && <div style={{ marginTop:5, fontSize:9, fontWeight:800, color:col, textTransform:'uppercase', letterSpacing:'0.05em' }}>✓ Activé</div>}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>
                  {typesSessionsLocal.length === 2
                    ? '🔀 Formule hybride - les deux modalités sont disponibles pour cette entreprise.'
                    : typesSessionsLocal.includes('presentiel')
                      ? '🏢 Présentiel uniquement - peut être étendu aux sessions en ligne à tout moment.'
                      : '📹 En ligne uniquement - sessions live avec lien visioconférence.'
                  }
                </div>
              </div>
              {entreprise.notes && (
                <div style={{ ...S.carteInfo, background:'#FFFBEB', border:'1px solid #FDE68A', marginTop:16 }}>
                  <div style={{ ...S.lbl, color:'#92400E' }}>Notes internes</div>
                  <div style={{ fontSize:13, color:'#78350F', lineHeight:1.6 }}>{entreprise.notes}</div>
                </div>
              )}
            </>
          )}

          {/* BÉNÉFICIAIRES - classes d'abord */}
          {tab === 'beneficiaires' && (
            <>
              {/* KPIs globaux */}
              <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
                {[
                  { l:'Classes',    v: classes.length,                                       c: entreprise.couleur },
                  { l:'Total',      v: benefs.length,                                        c: COULEURS.navy },
                  { l:'Actifs',     v: benefs.filter(b=>b.statut==='actif').length,          c: COULEURS.succes },
                  { l:'En attente', v: benefs.filter(b=>b.statut==='en_attente'||b.statut==='test_niveau_pending').length, c: COULEURS.attention },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ flex:1, minWidth:90, background:COULEURS.blanc, borderRadius:10, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:800, color:c }}>{v}</div>
                    <div style={{ fontSize:10, color:COULEURS.gris400 }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Grille de classes */}
              {chargClasses ? (
                <div style={{ textAlign:'center', padding:32, color:COULEURS.gris400 }}>Chargement des classes…</div>
              ) : classes.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400, border:`2px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🏫</div>
                  <div style={{ fontWeight:600, marginBottom:6 }}>Aucune classe assignée</div>
                  <div style={{ fontSize:12 }}>Les bénéficiaires apparaîtront ici une fois assignés à une classe.</div>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
                  {classes.map(c => {
                    const horaires = Array.isArray(c.horaire) ? c.horaire : [];
                    const NIV_C = { A0:'#94A3B8', A1:'#60A5FA', A2:'#34D399', B1:'#818CF8', B2:'#F59E0B', C1:'#F97316', C2:'#EF4444' };
                    return (
                      <div key={c.id}
                        onClick={() => setModalCl(c)}
                        style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', cursor:'pointer', transition:'box-shadow 0.2s, transform 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'; e.currentTarget.style.transform=''; }}
                      >
                        <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding:'14px 16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div style={{ fontSize:13, fontWeight:800, color:'#fff', lineHeight:1.3, flex:1, marginRight:8 }}>{c.nom}</div>
                            {c.niveau && <span style={{ background:'rgba(255,255,255,0.25)', color:'#fff', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:800, flexShrink:0 }}>{c.niveau}</span>}
                          </div>
                          {horaires.length > 0 && (
                            <div style={{ marginTop:6, fontSize:10, color:'rgba(255,255,255,0.85)' }}>
                              📅 {horaires.slice(0,2).map(h=>`${h.jour} ${h.debut}–${h.fin}`).join(' · ')}
                              {horaires.length > 2 && ` +${horaires.length-2}`}
                            </div>
                          )}
                        </div>
                        <div style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ width:32, height:32, borderRadius:8, background:`${entreprise.couleur}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:entreprise.couleur }}>{c.apprenants?.length||0}</div>
                              <div>
                                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>{c.apprenants?.length||0} bénéficiaire{(c.apprenants?.length||0)!==1?'s':''}</div>
                                <div style={{ fontSize:10, color:COULEURS.gris400 }}>{c.capacite_max ? `/ ${c.capacite_max} places` : 'inscrits'}</div>
                              </div>
                            </div>
                            <span style={{ background: c.statut==='actif' ? '#D1FAE5' : '#FEF3C7', color: c.statut==='actif' ? '#065F46' : '#92400E', borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:700 }}>
                              {c.statut === 'actif' ? 'Active' : c.statut}
                            </span>
                          </div>
                          {c.coach_nom && <div style={{ fontSize:11, color:COULEURS.gris600, marginBottom:2 }}>👨‍🏫 {c.coach_nom}</div>}
                          {c.date_debut && <div style={{ fontSize:11, color:COULEURS.gris600 }}>📅 {new Date(c.date_debut).toLocaleDateString('fr-FR')}</div>}
                          <div style={{ marginTop:10, paddingTop:8, borderTop:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:4 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:entreprise.couleur }}>Voir le détail →</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </>
          )}

          {/* CONTRAT */}
          {tab === 'contrat' && (
            <>
              <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10, marginBottom:14 }}>
                {peutGererContrat && contratActif && (
                  <select
                    value={contratActif.statut || 'actif'}
                    onChange={e => changerStatutContratLocal(e.target.value)}
                    style={{ padding:'7px 10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:12, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', background:COULEURS.blanc, color:COULEURS.navy }}
                  >
                    <option value="brouillon">📝 Brouillon</option>
                    <option value="actif">✅ Actif</option>
                    <option value="suspendu">⏸️ Suspendu</option>
                    <option value="expire">⌛ Expiré</option>
                    <option value="resilie">🚫 Résilié</option>
                  </select>
                )}
                {(peutGererContrat || peutProposerRenouvellement) ? (
                  <button
                    onClick={() => setModalRenouvellement(true)}
                    style={{ padding:'7px 14px', borderRadius:8, border:'none', background:entreprise.couleur, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                  >
                    {peutGererContrat ? '🔄 Renouveler le contrat' : '🔄 Proposer un renouvellement'}
                  </button>
                ) : (
                  <span style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:'#F1F5F9', color:'#64748B', fontWeight:600 }}>🔒 Lecture seule</span>
                )}
              </div>
              
              {entreprise.date_debut_contrat || entreprise.montant_contrat ? (
                <>
                  <div style={{ background:COULEURS.blanc, borderRadius:12, padding:20, border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${entreprise.couleur}`, marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      📄 Package {entreprise.package_elearning || '-'}
                    </div>
                    {[
                      { l:'Date de début',           v: entreprise.date_debut_contrat || '-' },
                      { l:'Date de fin',             v: entreprise.date_fin_contrat   || '-' },
                      ...(entreprise.date_debut_contrat && entreprise.date_fin_contrat
                          ? [{ l:'Durée', v: dureeFormation(entreprise.date_debut_contrat, entreprise.date_fin_contrat) }]
                          : []),
                      { l:'Nombre de licences',      v: entreprise.nb_licences ? `${entreprise.nb_licences} places` : '-' },
                      { l:'Option replay',           v: entreprise.option_replay ? '✓ Activé' : '✗ Non' },
                      ...(jours !== null ? [{ l:'Temps restant', v: jours > 0 ? `${jours} jours (J-${jours})` : '⚠️ Expiré', rouge: jours < 60 }] : []),
                    ].map(({l, v, rouge}) => (
                      <div key={l} style={S.ligneC}>
                        <span style={{ color:COULEURS.gris600 }}>{l}</span>
                        <span style={{ fontWeight:600, color: rouge ? '#DC2626' : COULEURS.navy }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:COULEURS.blanc, borderRadius:12, padding:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span>💰 Situation financière</span>
                      <button onClick={() => setTab('paiements')} style={{ fontSize:11, color:couleurTheme, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        Voir les paiements →
                      </button>
                    </div>
                    {[
                      { l:'Montant total contrat', v: formatFCFA(montantContrat), accent:true },
                      { l:'Total versé',           v: formatFCFA(totalVerse) },
                      { l:'Solde restant',         v: formatFCFA(soldeRestant), rouge: soldeRestant > 0 },
                    ].map(({l, v, accent, rouge}) => (
                      <div key={l} style={S.ligneC}>
                        <span style={{ color:COULEURS.gris600 }}>{l}</span>
                        <span style={{ fontWeight:600, fontSize: accent?15:13, color: rouge?'#DC2626': accent?entreprise.couleur:COULEURS.navy }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:COULEURS.gris400, marginBottom:6 }}>
                        <span>Taux de paiement</span>
                        <span style={{ fontWeight:700, color: pctPaie===100?COULEURS.succes:COULEURS.attention }}>{pctPaie}%</span>
                      </div>
                      <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pctPaie}%`, background: pctPaie===100?COULEURS.succes:COULEURS.attention, borderRadius:4 }} />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign:'center', padding:'48px 20px', color:COULEURS.gris400 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
                  <div>Aucune information de contrat renseignée pour cette entreprise.</div>
                </div>
              )}

              {/* ── Historique des contrats précédents (renouvellements) ── */}
              {contratsHistorique.filter(c => c.id !== contratActif?.id).length > 0 && (
                <div style={{ marginTop:24 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>
                    📚 Historique des contrats ({contratsHistorique.filter(c => c.id !== contratActif?.id).length})
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {contratsHistorique.filter(c => c.id !== contratActif?.id).map(c => {
                      const cfgC = STATUT_CONTRAT_LIB[c.statut] || STATUT_CONTRAT_LIB.expire;
                      const ouvert = contratHistoriqueOuvert === c.id;
                      return (
                        <div key={c.id} style={{ background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'12px 16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>📄 REF-{(c.id || '').split('-')[0]?.toUpperCase() || '-'} - Package {c.package || '-'}</span>
                            <span style={{ padding:'2px 10px', borderRadius:20, background:cfgC.bg, color:cfgC.txt, fontSize:10, fontWeight:700 }}>{cfgC.lib}</span>
                          </div>
                          <div style={{ fontSize:11, color:COULEURS.gris600 }}>
                            {c.date_debut || '-'} → {c.date_fin || '-'} · {c.nb_licences || 0} places · {formatFCFA(c.montant_ht)}
                          </div>
                          {c.statut === 'brouillon' && peutGererContrat && (
                            <div style={{ marginTop:8, padding:'8px 10px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:11, color:'#92400E' }}>🕒 Renouvellement proposé - en attente de validation</span>
                              <button
                                onClick={async () => {
                                  if (!(await confirm(`Valider ce renouvellement pour ${entreprise.nom} ? L'ancien contrat sera archivé et ce nouveau contrat sera activé.`, { titre: 'Valider le renouvellement', confirmLabel: 'Valider', danger: false }))) return;
                                  validerRenouvellementLocal(c.id);
                                }}
                                style={{ padding:'5px 12px', borderRadius:7, border:'none', background:'#059669', color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                              >
                                ✓ Valider
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => setContratHistoriqueOuvert(ouvert ? null : c.id)}
                            style={{ marginTop:8, background:'none', border:'none', color:entreprise.couleur, fontSize:11, fontWeight:700, cursor:'pointer', padding:0, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                          >
                            {ouvert ? '▲ Masquer les détails' : '▼ Voir les détails'}
                          </button>
                          {ouvert && (
                            <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${COULEURS.gris200}` }}>
                              {[
                                { l:'Date de création',   v: c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-' },
                                { l:'Durée de formation', v: c.date_debut && c.date_fin ? dureeFormation(c.date_debut, c.date_fin) : '-' },
                                { l:'Type de sessions',   v: (c.types_sessions || []).join(', ') || '-' },
                                { l:'Option replay',      v: c.option_replay ? '✓ Activé' : '✗ Non' },
                                { l:'Devise',              v: c.devise || 'FCFA' },
                              ].map(({ l, v }) => (
                                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:11 }}>
                                  <span style={{ color:COULEURS.gris400 }}>{l}</span>
                                  <span style={{ fontWeight:600, color:COULEURS.navy }}>{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* PAIEMENTS */}
          {tab === 'paiements' && (() => {
            const pctTotal = montantContrat > 0 ? Math.min(100, Math.round((totalVerse / montantContrat) * 100)) : 0;
            const MODES = { virement:'Virement', cheque:'Chèque', especes:'Espèces', mobile_money:'Mobile Money' };

            function ouvrirAjout() {
              setEditVersId(null);
              setFormVers({ montant:'', date: new Date().toISOString().split('T')[0], mode:'virement', reference:'', note:'' });
              setShowFormVers(true);
            }
            async function sauvegarder() {
              if (!formVers.montant || !formVers.date || savingVers) return;
              const msg = editVersId
                ? `Corriger ce versement à ${formatFCFA(Number(formVers.montant))} pour ${entreprise.nom} ?`
                : `Enregistrer un versement de ${formatFCFA(Number(formVers.montant))} pour ${entreprise.nom} ?`;
              if (!(await confirm(msg, { titre: editVersId ? 'Confirmer la correction' : 'Confirmer le versement', confirmLabel: editVersId ? 'Corriger' : 'Enregistrer', danger: false }))) return;
              setSavingVers(true);
              try {
                const url = editVersId
                  ? `${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements/${editVersId}`
                  : `${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements`;
                const r = await fetch(url, {
                  method: editVersId ? 'PATCH' : 'POST', headers: _authHdrsAdmin(),
                  body: JSON.stringify({ ...formVers, montant: Number(formVers.montant) }),
                });
                const d = await r.json();
                if (!r.ok) { await alerte(d.error || 'Erreur lors de l\'enregistrement du versement', { danger: true }); return; }
                if (editVersId) setVersements(prev => prev.map(v => v.id === editVersId ? d.paiement : v));
                else setVersements(prev => [d.paiement, ...prev]);
                setShowFormVers(false);
                setEditVersId(null);
              } catch (e) {
                await alerte('Erreur réseau', { danger: true });
              } finally {
                setSavingVers(false);
              }
            }

            async function supprimer(v) {
              if (!(await confirm(`Supprimer définitivement ce versement de ${formatFCFA(v.montant)} pour ${entreprise.nom} ?`, { titre: 'Supprimer le versement', confirmLabel: 'Supprimer', danger: true }))) return;
              try {
                const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements/${v.id}`, {
                  method: 'DELETE', headers: _authHdrsAdmin(),
                });
                const d = await r.json();
                if (!r.ok) { await alerte(d.error || 'Erreur lors de la suppression du versement', { danger: true }); return; }
                setVersements(prev => prev.filter(x => x.id !== v.id));
                setPaiementDetail(null);
              } catch (e) {
                await alerte('Erreur réseau', { danger: true });
              }
            }

            return (
              <>
                {/* KPI synthèse */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
                  {[
                    { l:'Montant total',  v: montantContrat > 0 ? formatFCFA(montantContrat) : '-', c: entreprise.couleur, i:'📄' },
                    { l:'Total versé',    v: formatFCFA(totalVerse),  c:'#059669', i:'💰' },
                    { l:'Solde restant',  v: formatFCFA(soldeRestant), c: soldeRestant > 0 ? '#DC2626' : '#059669', i:'⚖️' },
                  ].map(k => (
                    <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:10, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                      <div style={{ fontSize:18, marginBottom:4 }}>{k.i}</div>
                      <div style={{ fontSize:15, fontWeight:800, color:k.c }}>{k.v}</div>
                      <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{k.l}</div>
                    </div>
                  ))}
                </div>

                {/* Barre progression */}
                <div style={{ background:COULEURS.blanc, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}`, marginBottom:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                    <span style={{ fontWeight:600, color:COULEURS.navy }}>Progression du paiement</span>
                    <span style={{ fontWeight:800, color: pctTotal===100?'#059669':COULEURS.attention }}>{pctTotal}%</span>
                  </div>
                  <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pctTotal}%`, background: pctTotal===100?'#059669':COULEURS.attention, borderRadius:5, transition:'width 0.4s' }} />
                  </div>
                </div>

                {/* Header liste + bouton ajouter */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>Historique des versements ({versements.length})</div>
                  {peutSaisirVersement && !showFormVers && (
                    <button onClick={ouvrirAjout} style={{ background:'#059669', color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:5 }}>
                      + Nouveau versement
                    </button>
                  )}
                  {!peutSaisirVersement && (
                    <span title={estSuperAdminLectureSeule ? "La saisie et la validation des versements entreprise reviennent à l'assistante e-learning et à la commerciale." : undefined}
                      style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background: entrepriseRefusee ? '#FEE2E2' : '#F1F5F9', color: entrepriseRefusee ? '#991B1B' : '#64748B', fontWeight:600 }}>
                      {entrepriseRefusee
                        ? '❌ Inscription refusée - aucune saisie possible'
                        : estSuperAdminLectureSeule
                          ? '👁️ Supervision - saisie assurée par l\'assistante e-learning'
                          : '🔒 Lecture seule'}
                    </span>
                  )}
                </div>

                {/* Ce qui attend une vérification, dit avant la liste : c'est l'action
                    du jour, elle ne doit pas se découvrir en parcourant les lignes. */}
                {versementsEnAttente.length > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, background:'#FFFBEB', border:'1.5px solid #FCD34D', borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
                    <span style={{ fontSize:18 }}>🕐</span>
                    <div style={{ flex:1, fontSize:12, color:'#92400E' }}>
                      <strong>{versementsEnAttente.length} versement{versementsEnAttente.length > 1 ? 's' : ''} déclaré{versementsEnAttente.length > 1 ? 's' : ''} par l'entreprise</strong>
                      {' '}· {formatFCFA(totalEnAttente)} en attente de vérification.
                      {peutValiderVersement
                        ? ' Ouvrez le justificatif, puis validez ou rejetez.'
                        : ' La vérification revient à l\'assistante e-learning.'}
                    </div>
                  </div>
                )}

                {/* Formulaire ajout (lecture seule masqué) */}
                {showFormVers && (peutSaisirVersement || (editVersId && peutModifierVersement)) && (
                  <div style={{ background:'#F0FDF4', borderRadius:12, border:'1.5px solid #86EFAC', padding:'18px', marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:14 }}>
                      {editVersId ? '✏️ Modifier le versement' : '+ Nouveau versement'}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      {[
                        { lbl:'Montant (FCFA) *', key:'montant', type:'number', placeholder:'ex : 2 500 000' },
                        { lbl:'Date *',            key:'date',    type:'date',   placeholder:'' },
                        { lbl:'Référence',         key:'reference', type:'text', placeholder:'ex : VIR-2026-087' },
                      ].map(({ lbl, key, type, placeholder }) => (
                        <div key={key}>
                          <label style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:4 }}>{lbl}</label>
                          <input type={type} placeholder={placeholder}
                            value={formVers[key]}
                            onChange={e => setFormVers(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box', outline:'none' }}
                          />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:4 }}>Mode de paiement</label>
                        <select value={formVers.mode} onChange={e => setFormVers(f => ({ ...f, mode:e.target.value }))}
                          style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', background:'#fff', outline:'none' }}>
                          {[['virement','Virement bancaire'],['cheque','Chèque'],['especes','Espèces'],['mobile_money','Mobile Money']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom:12 }}>
                      <label style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:4 }}>Note</label>
                      <textarea value={formVers.note} onChange={e => setFormVers(f => ({ ...f, note:e.target.value }))} rows={2}
                        placeholder="Note ou commentaire interne..."
                        style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', boxSizing:'border-box', outline:'none' }}
                      />
                    </div>
                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                      <button onClick={() => { setShowFormVers(false); setEditVersId(null); }} disabled={savingVers} style={{ padding:'8px 16px', borderRadius:7, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>Annuler</button>
                      <button onClick={sauvegarder} disabled={!formVers.montant || !formVers.date || savingVers}
                        style={{ padding:'8px 18px', borderRadius:7, border:'none', background: formVers.montant && formVers.date ? '#059669' : COULEURS.gris200, color:'#fff', fontSize:12, fontWeight:700, cursor: formVers.montant && formVers.date ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        {savingVers ? '⏳ Enregistrement…' : (editVersId ? '✅ Enregistrer la correction' : '✅ Confirmer le versement')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Liste des versements */}
                {chargVersements ? (
                  <div style={{ textAlign:'center', padding:'36px 20px', color:COULEURS.gris400 }}>Chargement…</div>
                ) : versements.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'36px 20px', background:COULEURS.blanc, borderRadius:12, border:`2px dashed ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>💳</div>
                    <div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:4 }}>Aucun versement enregistré</div>
                    {peutSaisirVersement && <div style={{ fontSize:12, color:COULEURS.gris400 }}>Cliquez sur "+ Nouveau versement" pour saisir le premier paiement.</div>}
                  </div>
                ) : (() => {
                  /* La colonne existe dès qu'on a le droit de LIRE les versements :
                     elle porte le reçu, qui n'est pas une action d'écriture. La
                     conditionner aux droits de saisie la faisait disparaître pour
                     l'assistante et le SuperAdmin, reçu compris. */
                  const avecActions = peutVoirDetailVersement;
                  // Deux colonnes de plus que l'historique d'origine : le statut, et la
                  // preuve JUSTE À CÔTÉ des boutons - la vérificatrice doit pouvoir ouvrir
                  // le justificatif et valider sans quitter la ligne des yeux.
                  const colsVers = avecActions ? '0.9fr 1fr 0.9fr 1fr 1.1fr 100px 90px 150px' : '0.9fr 1fr 0.9fr 1fr 1.1fr 100px 90px';
                  return (
                  <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ display:'grid', gridTemplateColumns:colsVers, padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      <span>Date</span><span>Montant</span><span>Mode</span><span>Référence</span><span>Note</span><span>Statut</span><span>Preuve</span>{avecActions && <span>Actions</span>}
                    </div>
                    {versements.map((v, i) => (
                      // Ce modal ModalOnboardingEntreprise est partagé par plusieurs rôles (Onboarding,
                      // E-Learning, et 2 autres) - le détail/reçu n'est activé que pour ceux autorisés
                      // à saisir des versements (peutSaisirVersement), pas pour Onboarding (lecture seule).
                      <div key={v.id} onClick={() => peutVoirDetailVersement && setPaiementDetail(v)}
                        style={{ display:'grid', gridTemplateColumns:colsVers, padding:'12px 16px', borderBottom: i < versements.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', cursor: peutVoirDetailVersement ? 'pointer' : 'default' }}
                        onMouseEnter={e => { if (peutVoirDetailVersement) e.currentTarget.style.background = COULEURS.gris50; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ color:COULEURS.gris600 }}>{v.date}</span>
                        <span style={{ fontWeight:800, color: estVerse(v) ? '#059669' : COULEURS.gris600 }}>{formatFCFA(v.montant)}</span>
                        <span style={{ padding:'2px 8px', borderRadius:10, background:'#EDE9FE', color:'#6D28D9', fontSize:10, fontWeight:600, width:'fit-content' }}>{MODES[v.mode] || v.mode}</span>
                        <span style={{ fontSize:11, color:COULEURS.gris600 }}>{v.reference || '-'}</span>
                        <span style={{ fontSize:11, color:COULEURS.gris400, fontStyle: v.note ? 'normal' : 'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.note || '-'}</span>
                        <span>
                          <BadgeStatutVersement statut={v.statut} compact />
                          {v.declare_par_nom && (
                            <div style={{ fontSize:9, color:COULEURS.gris400, marginTop:2 }}>par l'entreprise</div>
                          )}
                        </span>
                        <span onClick={e => e.stopPropagation()}>
                          {(v.preuves || []).length > 0
                            ? <VignettesPreuves preuves={v.preuves} taille={30} />
                            : <span style={{ fontSize:11, color:COULEURS.gris400 }}>—</span>}
                        </span>
                        {avecActions && (
                          <span style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' }} onClick={e => e.stopPropagation()}>
                            {/* Valider / Rejeter ne concernent QUE les déclarations d'entreprise
                                en attente : un versement saisi par un admin naît déjà validé. */}
                            {v.statut === 'declare' && peutValiderVersement && (
                              <>
                                <button onClick={() => trancherVersement(v, 'valider')} disabled={traitementVers === v.id}
                                  title="Vérifier la preuve puis valider"
                                  style={{ padding:'4px 9px', borderRadius:6, border:'none', background:'#059669', color:'#fff', cursor: traitementVers === v.id ? 'wait' : 'pointer', fontSize:10, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                                  {traitementVers === v.id ? '⏳' : '✅ Valider'}
                                </button>
                                <button onClick={() => trancherVersement(v, 'rejeter')} disabled={traitementVers === v.id}
                                  title="Rejeter avec un motif"
                                  style={{ padding:'4px 9px', borderRadius:6, border:'1px solid #FCA5A5', background:'#FFF5F5', color:'#991B1B', cursor: traitementVers === v.id ? 'wait' : 'pointer', fontSize:10, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                                  ✖️ Rejeter
                                </button>
                              </>
                            )}
                            {v.statut === 'rejete' && peutValiderVersement && (
                              <button onClick={() => trancherVersement(v, 'valider')} disabled={traitementVers === v.id}
                                title="Revenir sur le rejet et valider"
                                style={{ padding:'4px 9px', borderRadius:6, border:'1px solid #86EFAC', background:'#F0FDF4', color:'#065F46', cursor:'pointer', fontSize:10, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                                ↺ Valider finalement
                              </button>
                            )}
                            {peutModifierVersement && v.statut !== 'declare' && (
                              <button onClick={() => { setFormVers({ montant: v.montant, date: (v.date||'').slice(0,10), mode: v.mode || 'virement', reference: v.reference || '', note: v.note || '' }); setEditVersId(v.id); setShowFormVers(true); }}
                                title="Modifier" style={{ width:26, height:26, borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, cursor:'pointer', fontSize:12 }}>✏️</button>
                            )}
                            {peutSupprimerVersement && (
                              <button onClick={() => supprimer(v)}
                                title="Supprimer" style={{ width:26, height:26, borderRadius:6, border:'1px solid #FCA5A5', background:'#FFF5F5', cursor:'pointer', fontSize:12 }}>🗑️</button>
                            )}
                            {/* Le reçu n'est éditable qu'une fois le versement validé :
                                sur une déclaration en attente, il attesterait d'un
                                encaissement que BET n'a pas confirmé avoir reçu. */}
                            {estVerse(v) && peutVoirDetailVersement && (
                              <button onClick={() => genererRecuVersement(v, entreprise, { montantContrat, soldeRestant })}
                                title="Imprimer le reçu"
                                style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${entreprise.couleur}`, background:COULEURS.blanc, color:entreprise.couleur, cursor:'pointer', fontSize:10, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                                🖨️ Reçu
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                    {/* Total */}
                    <div style={{ display:'grid', gridTemplateColumns:colsVers, padding:'10px 16px', background:COULEURS.navy, fontSize:12, alignItems:'center' }}>
                      <span style={{ fontWeight:700, color:'#fff' }}>TOTAL VALIDÉ</span>
                      <span style={{ fontWeight:900, color:'#FCD34D' }}>{formatFCFA(totalVerse)}</span>
                      <span></span><span></span>
                      <span style={{ fontSize:10, color:'rgba(255,255,255,0.65)' }}>
                        {totalEnAttente > 0 ? `+ ${formatFCFA(totalEnAttente)} en attente` : ''}
                      </span>
                      <span></span><span></span>{avecActions && <span></span>}
                    </div>
                  </div>
                  );
                })()}
              </>
            );
          })()}

          {/* DOCUMENTS */}
          {tab === 'documents' && (
            <>
              {peutModifier && (
                docFichierEnAttente ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:12, border:`1.5px solid ${entreprise.couleur}`, background:`${entreprise.couleur}08`, marginBottom:16 }}>
                    <span style={{ fontSize:18 }}>📄</span>
                    <span style={{ flex:1, fontSize:13, fontWeight:600, color:COULEURS.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {docFichierEnAttente.name}
                    </span>
                    <button type="button" onClick={() => setDocFichierEnAttente(null)} disabled={docUploading}
                      style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor: docUploading ? 'default' : 'pointer', background:'transparent', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      ✕ Annuler
                    </button>
                    <button type="button" onClick={validerDepotDocument} disabled={docUploading}
                      style={{ padding:'6px 14px', borderRadius:8, border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor: docUploading ? 'wait' : 'pointer', background:entreprise.couleur, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {docUploading ? 'Envoi…' : '✅ Valider le dépôt'}
                    </button>
                  </div>
                ) : (
                  <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'14px', borderRadius:12, border:`2px dashed ${COULEURS.gris200}`, cursor:'pointer', marginBottom:16, fontSize:13, fontWeight:600, color:entreprise.couleur, background:COULEURS.blanc }}>
                    📎 Déposer un document (PDF, Word, Excel… - max 10 Mo)
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style={{ display:'none' }} onChange={deposerDocument} />
                  </label>
                )
              )}
              {chargDocs ? (
                <div style={{ textAlign:'center', padding:30, color:COULEURS.gris400, fontSize:13 }}>Chargement…</div>
              ) : documentsAffiches.length === 0 ? (
                <div style={{ textAlign:'center', padding:30, color:COULEURS.gris400, fontSize:13 }}>Aucun document déposé pour cette entreprise.</div>
              ) : (
                documentsAffiches.map(doc => {
                  const estPreuve = doc.type === 'preuve_inscription';
                  return (
                    <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:`${entreprise.couleur}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{estPreuve ? '📎' : '📄'}</div>
                      <a href={doc.url} target="_blank" rel="noreferrer" style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, color:COULEURS.navy, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.nom}</div>
                        <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>{estPreuve ? `Document · Déposé par ${doc.depose_par_nom || '-'}` : `Déposé par ${doc.depose_par_nom || '-'}`}</div>
                      </a>
                      <span style={{ fontSize:11, color:COULEURS.gris400, flexShrink:0, marginRight: peutModifier ? 10 : 0 }}>{(doc.created_at || '').slice(0,10)}</span>
                      {peutModifier && (
                        <button type="button" onClick={() => supprimerDocument(doc.id)} disabled={docsEnSuppression.has(doc.id)} style={{ background:'transparent', border:'none', color:'#EF4444', cursor: docsEnSuppression.has(doc.id) ? 'not-allowed' : 'pointer', opacity: docsEnSuppression.has(doc.id) ? 0.5 : 1, fontSize:16, flexShrink:0 }} title="Supprimer">🗑️</button>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* ACTIVITÉ */}
          {tab === 'activite' && ACTIVITE.map((a, i) => (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:`${entreprise.couleur}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                {a.icone}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, color:COULEURS.navy, fontSize:13 }}>{a.lib}</div>
                <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>{a.detail}</div>
              </div>
              <div style={{ fontSize:11, color:COULEURS.gris400, flexShrink:0 }}>{a.date}</div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ ...S.footer, justifyContent:'space-between' }}>
          <button onClick={voirAcces} disabled={chargCred}
            style={{ padding:'9px 16px', borderRadius:8, border:`1.5px solid ${entreprise.couleur}`, background:`${entreprise.couleur}10`, color:entreprise.couleur, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
            {chargCred ? '⏳ Chargement…' : '🔑 Voir les accès'}
          </button>
          <button onClick={onFermer} style={{ padding:'9px 20px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
            Fermer
          </button>
        </div>
      </div>

      {/* ── Panneau credentials ── */}
      {showCred && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, backdropFilter:'blur(4px)' }} onClick={() => setShowCred(false)}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:640, maxWidth:'94vw', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
            <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding:'26px 32px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:19, fontWeight:800, color:'#fff' }}>🔑 Accès entreprise</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginTop:4 }}>{entreprise.nom}</div>
              </div>
              <button onClick={() => setShowCred(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:36, height:36, color:'#fff', fontSize:20, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ padding:32 }}>
              {credentials?.error ? (
                <div>
                  <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', color:'#92400E', borderRadius:10, padding:'12px 14px', fontSize:13, marginBottom:16 }}>
                    ⚠️ {credentials.error}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>Créer le compte RH</div>
                  {[
                    { lbl:'Prénom', key:'prenom', placeholder:'ex: Marie' },
                    { lbl:'Nom',    key:'nom',    placeholder:'ex: Dupont' },
                    { lbl:'Email',  key:'email',  placeholder:'rh@entreprise.com' },
                  ].map(({ lbl, key, placeholder }) => (
                    <div key={key} style={{ marginBottom:12 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{lbl}</div>
                      <input
                        value={createForm[key]}
                        onChange={e => setCreateForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box', outline:'none' }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={async () => {
                      if (!createForm.email || createLoading) return;
                      setCreateLoading(true);
                      try {
                        const res = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/creer-compte-rh`, {
                          method: 'POST',
                          headers: _authHdrsAdmin(),
                          body: JSON.stringify({ rh_prenom: createForm.prenom, rh_nom: createForm.nom, rh_email: createForm.email }),
                        });
                        const d = await res.json();
                        if (!res.ok) throw new Error(d.error || 'Erreur serveur');
                        setCredentials({ email: d.email, prenom: d.prenom, nom: d.nom, mdp_initial: d.mot_de_passe, mdp_temporaire: true });
                        setMdpVisible(true);
                      } catch (err) {
                        await alerte('Erreur : ' + err.message, { danger: true });
                      } finally { setCreateLoading(false); }
                    }}
                    disabled={createLoading || !createForm.email}
                    style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', background: createForm.email ? entreprise.couleur : COULEURS.gris200, color:'#fff', fontSize:13, fontWeight:700, cursor: createForm.email ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:4 }}
                  >
                    {createLoading ? '⏳ Création…' : '✅ Créer le compte RH'}
                  </button>
                </div>
              ) : credentials ? (
                <>
                  <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#92400E', marginBottom:20 }}>
                    ⚠️ Ces informations sont confidentielles. Ne les partagez qu'avec le responsable RH concerné.
                  </div>
                  {[
                    { lbl:'Prénom Nom', val:`${credentials.prenom || ''} ${credentials.nom || ''}`.trim() },
                    { lbl:'Email de connexion', val: credentials.email, champ:'email' },
                    { lbl:'Mot de passe', val: credentials.mdp_initial || '(réinitialisé)', champ:'mdp', masque: true },
                  ].map(({ lbl, val, champ, masque }) => (
                    <div key={lbl} style={{ marginBottom:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>{lbl}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, background:COULEURS.gris50, borderRadius:8, padding:'10px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                        <span style={{ flex:1, fontSize:13, fontWeight:600, color:COULEURS.navy, fontFamily: masque ? 'monospace' : 'inherit', letterSpacing: masque ? '0.05em' : 'normal' }}>
                          {masque && !mdpVisible ? '••••••••••••' : val}
                        </span>
                        {masque && (
                          <button onClick={() => setMdpVisible(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:COULEURS.gris400 }}>
                            {mdpVisible ? '🙈' : '👁'}
                          </button>
                        )}
                        {champ && val && (
                          <button onClick={() => copier(val, champ)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color: copie===champ ? COULEURS.succes : couleurTheme, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                            {copie === champ ? '✓ Copié' : 'Copier'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {credentials.mdp_temporaire && (
                    <div style={{ background:'#EFF6FF', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#1D4ED8', marginTop:8 }}>
                      ℹ️ Mot de passe temporaire - l'utilisateur est invité à le modifier à la première connexion.
                    </div>
                  )}

                  <div style={{ marginTop:20, borderTop:`1px solid ${COULEURS.gris200}`, paddingTop:16 }}>
                    {!resetConfirm ? (
                      <>
                        <button onClick={() => setResetConfirm(true)}
                          style={{ width:'100%', padding:'10px', borderRadius:9, border:'1.5px solid #DC2626', background:'#FEF2F2', color:'#DC2626', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          🔄 Réinitialiser le mot de passe
                        </button>
                        {/* Renvoi des accès par email - envoi réel à configurer plus tard */}
                        <button onClick={() => toast.success(`📧 Accès renvoyés par email à ${credentials.email}`)}
                          style={{ width:'100%', padding:'10px', borderRadius:9, border:`1.5px solid ${couleurTheme}`, background:'#fff', color: couleurTheme, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:10 }}>
                          📧 Renvoyer les accès par email
                        </button>
                      </>
                    ) : (
                      <div style={{ background:'#FEF2F2', borderRadius:10, border:'1.5px solid #FECACA', padding:'14px 16px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#991B1B', marginBottom:10 }}>
                          ⚠️ Confirmer la réinitialisation ?
                        </div>
                        <div style={{ fontSize:12, color:'#7F1D1D', marginBottom:14, lineHeight:1.5 }}>
                          Un nouveau mot de passe temporaire sera généré et l'ancien sera immédiatement invalidé.
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={reinitialiserMdp} disabled={resetLoading}
                            style={{ flex:2, padding:'9px', borderRadius:8, border:'none', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor: resetLoading ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            {resetLoading ? '⏳ En cours…' : '✅ Confirmer'}
                          </button>
                          <button onClick={() => setResetConfirm(false)}
                            style={{ flex:1, padding:'9px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail classe */}
      {modalCl && (
        <ModalDetailClasseAdmin
          classe={modalCl}
          entreprise={entreprise}
          onFermer={() => setModalCl(null)}
          onOuvrirBenef={b => setBen(b)}
          onStatutChange={handleStatutBenefAdmin}
        />
      )}

      {/* Modal détail bénéficiaire — LA MÊME FICHE QUE PARTOUT AILLEURS.
          Ce chemin (Entreprises → classe → bénéficiaire) ouvrait `ModalDetailBenef`, une
          SECONDE fiche apprenant, distincte de `ModalDetailApprenant` utilisée par Mes
          apprenants, Mes classes, le PA et l'Onboarding. Les deux ne se recouvraient qu'à
          moitié, et tous les enrichissements - Test de niveau, Historique, Accès réservé,
          objectif du client - n'étaient allés que dans la seconde : le même bénéficiaire
          montrait deux fiches différentes selon la porte empruntée.

          `ModalDetailApprenant` est un sur-ensemble strict : son onglet Présences porte
          déjà le taux et les filtres qu'offrait « Suivi », et l'onglet « Compétences » de
          l'ancienne fiche n'était qu'une ébauche affichant « bientôt disponibles ». Rien
          n'a donc été perdu au passage. */}
      {benDetail && (
        <ModalDetailApprenant
          apprenant={benDetail}
          groupe={modalCl ? { id: modalCl.id, nom: modalCl.nom } : null}
          entreprise={entreprise}
          onFermer={() => setBen(null)}
          /* Au-dessus de la fiche de classe (1500) qui l'a ouverte, elle-même au-dessus
             de la fiche entreprise. */
          zIndex={1700}
        />
      )}

      {/* Modal renouvellement de contrat (renouvellement direct pour l'admin BET,
          proposition à valider pour l'assistante e-learning) */}
      {modalRenouvellement && (
        <ModalRenouvellementContrat
          entreprise={entreprise}
          modeProposition={!peutGererContrat}
          beneficiairesActifs={benefs.filter(b => b.statut === 'actif').length}
          onFermer={() => setModalRenouvellement(false)}
          onSauvegarder={async (form) => {
            const ok = peutGererContrat
              ? await renouvelerContratLocal(form)
              : await proposerRenouvellementLocal(form);
            if (ok) setModalRenouvellement(false);
          }}
        />
      )}

      {/* Modal détail versement (traçabilité + reçu) - actif seulement pour les rôles
          autorisés à saisir des versements (peutSaisirVersement), pas pour Onboarding. */}
      {peutVoirDetailVersement && paiementDetail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1150, backdropFilter:'blur(4px)' }} onClick={() => setPaiementDetail(null)}>
          <div style={{ background:COULEURS.blanc, borderRadius:16, width:640, maxWidth:'94vw', boxShadow:'0 24px 64px rgba(0,0,0,0.35)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>💰 Détail du versement</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3 }}>{entreprise.nom}</div>
              </div>
              <button onClick={() => setPaiementDetail(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ padding:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:12 }}>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>Statut</span>
                <BadgeStatutVersement statut={paiementDetail.statut} />
              </div>
              {[
                { lbl:'Montant', val: formatFCFA(paiementDetail.montant) },
                { lbl:'Date du versement', val: paiementDetail.date },
                { lbl:'Mode de paiement', val: paiementDetail.mode || '-' },
                { lbl:'Référence', val: paiementDetail.reference || '-' },
                { lbl:'Note', val: paiementDetail.note || '-' },
              ].map(({ lbl, val }) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13 }}>
                  <span style={{ color:COULEURS.gris600 }}>{lbl}</span>
                  <span style={{ fontWeight:700, color:COULEURS.navy }}>{val}</span>
                </div>
              ))}
              {/* Les justificatifs, en grand : c'est sur cette fiche que la
                  vérificatrice décide, elle doit pouvoir lire la pièce ici. */}
              {(paiementDetail.preuves || []).length > 0 && (
                <div style={{ marginTop:16 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
                    📎 Justificatifs ({paiementDetail.preuves.length})
                  </div>
                  <VignettesPreuves preuves={paiementDetail.preuves} taille={40} vertical />
                </div>
              )}

              {paiementDetail.statut === 'rejete' && paiementDetail.motif_rejet && (
                <div style={{ marginTop:16, padding:'12px 16px', background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#991B1B', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>⚠️ Motif du rejet</div>
                  <div style={{ fontSize:13, color:'#7F1D1D', lineHeight:1.5 }}>{paiementDetail.motif_rejet}</div>
                </div>
              )}

              <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, padding:'12px 16px', marginTop:16 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>🔍 Traçabilité</div>
                <div style={{ fontSize:13, color:'#0F172A' }}>
                  {paiementDetail.declare_par_nom
                    ? <>Déclaré par <strong>{paiementDetail.declare_par_nom}</strong> (entreprise)</>
                    : <>Enregistré par <strong>{paiementDetail.cree_par_nom || 'Inconnu'}</strong></>}
                  {paiementDetail.created_at && <> le {new Date(paiementDetail.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</>}
                  {paiementDetail.valide_par_nom && (
                    <div style={{ marginTop:4 }}>
                      {paiementDetail.statut === 'rejete' ? 'Rejeté' : 'Validé'} par <strong>{paiementDetail.valide_par_nom}</strong>
                      {paiementDetail.valide_le && <> le {new Date(paiementDetail.valide_le).toLocaleString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setPaiementDetail(null)} style={{ padding:'9px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
              {paiementDetail.statut === 'declare' && peutValiderVersement && (
                <>
                  <button onClick={() => { const v = paiementDetail; setPaiementDetail(null); trancherVersement(v, 'rejeter'); }}
                    style={{ padding:'9px 20px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    ✖️ Rejeter
                  </button>
                  <button onClick={() => { const v = paiementDetail; setPaiementDetail(null); trancherVersement(v, 'valider'); }}
                    style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#059669', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    ✅ Valider le versement
                  </button>
                </>
              )}
              {peutModifierVersement && paiementDetail.statut !== 'declare' && (
                <button onClick={() => {
                  setFormVers({ montant: paiementDetail.montant, date: (paiementDetail.date || '').slice(0,10), mode: paiementDetail.mode || 'virement', reference: paiementDetail.reference || '', note: paiementDetail.note || '' });
                  setEditVersId(paiementDetail.id);
                  setPaiementDetail(null);
                  setShowFormVers(true);
                }} style={{ padding:'9px 20px', borderRadius:8, border:`1.5px solid ${entreprise.couleur}`, background:COULEURS.blanc, color:entreprise.couleur, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  ✏️ Modifier
                </button>
              )}
              {peutSupprimerVersement && (
                <button onClick={async () => {
                  if (!(await confirm(`Supprimer définitivement ce versement de ${formatFCFA(paiementDetail.montant)} pour ${entreprise.nom} ?`, { titre: 'Supprimer le versement', confirmLabel: 'Supprimer', danger: true }))) return;
                  try {
                    const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements/${paiementDetail.id}`, { method: 'DELETE', headers: _authHdrsAdmin() });
                    const d = await r.json();
                    if (!r.ok) { await alerte(d.error || 'Erreur lors de la suppression du versement', { danger: true }); return; }
                    setVersements(prev => prev.filter(x => x.id !== paiementDetail.id));
                    setPaiementDetail(null);
                  } catch (e) {
                    await alerte('Erreur réseau', { danger: true });
                  }
                }} style={{ padding:'9px 20px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  🗑️ Supprimer
                </button>
              )}
              {/* Un reçu atteste d'un encaissement : l'émettre sur une déclaration
                  non vérifiée produirait une pièce comptable pour de l'argent dont
                  BET n'a pas confirmé la réception. */}
              {estVerse(paiementDetail) && (
                <button onClick={() => genererRecuVersement(paiementDetail, entreprise, { montantContrat, soldeRestant })} style={{ padding:'9px 20px', borderRadius:8, border:'none', background:entreprise.couleur, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  🧾 Générer le reçu
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
export function PaginationSimple({ total, parPage, page, onChange }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const nbPages = Math.max(1, Math.ceil(total / parPage));
  if (nbPages <= 1) return null;
  const btn = (a) => ({ minWidth:42, height:42, padding:'0 6px', borderRadius:9, border:`1.5px solid ${a?couleurTheme:COULEURS.gris200}`, background:a?couleurTheme:COULEURS.blanc, color:a?COULEURS.blanc:COULEURS.navy, fontSize:15, fontWeight:a?700:500, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', justifyContent:'center' });
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderTop:`1px solid ${COULEURS.gris100}` }}>
      <span style={{ fontSize:13, color:COULEURS.gris600 }}>Page {page} sur {nbPages} · {total} résultat{total>1?'s':''}</span>
      <div style={{ display:'flex', gap:8 }}>
        <button style={{ ...btn(false), opacity:page===1?0.35:1 }} disabled={page===1} onClick={() => onChange(page-1)}>‹</button>
        {Array.from({length:nbPages},(_,i)=>i+1).map(p => <button key={p} style={btn(p===page)} onClick={()=>onChange(p)}>{p}</button>)}
        <button style={{ ...btn(false), opacity:page===nbPages?0.35:1 }} disabled={page===nbPages} onClick={()=>onChange(page+1)}>›</button>
      </div>
    </div>
  );
}

// Utilisés par OngletRemplacements (superviseur/pa_advisor)
export function ModalDetailRemplacement({ remplacement, onFermer, onAssigner, onCloturer }) {
  const VIOLET = '#7C3AED';

  const [coaches,   setCoaches]   = useState([]);
  const [autres,    setAutres]    = useState([]); // les autres remplacements (pour la disponibilité)
  const [seances,   setSeances]   = useState([]);
  const [chargement,setChargement]= useState(true);
  const [selectionne, setSelectionne] = useState(remplacement.remplacant_id || null);
  const [assignEnCours, setAssignEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [confirmOuvert, setConfirmOuvert] = useState(false);
  const [refusOuvert, setRefusOuvert] = useState(false);
  const [motifRefus, setMotifRefus] = useState('');
  const [refusEnCours, setRefusEnCours] = useState(false);
  const [seancesEnCours, setSeancesEnCours] = useState(new Set()); // empêche le double-clic "marquer réalisée"
  const [assignerLot, setAssignerLot] = useState(false); // porté depuis dash - voir lotSiblings ci-dessous

  async function refuserDemande() {
    if (refusEnCours) return;
    if (!motifRefus.trim()) { setErreur('Un motif est requis pour refuser la demande.'); return; }
    setRefusEnCours(true); setErreur('');
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/remplacements/${remplacement.id}`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ statut: 'refuse', motif_refus: motifRefus.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
      onAssigner(d.remplacement);
      onFermer();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setRefusEnCours(false);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({})),
      fetch(`${_API_URL_ADMIN}/api/remplacements?plateforme=bet-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({})),
      remplacement.groupe_id
        ? fetch(`${_API_URL_ADMIN}/api/elearning/seances?classe_id=${remplacement.groupe_id}`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({}))
        : Promise.resolve({}),
    ]).then(([dc, dr, ds]) => {
      setCoaches(dc.coaches || []);
      setAutres((dr.remplacements || []).filter(r => r.id !== remplacement.id));
      const idsCouverts = new Set(remplacement.sessions_ids || []);
      setSeances((ds.seances || []).filter(s => idsCouverts.has(s.id)).sort((a,b) => new Date(a.date) - new Date(b.date)));
    }).finally(() => setChargement(false));
  }, [remplacement.id, remplacement.groupe_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coachs réels, disponibles sur la période (pas déjà en délégation active ailleurs)
  const coachesDispo = coaches
    .filter(c => c.id !== remplacement.absent_id)
    .filter(c => !autres.some(r =>
      r.remplacant_id === c.id && r.statut !== 'termine' && r.statut !== 'refuse' &&
      new Date(r.date_debut) <= new Date(remplacement.date_fin || remplacement.date_debut) &&
      new Date(r.date_fin || r.date_debut) >= new Date(remplacement.date_debut)
    ))
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

  // Demandes-sœurs issues de la même déclaration d'absence multi-classes (même lot_id) et
  // encore à pourvoir - porté depuis dash : permet d'assigner le même remplaçant à tout le lot
  // en une seule action plutôt que de rouvrir chaque demande une par une.
  const lotSiblings = remplacement.lot_id
    ? autres.filter(r => r.lot_id === remplacement.lot_id && r.statut === 'a_pourvoir')
    : [];

  const fmtDate    = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : '-';
  const fmtDateCt  = d => d ? new Date(d).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short' }) : '-';
  const fmtHeure   = h => h?.slice(0, 5) || '';

  async function marquerRealisee(seanceId) {
    if (seancesEnCours.has(seanceId)) return;
    setSeancesEnCours(prev => new Set(prev).add(seanceId));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/seances/${seanceId}`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ statut: 'realisee' }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Erreur serveur');
      setSeances(prev => prev.map(s => s.id === seanceId ? { ...s, statut: 'realisee' } : s));
    } catch (e) {
      setErreur(e.message);
    } finally {
      setSeancesEnCours(prev => { const n = new Set(prev); n.delete(seanceId); return n; });
    }
  }

  async function confirmerAssignation() {
    if (assignEnCours) return;
    const coach = coaches.find(c => c.id === selectionne);
    if (!coach) return;
    setConfirmOuvert(false);
    setAssignEnCours(true); setErreur('');
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/remplacements/${remplacement.id}`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ remplacant_id: coach.id, remplacant_nom: `${coach.prenom} ${coach.nom}` }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
      onAssigner(d.remplacement);
      if (assignerLot && lotSiblings.length > 0) {
        const resultats = await Promise.all(lotSiblings.map(async (s) => {
          const rs = await fetch(`${_API_URL_ADMIN}/api/remplacements/${s.id}`, {
            method: 'PATCH', headers: _authHdrsAdmin(),
            body: JSON.stringify({ remplacant_id: coach.id, remplacant_nom: `${coach.prenom} ${coach.nom}` }),
          });
          const ds = await rs.json().catch(() => ({}));
          if (rs.ok) onAssigner(ds.remplacement);
          return { ok: rs.ok, nom: s.groupe_nom, error: ds.error };
        }));
        const echecs = resultats.filter(r => !r.ok);
        if (echecs.length) toast.error(`Échec pour ${echecs.map(e=>e.nom).join(', ')} : ${echecs[0].error || 'erreur serveur'}`);
      }
      onFermer();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setAssignEnCours(false);
    }
  }

  const STATUT_STYLE = {
    termine:    { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Terminé'    },
    en_cours:   { bg:'#DBEAFE', txt:'#1D4ED8', lib:'🔵 En cours'  },
    planifie:   { bg:'#FEF9C3', txt:'#92400E', lib:'📅 Planifié'  },
    a_pourvoir: { bg:'#FEE2E2', txt:'#991B1B', lib:'🔴 À pourvoir' },
  };
  const st = STATUT_STYLE[remplacement.statut];

  const S = {
    overlay: { position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, backdropFilter:'blur(4px)' },
    modal:   { background:COULEURS.blanc, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 28px 72px rgba(0,0,0,0.32)', overflow:'hidden' },
    header:  { background:`linear-gradient(135deg, ${COULEURS.navy}, ${VIOLET})`, padding:'20px 28px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 },
    btnX:    { background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, color:'#fff', flexShrink:0 },
    corps:   { flex:1, overflowY:'auto', padding:'24px 28px' },
    section: { marginBottom:24 },
    secTitre:{ fontSize:11, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12, display:'flex', alignItems:'center', gap:6 },
    grille2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
    champ:   { background:COULEURS.gris50, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}` },
    champL:  { fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 },
    champV:  { fontSize:13, fontWeight:600, color:COULEURS.navy },
    motifBadge: { display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:20, background:'#FEF3C7', color:'#92400E', fontSize:12, fontWeight:700, marginTop:4 },
    profilAbsent: { display:'flex', alignItems:'center', gap:14, padding:'16px', background:'#FFF5F5', borderRadius:12, border:'1px solid #FECACA', marginBottom:16 },
    avatarAbsent: { width:44, height:44, borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#991B1B', flexShrink:0 },
    listeProfs: { display:'flex', flexDirection:'column', gap:8, maxHeight:260, overflowY:'auto' },
    ligneProf: (sel) => ({
      display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px',
      borderRadius:10, border:`1.5px solid ${sel ? VIOLET : COULEURS.gris200}`,
      background: sel ? '#F5F3FF' : COULEURS.blanc, cursor:'pointer', transition:'all 0.15s',
    }),
    footer:  { padding:'16px 28px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10, background:COULEURS.blanc, flexShrink:0 },
    btnAnn:  { padding:'10px 20px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'"Plus Jakarta Sans",sans-serif' },
    btnConf: { padding:'10px 24px', borderRadius:10, border:'none', background:VIOLET, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div style={S.header}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:4 }}>🔄 Détail du remplacement</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{remplacement.groupe_nom || '-'}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, background:st.bg, color:st.txt }}>{st.lib}</span>
            <button style={S.btnX} onClick={onFermer}>×</button>
          </div>
        </div>

        <div style={S.corps}>

          {/* Profil du prof absent */}
          <div style={S.section}>
            <div style={S.secTitre}><span>👤</span> Professeur absent</div>
            <div style={S.profilAbsent}>
              <div style={S.avatarAbsent}>
                {(remplacement.absent_nom || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy }}>{remplacement.absent_nom}</div>
              </div>
              <div style={S.motifBadge}>🏥 {remplacement.motif || 'Motif non précisé'}</div>
            </div>
            {remplacement.message && (
              <div style={{ fontSize:12, color:COULEURS.gris600, fontStyle:'italic', marginTop:-10, marginBottom:14 }}>"{remplacement.message}"</div>
            )}

            {/* Infos absence */}
            <div style={S.grille2}>
              <div style={S.champ}>
                <div style={S.champL}>Groupe concerné</div>
                <div style={S.champV}>{remplacement.groupe_nom || '-'}</div>
              </div>
              <div style={S.champ}>
                <div style={S.champL}>Nombre de séances</div>
                <div style={S.champV}>{remplacement.nb_sessions} séance{remplacement.nb_sessions > 1 ? 's' : ''}</div>
              </div>
              <div style={S.champ}>
                <div style={S.champL}>Début</div>
                <div style={S.champV}>{fmtDate(remplacement.date_debut)}</div>
              </div>
              <div style={S.champ}>
                <div style={S.champL}>Fin</div>
                <div style={S.champV}>{fmtDate(remplacement.date_fin)}</div>
              </div>
            </div>
          </div>

          {/* Séances couvertes (fixées par le coach au signalement) */}
          <div style={S.section}>
            <div style={S.secTitre}>
              <span>📅</span>
              Séances couvertes
              <span style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color:COULEURS.gris500 }}>
                {seances.filter(s => s.statut === 'realisee').length} / {seances.length} réalisée{seances.length > 1 ? 's' : ''}
              </span>
            </div>
            {chargement ? (
              <div style={{ textAlign:'center', padding:16, color:COULEURS.gris400, fontSize:12 }}>Chargement…</div>
            ) : seances.length === 0 ? (
              <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 16px', fontSize:12, color:COULEURS.gris500, textAlign:'center', border:`1px dashed ${COULEURS.gris200}` }}>
                Aucune séance retrouvée pour ce remplacement.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {seances.map(s => {
                  const realisee = s.statut === 'realisee';
                  return (
                    <div key={s.id} style={{
                      display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                      borderRadius:10, border:`1.5px solid ${realisee ? '#6EE7B7' : COULEURS.gris200}`,
                      background: realisee ? '#F0FDF4' : COULEURS.blanc,
                    }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color: realisee ? '#065F46' : COULEURS.navy }}>{s.objectifs_session || s.type || 'Séance'}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris500, marginTop:1 }}>
                          {fmtDateCt(s.date)} · {fmtHeure(s.heure_debut)}–{fmtHeure(s.heure_fin)}
                        </div>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background: realisee ? '#D1FAE5' : COULEURS.gris100, color: realisee ? '#065F46' : COULEURS.gris500 }}>
                        {realisee ? '✅ Réalisée' : '⏳ À venir'}
                      </span>
                      {!realisee && remplacement.remplacant_id && (
                        <button
                          onClick={() => marquerRealisee(s.id)}
                          style={{ padding:'3px 10px', borderRadius:8, border:'1px solid #6EE7B7', background:'#ECFDF5', color:'#065F46', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap', flexShrink:0 }}
                        >
                          Marquer réalisée
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Règles de délégation */}
          <div style={S.section}>
            <div style={S.secTitre}><span>📋</span> Règles de délégation</div>
            <div style={{ background:'#F0F9FF', borderRadius:10, border:'1px solid #BAE6FD', padding:'12px 16px', display:'flex', flexDirection:'column', gap:7 }}>
              {[
                { icone:'✅', txt:'Le remplaçant se connecte avec ses propres identifiants', ok:true },
                { icone:'✅', txt:'Il accède à la vue et aux outils du titulaire pour ce groupe', ok:true },
                { icone:'✅', txt:'Saisie des présences, animation du cours, commentaires autorisés', ok:true },
                { icone:'✅', txt:'Toutes ses actions sont horodatées « [Remplaçant - Prénom NOM] »', ok:true },
                { icone:'🚫', txt:'Ne peut PAS modifier le programme de cours du titulaire', ok:false },
                { icone:'🚫', txt:'Ne peut PAS noter définitivement (validation réservée au titulaire)', ok:false },
              ].map((r, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                  <span style={{ fontSize:13, flexShrink:0 }}>{r.icone}</span>
                  <span style={{ fontSize:12, color: r.ok ? '#0C4A6E' : '#7F1D1D', fontWeight: r.ok ? 400 : 600 }}>{r.txt}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:8, fontSize:11, color:COULEURS.gris500, display:'flex', alignItems:'center', gap:6 }}>
              <span>ℹ️</span> La clôture est automatique dès que toutes les séances couvertes sont réalisées.
            </div>
          </div>

          {/* Remplaçant déjà assigné - écran verrouillé, plus de sélection ouverte en permanence.
              Avant ce correctif, la liste des coachs restait affichée et cliquable même pour un
              remplacement déjà "en_cours", et le bouton du pied redevenait "Réassigner" - donnant
              l'impression trompeuse qu'on pouvait librement réassigner à tout moment. */}
          {remplacement.remplacant_id && (
            <div style={S.section}>
              <div style={S.secTitre}><span>✅</span> Remplaçant assigné</div>
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'#F5F3FF', borderRadius:12, border:`1.5px solid ${VIOLET}55` }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background:VIOLET, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, flexShrink:0 }}>
                  {(remplacement.remplacant_nom || '?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14.5, fontWeight:800, color:COULEURS.navy }}>{remplacement.remplacant_nom}</div>
                  <div style={{ fontSize:11.5, color:COULEURS.gris500, marginTop:2 }}>
                    {remplacement.assigne_par_nom ? `Assigné(e) par ${remplacement.assigne_par_nom}` : 'Assigné(e)'} - utilisez "Clôturer la délégation" ci-dessous si le remplacement est terminé.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Liste des coachs disponibles - uniquement tant qu'aucun remplaçant n'est assigné */}
          {!remplacement.remplacant_id && remplacement.statut === 'a_pourvoir' && (
            <div style={S.section}>
              <div style={S.secTitre}><span>📋</span> Coachs disponibles ({coachesDispo.length})</div>
              {chargement ? (
                <div style={{ textAlign:'center', padding:16, color:COULEURS.gris400, fontSize:12 }}>Chargement…</div>
              ) : coachesDispo.length === 0 ? (
                <div style={{ textAlign:'center', padding:20, color:COULEURS.gris400, fontSize:13 }}>Aucun coach disponible sur cette période.</div>
              ) : (
                <div style={S.listeProfs}>
                  {coachesDispo.map(c => {
                    const isSel = selectionne === c.id;
                    const initiales = `${(c.prenom||'?')[0]}${(c.nom||'?')[0]}`;
                    return (
                      <div key={c.id} style={S.ligneProf(isSel)} onClick={() => setSelectionne(c.id)}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', background: isSel ? VIOLET : COULEURS.gris200, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color: isSel ? '#fff' : COULEURS.gris600, flexShrink:0 }}>
                            {initiales}
                          </div>
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ fontWeight:700, color:COULEURS.navy, fontSize:13 }}>{c.prenom} {c.nom}</span>
                            </div>
                            <div style={{ fontSize:11, color:COULEURS.gris500 }}>{c.email}</div>
                          </div>
                        </div>
                        <div style={{ width:20, height:20, borderRadius:'50%', border:`2px solid ${isSel ? VIOLET : COULEURS.gris300}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {isSel && <div style={{ width:10, height:10, borderRadius:'50%', background:VIOLET }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Lot - même absence, plusieurs classes : choix explicite entre un seul remplaçant
              pour tout le lot ou une assignation séparée par classe. */}
          {!remplacement.remplacant_id && remplacement.statut === 'a_pourvoir' && lotSiblings.length > 0 && (
            <div style={{ ...S.section, background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:800, color:VIOLET, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
                🔗 Cette absence couvre aussi {lotSiblings.length} autre{lotSiblings.length>1?'s':''} classe{lotSiblings.length>1?'s':''}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                {lotSiblings.map(s => (
                  <span key={s.id} style={{ fontSize:11, fontWeight:600, color:'#5B21B6', background:'#EDE9FE', padding:'3px 10px', borderRadius:12 }}>{s.groupe_nom || 'Classe'} ({s.nb_sessions||0} séance{(s.nb_sessions||0)>1?'s':''})</span>
                ))}
              </div>
              <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer' }}>
                <input type="checkbox" checked={assignerLot} onChange={e => setAssignerLot(e.target.checked)} style={{ marginTop:2, cursor:'pointer' }} />
                <span style={{ fontSize:12, color:'#4C1D95' }}>
                  Assigner <strong>{selectionne ? (coaches.find(c=>c.id===selectionne) ? `${coaches.find(c=>c.id===selectionne).prenom} ${coaches.find(c=>c.id===selectionne).nom}` : 'ce coach') : 'ce coach'}</strong> à toutes ces classes en une seule fois - sinon chaque classe garde une assignation séparée.
                </span>
              </label>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={S.footer}>
          {/* Clôture manuelle - visible si délégation active avec remplaçant */}
          {(remplacement.statut === 'en_cours' || remplacement.statut === 'planifie') && remplacement.remplacant_id && (
            <button
              style={{ marginRight:'auto', padding:'10px 18px', borderRadius:10, border:'1.5px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
              onClick={() => { onCloturer(remplacement.id); onFermer(); }}
            >
              🔒 Clôturer la délégation
            </button>
          )}
          {remplacement.statut === 'termine' && (
            <div style={{ marginRight:'auto', fontSize:12, color:'#065F46', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
              ✅ Délégation clôturée
            </div>
          )}
          {remplacement.statut === 'refuse' && (
            <div style={{ marginRight:'auto', fontSize:12, color:'#991B1B', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
              ❌ Refusée{remplacement.refuse_par_nom ? ` par ${remplacement.refuse_par_nom}` : ''}{remplacement.motif_refus ? ` - ${remplacement.motif_refus}` : ''}
            </div>
          )}
          {remplacement.statut === 'a_pourvoir' && (
            <button
              style={{ marginRight:'auto', padding:'10px 18px', borderRadius:10, border:'1.5px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
              onClick={() => { setMotifRefus(''); setErreur(''); setRefusOuvert(true); }}
            >
              ❌ Refuser la demande
            </button>
          )}
          {erreur && <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>{erreur}</span>}
          <button style={S.btnAnn} onClick={onFermer}>Fermer</button>
          {/* Confirmer l'assignation - uniquement tant qu'aucun remplaçant n'est encore assigné.
              La réassignation n'est plus une action à un clic depuis cet écran verrouillé ; pour
              changer de remplaçant, clôturer la délégation actuelle puis réassigner via un
              nouveau signalement, cohérent avec "ce n'est plus possible" une fois confirmé. */}
          {!remplacement.remplacant_id && remplacement.statut === 'a_pourvoir' && (
            <button
              style={{ ...S.btnConf, opacity: (!selectionne || assignEnCours) ? 0.6 : 1, cursor: (!selectionne || assignEnCours) ? 'not-allowed' : 'pointer' }}
              disabled={!selectionne || assignEnCours}
              onClick={() => setConfirmOuvert(true)}
            >
              {assignEnCours ? '⏳ Assignation…' : '✅ Confirmer la délégation'}
            </button>
          )}
        </div>
      </div>

      {/* Confirmation avant assignation - 7 notifications partent dès validation */}
      {confirmOuvert && (() => {
        const coach = coaches.find(c => c.id === selectionne);
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }} onClick={() => setConfirmOuvert(false)}>
            <div style={{ background:COULEURS.blanc, borderRadius:16, width:440, maxWidth:'90vw', padding:'26px 28px', boxShadow:'0 28px 72px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:32, marginBottom:10 }}>🔄</div>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy, marginBottom:8 }}>
                Confirmer cette délégation ?
              </div>
              <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, marginBottom:16 }}>
                {assignerLot && lotSiblings.length > 0 ? (
                  <><strong>{coach?.prenom} {coach?.nom}</strong> remplacera <strong>{remplacement.absent_nom}</strong> sur <strong>{lotSiblings.length + 1} classes</strong> ({[remplacement.groupe_nom, ...lotSiblings.map(s=>s.groupe_nom)].filter(Boolean).join(', ')}).</>
                ) : (
                  <><strong>{coach?.prenom} {coach?.nom}</strong> remplacera <strong>{remplacement.absent_nom}</strong> sur{' '}
                  <strong>{remplacement.nb_sessions} séance{remplacement.nb_sessions > 1 ? 's' : ''}</strong> ({remplacement.groupe_nom || 'groupe'}).</>
                )}
                <br /><br />
                Sept notifications partiront immédiatement : le coach absent, {coach?.prenom || 'le remplaçant'}, les apprenants de la classe, le superviseur et les deputy superviseurs, le parent (si apprenant mineur) et le référent RH (si classe entreprise).
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button style={S.btnAnn} onClick={() => setConfirmOuvert(false)}>Annuler</button>
                <button style={S.btnConf} onClick={confirmerAssignation}>✅ Confirmer et notifier</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Refus de la demande - motif obligatoire, notifie le coach absent */}
      {refusOuvert && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }} onClick={() => !refusEnCours && setRefusOuvert(false)}>
          <div style={{ background:COULEURS.blanc, borderRadius:16, width:440, maxWidth:'90vw', padding:'26px 28px', boxShadow:'0 28px 72px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:32, marginBottom:10 }}>❌</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#991B1B', marginBottom:8 }}>Refuser cette demande d'absence ?</div>
            <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, marginBottom:16 }}>
              <strong>{remplacement.absent_nom}</strong> sera notifié(e) du refus avec le motif ci-dessous. Aucun remplaçant ne sera assigné.
            </div>
            <label style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600, display:'block', marginBottom:6 }}>Motif du refus *</label>
            <textarea value={motifRefus} onChange={e => setMotifRefus(e.target.value)} rows={3}
              placeholder="Ex : délai trop court, aucun remplaçant compatible disponible, absence non justifiée…"
              style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1.5px solid #e5e7eb', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', boxSizing:'border-box', marginBottom:16 }} />
            {erreur && <div style={{ fontSize:12, color:'#DC2626', fontWeight:600, marginBottom:12 }}>{erreur}</div>}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button style={S.btnAnn} onClick={() => setRefusOuvert(false)} disabled={refusEnCours}>Annuler</button>
              <button
                onClick={refuserDemande}
                disabled={refusEnCours || !motifRefus.trim()}
                style={{ padding:'10px 20px', borderRadius:10, border:'none', background: (refusEnCours || !motifRefus.trim()) ? '#fca5a5' : '#dc2626', color:'#fff', fontSize:13, fontWeight:700, cursor: (refusEnCours || !motifRefus.trim()) ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
              >
                {refusEnCours ? '⏳ Envoi…' : '❌ Confirmer le refus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal "Remplacement définitif" (global) - point d'entrée depuis l'onglet Remplacements,
// distinct du flux par-classe déjà existant dans ModalDetailClasseOnboarding
// (suspendModal/suspendreCoach ci-dessus). Ici la PA choisit d'abord le coach à suspendre
// définitivement, puis voit TOUTES ses classes actives d'un coup - utile quand il en a
// plusieurs - et choisit un nouveau titulaire (+ motif) par classe avant de finaliser. Réutilise
// PATCH /api/coachs/:id/suspension (avec plateforme:'bet-elearning', pour ne jamais faire
// remonter les groupes dash du même coach - voir Backend/src/routes/coachs.js) comme "sonde"
// pour lister les classes encore actives, puis PATCH /api/classes-elearning/:id/suspendre-coach
// (déjà utilisé par le flux par-classe) pour chaque transfert.
export function ModalRemplacementDefinitifGlobal({ onFermer }) {
  const { profile } = useAuth();
  const peutRemplacementDefinitif = profile?.permissions?.classes?.update === true && profile?.permissions?.classes?.manage === true;
  const [coaches, setCoaches] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [coachId, setCoachId] = useState('');
  const [raison, setRaison] = useState('');
  const [etape, setEtape] = useState('choisir'); // choisir | transferer | termine
  const [items, setItems] = useState([]); // [{id, nom, niveau, nouveau_coach_id, motif}]
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const [confirmOuvert, setConfirmOuvert] = useState(false);

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setCoaches(d.coaches || [])).catch(() => {});
  }, []);

  const coachChoisi = coaches.find(c => c.id === coachId);
  const initiales = c => `${c?.prenom?.[0]||''}${c?.nom?.[0]||''}`.toUpperCase() || '?';
  const avatarDe = c => c?.avatar_url || null;

  async function chargerClassesATransferer() {
    if (!coachId) { setErreur('Sélectionnez un coach.'); return; }
    setLoading(true); setErreur('');
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/coachs/${coachId}/suspension`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ bloque: true, definitif: true, raison, plateforme: 'bet-elearning' }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.classes_a_reaffecter) {
        setItems(d.classes_a_reaffecter.map(c => ({ id:c.id, nom:c.nom, niveau:c.niveau, nouveau_coach_id:'', motif:'' })));
        setEtape('transferer');
      } else if (r.ok) {
        setEtape('termine');
      } else {
        setErreur(d.error || 'Erreur serveur');
      }
    } catch { setErreur('Erreur serveur'); }
    finally { setLoading(false); }
  }

  function appliquerCoachATous(cid) {
    setItems(prev => prev.map(it => ({ ...it, nouveau_coach_id: cid })));
  }

  async function lancerTransfertEtSuspension() {
    if (items.some(it => !it.nouveau_coach_id || !it.motif.trim())) {
      setErreur('Renseignez un nouveau coach et un motif pour chaque classe.'); return;
    }
    setLoading(true); setErreur('');
    try {
      const resultats = await Promise.all(items.map(async (it) => {
        const nouveauCoach = coaches.find(c => c.id === it.nouveau_coach_id);
        const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${it.id}/suspendre-coach`, {
          method: 'PATCH', headers: _authHdrsAdmin(),
          body: JSON.stringify({
            nouveau_coach_id: it.nouveau_coach_id,
            nouveau_coach_nom: nouveauCoach ? `${nouveauCoach.prenom||''} ${nouveauCoach.nom||''}`.trim() : '',
            motif: it.motif.trim(),
          }),
        });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok, nom: it.nom, error: d.error };
      }));
      const echecs = resultats.filter(r => !r.ok);
      if (echecs.length) {
        setErreur(`Échec pour ${echecs.map(e => e.nom).join(', ')} : ${echecs[0].error || 'erreur serveur'}`);
        return;
      }
      const r2 = await fetch(`${_API_URL_ADMIN}/api/coachs/${coachId}/suspension`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ bloque: true, definitif: true, raison, plateforme: 'bet-elearning' }),
      });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok) { setErreur(d2.error || 'Transfert effectué, mais la suspension définitive a échoué - réessayez.'); return; }
      setEtape('termine');
    } catch { setErreur('Erreur serveur'); }
    finally { setLoading(false); }
  }

  const q = recherche.trim().toLowerCase();
  const candidatsCoach = coaches
    .filter(c => c.actif !== false)
    .filter(c => !q || `${c.prenom} ${c.nom}`.toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1001 }}
      onClick={() => !loading && onFermer()}>
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height: etape==='termine' ? 'auto' : '90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 30px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ padding:'22px 30px', borderBottom:`1px solid ${COULEURS.gris200}`, flexShrink:0, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:30 }}>🔴</div>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:'#991B1B' }}>Suspendre définitivement le coach</div>
              <div style={{ fontSize:12.5, color:COULEURS.gris500, marginTop:2 }}>
                {etape==='transferer'
                  ? "Le nouveau coach hérite du contexte pédagogique complet. Les honoraires déjà dus à l'ancien coach ne sont jamais réécrits."
                  : 'Transfère toutes les classes actives du coach, puis le suspend définitivement.'}
              </div>
            </div>
          </div>
          <button onClick={onFermer} disabled={loading}
            style={{ background:COULEURS.gris100, border:'none', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, color:COULEURS.gris600, flexShrink:0 }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'24px 30px' }}>

          {etape === 'choisir' && (
            <>
              <div style={{ fontSize:11, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                Coach à remplacer définitivement {coachId && <span style={{ fontWeight:600, textTransform:'none', letterSpacing:0, color:'#DC2626' }}>- sélectionné : {coachChoisi ? `${coachChoisi.prenom} ${coachChoisi.nom}` : ''}</span>}
              </div>
              <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="🔎 Rechercher un coach par nom ou email…"
                style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'inherit', marginBottom:14, outline:'none', boxSizing:'border-box' }} />
              {candidatsCoach.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:COULEURS.gris400, fontSize:13, border:`1px dashed ${COULEURS.gris200}`, borderRadius:10, marginBottom:20 }}>Aucun coach ne correspond à cette recherche.</div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:10, marginBottom:20, maxHeight:'46vh', overflowY:'auto', paddingRight:4 }}>
                  {candidatsCoach.map(c => {
                    const actif = coachId === c.id;
                    const url = avatarDe(c);
                    return (
                      <div key={c.id} onClick={() => setCoachId(c.id)}
                        style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, cursor:'pointer', border:`2px solid ${actif?'#DC2626':COULEURS.gris200}`, background:actif?'#FEF2F2':COULEURS.blanc }}>
                        {url ? (
                          <img src={url} alt="" style={{ width:38, height:38, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                        ) : (
                          <div style={{ width:38, height:38, borderRadius:'50%', background:actif?'#DC2626':COULEURS.gris200, color:actif?'#fff':COULEURS.gris600, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>{initiales(c)}</div>
                        )}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13.5, fontWeight:700, color:COULEURS.navy, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.prenom} {c.nom}</div>
                          <div style={{ fontSize:11.5, color:COULEURS.gris500, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.email}</div>
                        </div>
                        {actif && <span style={{ fontSize:16, color:'#DC2626', flexShrink:0 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize:11, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Motif (raison de la suspension définitive)</div>
              <textarea value={raison} onChange={e => setRaison(e.target.value)} rows={3}
                placeholder="Ex : départ de l'organisme, fin de contrat…"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box', outline:'none' }} />
            </>
          )}

          {etape === 'transferer' && (
            <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Coach titulaire actuel</div>
                <div style={{ display:'flex', alignItems:'center', gap:14, background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, padding:'14px 18px' }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', background:'#DC2626', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, flexShrink:0 }}>{initiales(coachChoisi)}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14.5, fontWeight:800, color:COULEURS.navy }}>{coachChoisi ? `${coachChoisi.prenom} ${coachChoisi.nom}` : 'Coach inconnu'}</div>
                    <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
                      {coachChoisi?.email && <span>✉️ {coachChoisi.email}</span>}
                      <span>📚 {items.length} classe{items.length>1?'s':''} active{items.length>1?'s':''}</span>
                    </div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:'#991B1B', background:'#FEE2E2', padding:'4px 10px', borderRadius:8 }}>Sera révoqué</span>
                </div>
              </div>

              {items.length > 1 && (
                <select onChange={e => e.target.value && appliquerCoachATous(e.target.value)} defaultValue=""
                  style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #DDD6FE', background:'#F5F3FF', fontSize:12, fontFamily:'inherit', color:'#7C3AED', outline:'none' }}>
                  <option value="">🔗 Appliquer un même nouveau coach à toutes les classes…</option>
                  {coaches.filter(c => c.id !== coachId && c.actif !== false).map(c => (
                    <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                  ))}
                </select>
              )}

              {items.map((it, i) => (
                <div key={it.id}>
                  <div style={{ fontSize:13, fontWeight:800, color:COULEURS.navy, marginBottom:10 }}>💻 {it.nom}{it.niveau?` · ${it.niveau}`:''}</div>
                  <div style={{ fontSize:11, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Nouveau coach titulaire *</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:10, marginBottom:14 }}>
                    {coaches.filter(c => c.id !== coachId && c.actif !== false).map(c => {
                      const actif = it.nouveau_coach_id === c.id;
                      const url = avatarDe(c);
                      return (
                        <div key={c.id} onClick={() => setItems(prev => prev.map((x,xi)=>xi===i?{...x,nouveau_coach_id:c.id}:x))}
                          style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, cursor:'pointer', border:`2px solid ${actif?'#DC2626':COULEURS.gris200}`, background:actif?'#FEF2F2':COULEURS.blanc }}>
                          {url ? (
                            <img src={url} alt="" style={{ width:38, height:38, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                          ) : (
                            <div style={{ width:38, height:38, borderRadius:'50%', background:actif?'#DC2626':COULEURS.gris200, color:actif?'#fff':COULEURS.gris600, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>{initiales(c)}</div>
                          )}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13.5, fontWeight:700, color:COULEURS.navy, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.prenom} {c.nom}</div>
                            <div style={{ fontSize:11.5, color:COULEURS.gris500, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.email}</div>
                          </div>
                          {actif && <span style={{ fontSize:16, color:'#DC2626', flexShrink:0 }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                  <label style={{ fontSize:11, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:8 }}>Motif *</label>
                  <textarea value={it.motif} onChange={e => { const v=e.target.value; setItems(prev => prev.map((x,xi)=>xi===i?{...x,motif:v}:x)); }}
                    rows={2} placeholder="Ex : abandon de poste, faute grave, fin de contrat…"
                    style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box', outline:'none' }} />
                </div>
              ))}
            </div>
          )}

          {etape === 'termine' && (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy, marginBottom:6 }}>Suspension définitive effective</div>
              <div style={{ fontSize:13, color:COULEURS.gris500 }}>{coachChoisi ? `${coachChoisi.prenom} ${coachChoisi.nom}` : 'Ce coach'} a été suspendu et toutes ses classes ont été transférées.</div>
            </div>
          )}

          {erreur && <div style={{ marginTop:14, fontSize:12, color:'#991B1B', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'8px 12px' }}>{erreur}</div>}
        </div>

        <div style={{ padding:'16px 28px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10, background:COULEURS.blanc, flexShrink:0 }}>
          <button disabled={loading} onClick={onFermer}
            style={{ padding:'10px 20px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:loading?'not-allowed':'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit' }}>
            {etape==='termine' ? 'Fermer' : 'Annuler'}
          </button>
          {etape === 'choisir' && (
            <button disabled={loading || !coachId || !peutRemplacementDefinitif} onClick={chargerClassesATransferer}
              title={peutRemplacementDefinitif ? undefined : "Vous n'avez pas la permission pour cette action"}
              style={{ padding:'10px 22px', borderRadius:10, border:'none', background:'#DC2626', color:'#fff', cursor:(loading||!coachId||!peutRemplacementDefinitif)?'not-allowed':'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', opacity: peutRemplacementDefinitif ? 1 : 0.6 }}>
              {loading ? 'Vérification…' : !peutRemplacementDefinitif ? '🔒 Continuer →' : 'Continuer →'}
            </button>
          )}
          {etape === 'transferer' && (
            <button disabled={loading || !peutRemplacementDefinitif} onClick={() => setConfirmOuvert(true)}
              title={peutRemplacementDefinitif ? undefined : "Vous n'avez pas la permission pour cette action"}
              style={{ padding:'10px 22px', borderRadius:10, border:'none', background:'#DC2626', color:'#fff', cursor:(loading||!peutRemplacementDefinitif)?'not-allowed':'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', opacity: peutRemplacementDefinitif ? 1 : 0.6 }}>
              {loading ? 'Transfert en cours…' : '🔒 Transférer et suspendre définitivement'}
            </button>
          )}
        </div>

        {/* Confirmation finale - action irréversible (suspension définitive + transfert de N
            classes) : un clic seul ne doit pas suffire. */}
        {confirmOuvert && (
          <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1101 }}
            onClick={() => setConfirmOuvert(false)}>
            <div style={{ background:COULEURS.blanc, borderRadius:16, width:440, maxWidth:'90vw', padding:24, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:15, fontWeight:800, color:'#991B1B', marginBottom:8 }}>🔒 Confirmer la suspension définitive ?</div>
              <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, marginBottom:20 }}>
                <strong>{coachChoisi ? `${coachChoisi.prenom} ${coachChoisi.nom}` : 'Ce coach'}</strong> sera suspendu définitivement et ses {items.length} classe{items.length>1?'s':''} transférée{items.length>1?'s':''} aux coachs choisis. Cette action est irréversible - il ne pourra plus se connecter et ne redeviendra pas titulaire de ces classes automatiquement.
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button onClick={() => setConfirmOuvert(false)}
                  style={{ padding:'9px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  Annuler
                </button>
                <button disabled={!peutRemplacementDefinitif} onClick={() => { if (!peutRemplacementDefinitif) return; setConfirmOuvert(false); lancerTransfertEtSuspension(); }}
                  title={peutRemplacementDefinitif ? undefined : "Vous n'avez pas la permission pour cette action"}
                  style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor: peutRemplacementDefinitif ? 'pointer' : 'not-allowed', fontFamily:'inherit', opacity: peutRemplacementDefinitif ? 1 : 0.6 }}>
                  🔒 Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal "Remplacement manuel" - la PA crée un remplacement sans attendre que le coach le
// signale (ex : elle est déjà au courant d'une absence). Porté depuis dash - voir
// PedagogicalAdvisorDashboard.jsx pour l'équivalent original. Adapté au vocabulaire
// bet-elearning : `classes_elearning` (au lieu de `groupes`), `seances_elearning` (au lieu de
// `seances`), `GET /api/classes-elearning/coaches-elearning` (au lieu de la liste de coachs
// admin de dash). POST /api/remplacements ignore remplacant_id (créé "à pourvoir" sans
// remplaçant) - l'assignation réelle passe par le même PATCH que le bouton "Confirmer la
// délégation" du modal Détail du remplacement, qui crée la délégation et notifie les deux
// coachs sans jamais réassigner classes_elearning.coach_id de façon permanente.
export function ModalRemplacementManuel({ onFermer, onCree }) {
  const VIOLET = '#7C3AED';
  const [coaches, setCoaches] = useState([]);
  const [classes, setClasses] = useState([]);
  const [seances, setSeances] = useState([]);
  const [seancesLoad, setSeancesLoad] = useState(false);
  const [sessionsSelec, setSessionsSelec] = useState([]);
  const [form, setForm] = useState({ absent_id:'', classe_id:'', remplacant_id:'', date_debut:'', date_fin:'', motif:'' });
  const [saving, setSaving] = useState(false);
  const [confirmOuvert, setConfirmOuvert] = useState(false);
  const [erreur, setErreur] = useState('');
  // Mode "transfert" - transfert DÉFINITIF d'une ou plusieurs classes vers un nouveau coach,
  // sans suspendre le compte du titulaire (contrairement à "Remplacement définitif", qui exige
  // de transférer TOUTES ses classes puis bloque son accès). Réutilise
  // PATCH /api/classes-elearning/:id/suspendre-coach, déjà utilisé par le flux par-classe.
  const [mode, setMode] = useState('delegation'); // delegation | transfert
  const [classesSelec, setClassesSelec] = useState([]);
  const [transfertVers, setTransfertVers] = useState('');
  const [remplacementsExistants, setRemplacementsExistants] = useState([]);

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setCoaches(d.coaches || [])).catch(() => {});
    // Pour exclure un coach déjà engagé ailleurs sur une période qui chevauche - même
    // vérification que ModalDetailRemplacement, absente ici jusqu'ici.
    fetch(`${_API_URL_ADMIN}/api/remplacements?plateforme=bet-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setRemplacementsExistants(d.remplacements || [])).catch(() => {});
  }, []);

  const absentCoach = coaches.find(c => c.id === form.absent_id);
  const remplacant  = coaches.find(c => c.id === form.remplacant_id);
  const classeSelec = classes.find(c => c.id === form.classe_id);

  async function fetchClassesCoach(coachId) {
    setForm(p => ({ ...p, absent_id: coachId, classe_id:'', remplacant_id:'' }));
    setSeances([]); setSessionsSelec([]);
    if (!coachId) { setClasses([]); return; }
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning?coach_id=${coachId}`, { headers: _authHdrsAdmin() });
      const d = r.ok ? await r.json() : { classes: [] };
      setClasses(d.classes || []);
    } catch { setClasses([]); }
  }

  async function fetchSeancesClasse(classeId) {
    setForm(p => ({ ...p, classe_id: classeId }));
    if (!classeId || !form.absent_id) { setSeances([]); setSessionsSelec([]); return; }
    setSeancesLoad(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/seances?classe_id=${classeId}&coach_id=${form.absent_id}`, { headers: _authHdrsAdmin() });
      const d = r.ok ? await r.json() : { seances: [] };
      const TERMINAUX = ['realisee', 'annulee', 'reportee'];
      const restantes = (d.seances || []).filter(s => !TERMINAUX.includes(s.statut));
      setSeances(restantes);
      setSessionsSelec(restantes.map(s => s.id));
    } catch { setSeances([]); }
    finally { setSeancesLoad(false); }
  }

  const coachsDispos = coaches
    .filter(c => c.id !== form.absent_id && c.actif !== false)
    .filter(c => {
      if (!form.date_debut) return true;
      const dateFin = form.date_fin || form.date_debut;
      return !remplacementsExistants.some(r =>
        r.remplacant_id === c.id && r.statut !== 'termine' && r.statut !== 'refuse' &&
        new Date(r.date_debut) <= new Date(dateFin) && new Date(r.date_fin || r.date_debut) >= new Date(form.date_debut)
      );
    });
  const niveauClasse = classeSelec?.niveau || '';
  const scoredCoachs = coachsDispos.map(c => {
    const niveaux = Array.isArray(c.coach_info?.niveaux) ? c.coach_info.niveaux : [];
    return { ...c, _score: niveaux.includes(niveauClasse) ? 10 : 0 };
  }).sort((a,b) => b._score - a._score);
  const suggestion = scoredCoachs[0]?._score > 0 ? scoredCoachs[0] : null;

  const fmtDateCt = d => d ? new Date(d).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short' }) : '-';
  const fmtDateLg = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : '-';

  async function handleSave() {
    if (saving) return;
    const { absent_id, classe_id, remplacant_id, date_debut, motif } = form;
    if (!absent_id || !classe_id || !date_debut) {
      setErreur('Coach absent, classe et date de début sont requis.'); return;
    }
    setSaving(true); setErreur('');
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/remplacements`, {
        method: 'POST', headers: _authHdrsAdmin(),
        body: JSON.stringify({
          absent_id,
          absent_nom:    absentCoach ? `${absentCoach.prenom} ${absentCoach.nom}` : '-',
          groupe_id:     classe_id,
          groupe_nom:    classeSelec?.nom || '-',
          date_debut,
          date_fin:      form.date_fin || null,
          motif:         motif || null,
          sessions_ids:  sessionsSelec,
          nb_sessions:   sessionsSelec.length,
          plateforme:    'bet-elearning',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
      let remplacement = d.remplacement;

      // Assignation réelle si un remplaçant a été choisi - voir commentaire en tête de fichier.
      if (remplacant_id && remplacement?.id) {
        const r2 = await fetch(`${_API_URL_ADMIN}/api/remplacements/${remplacement.id}`, {
          method: 'PATCH', headers: _authHdrsAdmin(),
          body: JSON.stringify({
            remplacant_id,
            remplacant_nom: remplacant ? `${remplacant.prenom} ${remplacant.nom}` : null,
            sessions_ids:   sessionsSelec,
            nb_sessions:    sessionsSelec.length,
            statut:         'en_cours',
          }),
        });
        const d2 = await r2.json().catch(() => ({}));
        if (r2.ok) remplacement = d2.remplacement || remplacement;
        else toast.error(d2.error || "Remplacement créé, mais l'assignation du remplaçant a échoué.");
      }

      toast.success(remplacant_id ? 'Remplacement créé et délégation confirmée.' : 'Remplacement créé.');
      onCree(remplacement);
      onFermer();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setSaving(false);
    }
  }

  const transfertCoach = coaches.find(c => c.id === transfertVers);
  async function handleTransfert() {
    if (saving) return;
    if (!form.absent_id || classesSelec.length === 0 || !transfertVers || !form.motif.trim()) {
      setErreur('Coach, classe(s), nouveau coach et motif sont requis.'); return;
    }
    setSaving(true); setErreur('');
    try {
      const resultats = await Promise.all(classesSelec.map(async (classeId) => {
        const c = classes.find(x => x.id === classeId);
        const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classeId}/suspendre-coach`, {
          method: 'PATCH', headers: _authHdrsAdmin(),
          body: JSON.stringify({
            nouveau_coach_id:  transfertVers,
            nouveau_coach_nom: transfertCoach ? `${transfertCoach.prenom||''} ${transfertCoach.nom||''}`.trim() : '',
            motif: form.motif.trim(),
          }),
        });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok, nom: c?.nom || classeId, error: d.error };
      }));
      const echecs = resultats.filter(r => !r.ok);
      if (echecs.length) {
        setErreur(`Échec pour ${echecs.map(e=>e.nom).join(', ')} : ${echecs[0].error || 'erreur serveur'}`);
        if (echecs.length === resultats.length) return;
      }
      toast.success(`${resultats.length - echecs.length} classe(s) transférée(s) à ${transfertCoach ? `${transfertCoach.prenom} ${transfertCoach.nom}` : 'ce coach'}.`);
      onFermer();
    } catch { setErreur('Erreur réseau'); }
    finally { setSaving(false); }
  }

  const S = {
    overlay: { position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1001, backdropFilter:'blur(4px)' },
    modal:   { background:COULEURS.blanc, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 28px 72px rgba(0,0,0,0.32)', overflow:'hidden' },
    header:  { background:`linear-gradient(135deg, ${COULEURS.navy}, ${VIOLET})`, padding:'20px 28px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 },
    btnX:    { background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, color:'#fff', flexShrink:0 },
    corps:   { flex:1, overflowY:'auto', padding:'24px 28px' },
    section: { marginBottom:24 },
    secTitre:{ fontSize:11, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 },
    select:  { width:'100%', padding:'9px 12px', border:`1.5px solid ${COULEURS.gris200}`, borderRadius:8, fontSize:13, fontFamily:'inherit', background:COULEURS.blanc, outline:'none', boxSizing:'border-box' },
    input:   { width:'100%', padding:'9px 12px', border:`1.5px solid ${COULEURS.gris200}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' },
    footer:  { padding:'16px 28px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10, background:COULEURS.blanc, flexShrink:0 },
    btnAnn:  { padding:'10px 20px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit' },
  };

  return (
    <div style={S.overlay} onClick={() => !saving && onFermer()}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        <div style={S.header}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>🔄 Nouveau remplacement manuel</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:2 }}>Créez un remplacement sans attendre la signalisation du coach</div>
          </div>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>

        {/* Type d'action - délégation temporaire (réversible, coach garde ses classes) vs
            transfert définitif (une/plusieurs classes changent de titulaire pour de bon, sans
            suspendre le compte). */}
        <div style={{ display:'flex', gap:8, padding:'14px 28px 0', flexShrink:0 }}>
          {[
            { v:'delegation', l:'🔄 Délégation temporaire' },
            { v:'transfert',  l:'🔒 Transfert définitif de classe(s)' },
          ].map(opt => (
            <button key={opt.v}
              onClick={() => { setMode(opt.v); setClassesSelec([]); setTransfertVers(''); }}
              style={{ padding:'7px 16px', borderRadius:20, fontSize:12, fontWeight:700, border:`1.5px solid ${mode===opt.v?VIOLET:COULEURS.gris200}`, background:mode===opt.v?VIOLET+'14':COULEURS.blanc, color:mode===opt.v?VIOLET:COULEURS.gris600, cursor:'pointer', fontFamily:'inherit' }}>
              {opt.l}
            </button>
          ))}
        </div>

        {mode === 'transfert' ? (
        <>
        <div style={S.corps}>

          <div style={{ ...S.section, background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#991B1B', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10 }}>👤 Coach titulaire actuel</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>Coach <span style={{ color:'#EF4444' }}>*</span></label>
                <select value={form.absent_id} onChange={e => { const id = e.target.value; setForm(p => ({ ...p, absent_id:id })); setClassesSelec([]); fetchClassesCoach(id); }}
                  style={{ ...S.select, border:'1.5px solid #FCA5A5' }}>
                  <option value="">- Sélectionner un coach -</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>Motif du transfert <span style={{ color:'#EF4444' }}>*</span></label>
                <input type="text" value={form.motif} onChange={e => setForm(p => ({ ...p, motif:e.target.value }))}
                  placeholder="Ex : réorganisation, surcharge, demande du coach…" style={{ ...S.input, border:'1.5px solid #FCA5A5' }} />
              </div>
            </div>
          </div>

          {form.absent_id && (
            <div style={S.section}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={S.secTitre}>🏫 Classe(s) à transférer</div>
                {classesSelec.length > 0 && <span style={{ fontSize:11, color:VIOLET, fontWeight:700 }}>{classesSelec.length} sélectionnée{classesSelec.length>1?'s':''}</span>}
              </div>
              {classes.length === 0 ? (
                <div style={{ textAlign:'center', padding:'12px 0', fontSize:12, color:COULEURS.gris400 }}>Ce coach n'a aucune classe active.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
                  {classes.map(c => {
                    const checked = classesSelec.includes(c.id);
                    return (
                      <label key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:checked?VIOLET+'0D':COULEURS.gris50, border:`1.5px solid ${checked?VIOLET:COULEURS.gris200}`, borderRadius:8, cursor:'pointer' }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setClassesSelec(prev => checked ? prev.filter(id=>id!==c.id) : [...prev, c.id])}
                          style={{ width:14, height:14, accentColor:VIOLET }} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:12, color:COULEURS.navy }}>{c.nom}</div>
                          {c.niveau && <div style={{ fontSize:11, color:COULEURS.gris500 }}>{c.niveau}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {classesSelec.length > 0 && (
            <div style={S.section}>
              <div style={S.secTitre}>📋 Nouveau titulaire</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:240, overflowY:'auto' }}>
                {coaches.filter(c => c.id !== form.absent_id && c.actif !== false).map(c => {
                  const selected = transfertVers === c.id;
                  return (
                    <div key={c.id} onClick={() => setTransfertVers(selected?'':c.id)}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:`1.5px solid ${selected?VIOLET:COULEURS.gris200}`, background:selected?VIOLET+'0D':COULEURS.blanc, cursor:'pointer' }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:selected?VIOLET:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, color:selected?'#fff':VIOLET, flexShrink:0 }}>
                        {((c.prenom?.[0]||'')+(c.nom?.[0]||'')).toUpperCase()}
                      </div>
                      <div style={{ flex:1 }}>
                        <span style={{ fontWeight:700, fontSize:13, color:COULEURS.navy }}>{c.prenom} {c.nom}</span>
                        <div style={{ fontSize:11, color:COULEURS.gris500 }}>{c.email}</div>
                      </div>
                      {selected && <span style={{ fontSize:18, color:VIOLET }}>●</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {erreur && <div style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>{erreur}</div>}
        </div>

        <div style={S.footer}>
          <button style={S.btnAnn} onClick={onFermer} disabled={saving}>Annuler</button>
          <button
            onClick={() => {
              if (!form.absent_id || classesSelec.length===0 || !transfertVers || !form.motif.trim()) {
                setErreur('Coach, classe(s), nouveau coach et motif sont requis.'); return;
              }
              setConfirmOuvert(true);
            }}
            disabled={saving}
            style={{ padding:'9px 22px', borderRadius:9, border:'none', background: saving?'#FCA5A5':'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:'inherit' }}>
            {saving ? 'Transfert en cours…' : `🔒 Transférer ${classesSelec.length>0?`(${classesSelec.length} classe${classesSelec.length>1?'s':''})`:''}`}
          </button>
        </div>

        {confirmOuvert && (
          <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1002 }}
            onClick={() => setConfirmOuvert(false)}>
            <div style={{ background:COULEURS.blanc, borderRadius:16, width:440, maxWidth:'90vw', padding:24, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:15, fontWeight:800, color:'#991B1B', marginBottom:8 }}>🔒 Confirmer ce transfert définitif ?</div>
              <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, marginBottom:20 }}>
                <strong>{transfertCoach ? `${transfertCoach.prenom} ${transfertCoach.nom}` : 'Ce coach'}</strong> deviendra titulaire de <strong>{classesSelec.length} classe{classesSelec.length>1?'s':''}</strong> à la place de <strong>{absentCoach ? `${absentCoach.prenom} ${absentCoach.nom}` : 'ce coach'}</strong> ({classes.filter(c=>classesSelec.includes(c.id)).map(c=>c.nom).join(', ')}). Les séances déjà planifiées, devoirs, médiathèque et fichiers suivent. Le compte de {absentCoach?.prenom || 'ce coach'} n'est PAS suspendu - il garde ses autres classes et son accès.
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button onClick={() => setConfirmOuvert(false)}
                  style={{ padding:'9px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  Annuler
                </button>
                <button onClick={() => { setConfirmOuvert(false); handleTransfert(); }}
                  style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  🔒 Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
        </>
        ) : (
        <>
        <div style={S.corps}>

          {/* Professeur absent */}
          <div style={{ ...S.section, background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#991B1B', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10 }}>👤 Professeur absent</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>Coach absent <span style={{ color:'#EF4444' }}>*</span></label>
                <select value={form.absent_id} onChange={e => fetchClassesCoach(e.target.value)}
                  style={{ ...S.select, border:'1.5px solid #FCA5A5' }}>
                  <option value="">- Sélectionner un coach -</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>Motif de l'absence</label>
                <input type="text" value={form.motif} onChange={e => setForm(p => ({ ...p, motif:e.target.value }))}
                  placeholder="Ex : Maladie, Congé, Suspension…" style={{ ...S.input, border:'1.5px solid #FCA5A5' }} />
              </div>
            </div>
          </div>

          {/* Classe & Dates */}
          <div style={{ ...S.section, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>Classe <span style={{ color:'#EF4444' }}>*</span></label>
              <select value={form.classe_id} onChange={e => fetchSeancesClasse(e.target.value)} disabled={!form.absent_id}
                style={{ ...S.select, background: form.absent_id ? COULEURS.blanc : COULEURS.gris50 }}>
                <option value="">- Choisir une classe -</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>Date de début <span style={{ color:'#EF4444' }}>*</span></label>
              <input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut:e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>Date de fin</label>
              <input type="date" value={form.date_fin} onChange={e => setForm(p => ({ ...p, date_fin:e.target.value }))} style={S.input} />
            </div>
          </div>

          {/* Séances restantes */}
          {form.classe_id && (
            <div style={S.section}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={S.secTitre}>📅 Séances à couvrir</div>
                {seances.length > 0 && <span style={{ fontSize:11, color:VIOLET, fontWeight:700 }}>{sessionsSelec.length}/{seances.length} sélectionnée{sessionsSelec.length>1?'s':''}</span>}
              </div>
              {seancesLoad ? (
                <div style={{ textAlign:'center', padding:12, color:COULEURS.gris400, fontSize:12 }}>Chargement…</div>
              ) : seances.length === 0 ? (
                <div style={{ textAlign:'center', padding:'12px 0', fontSize:12, color:COULEURS.gris400 }}>Aucune séance restante pour cette classe.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
                  {seances.map(s => {
                    const checked = sessionsSelec.includes(s.id);
                    return (
                      <label key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:checked?VIOLET+'0D':COULEURS.gris50, border:`1.5px solid ${checked?VIOLET:COULEURS.gris200}`, borderRadius:8, cursor:'pointer' }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setSessionsSelec(prev => checked ? prev.filter(id=>id!==s.id) : [...prev, s.id])}
                          style={{ width:14, height:14, accentColor:VIOLET }} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:12, color:COULEURS.navy }}>{s.objectifs_session || s.type || 'Séance'}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris500, marginTop:1 }}>📅 {fmtDateCt(s.date)}{s.heure_debut?` · 🕐 ${s.heure_debut.slice(0,5)}`:''}</div>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, color:'#92400E', background:'#FEF3C7', borderRadius:99, padding:'2px 8px' }}>{s.statut}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Suggestion automatique */}
          {form.classe_id && suggestion && (
            <div style={S.section}>
              <div style={S.secTitre}>🏆 Suggestion automatique</div>
              <div onClick={() => setForm(p => ({ ...p, remplacant_id: suggestion.id }))}
                style={{ background:'#F0FDF4', border:'2px solid #86EFAC', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', outline: form.remplacant_id===suggestion.id ? '3px solid #16A34A' : 'none' }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,#16A34A,#22C55E)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, color:'#fff', flexShrink:0 }}>
                  {((suggestion.prenom?.[0]||'')+(suggestion.nom?.[0]||'')).toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:800, fontSize:14, color:COULEURS.navy }}>{suggestion.prenom} {suggestion.nom}</span>
                    <span style={{ fontSize:10, fontWeight:700, background:'#16A34A', color:'#fff', borderRadius:99, padding:'2px 10px' }}>MEILLEUR CHOIX ★</span>
                  </div>
                  <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:2 }}>{suggestion.coach_info?.filiere || '-'}</div>
                </div>
                {form.remplacant_id===suggestion.id && <span style={{ fontSize:20, color:'#16A34A' }}>✓</span>}
              </div>
            </div>
          )}

          {/* Tous les coachs disponibles */}
          {form.classe_id && scoredCoachs.length > 0 && (
            <div style={S.section}>
              <div style={S.secTitre}>📋 Tous les coachs disponibles ({scoredCoachs.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:240, overflowY:'auto' }}>
                {scoredCoachs.map(c => {
                  const selected = form.remplacant_id === c.id;
                  const isBest = suggestion?.id === c.id;
                  return (
                    <div key={c.id} onClick={() => setForm(p => ({ ...p, remplacant_id: selected ? '' : c.id }))}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:`1.5px solid ${selected?VIOLET:COULEURS.gris200}`, background:selected?VIOLET+'0D':COULEURS.blanc, cursor:'pointer' }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:selected?VIOLET:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, color:selected?'#fff':VIOLET, flexShrink:0 }}>
                        {((c.prenom?.[0]||'')+(c.nom?.[0]||'')).toUpperCase()}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          <span style={{ fontWeight:700, fontSize:13, color:COULEURS.navy }}>{c.prenom} {c.nom}</span>
                          {isBest && <span style={{ fontSize:9, fontWeight:700, background:'#16A34A', color:'#fff', borderRadius:99, padding:'1px 7px' }}>RECOMMANDÉ</span>}
                        </div>
                        <div style={{ fontSize:11, color:COULEURS.gris500, marginTop:1 }}>{c.email}</div>
                      </div>
                      {selected && <span style={{ fontSize:18, color:VIOLET }}>●</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {erreur && <div style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>{erreur}</div>}
        </div>

        <div style={S.footer}>
          <div style={{ fontSize:12, color:COULEURS.gris500, marginRight:'auto' }}>
            {sessionsSelec.length > 0 ? `${sessionsSelec.length} séance${sessionsSelec.length>1?'s':''} à couvrir` : 'Aucune séance sélectionnée'}
            {form.date_debut && ` · Du ${fmtDateLg(form.date_debut)}`}
            {form.date_fin && ` au ${fmtDateLg(form.date_fin)}`}
          </div>
          <button style={S.btnAnn} onClick={onFermer} disabled={saving}>Annuler</button>
          <button
            onClick={() => {
              if (!form.absent_id || !form.classe_id || !form.date_debut) {
                setErreur('Coach absent, classe et date de début sont requis.'); return;
              }
              setConfirmOuvert(true);
            }}
            disabled={saving}
            style={{ padding:'9px 22px', borderRadius:9, border:'none', background: saving?'#A78BFA':VIOLET, color:'#fff', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:'inherit' }}>
            {saving ? 'Enregistrement…' : form.remplacant_id ? `✅ Confirmer la délégation (${sessionsSelec.length} séance${sessionsSelec.length>1?'s':''})` : '➕ Créer sans remplaçant'}
          </button>
        </div>

        {/* Confirmation finale */}
        {confirmOuvert && (
          <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1002 }}
            onClick={() => setConfirmOuvert(false)}>
            <div style={{ background:COULEURS.blanc, borderRadius:16, width:440, maxWidth:'90vw', padding:24, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy, marginBottom:8 }}>
                {form.remplacant_id ? '✅ Confirmer cette délégation ?' : '➕ Créer cette demande sans remplaçant ?'}
              </div>
              <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, marginBottom:20 }}>
                {form.remplacant_id ? (
                  <>Vous vous apprêtez à assigner <strong>{remplacant ? `${remplacant.prenom} ${remplacant.nom}` : 'ce coach'}</strong> en remplacement de <strong>{absentCoach ? `${absentCoach.prenom} ${absentCoach.nom}` : 'ce coach'}</strong> sur {sessionsSelec.length} séance{sessionsSelec.length>1?'s':''} ({classeSelec?.nom || '-'}). Délégation temporaire - la classe reste au titulaire, les deux coachs seront notifiés.</>
                ) : (
                  <>Aucun remplaçant n'est sélectionné - la demande sera créée « à pourvoir » pour <strong>{absentCoach ? `${absentCoach.prenom} ${absentCoach.nom}` : 'ce coach'}</strong> ({classeSelec?.nom || '-'}), assignable plus tard.</>
                )}
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button onClick={() => setConfirmOuvert(false)}
                  style={{ padding:'9px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  Annuler
                </button>
                <button onClick={() => { setConfirmOuvert(false); handleSave(); }}
                  style={{ padding:'9px 20px', borderRadius:8, border:'none', background:VIOLET, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
        </>
        )}

      </div>
    </div>
  );
}


// Utilisé par OngletClasses (onboarding) et OngletClassesPAAdvisor (pa_advisor)
/* `zIndex` PAR DÉFAUT À 1600, soit AU-DESSUS de la fiche de classe (1500).
   Cette fiche s'ouvre très souvent DEPUIS une fiche de classe - on clique sur un
   apprenant de la liste - et elle restait alors derrière celle qui l'avait ouverte :
   l'écran semblait ne rien faire. Une modale enfant passe au-dessus de son parent ;
   ouverte seule, un cran de plus ne gêne personne. La prop reste réglable pour un
   appelant qui l'empilerait différemment. */
export function ModalDetailApprenant({ apprenant, groupe, entreprise, onFermer, canCreateParent = false, zIndex = 1600 }) {
  const PAGE_SIZE = 10;
  const { profile: profilCourant } = useAuth();
  const { couleurTheme } = useTheme();

  const [tab,          setTab]         = useState('infos');
  const [noteInterne,  setNote]        = useState(apprenant.notes_internes || '');
  const [noteSauvee,   setNoteSauvee]  = useState(false);
  const [noteSaving,   setNoteSaving]  = useState(false);
  const [noteErr,      setNoteErr]     = useState('');

  /* ── Données des onglets ajoutés (chargées à l'ouverture de l'onglet, pas avant) ──
     `dejaCharge` MARQUE LA TENTATIVE, PAS LE RÉSULTAT, et c'est indispensable :
     les gardes de ces trois effets testaient la donnée elle-même (`testNiveau`,
     `acces`, `historique.length`). Quand la recherche ne rend RIEN - aucun test
     rapproché, aucun événement d'audit - la donnée reste vide, la garde ne bloque
     plus, et `setChargXxx(false)` relance l'effet qui vient de se terminer : requête
     en boucle, et un onglet qui clignote entre « Chargement… » et « Aucun test ».
     Un `useRef` plutôt qu'un state : il ne doit RIEN redéclencher en changeant. */
  const dejaCharge = useRef({ test: false, acces: false, historique: false });
  const [testNiveau,  setTestNiveau]  = useState(null);   // null = pas encore chargé, [] = aucun test
  const [chargTest,   setChargTest]   = useState(false);
  const [acces,       setAcces]       = useState(null);
  const [chargAcces,  setChargAcces]  = useState(false);
  const [accesSaving, setAccesSaving] = useState(false);
  const [accesMsg,    setAccesMsg]    = useState(null);
  const [historique,  setHistorique]  = useState([]);
  const [chargHisto,  setChargHisto]  = useState(false);

  // Parent account creation state
  const [parentAcces,       setParentAcces]       = useState(null);
  const [parentAccesLoading, setParentAccesLoading] = useState(false);
  const [parentAccesErr,    setParentAccesErr]    = useState('');

  // Edit mode for infos
  const [editMode,   setEditMode]   = useState(false);
  /* Les champs de l'APPRENANT LUI-MÊME manquaient : le formulaire d'édition ne portait
     que l'état civil des mineurs et les coordonnées du parent. Sur un adulte en entreprise
     - le cas courant côté assistante - cliquer « Modifier » n'ouvrait donc aucun champ qui
     le concerne, d'où l'impression d'un bouton sans effet. */
  const [editForm,   setEditForm]   = useState({
    nom_complet:      apprenant.nom_complet      || '',
    telephone:        apprenant.telephone        || '',
    niveau_cecr:      apprenant.niveau_cecr      || '',
    objectif_client:  apprenant.objectif_client  || '',
    date_naissance:   apprenant.date_naissance   || '',
    profil_type:      apprenant.profil_type      || 'adulte',
    prenom_parent:    apprenant.prenom_parent    || '',
    nom_parent:       apprenant.nom_parent       || '',
    email_parent:     apprenant.email_parent     || '',
    telephone_parent: apprenant.telephone_parent || '',
    classe:           apprenant.classe           || '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editFlash,  setEditFlash]  = useState(null);
  const [localApp,   setLocalApp]   = useState(apprenant);

  // Données brutes
  const [presences,   setPresences]   = useState([]);
  const [loadPres,    setLoadPres]    = useState(false);
  const [seances,     setSeances]     = useState([]);
  const [loadSeances, setLoadSeances] = useState(false);
  const [evaluations, setEvaluations] = useState([]);
  const [loadEvals,   setLoadEvals]   = useState(false);

  // Filtres dates
  const [presDeb,  setPresDeb]  = useState('');
  const [presFin,  setPresFin]  = useState('');
  const [seaDeb,   setSeaDeb]   = useState('');
  const [seaFin,   setSeaFin]   = useState('');
  const [evalDeb,  setEvalDeb]  = useState('');
  const [evalFin,  setEvalFin]  = useState('');

  // Pages
  const [presPage,  setPresPage]  = useState(1);
  const [seaPage,   setSeaPage]   = useState(1);
  const [evalPage,  setEvalPage]  = useState(1);

  const inscriptionId = apprenant.id;
  const classeId      = groupe?.id || apprenant.classe_id;
  const niv           = apprenant.niveau_cecr;
  /* LE CHROME DE LA MODALE SUIT LE DASHBOARD, PAS LE NIVEAU DE L'APPRENANT.
     `nvc` valait `NIV_COULEUR[niveau]` : l'en-tête, les onglets et les boutons prenaient
     la couleur du niveau CECR, si bien qu'un apprenant A1 ouvrait un bandeau bleu et un
     B2 un bandeau orange — dans le même dashboard, et sans rapport avec sa charte.
     Le badge « Niveau » de l'en-tête, lui, se lit sur un fond blanc translucide : il reste
     lisible quelle que soit la couleur du dashboard, et n'a donc pas besoin de la sienne. */
  const nvc           = couleurTheme;

  const STATUT_CFG = {
    actif:               { bg:'#D1FAE5', txt:'#065F46', lib:'Actif' },
    suspendu:            { bg:'#FEE2E2', txt:'#991B1B', lib:'Suspendu' },
    bloque:              { bg:'#FEE2E2', txt:'#991B1B', lib:'Bloqué' },
    certifie:            { bg:'#EDE9FE', txt:'#5B21B6', lib:'Certifié' },
    en_attente:          { bg:'#FEF3C7', txt:'#92400E', lib:'En attente' },
    test_niveau_pending: { bg:'#F3E8FF', txt:'#6B21A8', lib:'Test en attente' },
  };
  const cfg = STATUT_CFG[apprenant.statut] || STATUT_CFG.en_attente;

  const ageApprenant = apprenant.date_naissance
    ? Math.floor((Date.now() - new Date(apprenant.date_naissance)) / (365.25*24*3600*1000))
    : null;
  /* LE PROFIL DÉCLARÉ FAIT FOI, « adulte » COMPRIS.
     La condition écartait `profil_type === 'adulte'` et retombait alors sur un calcul
     d'âge : un adulte dont la date de naissance est erronée - saisie du jour même, ce qui
     arrive à l'import - se voyait attribuer 0 an, donc la tranche « enfant », donc un
     onglet Parent sur une fiche d'adulte. L'âge n'est plus qu'un repli, pour les seuls
     dossiers où le profil n'a pas été renseigné du tout. */
  const trancheApprenant = apprenant.profil_type
    ? apprenant.profil_type
    : (ageApprenant !== null ? (ageApprenant <= 12 ? 'enfant' : ageApprenant <= 17 ? 'adolescent' : 'adulte') : 'adulte');
  const hasParentData = localApp.email_parent || localApp.prenom_parent || localApp.nom_parent || localApp.telephone_parent;
  /* L'onglet Parent n'a de sens que pour un mineur. `hasParentData` le rattrape quand un
     contact parent a été saisi sur un dossier dont le profil n'a jamais été précisé :
     l'information existe, la masquer la rendrait inaccessible. */
  const showParentTab = trancheApprenant === 'enfant' || trancheApprenant === 'adolescent'
    || (!apprenant.profil_type && hasParentData);

  /* L'ONGLET « ACCÈS » EST RÉSERVÉ À L'ASSISTANTE E-LEARNING. Il expose l'identifiant de
     connexion et le mot de passe temporaire en clair : c'est elle qui ouvre les accès et
     les redonne quand l'apprenant les perd, personne d'autre n'a à les lire.
     `super_admin` y a droit aussi - il n'y a pas de secret qu'on lui cache - mais aucun
     autre profil, PA ou Onboarding compris. */
  /* L'ASSISTANTE E-LEARNING, ET ELLE SEULE.
     `super_admin` y figurait — ajouté au motif qu'il « consulte tout » : c'était une
     interprétation, pas la règle. L'onglet expose l'identifiant et le mot de passe en
     clair ; ce droit appartient à celle qui ouvre et redonne les accès, personne d'autre,
     supervision comprise. */
  const estAssistanteElearning = estRole(profilCourant?.role, 'admin_elearning')
    || ['commercial', 'assistant_elearning', 'corporate'].includes(profilCourant?.role);
  const peutVoirAcces = estAssistanteElearning;

  /* MODIFIER LA FICHE D'UN APPRENANT EST RÉSERVÉ À L'ASSISTANTE E-LEARNING.
     C'est elle qui reçoit le dossier, le vérifie et le corrige tout au long du parcours ;
     le PA, l'Onboarding et le Customer Care le consultent pour décider de leur propre
     geste - assigner un coach, une classe, traiter une demande - pas pour en changer
     l'état civil. Le bouton était visible pour tous, sans cette distinction de métier.
     Le SuperAdmin en est exclu lui aussi : il surveille le parcours, il ne tient pas les
     dossiers — même raison que sur les versements entreprise, où il est passé en lecture
     seule. Voir et modifier relèvent ici du même métier, d'où la constante partagée. */
  const peutModifierApprenant = estAssistanteElearning;

  /* PAS D'ONGLET « PAIEMENTS » : en e-learning, c'est l'entreprise qui paie, et sa
     facturation se tient dans sa propre fiche (onglet Paiements de l'entreprise).
     PAS D'ONGLET « PLANNING OFFICIEL » non plus : la notion de planning validé appartient
     aux groupes de dash ; une classe e-learning n'a que ses séances, déjà couvertes par
     l'onglet Sessions - le dupliquer afficherait deux fois la même chose. */
  const TABS = [
    { id:'infos',       lib:'Profil & Formation', icone:'👤' },
    ...(showParentTab ? [{ id:'parent', lib:'Parent', icone:'👨‍👩‍👧' }] : []),
    { id:'sessions',    lib:'Sessions',       icone:'📅' },
    { id:'test',        lib:'Test de niveau', icone:'📊' },
    { id:'presences',   lib:'Présences',      icone:'✅' },
    { id:'evaluations', lib:'Évaluations',    icone:'📈' },
    /* ONGLET « NOTES INTERNES » RETIRÉ (demande du 12 octobre 2026).
       Son code de rendu est conservé tel quel plus bas, simplement inatteignable : le
       remettre tient en une ligne ici, et la saisie déjà écrite n'a pas à être réécrite.
       `tab` démarre sur 'infos', il ne vaudra donc jamais 'notes'. */
    ...(peutVoirAcces ? [{ id:'acces', lib:'Accès', icone:'🔑' }] : []),
    { id:'historique',  lib:'Historique',     icone:'🕓' },
  ];

  const TYPE_SEANCE    = { cours:'Cours', evaluation:'Évaluation', rattrapage:'Rattrapage', decouverte:'Découverte', presentiel:'Présentiel' };
  const STATUT_SEANCE  = { planifiee:{ c:'#0EA5E9', bg:'#EFF6FF' }, en_cours:{ c:'#F97316', bg:'#FFF7ED' }, terminee:{ c:'#059669', bg:'#D1FAE5' }, annulee:{ c:'#DC2626', bg:'#FEE2E2' } };
  const MENTION_C      = { Excellent:'#059669', Bien:'#0EA5E9', 'Assez Bien':'#6366F1', Passable:'#F59E0B', Insuffisant:'#EF4444' };

  /* TOUS les tests de l'apprenant, et pas seulement le dernier : il en passe un à
     l'entrée, puis un à chaque transfert de classe - c'est même la raison d'être du
     transfert. La progression entre ces tests est ce qu'on vient lire ici.

     La route agrège les DEUX circuits (Agent Placement et test en ligne). Le premier
     écrit dans `inscriptions_adultes`, pas dans `bet_level_test_results` que cet onglet
     interrogeait seule : d'où « Aucun test rapproché » sur un dossier pourtant testé,
     dont le niveau A1 s'affichait juste au-dessus dans l'en-tête de la fiche. */
  useEffect(() => {
    if (tab !== 'test' || dejaCharge.current.test) return;
    const mail = localApp.email;
    if (!mail || mail.includes('@betacademy.app')) { dejaCharge.current.test = true; return; }
    dejaCharge.current.test = true;
    setChargTest(true);
    fetch(`${_API_URL_ADMIN}/api/placement/tests-apprenant?email=${encodeURIComponent(mail)}`, { headers: _authHdrsAdmin() })
      .then(r => r.ok ? r.json() : { tests: [] })
      .then(d => setTestNiveau(Array.isArray(d.tests) ? d.tests : []))
      .catch(() => setTestNiveau([]))
      .finally(() => setChargTest(false));
  }, [tab, localApp.email]);

  // Les identifiants de connexion, lus seulement quand l'onglet Accès est ouvert.
  useEffect(() => {
    if (tab !== 'acces' || dejaCharge.current.acces || !localApp.apprenant_id) return;
    dejaCharge.current.acces = true;
    setChargAcces(true);
    // `profil-acces` existe déjà et rend exactement ce qu'il faut - identifiant, mot de
    // passe temporaire, état du compte - plutôt que d'ajouter une route de plus.
    fetch(`${_API_URL_ADMIN}/api/apprenants/profil-acces?apprenant_id=${localApp.apprenant_id}`, { headers: _authHdrsAdmin() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAcces(d.profil || d.acces || d); })
      .catch(() => {})
      .finally(() => setChargAcces(false));
  }, [tab, localApp.apprenant_id]);

  /* L'historique du dossier : les entrées d'audit qui le citent. Le filtre `entite_id`
     a dû être ajouté côté serveur - la route ne filtrait que par module, acteur et date,
     et aurait rendu le journal de toute l'application. */
  useEffect(() => {
    if (tab !== 'historique' || dejaCharge.current.historique) return;
    dejaCharge.current.historique = true;
    setChargHisto(true);
    fetch(`${_API_URL_ADMIN}/api/audit/logs?entite_id=${apprenant.id}&limit=50&include_non_staff=true`, { headers: _authHdrsAdmin() })
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(d => setHistorique(d.logs || d.data || []))
      .catch(() => {})
      .finally(() => setChargHisto(false));
  }, [tab, apprenant.id]);

  /* La fiche imprimable. Elle reprend ce que la modale montre - identité, formation,
     test de niveau, assiduité - SANS les identifiants de connexion : un PDF circule par
     e-mail et finit sur un bureau, un mot de passe n'a rien à y faire. */
  function exporterFichePDF() {
    const lignes = [
      ['Nom complet',       nomComplet],
      ['E-mail',            localApp.email || '-'],
      ['Téléphone',         localApp.telephone || '-'],
      ['Date de naissance', localApp.date_naissance || '-'],
      ['Profil',            localApp.profil_type || 'adulte'],
      ['Classe',            groupe?.nom || localApp.classe_nom || '-'],
      ['Entreprise',        entreprise?.nom || localApp.entreprise_nom || '-'],
      ['Niveau',            localApp.niveau_cecr_estime || localApp.niveau || '-'],
      ['Objectif du client', localApp.objectif_client || '-'],
      ['Statut',            localApp.statut || '-'],
      ...(testNiveau ? [['Test de niveau', `${testNiveau.niveau_cecr || testNiveau.niveau || '-'}${testNiveau.score != null ? ` (score ${testNiveau.score})` : ''}`]] : []),
    ];
    const corps = lignes.map(([k, v]) => `<tr><td style="font-weight:600;width:220px">${k}</td><td>${v}</td></tr>`).join('');
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET E-Learning</div><div class="doc-header-sub">British English Training · Dossier apprenant</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div></div>
      <div class="doc-title-band">🎓 DOSSIER APPRENANT — ${nomComplet.toUpperCase()}</div>
      <div class="doc-body">
        <div class="section-title">Identité & formation</div>
        <table><tbody>${corps}</tbody></table>
        <div class="doc-footer"><span>BET E-Learning · Dossier apprenant · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, `Dossier apprenant - ${nomComplet}`);
  }

  /* Ouvrir ou redonner les accès. La même route sert aux deux : côté serveur, un compte
     existant voit son mot de passe régénéré, un compte absent est créé. */
  async function creerAcces() {
    if (accesSaving) return;
    setAccesSaving(true); setAccesMsg(null);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces`, {
        method: 'POST',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ apprenant_id: localApp.apprenant_id || null, email: localApp.email, nom_complet: nomComplet, telephone: localApp.telephone || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Opération impossible');
      setAcces(d.acces || d);
      if (d.apprenant_id) setLocalApp(prev => ({ ...prev, apprenant_id: d.apprenant_id }));
      setAccesMsg({ txt: d.email_envoye ? '✅ Accès envoyés par e-mail.' : '✅ Accès générés. Aucun e-mail envoyé (pas d\'adresse réelle).', err: false });
    } catch (e) {
      setAccesMsg({ txt: e.message, err: true });
    } finally { setAccesSaving(false); }
  }

  // Charger le compte parent existant quand on ouvre l'onglet parent
  useEffect(() => {
    if (tab !== 'parent' || parentAcces || parentAccesLoading) return;
    const emailParent = localApp.email_parent;
    if (!emailParent) return;
    setParentAccesLoading(true);
    fetch(`${_API_URL_ADMIN}/api/apprenants/acces-parent?email=${encodeURIComponent(emailParent)}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => { if (d.existe) setParentAcces(d); })
      .catch(() => {})
      .finally(() => setParentAccesLoading(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'presences' || !inscriptionId) return;
    setLoadPres(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${inscriptionId}/presences`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setPresences(d.presences || []))
      .catch(() => setPresences([])).finally(() => setLoadPres(false));
  }, [tab, inscriptionId]);

  useEffect(() => {
    if (tab !== 'sessions' || !classeId) return;
    setLoadSeances(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/seances?classe_id=${classeId}`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setSeances(d.seances || []))
      .catch(() => setSeances([])).finally(() => setLoadSeances(false));
  }, [tab, classeId]);

  useEffect(() => {
    if (tab !== 'evaluations' || !inscriptionId) return;
    setLoadEvals(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${inscriptionId}/evaluations`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setEvaluations(d.evaluations || []))
      .catch(() => setEvaluations([])).finally(() => setLoadEvals(false));
  }, [tab, inscriptionId]);

  // Helper filtrage par date
  function filterByDate(items, getDate, deb, fin) {
    return items.filter(item => {
      const d = getDate(item);
      if (!d) return true;
      const t = new Date(d).getTime();
      if (deb && t < new Date(deb).getTime()) return false;
      if (fin && t > new Date(fin + 'T23:59:59').getTime()) return false;
      return true;
    });
  }

  // Filtres appliqués (toujours sur les données complètes pour les stats)
  const presencesFiltrees  = filterByDate(presences,   p => p.seance?.date,      presDeb, presFin);
  const seancesFiltrees    = filterByDate(seances,     s => s.date,              seaDeb,  seaFin);
  const evaluationsFiltrees = filterByDate(evaluations, e => e.date_evaluation,   evalDeb, evalFin);

  // Pagination
  const paginate = (items, page) => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const presPage_items  = paginate(presencesFiltrees,   presPage);
  const seaPage_items   = paginate(seancesFiltrees,     seaPage);
  const evalPage_items  = paginate(evaluationsFiltrees, evalPage);

  // Stats globales (sans filtre de date)
  const nbPresent  = presences.filter(p => p.statut === 'present').length;
  const nbAbsent   = presences.filter(p => p.statut === 'absent').length;
  const tauxP      = presences.length > 0 ? Math.round(nbPresent / presences.length * 100) : null;
  const presenceParSeance = Object.fromEntries(presences.map(p => [p.seance_id, p.statut]));

  const nomComplet = apprenant.nom_complet || `${apprenant.prenom||''} ${apprenant.nom||''}`.trim() || '-';

  // Composants helpers inline
  const row = (l, v) => (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13 }}>
      <span style={{ color:COULEURS.gris600 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy }}>{v || '-'}</span>
    </div>
  );

  const KpiBar = ({ items }) => (
    <div style={{ display:'flex', gap:12, marginBottom:16 }}>
      {items.map(k => (
        <div key={k.l} style={{ flex:1, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px', textAlign:'center' }}>
          <div style={{ fontSize:19, fontWeight:800, color:k.c }}>{k.v}</div>
          <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
        </div>
      ))}
    </div>
  );

  const FiltreDate = ({ deb, fin, setDeb, setFin, onReset, couleur }) => (
    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
      <span style={{ fontSize:12, fontWeight:600, color:COULEURS.gris600 }}>📅 Période :</span>
      <input type="date" value={deb} onChange={e => { setDeb(e.target.value); }}
        style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy }} />
      <span style={{ fontSize:12, color:COULEURS.gris400 }}>→</span>
      <input type="date" value={fin} onChange={e => { setFin(e.target.value); }}
        style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy }} />
      {(deb || fin) && (
        <button onClick={onReset}
          style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:11, fontWeight:600, color:COULEURS.gris600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          ✕ Réinitialiser
        </button>
      )}
      {(deb || fin) && (
        <span style={{ fontSize:11, color:couleur, fontWeight:600, background:`${couleur}15`, padding:'4px 10px', borderRadius:20 }}>
          {presencesFiltrees.length !== presences.length || seancesFiltrees.length !== seances.length || evaluationsFiltrees.length !== evaluations.length
            ? 'Filtre actif' : 'Filtre actif'}
        </span>
      )}
    </div>
  );

  const Pagination = ({ total, page, setPage, couleur }) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, padding:'10px 14px', background:COULEURS.gris50, borderRadius:10, border:`1px solid ${COULEURS.gris200}` }}>
        <span style={{ fontSize:12, color:COULEURS.gris500 }}>
          {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, total)} sur {total}
        </span>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => setPage(1)} disabled={page===1}
            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:page===1?'not-allowed':'pointer', color:page===1?COULEURS.gris300:COULEURS.gris600 }}>«</button>
          <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:page===1?'not-allowed':'pointer', color:page===1?COULEURS.gris300:COULEURS.gris600 }}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => i+1).filter(p => Math.abs(p-page) <= 2).map(p => (
            <button key={p} onClick={() => setPage(p)}
              style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${p===page ? couleur : COULEURS.gris200}`, background: p===page ? couleur : COULEURS.blanc, fontSize:12, cursor:'pointer', fontWeight: p===page ? 700 : 400, color: p===page ? '#fff' : COULEURS.gris600 }}>{p}</button>
          ))}
          <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:page===totalPages?'not-allowed':'pointer', color:page===totalPages?COULEURS.gris300:COULEURS.gris600 }}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page===totalPages}
            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:page===totalPages?'not-allowed':'pointer', color:page===totalPages?COULEURS.gris300:COULEURS.gris600 }}>»</button>
        </div>
      </div>
    );
  };

  const Vide = ({ icone, texte, sous }) => (
    <div style={{ textAlign:'center', padding:'40px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
      <div style={{ fontSize:36, marginBottom:10 }}>{icone}</div>
      <div style={{ fontWeight:600, color:COULEURS.navy }}>{texte}</div>
      {sous && <div style={{ fontSize:12, marginTop:6 }}>{sous}</div>}
    </div>
  );

  const THead = ({ cols }) => (
    <div style={{ display:'grid', gridTemplateColumns:cols, padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
      {Array.isArray(cols) ? null : null}
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.70)', display:'flex', alignItems:'center', justifyContent:'center', zIndex, backdropFilter:'blur(3px)', padding:'16px' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header gradient */}
        <div style={{ background:`linear-gradient(135deg,${nvc}DD,${nvc})`, padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ width:50, height:50, borderRadius:14, overflow:'hidden', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'#fff', flexShrink:0 }}>
                {(localApp.avatar_url || apprenant.avatar_url) ? (
                  <img src={localApp.avatar_url || apprenant.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
                ) : nomComplet.split(' ').map(p=>p[0]||'').slice(0,2).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{nomComplet}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3 }}>
                  {groupe?.nom || '-'}{entreprise?.nom ? ` · ${entreprise.nom}` : ''}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={exporterFichePDF}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'rgba(255,255,255,0.18)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                📄 Export PDF
              </button>
              <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
          </div>
          <div style={{ display:'flex', gap:24, marginTop:16, flexWrap:'wrap' }}>
            {[
              { l:'Niveau',      v: niv ? <span style={{ background:'rgba(255,255,255,0.25)', color:'#fff', padding:'2px 10px', borderRadius:6, fontSize:12, fontWeight:800 }}>{niv}</span> : '-' },
              { l:'Présence',    v: tauxP !== null ? `${tauxP}%` : '-' },
              { l:'Séances',     v: presences.length > 0 ? `${nbPresent}/${presences.length}` : '-' },
              { l:'Évaluations', v: evaluations.length > 0 ? evaluations.length : '-' },
              { l:'Statut',      v: <span style={{ background:cfg.bg, color:cfg.txt, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700 }}>{cfg.lib}</span> },
              { l:'Inscription', v: apprenant.date_inscription ? new Date(apprenant.date_inscription).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '-' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{s.v}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', background:COULEURS.blanc, borderBottom:`1px solid ${COULEURS.gris200}`, padding:'0 8px', flexShrink:0, overflowX:'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:'11px 16px', border:'none', background:'transparent', borderBottom: tab===t.id ? `2.5px solid ${nvc}` : '2.5px solid transparent', color: tab===t.id ? nvc : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', transition:'all 0.15s' }}>
              <span>{t.icone}</span><span>{t.lib}</span>
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ flex:1, overflowY:'auto', padding:24 }}>

          {/* ── INFOS ── */}
          {tab === 'infos' && (() => {
            const fmtDN = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : null;
            const age   = localApp.date_naissance ? Math.floor((Date.now() - new Date(localApp.date_naissance)) / (365.25*24*3600*1000)) : null;
            const hasParent = localApp.email_parent || localApp.prenom_parent || localApp.nom_parent || localApp.telephone_parent;

            async function sauvegarderProfil() {
              if (editSaving) return;
              setEditSaving(true);
              setEditFlash(null);
              try {
                const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/apprenants/${apprenant.id}`, {
                  method: 'PATCH',
                  headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    nom_complet:      editForm.nom_complet      || null,
                    telephone:        editForm.telephone        || null,
                    niveau_cecr:      editForm.niveau_cecr      || null,
                    objectif_client:  editForm.objectif_client  || null,
                    date_naissance:   editForm.date_naissance   || null,
                    profil_type:      editForm.profil_type      || null,
                    prenom_parent:    editForm.prenom_parent    || null,
                    nom_parent:       editForm.nom_parent       || null,
                    email_parent:     editForm.email_parent     || null,
                    telephone_parent: editForm.telephone_parent || null,
                    classe:           editForm.classe           || null,
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Erreur serveur');
                setLocalApp(prev => ({ ...prev, ...d.apprenant }));
                setEditMode(false);
                setEditFlash({ ok: true, msg: '✅ Profil mis à jour.' });
                setTimeout(() => setEditFlash(null), 3500);
              } catch (e) {
                setEditFlash({ ok: false, msg: e.message });
              } finally {
                setEditSaving(false);
              }
            }

            const inpSt = { padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy, width:'100%', boxSizing:'border-box' };
            const fld = (lbl, key, type = 'text') => (
              <div key={key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{lbl}</label>
                <input type={type} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={inpSt} />
              </div>
            );

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                {/* Bouton modifier / annuler */}
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                  {editFlash && (
                    <span style={{ fontSize:12, padding:'6px 14px', borderRadius:20, background: editFlash.ok ? '#D1FAE5' : '#FEE2E2', color: editFlash.ok ? '#065F46' : '#DC2626', fontWeight:600, display:'flex', alignItems:'center' }}>
                      {editFlash.msg}
                    </span>
                  )}
                  {editMode ? (
                    <>
                      <button onClick={() => { setEditMode(false); setEditFlash(null); }}
                        style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, fontWeight:600, cursor:'pointer', color:COULEURS.gris600, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        Annuler
                      </button>
                      <button onClick={sauvegarderProfil} disabled={editSaving}
                        style={{ padding:'7px 16px', borderRadius:8, border:'none', background:nvc, fontSize:12, fontWeight:700, cursor:'pointer', color:'#fff', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        {editSaving ? '⏳ Enregistrement…' : '💾 Enregistrer'}
                      </button>
                    </>
                  ) : peutModifierApprenant ? (
                    <button onClick={() => setEditMode(true)}
                      style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${nvc}`, background:COULEURS.blanc, fontSize:12, fontWeight:700, cursor:'pointer', color:nvc, fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                      ✏️ Modifier
                    </button>
                  ) : (
                    <span style={{ fontSize:11, padding:'5px 12px', borderRadius:20, background:COULEURS.gris100, color:COULEURS.gris600, fontWeight:600 }}>
                      🔒 Modification réservée à l'assistante e-learning
                    </span>
                  )}
                </div>

                {editMode && peutModifierApprenant ? (
                  /* ── Formulaire d'édition ── */
                  <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:16, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>🎓 Apprenant</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                        {fld('Nom complet', 'nom_complet')}
                        {fld('Téléphone', 'telephone')}
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Niveau CECR</label>
                          <select value={editForm.niveau_cecr} onChange={e => setEditForm(f => ({ ...f, niveau_cecr: e.target.value }))} style={inpSt}>
                            <option value="">— Non évalué —</option>
                            {['A0','A1','A2','B1','B2','C1','C2'].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        {/* L'E-MAIL EST EN LECTURE SEULE, et c'est voulu : c'est l'identifiant
                            de connexion de l'apprenant. Le changer ici ne changerait pas son
                            compte Supabase Auth - il garderait une adresse affichée qui
                            n'ouvre plus sa session. Cela relève d'un geste dédié. */}
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>E-mail (identifiant)</label>
                          <input value={localApp.email || ''} disabled
                            style={{ ...inpSt, background:COULEURS.gris50, color:COULEURS.gris400, cursor:'not-allowed' }} />
                          <span style={{ fontSize:10, color:COULEURS.gris400 }}>Sert à la connexion — se modifie depuis l'onglet Accès.</span>
                        </div>
                      </div>
                      {/* L'objectif : ce qui détermine le choix du coach par le PA Advisor. */}
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>🎯 Objectif du client</label>
                        <textarea value={editForm.objectif_client} rows={2}
                          placeholder="Ex : préparer un entretien d'embauche, animer des réunions en anglais…"
                          onChange={e => setEditForm(f => ({ ...f, objectif_client: e.target.value }))}
                          style={{ ...inpSt, resize:'vertical', fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                      </div>
                    </div>
                    <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:16, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>👤 Informations personnelles</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                        {fld('Date de naissance', 'date_naissance', 'date')}
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Profil</label>
                          <select value={editForm.profil_type} onChange={e => setEditForm(f => ({ ...f, profil_type: e.target.value }))} style={inpSt}>
                            <option value="adulte">🧑 Adulte</option>
                            <option value="adolescent">🧑 Adolescent (13–17 ans)</option>
                            <option value="enfant">🧒 Enfant (≤ 12 ans)</option>
                          </select>
                        </div>
                        {fld('Classe scolaire (ex: CM1, 6ème…)', 'classe')}
                      </div>
                    </div>
                    <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'20px 24px' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#0369A1', marginBottom:16, paddingBottom:8, borderBottom:'1px solid #BAE6FD' }}>👨‍👩‍👧 Contact parent / tuteur</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                        {fld('Prénom parent', 'prenom_parent')}
                        {fld('Nom parent', 'nom_parent')}
                        {fld('Email parent', 'email_parent', 'email')}
                        {fld('Téléphone parent', 'telephone_parent', 'tel')}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Vue lecture ── */
                  <>
                    {/* L'OBJECTIF EN PREMIER, ET EN PLEINE LARGEUR. C'est la raison pour
                        laquelle cette personne apprend l'anglais - préparer un entretien,
                        animer des réunions, passer une certification - et c'est ce qui
                        détermine le choix du coach par le PA Advisor. Le reléguer parmi les
                        champs d'état civil en ferait une ligne qu'on ne lit pas. */}
                    <div style={{ background: localApp.objectif_client ? '#F5F3FF' : COULEURS.gris50, border:`1px solid ${localApp.objectif_client ? '#DDD6FE' : COULEURS.gris200}`, borderRadius:14, padding:'16px 22px', marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:700, color: localApp.objectif_client ? '#6D28D9' : COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                        🎯 Objectif du client
                      </div>
                      {localApp.objectif_client ? (
                        <div style={{ fontSize:14, color:COULEURS.navy, lineHeight:1.6 }}>{localApp.objectif_client}</div>
                      ) : (
                        <div style={{ fontSize:13, color:COULEURS.gris400, fontStyle:'italic' }}>
                          Aucun objectif renseigné — il se saisit sur la fiche d'inscription, et guide le choix du coach.
                        </div>
                      )}
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'18px 22px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>👤 Informations</div>
                        {row('Nom complet',        nomComplet)}
                        {row('Email',              localApp.email)}
                        {row('Téléphone',          localApp.telephone)}
                        {row('Date de naissance',  fmtDN(localApp.date_naissance))}
                        {age !== null && row('Âge', `${age} ans`)}
                        {row('Date inscription',   localApp.date_inscription ? new Date(localApp.date_inscription).toLocaleDateString('fr-FR') : null)}
                      </div>
                      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'18px 22px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>🎓 Scolarité</div>
                        {row('Niveau CECR',    niv || 'Non évalué')}
                        {row('Statut',         cfg.lib)}
                        {row('Classe e-learn', groupe?.nom)}
                        {localApp.classe && row('Classe scolaire', localApp.classe)}
                        {row('Entreprise',     entreprise?.nom)}
                        {row('Compte créé',    localApp.apprenant_id ? '✅ Oui' : '⏳ Non')}
                        {/* Le profil est affiché même quand il vaut « adulte » : c'est lui qui
                            commande la présence de l'onglet Parent, et le masquer rendait
                            incompréhensible qu'une fiche l'ait et une autre non. */}
                        {localApp.profil_type && row('Profil', localApp.profil_type === 'enfant' ? '🧒 Enfant' : localApp.profil_type === 'adolescent' ? '🧑 Adolescent' : '🧑 Adulte')}
                      </div>
                    </div>
                    {hasParent && (
                      <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'18px 22px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0369A1', marginBottom:12, paddingBottom:8, borderBottom:'1px solid #BAE6FD' }}>👨‍👩‍👧 Contact parent / tuteur</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
                          {[
                            ['Prénom parent',  localApp.prenom_parent],
                            ['Nom parent',     localApp.nom_parent],
                            ['Email parent',   localApp.email_parent],
                            ['Tél. parent',    localApp.telephone_parent],
                          ].map(([l, v]) => v ? (
                            <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #E0F2FE', fontSize:13 }}>
                              <span style={{ color:'#0369A1' }}>{l}</span>
                              <span style={{ fontWeight:600, color:COULEURS.navy }}>{v}</span>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── PARENT ── */}
          {tab === 'parent' && (() => {
            async function creerAccesParent() {
              if (parentAccesLoading) return;
              if (!localApp.email_parent && !localApp.telephone_parent) {
                setParentAccesErr('Aucun email ni téléphone parent disponible. Ajoutez-les d\'abord dans l\'onglet Infos.');
                return;
              }
              setParentAccesLoading(true);
              setParentAccesErr('');
              try {
                const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces-parent`, {
                  method: 'POST',
                  headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    prenom_parent: localApp.prenom_parent,
                    nom_parent:    localApp.nom_parent,
                    email_parent:  localApp.email_parent,
                    telephone_parent: localApp.telephone_parent,
                    inscription_id: apprenant.id,
                    enfant_nom: apprenant.nom_complet,
                  }),
                });
                const d = await r.json();
                if (!r.ok) { setParentAccesErr(d.error || 'Erreur serveur'); return; }
                setParentAcces(d);
              } catch (e) {
                setParentAccesErr(e.message);
              } finally {
                setParentAccesLoading(false);
              }
            }

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {/* Infos parent */}
                <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'20px 24px' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#0369A1', marginBottom:14, paddingBottom:10, borderBottom:'1px solid #BAE6FD', display:'flex', alignItems:'center', gap:8 }}>
                    👨‍👩‍👧 Contact parent / tuteur
                  </div>
                  {(localApp.email_parent || localApp.prenom_parent || localApp.nom_parent || localApp.telephone_parent) ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {[
                        ['Prénom', localApp.prenom_parent],
                        ['Nom',    localApp.nom_parent],
                        ['Email',  localApp.email_parent],
                        ['Tél.',   localApp.telephone_parent],
                      ].map(([l, v]) => (
                        <div key={l} style={{ background:COULEURS.blanc, border:'1px solid #BAE6FD', borderRadius:10, padding:'12px 16px' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{l}</div>
                          <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy }}>{v || '-'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'20px', color:COULEURS.gris400, fontSize:13 }}>
                      Aucune information parent enregistrée pour cet apprenant.
                    </div>
                  )}
                </div>

                {/* Accès parent - réservé à l'Onboarding */}
                {canCreateParent && (
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      🔐 Créer un accès Dashboard Parent
                    </div>

                    {parentAccesLoading ? (
                      <div style={{ textAlign:'center', padding:'16px', color:COULEURS.gris400, fontSize:13 }}>⏳ Vérification du compte parent…</div>
                    ) : parentAcces ? (
                      <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'16px 20px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#166534', marginBottom:10 }}>✅ Accès parent actif</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {[
                            ['Identifiant', parentAcces.login_email],
                            parentAcces.mdp_initial ? ['Mot de passe temporaire', parentAcces.mdp_initial] : null,
                          ].filter(Boolean).map(([l, v]) => (
                            <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid #BBF7D0' }}>
                              <span style={{ color:'#166534' }}>{l}</span>
                              <span style={{ fontWeight:700, color:COULEURS.navy, fontFamily:'monospace' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize:11, color:'#166534', marginTop:10 }}>
                          {parentAcces.mdp_initial
                            ? 'Le parent devra changer son mot de passe à la première connexion sur le portail parent.'
                            : '✅ Le parent a déjà changé son mot de passe temporaire - compte actif.'}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:14, lineHeight:'1.6' }}>
                          Crée un compte pour que le parent puisse suivre la progression de son enfant sur le portail parent BET E-Learning.
                          {!(localApp.email_parent || localApp.telephone_parent) && (
                            <span style={{ display:'block', marginTop:6, color:'#DC2626', fontWeight:600 }}>
                              ⚠️ Aucune coordonnée parent renseignée - allez dans l'onglet Infos pour les ajouter d'abord.
                            </span>
                          )}
                        </div>
                        {parentAccesErr && (
                          <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#DC2626', marginBottom:12 }}>
                            {parentAccesErr}
                          </div>
                        )}
                        {(() => {
                          const canCreate = !!(localApp.email_parent || localApp.telephone_parent);
                          return (
                            <button
                              onClick={creerAccesParent}
                              disabled={parentAccesLoading || !canCreate}
                              style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 20px', borderRadius:10, border:'none', background: canCreate ? nvc : COULEURS.gris200, color: canCreate ? '#fff' : COULEURS.gris400, fontWeight:700, fontSize:13, cursor: canCreate ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                            >
                              {parentAccesLoading ? '⏳ Création en cours…' : '🔑 Créer accès parent'}
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Message informatif côté PA Advisor (pas de création) */}
                {!canCreateParent && (
                  <div style={{ background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', fontSize:12, color:COULEURS.gris500, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>ℹ️</span>
                    La création des accès parents est gérée par l'équipe Onboarding.
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── PRÉSENCES ── */}
          {tab === 'presences' && (
            loadPres ? (
              <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400 }}>⏳ Chargement des présences…</div>
            ) : (
              <>
                <KpiBar items={[
                  { l:'Présent', v:nbPresent,        c:COULEURS.succes },
                  { l:'Absent',  v:nbAbsent,         c:'#EF4444' },
                  { l:'Total',   v:presences.length, c:COULEURS.navy },
                  { l:'Taux',    v: tauxP !== null ? `${tauxP}%` : '-', c: tauxP === null ? COULEURS.gris400 : tauxP >= 80 ? COULEURS.succes : tauxP >= 60 ? '#F59E0B' : '#EF4444' },
                ]} />
                <FiltreDate deb={presDeb} fin={presFin} setDeb={v=>{ setPresDeb(v); setPresPage(1); }} setFin={v=>{ setPresFin(v); setPresPage(1); }} onReset={()=>{ setPresDeb(''); setPresFin(''); setPresPage(1); }} couleur={nvc} />
                {presencesFiltrees.length === 0 ? (
                  <Vide icone="📋" texte="Aucune présence" sous={presDeb||presFin ? 'Aucun résultat pour cette période.' : 'Les présences sont saisies par le coach lors des séances.'} />
                ) : (
                  <>
                    <div style={{ background:COULEURS.blanc, borderRadius:10, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        <span>Date</span><span>Objectifs / Session</span><span>Horaire</span><span>Type</span><span>Statut</span>
                      </div>
                      {presPage_items.map((p, i) => {
                        const est    = p.statut === 'present';
                        const seance = p.seance || {};
                        const dateStr = seance.date ? new Date(seance.date).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short' }) : '-';
                        const horaire = seance.heure_debut ? `${seance.heure_debut}–${seance.heure_fin||''}` : '-';
                        return (
                          <div key={p.id||i} style={{ display:'grid', gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr', padding:'10px 16px', borderBottom: i < presPage_items.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center' }}>
                            <span style={{ color:COULEURS.navy, fontWeight:600 }}>{dateStr}</span>
                            <span style={{ color:COULEURS.gris600 }}>{seance.objectifs_session || '-'}</span>
                            <span style={{ color:COULEURS.gris500 }}>{horaire}</span>
                            <span style={{ color:COULEURS.gris500 }}>{TYPE_SEANCE[seance.type] || seance.type || '-'}</span>
                            <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:est?'#D1FAE5':'#FEE2E2', color:est?'#065F46':'#991B1B', display:'inline-block' }}>
                              {est ? '✓ Présent' : '✗ Absent'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <Pagination total={presencesFiltrees.length} page={presPage} setPage={setPresPage} couleur={nvc} />
                  </>
                )}
              </>
            )
          )}

          {/* ── SESSIONS ── */}
          {tab === 'sessions' && (
            loadSeances ? (
              <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400 }}>⏳ Chargement des sessions…</div>
            ) : (
              <>
                <KpiBar items={[
                  { l:'Total séances', v: seances.length,                                    c:COULEURS.navy },
                  { l:'Terminées',     v: seances.filter(s=>s.statut==='terminee').length,   c:'#059669' },
                  { l:'Planifiées',    v: seances.filter(s=>s.statut==='planifiee').length,  c:'#0EA5E9' },
                  { l:'Ma présence',   v: `${nbPresent}/${presences.length}`,                c:nvc },
                ]} />
                <FiltreDate deb={seaDeb} fin={seaFin} setDeb={v=>{ setSeaDeb(v); setSeaPage(1); }} setFin={v=>{ setSeaFin(v); setSeaPage(1); }} onReset={()=>{ setSeaDeb(''); setSeaFin(''); setSeaPage(1); }} couleur={nvc} />
                {seancesFiltrees.length === 0 ? (
                  <Vide icone="📅" texte="Aucune session" sous={seaDeb||seaFin ? 'Aucun résultat pour cette période.' : 'Aucune session planifiée dans cette classe.'} />
                ) : (
                  <>
                    <div style={{ background:COULEURS.blanc, borderRadius:10, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        <span>Date</span><span>Objectifs</span><span>Horaire</span><span>Type</span><span>Présence</span>
                      </div>
                      {seaPage_items.map((s, i) => {
                        const sts = STATUT_SEANCE[s.statut] || { c:COULEURS.gris400, bg:COULEURS.gris50 };
                        const presenceSt = presenceParSeance[s.id];
                        const dateStr = s.date ? new Date(s.date).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short', year:'numeric' }) : '-';
                        return (
                          <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr', padding:'10px 16px', borderBottom: i < seaPage_items.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: presenceSt === 'absent' ? '#FFF5F5' : 'transparent' }}>
                            <span style={{ color:COULEURS.navy, fontWeight:600 }}>{dateStr}</span>
                            <span style={{ color:COULEURS.gris600 }}>{s.objectifs_session || '-'}</span>
                            <span style={{ color:COULEURS.gris500 }}>{s.heure_debut ? `${s.heure_debut}–${s.heure_fin||''}` : '-'}</span>
                            <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background:sts.bg, color:sts.c, display:'inline-block' }}>{TYPE_SEANCE[s.type] || s.type || '-'}</span>
                            <span>
                              {!presenceSt
                                ? <span style={{ color:COULEURS.gris400, fontSize:11 }}>-</span>
                                : presenceSt === 'present'
                                  ? <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:'#D1FAE5', color:'#065F46' }}>✓ Présent</span>
                                  : <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:'#FEE2E2', color:'#991B1B' }}>✗ Absent</span>
                              }
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <Pagination total={seancesFiltrees.length} page={seaPage} setPage={setSeaPage} couleur={nvc} />
                  </>
                )}
              </>
            )
          )}

          {/* ── ÉVALUATIONS ── */}
          {tab === 'evaluations' && (
            loadEvals ? (
              <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400 }}>⏳ Chargement des évaluations…</div>
            ) : (() => {
              const avecNote = evaluations.filter(e => e.note != null);
              const moy = avecNote.length > 0 ? avecNote.reduce((acc, e) => acc + (e.note / (e.note_max || 20)) * 100, 0) / avecNote.length : 0;
              return (
                <>
                  <KpiBar items={[
                    { l:'Total',      v: evaluations.length,                                  c:COULEURS.navy },
                    { l:'Moyenne',    v: avecNote.length > 0 ? `${moy.toFixed(0)}%` : '-',   c: moy >= 75 ? '#059669' : moy >= 50 ? '#F59E0B' : '#EF4444' },
                    { l:'Manuelles',  v: evaluations.filter(e=>e.source==='manuel').length,   c:'#6366F1' },
                    { l:'Devoirs',    v: evaluations.filter(e=>e.source==='devoir').length,   c:'#0EA5E9' },
                  ]} />
                  <FiltreDate deb={evalDeb} fin={evalFin} setDeb={v=>{ setEvalDeb(v); setEvalPage(1); }} setFin={v=>{ setEvalFin(v); setEvalPage(1); }} onReset={()=>{ setEvalDeb(''); setEvalFin(''); setEvalPage(1); }} couleur={nvc} />
                  {evaluationsFiltrees.length === 0 ? (
                    <Vide icone="📊" texte="Aucune évaluation" sous={evalDeb||evalFin ? 'Aucun résultat pour cette période.' : 'Les notes manuelles et devoirs corrigés apparaîtront ici.'} />
                  ) : (
                    <>
                      <div style={{ background:COULEURS.blanc, borderRadius:10, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 2fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                          <span>Titre</span><span>Note</span><span>Mention</span><span>Source</span><span>Commentaire</span>
                        </div>
                        {evalPage_items.map((e, i) => {
                          const pct = e.note != null ? Math.round((e.note / (e.note_max || 20)) * 100) : null;
                          const mc  = MENTION_C[e.mention] || COULEURS.gris400;
                          const dateStr = e.date_evaluation ? new Date(e.date_evaluation).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) : '';
                          return (
                            <div key={e.id||i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 2fr', padding:'10px 16px', borderBottom: i < evalPage_items.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center' }}>
                              <div>
                                <div style={{ fontWeight:600, color:COULEURS.navy }}>{e.titre || '-'}</div>
                                {dateStr && <div style={{ fontSize:11, color:COULEURS.gris400 }}>{dateStr}</div>}
                              </div>
                              <span style={{ fontWeight:800, color: pct==null?COULEURS.gris400:pct>=75?'#059669':pct>=50?'#F59E0B':'#EF4444' }}>
                                {e.note != null ? `${e.note}/${e.note_max||20}` : '-'}
                              </span>
                              <span>
                                {e.mention ? <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background:`${mc}18`, color:mc }}>{e.mention}</span> : '-'}
                              </span>
                              <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600, background:e.source==='devoir'?'#EFF6FF':'#EDE9FE', color:e.source==='devoir'?'#1D4ED8':'#5B21B6' }}>
                                {e.source === 'devoir' ? 'Devoir' : 'Manuel'}
                              </span>
                              <span style={{ fontSize:11, color:COULEURS.gris600 }}>{e.commentaire_coach || '-'}</span>
                            </div>
                          );
                        })}
                      </div>
                      <Pagination total={evaluationsFiltrees.length} page={evalPage} setPage={setEvalPage} couleur={nvc} />
                    </>
                  )}
                </>
              );
            })()
          )}

          {/* ── NOTES INTERNES — ONGLET RETIRÉ ──
               Bloc conservé et inatteignable : l'entrée correspondante a été ôtée de
               `TABS` ci-dessus, `tab` ne vaut donc jamais 'notes'. Pour le réactiver,
               remettre la ligne dans `TABS` — rien d'autre à toucher. */}
          {tab === 'notes' && (
            <>
              <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'12px 16px', marginBottom:20, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:16 }}>🔒</span>
                <div style={{ fontSize:12, color:'#92400E' }}>Ces notes sont visibles uniquement par les PA Advisors et administrateurs. Elles ne sont pas communiquées à l'apprenant.</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>Ajouter une note</div>
              <textarea
                value={noteInterne}
                onChange={e => { setNote(e.target.value); setNoteSauvee(false); setNoteErr(''); }}
                placeholder={`Observations sur ${nomComplet}, recommandations pédagogiques, points d'attention...`}
                rows={6}
                style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', resize:'vertical', boxSizing:'border-box', color:COULEURS.navy, lineHeight:1.6 }}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10, marginTop:10 }}>
                {noteErr && <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>{noteErr}</span>}
                <button
                  disabled={noteSaving}
                  onClick={async () => {
                    setNoteSaving(true);
                    setNoteErr('');
                    try {
                      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/apprenants/${apprenant.id}`, {
                        method: 'PATCH',
                        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes_internes: noteInterne }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
                      setLocalApp(prev => ({ ...prev, notes_internes: noteInterne }));
                      setNoteSauvee(true);
                    } catch (e) {
                      setNoteErr(e.message);
                    } finally {
                      setNoteSaving(false);
                    }
                  }}
                  style={{ padding:'9px 22px', borderRadius:9, border:'none', background: noteSauvee ? COULEURS.succes : nvc, color:'#fff', cursor: noteSaving ? 'default' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:13, fontWeight:700, transition:'background 0.2s' }}>
                  {noteSaving ? '⏳ Enregistrement…' : noteSauvee ? '✓ Sauvegardé' : '💾 Sauvegarder'}
                </button>
              </div>
            </>
          )}

          {/* ── TEST DE NIVEAU ── */}
          {tab === 'test' && (
            chargTest || testNiveau === null ? <div style={{ textAlign:'center', padding:'40px 0', color:COULEURS.gris400 }}>Chargement…</div>
            : testNiveau.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 24px', background:COULEURS.gris50, borderRadius:12, border:`2px dashed ${COULEURS.gris200}` }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📊</div>
                <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun test de niveau rapproché</div>
                <div style={{ fontSize:12, color:COULEURS.gris600 }}>
                  Le rapprochement se fait sur l'adresse e-mail. {localApp.email ? `Aucun résultat pour ${localApp.email}.` : "Cet apprenant n'a pas d'adresse e-mail propre."}
                </div>
              </div>
            ) : (
              <>
                {/* La progression d'abord, quand il y a de quoi la lire : c'est ce que
                    plusieurs tests racontent, et c'est l'intérêt de les garder tous. */}
                {testNiveau.length > 1 && (
                  <div style={{ background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:12, padding:'14px 18px', marginBottom:18 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#6D28D9', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
                      Progression · {testNiveau.length} tests
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      {[...testNiveau].reverse().map((t, i, arr) => (
                        <span key={t.id || i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ padding:'4px 12px', borderRadius:8, background: i === arr.length-1 ? nvc : COULEURS.blanc, color: i === arr.length-1 ? '#fff' : COULEURS.navy, border:`1px solid ${i === arr.length-1 ? nvc : COULEURS.gris200}`, fontSize:13, fontWeight:800 }}>
                            {t.niveau || '?'}
                          </span>
                          {i < arr.length-1 && <span style={{ color:'#A78BFA', fontSize:14 }}>→</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {testNiveau.map((t, i) => (
                    <div key={t.id || i} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderLeft:`3px solid ${i === 0 ? nvc : COULEURS.gris200}`, borderRadius:12, padding:'16px 20px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:20, fontWeight:800, color:nvc }}>{t.niveau || '-'}</span>
                          <span style={{ padding:'3px 10px', borderRadius:20, background: t.origine === 'placement' ? '#EDE9FE' : '#DBEAFE', color: t.origine === 'placement' ? '#5B21B6' : '#1D4ED8', fontSize:10, fontWeight:700 }}>
                            {t.libelle_origine}
                          </span>
                          {i === 0 && <span style={{ padding:'3px 10px', borderRadius:20, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:700 }}>Le plus récent</span>}
                        </div>
                        <span style={{ fontSize:12, color:COULEURS.gris600 }}>{t.date || '-'}</span>
                      </div>

                      {(t.score != null || t.points || t.reponses || t.duree_min) && (
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:10, marginBottom:10 }}>
                          {[
                            t.score != null && { l:'Score',          v:`${t.score}%` },
                            t.points        && { l:'Points',         v:t.points },
                            t.reponses      && { l:'Bonnes réponses', v:t.reponses },
                            t.duree_min     && { l:'Durée',          v:`${t.duree_min} min` },
                            t.statut        && { l:'Correction',     v:t.statut },
                          ].filter(Boolean).map(k => (
                            <div key={k.l} style={{ background:COULEURS.gris50, borderRadius:8, padding:'8px 12px' }}>
                              <div style={{ fontSize:13, fontWeight:800, color:COULEURS.navy }}>{k.v}</div>
                              <div style={{ fontSize:9.5, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.04em', marginTop:2 }}>{k.l}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Le détail par compétence : ce qui dit POURQUOI ce niveau,
                          et ce sur quoi le coach devra travailler en priorité. */}
                      {t.by_category && Object.keys(t.by_category).length > 0 && (
                        <div style={{ marginTop:10 }}>
                          {Object.entries(t.by_category).map(([cat, val]) => {
                            const pct = typeof val === 'number' ? val : (val?.pourcentage ?? val?.score ?? 0);
                            return (
                              <div key={cat} style={{ marginBottom:7 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11.5, marginBottom:3 }}>
                                  <span style={{ color:COULEURS.gris600, textTransform:'capitalize' }}>{cat}</span>
                                  <span style={{ fontWeight:700, color: pct >= 70 ? '#059669' : pct >= 50 ? '#F59E0B' : '#DC2626' }}>{Math.round(pct)}%</span>
                                </div>
                                <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${Math.min(100, Math.max(0, pct))}%`, background: pct >= 70 ? '#059669' : pct >= 50 ? '#F59E0B' : '#DC2626', borderRadius:3 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {t.notes && (
                        <div style={{ marginTop:10, background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#1D4ED8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>Notes</div>
                          <div style={{ fontSize:12.5, color:'#1E3A8A', lineHeight:1.5 }}>{t.notes}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )
          )}

          {/* ── ACCÈS & CONNEXION (assistante e-learning) ── */}
          {tab === 'acces' && (
            <>
              <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'12px 16px', marginBottom:20, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:16 }}>🔒</span>
                <div style={{ fontSize:12, color:'#92400E' }}>
                  Identifiants de connexion de l'apprenant. Cet onglet n'est visible que par l'assistante e-learning.
                </div>
              </div>
              {chargAcces ? <div style={{ textAlign:'center', padding:'32px 0', color:COULEURS.gris400 }}>Chargement…</div>
              : !localApp.apprenant_id ? (
                <div style={{ textAlign:'center', padding:'36px 24px', background:COULEURS.gris50, borderRadius:12, border:`2px dashed ${COULEURS.gris200}` }}>
                  <div style={{ fontSize:34, marginBottom:10 }}>🔑</div>
                  <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun compte ouvert</div>
                  <div style={{ fontSize:12, color:COULEURS.gris600, marginBottom:14 }}>
                    L'apprenant n'a pas encore d'accès à la plateforme.
                  </div>
                  <button onClick={creerAcces} disabled={accesSaving}
                    style={{ padding:'9px 20px', borderRadius:9, border:'none', background:nvc, color:'#fff', cursor: accesSaving?'wait':'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                    {accesSaving ? '⏳ Création…' : '🔑 Créer les accès'}
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                    <span style={{ padding:'4px 12px', borderRadius:20, background:'#D1FAE5', color:'#065F46', fontSize:11, fontWeight:700 }}>✅ Compte actif</span>
                    {acces?.mdp_temporaire && <span style={{ padding:'4px 12px', borderRadius:20, background:'#FEF3C7', color:'#92400E', fontSize:11, fontWeight:700 }}>Mot de passe temporaire</span>}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <div style={{ background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'14px 16px' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Identifiant</div>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, wordBreak:'break-all' }}>{acces?.email || localApp.email || '-'}</div>
                      {localApp.telephone && <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:4 }}>📞 {localApp.telephone}</div>}
                      {/* Un identifiant technique ne reçoit aucun courrier : le dire ici évite
                          de croire qu'un envoi d'accès est parti alors qu'il n'a nulle part où aller. */}
                      {(acces?.email || '').includes('@betacademy.app') && (
                        <div style={{ fontSize:11, color:'#B45309', marginTop:6 }}>
                          Compte créé sans adresse e-mail réelle — cet apprenant ne reçoit aucun courrier.
                        </div>
                      )}
                    </div>
                    <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'14px 16px' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Mot de passe temporaire</div>
                      <div style={{ fontSize:17, fontWeight:800, color:'#78350F', fontFamily:'monospace', letterSpacing:'0.02em' }}>
                        {acces?.mdp_initial || '—'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10, marginTop:16 }}>
                    <button onClick={creerAcces} disabled={accesSaving}
                      style={{ padding:'9px 18px', borderRadius:9, border:`1.5px solid ${nvc}`, background:COULEURS.blanc, color:nvc, cursor: accesSaving?'wait':'pointer', fontSize:12.5, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {accesSaving ? '⏳ Envoi…' : '📧 Renvoyer les accès'}
                    </button>
                  </div>
                  {accesMsg && <div style={{ marginTop:12, fontSize:12, color: accesMsg.err ? '#DC2626' : '#059669', fontWeight:600 }}>{accesMsg.txt}</div>}
                </>
              )}
            </>
          )}

          {/* ── HISTORIQUE ── */}
          {tab === 'historique' && (
            chargHisto ? <div style={{ textAlign:'center', padding:'40px 0', color:COULEURS.gris400 }}>Chargement…</div>
            : (historique || []).length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 24px', background:COULEURS.gris50, borderRadius:12, border:`2px dashed ${COULEURS.gris200}` }}>
                <div style={{ fontSize:36, marginBottom:10 }}>🕓</div>
                <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun événement enregistré</div>
                <div style={{ fontSize:12, color:COULEURS.gris600 }}>Les actions sur ce dossier apparaîtront ici au fur et à mesure.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {historique.map((h, i) => (
                  <div key={h.id || i} style={{ display:'flex', gap:14, paddingBottom: i < historique.length-1 ? 18 : 0 }}>
                    {/* La colonne-repère : une pastille par événement, reliée à la suivante. */}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background: h.statut==='warning' ? '#F59E0B' : h.statut==='error' ? '#DC2626' : nvc, marginTop:4 }} />
                      {i < historique.length-1 && <div style={{ width:2, flex:1, background:COULEURS.gris200, marginTop:4 }} />}
                    </div>
                    <div style={{ flex:1, paddingBottom:4 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{(h.action_type || '').replace(/_/g,' ').toLowerCase()}</div>
                      <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2, lineHeight:1.5 }}>{h.detail || '-'}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>
                        {(h.created_at || '').slice(0,16).replace('T',' à ')}
                        {h.acteur_nom && <> · {h.acteur_nom}</>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// Cluster "Entreprises" (détail bénéficiaire/classe) - utilisé par OngletEntreprises et ModalOnboardingEntreprise
function genSuivi(b) {
  const seed = b.id.charCodeAt(b.id.length - 1);
  const tauxP  = 65 + (seed % 30);
  const nbSess = 8 + (seed % 6);
  const faites = Math.round(nbSess * tauxP / 100);
  const COURS  = ['Grammaire B1','Speaking Practice','Listening','Writing Skills','Vocabulary','Business English'];
  const PROFS  = ['Marie Dupont','Pierre Martin','Sophie Leclerc'];
  const presences = Array.from({ length: nbSess }, (_, i) => ({
    date:   new Date(Date.now() - (nbSess - i) * 7 * 86400000).toLocaleDateString('fr-FR'),
    heure:  `${9 + (i % 3)}h00 – ${11 + (i % 3)}h00`,
    statut: i < faites ? 'present' : 'absent',
    cours:  COURS[i % 6],
    prof:   PROFS[i % 3],
  }));
  const aVenir = Array.from({ length: 3 }, (_, i) => ({
    date:  new Date(Date.now() + (i + 1) * 7 * 86400000).toLocaleDateString('fr-FR'),
    heure: `${9 + (i % 3)}h00 – ${11 + (i % 3)}h00`,
    titre: COURS[(nbSess + i) % 6],
    prof:  PROFS[(seed + i) % 3],
  }));
  const competences = [
    { lib: 'Compréhension orale',  pct: 45 + (seed % 40), icone: '👂' },
    { lib: 'Compréhension écrite', pct: 50 + (seed % 35), icone: '📖' },
    { lib: 'Expression orale',     pct: 40 + (seed % 45), icone: '🗣️' },
    { lib: 'Expression écrite',    pct: 55 + (seed % 30), icone: '✍️' },
  ];
  const evaluations = [
    { lib: 'Test de positionnement', note: 10 + (seed % 8), date: '2025-10-15' },
    { lib: 'Contrôle Grammaire',     note: 12 + (seed % 6), date: '2025-11-20' },
    { lib: 'Speaking Assessment',    note: 11 + (seed % 7), date: '2025-12-10' },
  ];
  const niveauSuivant = { A1:'A2', A2:'B1', B1:'B2', B2:'C1', C1:'C2', C2:'C2' };
  return { tauxP, nbSess, faites, presences, aVenir, competences, evaluations,
    objectifNiveau: b.niveau_cecr ? niveauSuivant[b.niveau_cecr] : 'B1' };
}

// ── Modal détail bénéficiaire ─────────────────────────────────────────────────

export function ModalDetailBenef({ benef, entreprise, onFermer }) {
  const { profile } = useAuth();
  const alerte = useAlerte();
  const [tab, setTab] = useState('suivi');
  const [filtreDebut,   setFiltreDebut]   = useState('');
  const [filtreFin,     setFiltreFin]     = useState('');
  const [filtreStatut,  setFiltreStatut]  = useState('tous');
  // ── Onglet Accès ──
  const [accesInfo,   setAccesInfo]   = useState(null);   // profil-acces response
  const [accesLoad,   setAccesLoad]   = useState(false);
  const [accesCree,   setAccesCree]   = useState(null);   // résultat creer-acces
  const [accesCreeLd, setAccesCreeLd] = useState(false);
  const [copieCle,    setCopieCle]    = useState('');
  const [realPresences,  setRealPresences]  = useState(null);
  const [presencesLoad,  setPresencesLoad]  = useState(false);
  // ── Blocage absences (système auto-suspension e-learning) ──
  const [blocageStatus,   setBlocageStatus]   = useState(null);  // { acces_bloque, nb_absences }
  const [blocageLoad,     setBlocageLoad]     = useState(false);
  const [deblocageLd,     setDeblocageLd]     = useState(false);
  const [motifDeblocage,  setMotifDeblocage]  = useState('');
  const isElearning = benef._source === 'elearning' && !!benef.id;

  // Parent tab - contact info (editable locally)
  const [localParent, setLocalParent] = useState({
    prenom:    benef.prenom_parent    || '',
    nom:       benef.nom_parent       || '',
    email:     benef.email_parent     || '',
    telephone: benef.telephone_parent || '',
  });
  const [editingParent,  setEditingParent]  = useState(false);
  const [savingParent,   setSavingParent]   = useState(false);
  const [saveParentErr,  setSaveParentErr]  = useState('');
  const [parentAccesBenef,    setParentAccesBenef]    = useState(null);
  const [parentAccesBenefLd,  setParentAccesBenefLd]  = useState(false);
  const [parentAccesBenefErr, setParentAccesBenefErr] = useState('');

  // Charger le compte parent existant quand l'onglet parent s'ouvre
  useEffect(() => {
    if (tab !== 'parent' || parentAccesBenef || parentAccesBenefLd) return;
    const emailParent = localParent.email;
    if (!emailParent) return;
    setParentAccesBenefLd(true);
    fetch(`${_API_URL_ADMIN}/api/apprenants/acces-parent?email=${encodeURIComponent(emailParent)}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => { if (d.existe) setParentAccesBenef(d); })
      .catch(() => {})
      .finally(() => setParentAccesBenefLd(false));
  }, [tab, editingParent]);

  async function sauvegarderInfosParent() {
    if (!benef.id || savingParent) return;
    setSavingParent(true); setSaveParentErr('');
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/apprenants/${benef.id}`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom_parent:    localParent.prenom  || null,
          nom_parent:       localParent.nom     || null,
          email_parent:     localParent.email   || null,
          telephone_parent: localParent.telephone || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setSaveParentErr(d.error || 'Erreur lors de la sauvegarde'); return; }
      setEditingParent(false);
      setParentAccesBenef(null); // reset so useEffect re-fetches account if email changed
    } catch (e) {
      setSaveParentErr(e.message);
    } finally {
      setSavingParent(false);
    }
  }

  const benAge = benef.date_naissance
    ? Math.floor((Date.now() - new Date(benef.date_naissance)) / (365.25*24*3600*1000))
    : null;
  const benTranche = benef.profil_type && benef.profil_type !== 'adulte'
    ? benef.profil_type
    : (benAge !== null ? (benAge <= 12 ? 'enfant' : benAge <= 17 ? 'adolescent' : 'adulte') : 'adulte');
  const hasParentBenef = !!(localParent.email || localParent.prenom || localParent.nom || localParent.telephone);
  const showParentTabBenef = benTranche === 'enfant' || benTranche === 'adolescent';

  useEffect(() => {
    setPresencesLoad(true);
    let url;
    if (isElearning) {
      url = `${_API_URL_ADMIN}/api/elearning/apprenants/${benef.id}/presences`;
    } else {
      const email = benef.email || benef.email_benef || null;
      if (!email) { setRealPresences([]); setPresencesLoad(false); return; }
      url = `${_API_URL_ADMIN}/api/elearning/apprenants/by-email/presences?email=${encodeURIComponent(email)}`;
    }
    fetch(url, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => {
        const list = d.presences || [];
        const mapped = list.map(p => ({
          date: p.seance?.date ? new Date(p.seance.date).toLocaleDateString('fr-FR') : '-',
          heure: p.seance?.heure_debut ? p.seance.heure_debut.slice(0,5) : '-',
          cours: p.seance?.objectifs_session || '-',
          statut: p.statut || 'absent',
        }));
        setRealPresences(mapped);
      })
      .catch(() => setRealPresences([]))
      .finally(() => setPresencesLoad(false));
  }, [benef.id, benef.email, benef.email_benef, isElearning]);

  const suivi = genSuivi(benef);
  const cfg   = STATUT_BEN[benef.statut] || STATUT_BEN.en_attente;
  const niv   = benef.niveau_cecr;

  useEffect(() => {
    if (tab !== 'acces' && tab !== 'parent') return;
    if (accesInfo !== null) return;
    const emailBenef = benef.email || benef.email_benef || null;
    // Un enfant sans contact propre se voit attribuer un identifiant technique
    // (<nom>@betacademy.app) différent de l'email affiché ici (celui du parent) - on vérifie
    // alors par apprenant_id, seul lien fiable vers le vrai compte de connexion.
    const parBenefId = benef.apprenant_id
      ? `apprenant_id=${encodeURIComponent(benef.apprenant_id)}`
      : emailBenef ? `email=${encodeURIComponent(emailBenef)}` : null;
    if (!parBenefId) { setAccesInfo({ has_account: false, profil: null, _no_email: true }); return; }
    setAccesLoad(true);
    fetch(`${_API_URL_ADMIN}/api/apprenants/profil-acces?${parBenefId}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setAccesInfo(d))
      .catch(() => setAccesInfo({ has_account: false, profil: null }))
      .finally(() => setAccesLoad(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'acces' || !isElearning || blocageStatus !== null) return;
    setBlocageLoad(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${benef.id}/acces-status`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setBlocageStatus(d))
      .catch(() => setBlocageStatus({ acces_bloque: false, nb_absences: 0 }))
      .finally(() => setBlocageLoad(false));
  }, [tab, isElearning, blocageStatus]);

  async function debloquerApprenant() {
    if (!benef.id || deblocageLd) return;
    setDeblocageLd(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${benef.id}/suspension`, {
        method: 'PATCH',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({ bloque: false }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setBlocageStatus({ acces_bloque: false, nb_absences: 0 });
      setMotifDeblocage('');
    } catch (err) { await alerte('Erreur : ' + err.message, { danger: true }); }
    finally { setDeblocageLd(false); }
  }

  async function genererAcces() {
    if (accesCreeLd) return;
    const emailBenef = benef.email || benef.email_benef || null;
    const nom        = benef.nom_complet?.split(' ').slice(1).join(' ') || benef.nom || '';
    const prenom     = benef.nom_complet?.split(' ')[0]                 || benef.prenom || '';
    setAccesCreeLd(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces`, {
        method: 'POST',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({
          nom, prenom, email: emailBenef, telephone: benef.telephone || null,
          // Permet au backend de détecter directement si cet email/tel est celui du parent
          // et de générer un identifiant @betacademy.app pour l'enfant dans ce cas - sans ça,
          // la protection ne s'appliquait que si le compte parent existait déjà (ordre de création).
          email_parent:     benef.email_parent     || null,
          telephone_parent: benef.telephone_parent || null,
          // Lie le compte créé à cette fiche (classes_elearning_apprenants.apprenant_id) -
          // indispensable pour la retrouver après un rechargement quand le login réel de
          // l'enfant (identifiant technique) diffère de l'email affiché ici (celui du parent).
          cea_id: benef._source === 'elearning' ? benef.id : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setAccesCree(d);
      setAccesInfo({ has_account: true, profil: { ...d, mdp_temporaire: true } });
    } catch (err) { await alerte('Erreur : ' + err.message, { danger: true }); }
    finally { setAccesCreeLd(false); }
  }

  function copier(texte, cle) {
    navigator.clipboard?.writeText(texte).catch(() => {});
    setCopieCle(cle);
    setTimeout(() => setCopieCle(''), 2500);
  }

  const TABS = [
    { id:'suivi',      lib:'Suivi',        icone:'📈' },
    { id:'presences',  lib:'Présences',    icone:'✅' },
    { id:'competences',lib:'Compétences',  icone:'🎯' },
    { id:'evaluations',lib:'Évaluations',  icone:'📝' },
    { id:'acces',      lib:'Accès',        icone:'🔐' },
    ...(showParentTabBenef ? [{ id:'parent', lib:'Parent', icone:'👨‍👩‍👧' }] : []),
  ];

  const row = (l, v) => (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13 }}>
      <span style={{ color:COULEURS.gris600 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy }}>{v || '-'}</span>
    </div>
  );

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, backdropFilter:'blur(3px)' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'#fff' }}>
                {benef.prenom[0]}{benef.nom[0]}
              </div>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{benef.prenom} {benef.nom}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>{benef.poste} · {entreprise.nom}</div>
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
          {(() => {
            const pList = realPresences || [];
            const pPres = pList.filter(p => p.statut === 'present').length;
            const pTaux = pList.length > 0 ? Math.round((pPres / pList.length) * 100) : null;
            return (
          <div style={{ display:'flex', gap:20, marginTop:14 }}>
            {[
              { l:'Niveau', v: niv ? <span style={{ background:NIV_COULEUR[niv], color:'#fff', padding:'1px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>{niv}</span> : '-' },
              { l:'Présence', v: pTaux !== null ? `${pTaux}%` : (presencesLoad ? '…' : '-') },
              { l:'Sessions', v: pList.length > 0 ? `${pPres}/${pList.length}` : '-' },
              { l:'Statut', v:<span style={{ background:cfg.bg, color:cfg.txt, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{cfg.lib}</span> },
            ].map((s, i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{s.v}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.l}</div>
              </div>
            ))}
          </div>
            );
          })()}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', background:COULEURS.blanc, borderBottom:`1px solid ${COULEURS.gris200}`, padding:'0 8px', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:'10px 14px', border:'none', background:'transparent', borderBottom: tab===t.id ? `2px solid ${entreprise.couleur}` : '2px solid transparent', color: tab===t.id ? entreprise.couleur : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
              <span>{t.icone}</span><span>{t.lib}</span>
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ flex:1, overflowY:'auto', padding:24 }}>

          {/* ── Suivi global ── */}
          {tab === 'suivi' && (() => {
            const pList = realPresences || [];
            const pPres = pList.filter(p => p.statut === 'present').length;
            const taux  = pList.length > 0 ? Math.round((pPres / pList.length) * 100) : 0;
            return (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
                {row('Email', benef.email)}
                {row('Téléphone', benef.telephone)}
                {row('Poste', benef.poste)}
                {row('Niveau CECR actuel', niv || 'Non évalué')}
                {row('Inscrit le', benef.date_inscription ? new Date(benef.date_inscription).toLocaleDateString('fr-FR') : null)}
                {benef.date_naissance && row('Date de naissance', new Date(benef.date_naissance).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }))}
                {benAge !== null && row('Âge', `${benAge} ans`)}
                {benTranche !== 'adulte' && row('Profil', benTranche === 'enfant' ? '🧒 Enfant (≤ 12 ans)' : '🧑 Adolescent (13–17 ans)')}
                {benef.classe && row('Classe scolaire', benef.classe)}
                {row('Sessions assistées', pList.length > 0 ? `${pPres} présent(s) / ${pList.length} total` : '-')}
              </div>
              {/* Barre présence */}
              {pList.length > 0 && (
                <div style={{ background:COULEURS.gris50, borderRadius:12, padding:'16px 20px', marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:8 }}>
                    <span style={{ fontWeight:600, color:COULEURS.navy }}>Taux de présence</span>
                    <span style={{ fontWeight:800, color: taux >= 80 ? COULEURS.succes : COULEURS.attention }}>{taux}%</span>
                  </div>
                  <div style={{ height:10, background:COULEURS.gris200, borderRadius:5, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${taux}%`, background: taux >= 80 ? COULEURS.succes : COULEURS.attention, borderRadius:5, transition:'width 0.5s' }} />
                  </div>
                </div>
              )}
              {/* Dernières présences */}
              {pList.length > 0 && (
                <>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>📋 Dernières présences</div>
                  {pList.slice(0, 5).map((p, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:COULEURS.gris50, borderRadius:8, marginBottom:8, fontSize:12 }}>
                      <div>
                        <div style={{ fontWeight:600, color:COULEURS.navy }}>{p.cours}</div>
                        <div style={{ color:COULEURS.gris600, marginTop:2 }}>{p.date} · {p.heure}</div>
                      </div>
                      <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700,
                        background: p.statut==='present'?'#D1FAE5': p.statut==='retard'?'#FEF3C7':'#FEE2E2',
                        color: p.statut==='present'?'#065F46': p.statut==='retard'?'#92400E':'#991B1B' }}>
                        {p.statut === 'present' ? '✓ Présent' : p.statut === 'retard' ? '⚠ Retard' : '✗ Absent'}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {pList.length === 0 && !presencesLoad && (
                <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400, fontSize:13, border:`1px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                  Aucune session enregistrée pour ce bénéficiaire
                </div>
              )}
            </>
            );
          })()}

          {/* ── Présences ── */}
          {tab === 'presences' && (() => {
            function parseFR(s) {
              if (!s || s === '-') return null;
              const [d, m, y] = s.split('/');
              return new Date(`${y}-${m}-${d}`);
            }
            const debut = filtreDebut ? new Date(filtreDebut) : null;
            const fin   = filtreFin   ? new Date(filtreFin)   : null;

            function setPeriode(moisArriere) {
              const auj = new Date();
              const d   = new Date(auj);
              d.setMonth(d.getMonth() - moisArriere);
              setFiltreDebut(d.toISOString().slice(0,10));
              setFiltreFin(auj.toISOString().slice(0,10));
            }

            const pAll = realPresences || [];
            const presencesFiltrees = pAll.filter(p => {
              const d = parseFR(p.date);
              if (!d) return true;
              if (debut && d < debut) return false;
              if (fin   && d > fin)   return false;
              if (filtreStatut !== 'tous' && p.statut !== filtreStatut) return false;
              return true;
            });

            const nbPresent = presencesFiltrees.filter(p => p.statut === 'present').length;
            const nbAbsent  = presencesFiltrees.filter(p => p.statut === 'absent').length;
            const tauxFilt  = presencesFiltrees.length > 0 ? Math.round((nbPresent / presencesFiltrees.length) * 100) : 0;
            const actif     = filtreDebut || filtreFin || filtreStatut !== 'tous';

            if (presencesLoad) return (
              <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400, fontSize:13 }}>⏳ Chargement des présences…</div>
            );

            return (
              <>
                {/* ── Filtres ── */}
                <div style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, padding:'12px 14px', marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer les présences</span>
                    {actif && (
                      <button onClick={() => { setFiltreDebut(''); setFiltreFin(''); setFiltreStatut('tous'); }}
                        style={{ fontSize:11, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>
                        ✕ Effacer les filtres
                      </button>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
                    {[
                      { l:'Tout',    fn: () => { setFiltreDebut(''); setFiltreFin(''); } },
                      { l:'Ce mois', fn: () => setPeriode(0) },
                      { l:'3 mois',  fn: () => setPeriode(3) },
                      { l:'6 mois',  fn: () => setPeriode(6) },
                      { l:'1 an',    fn: () => setPeriode(12) },
                    ].map(p => (
                      <button key={p.l} onClick={p.fn}
                        style={{ padding:'4px 12px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`,
                          background:COULEURS.gris50, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                        {p.l}
                      </button>
                    ))}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Du</div>
                      <input type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)}
                        style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Au</div>
                      <input type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)}
                        style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Statut</div>
                      <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
                        style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy, background:COULEURS.blanc }}>
                        <option value="tous">Tous</option>
                        <option value="present">Présent</option>
                        <option value="absent">Absent</option>
                        <option value="retard">Retard</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── KPIs ── */}
                <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                  {[
                    { l:'Présent', v: nbPresent,               c: COULEURS.succes },
                    { l:'Absent',  v: nbAbsent,                c: '#EF4444' },
                    { l:'Total',   v: presencesFiltrees.length, c: COULEURS.navy },
                    { l:'Taux',    v: `${tauxFilt}%`,          c: tauxFilt >= 75 ? COULEURS.succes : tauxFilt >= 50 ? COULEURS.attention : '#EF4444' },
                  ].map(k => (
                    <div key={k.l} style={{ flex:1, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px', textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:k.c }}>{k.v}</div>
                      <div style={{ fontSize:10, color:COULEURS.gris600 }}>{k.l}</div>
                    </div>
                  ))}
                </div>

                {/* ── Tableau ── */}
                <div style={{ background:COULEURS.blanc, borderRadius:10, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr 1fr', padding:'9px 14px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Date</span><span>Heure</span><span>Session</span><span>Statut</span>
                  </div>
                  {presencesFiltrees.length === 0 ? (
                    <div style={{ padding:'28px', textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>
                      {realPresences === null ? '⏳ Chargement…' : 'Aucune présence enregistrée'}
                    </div>
                  ) : presencesFiltrees.map((p, i) => (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr 1fr', padding:'10px 14px', borderBottom: i < presencesFiltrees.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: p.statut === 'absent' ? '#FFF5F5' : 'transparent' }}>
                      <span style={{ color:COULEURS.navy, fontWeight:600 }}>{p.date}</span>
                      <span style={{ color:COULEURS.gris600 }}>{p.heure}</span>
                      <span style={{ color:COULEURS.navy }}>{p.cours}</span>
                      <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700,
                        background: p.statut==='present'?'#D1FAE5': p.statut==='retard'?'#FEF3C7':'#FEE2E2',
                        color: p.statut==='present'?'#065F46': p.statut==='retard'?'#92400E':'#991B1B' }}>
                        {p.statut === 'present' ? '✓ Présent' : p.statut === 'retard' ? '⚠ Retard' : '✗ Absent'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* ── Compétences ── */}
          {tab === 'competences' && (
            <>
              {niv && (
                <div style={{ background:`${NIV_COULEUR[niv]}20`, border:`1px solid ${NIV_COULEUR[niv]}40`, borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>Niveau CECR actuel</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ background:NIV_COULEUR[niv], color:'#fff', padding:'3px 12px', borderRadius:8, fontSize:16, fontWeight:800 }}>{niv}</span>
                  </div>
                </div>
              )}
              <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, border:`1px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                <div style={{ fontSize:36, marginBottom:12 }}>🎯</div>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Compétences bientôt disponibles</div>
                <div style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.6 }}>Le suivi des compétences sera affiché ici dès que des évaluations auront été enregistrées pour ce bénéficiaire.</div>
              </div>
            </>
          )}

          {/* ── Évaluations ── */}
          {tab === 'evaluations' && (
            <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, border:`1px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>📝</div>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Évaluations bientôt disponibles</div>
              <div style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.6 }}>Les résultats d'évaluations seront affichés ici une fois que des sessions d'évaluation auront eu lieu.</div>
            </div>
          )}

          {/* ── Accès ── */}
          {tab === 'acces' && (
            <div style={{ maxWidth:700 }}>
              {/* Info eligibilité */}
              <div style={{ background:`${entreprise.couleur}08`, border:`1px solid ${entreprise.couleur}25`, borderRadius:14, padding:'14px 18px', marginBottom:20, display:'flex', gap:12, alignItems:'flex-start' }}>
                <span style={{ fontSize:20, flexShrink:0 }}>🔐</span>
                <div style={{ fontSize:13, color:COULEURS.navy, lineHeight:1.6 }}>
                  La génération des accès crée un compte apprenant avec un <strong>mot de passe temporaire</strong>. L'apprenant pourra se connecter sur le portail BET e-learning uniquement si son <strong>test de niveau a été effectué</strong> et qu'une <strong>classe lui a été assignée</strong>.
                </div>
              </div>

              {accesLoad ? (
                <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400 }}>⏳ Vérification du compte…</div>
              ) : accesInfo?._no_email ? (
                <div style={{ textAlign:'center', padding:'32px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📧</div>
                  <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy, marginBottom:6 }}>Aucun email renseigné</div>
                  <div style={{ fontSize:13 }}>Ajoutez un email à ce bénéficiaire pour pouvoir générer ses accès.</div>
                </div>
              ) : (
                <>
                  {/* Credentials si dispo */}
                  {(accesCree?.mdp_initial || (accesInfo?.profil?.mdp_initial && accesInfo?.profil?.mdp_temporaire)) && (
                    <div style={{ background:'#F0FDF4', border:'1.5px solid #86EFAC', borderRadius:14, padding:'18px 22px', marginBottom:20 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#065F46', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
                        🎉 Identifiants générés - à communiquer à l'apprenant
                      </div>
                      {[
                        { l:'Email / Identifiant', v: accesCree?.login_email || accesCree?.login_identifier || accesInfo?.profil?.login_email || accesInfo?.profil?.email || benef.email, cle:'email' },
                        { l:'Mot de passe temporaire', v: accesCree?.mdp_initial || accesInfo?.profil?.mdp_initial, cle:'mdp' },
                        { l:'URL de connexion', v: `${window.location.origin}/connexion/apprenant`, cle:'url' },
                      ].map(({l, v, cle}) => v ? (
                        <div key={cle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.7)', borderRadius:8, padding:'10px 14px', marginBottom:8, gap:12 }}>
                          <div>
                            <div style={{ fontSize:10, fontWeight:700, color:'#166534', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 }}>{l}</div>
                            <div style={{ fontSize:14, fontWeight:700, color:'#14532D', fontFamily:'monospace' }}>{v}</div>
                          </div>
                          <button onClick={() => copier(v, cle)} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #86EFAC', background: copieCle===cle ? '#16A34A' : '#fff', color: copieCle===cle ? '#fff' : '#16A34A', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.2s', whiteSpace:'nowrap' }}>
                            {copieCle===cle ? '✅ Copié' : '📋 Copier'}
                          </button>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  {/* Bouton générer / regénérer */}
                  <button
                    onClick={genererAcces}
                    disabled={accesCreeLd}
                    style={{ width:'100%', padding:'13px', borderRadius:10, border:'none', background: accesCreeLd ? COULEURS.gris200 : entreprise.couleur, color: accesCreeLd ? COULEURS.gris600 : '#fff', fontSize:14, fontWeight:700, cursor: accesCreeLd ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.2s' }}>
                    {accesCreeLd ? '⏳ Génération en cours…' : accesInfo?.has_account ? '🔄 Regénérer un mot de passe' : '🔑 Générer les accès'}
                  </button>
                  <div style={{ fontSize:11, color:COULEURS.gris400, textAlign:'center', marginTop:8 }}>
                    {accesInfo?.has_account ? 'Un nouveau mot de passe temporaire sera créé - l\'ancien sera invalidé.' : 'Un compte sera créé avec un mot de passe temporaire à communiquer à l\'apprenant.'}
                  </div>

                  {/* Renvoi des accès par email - envoi réel à configurer plus tard */}
                  {accesInfo?.has_account && (
                    <button
                      onClick={() => toast.success(`📧 Accès renvoyés par email à ${benef.email || benef.email_benef}`)}
                      style={{ width:'100%', padding:'12px', borderRadius:10, border:`1.5px solid ${entreprise.couleur}`, background:'#fff', color: entreprise.couleur, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:10 }}>
                      📧 Renvoyer les accès par email
                    </button>
                  )}
                </>
              )}

              {/* ── Section Blocage Absences (apprenants e-learning uniquement) ── */}
              {isElearning && (
                <div style={{ marginTop:24 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                    <span style={{ fontSize:16 }}>🚫</span>
                    <span style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>Blocage automatique - Absences</span>
                  </div>

                  {blocageLoad ? (
                    <div style={{ textAlign:'center', padding:24, color:COULEURS.gris400, fontSize:13 }}>⏳ Vérification…</div>
                  ) : blocageStatus === null ? null : (
                    <>
                      {/* Bannière si bloqué */}
                      {blocageStatus.acces_bloque && (
                        <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', gap:12, alignItems:'flex-start' }}>
                          <span style={{ fontSize:20, flexShrink:0 }}>🔒</span>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:'#991B1B', marginBottom:4 }}>Accès bloqué automatiquement</div>
                            <div style={{ fontSize:12, color:'#B91C1C', lineHeight:1.5 }}>
                              Cet apprenant a atteint 4 absences consécutives. Son accès à la plateforme a été automatiquement suspendu.
                              Il faut le débloquer manuellement une fois le contact établi.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Barre de progression absences */}
                      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'16px 20px', marginBottom:16 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Absences enregistrées</span>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:20, fontWeight:800, color: blocageStatus.acces_bloque ? '#DC2626' : blocageStatus.nb_absences >= 3 ? '#F59E0B' : COULEURS.succes }}>
                              {blocageStatus.nb_absences}
                            </span>
                            <span style={{ fontSize:13, color:COULEURS.gris400, fontWeight:600 }}>/4</span>
                          </div>
                        </div>
                        <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden' }}>
                          <div style={{
                            height:'100%',
                            width:`${Math.min(100, (blocageStatus.nb_absences / 4) * 100)}%`,
                            background: blocageStatus.acces_bloque ? '#EF4444' : blocageStatus.nb_absences >= 3 ? '#F59E0B' : '#22C55E',
                            borderRadius:5,
                            transition:'width 0.4s',
                          }}/>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                          {[1,2,3,4].map(n => (
                            <div key={n} style={{ textAlign:'center', flex:1 }}>
                              <div style={{ width:8, height:8, borderRadius:'50%', margin:'0 auto 3px', background: blocageStatus.nb_absences >= n ? (n >= 4 ? '#EF4444' : '#F59E0B') : COULEURS.gris200 }}/>
                              <div style={{ fontSize:9, color: blocageStatus.nb_absences >= n ? COULEURS.navy : COULEURS.gris400, fontWeight:600 }}>{n}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop:10, fontSize:11, color:COULEURS.gris500, textAlign:'center' }}>
                          {blocageStatus.acces_bloque
                            ? '🔒 Accès bloqué - débloquer pour remettre le compteur à zéro'
                            : blocageStatus.nb_absences >= 3
                              ? '⚠️ Attention - 1 absence supplémentaire entraînera un blocage automatique'
                              : `✅ ${4 - blocageStatus.nb_absences} absence(s) restante(s) avant blocage automatique`}
                        </div>
                      </div>

                      {/* Bouton débloquer (visible si bloqué + rôle autorisé) */}
                      {blocageStatus.acces_bloque && estRole(profile?.role, ['admin_onboarding', 'admin_manager', 'admin_superviseur', 'admin_customer_care']) && (
                        <div style={{ background:'#F0FDF4', border:'1.5px solid #86EFAC', borderRadius:12, padding:'16px 20px' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:10 }}>🔓 Débloquer l'accès</div>
                          <div style={{ fontSize:12, color:'#166534', marginBottom:12, lineHeight:1.5 }}>
                            Le déblocage réintègre l'apprenant immédiatement. Le compteur d'absences repart à zéro à partir de maintenant.
                          </div>
                          <textarea
                            value={motifDeblocage}
                            onChange={e => setMotifDeblocage(e.target.value)}
                            placeholder="Motif du déblocage (optionnel) : contact établi, justification reçue…"
                            rows={2}
                            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', outline:'none', boxSizing:'border-box', marginBottom:10 }}
                          />
                          <button
                            onClick={debloquerApprenant}
                            disabled={deblocageLd}
                            style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', background: deblocageLd ? COULEURS.gris200 : '#16A34A', color: deblocageLd ? COULEURS.gris600 : '#fff', fontSize:13, fontWeight:700, cursor: deblocageLd ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.2s' }}>
                            {deblocageLd ? '⏳ Déblocage en cours…' : '🔓 Confirmer le déblocage'}
                          </button>
                        </div>
                      )}

                      {/* Message si pas le bon rôle */}
                      {blocageStatus.acces_bloque && !estRole(profile?.role, ['admin_onboarding', 'admin_manager', 'admin_superviseur', 'admin_customer_care']) && (
                        <div style={{ background:'#FEF9C3', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#92400E' }}>
                          ⚠️ Seul un agent Onboarding ou Customer Care peut débloquer cet accès.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PARENT ── */}
          {tab === 'parent' && (() => {
            const couleur = entreprise.couleur || '#0891B2';

            async function creerAccesParentBenef() {
              if (parentAccesBenefLd) return;
              if (!localParent.email && !localParent.telephone) {
                setParentAccesBenefErr('Renseignez d\'abord l\'email ou le téléphone du parent ci-dessus.');
                return;
              }
              setParentAccesBenefLd(true);
              setParentAccesBenefErr('');
              try {
                const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces-parent`, {
                  method: 'POST',
                  headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    prenom_parent:    localParent.prenom,
                    nom_parent:       localParent.nom,
                    email_parent:     localParent.email,
                    telephone_parent: localParent.telephone,
                    inscription_id:   benef.id,
                    enfant_nom:       `${benef.prenom} ${benef.nom}`,
                  }),
                });
                const d = await r.json();
                if (!r.ok) { setParentAccesBenefErr(d.error || 'Erreur serveur'); return; }
                setParentAccesBenef(d);
              } catch (e) {
                setParentAccesBenefErr(e.message);
              } finally {
                setParentAccesBenefLd(false);
              }
            }

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:680 }}>

                {/* Carte parent */}
                <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'20px 24px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, paddingBottom:10, borderBottom:'1px solid #BAE6FD' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0369A1' }}>👨‍👩‍👧 Contact parent / tuteur</div>
                    <button onClick={() => { setEditingParent(v => !v); setSaveParentErr(''); }}
                      style={{ fontSize:11, background:'none', border:'1px solid #BAE6FD', borderRadius:6, padding:'3px 10px', cursor:'pointer', color:'#0369A1', fontFamily:'inherit', fontWeight:600 }}>
                      {editingParent ? '✕ Annuler' : '✏️ Modifier'}
                    </button>
                  </div>
                  {editingParent ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {[
                        ['Prénom parent', 'prenom', 'text'],
                        ['Nom parent',    'nom',    'text'],
                        ['Email parent',  'email',  'email'],
                        ['Téléphone',     'telephone', 'tel'],
                      ].map(([label, key, type]) => (
                        <div key={key}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>{label}</div>
                          <input type={type} value={localParent[key]}
                            onChange={e => setLocalParent(p => ({ ...p, [key]: e.target.value }))}
                            placeholder={label}
                            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #BAE6FD', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
                        </div>
                      ))}
                      {saveParentErr && <div style={{ fontSize:12, color:'#DC2626', background:'#FEE2E2', borderRadius:6, padding:'8px 12px' }}>{saveParentErr}</div>}
                      <button onClick={sauvegarderInfosParent} disabled={savingParent}
                        style={{ padding:'9px 18px', borderRadius:8, border:'none', background:'#0369A1', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-start' }}>
                        {savingParent ? '⏳ Sauvegarde…' : '💾 Sauvegarder'}
                      </button>
                    </div>
                  ) : hasParentBenef ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {[
                        ['Prénom',    localParent.prenom],
                        ['Nom',       localParent.nom],
                        ['Email',     localParent.email],
                        ['Téléphone', localParent.telephone],
                      ].map(([l, v]) => (
                        <div key={l} style={{ background:COULEURS.blanc, border:'1px solid #BAE6FD', borderRadius:10, padding:'12px 16px' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{l}</div>
                          <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy }}>{v || '-'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'16px 0', color:COULEURS.gris400, fontSize:13 }}>
                      Aucune coordonnée parent enregistrée - cliquez sur <strong>✏️ Modifier</strong> pour les ajouter.
                    </div>
                  )}
                </div>

                {/* Profil enfant */}
                {benef.date_naissance && (
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 20px', display:'flex', gap:16, alignItems:'center' }}>
                    <span style={{ fontSize:28 }}>{benTranche === 'enfant' ? '🧒' : '🧑'}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>
                        {benTranche === 'enfant' ? 'Enfant' : 'Adolescent'} · {benAge} ans
                      </div>
                      <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:2 }}>
                        Né(e) le {new Date(benef.date_naissance).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}
                        {benef.classe ? ` · Classe : ${benef.classe}` : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Créer accès parent */}
                {(() => {
                  // Identifiant réel de connexion (résolu via profil-acces, comme dans l'onglet
                  // Accès) - jamais benef.email brut, qui peut rester sur l'ancien email de
                  // repli parent saisi à l'inscription et ne plus refléter le login réel.
                  const loginApprenant = accesCree?.login_email || accesCree?.login_identifier
                    || accesInfo?.profil?.login_email || accesInfo?.profil?.email || '';
                  const emailApprenant = loginApprenant.toLowerCase().trim();
                  const emailParent    = (localParent.email || '').toLowerCase().trim();
                  const conflitEmail   = emailApprenant && emailParent && emailApprenant === emailParent;

                  return (
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      🔐 Créer un accès Dashboard Parent
                    </div>

                    {/* ℹ️ Email partagé apprenant/parent - accès automatique */}
                    {conflitEmail && (
                      <div style={{ background:'#EFF6FF', border:'2px solid #BFDBFE', borderRadius:12, padding:'16px 20px', marginBottom:16 }}>
                        <div style={{ fontSize:14, fontWeight:800, color:'#1D4ED8', marginBottom:8 }}>
                          ℹ️ Accès parent déjà disponible
                        </div>
                        <div style={{ fontSize:13, color:'#1E40AF', lineHeight:1.7, marginBottom:12 }}>
                          L'email <strong>{emailParent}</strong> est aussi l'email de connexion de l'apprenant (cas d'un enfant sans email propre).<br/>
                          <strong>Ce parent peut déjà se connecter</strong> avec ces identifiants - il sera automatiquement redirigé vers le dashboard parent.
                        </div>
                        <div style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#DBEAFE', borderRadius:8, padding:'10px 14px' }}>
                          ✅ Aucune action requise. Le parent utilise les mêmes identifiants que l'apprenant et accède directement à son espace parent.
                          Si vous souhaitez un compte parent séparé, renseignez un email différent via <strong>✏️ Modifier</strong>.
                        </div>
                        <button
                          onClick={() => toast.success(`📧 Accès renvoyés par email à ${emailParent}`)}
                          style={{ width:'100%', padding:'11px', borderRadius:10, border:'1.5px solid #1D4ED8', background:'#fff', color:'#1D4ED8', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:12 }}>
                          📧 Renvoyer les accès par email
                        </button>
                      </div>
                    )}

                    {parentAccesBenefLd ? (
                      <div style={{ textAlign:'center', padding:'16px', color:COULEURS.gris400, fontSize:13 }}>⏳ Vérification du compte parent…</div>
                    ) : parentAccesBenef ? (
                      <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'16px 20px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#166534', marginBottom:10 }}>✅ Accès parent actif</div>
                        {[
                          ['Identifiant', parentAccesBenef.login_email],
                          parentAccesBenef.mdp_initial ? ['Mot de passe temporaire', parentAccesBenef.mdp_initial] : null,
                        ].filter(Boolean).map(([l, v]) => (
                          <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid #BBF7D0' }}>
                            <span style={{ color:'#166534' }}>{l}</span>
                            <span style={{ fontWeight:700, color:COULEURS.navy, fontFamily:'monospace' }}>{v}</span>
                          </div>
                        ))}
                        <div style={{ fontSize:11, color:'#166534', marginTop:10 }}>
                          {parentAccesBenef.mdp_initial
                            ? 'Le parent devra changer son mot de passe à la première connexion sur le portail parent BET E-Learning.'
                            : '✅ Le parent a déjà changé son mot de passe temporaire - compte actif.'}
                        </div>
                        <button
                          onClick={() => toast.success(`📧 Accès renvoyés par email à ${parentAccesBenef.login_email}`)}
                          style={{ width:'100%', padding:'11px', borderRadius:10, border:'1px solid #16A34A', background:'#fff', color:'#166534', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:12 }}>
                          📧 Renvoyer les accès par email
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:14, lineHeight:'1.6' }}>
                          Crée un compte pour que le parent/tuteur puisse suivre la progression de son enfant sur le portail parent.
                          {!hasParentBenef && (
                            <span style={{ display:'block', marginTop:6, color:'#DC2626', fontWeight:600 }}>
                              ⚠️ Aucune coordonnée parent renseignée - cliquez sur ✏️ Modifier pour les ajouter.
                            </span>
                          )}
                        </div>
                        {parentAccesBenefErr && (
                          <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#DC2626', marginBottom:12 }}>
                            {parentAccesBenefErr}
                          </div>
                        )}
                        <button
                          onClick={creerAccesParentBenef}
                          disabled={parentAccesBenefLd || !hasParentBenef || conflitEmail}
                          style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 22px', borderRadius:10, border:'none', background: (hasParentBenef && !conflitEmail) ? couleur : COULEURS.gris200, color: (hasParentBenef && !conflitEmail) ? '#fff' : COULEURS.gris400, fontWeight:700, fontSize:13, cursor: (hasParentBenef && !conflitEmail) ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                        >
                          {parentAccesBenefLd ? '⏳ Création en cours…' : '🔑 Créer accès parent'}
                        </button>
                      </>
                    )}
                  </div>
                  );
                })()}
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}

// ── helpers formatage ────────────────────────────────────────────────────────
function formatFCFA(n) { return (n || 0).toLocaleString('fr-FR') + ' FCFA'; }
function joursRestants(dateFin) {
  return Math.ceil((new Date(dateFin) - new Date()) / (1000 * 60 * 60 * 24));
}
function dureeFormation(dateDebut, dateFin) {
  const d1 = new Date(dateDebut);
  const d2 = new Date(dateFin);
  const mois = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (mois >= 12 && mois % 12 === 0) return `${mois / 12} an${mois / 12 > 1 ? 's' : ''}`;
  if (mois >= 12) return `${Math.floor(mois / 12)} an${Math.floor(mois / 12) > 1 ? 's' : ''} et ${mois % 12} mois`;
  return `${mois} mois`;
}
function pctFormationEcoule(dateDebut, dateFin) {
  const debut = new Date(dateDebut).getTime();
  const fin   = new Date(dateFin).getTime();
  const now   = Date.now();
  if (now <= debut) return 0;
  if (now >= fin)   return 100;
  return Math.round(((now - debut) / (fin - debut)) * 100);
}
function fmtDateFr(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Modal détail classe (Admin BET / Onboarding) ─────────────────────────────

const NIV_COULEUR_ADM = { A0:'#94A3B8', A1:'#60A5FA', A2:'#34D399', B1:'#818CF8', B2:'#F59E0B', C1:'#F97316', C2:'#EF4444' };

// ── Onglet Sessions commun aux modals de détail classe ────────────────────────
const _SESS_PAGE = 10;

export function OngletSessionsClasse({ classeId, coachNom, couleur }) {
  const [seances,      setSeances]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [erreur,       setErreur]       = useState(null);
  const [filtreDebut,  setFiltreDebut]  = useState('');
  const [filtreFin,    setFiltreFin]    = useState('');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [page,         setPage]         = useState(0);

  useEffect(() => {
    if (!classeId) return;
    setLoading(true); setErreur(null);
    fetch(`${_API_URL_ADMIN}/api/elearning/seances?classe_id=${classeId}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => {
        if (d.error) setErreur(d.error);
        else setSeances((d.seances || []).sort((a, b) => new Date(b.date) - new Date(a.date)));
      })
      .catch(e => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId]);

  // Réinitialise la page quand les filtres changent
  useEffect(() => { setPage(0); }, [filtreDebut, filtreFin, filtreStatut]);

  const STATUT = {
    planifiee: { lib: 'Planifiée', bg: '#EFF6FF', txt: '#1E40AF', dot: '#3B82F6' },
    realisee:  { lib: 'Réalisée',  bg: '#F0FDF4', txt: '#166534', dot: '#22C55E' },
    annulee:   { lib: 'Annulée',   bg: '#FEF2F2', txt: '#991B1B', dot: '#EF4444' },
  };

  const col = couleur || '#0891B2';

  function setPeriode(moisArriere) {
    const auj = new Date();
    const d   = new Date(auj);
    d.setMonth(d.getMonth() - moisArriere);
    setFiltreDebut(d.toISOString().slice(0, 10));
    setFiltreFin(auj.toISOString().slice(0, 10));
  }

  const seancesFiltrees = seances.filter(s => {
    if (filtreStatut !== 'tous' && s.statut !== filtreStatut) return false;
    if (filtreDebut && s.date && s.date < filtreDebut) return false;
    if (filtreFin   && s.date && s.date > filtreFin)   return false;
    return true;
  });

  const nbPages  = Math.ceil(seancesFiltrees.length / _SESS_PAGE);
  const pageCurr = Math.min(page, Math.max(0, nbPages - 1));
  const slice    = seancesFiltrees.slice(pageCurr * _SESS_PAGE, (pageCurr + 1) * _SESS_PAGE);
  const filtreActif = filtreDebut || filtreFin || filtreStatut !== 'tous';

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
      <div style={{ fontSize:13 }}>Chargement des sessions…</div>
    </div>
  );

  if (erreur) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#991B1B' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:13 }}>{erreur}</div>
    </div>
  );

  return (
    <div>
      {/* KPIs globaux (toujours sur l'ensemble, pas filtrés) */}
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { l:'Total',      v: seances.length,                                    c: col },
          { l:'Réalisées',  v: seances.filter(s=>s.statut==='realisee').length,   c: '#16A34A' },
          { l:'Planifiées', v: seances.filter(s=>s.statut==='planifiee').length,  c: '#2563EB' },
          { l:'Annulées',   v: seances.filter(s=>s.statut==='annulee').length,    c: '#DC2626' },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 18px', textAlign:'center', minWidth:110 }}>
            <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
            <div style={{ fontSize:10, color:COULEURS.gris500, marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer les sessions</span>
          {filtreActif && (
            <button
              onClick={() => { setFiltreDebut(''); setFiltreFin(''); setFiltreStatut('tous'); }}
              style={{ fontSize:11, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>
              ✕ Effacer
            </button>
          )}
        </div>

        {/* Raccourcis période */}
        <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { l:'Tout',    fn: () => { setFiltreDebut(''); setFiltreFin(''); } },
            { l:'Ce mois', fn: () => setPeriode(0) },
            { l:'3 mois',  fn: () => setPeriode(3) },
            { l:'6 mois',  fn: () => setPeriode(6) },
            { l:'1 an',    fn: () => setPeriode(12) },
          ].map(p => (
            <button key={p.l} onClick={p.fn}
              style={{ padding:'4px 12px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              {p.l}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Du</div>
            <input type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Au</div>
            <input type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Statut</div>
            <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy, background:COULEURS.blanc }}>
              <option value="tous">Tous</option>
              <option value="realisee">Réalisée</option>
              <option value="planifiee">Planifiée</option>
              <option value="annulee">Annulée</option>
            </select>
          </div>
        </div>
      </div>

      {seances.length === 0 ? (
        <div style={{ textAlign:'center', padding:'56px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:44, marginBottom:14 }}>📅</div>
          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune session enregistrée</div>
          <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, maxWidth:360, margin:'0 auto' }}>
            Les sessions de cours apparaîtront ici dès que le coach commencera à les saisir.
          </div>
          {coachNom && (
            <div style={{ marginTop:20, background:`${col}10`, border:`1px solid ${col}25`, borderRadius:10, padding:'10px 18px', display:'inline-block' }}>
              <span style={{ fontSize:13, color:COULEURS.navy }}>👨‍🏫 Coach : <strong>{coachNom}</strong></span>
            </div>
          )}
        </div>
      ) : seancesFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucune session sur cette période</div>
          <div style={{ fontSize:12 }}>Modifiez les filtres pour afficher d'autres sessions.</div>
        </div>
      ) : (
        <>
          {/* Compteur résultats */}
          <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:10 }}>
            {filtreActif
              ? `${seancesFiltrees.length} session${seancesFiltrees.length > 1 ? 's' : ''} filtrée${seancesFiltrees.length > 1 ? 's' : ''} sur ${seances.length}`
              : `${seances.length} session${seances.length > 1 ? 's' : ''}`
            }
            {nbPages > 1 && ` · page ${pageCurr + 1}/${nbPages}`}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            {slice.map((s, i) => {
              const st = STATUT[s.statut] || STATUT.planifiee;
              const duree = s.heure_debut && s.heure_fin
                ? (() => {
                    const [h1, m1] = s.heure_debut.split(':').map(Number);
                    const [h2, m2] = s.heure_fin.split(':').map(Number);
                    const diff = (h2*60+m2) - (h1*60+m1);
                    return diff > 0 ? `${Math.floor(diff/60)}h${String(diff%60).padStart(2,'0')}` : null;
                  })()
                : null;
              const lien = s.lien_zoom || s.lien_meet || s.lien_teams;

              return (
                <div key={s.id || i} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
                  {/* Bloc date */}
                  <div style={{ flexShrink:0, width:52, textAlign:'center', background:`${col}10`, border:`1px solid ${col}25`, borderRadius:10, padding:'8px 6px' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:col, lineHeight:1 }}>
                      {s.date ? new Date(s.date).getDate() : '-'}
                    </div>
                    <div style={{ fontSize:9, fontWeight:700, color:col, textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>
                      {s.date ? new Date(s.date).toLocaleDateString('fr-FR', { month:'short' }) : ''}
                    </div>
                    {s.date && (
                      <div style={{ fontSize:8, color:COULEURS.gris400, marginTop:1 }}>
                        {new Date(s.date).getFullYear()}
                      </div>
                    )}
                  </div>

                  {/* Infos */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>
                        {s.titre || s.type || 'Session de cours'}
                      </span>
                      <span style={{ background:st.bg, color:st.txt, borderRadius:20, padding:'2px 9px', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:st.dot, display:'inline-block' }}/>
                        {st.lib}
                      </span>
                    </div>
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:11, color:COULEURS.gris500 }}>
                      {s.heure_debut && <span>🕐 {s.heure_debut}{s.heure_fin ? ` → ${s.heure_fin}` : ''}{duree ? ` (${duree})` : ''}</span>}
                      {s.nb_presents != null && <span>👥 {s.nb_presents} présent{s.nb_presents !== 1 ? 's' : ''}</span>}
                      {lien && <span style={{ color:col }}>🔗 <a href={lien} target="_blank" rel="noreferrer" style={{ color:col, textDecoration:'none', fontWeight:600 }}>Lien visio</a></span>}
                    </div>
                    {(s.objectifs_session || s.compte_rendu || s.bilan_session) && (
                      <div style={{ marginTop:8, fontSize:12, color:COULEURS.gris600, background:COULEURS.gris50, borderRadius:8, padding:'8px 12px', lineHeight:1.5 }}>
                        {s.objectifs_session && <div><span style={{ fontWeight:600 }}>Objectifs :</span> {s.objectifs_session}</div>}
                        {s.compte_rendu     && <div style={{ marginTop: s.objectifs_session ? 4 : 0 }}><span style={{ fontWeight:600 }}>Compte-rendu :</span> {s.compte_rendu}</div>}
                        {s.bilan_session    && <div style={{ marginTop:4 }}><span style={{ fontWeight:600 }}>Bilan :</span> {s.bilan_session}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {nbPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <button
                onClick={() => setPage(0)}
                disabled={pageCurr === 0}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr === 0 ? COULEURS.gris100 : COULEURS.blanc, color: pageCurr === 0 ? COULEURS.gris400 : COULEURS.navy, cursor: pageCurr === 0 ? 'default' : 'pointer', fontSize:13, fontFamily:'inherit' }}>
                «
              </button>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={pageCurr === 0}
                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr === 0 ? COULEURS.gris100 : COULEURS.blanc, color: pageCurr === 0 ? COULEURS.gris400 : COULEURS.navy, cursor: pageCurr === 0 ? 'default' : 'pointer', fontSize:12, fontFamily:'inherit', fontWeight:600 }}>
                ‹ Préc.
              </button>
              {Array.from({ length: nbPages }, (_, i) => i).filter(i => Math.abs(i - pageCurr) <= 2).map(i => (
                <button key={i} onClick={() => setPage(i)}
                  style={{ padding:'5px 11px', borderRadius:7, border:`1px solid ${i === pageCurr ? col : COULEURS.gris200}`, background: i === pageCurr ? col : COULEURS.blanc, color: i === pageCurr ? '#fff' : COULEURS.navy, cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight: i === pageCurr ? 800 : 500 }}>
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(nbPages - 1, p + 1))}
                disabled={pageCurr === nbPages - 1}
                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr === nbPages - 1 ? COULEURS.gris100 : COULEURS.blanc, color: pageCurr === nbPages - 1 ? COULEURS.gris400 : COULEURS.navy, cursor: pageCurr === nbPages - 1 ? 'default' : 'pointer', fontSize:12, fontFamily:'inherit', fontWeight:600 }}>
                Suiv. ›
              </button>
              <button
                onClick={() => setPage(nbPages - 1)}
                disabled={pageCurr === nbPages - 1}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr === nbPages - 1 ? COULEURS.gris100 : COULEURS.blanc, color: pageCurr === nbPages - 1 ? COULEURS.gris400 : COULEURS.navy, cursor: pageCurr === nbPages - 1 ? 'default' : 'pointer', fontSize:13, fontFamily:'inherit' }}>
                »
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Onglet Présences réelles d'une classe ────────────────────────────────────
const _PRES_PAGE = 15;

export function OngletPresencesClasse({ classeId, couleur }) {
  const [presences,    setPresences]    = useState([]);
  const [seances,      setSeances]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [erreur,       setErreur]       = useState(null);
  const [filtreSea,    setFiltreSea]    = useState('toutes');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [filtreDebut,  setFiltreDebut]  = useState('');
  const [filtreFin,    setFiltreFin]    = useState('');
  const [page,         setPage]         = useState(0);

  useEffect(() => {
    if (!classeId) return;
    setLoading(true); setErreur(null);
    fetch(`${_API_URL_ADMIN}/api/elearning/classes/${classeId}/presences`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErreur(d.error); return; }
        setPresences(d.presences || []);
        setSeances(d.seances || []);
      })
      .catch(e => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId]);

  useEffect(() => { setPage(0); }, [filtreSea, filtreStatut, filtreDebut, filtreFin]);

  const col      = couleur || '#0891B2';
  const fmtDate  = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : '-';
  const FOND_S   = { present:'#D1FAE5', absent:'#FEE2E2', retard:'#FEF3C7' };
  const TEXTE_S  = { present:'#065F46', absent:'#991B1B', retard:'#92400E' };
  const LABEL_S  = { present:'✅ Présent', absent:'❌ Absent', retard:'⏱ Retard' };

  function setPeriode(moisArriere) {
    const auj = new Date();
    const d   = new Date(auj);
    d.setMonth(d.getMonth() - moisArriere);
    setFiltreDebut(d.toISOString().slice(0, 10));
    setFiltreFin(auj.toISOString().slice(0, 10));
  }

  const presencesFiltrees = presences.filter(p => {
    if (filtreSea !== 'toutes' && p.seance_id !== filtreSea) return false;
    if (filtreStatut !== 'tous' && p.statut !== filtreStatut) return false;
    const dateSeance = p.seance?.date;
    if (filtreDebut && dateSeance && dateSeance < filtreDebut) return false;
    if (filtreFin   && dateSeance && dateSeance > filtreFin)   return false;
    return true;
  });

  const nbTotal   = presencesFiltrees.length;
  const nbPresent = presencesFiltrees.filter(p => p.statut === 'present').length;
  const nbAbsent  = presencesFiltrees.filter(p => p.statut === 'absent').length;
  const nbRetard  = presencesFiltrees.filter(p => p.statut === 'retard').length;
  const taux      = nbTotal > 0 ? Math.round(nbPresent / nbTotal * 100) : null;

  const nbPages  = Math.ceil(presencesFiltrees.length / _PRES_PAGE);
  const pageCurr = Math.min(page, Math.max(0, nbPages - 1));
  const slice    = presencesFiltrees.slice(pageCurr * _PRES_PAGE, (pageCurr + 1) * _PRES_PAGE);
  const filtreActif = filtreSea !== 'toutes' || filtreStatut !== 'tous' || filtreDebut || filtreFin;

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
      <div style={{ fontSize:13 }}>Chargement des présences…</div>
    </div>
  );
  if (erreur) return (
    <div style={{ textAlign:'center', padding:'40px 20px', color:'#991B1B', fontSize:13 }}>⚠️ {erreur}</div>
  );

  return (
    <div>
      {/* KPIs globaux */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { l:'Présents',      v: presences.filter(p=>p.statut==='present').length, c:'#16A34A' },
          { l:'Absents',       v: presences.filter(p=>p.statut==='absent').length,  c:'#DC2626' },
          { l:'Retards',       v: presences.filter(p=>p.statut==='retard').length,  c:'#D97706' },
          { l:'Taux global',   v: presences.length > 0 ? `${Math.round(presences.filter(p=>p.statut==='present').length/presences.length*100)}%` : '-',
            c: presences.length === 0 ? COULEURS.gris400 : Math.round(presences.filter(p=>p.statut==='present').length/presences.length*100) >= 75 ? '#16A34A' : '#D97706' },
        ].map(k => (
          <div key={k.l} style={{ flex:1, minWidth:80, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
            <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer les présences</span>
          {filtreActif && (
            <button
              onClick={() => { setFiltreSea('toutes'); setFiltreStatut('tous'); setFiltreDebut(''); setFiltreFin(''); }}
              style={{ fontSize:11, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>
              ✕ Effacer
            </button>
          )}
        </div>

        {/* Raccourcis période */}
        <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { l:'Tout',    fn: () => { setFiltreDebut(''); setFiltreFin(''); } },
            { l:'Ce mois', fn: () => setPeriode(0) },
            { l:'3 mois',  fn: () => setPeriode(3) },
            { l:'6 mois',  fn: () => setPeriode(6) },
            { l:'1 an',    fn: () => setPeriode(12) },
          ].map(p => (
            <button key={p.l} onClick={p.fn}
              style={{ padding:'4px 12px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              {p.l}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Du</div>
            <input type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Au</div>
            <input type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Statut</div>
            <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy, background:COULEURS.blanc }}>
              <option value="tous">Tous</option>
              <option value="present">Présent</option>
              <option value="absent">Absent</option>
              <option value="retard">Retard</option>
            </select>
          </div>
          {seances.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Session</div>
              <select value={filtreSea} onChange={e => setFiltreSea(e.target.value)}
                style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy, background:COULEURS.blanc }}>
                <option value="toutes">Toutes ({seances.length})</option>
                {seances.map(s => (
                  <option key={s.id} value={s.id}>
                    {fmtDate(s.date)} - {s.objectifs_session || 'Séance'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Résultats filtrés KPIs */}
      {filtreActif && nbTotal > 0 && (
        <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
          {[
            { l:'Présents (filtre)',  v: nbPresent, c:'#16A34A' },
            { l:'Absents (filtre)',   v: nbAbsent,  c:'#DC2626' },
            { l:'Total (filtre)',     v: nbTotal,   c: col },
            { l:'Taux (filtre)',      v: taux !== null ? `${taux}%` : '-', c: taux >= 75 ? '#16A34A' : '#D97706' },
          ].map(k => (
            <div key={k.l} style={{ flex:1, minWidth:70, background:`${k.c}08`, border:`1px solid ${k.c}30`, borderRadius:8, padding:'8px', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:800, color:k.c }}>{k.v}</div>
              <div style={{ fontSize:9, color:COULEURS.gris600, marginTop:1 }}>{k.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tableau */}
      {presences.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy, marginBottom:6 }}>Aucune présence enregistrée</div>
          <div style={{ fontSize:12 }}>Les présences apparaissent dès que le coach clôture une session.</div>
        </div>
      ) : presencesFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun résultat pour ces filtres</div>
          <div style={{ fontSize:12 }}>Modifiez les filtres pour afficher d'autres présences.</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:8 }}>
            {filtreActif
              ? `${nbTotal} résultat${nbTotal > 1 ? 's' : ''} sur ${presences.length} présences`
              : `${presences.length} présence${presences.length > 1 ? 's' : ''}`
            }
            {nbPages > 1 && ` · page ${pageCurr + 1}/${nbPages}`}
          </div>

          <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, marginBottom:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1.2fr 1fr', padding:'9px 14px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              <span>Apprenant</span><span>Session</span><span>Date</span><span>Statut</span>
            </div>
            {slice.map((p, i) => {
              const nom = p.inscription?.nom_complet || '-';
              const seance = p.seance;
              return (
                <div key={p.id || i} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1.2fr 1fr', padding:'10px 14px', borderBottom: i < slice.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: p.statut === 'absent' ? '#FFF5F5' : 'transparent' }}>
                  <div>
                    <div style={{ fontWeight:600, color:COULEURS.navy }}>{nom}</div>
                    {p.inscription?.niveau_cecr && <div style={{ fontSize:10, color:COULEURS.gris400 }}>{p.inscription.niveau_cecr}</div>}
                  </div>
                  <span style={{ color:COULEURS.gris700, fontSize:11 }}>{seance?.objectifs_session || '-'}</span>
                  <span style={{ color:COULEURS.gris600 }}>{fmtDate(seance?.date)}</span>
                  <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background: FOND_S[p.statut] || COULEURS.gris100, color: TEXTE_S[p.statut] || COULEURS.gris600, display:'inline-block' }}>
                    {LABEL_S[p.statut] || p.statut}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {nbPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <button onClick={() => setPage(0)} disabled={pageCurr === 0}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr===0?COULEURS.gris100:COULEURS.blanc, color: pageCurr===0?COULEURS.gris400:COULEURS.navy, cursor: pageCurr===0?'default':'pointer', fontSize:13, fontFamily:'inherit' }}>«</button>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={pageCurr===0}
                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr===0?COULEURS.gris100:COULEURS.blanc, color: pageCurr===0?COULEURS.gris400:COULEURS.navy, cursor: pageCurr===0?'default':'pointer', fontSize:12, fontFamily:'inherit', fontWeight:600 }}>‹ Préc.</button>
              {Array.from({ length: nbPages }, (_, i) => i).filter(i => Math.abs(i - pageCurr) <= 2).map(i => (
                <button key={i} onClick={() => setPage(i)}
                  style={{ padding:'5px 11px', borderRadius:7, border:`1px solid ${i===pageCurr?col:COULEURS.gris200}`, background: i===pageCurr?col:COULEURS.blanc, color: i===pageCurr?'#fff':COULEURS.navy, cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight: i===pageCurr?800:500 }}>
                  {i+1}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(nbPages-1, p+1))} disabled={pageCurr===nbPages-1}
                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr===nbPages-1?COULEURS.gris100:COULEURS.blanc, color: pageCurr===nbPages-1?COULEURS.gris400:COULEURS.navy, cursor: pageCurr===nbPages-1?'default':'pointer', fontSize:12, fontFamily:'inherit', fontWeight:600 }}>Suiv. ›</button>
              <button onClick={() => setPage(nbPages-1)} disabled={pageCurr===nbPages-1}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr===nbPages-1?COULEURS.gris100:COULEURS.blanc, color: pageCurr===nbPages-1?COULEURS.gris400:COULEURS.navy, cursor: pageCurr===nbPages-1?'default':'pointer', fontSize:13, fontFamily:'inherit' }}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Onglet Accès d'une classe ─────────────────────────────────────────────────
export function OngletAccesClasse({ benefs, couleur }) {
  const alerte = useAlerte();
  const col = couleur || '#0891B2';
  // Réinitialiser le mot de passe d'un compte existant n'est pas du ressort de
  // l'Assistant E-Learning - seule la création d'un tout premier accès l'est.
  const rolePhysique = (() => { try { return JSON.parse(localStorage.getItem('admin_profil') || '{}')?.role; } catch { return null; } })();
  const peutReinitialiserMdp = rolePhysique !== 'assistant_elearning';
  const [enCours,  setEnCours]  = useState({});  // { [benef_id]: true }
  const [resultats, setResultats] = useState({}); // { [benef_id]: { mdp, email, erreur } }
  const [copies,   setCopies]   = useState({});   // { [key]: true }

  async function creerAcces(b) {
    if (enCours[b.id]) return;
    // Pas de blocage si l'email est absent : le backend génère alors un identifiant
    // @betacademy.app (via téléphone ou nom+prénom) - voir creerAccesApprenantCore.
    const email = b.email || b.email_benef || null;
    setEnCours(prev => ({ ...prev, [b.id]: true }));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces`, {
        method: 'POST',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({
          email,
          nom:    b.nom    || b.nom_complet?.split(' ').slice(1).join(' ') || '',
          prenom: b.prenom || b.nom_complet?.split(' ')[0] || '',
          telephone: b.telephone || null,
          // Permet au backend de détecter directement si cet email/tel est celui du parent
          // et de générer un identifiant @betacademy.app pour l'enfant dans ce cas.
          email_parent:     b.email_parent     || null,
          telephone_parent: b.telephone_parent || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur lors de la création');
      setResultats(prev => ({ ...prev, [b.id]: { email: d.login_email || email, mdp: d.mdp_initial } }));
    } catch (err) {
      setResultats(prev => ({ ...prev, [b.id]: { erreur: err.message } }));
    } finally {
      setEnCours(prev => ({ ...prev, [b.id]: false }));
    }
  }

  function copier(texte, cle) {
    navigator.clipboard?.writeText(texte).catch(() => {});
    setCopies(prev => ({ ...prev, [cle]: true }));
    setTimeout(() => setCopies(prev => ({ ...prev, [cle]: false })), 2000);
  }

  const nbActifs   = benefs.filter(b => b.acces_elearning).length;
  const nbSansAcces = benefs.filter(b => !b.acces_elearning).length;

  if (benefs.length === 0) return (
    <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400, fontSize:13 }}>
      Aucun bénéficiaire dans cette classe.
    </div>
  );

  return (
    <div>
      {/* Explication */}
      <div style={{ background:`${col}08`, border:`1px solid ${col}25`, borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', gap:12, alignItems:'flex-start' }}>
        <span style={{ fontSize:20, flexShrink:0 }}>🔐</span>
        <div style={{ fontSize:13, color:COULEURS.navy, lineHeight:1.7 }}>
          <strong>Accès plateforme BET e-learning.</strong> Chaque bénéficiaire a besoin d'un compte pour se connecter.
          Cliquez sur <strong>Créer l'accès</strong> pour générer un identifiant et un mot de passe temporaire à lui communiquer.
          S'il a déjà un compte, le bouton recrée un nouveau mot de passe temporaire.
        </div>
      </div>

      {/* Résumé */}
      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        {[
          { l:'Compte actif',    v: nbActifs,    c:'#16A34A' },
          { l:'Sans compte',     v: nbSansAcces, c:'#D97706' },
          { l:'Total',           v: benefs.length, c: col },
        ].map(k => (
          <div key={k.l} style={{ flex:1, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
            <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Liste */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {benefs.map(b => {
          const nom    = b.nom_complet || `${b.prenom||''} ${b.nom||''}`.trim() || '-';
          const email  = b.email || b.email_benef || null;
          const actif  = b.acces_elearning ?? false;
          const load   = enCours[b.id] || false;
          const res    = resultats[b.id] || null;

          return (
            <div key={b.id} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:13 }}>{nom}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginTop:2 }}>{email || <span style={{ color:'#D97706' }}>⚠ Pas d'email renseigné</span>}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                  <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700,
                    background: actif ? '#D1FAE5' : '#FEF3C7',
                    color:      actif ? '#065F46' : '#92400E' }}>
                    {actif ? '✅ Compte actif' : '⚠ Pas de compte'}
                  </span>
                  {email && (actif ? peutReinitialiserMdp : true) && (
                    <button
                      onClick={() => creerAcces(b)}
                      disabled={load}
                      style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${col}`, background: load ? COULEURS.gris100 : actif ? COULEURS.blanc : col, color: load ? COULEURS.gris400 : actif ? col : '#fff', fontSize:11, fontWeight:700, cursor: load ? 'not-allowed' : 'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                      {load ? '⏳ En cours…' : actif ? '🔄 Nouveau mdp' : '🔑 Créer l\'accès'}
                    </button>
                  )}
                  {email && actif && !peutReinitialiserMdp && (
                    <span style={{ fontSize:10, color:COULEURS.gris400, fontStyle:'italic' }}>Réinitialisation réservée à Onboarding</span>
                  )}
                </div>
              </div>

              {/* Résultat après création */}
              {res && !res.erreur && (
                <div style={{ marginTop:12, background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:10, padding:'12px 16px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#065F46', marginBottom:10 }}>
                    🎉 Identifiants générés - à communiquer à {nom.split(' ')[0]}
                  </div>
                  {[
                    { l:'Email / Identifiant', v: res.email, k:`${b.id}-email` },
                    { l:'Mot de passe temporaire', v: res.mdp, k:`${b.id}-mdp` },
                    { l:'URL de connexion', v: `${window.location.origin}/connexion/apprenant`, k:`${b.id}-url` },
                  ].map(({ l, v, k }) => v ? (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.7)', borderRadius:8, padding:'8px 12px', marginBottom:6, gap:10 }}>
                      <div>
                        <div style={{ fontSize:9, fontWeight:700, color:'#166534', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:1 }}>{l}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#14532D', fontFamily:'monospace' }}>{v}</div>
                      </div>
                      <button onClick={() => copier(v, k)}
                        style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #86EFAC', background: copies[k] ? '#16A34A' : '#fff', color: copies[k] ? '#fff' : '#16A34A', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                        {copies[k] ? '✓ Copié' : 'Copier'}
                      </button>
                    </div>
                  ) : null)}
                </div>
              )}
              {res?.erreur && (
                <div style={{ marginTop:10, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#991B1B' }}>
                  ⚠ Erreur : {res.erreur}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* `onOuvrirBenef` et `onStatutChange` sont OPTIONNELS, et ont un défaut.
   Ce composant est monté par cinq écrans ; l'un d'eux ne passait pas `onOuvrirBenef`, et
   le bouton « 👁 Détail » de la liste des bénéficiaires faisait planter la page entière
   — « onOuvrirBenef is not a function ». Un composant partagé ne doit pas tomber parce
   qu'un appelant n'a pas besoin d'une de ses fonctionnalités : sans gestionnaire, le
   bouton est simplement masqué (voir plus bas), ce qui vaut mieux qu'un bouton présent
   qui casse. */
export function ModalDetailClasseAdmin({ classe, entreprise, onFermer, onOuvrirBenef = null, onStatutChange = null }) {
  const [tab, setTab] = useState('infos');
  const { couleurTheme } = useTheme();
  /* La couleur de l'ENTREPRISE reste prioritaire — sur sa fiche, c'est elle qui identifie
     le client. Partout ailleurs on retombe sur le thème du dashboard plutôt que sur un
     cyan codé en dur, qui ne correspondait à aucune charte. */
  const couleur  = entreprise?.couleur || couleurTheme;
  const benefs   = classe.apprenants || [];
  const horaires = Array.isArray(classe.horaire) ? classe.horaire : [];
  const FORMAT   = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };
  const niv      = classe.niveau;

  const TABS = [
    { id:'infos',         lib:'Infos',          icone:'ℹ️' },
    { id:'beneficiaires', lib:'Bénéficiaires',  icone:'👥', badge: benefs.length },
    { id:'presences',     lib:'Présences',      icone:'✅' },
    { id:'sessions',      lib:'Sessions',       icone:'📅' },
    { id:'progression',   lib:'Progression',    icone:'📈' },
    /* PAS D'ONGLET « ACCÈS » ICI : une classe n'a pas d'identifiants de connexion.
       Il listait en réalité les accès de ses apprenants — une information qui appartient
       à la fiche de chaque apprenant, et au seul profil habilité à la lire. */
    { id:'historique',    lib:'Historique',     icone:'🕓' },
  ];

  /* MODIFIER LA CLASSE DEPUIS SA FICHE. Cette modale ne portait AUCUN bouton d'édition :
     l'assistante pouvait tout consulter - nom, niveau, horaires, capacité - sans jamais
     rien corriger, alors que la fiche de l'Onboarding le permet et que la route
     `PATCH /api/classes-elearning/:id` accepte déjà ces champs.
     Une classe clôturée ou archivée se consulte, elle ne se modifie plus. */
  const [editCl, setEditCl] = useState(false);
  const [formCl, setFormCl] = useState(null);
  const [saveCl, setSaveCl] = useState(false);
  const [flashCl, setFlashCl] = useState(null);
  const [clLocale, setClLocale] = useState(classe);
  const clFigee = ['clos', 'archive', 'termine'].includes(clLocale.statut);
  /* La classe appartient à l'Onboarding : lui seul la crée, en pose l'emploi du temps et
     la modifie. Ici, personne — cette modale est celle des profils qui consultent. */
  const peutModifierClasse = false;

  function ouvrirEditionClasse() {
    /* QUATRE CHAMPS, PAS DAVANTAGE. Niveau, format, statut, coach et entreprise sont
       volontairement hors du formulaire : ils engagent la classe et son effectif, et se
       décident ailleurs avec le contexte qu'il faut. Ne garder ici que ce qui se corrige
       sans conséquence évite de tout mélanger dans un même geste. */
    setFormCl({
      nom:          clLocale.nom          || '',
      capacite_max: clLocale.capacite_max || '',
      date_debut:   (clLocale.date_debut  || '').slice(0, 10),
      date_fin:     (clLocale.date_fin    || '').slice(0, 10),
    });
    setFlashCl(null);
    setEditCl(true);
  }

  async function sauvegarderClasse() {
    if (saveCl) return;
    setSaveCl(true); setFlashCl(null);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${clLocale.id}`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: formCl.nom,
          // `capacite_max` part en nombre : une chaîne vide effacerait la capacité.
          capacite_max: formCl.capacite_max === '' ? null : Number(formCl.capacite_max),
          date_debut:   formCl.date_debut || null,
          date_fin:     formCl.date_fin   || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
      setClLocale(prev => ({ ...prev, ...(d.classe || formCl) }));
      setEditCl(false);
      setFlashCl({ ok: true, msg: '✅ Classe mise à jour.' });
      onStatutChange?.();
      setTimeout(() => setFlashCl(null), 3500);
    } catch (e) {
      setFlashCl({ ok: false, msg: e.message });
    } finally { setSaveCl(false); }
  }

  /* L'historique de la classe : les entrées d'audit qui la citent. Chargé seulement
     quand on ouvre l'onglet, et UNE SEULE FOIS - la garde porte sur la tentative et non
     sur le résultat, sans quoi une classe sans événement relancerait la requête en
     boucle (même piège que sur la fiche apprenant). */
  const [histoClasse, setHistoClasse] = useState([]);
  const [chargHistoCl, setChargHistoCl] = useState(false);
  const histoTente = useRef(false);
  useEffect(() => {
    if (tab !== 'historique' || histoTente.current) return;
    histoTente.current = true;
    setChargHistoCl(true);
    fetch(`${_API_URL_ADMIN}/api/audit/logs?entite_id=${classe.id}&limit=50&include_non_staff=true`, { headers: _authHdrsAdmin() })
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(d => setHistoClasse(d.logs || d.data || []))
      .catch(() => {})
      .finally(() => setChargHistoCl(false));
  }, [tab, classe.id]);

  const row = (l, v) => v ? (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, gap:12 }}>
      <span style={{ color:COULEURS.gris600, flexShrink:0 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy, textAlign:'right' }}>{v}</span>
    </div>
  ) : null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1500, backdropFilter:'blur(3px)' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:20, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 40px 100px rgba(0,0,0,0.35)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${couleur}CC, ${couleur})`, padding:'20px 26px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              {/* LA PHOTO DE LA CLASSE, pas une icône générique - et MODIFIABLE ici.
                  L'en-tête affichait un 🏫 identique pour toutes, ce qui rendait invisible
                  la photo posée à la création, partout où cette fiche est ouverte.
                  `PhotoClasseEntete` est le même composant que la fiche de l'Onboarding :
                  il affiche, laisse remplacer l'image et enregistre immédiatement, sans
                  bouton « Enregistrer » que cette modale n'a pas.
                  Une classe clôturée se consulte, elle ne se modifie plus. */}
              <PhotoClasseEntete classe={classe} taille={48} accent="#fff"
                modifiable={classe.statut !== 'clos' && classe.statut !== 'archive'}
                onChange={url => { classe.photo_url = url; }} />
              <div>
                <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{classe.nom}</div>
                <div style={{ display:'flex', gap:8, marginTop:5, flexWrap:'wrap', alignItems:'center' }}>
                  {niv && <span style={{ background:NIV_COULEUR_ADM[niv]||'rgba(255,255,255,0.3)', color:'#fff', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:800 }}>{niv}</span>}
                  {classe.type_cours && <span style={{ background:'rgba(255,255,255,0.18)', color:'rgba(255,255,255,0.85)', borderRadius:20, padding:'2px 8px', fontSize:11 }}>{FORMAT[classe.type_cours]||classe.type_cours}</span>}
                  <span style={{ background: classe.statut==='actif' ? '#D1FAE5' : '#FEF3C7', color: classe.statut==='actif' ? '#065F46' : '#92400E', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>
                    {classe.statut === 'actif' ? 'Active' : classe.statut}
                  </span>
                  <span style={{ color:'rgba(255,255,255,0.75)', fontSize:12 }}>· {benefs.length} bénéficiaire{benefs.length!==1?'s':''}</span>
                </div>
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:34, height:34, cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, padding:'0 20px', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'12px 16px', border:'none', borderBottom: tab===t.id ? `2.5px solid ${couleur}` : '2.5px solid transparent', background:'none', color: tab===t.id ? couleur : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
              <span>{t.icone}</span>{t.lib}
              {t.badge > 0 && <span style={{ background:couleur, color:'#fff', borderRadius:20, padding:'1px 6px', fontSize:10, fontWeight:700, marginLeft:2 }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

          {/* INFOS */}
          {tab === 'infos' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:860 }}>
              {/* Barre d'action : modifier, ou enregistrer/annuler pendant l'édition */}
              <div style={{ gridColumn:'1/-1', display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10 }}>
                {flashCl && (
                  <span style={{ fontSize:12, padding:'6px 14px', borderRadius:20, background: flashCl.ok ? '#D1FAE5' : '#FEE2E2', color: flashCl.ok ? '#065F46' : '#DC2626', fontWeight:600 }}>{flashCl.msg}</span>
                )}
                {/* MODIFIER UNE CLASSE EST RÉSERVÉ À L'ONBOARDING, qui dispose de sa propre
                    fiche (ModalDetailClasseOnboarding) avec l'édition complète. Cette
                    modale-ci sert l'assistante, l'Admin et le SuperAdmin : ils consultent.
                    Le bouton y avait été ajouté sans cette distinction de métier. */}
                {!peutModifierClasse ? (
                  <span style={{ fontSize:11, padding:'5px 12px', borderRadius:20, background:COULEURS.gris100, color:COULEURS.gris600, fontWeight:600 }}>
                    {clFigee ? `🔒 Classe ${clLocale.statut} — lecture seule` : '🔒 Modification réservée à l\'Onboarding'}
                  </span>
                ) : editCl ? (
                  <>
                    <button onClick={() => { setEditCl(false); setFlashCl(null); }} disabled={saveCl}
                      style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, fontWeight:600, cursor:'pointer', color:COULEURS.gris600, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      Annuler
                    </button>
                    <button onClick={sauvegarderClasse} disabled={saveCl || !formCl?.nom?.trim()}
                      style={{ padding:'7px 16px', borderRadius:8, border:'none', background: formCl?.nom?.trim() ? couleur : COULEURS.gris200, fontSize:12, fontWeight:700, cursor: formCl?.nom?.trim() ? 'pointer' : 'not-allowed', color:'#fff', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {saveCl ? '⏳ Enregistrement…' : '💾 Enregistrer'}
                    </button>
                  </>
                ) : (
                  <button onClick={ouvrirEditionClasse}
                    style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${couleur}`, background:COULEURS.blanc, fontSize:12, fontWeight:700, cursor:'pointer', color:couleur, fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                    ✏️ Modifier la classe
                  </button>
                )}
              </div>

              {editCl && formCl ? (
                <div style={{ gridColumn:'1/-1', background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:16, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>✏️ Modifier la classe</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    {[
                      { l:'Nom de la classe *', k:'nom' },
                      { l:'Capacité maximale',  k:'capacite_max', t:'number' },
                      { l:'Date de début',      k:'date_debut',   t:'date' },
                      { l:'Date de fin',        k:'date_fin',     t:'date' },
                    ].map(({ l, k, t }) => (
                      <div key={k} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{l}</label>
                        <input type={t || 'text'} value={formCl[k]} onChange={e => setFormCl(f => ({ ...f, [k]: e.target.value }))}
                          style={{ padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box' }} />
                      </div>
                    ))}
                  </div>

                  {/* ── CE QUI NE SE MODIFIE PAS ICI, ET POURQUOI ──
                      L'édition se limite aux champs « éditoriaux » : un libellé, une
                      capacité, des dates. Tout ce qui ENGAGE la classe reste ailleurs,
                      parce que ces décisions se prennent avec un contexte que cette fiche
                      n'a pas - et qu'un menu déroulant discret les court-circuiterait. */}
                  <div style={{ marginTop:18, background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'14px 16px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
                      🔒 Non modifiable ici
                    </div>
                    {[
                      { l:'Niveau CECR', v: clLocale.niveau || '— non défini —',
                        pq:'Les apprenants sont assignés sur ce niveau — le changer ici désaccorderait la classe de son effectif.' },
                      { l:'Format',      v: FORMAT[clLocale.type_cours] || clLocale.type_cours || '—',
                        pq:'Structure la classe et ses séances.' },
                      { l:'Statut',      v: clLocale.statut || 'actif',
                        pq:'Suspendre ou clôturer est un geste à part, pas un choix dans une liste.' },
                      { l:'Coach',       v: clLocale.coach_nom || '— non assigné —',
                        pq:'S\'assigne depuis le PA Advisor, sur la charge, les disponibilités et la note du coach.' },
                      { l:'Entreprise',  v: clLocale.entreprise_nom || '—',
                        pq:'Rattachement contractuel de la classe.' },
                      { l:'Créneaux horaires', v: `${horaires.length} créneau${horaires.length > 1 ? 'x' : ''}`,
                        pq:'L\'emploi du temps relève de l\'Onboarding, qui le pose à la création de la classe.' },
                    ].map(({ l, v, pq }) => (
                      <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, padding:'7px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>{l}</div>
                          <div style={{ fontSize:10.5, color:COULEURS.gris400, lineHeight:1.4 }}>{pq}</div>
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600, whiteSpace:'nowrap', flexShrink:0 }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:10, fontSize:10.5, color:COULEURS.gris400 }}>
                      La photo de la classe se change depuis l'en-tête de cette fiche.
                    </div>
                  </div>
                </div>
              ) : (
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'18px 20px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:10, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>📋 Détails</div>
                {row('Nom',        clLocale.nom)}
                {row('Niveau',     clLocale.niveau)}
                {row('Format',     FORMAT[clLocale.type_cours] || clLocale.type_cours)}
                {row('Statut',     clLocale.statut === 'actif' ? '✅ Active' : clLocale.statut)}
                {row('Capacité',   clLocale.capacite_max ? `${benefs.length} / ${clLocale.capacite_max} places` : null)}
                {row('Entreprise', clLocale.entreprise_nom)}
              </div>
              )}
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'18px 20px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:10, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>👨‍🏫 Encadrement & Dates</div>
                {row('Coach',      classe.coach_nom || '- Non assigné')}
                {row('Date début', classe.date_debut ? new Date(classe.date_debut).toLocaleDateString('fr-FR') : null)}
                {row('Date fin',   classe.date_fin   ? new Date(classe.date_fin).toLocaleDateString('fr-FR')   : null)}
                {row('Type',       '🎓 E-Learning BET')}
              </div>
              {/* L'ÉTAT VIDE EST DIT, et il dit QUI peut le remplir. Le bloc n'apparaissait
                  qu'avec des créneaux : une classe sans emploi du temps n'affichait rien
                  du tout, sans qu'on sache si l'information manquait ou si l'écran était
                  incomplet. Les créneaux se saisissent à la création de la classe, par
                  l'Onboarding — ils ne se modifient pas depuis cette fiche. */}
              {horaires.length === 0 && (
                <div style={{ gridColumn:'1/-1', background:COULEURS.gris50, border:`2px dashed ${COULEURS.gris200}`, borderRadius:12, padding:'24px 20px', textAlign:'center' }}>
                  <div style={{ fontSize:30, marginBottom:8 }}>📅</div>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:5 }}>Aucun créneau horaire défini</div>
                  <div style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.5, maxWidth:420, margin:'0 auto' }}>
                    L'emploi du temps se renseigne à la création de la classe, par l'Onboarding.
                  </div>
                </div>
              )}
              {horaires.length > 0 && (
                <div style={{ gridColumn:'1/-1', background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'18px 20px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>📅 Disponibilités - créneaux horaires</span>
                    <span style={{ fontSize:10, fontWeight:600, color:COULEURS.gris400 }}>🔒 Gérés par l'Onboarding</span>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                    {horaires.map((h, i) => (
                      <div key={i} style={{ background:`${couleur}10`, border:`1px solid ${couleur}30`, borderRadius:10, padding:'8px 14px', display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:700, color:couleur }}>{h.jour}</span>
                        <span style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>{h.debut} – {h.fin}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {niv && (
                <div style={{ gridColumn:'1/-1', background:`${NIV_COULEUR_ADM[niv]||couleur}10`, border:`1px solid ${NIV_COULEUR_ADM[niv]||couleur}30`, borderRadius:12, padding:'16px 20px', display:'flex', gap:16, alignItems:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:12, background:NIV_COULEUR_ADM[niv]||couleur, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, color:'#fff', flexShrink:0 }}>{niv}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:3 }}>{{ A0:'Faux débutant', A1:'Débutant', A2:'Élémentaire', B1:'Intermédiaire', B2:'Intermédiaire supérieur', C1:'Avancé', C2:'Maîtrise' }[niv]||niv}</div>
                    <div style={{ fontSize:12, color:COULEURS.gris600 }}>Niveau CECR de la classe - test de placement requis</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BÉNÉFICIAIRES */}
          {tab === 'beneficiaires' && (
            <>
              <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
                {[
                  { l:'Total',               v:benefs.length,                                  c:couleur },
                  { l:'Actifs',              v:benefs.filter(b=>b.statut==='actif').length,     c:'#059669' },
                  { l:'Niveaux renseignés',  v:benefs.filter(b=>b.niveau_cecr).length,         c:'#7C3AED' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 16px', textAlign:'center', minWidth:120 }}>
                    <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
                    <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{l}</div>
                  </div>
                ))}
              </div>
              {benefs.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
                  <div>Aucun bénéficiaire dans cette classe.</div>
                </div>
              ) : (
                <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 70px', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Bénéficiaire</span><span>Contact</span><span>Niveau</span><span>Statut</span><span></span>
                  </div>
                  {benefs.map((b, i) => {
                    const nom  = b.nom_complet || `${b.prenom||''} ${b.nom||''}`.trim() || '-';
                    const init = nom.split(/\s+/).map(p=>p[0]||'').slice(0,2).join('').toUpperCase();
                    const nv   = b.niveau_cecr;
                    return (
                      <div key={b.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 70px', padding:'10px 16px', borderBottom: i < benefs.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:12 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:30, height:30, borderRadius:8, background:`${couleur}18`, border:`1.5px solid ${couleur}35`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:couleur, flexShrink:0 }}>{init}</div>
                          <div style={{ fontWeight:700, color:COULEURS.navy }}>{nom}</div>
                        </div>
                        <span style={{ color:COULEURS.gris600, fontSize:11 }}>{b.email || b.telephone || '-'}</span>
                        <span>{nv ? <span style={{ background:NIV_COULEUR_ADM[nv]||couleur, color:'#fff', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{nv}</span> : <span style={{ color:COULEURS.gris400 }}>-</span>}</span>
                        <span style={{ background: b.statut==='suspendu' ? '#FEE2E2' : '#D1FAE5', color: b.statut==='suspendu' ? '#991B1B' : '#065F46', borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:700, display:'inline-block' }}>
                          {b.statut === 'suspendu' ? 'Suspendu' : 'Actif'}
                        </span>
                        {onOuvrirBenef ? (
                          <button onClick={() => onOuvrirBenef({ ...b, _source: 'elearning', prenom: b.prenom || nom.split(' ')[0], nom: b.nom || nom.split(' ').slice(1).join(' ') || nom })}
                            style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${couleur}`, background:`${couleur}10`, color:couleur, cursor:'pointer', fontSize:10, fontFamily:'"Plus Jakarta Sans",sans-serif', fontWeight:600 }}>
                            👁 Détail
                          </button>
                        ) : <span />}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* PRÉSENCES */}
          {tab === 'presences' && (
            <OngletPresencesClasse classeId={classe.id} couleur={couleur} />
          )}

          {/* SESSIONS */}
          {tab === 'sessions' && (
            <OngletSessionsClasse classeId={classe.id} coachNom={classe.coach_nom} couleur={couleur} />
          )}

          {/* PROGRESSION — le niveau des apprenants de la classe, et leur assiduité */}
          {tab === 'progression' && (
            benefs.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 24px', background:COULEURS.gris50, borderRadius:12, border:`2px dashed ${COULEURS.gris200}` }}>
                <div style={{ fontSize:34, marginBottom:10 }}>📈</div>
                <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun apprenant dans cette classe</div>
                <div style={{ fontSize:12, color:COULEURS.gris600 }}>La progression s'affichera dès le premier inscrit.</div>
              </div>
            ) : (() => {
              /* Répartition par niveau : sur une classe annoncée « B1 », voir qui n'y est
                 pas encore dit en un coup d'œil si le groupe est homogène - c'est la
                 question que le niveau affiché en en-tête ne répond pas. */
              const parNiveau = {};
              benefs.forEach(b => { const n = b.niveau_cecr || b.niveau || '—'; parNiveau[n] = (parNiveau[n] || 0) + 1; });
              const horsNiveau = niv ? benefs.filter(b => (b.niveau_cecr || b.niveau) && (b.niveau_cecr || b.niveau) !== niv).length : 0;
              const avecCompte = benefs.filter(b => b.apprenant_id).length;
              return (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
                    {[
                      { l:'Apprenants',        v: benefs.length, c: couleur },
                      { l:'Niveau de la classe', v: niv || '—',  c:'#6366F1' },
                      { l:'Hors niveau',       v: horsNiveau,    c: horsNiveau > 0 ? '#F59E0B' : '#059669' },
                      { l:'Accès ouverts',     v: `${avecCompte}/${benefs.length}`, c: avecCompte === benefs.length ? '#059669' : '#F59E0B' },
                    ].map(k => (
                      <div key={k.l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'14px 16px' }}>
                        <div style={{ fontSize:17, fontWeight:800, color:k.c }}>{k.v}</div>
                        <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:3 }}>{k.l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'16px 20px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Répartition par niveau</div>
                    {Object.entries(parNiveau).sort().map(([n, nb]) => {
                      const pct = Math.round((nb / benefs.length) * 100);
                      return (
                        <div key={n} style={{ marginBottom:9 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                            <span style={{ color:COULEURS.navy, fontWeight: n === niv ? 700 : 500 }}>{n}{n === niv ? ' · niveau de la classe' : ''}</span>
                            <span style={{ fontWeight:700, color:COULEURS.gris600 }}>{nb} · {pct}%</span>
                          </div>
                          <div style={{ height:7, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${pct}%`, background: n === niv ? couleur : COULEURS.gris400, borderRadius:4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()
          )}

          {/* HISTORIQUE */}
          {tab === 'historique' && (
            chargHistoCl ? <div style={{ textAlign:'center', padding:'40px 0', color:COULEURS.gris400 }}>Chargement…</div>
            : histoClasse.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 24px', background:COULEURS.gris50, borderRadius:12, border:`2px dashed ${COULEURS.gris200}` }}>
                <div style={{ fontSize:34, marginBottom:10 }}>🕓</div>
                <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun événement enregistré</div>
                <div style={{ fontSize:12, color:COULEURS.gris600 }}>Les actions sur cette classe apparaîtront ici au fur et à mesure.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column' }}>
                {histoClasse.map((h, i) => (
                  <div key={h.id || i} style={{ display:'flex', gap:14, paddingBottom: i < histoClasse.length-1 ? 18 : 0 }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background: h.statut==='warning' ? '#F59E0B' : h.statut==='error' ? '#DC2626' : couleur, marginTop:4 }} />
                      {i < histoClasse.length-1 && <div style={{ width:2, flex:1, background:COULEURS.gris200, marginTop:4 }} />}
                    </div>
                    <div style={{ flex:1, paddingBottom:4 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{(h.action_type || '').replace(/_/g,' ').toLowerCase()}</div>
                      <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2, lineHeight:1.5 }}>{h.detail || '-'}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>
                        {(h.created_at || '').slice(0,16).replace('T',' à ')}
                        {h.acteur_nom && <> · {h.acteur_nom}</>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

        </div>
      </div>
    </div>
  );
}

