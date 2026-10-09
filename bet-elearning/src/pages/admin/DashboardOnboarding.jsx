// DashboardOnboarding.jsx - Module Onboarding extrait de DashboardAdmin.jsx (profil admin_onboarding)
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as XLSX_ADMIN from 'xlsx';
import { useAlerte } from '../../contexts/ConfirmContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { COULEURS } from '../../constants/couleurs';
import { exporterExcelStyle } from '../../utils/genererPDF';
import { chargerPackages } from '../../constants/packagesCommerciaux';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';
import { PaginationSimple, ModalDetailApprenant, OngletSessionsClasse } from './DashboardAdminShared';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` });

function _trancheDepuisNaissance(dateStr) {
  if (!dateStr) return null;
  const dn = new Date(dateStr);
  if (isNaN(dn.getTime())) return null;
  const age = Math.floor((Date.now() - dn.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age <= 12) return 'enfant';
  if (age <= 17) return 'adolescent';
  return 'adulte';
}

// ── Jours de la semaine disponibles ──────────────────────────────────────────
// ── Parcours Inscriptions E-Learning ─────────────────────────────────────────
const STATUT_PARCOURS = {
  recu:                { lib:'Reçu',               ic:'📥', bg:'#EFF6FF', txt:'#1D4ED8', next:'verifie'             },
  verifie:             { lib:'Vérifié',             ic:'✅', bg:'#F0FDF4', txt:'#15803D', next:'transmis_placement'  },
  transmis_placement:  { lib:'Transmis → Placement',ic:'🎯', bg:'#FEF3C7', txt:'#B45309', next:null                 },
  teste:               { lib:'Testé',               ic:'📝', bg:'#EDE9FE', txt:'#5B21B6', next:'assigne'            },
  assigne:             { lib:'Assigné → Classe',    ic:'🏫', bg:`#E0F2FE`, txt:'#0369A1', next:'actif'              },
  actif:               { lib:'Actif',               ic:'🟢', bg:'#D1FAE5', txt:'#065F46', next:null                 },
};

const SOURCE_PARCOURS_LIB = {
  entreprise_portail: '🏢 Portail entreprise',
  onboarding_manuel:  '✍️ Saisie manuelle',
  onboarding_excel:   '📊 Import Excel',
};

// ── Onboarding : Inscrire des bénéficiaires e-learning ───────────────────────
export function OngletInscriptionOnboarding() {
  const { couleurTheme } = useTheme();
  const [entreprises, setEntreprises] = useState([]);
  const [flash, setFlash]             = useState(null);
  const [saving, setSaving]           = useState(false);
  const [mode, setMode]               = useState('manuel'); // 'manuel' | 'excel'
  const [csvLignes, setCsvLignes]     = useState([]);
  const [nbImporte, setNbImporte]     = useState(null);
  // Doublons détectés à blanc - bloque l'import tant qu'ils ne sont pas corrigés/retirés.
  const [doublonsOnb,        setDoublonsOnb]        = useState([]);
  const [verifiantDoublonsOnb, setVerifiantDoublonsOnb] = useState(false);

  useEffect(() => {
    if (csvLignes.length === 0) { setDoublonsOnb([]); return; }
    let annule = false;
    setVerifiantDoublonsOnb(true);
    fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/verifier-doublons`, {
      method: 'POST', headers: _authHdrsAdmin(),
      body: JSON.stringify({ beneficiaires: csvLignes }),
    })
      .then(r => r.json())
      .then(d => { if (!annule) setDoublonsOnb(d.resultats || []); })
      .catch(() => { if (!annule) setDoublonsOnb([]); })
      .finally(() => { if (!annule) setVerifiantDoublonsOnb(false); });
    return () => { annule = true; };
  }, [csvLignes]); // eslint-disable-line react-hooks/exhaustive-deps

  function retirerLigneOnb(i) {
    setCsvLignes(ls => ls.filter((_, idx) => idx !== i));
  }

  const FORM0 = {
    entreprise_id:'', entreprise_nom:'', nom_complet:'', email:'', telephone:'', date_naissance:'',
    poste:'', departement:'', niveau_declare:'', notes_onboarding:'',
    // Enfant/ado/parent - déjà supportés par le backend (POST /api/inscriptions-elearning) et par
    // le mode Import fichier, mais jamais exposés jusqu'ici dans le formulaire "Saisie manuelle".
    profil_type:'adulte', etablissement:'', classe:'',
    prenom_parent:'', nom_parent:'', email_parent:'', telephone_parent:'',
  };
  const [form, setForm] = useState(FORM0);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/liste`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setEntreprises(d.entreprises || [])).catch(() => {});
  }, []);

  function showFlash(msg, err) {
    setFlash({ msg, err: !!err });
    if (err) toast.error(msg, { duration: 5000 });
    setTimeout(() => setFlash(null), 5000);
  }

  const [csvErreurOnb, setCsvErreurOnb] = useState(null);
  const [csvNomFichier, setCsvNomFichier] = useState(null);

  // Déduit le profil (adulte/adolescent/enfant) à partir de la date de naissance - plus fiable
  // que de deviner via la simple présence d'un contact parent (un ado peut avoir sa propre
  // adresse email et aucun contact parent renseigné, sans pour autant être un adulte).
  function trancheDepuisNaissance(dateStr) {
    if (!dateStr) return null;
    const dn = new Date(dateStr);
    if (isNaN(dn.getTime())) return null;
    const age = Math.floor((Date.now() - dn.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age <= 12) return 'enfant';
    if (age <= 17) return 'adolescent';
    return 'adulte';
  }

  function normaliserLigneOnb(obj) {
    const k = s => (s||'').toString().trim().toLowerCase()
      .normalize('NFD').replace(/[̀-͌]/g,'').replace(/[\s\-\/]/g,'_');
    const n = {};
    Object.entries(obj).forEach(([key, val]) => { n[k(key)] = val?.toString().trim()||''; });
    const CHAMPS_CONNUS = ['nom','prenom','nom_complet','email','telephone','email_parent','date_naissance','niveau_cecr_estime','niveau'];
    // si aucun champ connu trouvé c'est probablement une ligne de titre → on retourne null
    if (!CHAMPS_CONNUS.some(f => n[f] !== undefined && n[f] !== '')) return null;
    const emailEnfant  = n.email||n.email_enfant||n.email_apprenant||'';
    const telEnfant    = n.telephone||n.tel||n.telephone_enfant||'';
    const emailParent  = n.email_parent||n.emailparent||n.email_tuteur||'';
    const telParent    = n.telephone_parent||n.tel_parent||n.telparent||n.telephone_tuteur||'';
    const dateNaissance = n.date_naissance||n.datenaissance||'';
    return {
      nom_complet:        n.nom_complet || `${n.prenom||''} ${n.nom||''}`.trim(),
      // Pour enfant/ado sans email propre : on retombe sur celui du parent pour le contact.
      email:              emailEnfant || emailParent,
      telephone:          telEnfant   || telParent,
      date_naissance:     dateNaissance || null,
      poste:              n.poste||n.fonction||'',
      departement:        n.departement||n.service||'',
      langue:             n.langue||n.langue_apprise||'Anglais',
      niveau:             n.niveau_cecr||n.niveau_cecr_estime||n.niveau||'',
      niveau_cecr_estime: n.niveau_cecr||n.niveau_cecr_estime||n.niveau||null,
      classe:             n.classe||n.classe_scolaire||n.niveau_classe||null,
      prenom_parent:      n.prenom_parent||n.prenomparent||n.prenom_tuteur||null,
      nom_parent:         n.nom_parent||n.nomparent||n.nom_tuteur||null,
      email_parent:       emailParent || null,
      telephone_parent:   telParent || null,
      profil_type:        trancheDepuisNaissance(dateNaissance) || ((emailParent || n.prenom_parent || n.nom_parent) ? 'enfant' : 'adulte'),
      notes_onboarding:   n.etablissement ? `Établissement : ${n.etablissement}` : '',
    };
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCsvNomFichier(file.name);
    setCsvErreurOnb(null);
    setCsvLignes([]);
    e.target.value = '';

    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    const traiter = (rows) => {
      const lignes = rows.map(normaliserLigneOnb).filter(r => r && r.nom_complet.length > 1);
      if (!lignes.length) {
        setCsvErreurOnb('Aucun bénéficiaire valide. Vérifiez que les colonnes nom/prenom ou nom_complet sont présentes.');
        setCsvNomFichier(null);
      } else {
        setCsvLignes(lignes);
      }
    };

    if (ext === 'json') {
      reader.onload = ev => {
        try {
          const p = JSON.parse(ev.target.result);
          traiter(Array.isArray(p) ? p : p.beneficiaires || p.data || []);
        } catch { setCsvErreurOnb('Fichier JSON invalide.'); setCsvNomFichier(null); }
      };
      reader.readAsText(file, 'UTF-8');
    } else if (['xlsx','xls','ods','xlsm','xlsb'].includes(ext)) {
      reader.onload = ev => {
        try {
          const wb = XLSX_ADMIN.read(ev.target.result, { type:'array', cellDates:true });
          const CHAMPS = ['nom','prenom','nom_complet','email','telephone','email_parent','date_naissance','niveau_cecr_estime','niveau'];
          let ws = null;
          for (const name of wb.SheetNames) {
            const c = wb.Sheets[name];
            const preview = XLSX_ADMIN.utils.sheet_to_json(c, { header:1, defval:'' });
            if (preview.length > 1) { ws = c; break; }
          }
          if (!ws) throw new Error('vide');
          const rawRows = XLSX_ADMIN.utils.sheet_to_json(ws, { header:1, defval:'' });
          let hIdx = 0;
          for (let i = 0; i < Math.min(6, rawRows.length); i++) {
            const cells = rawRows[i].map(c => (c||'').toString().toLowerCase().trim().replace(/\s+/g,'_'));
            if (CHAMPS.some(f => cells.includes(f))) { hIdx = i; break; }
          }
          traiter(XLSX_ADMIN.utils.sheet_to_json(ws, { defval:'', range:hIdx }));
        } catch { setCsvErreurOnb('Impossible de lire ce fichier Excel.'); setCsvNomFichier(null); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = ev => {
        const texte = ev.target.result;
        const sep = texte.includes(';') ? ';' : texte.includes('\t') ? '\t' : ',';
        const lignes = texte.split('\n').map(l => l.trim().replace(/\r$/,'')).filter(Boolean);
        if (lignes.length < 2) { setCsvErreurOnb('Fichier vide ou sans données.'); setCsvNomFichier(null); return; }
        const headers = lignes[0].split(sep).map(h => h.replace(/^["']|["']$/g,'').trim());
        traiter(lignes.slice(1).map(line => {
          const vals = line.split(sep).map(v => v.replace(/^["']|["']$/g,'').trim());
          const obj = {}; headers.forEach((h,i) => { obj[h] = vals[i]||''; }); return obj;
        }));
      };
      reader.readAsText(file, 'UTF-8');
    }
  }

  async function soumettreManuellement(e) {
    e.preventDefault();
    if (!form.nom_complet.trim()) return showFlash('Nom complet requis', true);
    if (saving) return;
    setSaving(true);
    const entNom = entreprises.find(x => x.id === form.entreprise_id)?.nom || form.entreprise_nom || null;
    const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning`, {
      method: 'POST', headers: _authHdrsAdmin(),
      body: JSON.stringify({
        ...form,
        entreprise_nom: entNom,
        source: 'onboarding_manuel',
      }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) return showFlash(d.error || 'Erreur serveur', true);
    setForm(FORM0);
    showFlash(`✅ ${d.inscription.nom_complet} inscrit(e) avec succès. Visible dans l'onglet Parcours.`);
  }

  async function importerCSV() {
    if (csvLignes.length === 0) return showFlash('Aucune ligne à importer', true);
    if (saving) return;
    setSaving(true);
    const entNom = entreprises.find(x => x.id === form.entreprise_id)?.nom || form.entreprise_nom || null;
    const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/bulk`, {
      method: 'POST', headers: _authHdrsAdmin(),
      body: JSON.stringify({
        beneficiaires:  csvLignes,
        entreprise_id:  form.entreprise_id || null,
        entreprise_nom: entNom,
        source: 'onboarding_excel',
      }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) return showFlash(d.error || 'Erreur serveur', true);
    setNbImporte(d.count);
    setCsvLignes([]);
    showFlash(`✅ ${d.count} bénéficiaire(s) importé(s).${d.doublonsCount ? ` ${d.doublonsCount} doublon(s) déjà existant(s) ignoré(s).` : ''} Visibles dans l'onglet Parcours.`);
  }

  const inp = { width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy, boxSizing:'border-box', background:COULEURS.blanc };
  const lbl = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:5 };

  return (
    <>
      {flash && (
        <div style={{ background: flash.err ? '#FEF2F2' : '#D1FAE5', border:`1px solid ${flash.err ? '#FCA5A5' : '#6EE7B7'}`, borderRadius:10, padding:'12px 18px', marginBottom:20, fontSize:13, color: flash.err ? '#991B1B' : '#065F46', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>{flash.msg}</span>
          <button onClick={() => setFlash(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'inherit' }}>×</button>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>📝 Inscrire des bénéficiaires</div>
          <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>Les bénéficiaires inscrits ici apparaissent dans l'onglet <strong>Parcours</strong> pour validation et transmission.</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {[{ k:'manuel', l:'✍️ Saisie manuelle' }, { k:'excel', l:'📊 Import CSV/Excel' }].map(({ k, l }) => (
            <button key={k} onClick={() => setMode(k)}
              style={{ padding:'9px 16px', borderRadius:9, border:`1.5px solid ${mode===k ? couleurTheme : COULEURS.gris200}`, background: mode===k ? couleurTheme : COULEURS.blanc, color: mode===k ? '#fff' : COULEURS.navy, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Sélection entreprise (commune aux deux modes) */}
      <div style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, padding:'20px 24px', marginBottom:20 }}>
        <label style={lbl}>Entreprise concernée</label>
        <select style={inp} value={form.entreprise_id} onChange={e => {
          const ent = entreprises.find(x => x.id === e.target.value);
          setF('entreprise_id', e.target.value);
          setF('entreprise_nom', ent?.nom || '');
        }}>
          <option value="">- Sélectionner une entreprise -</option>
          {entreprises.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        {!form.entreprise_id && (
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <input placeholder="Ou saisir le nom d'entreprise manuellement…" style={{ ...inp, flex:1, marginTop:0 }}
              value={form.entreprise_nom} onChange={e => setF('entreprise_nom', e.target.value)} />
          </div>
        )}
      </div>

      {/* ── Mode manuel ── */}
      {mode === 'manuel' && (
        <form onSubmit={soumettreManuellement} style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, padding:'24px' }}>
          <div style={{ marginBottom:20 }}>
            <label style={lbl}>Profil du bénéficiaire</label>
            <div style={{ display:'flex', gap:6 }}>
              {[{ v:'adulte', l:'👤 Adulte' }, { v:'adolescent', l:'🧑 Adolescent' }, { v:'enfant', l:'🧒 Enfant' }].map(p => (
                <button key={p.v} type="button" onClick={() => setF('profil_type', p.v)}
                  style={{ padding:'8px 16px', borderRadius:20, fontSize:12, fontWeight: form.profil_type===p.v ? 700 : 500, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', border:`1.5px solid ${form.profil_type===p.v ? couleurTheme : COULEURS.gris200}`, background: form.profil_type===p.v ? couleurTheme : COULEURS.blanc, color: form.profil_type===p.v ? '#fff' : COULEURS.gris600 }}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
          {form.profil_type === 'adolescent' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
              <div>
                <label style={lbl}>Établissement scolaire</label>
                <input style={inp} value={form.etablissement} onChange={e => setF('etablissement', e.target.value)} placeholder="Lycée, Collège…" />
              </div>
            </div>
          )}
          {form.profil_type === 'enfant' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
              <div>
                <label style={lbl}>Classe</label>
                <select style={inp} value={form.classe} onChange={e => setF('classe', e.target.value)}>
                  <option value="">- Sélectionner -</option>
                  {['CP','CE1','CE2','CM1','CM2','6ème','5ème','4ème','3ème'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div>
              <label style={lbl}>Nom complet *</label>
              <input style={inp} value={form.nom_complet} onChange={e => setF('nom_complet', e.target.value)} placeholder="Koné Aminata" required />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input style={inp} type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="aminata.kone@entreprise.com" />
            </div>
            <div>
              <label style={lbl}>Téléphone</label>
              <input style={inp} value={form.telephone} onChange={e => setF('telephone', e.target.value)} placeholder="+225 07 00 00 00" />
            </div>
            <div>
              <label style={lbl}>Date de naissance</label>
              <input style={inp} type="date" value={form.date_naissance} onChange={e => setF('date_naissance', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Poste / Fonction</label>
              <input style={inp} value={form.poste} onChange={e => setF('poste', e.target.value)} placeholder="Responsable RH" />
            </div>
            <div>
              <label style={lbl}>Département</label>
              <input style={inp} value={form.departement} onChange={e => setF('departement', e.target.value)} placeholder="Ressources Humaines" />
            </div>
            <div>
              <label style={lbl}>Niveau déclaré</label>
              <select style={inp} value={form.niveau_declare} onChange={e => setF('niveau_declare', e.target.value)}>
                <option value="">- Inconnu -</option>
                {['Débutant absolu','A1','A2','B1','B2','C1','C2'].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {(form.profil_type === 'enfant' || form.profil_type === 'adolescent') && (
            <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'16px 18px', marginBottom:20, border:`1px solid ${COULEURS.gris200}` }}>
              <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12 }}>
                👨‍👩‍👧 Contact parent / tuteur
                {form.profil_type === 'adolescent' && <span style={{ fontSize:11, fontWeight:500, color:COULEURS.gris400, background:COULEURS.gris100, padding:'2px 8px', borderRadius:10, marginLeft:8 }}>Optionnel</span>}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div>
                  <label style={lbl}>Prénom du parent {form.profil_type === 'enfant' ? '*' : ''}</label>
                  <input style={inp} value={form.prenom_parent} onChange={e => setF('prenom_parent', e.target.value)} required={form.profil_type === 'enfant'} placeholder="Djeneba" />
                </div>
                <div>
                  <label style={lbl}>Nom du parent {form.profil_type === 'enfant' ? '*' : ''}</label>
                  <input style={inp} value={form.nom_parent} onChange={e => setF('nom_parent', e.target.value)} required={form.profil_type === 'enfant'} placeholder="Koné" />
                </div>
                <div>
                  <label style={lbl}>Email du parent {form.profil_type === 'enfant' ? '*' : ''}</label>
                  <input style={inp} type="email" value={form.email_parent} onChange={e => setF('email_parent', e.target.value)} required={form.profil_type === 'enfant'} placeholder="parent@email.com" />
                </div>
                <div>
                  <label style={lbl}>Téléphone du parent</label>
                  <input style={inp} value={form.telephone_parent} onChange={e => setF('telephone_parent', e.target.value)} placeholder="+225 07 00 00 00" />
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom:20 }}>
            <label style={lbl}>Notes pour l'Onboarding</label>
            <textarea style={{ ...inp, height:64, resize:'vertical' }} value={form.notes_onboarding} onChange={e => setF('notes_onboarding', e.target.value)} placeholder="Contexte particulier, urgence, disponibilités…" />
          </div>
          <button type="submit" disabled={saving}
            style={{ background: saving ? COULEURS.gris300 : couleurTheme, color:'#fff', border:'none', borderRadius:9, padding:'11px 28px', fontSize:13, fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            {saving ? 'Envoi en cours…' : '+ Inscrire ce bénéficiaire'}
          </button>
        </form>
      )}

      {/* ── Mode Import fichier ── */}
      {mode === 'excel' && (
        <div style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, padding:'24px' }}>

          {/* Info colonnes + modèle */}
          <div style={{ background:'#EFF6FF', borderRadius:10, padding:'14px 18px', marginBottom:16, fontSize:12, color:'#1D4ED8' }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>📋 Colonnes reconnues automatiquement :</div>
            <code style={{ fontSize:11, background:'#DBEAFE', padding:'3px 8px', borderRadius:4, display:'block', marginBottom:8 }}>
              nom · prenom · email · telephone · date_naissance · poste · departement · niveau_cecr_estime<br/>
              email_parent · telephone_parent · prenom_parent · nom_parent · etablissement · classe
            </code>
            <div style={{ fontSize:11, color:'#1E40AF' }}>
              💡 Utilisez le modèle Excel téléchargeable depuis le portail RH Entreprise - colonnes déjà nommées correctement.
            </div>
          </div>

          {/* Badges formats */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
            {[['📊','Excel .xlsx .xls','#EFF6FF','#1D4ED8'],['📄','CSV / TSV .csv .txt','#F0FDF4','#15803D'],['📋','LibreOffice .ods','#FFF7ED','#C2410C'],['{ }','JSON .json','#FAF5FF','#7C3AED']].map(([ic,label,bg,col])=>(
              <span key={label} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', background:bg, color:col, borderRadius:20, fontSize:11, fontWeight:600, border:`1px solid ${col}30` }}>{ic} {label}</span>
            ))}
          </div>

          {/* Zone de dépôt */}
          <label htmlFor="onb-file-input" style={{ display:'block', background: csvNomFichier ? '#F0FDF4' : csvErreurOnb ? '#FFF1F2' : COULEURS.gris50, border:`2px dashed ${csvNomFichier ? '#6EE7B7' : csvErreurOnb ? '#FDA4AF' : COULEURS.gris200}`, borderRadius:12, padding:'32px 20px', textAlign:'center', cursor:'pointer', marginBottom:16, transition:'all 0.2s' }}>
            <div style={{ fontSize:36, marginBottom:8 }}>{csvNomFichier ? '✅' : csvErreurOnb ? '❌' : '📂'}</div>
            {csvNomFichier && csvLignes.length > 0 ? (
              <>
                <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:2 }}>{csvNomFichier}</div>
                <div style={{ fontSize:12, color:COULEURS.succes, fontWeight:600 }}>{csvLignes.length} bénéficiaire{csvLignes.length>1?'s':''} détecté{csvLignes.length>1?'s':''}</div>
                <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>Cliquer pour choisir un autre fichier</div>
              </>
            ) : csvErreurOnb ? (
              <>
                <div style={{ fontSize:13, fontWeight:700, color:'#BE123C', marginBottom:4 }}>Erreur de lecture</div>
                <div style={{ fontSize:12, color:'#BE123C' }}>{csvErreurOnb}</div>
                <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:6 }}>Cliquer pour réessayer</div>
              </>
            ) : (
              <>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>Déposer votre fichier ici</div>
                <div style={{ fontSize:11, color:COULEURS.gris400 }}>ou cliquer pour choisir · Excel, CSV, ODS, JSON acceptés</div>
              </>
            )}
            <input id="onb-file-input" type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.xlsm,.xlsb,.ods,.json" style={{ display:'none' }} onChange={handleFile} />
          </label>

          {/* Alerte doublons */}
          {csvLignes.length > 0 && (verifiantDoublonsOnb ? (
            <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'10px 16px', marginBottom:14, fontSize:12, color:COULEURS.gris600 }}>
              ⏳ Vérification des doublons…
            </div>
          ) : doublonsOnb.some(d => d.doublon) && (
            <div style={{ background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:10, padding:'12px 16px', marginBottom:14, fontSize:12, color:'#991B1B' }}>
              ⚠️ <strong>{doublonsOnb.filter(d=>d.doublon).length} doublon(s) détecté(s)</strong> - corrigez ou retirez (✕) les lignes surlignées avant de continuer. L'import est bloqué tant qu'il en reste.
            </div>
          ))}

          {/* Aperçu tableau - doublons remontés en premier pour rester visibles dans les 15 lignes affichées */}
          {csvLignes.length > 0 && (
            <div style={{ background:COULEURS.gris50, borderRadius:10, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', marginBottom:16 }}>
              <div style={{ padding:'10px 16px', background:COULEURS.gris100, fontSize:11, fontWeight:700, color:COULEURS.gris600, display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1.4fr 30px' }}>
                <span>NOM COMPLET</span><span>EMAIL</span><span>TÉLÉPHONE</span><span>NIVEAU</span><span>POSTE / NOTES</span><span></span>
              </div>
              {csvLignes
                .map((l, i) => ({ l, i }))
                .sort((a, b) => (doublonsOnb.find(d=>d.index===b.i)?.doublon?1:0) - (doublonsOnb.find(d=>d.index===a.i)?.doublon?1:0))
                .slice(0, 15)
                .map(({ l, i }, pos) => {
                  const d = doublonsOnb.find(x => x.index === i);
                  const estDoublon = d?.doublon;
                  return (
                    <div key={i} style={{ padding:'8px 16px', fontSize:12, color:COULEURS.navy, borderTop:`1px solid ${COULEURS.gris100}`, display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1.4fr 30px', alignItems:'center', background: estDoublon ? '#FEF2F2' : pos%2===0?COULEURS.blanc:COULEURS.gris50 }}>
                      <span style={{ fontWeight:600 }}>
                        {l.nom_complet}
                        {estDoublon && <div style={{ fontSize:10, color:'#DC2626', fontWeight:700 }}>⚠️ {d.raison === 'deja_en_base' ? 'Déjà importé' : `Doublon ligne ${d.ligneOriginale}`}</div>}
                      </span>
                      <span style={{ color:COULEURS.gris600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.email||'-'}</span>
                      <span>{l.telephone||'-'}</span>
                      <span>{l.niveau ? <span style={{ background:'#EFF6FF', color:'#1D4ED8', padding:'1px 7px', borderRadius:8, fontWeight:700, fontSize:10 }}>{l.niveau}</span> : '-'}</span>
                      <span style={{ color:COULEURS.gris500, fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.poste || l.notes_onboarding || '-'}</span>
                      <button onClick={() => retirerLigneOnb(i)} title="Retirer cette ligne" style={{ background:'none', border:'none', color:'#DC2626', fontSize:13, cursor:'pointer', fontWeight:700 }}>✕</button>
                    </div>
                  );
                })}
              {csvLignes.length > 15 && (
                <div style={{ padding:'8px 16px', fontSize:11, color:COULEURS.gris400, borderTop:`1px solid ${COULEURS.gris100}`, textAlign:'center' }}>
                  + {csvLignes.length - 15} autres bénéficiaires non affichés
                </div>
              )}
            </div>
          )}

          {csvLignes.length > 0 && (
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <button onClick={importerCSV} disabled={saving || verifiantDoublonsOnb || doublonsOnb.some(d=>d.doublon)}
                title={doublonsOnb.some(d=>d.doublon) ? 'Corrigez ou retirez les doublons avant de continuer' : undefined}
                style={{ background: (saving || verifiantDoublonsOnb || doublonsOnb.some(d=>d.doublon)) ? COULEURS.gris300 : couleurTheme, color:'#fff', border:'none', borderRadius:9, padding:'11px 24px', fontSize:13, fontWeight:700, cursor: (saving || verifiantDoublonsOnb || doublonsOnb.some(d=>d.doublon)) ? 'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                {saving ? 'Importation…' : doublonsOnb.some(d=>d.doublon) ? '🚫 Doublons à corriger' : `📤 Valider et importer ${csvLignes.length} bénéficiaire(s)`}
              </button>
              <button onClick={() => { setCsvLignes([]); setCsvNomFichier(null); setCsvErreurOnb(null); }}
                style={{ background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:9, padding:'11px 18px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                Annuler
              </button>
            </div>
          )}

          {nbImporte !== null && (
            <div style={{ marginTop:16, background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#065F46' }}>
              ✅ {nbImporte} bénéficiaire(s) ajouté(s). Rendez-vous dans l'onglet <strong>Parcours</strong> pour valider et transmettre.
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function OngletParcoursInscriptions() {
  const { couleurTheme, couleurThemeFonce } = useTheme();

  const [inscriptions,   setInscriptions]   = useState([]);
  const [classes,        setClasses]        = useState([]);
  const [entreprises,    setEntreprises]    = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [flash,          setFlash]          = useState(null);
  const [filtreStatut,   setFiltreStatut]   = useState('');
  const [filtreEnt,      setFiltreEnt]      = useState('');
  const [recherche,      setRecherche]      = useState('');
  const [filtreDateDebut, setFiltreDateDebut] = useState('');
  const [filtreDateFin,   setFiltreDateFin]   = useState('');
  const [page,            setPage]            = useState(1);
  const PAR_PAGE = 20;
  const [selection,      setSelection]      = useState(new Set());
  const [tab,            setTab]            = useState('liste'); // 'liste' | 'excel'
  const [modalAjouter,   setModalAjouter]   = useState(false);
  const [modalDetail,    setModalDetail]    = useState(null);
  const [modalAssigner,  setModalAssigner]  = useState(null);
  // Rattrapage : lier a posteriori une inscription orpheline (importée sans entreprise) -
  // sans ça, impossible de lui assigner une classe d'entreprise.
  const [modalSupprimer, setModalSupprimer] = useState(null); // { mode:'single', id, nom } | { mode:'bulk', count }
  const [modalLierEnt,   setModalLierEnt]   = useState(null); // inscription en cours de rattachement
  const [entLierChoisie, setEntLierChoisie] = useState('');
  const [lierSaving,     setLierSaving]     = useState(false);
  async function confirmerLienEntreprise() {
    if (!modalLierEnt || !entLierChoisie || lierSaving) return;
    setLierSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/${modalLierEnt.id}/entreprise`, {
        method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ entreprise_id: entLierChoisie }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Échec du rattachement');
      setInscriptions(prev => prev.map(i => i.id === modalLierEnt.id ? { ...i, entreprise_id: d.inscription.entreprise_id, entreprise_nom: d.inscription.entreprise_nom } : i));
      setModalLierEnt(null);
      setFlash(`✅ ${modalLierEnt.nom_complet} rattaché(e) à ${d.inscription.entreprise_nom}.`);
      setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setFlash(`❌ ${e.message}`);
      setTimeout(() => setFlash(null), 4000);
    } finally {
      setLierSaving(false);
    }
  }
  const [classeChoisie,  setClasseChoisie]  = useState('');
  const [modeNouvelleClasse, setModeNouvelleClasse] = useState(false);
  const FORM_CL0 = { nom:'', niveau:'', type_cours:'en_ligne', date_debut:'', date_fin:'', capacite_max:10 };
  const [formClasse,     setFormClasse]     = useState(FORM_CL0);
  const [saving,         setSaving]         = useState(false);

  // Formulaire ajout manuel
  const FORM0 = { entreprise_id:'', entreprise_nom:'', nom_complet:'', email:'', telephone:'', poste:'', departement:'', langue_souhaitee:'Anglais', niveau_declare:'', notes_onboarding:'' };
  const [form, setForm] = useState(FORM0);
  const setF = (k,v) => setForm(f => ({...f,[k]:v}));

  // Import Excel - lignes parsées
  const [excelLignes,  setExcelLignes]  = useState([]);
  const [excelEntId,   setExcelEntId]   = useState('');
  const [excelEntNom,  setExcelEntNom]  = useState('');
  const [importResult, setImportResult] = useState(null);
  // Doublons détectés à blanc - bloque l'import tant qu'ils ne sont pas corrigés/retirés.
  const [doublonsExcel,        setDoublonsExcel]        = useState([]);
  const [verifiantDoublonsExcel, setVerifiantDoublonsExcel] = useState(false);

  useEffect(() => {
    if (excelLignes.length === 0) { setDoublonsExcel([]); return; }
    let annule = false;
    setVerifiantDoublonsExcel(true);
    fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/verifier-doublons`, {
      method: 'POST', headers: _authHdrsAdmin(),
      body: JSON.stringify({ beneficiaires: excelLignes }),
    })
      .then(r => r.json())
      .then(d => { if (!annule) setDoublonsExcel(d.resultats || []); })
      .catch(() => { if (!annule) setDoublonsExcel([]); })
      .finally(() => { if (!annule) setVerifiantDoublonsExcel(false); });
    return () => { annule = true; };
  }, [excelLignes]); // eslint-disable-line react-hooks/exhaustive-deps

  function retirerLigneExcel(i) {
    setExcelLignes(ls => ls.filter((_, idx) => idx !== i));
  }

  function charger() {
    setLoading(true);
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning`, { headers: _authHdrsAdmin() }),
      fetch(`${_API_URL_ADMIN}/api/classes-elearning`,       { headers: _authHdrsAdmin() }),
      fetch(`${_API_URL_ADMIN}/api/entreprise/admin/liste`,  { headers: _authHdrsAdmin() }),
    ]).then(async ([r1, r2, r3]) => {
      const d1 = await r1.json();
      if (d1.error) { setFlash({ msg: `Erreur API : ${d1.error}`, err: true }); }
      else setInscriptions(d1.inscriptions || []);
      const d2 = await r2.json(); setClasses(d2.classes || []);
      const d3 = await r3.json(); setEntreprises(d3.entreprises || d3 || []);
    }).catch(e => setFlash({ msg: `Erreur réseau : ${e.message}`, err: true }))
      .finally(() => setLoading(false));
  }
  useEffect(() => { charger(); }, []);
  useEffect(() => { setPage(1); }, [filtreStatut, filtreEnt, recherche, filtreDateDebut, filtreDateFin]);

  function showFlash(msg, err) {
    setFlash({ msg, err: !!err });
    if (err) toast.error(msg, { duration: 5000 });
    setTimeout(() => setFlash(null), 4000);
  }

  // ── Correction du dossier avant validation ───────────────────────────────
  // Un import (Excel/site/manuel) peut contenir une erreur de saisie (email,
  // nom, date de naissance…) - on corrige directement dans le modal détail
  // au lieu de retirer/réimporter tout le dossier.
  const CHAMPS_EDITABLES_PARCOURS = [
    'nom_complet', 'email', 'telephone', 'date_naissance', 'poste', 'departement',
    'langue_souhaitee', 'niveau_declare', 'classe',
    'prenom_parent', 'nom_parent', 'email_parent', 'telephone_parent',
  ];
  const [modeCorrection, setModeCorrection] = useState(false);
  const [formCorrection, setFormCorrection] = useState({});
  const [correctionSaving, setCorrectionSaving] = useState(false);

  function ouvrirCorrection() {
    const f = {};
    CHAMPS_EDITABLES_PARCOURS.forEach(c => { f[c] = modalDetail?.[c] || ''; });
    setFormCorrection(f);
    setModeCorrection(true);
  }

  async function enregistrerCorrection() {
    if (!modalDetail || correctionSaving) return;
    setCorrectionSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/${modalDetail.id}`, {
        method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify(formCorrection),
      });
      const d = await r.json();
      if (!r.ok) { showFlash(d.error || 'Échec de la correction', true); return; }
      setInscriptions(prev => prev.map(x => x.id === d.inscription.id ? d.inscription : x));
      setModalDetail(d.inscription);
      setModeCorrection(false);
      showFlash('✅ Dossier corrigé.');
    } catch (e) {
      showFlash(e.message, true);
    } finally {
      setCorrectionSaving(false);
    }
  }

  // ── Actions individuelles ────────────────────────────────────────────────
  async function valider(id) {
    if (saving) return;
    setSaving(true);
    const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/${id}/valider`, { method:'PATCH', headers:_authHdrsAdmin(), body:'{}' });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) return showFlash(d.error, true);
    setInscriptions(prev => prev.map(x => x.id === id ? d.inscription : x));
    showFlash('Inscription validée.');
  }

  async function transmettre(id) {
    if (saving) return;
    setSaving(true);
    const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/${id}/transmettre`, { method:'PATCH', headers:_authHdrsAdmin(), body:'{}' });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) return showFlash(d.error, true);
    setInscriptions(prev => prev.map(x => x.id === id ? d.inscription : x));
    showFlash('Transmis à l\'Agent Placement Test.');
  }

  async function assigner() {
    if (!classeChoisie || !modalAssigner || saving) return;
    setSaving(true);
    const classe = classes.find(c => c.id === classeChoisie);
    const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/${modalAssigner.id}/assigner`, {
      method:'PATCH', headers:_authHdrsAdmin(),
      body: JSON.stringify({ classe_id: classeChoisie, classe_nom: classe?.nom }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) return showFlash(d.error, true);
    setInscriptions(prev => prev.map(x => x.id === modalAssigner.id ? d.inscription : x));
    setModalAssigner(null); setClasseChoisie(''); setModeNouvelleClasse(false);
    showFlash(`${modalAssigner.nom_complet} assigné(e) à la classe "${classe?.nom}".`);
  }

  async function creerEtAssigner(e) {
    e.preventDefault();
    if (!formClasse.nom.trim() || !modalAssigner || saving) return;
    setSaving(true);
    // 1. Créer la classe
    const rc = await fetch(`${_API_URL_ADMIN}/api/classes-elearning`, {
      method:'POST', headers:_authHdrsAdmin(),
      body: JSON.stringify({
        ...formClasse,
        entreprise_id:  modalAssigner.entreprise_id || null,
        entreprise_nom: modalAssigner.entreprise_nom || null,
        niveau:         formClasse.niveau || modalAssigner.niveau_detecte || null,
      }),
    });
    const dc = await rc.json();
    if (!rc.ok) { setSaving(false); return showFlash(dc.error || 'Erreur création classe', true); }
    const nouvelleClasse = dc.classe;
    // 2. Assigner le bénéficiaire
    const ra = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/${modalAssigner.id}/assigner`, {
      method:'PATCH', headers:_authHdrsAdmin(),
      body: JSON.stringify({ classe_id: nouvelleClasse.id, classe_nom: nouvelleClasse.nom }),
    });
    const da = await ra.json();
    setSaving(false);
    if (!ra.ok) return showFlash(da.error, true);
    setInscriptions(prev => prev.map(x => x.id === modalAssigner.id ? da.inscription : x));
    setClasses(prev => [{ ...nouvelleClasse, nb_apprenants: 1 }, ...prev]);
    setModalAssigner(null); setClasseChoisie(''); setModeNouvelleClasse(false); setFormClasse(FORM_CL0);
    showFlash(`Classe "${nouvelleClasse.nom}" créée et ${modalAssigner.nom_complet} assigné(e).`);
  }

  async function supprimer(id, nom) {
    setModalSupprimer({ mode: 'single', id, nom });
  }

  // ── Actions groupées ─────────────────────────────────────────────────────
  function supprimerSelection() {
    if (selection.size === 0) return;
    const dejaAssignes = inscriptions.filter(x => selection.has(x.id) && !['recu', 'verifie'].includes(x.statut)).length;
    setModalSupprimer({ mode: 'bulk', count: selection.size, dejaAssignes });
  }

  async function confirmerSuppression() {
    if (!modalSupprimer || saving) return;
    setSaving(true);
    if (modalSupprimer.mode === 'single') {
      const { id, nom } = modalSupprimer;
      const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/${id}`, { method:'DELETE', headers:_authHdrsAdmin() });
      const d = await r.json();
      setSaving(false);
      if (!r.ok) { setModalSupprimer(null); return showFlash(d.error, true); }
      setInscriptions(prev => prev.filter(x => x.id !== id));
      setSelection(s => { const n = new Set(s); n.delete(id); return n; });
      showFlash(`"${nom}" retiré(e) de la liste.`);
    } else {
      const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/bulk-supprimer`, {
        method:'PATCH', headers:_authHdrsAdmin(),
        body: JSON.stringify({ ids: [...selection] }),
      });
      const d = await r.json();
      setSaving(false);
      if (!r.ok) { setModalSupprimer(null); return showFlash(d.error, true); }
      // Seuls les dossiers non assignés à une classe ont réellement été supprimés côté serveur.
      setInscriptions(prev => prev.filter(x => !(selection.has(x.id) && ['recu', 'verifie'].includes(x.statut))));
      showFlash(`${d.count} dossier(s) retiré(s) de la liste.${d.bloques ? ` ${d.bloques} déjà assigné(s) à une classe, non retiré(s).` : ''}`);
      setSelection(new Set());
    }
    setModalSupprimer(null);
  }

  async function validerSelection() {
    if (selection.size === 0 || saving) return;
    setSaving(true);
    const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/bulk-valider`, {
      method:'PATCH', headers:_authHdrsAdmin(),
      body: JSON.stringify({ ids: [...selection] }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) return showFlash(d.error, true);
    setInscriptions(prev => {
      const map = Object.fromEntries((d.inscriptions||[]).map(x => [x.id, x]));
      return prev.map(x => map[x.id] || x);
    });
    setSelection(new Set());
    showFlash(`${d.count} inscription(s) validée(s).`);
  }

  // ── Ajout manuel ──────────────────────────────────────────────────────────
  async function ajouterManuel(e) {
    if (e) e.preventDefault();
    if (!form.nom_complet.trim()) return showFlash('Nom complet requis', true);
    if (saving) return;
    setSaving(true);
    const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning`, {
      method:'POST', headers:_authHdrsAdmin(),
      body: JSON.stringify({ ...form, source:'onboarding_manuel' }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) return showFlash(d.error, true);
    setInscriptions(prev => [d.inscription, ...prev]);
    setForm(FORM0);
    setModalAjouter(false);
    showFlash(`${d.inscription.nom_complet} ajouté(e).`);
  }

  // ── Import Excel (CSV simple) ─────────────────────────────────────────────
  function parseCSV(text) {
    const lignes = text.trim().split('\n');
    if (lignes.length < 2) return [];
    const sep = lignes[0].includes(';') ? ';' : lignes[0].includes('\t') ? '\t' : ',';
    const headers = lignes[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g,''));
    return lignes.slice(1).map(l => {
      const vals = l.split(sep).map(v => v.trim().replace(/"/g,''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      const emailParent = obj['email_parent'] || obj['emailparent'] || obj['email_tuteur'] || '';
      const telParent   = obj['telephone_parent'] || obj['tel_parent'] || obj['telparent'] || '';
      const emailApp    = obj['email'] || obj['email_enfant'] || obj['email_apprenant'] || '';
      const telApp      = obj['telephone'] || obj['tel'] || obj['telephone_enfant'] || '';
      const dateNaissance = obj['date_naissance'] || obj['datenaissance'] || obj['naissance'] || '';
      return {
        nom_complet:        obj['nom_complet'] || obj['nom complet'] || `${obj['prenom']||''} ${obj['nom']||''}`.trim(),
        // Pour enfant/ado sans email propre : on retombe sur celui du parent pour le contact.
        email:              emailApp || emailParent || '',
        telephone:          telApp   || telParent   || '',
        poste:              obj['poste']     || obj['fonction'] || '',
        departement:        obj['departement'] || obj['département'] || '',
        langue:             obj['langue']    || 'Anglais',
        niveau:             obj['niveau_cecr'] || obj['niveau_cecr_estime'] || obj['niveau'] || '',
        niveau_cecr_estime: obj['niveau_cecr'] || obj['niveau_cecr_estime'] || obj['niveau'] || null,
        date_naissance:     dateNaissance || null,
        classe:             obj['classe'] || obj['classe_scolaire'] || null,
        prenom_parent:      obj['prenom_parent'] || obj['prenomparent'] || null,
        nom_parent:         obj['nom_parent']    || obj['nomparent']    || null,
        email_parent:       emailParent || null,
        telephone_parent:   telParent   || null,
        profil_type:        _trancheDepuisNaissance(dateNaissance) || ((emailParent || obj['prenom_parent'] || obj['nom_parent']) ? 'enfant' : 'adulte'),
      };
    }).filter(r => r.nom_complet.length > 0);
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setExcelLignes(parseCSV(ev.target.result));
    reader.readAsText(file, 'UTF-8');
  }

  async function importerExcel() {
    if (excelLignes.length === 0) return showFlash('Aucune ligne à importer', true);
    if (saving) return;
    setSaving(true);
    const entNom = entreprises.find(e => e.id === excelEntId)?.nom || excelEntNom;
    const r = await fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning/bulk`, {
      method:'POST', headers:_authHdrsAdmin(),
      body: JSON.stringify({ beneficiaires: excelLignes, entreprise_id: excelEntId||null, entreprise_nom: entNom||null, source:'onboarding_excel' }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) return showFlash(d.error, true);
    setImportResult(d);
    setInscriptions(prev => [...(d.inscriptions||[]), ...prev]);
    setExcelLignes([]); setExcelEntId(''); setExcelEntNom('');
  }

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const liste = inscriptions.filter(x => {
    if (filtreStatut && x.statut !== filtreStatut) return false;
    if (filtreEnt   && x.entreprise_id !== filtreEnt) return false;
    if (filtreDateDebut && (!x.created_at || x.created_at.slice(0,10) < filtreDateDebut)) return false;
    if (filtreDateFin   && (!x.created_at || x.created_at.slice(0,10) > filtreDateFin))   return false;
    if (recherche) {
      const q = recherche.toLowerCase();
      if (!`${x.nom_complet} ${x.email||''} ${x.entreprise_nom||''} ${x.poste||''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const nbPages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  const pageSure = Math.min(page, nbPages);
  const listeAffichee = liste.slice((pageSure - 1) * PAR_PAGE, pageSure * PAR_PAGE);

  const stats = inscriptions.reduce((acc, x) => { acc[x.statut] = (acc[x.statut]||0)+1; return acc; }, {});
  const nbEntreprises = [...new Set(inscriptions.map(x=>x.entreprise_nom).filter(Boolean))].length;
  const tousSelectionnes = listeAffichee.length > 0 && listeAffichee.every(x => selection.has(x.id));
  const inp = { padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy, background:COULEURS.blanc, boxSizing:'border-box' };
  const lbl = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:5 };

  return (
    <>
      {/* Flash */}
      {flash && (
        <div style={{ background: flash.err ? '#FEF2F2' : '#D1FAE5', border:`1px solid ${flash.err ? '#FCA5A5' : '#6EE7B7'}`, borderRadius:10, padding:'11px 18px', marginBottom:18, fontSize:13, color: flash.err ? '#991B1B' : '#065F46', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>{flash.err ? '⚠️' : '✅'} {flash.msg}</span>
          <button onClick={() => setFlash(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'inherit' }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>📋 Parcours Inscriptions</div>
          <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>
            {inscriptions.length} dossier{inscriptions.length!==1?'s':''} reçus · {nbEntreprises} entreprise{nbEntreprises!==1?'s':''}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setTab(tab==='excel' ? 'liste' : 'excel')}
            style={{ padding:'9px 16px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background: tab==='excel' ? COULEURS.navy : COULEURS.blanc, color: tab==='excel' ? '#fff' : COULEURS.navy, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            📊 Import Excel
          </button>
          <button onClick={() => { setForm(FORM0); setModalAjouter(true); }}
            style={{ padding:'9px 16px', borderRadius:9, border:'none', background:couleurTheme, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            + Ajouter manuellement
          </button>
        </div>
      </div>

      {/* KPIs pipeline */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {Object.entries(STATUT_PARCOURS).map(([key, cfg]) => (
          <div key={key} onClick={() => setFiltreStatut(filtreStatut===key ? '' : key)}
            style={{ flex:'1 1 120px', background: filtreStatut===key ? cfg.bg : COULEURS.blanc, border:`1.5px solid ${filtreStatut===key ? cfg.txt+'60' : COULEURS.gris200}`, borderRadius:10, padding:'10px 14px', cursor:'pointer', transition:'all 0.15s' }}>
            <div style={{ fontSize:18, marginBottom:3 }}>{cfg.ic}</div>
            <div style={{ fontSize:18, fontWeight:800, color:cfg.txt }}>{stats[key]||0}</div>
            <div style={{ fontSize:10, color:COULEURS.gris600, fontWeight:600, lineHeight:1.3 }}>{cfg.lib}</div>
          </div>
        ))}
      </div>

      {/* ── Import Excel ── */}
      {tab === 'excel' && (
        <div style={{ background:COULEURS.blanc, borderRadius:14, border:`1px solid ${COULEURS.gris200}`, padding:'22px 24px', marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:800, color:COULEURS.navy, marginBottom:16 }}>📊 Import depuis Excel / CSV</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            <div>
              <label style={lbl}>Entreprise</label>
              <select style={{ ...inp, width:'100%' }} value={excelEntId} onChange={e => { const ent=entreprises.find(x=>x.id===e.target.value); setExcelEntId(e.target.value); setExcelEntNom(ent?.nom||''); }}>
                <option value=''>- Sélectionner -</option>
                {entreprises.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Fichier CSV / Excel exporté en CSV</label>
              <input type='file' accept='.csv,.txt' onChange={handleFileChange}
                style={{ display:'block', fontSize:12, marginTop:4 }} />
            </div>
          </div>
          <div style={{ background:COULEURS.gris50, borderRadius:9, padding:'10px 14px', fontSize:11, color:COULEURS.gris600, marginBottom:16, lineHeight:1.7 }}>
            <strong>Format attendu (CSV) :</strong> colonnes <code>nom_complet</code>, <code>email</code>, <code>telephone</code>, <code>poste</code>, <code>departement</code>, <code>langue</code>, <code>niveau</code>
          </div>
          {excelLignes.length > 0 && (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>
                {excelLignes.length} bénéficiaire{excelLignes.length>1?'s':''} détecté{excelLignes.length>1?'s':''}
              </div>
              {verifiantDoublonsExcel ? (
                <div style={{ background:COULEURS.gris50, borderRadius:9, padding:'10px 14px', marginBottom:14, fontSize:12, color:COULEURS.gris600 }}>
                  ⏳ Vérification des doublons…
                </div>
              ) : doublonsExcel.some(d => d.doublon) && (
                <div style={{ background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:9, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#991B1B' }}>
                  ⚠️ <strong>{doublonsExcel.filter(d=>d.doublon).length} doublon(s) détecté(s)</strong> - corrigez ou retirez (✕) les lignes surlignées avant de continuer. L'import est bloqué tant qu'il en reste.
                </div>
              )}
              <div style={{ maxHeight:220, overflowY:'auto', border:`1px solid ${COULEURS.gris200}`, borderRadius:9, marginBottom:14 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:COULEURS.gris50 }}>
                      {['Nom complet','Email','Tél','Poste','Langue','Niveau',''].map(h => (
                        <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontWeight:700, color:COULEURS.gris600, fontSize:10, textTransform:'uppercase', borderBottom:`1px solid ${COULEURS.gris200}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelLignes
                      .map((l, i) => ({ l, i }))
                      .sort((a, b) => (doublonsExcel.find(d=>d.index===b.i)?.doublon?1:0) - (doublonsExcel.find(d=>d.index===a.i)?.doublon?1:0))
                      .slice(0,50)
                      .map(({ l, i }) => {
                        const d = doublonsExcel.find(x => x.index === i);
                        const estDoublon = d?.doublon;
                        return (
                          <tr key={i} style={{ borderBottom:`1px solid ${COULEURS.gris100}`, background: estDoublon ? '#FEF2F2' : 'transparent' }}>
                            <td style={{ padding:'6px 12px', fontWeight:600 }}>
                              {l.nom_complet}
                              {estDoublon && <div style={{ fontSize:10, color:'#DC2626', fontWeight:700 }}>⚠️ {d.raison === 'deja_en_base' ? 'Déjà importé' : `Doublon ligne ${d.ligneOriginale}`}</div>}
                            </td>
                            <td style={{ padding:'6px 12px', color:COULEURS.gris600 }}>{l.email||'-'}</td>
                            <td style={{ padding:'6px 12px', color:COULEURS.gris600 }}>{l.telephone||'-'}</td>
                            <td style={{ padding:'6px 12px', color:COULEURS.gris600 }}>{l.poste||'-'}</td>
                            <td style={{ padding:'6px 12px' }}>{l.langue||'Anglais'}</td>
                            <td style={{ padding:'6px 12px' }}>{l.niveau||'-'}</td>
                            <td style={{ padding:'6px 12px' }}>
                              <button onClick={() => retirerLigneExcel(i)} title="Retirer cette ligne" style={{ background:'none', border:'none', color:'#DC2626', fontSize:13, cursor:'pointer', fontWeight:700 }}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    {excelLignes.length > 50 && (
                      <tr><td colSpan={7} style={{ padding:'8px 12px', color:COULEURS.gris400, fontSize:11, textAlign:'center' }}>…{excelLignes.length-50} lignes supplémentaires</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button onClick={importerExcel} disabled={saving || verifiantDoublonsExcel || doublonsExcel.some(d=>d.doublon)}
                title={doublonsExcel.some(d=>d.doublon) ? 'Corrigez ou retirez les doublons avant de continuer' : undefined}
                style={{ padding:'10px 24px', borderRadius:9, border:'none', background: (saving || verifiantDoublonsExcel || doublonsExcel.some(d=>d.doublon)) ? COULEURS.gris200 : couleurTheme, color:'#fff', fontWeight:700, fontSize:13, cursor: (saving || verifiantDoublonsExcel || doublonsExcel.some(d=>d.doublon))?'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                {saving ? '⏳ Import…' : doublonsExcel.some(d=>d.doublon) ? '🚫 Doublons à corriger' : `✅ Importer ${excelLignes.length} bénéficiaire${excelLignes.length>1?'s':''}`}
              </button>
            </>
          )}
          {importResult && (
            <div style={{ marginTop:14, background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:8, padding:'10px 16px', fontSize:13, color:'#065F46' }}>
              ✅ {importResult.count} dossier{importResult.count>1?'s':''} importé{importResult.count>1?'s':''}.{importResult.doublonsCount ? ` ${importResult.doublonsCount} doublon${importResult.doublonsCount>1?'s':''} déjà existant${importResult.doublonsCount>1?'s':''} ignoré${importResult.doublonsCount>1?'s':''}.` : ''} Ils apparaissent dans la liste.
              <button onClick={() => { setImportResult(null); setTab('liste'); }} style={{ marginLeft:12, background:'none', border:'none', cursor:'pointer', color:'#065F46', fontWeight:700 }}>Voir la liste →</button>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ajout manuel ── */}
      {modalAjouter && (
        <>
          <div onClick={() => setModalAjouter(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:2000 }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(95vw,640px)', maxHeight:'90vh', overflowY:'auto', background:COULEURS.blanc, borderRadius:18, zIndex:2001, boxShadow:'0 24px 64px rgba(0,0,0,0.22)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            {/* Header */}
            <div style={{ background:`linear-gradient(135deg,${couleurTheme},${couleurThemeFonce})`, borderRadius:'18px 18px 0 0', padding:'18px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>✍️ Saisie manuelle</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>Ajouter un bénéficiaire au parcours</div>
              </div>
              <button onClick={() => setModalAjouter(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
            {/* Corps */}
            <form onSubmit={ajouterManuel} style={{ padding:'22px 24px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                <div>
                  <label style={lbl}>Entreprise</label>
                  <select style={{ ...inp, width:'100%' }} value={form.entreprise_id}
                    onChange={e => { const ent=entreprises.find(x=>x.id===e.target.value); setF('entreprise_id',e.target.value); setF('entreprise_nom',ent?.nom||''); }}>
                    <option value=''>- Aucune / Particulier -</option>
                    {entreprises.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Nom complet *</label>
                  <input style={{ ...inp, width:'100%' }} placeholder='Prénom Nom' required value={form.nom_complet} onChange={e => setF('nom_complet', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input style={{ ...inp, width:'100%' }} type='email' placeholder='email@entreprise.com' value={form.email} onChange={e => setF('email', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Téléphone</label>
                  <input style={{ ...inp, width:'100%' }} placeholder='+225 07 00 00 00' value={form.telephone} onChange={e => setF('telephone', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Poste / Fonction</label>
                  <input style={{ ...inp, width:'100%' }} placeholder='Ex : Responsable commercial' value={form.poste} onChange={e => setF('poste', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Département</label>
                  <input style={{ ...inp, width:'100%' }} placeholder='Ex : Marketing' value={form.departement} onChange={e => setF('departement', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Langue souhaitée</label>
                  <select style={{ ...inp, width:'100%' }} value={form.langue_souhaitee} onChange={e => setF('langue_souhaitee', e.target.value)}>
                    {['Anglais','Français','Espagnol','Allemand','Arabe','Chinois'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Niveau déclaré (optionnel)</label>
                  <select style={{ ...inp, width:'100%' }} value={form.niveau_declare} onChange={e => setF('niveau_declare', e.target.value)}>
                    <option value=''>- Non renseigné -</option>
                    {['A0','A1','A2','B1','B2','C1','C2'].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={lbl}>Notes onboarding</label>
                <textarea style={{ ...inp, width:'100%', minHeight:70, resize:'vertical' }} placeholder='Observations, contraintes horaires, objectifs…' value={form.notes_onboarding} onChange={e => setF('notes_onboarding', e.target.value)} />
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type='button' onClick={() => setModalAjouter(false)} style={{ padding:'10px 20px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>Annuler</button>
                <button type='submit' disabled={saving} style={{ padding:'10px 24px', borderRadius:9, border:'none', background:saving?COULEURS.gris300:couleurTheme, color:'#fff', fontWeight:700, fontSize:13, cursor:saving?'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  {saving ? '⏳ Ajout…' : '✅ Ajouter le bénéficiaire'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Filtres ── */}
      {tab === 'liste' && (
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
          <input style={{ ...inp, flex:1, minWidth:200 }} placeholder='🔍 Nom, email, entreprise, poste…'
            value={recherche} onChange={e => setRecherche(e.target.value)} />
          <select style={inp} value={filtreEnt} onChange={e => setFiltreEnt(e.target.value)}>
            <option value=''>Toutes entreprises</option>
            {[...new Set(inscriptions.map(x=>x.entreprise_id).filter(Boolean))].map(id => {
              const nom = inscriptions.find(x=>x.entreprise_id===id)?.entreprise_nom || id;
              return <option key={id} value={id}>{nom}</option>;
            })}
          </select>
          <input type='date' style={inp} value={filtreDateDebut} onChange={e => setFiltreDateDebut(e.target.value)} title='Date de début' />
          <input type='date' style={inp} value={filtreDateFin} onChange={e => setFiltreDateFin(e.target.value)} title='Date de fin' />
          {(filtreDateDebut || filtreDateFin) && (
            <button onClick={() => { setFiltreDateDebut(''); setFiltreDateFin(''); }}
              style={{ ...inp, cursor:'pointer', fontWeight:600, color:COULEURS.gris600 }}>
              ✕ Dates
            </button>
          )}
          {selection.size > 0 && (
            <>
              <button onClick={validerSelection} disabled={saving}
                style={{ padding:'8px 16px', borderRadius:8, border:'none', background:COULEURS.succes, color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                ✅ Valider {selection.size} sélectionné{selection.size>1?'s':''}
              </button>
              <button onClick={supprimerSelection} disabled={saving}
                style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #DC2626', background:'#fff', color:'#DC2626', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                🗑 Retirer {selection.size} sélectionné{selection.size>1?'s':''}
              </button>
            </>
          )}
          <button onClick={charger} style={{ ...inp, cursor:'pointer', fontWeight:600, color:COULEURS.gris600 }}>↻</button>
        </div>
      )}

      {/* ── Tableau principal ── */}
      {tab === 'liste' && (loading ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:COULEURS.gris400 }}>Chargement…</div>
      ) : liste.length === 0 ? (
        <div style={{ background:COULEURS.blanc, borderRadius:14, padding:'48px 32px', border:`2px dashed ${COULEURS.gris200}`, textAlign:'center' }}>
          <div style={{ fontSize:44, marginBottom:10 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>
            {filtreStatut || filtreEnt || recherche || filtreDateDebut || filtreDateFin ? 'Aucun dossier ne correspond aux filtres' : 'Aucun dossier reçu pour l\'instant'}
          </div>
          <div style={{ fontSize:13, color:COULEURS.gris600 }}>Les inscriptions envoyées par les entreprises apparaîtront ici.</div>
        </div>
      ) : (
        <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          {/* En-tête */}
          <div style={{ display:'grid', gridTemplateColumns:'30px 2.5fr 1.5fr 1.2fr 1fr 1.2fr 1fr 170px', padding:'10px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', alignItems:'center' }}>
            <input type='checkbox' checked={tousSelectionnes} onChange={() => {
              if (tousSelectionnes) setSelection(new Set());
              else setSelection(new Set(listeAffichee.map(x=>x.id)));
            }} style={{ cursor:'pointer', accentColor:couleurTheme }} />
            <span>Bénéficiaire</span><span>Entreprise</span><span>Poste</span><span>Langue</span><span>Statut</span><span>Source</span><span>Actions</span>
          </div>

          {listeAffichee.map((x, i) => {
            const scfg = STATUT_PARCOURS[x.statut] || STATUT_PARCOURS.recu;
            const sel  = selection.has(x.id);
            return (
              <div key={x.id}
                style={{ display:'grid', gridTemplateColumns:'30px 2.5fr 1.5fr 1.2fr 1fr 1.2fr 1fr 170px', padding:'12px 16px', borderBottom: i < listeAffichee.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: sel ? `${couleurTheme}06` : 'transparent', transition:'background 0.1s' }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background=COULEURS.gris50; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background='transparent'; }}>

                <input type='checkbox' checked={sel} onChange={() => setSelection(s => { const n=new Set(s); sel?n.delete(x.id):n.add(x.id); return n; })}
                  style={{ cursor:'pointer', accentColor:couleurTheme }} />

                {/* Bénéficiaire */}
                <div style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:8 }} onClick={() => setModalDetail(x)}>
                  {x.avatar_url ? (
                    <img src={x.avatar_url} alt="" style={{ width:26, height:26, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} onError={e => { e.target.style.display='none'; }} />
                  ) : (
                    <div style={{ width:26, height:26, borderRadius:'50%', background:`${couleurTheme}18`, color:couleurThemeFonce, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, flexShrink:0 }}>
                      {(x.nom_complet || '?').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight:700, color:COULEURS.navy }}>{x.nom_complet}</div>
                    <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:1 }}>{x.email || x.telephone || '-'}</div>
                  </div>
                </div>

                {/* Entreprise */}
                <div style={{ fontSize:11, color:COULEURS.navy, fontWeight:600 }}>
                  {x.entreprise_nom
                    ? <><span style={{marginRight:3}}>🏢</span>{x.entreprise_nom}</>
                    : (
                      <span
                        onClick={() => { setModalLierEnt(x); setEntLierChoisie(''); }}
                        title="Rattacher cette inscription à une entreprise"
                        style={{ color:'#B45309', cursor:'pointer', textDecoration:'underline dotted', fontWeight:600 }}
                      >
                        🔗 Lier une entreprise
                      </span>
                    )}
                </div>

                {/* Poste */}
                <div style={{ fontSize:11, color:COULEURS.gris600 }}>{x.poste || '-'}</div>

                {/* Langue */}
                <div style={{ fontSize:11, color:COULEURS.gris600 }}>{x.langue_souhaitee || '-'}</div>

                {/* Statut */}
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:6, background:scfg.bg, color:scfg.txt, fontSize:10, fontWeight:700, width:'fit-content' }}>
                  {scfg.ic} {scfg.lib}
                </span>

                {/* Source */}
                <div style={{ fontSize:10, color:COULEURS.gris600 }}>{SOURCE_PARCOURS_LIB[x.source] || x.source}</div>

                {/* Actions selon statut */}
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {x.statut === 'recu' && (
                    <button onClick={() => valider(x.id)} disabled={saving}
                      style={{ padding:'4px 9px', borderRadius:6, border:'none', background:'#10B981', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      ✅ Valider
                    </button>
                  )}
                  {x.statut === 'verifie' && (
                    <button onClick={() => transmettre(x.id)} disabled={saving}
                      style={{ padding:'4px 9px', borderRadius:6, border:'none', background:'#F59E0B', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      🎯 → Placement
                    </button>
                  )}
                  {x.statut === 'teste' && (
                    <button onClick={() => { setModalAssigner(x); setClasseChoisie(''); }}
                      style={{ padding:'4px 9px', borderRadius:6, border:'none', background:couleurTheme, color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      🏫 Assigner
                    </button>
                  )}
                  <button onClick={() => setModalDetail(x)}
                    style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                    👁
                  </button>
                  {!['recu', 'verifie'].includes(x.statut) ? (
                    <span title="Déjà transmis à l'Agent Placement (ou assigné) - impossible de retirer ce dossier"
                      style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, color:COULEURS.gris400, fontSize:10, cursor:'not-allowed' }}>
                      🔒
                    </span>
                  ) : (
                    <button onClick={() => supprimer(x.id, x.nom_complet)} title="Retirer de la liste"
                      style={{ padding:'4px 9px', borderRadius:6, border:`1px solid #FCA5A5`, background:COULEURS.blanc, color:'#DC2626', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <PaginationSimple total={liste.length} parPage={PAR_PAGE} page={pageSure} onChange={setPage} />
        </div>
      ))}

      {/* ── Modal détail ── */}
      {modalDetail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200, padding:'24px 16px', backdropFilter:'blur(2px)' }}
          onClick={() => { setModalDetail(null); setModeCorrection(false); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', height:'90vh', maxWidth:'96vw', maxHeight:'96vh', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', display:'flex', flexDirection:'column', overflow:'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background:`linear-gradient(135deg,${couleurTheme},${couleurThemeFonce})`, padding:'18px 24px', borderRadius:'18px 18px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {modalDetail.avatar_url ? (
                  <img src={modalDetail.avatar_url} alt="" style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:'2px solid rgba(255,255,255,0.4)' }} onError={e => { e.target.style.display='none'; }} />
                ) : (
                  <div style={{ width:44, height:44, borderRadius:'50%', background:'rgba(255,255,255,0.2)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, flexShrink:0 }}>
                    {(modalDetail.nom_complet || '?').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{modalDetail.nom_complet}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>{modalDetail.entreprise_nom || 'Particulier'} · {modalDetail.poste || '-'}</div>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {!modeCorrection && (
                  <button onClick={ouvrirCorrection} style={{ background:'rgba(255,255,255,0.18)', border:'none', borderRadius:7, padding:'7px 14px', cursor:'pointer', color:'#fff', fontSize:12, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                    ✏️ Corriger le dossier
                  </button>
                )}
                <button onClick={() => { setModalDetail(null); setModeCorrection(false); }} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:7, width:30, height:30, cursor:'pointer', color:'#fff', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
              </div>
            </div>
            <div style={{ padding:'20px 24px', flex:1, overflowY:'auto' }}>
              {modeCorrection ? (() => {
                const estMineur = modalDetail.profil_type === 'enfant' || modalDetail.profil_type === 'adolescent';
                const setC = (k, v) => setFormCorrection(f => ({ ...f, [k]: v }));
                const champ = (label, key, type = 'text') => (
                  <div key={key} style={{ marginBottom:12 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>{label}</label>
                    <input
                      type={type}
                      value={formCorrection[key] || ''}
                      onChange={e => setC(key, e.target.value)}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box' }}
                    />
                  </div>
                );
                const section = (titre) => (
                  <div style={{ fontSize:11, fontWeight:800, color:couleurThemeFonce, textTransform:'uppercase', letterSpacing:'0.06em', margin:'18px 0 6px', ...(titre==='Bénéficiaire' && { marginTop:0 }) }}>{titre}</div>
                );
                return (
                  <>
                    <div style={{ marginBottom:14, background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#92400E' }}>
                      ✏️ Corrige les champs erronés puis enregistre - le statut et l'historique du dossier ne sont pas modifiés ici.
                    </div>
                    {section('Bénéficiaire')}
                    {champ('Nom complet', 'nom_complet')}
                    {champ('Date de naissance', 'date_naissance', 'date')}
                    {champ('Email (propre)', 'email', 'email')}
                    {champ('Téléphone (propre)', 'telephone')}
                    {champ('Poste', 'poste')}
                    {champ('Département', 'departement')}
                    {champ('Langue souhaitée', 'langue_souhaitee')}

                    {estMineur && <>
                      {section('Contact parent / tuteur')}
                      {champ('Prénom du parent', 'prenom_parent')}
                      {champ('Nom du parent', 'nom_parent')}
                      {champ('Email du parent', 'email_parent', 'email')}
                      {champ('Téléphone du parent', 'telephone_parent')}
                    </>}

                    {section('Scolarité / niveau')}
                    {champ('Classe scolaire', 'classe')}
                    {champ('Niveau déclaré', 'niveau_declare')}

                    <div style={{ display:'flex', gap:10, marginTop:20 }}>
                      <button onClick={() => setModeCorrection(false)} disabled={correctionSaving}
                        style={{ flex:1, padding:'10px 0', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:correctionSaving?'not-allowed':'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        Annuler
                      </button>
                      <button onClick={enregistrerCorrection} disabled={correctionSaving}
                        style={{ flex:2, padding:'10px 0', borderRadius:8, border:'none', background: correctionSaving ? COULEURS.gris200 : '#10B981', color: correctionSaving ? COULEURS.gris400 : '#fff', fontWeight:700, cursor:correctionSaving?'not-allowed':'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        {correctionSaving ? 'Enregistrement…' : '💾 Enregistrer les corrections'}
                      </button>
                    </div>
                  </>
                );
              })() : (() => {
                const estMineur = modalDetail.profil_type === 'enfant' || modalDetail.profil_type === 'adolescent';
                const champManquant = (v) => !v && <span style={{ color:'#DC2626', fontWeight:600 }}>⚠️ non renseigné</span>;
                const ligne = (k, v) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'7px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:12 }}>
                    <span style={{ color:COULEURS.gris600, fontWeight:600, flexShrink:0 }}>{k}</span>
                    <span style={{ color:COULEURS.navy, fontWeight:700, textAlign:'right' }}>{v || champManquant(v)}</span>
                  </div>
                );
                const section = (titre) => (
                  <div style={{ fontSize:11, fontWeight:800, color:couleurThemeFonce, textTransform:'uppercase', letterSpacing:'0.06em', margin:'18px 0 6px', ...(titre==='Bénéficiaire' && { marginTop:0 }) }}>{titre}</div>
                );
                return (
                  <>
                    {section('Bénéficiaire')}
                    {ligne('Profil', modalDetail.profil_type === 'adolescent' ? '🧑 Adolescent' : modalDetail.profil_type === 'enfant' ? '🧒 Enfant' : '👔 Adulte')}
                    {ligne('Date de naissance', modalDetail.date_naissance)}
                    {ligne('Email (propre)', modalDetail.email)}
                    {ligne('Téléphone (propre)', modalDetail.telephone)}
                    {ligne('Poste', modalDetail.poste)}
                    {ligne('Département', modalDetail.departement)}
                    {ligne('Langue souhaitée', modalDetail.langue_souhaitee)}

                    {estMineur && <>
                      {section('Contact parent / tuteur')}
                      {ligne('Prénom du parent', modalDetail.prenom_parent)}
                      {ligne('Nom du parent', modalDetail.nom_parent)}
                      {ligne('Email du parent', modalDetail.email_parent)}
                      {ligne('Téléphone du parent', modalDetail.telephone_parent)}
                    </>}

                    {section('Scolarité / niveau')}
                    {ligne('Classe scolaire', modalDetail.classe)}
                    {ligne('Niveau CECR estimé (import)', modalDetail.niveau_cecr_estime)}
                    {ligne('Niveau déclaré', modalDetail.niveau_declare)}
                    {ligne('Niveau détecté (test)', modalDetail.niveau_detecte)}

                    {section('Suivi du dossier')}
                    {ligne('Entreprise', modalDetail.entreprise_nom)}
                    {ligne('Statut', STATUT_PARCOURS[modalDetail.statut]?.lib || modalDetail.statut)}
                    {ligne('Source', SOURCE_PARCOURS_LIB[modalDetail.source] || modalDetail.source)}
                    {ligne('Classe BET assignée', modalDetail.classe_nom)}
                    {ligne('Date assignation', modalDetail.date_assignation)}
                    {ligne('Date test', modalDetail.date_test)}
                  </>
                );
              })()}
              {!modeCorrection && modalDetail.notes_onboarding && (
                <div style={{ marginTop:14, background:COULEURS.gris50, borderRadius:8, padding:'10px 14px', fontSize:12, color:COULEURS.gris700, fontStyle:'italic' }}>
                  📝 {modalDetail.notes_onboarding}
                </div>
              )}
              {!modeCorrection && modalDetail.notes_placement && (
                <div style={{ marginTop:8, background:'#EDE9FE', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#5B21B6', fontStyle:'italic' }}>
                  🎯 Placement : {modalDetail.notes_placement}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmation suppression ── */}
      {modalSupprimer && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1300, backdropFilter:'blur(2px)' }}
          onClick={() => !saving && setModalSupprimer(null)}>
          <div style={{ background:COULEURS.blanc, borderRadius:16, width:440, maxWidth:'92vw', padding:28, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:44, height:44, borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🗑</div>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>
                {modalSupprimer.mode === 'single' ? 'Retirer ce dossier ?' : `Retirer ${modalSupprimer.count} dossier(s) ?`}
              </div>
            </div>
            <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, marginBottom:22 }}>
              {modalSupprimer.mode === 'single'
                ? <>Le dossier de <strong>{modalSupprimer.nom}</strong> sera définitivement retiré de la liste Parcours.</>
                : <>Les <strong>{modalSupprimer.count}</strong> dossiers sélectionnés seront définitivement retirés de la liste Parcours.</>
              }
              {modalSupprimer.mode === 'bulk' && modalSupprimer.dejaAssignes > 0 ? (
                <div style={{ marginTop:10, background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#991B1B' }}>
                  🔒 {modalSupprimer.dejaAssignes} sur {modalSupprimer.count} ont déjà été transmis à l'Agent Placement (ou assignés) - ceux-là ne seront <strong>pas</strong> retirés.
                </div>
              ) : (
                <div style={{ marginTop:10, background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#92400E' }}>
                  ⚠️ Cela ne supprime pas un compte apprenant déjà créé - seulement ce dossier de suivi.
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalSupprimer(null)} disabled={saving} style={{ flex:1, padding:'10px 0', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor: saving ? 'not-allowed' : 'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                Annuler
              </button>
              <button onClick={confirmerSuppression} disabled={saving} style={{ flex:2, padding:'10px 0', borderRadius:8, border:'none', background: saving ? COULEURS.gris200 : '#DC2626', color: saving ? COULEURS.gris400 : '#fff', fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                {saving ? 'Suppression…' : '🗑 Retirer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal rattachement entreprise (rattrapage import sans entreprise) ── */}
      {modalLierEnt && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200, backdropFilter:'blur(2px)' }}
          onClick={() => setModalLierEnt(null)}>
          <div style={{ background:COULEURS.blanc, borderRadius:16, width:440, maxWidth:'92vw', padding:28, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>🔗 Rattacher à une entreprise</div>
            <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:20 }}>
              <strong>{modalLierEnt.nom_complet}</strong> a été importé(e) sans entreprise associée - aucune classe d'entreprise ne peut lui être assignée tant que ce n'est pas corrigé.
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 }}>Entreprise *</label>
              <select
                value={entLierChoisie}
                onChange={e => setEntLierChoisie(e.target.value)}
                style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy }}
              >
                <option value="">- Sélectionner -</option>
                {entreprises.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalLierEnt(null)} style={{ flex:1, padding:'10px 0', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Annuler</button>
              <button onClick={confirmerLienEntreprise} disabled={!entLierChoisie || lierSaving} style={{ flex:2, padding:'10px 0', borderRadius:8, border:'none', background: entLierChoisie ? COULEURS.succes : COULEURS.gris200, color: entLierChoisie ? '#fff' : COULEURS.gris400, fontWeight:700, cursor: entLierChoisie ? 'pointer' : 'not-allowed', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                {lierSaving ? 'Enregistrement…' : '✅ Rattacher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal assignation classe ── */}
      {modalAssigner && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200, backdropFilter:'blur(2px)' }}
          onClick={() => { setModalAssigner(null); setModeNouvelleClasse(false); setClasseChoisie(''); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 32px 80px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ background:`linear-gradient(135deg,${couleurTheme},${couleurThemeFonce})`, borderRadius:'18px 18px 0 0', padding:'18px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>🏫 Assignation de classe</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:2 }}>
                  <strong>{modalAssigner.nom_complet}</strong>
                  {modalAssigner.niveau_detecte && <> · Niveau détecté : <strong>{modalAssigner.niveau_detecte}</strong></>}
                  {modalAssigner.entreprise_nom && <> · {modalAssigner.entreprise_nom}</>}
                </div>
              </div>
              <button onClick={() => { setModalAssigner(null); setModeNouvelleClasse(false); setClasseChoisie(''); }}
                style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>

            <div style={{ padding:'22px 24px' }}>
              {/* Toggle mode */}
              <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                <button onClick={() => setModeNouvelleClasse(false)}
                  style={{ flex:1, padding:'9px 14px', borderRadius:9, border:`2px solid ${!modeNouvelleClasse ? couleurTheme : COULEURS.gris200}`, background:!modeNouvelleClasse ? `${couleurTheme}10` : COULEURS.blanc, color:!modeNouvelleClasse ? couleurTheme : COULEURS.gris600, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  📋 Classe existante
                </button>
                <button onClick={() => { setModeNouvelleClasse(true); setFormClasse({ ...FORM_CL0, niveau: modalAssigner.niveau_detecte || '', nom: modalAssigner.entreprise_nom ? `${modalAssigner.entreprise_nom} - ${modalAssigner.niveau_detecte||''}` : '' }); }}
                  style={{ flex:1, padding:'9px 14px', borderRadius:9, border:`2px solid ${modeNouvelleClasse ? couleurTheme : COULEURS.gris200}`, background:modeNouvelleClasse ? `${couleurTheme}10` : COULEURS.blanc, color:modeNouvelleClasse ? couleurTheme : COULEURS.gris600, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  ➕ Créer une nouvelle classe
                </button>
              </div>

              {/* ── Mode classe existante ── */}
              {!modeNouvelleClasse && (
                <>
                  <label style={lbl}>Classe BET E-Learning</label>
                  <select style={{ ...inp, width:'100%', marginBottom:16 }} value={classeChoisie} onChange={e => setClasseChoisie(e.target.value)}>
                    <option value=''>- Sélectionner une classe -</option>
                    {classes
                      .filter(c => c.statut === 'actif')
                      .filter(c => !modalAssigner.niveau_detecte || c.niveau === modalAssigner.niveau_detecte || !c.niveau)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.nom} {c.niveau ? `(${c.niveau})` : ''} {c.entreprise_nom ? `- ${c.entreprise_nom}` : ''} · {c.nb_apprenants||0}/{c.capacite_max||'?'} places
                        </option>
                      ))}
                  </select>
                  {classeChoisie && (() => {
                    const c = classes.find(x => x.id === classeChoisie);
                    if (!c) return null;
                    const places = c.capacite_max ? Math.min(100, Math.round(((c.nb_apprenants||0) / c.capacite_max) * 100)) : 0;
                    const complet = c.capacite_max && (c.nb_apprenants||0) >= c.capacite_max;
                    return (
                      <div style={{ background:COULEURS.blanc, border:`1.5px solid ${couleurTheme}30`, borderRadius:12, padding:'16px 18px', marginBottom:16, overflow:'hidden' }}>
                        {/* En-tête : nom + badges */}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:14 }}>
                          <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy }}>{c.nom}</div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                            {c.niveau && <span style={{ padding:'2px 9px', borderRadius:20, background:`${NIV_CL_C[c.niveau]||couleurTheme}18`, color:NIV_CL_C[c.niveau]||couleurTheme, fontSize:11, fontWeight:800 }}>{c.niveau}</span>}
                            <span style={{ padding:'2px 9px', borderRadius:20, background:`${TYPE_CL_TAG[c.type_cours]||COULEURS.gris400}18`, color:TYPE_CL_TAG[c.type_cours]||COULEURS.gris600, fontSize:11, fontWeight:700 }}>{TYPE_CL_LIB[c.type_cours] || c.type_cours}</span>
                            <span style={{ padding:'2px 9px', borderRadius:20, background: c.statut==='actif' ? '#D1FAE5' : '#F1F5F9', color: c.statut==='actif' ? '#065F46' : COULEURS.gris600, fontSize:11, fontWeight:700 }}>{c.statut === 'actif' ? '🟢 Active' : c.statut}</span>
                          </div>
                        </div>

                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                          <div style={{ background:COULEURS.gris50, borderRadius:9, padding:'10px 12px' }}>
                            <div style={{ fontSize:10, color:COULEURS.gris400, fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>🏢 Entreprise</div>
                            <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>{c.entreprise_nom || 'Particuliers'}</div>
                          </div>
                          <div style={{ background:COULEURS.gris50, borderRadius:9, padding:'10px 12px' }}>
                            <div style={{ fontSize:10, color:COULEURS.gris400, fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>👨‍🏫 Coach</div>
                            <div style={{ fontSize:12, fontWeight:700, color: c.coach_nom ? COULEURS.navy : COULEURS.attention }}>{c.coach_nom || '⏳ Non encore assigné'}</div>
                          </div>
                          <div style={{ background:COULEURS.gris50, borderRadius:9, padding:'10px 12px' }}>
                            <div style={{ fontSize:10, color:COULEURS.gris400, fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>📅 Dates</div>
                            <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>
                              {c.date_debut ? new Date(c.date_debut).toLocaleDateString('fr-FR') : '-'}
                              {c.date_fin ? ` → ${new Date(c.date_fin).toLocaleDateString('fr-FR')}` : ''}
                            </div>
                          </div>
                          <div style={{ background:COULEURS.gris50, borderRadius:9, padding:'10px 12px' }}>
                            <div style={{ fontSize:10, color:COULEURS.gris400, fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>👥 Places</div>
                            <div style={{ fontSize:12, fontWeight:700, color: complet ? '#DC2626' : COULEURS.navy, marginBottom:4 }}>
                              {c.nb_apprenants||0} / {c.capacite_max} {complet ? '· Complet' : ''}
                            </div>
                            <div style={{ height:5, background:COULEURS.gris200, borderRadius:3, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${places}%`, background: complet ? '#DC2626' : couleurTheme, borderRadius:3 }} />
                            </div>
                          </div>
                        </div>

                        {Array.isArray(c.horaire) && c.horaire.length > 0 && (
                          <div style={{ marginBottom:10 }}>
                            <div style={{ fontSize:10, color:COULEURS.gris400, fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>🗓️ Emploi du temps</div>
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                              {c.horaire.map((h, i) => (
                                <span key={i} style={{ padding:'4px 10px', borderRadius:7, background:`${couleurTheme}10`, color:couleurThemeFonce, fontSize:11, fontWeight:600 }}>
                                  {h.jour} · {h.debut}–{h.fin}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {(c.created_by_nom || c.created_at) && (
                          <div style={{ fontSize:10, color:COULEURS.gris400, borderTop:`1px solid ${COULEURS.gris100}`, paddingTop:8, marginTop:4 }}>
                            {c.created_by_nom && <>Créée par {c.created_by_nom}</>}
                            {c.created_at && <> · le {new Date(c.created_at).toLocaleDateString('fr-FR')}</>}
                          </div>
                        )}

                        {complet && (
                          <div style={{ marginTop:10, background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, padding:'8px 12px', fontSize:11, color:'#991B1B' }}>
                            ⚠️ Cette classe est complète - l'assignation reste possible mais dépassera la capacité prévue.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                    <button onClick={() => { setModalAssigner(null); setClasseChoisie(''); }} style={{ padding:'10px 18px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>Annuler</button>
                    <button onClick={assigner} disabled={!classeChoisie || saving}
                      style={{ padding:'10px 22px', borderRadius:9, border:'none', background: classeChoisie && !saving ? couleurTheme : COULEURS.gris300, color:'#fff', fontWeight:700, fontSize:13, cursor: classeChoisie && !saving ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {saving ? '⏳…' : '✅ Confirmer l\'assignation'}
                    </button>
                  </div>
                </>
              )}

              {/* ── Mode nouvelle classe ── */}
              {modeNouvelleClasse && (
                <form onSubmit={creerEtAssigner}>
                  <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:9, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#1D4ED8' }}>
                    ℹ️ Une nouvelle classe sera créée et <strong>{modalAssigner.nom_complet}</strong> y sera inscrit(e) directement. Le coach sera assigné ultérieurement.
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label style={lbl}>Nom de la classe *</label>
                      <input style={{ ...inp, width:'100%' }} required placeholder='Ex : TLG Pharma - B1 Matin' value={formClasse.nom} onChange={e => setFormClasse(f=>({...f,nom:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Niveau CECR</label>
                      <select style={{ ...inp, width:'100%' }} value={formClasse.niveau} onChange={e => setFormClasse(f=>({...f,niveau:e.target.value}))}>
                        <option value=''>- Auto -</option>
                        {['A0','A1','A2','B1','B2','C1','C2'].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Format</label>
                      <select style={{ ...inp, width:'100%' }} value={formClasse.type_cours} onChange={e => setFormClasse(f=>({...f,type_cours:e.target.value}))}>
                        <option value='en_ligne'>🌐 En ligne</option>
                        <option value='presentiel'>🏢 Présentiel</option>
                        <option value='hybride'>🔀 Hybride</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Date de début</label>
                      <input type='date' style={{ ...inp, width:'100%' }} value={formClasse.date_debut} onChange={e => setFormClasse(f=>({...f,date_debut:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Capacité max</label>
                      <input type='number' min={1} max={50} style={{ ...inp, width:'100%' }} value={formClasse.capacite_max} onChange={e => setFormClasse(f=>({...f,capacite_max:Number(e.target.value)}))} />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                    <button type='button' onClick={() => setModeNouvelleClasse(false)} style={{ padding:'10px 18px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour</button>
                    <button type='submit' disabled={saving}
                      style={{ padding:'10px 22px', borderRadius:9, border:'none', background:saving ? COULEURS.gris300 : couleurTheme, color:'#fff', fontWeight:700, fontSize:13, cursor:saving ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {saving ? '⏳ Création…' : '🏫 Créer la classe et assigner'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const JOURS_SEMAINE = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const NIV_CECR_CL  = ['A0','A1','A2','B1','B2','C1','C2'];
const NIV_CL_C     = { A0:'#94A3B8', A1:'#60A5FA', A2:'#34D399', B1:'#818CF8', B2:'#F59E0B', C1:'#F97316', C2:'#DC2626' };
const TYPE_CL_LIB  = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };
const TYPE_CL_TAG  = { en_ligne:'#0EA5E9', presentiel:'#10B981', hybride:'#8B5CF6' };

function ModalNouvelleClasse({ onFermer, onCreee }) {
  const { couleurTheme, couleurThemeFonce } = useTheme();
  const [entreprises, setEntreprises] = useState([]);
  const [coachs,      setCoachs]      = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [flash,       setFlash]       = useState(null);

  const FORM0 = {
    entreprise_id: '', entreprise_nom: '',
    nom: '', niveau: 'A1', type_cours: 'en_ligne',
    date_debut: '', date_fin: '', capacite_max: 10,
    coach_id: '',
  };
  const [form, setForm] = useState(FORM0);

  // Emploi du temps : liste de créneaux { jour, debut, fin }
  const CRENEAU0 = { jour: 'Lundi', debut: '09:00', fin: '11:00' };
  const [creneaux, setCreneaux] = useState([{ ...CRENEAU0 }]);

  useEffect(() => {
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/entreprise/admin/liste`, { headers: _authHdrsAdmin() }),
      fetch(`${_API_URL_ADMIN}/api/coachs`,                 { headers: _authHdrsAdmin() }),
    ]).then(async ([r1, r2]) => {
      const d1 = await r1.json(); setEntreprises(d1.entreprises || d1 || []);
      const d2 = await r2.json(); setCoachs(d2.coachs || d2 || []);
    }).catch(() => {});
  }, []);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function ajouterCreneau() { setCreneaux(c => [...c, { ...CRENEAU0 }]); }
  function supprimerCreneau(i) { setCreneaux(c => c.filter((_, idx) => idx !== i)); }
  function setCreneau(i, k, v) {
    setCreneaux(c => c.map((cr, idx) => idx === i ? { ...cr, [k]: v } : cr));
  }

  async function creer() {
    if (!form.nom.trim()) { setFlash('Le nom de la classe est requis.'); return; }
    if (creneaux.length === 0) { setFlash('Ajoutez au moins un créneau horaire.'); return; }
    if (saving) return;
    setSaving(true);
    setFlash(null);
    try {
      const coachChoisi = coachs.find(c => c.id === form.coach_id);
      const payload = {
        nom:            form.nom.trim(),
        entreprise_id:  form.entreprise_id  || null,
        entreprise_nom: form.entreprise_nom || null,
        niveau:         form.niveau         || null,
        type_cours:     form.type_cours,
        date_debut:     form.date_debut     || null,
        date_fin:       form.date_fin       || null,
        capacite_max:   Number(form.capacite_max) || 10,
        coach_id:       form.coach_id       || null,
        coach_nom:      coachChoisi ? `${coachChoisi.prenom||''} ${coachChoisi.nom||''}`.trim() : null,
        horaire:        creneaux.map(c => ({ jour: c.jour, debut: c.debut, fin: c.fin })),
      };
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning`, {
        method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
      onCreee(d.classe);
    } catch (e) {
      setFlash(`Erreur : ${e.message}`);
      setSaving(false);
    }
  }

  const inp  = { width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy, boxSizing:'border-box', background:COULEURS.blanc };
  const lbl  = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 };
  const row  = { display:'grid', gap:14, marginBottom:14 };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:1200, overflowY:'auto', padding:'24px 16px', backdropFilter:'blur(2px)' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:620, maxWidth:'96vw', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', marginBottom:24 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,${couleurTheme},${couleurThemeFonce})`, padding:'20px 26px', borderRadius:'18px 18px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>🏫 Nouvelle classe</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3 }}>Créer une classe et définir son emploi du temps</div>
          </div>
          <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ padding:'24px 26px' }}>
          {flash && (
            <div style={{ background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#991B1B', marginBottom:16 }}>{flash}</div>
          )}

          {/* Entreprise */}
          <div style={{ ...row, gridTemplateColumns:'1fr' }}>
            <div>
              <label style={lbl}>Entreprise (optionnel)</label>
              <select style={inp} value={form.entreprise_id}
                onChange={e => {
                  const ent = entreprises.find(x => x.id === e.target.value);
                  setF('entreprise_id', e.target.value);
                  setF('entreprise_nom', ent?.nom || '');
                }}>
                <option value=''>- Aucune / Particuliers -</option>
                {entreprises.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
          </div>

          {/* Nom + Niveau */}
          <div style={{ ...row, gridTemplateColumns:'2fr 1fr' }}>
            <div>
              <label style={lbl}>Nom de la classe *</label>
              <input style={inp} placeholder='Ex : Anglais B1 - TLG Pharma (Matin)'
                value={form.nom} onChange={e => setF('nom', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Niveau CECR</label>
              <select style={inp} value={form.niveau} onChange={e => setF('niveau', e.target.value)}>
                {NIV_CECR_CL.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Type + Capacité */}
          <div style={{ ...row, gridTemplateColumns:'1fr 1fr' }}>
            <div>
              <label style={lbl}>Type de cours</label>
              <select style={inp} value={form.type_cours} onChange={e => setF('type_cours', e.target.value)}>
                <option value='en_ligne'>En ligne</option>
                <option value='presentiel'>Présentiel</option>
                <option value='hybride'>Hybride</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Capacité max</label>
              <input style={inp} type='number' min={1} max={50} value={form.capacite_max}
                onChange={e => setF('capacite_max', e.target.value)} />
            </div>
          </div>

          {/* Dates */}
          <div style={{ ...row, gridTemplateColumns:'1fr 1fr' }}>
            <div>
              <label style={lbl}>Date de début</label>
              <input style={inp} type='date' value={form.date_debut} onChange={e => setF('date_debut', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Date de fin</label>
              <input style={inp} type='date' value={form.date_fin} onChange={e => setF('date_fin', e.target.value)} />
            </div>
          </div>

          {/* Coach */}
          <div style={{ ...row, gridTemplateColumns:'1fr', marginBottom:20 }}>
            <div>
              <label style={lbl}>Coach (optionnel)</label>
              <select style={inp} value={form.coach_id} onChange={e => setF('coach_id', e.target.value)}>
                <option value=''>- À assigner plus tard -</option>
                {coachs.map(c => (
                  <option key={c.id} value={c.id}>{c.prenom} {c.nom} {c.niveau ? `(${c.niveau})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Emploi du temps */}
          <div style={{ borderTop:`1px solid ${COULEURS.gris200}`, paddingTop:18, marginBottom:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:800, color:COULEURS.navy }}>📅 Emploi du temps</div>
              <button onClick={ajouterCreneau} style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:7, padding:'5px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                + Ajouter un créneau
              </button>
            </div>
            {creneaux.map((cr, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:8, marginBottom:8, alignItems:'center' }}>
                <select style={{ ...inp, padding:'7px 10px' }} value={cr.jour} onChange={e => setCreneau(i, 'jour', e.target.value)}>
                  {JOURS_SEMAINE.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
                <input style={{ ...inp, padding:'7px 10px' }} type='time' value={cr.debut} onChange={e => setCreneau(i, 'debut', e.target.value)} />
                <input style={{ ...inp, padding:'7px 10px' }} type='time' value={cr.fin}   onChange={e => setCreneau(i, 'fin',   e.target.value)} />
                <button onClick={() => supprimerCreneau(i)} disabled={creneaux.length === 1}
                  style={{ background:'#FEE2E2', border:'none', borderRadius:6, width:30, height:30, cursor:creneaux.length === 1 ? 'not-allowed' : 'pointer', color:'#DC2626', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', opacity:creneaux.length === 1 ? 0.4 : 1 }}>×</button>
              </div>
            ))}
            {creneaux.length === 0 && (
              <div style={{ textAlign:'center', color:COULEURS.gris400, fontSize:12, padding:'12px 0' }}>Aucun créneau - cliquez sur "+ Ajouter un créneau"</div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={onFermer} style={{ padding:'10px 20px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
              Annuler
            </button>
            <button onClick={creer} disabled={saving} style={{ padding:'10px 24px', borderRadius:9, border:'none', background:saving ? COULEURS.gris200 : couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:saving ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
              {saving ? '⏳ Création…' : '✅ Créer la classe'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal détail classe (Onboarding) - onglets Infos / Apprenants / Disponibilités ──

function ModalDetailClasseOnboarding({ classe: classeInit, onFermer, onClasseUpdated, toutesClasses = [] }) {
  const { couleurTheme, couleurThemeFonce } = useTheme();
  const [tab,        setTab]        = useState('infos');
  const [apprenants, setApprenants] = useState([]);
  const [loadApp,    setLoadApp]    = useState(false);
  const [classe,     setClasse]     = useState(classeInit);

  // ── Renommer la classe ──
  const [editNom,    setEditNom]    = useState(false);
  const [nomDraft,   setNomDraft]   = useState(classeInit.nom || '');
  const [savingNom,  setSavingNom]  = useState(false);

  // ── Apprenant sélectionné (modal complet) ──
  const [appSelec, setAppSelec]   = useState(null);
  const [appModal, setAppModal]   = useState(null);

  // ── Clôture ──
  const [cloturModal,   setCloturModal]   = useState(false);
  const [cloturLoading, setCloturLoading] = useState(false);

  // ── Suspension définitive du coach (distincte d'un remplacement temporaire) ──
  const [suspendModal,   setSuspendModal]   = useState(false);
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [coachesListe,   setCoachesListe]   = useState([]);
  const [nouveauCoachId, setNouveauCoachId] = useState('');
  const [motifSuspension,setMotifSuspension]= useState('');
  useEffect(() => {
    if (!suspendModal || coachesListe.length > 0) return;
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.ok ? r.json() : { coaches: [] })
      .then(d => setCoachesListe(d.coaches || []))
      .catch(() => {});
  }, [suspendModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emploi du temps éditable ──
  const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const [creneaux, setCreneaux] = useState(() => Array.isArray(classeInit.horaire) ? classeInit.horaire.map(h => ({ ...h })) : [{ jour:'Lundi', debut:'09:00', fin:'11:00' }]);
  const [saving,   setSaving]   = useState(false);
  const [flash,    setFlash]    = useState(null);

  const NIV_C = { A0:'#94A3B8', A1:'#60A5FA', A2:'#34D399', B1:'#818CF8', B2:'#F59E0B', C1:'#F97316', C2:'#EF4444' };
  const FORMAT = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };
  const niv = classe.niveau;

  const TABS = [
    { id:'infos',     lib:'Infos',         icone:'ℹ️' },
    { id:'apprenants',lib:'Apprenants',    icone:'👥', badge: classe.nb_apprenants || 0 },
    { id:'sessions',  lib:'Sessions',      icone:'📅' },
    { id:'dispos',    lib:'Disponibilités',icone:'🗓️' },
  ];

  // ── Sauvegarder nouveau nom ──
  async function sauvegarderNom() {
    if (!nomDraft.trim() || savingNom) return;
    setSavingNom(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classe.id}`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nomDraft.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
      const updated = { ...classe, nom: nomDraft.trim() };
      setClasse(updated);
      onClasseUpdated?.(updated);
      setEditNom(false);
      setFlash({ type:'ok', msg:`✅ Classe renommée en "${nomDraft.trim()}"` });
      setTimeout(() => setFlash(null), 3000);
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setSavingNom(false);
    }
  }

  // ── Suspendre définitivement le coach titulaire, le remplacer par un autre ──
  async function suspendreCoach() {
    if (suspendLoading) return;
    if (!nouveauCoachId) { setFlash({ type:'err', msg: 'Sélectionnez le nouveau coach titulaire.' }); return; }
    if (!motifSuspension.trim()) { setFlash({ type:'err', msg: 'Un motif est requis.' }); return; }
    const nouveauCoach = coachesListe.find(c => c.id === nouveauCoachId);
    setSuspendLoading(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classe.id}/suspendre-coach`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nouveau_coach_id:  nouveauCoachId,
          nouveau_coach_nom: nouveauCoach ? `${nouveauCoach.prenom||''} ${nouveauCoach.nom||''}`.trim() : '',
          motif: motifSuspension.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
      const updated = { ...classe, coach_id: d.classe.coach_id, coach_nom: d.classe.coach_nom };
      setClasse(updated);
      onClasseUpdated?.(updated);
      setSuspendModal(false);
      setNouveauCoachId('');
      setMotifSuspension('');
      setFlash({ type:'ok', msg:`🔴 Coach suspendu - ${updated.coach_nom} est désormais titulaire de "${classe.nom}".` });
      setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setSuspendLoading(false);
    }
  }

  // Charger apprenants quand onglet ouvert
  useEffect(() => {
    if (tab !== 'apprenants') return;
    setLoadApp(true);
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classe.id}/apprenants`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setApprenants(d.apprenants || []))
      .catch(() => {})
      .finally(() => setLoadApp(false));
  }, [tab, classe.id]);

  // Édition créneaux
  function ajouterCreneau() { setCreneaux(c => [...c, { jour:'Lundi', debut:'09:00', fin:'11:00' }]); }
  function supprimerCreneau(i) { setCreneaux(c => c.filter((_, idx) => idx !== i)); }
  function editCreneau(i, k, v) { setCreneaux(c => c.map((cr, idx) => idx === i ? { ...cr, [k]: v } : cr)); }

  async function sauvegarderHoraire() {
    if (saving) return;
    setSaving(true);
    setFlash(null);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classe.id}`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ horaire: creneaux }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
      setFlash({ type:'ok', msg:'✅ Emploi du temps mis à jour.' });
      onClasseUpdated?.({ ...classe, horaire: creneaux });
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 4000);
    }
  }

  const row = (l, v) => v ? (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, gap:12 }}>
      <span style={{ color:COULEURS.gris600, flexShrink:0 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy, textAlign:'right' }}>{v}</span>
    </div>
  ) : null;

  const inp = { padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy, background:COULEURS.blanc };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200, backdropFilter:'blur(3px)' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:20, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 40px 100px rgba(0,0,0,0.35)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,${couleurTheme},${couleurThemeFonce})`, padding:'22px 28px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:14, alignItems:'center', flex:1, minWidth:0 }}>
              <div style={{ width:52, height:52, borderRadius:14, background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🏫</div>
              <div style={{ flex:1, minWidth:0 }}>
                {editNom ? (
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <input
                      autoFocus
                      value={nomDraft}
                      onChange={e => setNomDraft(e.target.value)}
                      onKeyDown={e => { if (e.key==='Enter') sauvegarderNom(); if (e.key==='Escape') setEditNom(false); }}
                      style={{ flex:1, padding:'6px 12px', borderRadius:8, border:'2px solid rgba(255,255,255,0.6)', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:17, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none' }}
                    />
                    <button onClick={sauvegarderNom} disabled={savingNom} style={{ padding:'6px 14px', borderRadius:8, background:'rgba(255,255,255,0.25)', border:'1px solid rgba(255,255,255,0.5)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', flexShrink:0 }}>
                      {savingNom ? '⏳' : '✓ Enregistrer'}
                    </button>
                    <button onClick={() => setEditNom(false)} style={{ padding:'6px 10px', borderRadius:8, background:'transparent', border:'1px solid rgba(255,255,255,0.3)', color:'rgba(255,255,255,0.7)', fontSize:12, cursor:'pointer', flexShrink:0 }}>Annuler</button>
                  </div>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ fontSize:19, fontWeight:800, color:'#fff' }}>{classe.nom}</div>
                    <button onClick={() => { setNomDraft(classe.nom); setEditNom(true); }} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:7, padding:'3px 9px', fontSize:11, color:'rgba(255,255,255,0.85)', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', flexShrink:0 }}>✏️ Renommer</button>
                  </div>
                )}
                <div style={{ display:'flex', gap:8, marginTop:5, flexWrap:'wrap', alignItems:'center' }}>
                  {niv && <span style={{ background:NIV_C[niv]||'rgba(255,255,255,0.3)', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:800 }}>{niv}</span>}
                  {classe.type_cours && <span style={{ background:'rgba(255,255,255,0.18)', color:'rgba(255,255,255,0.85)', borderRadius:20, padding:'2px 9px', fontSize:11 }}>{FORMAT[classe.type_cours]||classe.type_cours}</span>}
                  {classe.entreprise_nom && <span style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>🏢 {classe.entreprise_nom}</span>}
                  <span style={{
                    background: classe.statut==='actif' ? '#D1FAE5' : classe.statut==='clos' ? '#fee2e2' : '#FEF3C7',
                    color:      classe.statut==='actif' ? '#065F46' : classe.statut==='clos' ? '#dc2626' : '#92400E',
                    borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700
                  }}>
                    {classe.statut==='actif' ? 'Active' : classe.statut==='clos' ? '🔒 Clôturée' : classe.statut}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10, width:36, height:36, cursor:'pointer', fontSize:20, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
          </div>
          {/* KPIs rapides */}
          <div style={{ display:'flex', gap:20, marginTop:16, flexWrap:'wrap' }}>
            {[
              { l:'Apprenants', v: `${classe.nb_apprenants||0}${classe.capacite_max ? `/${classe.capacite_max}` : ''}`, i:'👥' },
              { l:'Remplissage', v: classe.capacite_max ? `${Math.round((classe.nb_apprenants||0)/classe.capacite_max*100)}%` : '-', i:'📊' },
              { l:'Coach', v: classe.coach_nom || '- Non assigné', i:'👨‍🏫' },
              { l:'Début', v: classe.date_debut ? new Date(classe.date_debut).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}) : '-', i:'📅' },
            ].map((k,i) => (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{k.i} {k.v}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, padding:'0 24px', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'13px 18px', border:'none', borderBottom: tab===t.id ? `2.5px solid ${couleurTheme}` : '2.5px solid transparent', background:'none', color: tab===t.id ? couleurTheme : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', transition:'color 0.15s' }}>
              <span>{t.icone}</span>{t.lib}
              {t.badge > 0 && <span style={{ background:couleurTheme, color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700, marginLeft:2 }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

          {/* Flash global */}
          {flash && (
            <div style={{ marginBottom:16, padding:'10px 16px', borderRadius:10, background: flash.type==='ok'?'#D1FAE5':'#FEE2E2', color: flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600, display:'flex', justifyContent:'space-between' }}>
              <span>{flash.msg}</span>
              <button onClick={() => setFlash(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'inherit' }}>×</button>
            </div>
          )}

          {/* ── INFOS ── */}
          {tab === 'infos' && (
            <>
            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12, marginBottom:20 }}>
              {[
                { l:'Apprenants',    v: classe.nb_apprenants||0,  c:couleurTheme, i:'👥' },
                { l:'Places libres', v: classe.capacite_max ? Math.max(0,(classe.capacite_max||0)-(classe.nb_apprenants||0)) : '-', c:'#059669', i:'🟢' },
                { l:'Remplissage',   v: classe.capacite_max ? `${Math.round((classe.nb_apprenants||0)/classe.capacite_max*100)}%` : '-', c:'#F59E0B', i:'📊' },
                { l:'Créneaux/sem',  v: Array.isArray(classe.horaire) ? classe.horaire.length : 0, c:'#8B5CF6', i:'📅' },
              ].map(({l,v,c,i}) => (
                <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 16px', borderTop:`3px solid ${c}` }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{i}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:3 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth:900 }}>
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>📋 Détails de la classe</div>
                {row('Nom',        classe.nom)}
                {row('Niveau',     niv)}
                {row('Format',     FORMAT[classe.type_cours] || classe.type_cours)}
                {row('Statut',     classe.statut === 'actif' ? '✅ Active' : classe.statut === 'clos' ? '🔒 Clôturée' : classe.statut)}
                {row('Capacité',   classe.capacite_max ? `${classe.nb_apprenants||0} / ${classe.capacite_max} places` : null)}
                {row('Entreprise', classe.entreprise_nom)}
              </div>
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>👨‍🏫 Encadrement & Dates</div>
                {row('Coach',      classe.coach_nom || '- Non assigné')}
                {row('Date début', classe.date_debut ? new Date(classe.date_debut).toLocaleDateString('fr-FR') : null)}
                {row('Date fin',   classe.date_fin   ? new Date(classe.date_fin).toLocaleDateString('fr-FR')   : null)}
                {row('Créée par',  classe.created_by_nom)}
                {classe.statut !== 'clos' && (
                  <button onClick={() => setSuspendModal(true)}
                    style={{ marginTop:10, padding:'6px 14px', borderRadius:8, border:'1.5px solid #dc2626', background:'#fef2f2', color:'#dc2626', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                    🔴 Suspendre définitivement le coach
                  </button>
                )}
              </div>
              {Array.isArray(classe.horaire) && classe.horaire.length > 0 && (
                <div style={{ gridColumn:'1/-1', background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>📅 Emploi du temps</span>
                    <button onClick={() => setTab('dispos')} style={{ fontSize:12, color:couleurTheme, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>Modifier →</button>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                    {classe.horaire.map((h, i) => (
                      <div key={i} style={{ background:`${couleurTheme}10`, border:`1px solid ${couleurTheme}30`, borderRadius:10, padding:'8px 16px', display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:700, color:couleurTheme }}>{h.jour}</span>
                        <span style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>{h.debut} – {h.fin}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {niv && (
                <div style={{ gridColumn:'1/-1', background:`${NIV_C[niv]||couleurTheme}10`, border:`1px solid ${NIV_C[niv]||couleurTheme}30`, borderRadius:14, padding:'20px 24px', display:'flex', gap:20, alignItems:'center' }}>
                  <div style={{ width:60, height:60, borderRadius:14, background:NIV_C[niv]||couleurTheme, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:900, color:'#fff', flexShrink:0 }}>{niv}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:3 }}>{{ A0:'Faux débutant', A1:'Débutant', A2:'Élémentaire', B1:'Intermédiaire', B2:'Intermédiaire supérieur', C1:'Avancé', C2:'Maîtrise' }[niv]||niv}</div>
                    <div style={{ fontSize:12, color:COULEURS.gris600 }}>Niveau CECR de la classe</div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Zone clôture ── */}
            {classe.statut !== 'clos' ? (
              <div style={{ marginTop:24, background:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:12, padding:'16px 22px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontWeight:700, color:'#991b1b', fontSize:13, marginBottom:3 }}>🔒 Clôturer cette classe</div>
                  <div style={{ fontSize:12, color:'#b91c1c' }}>Action irréversible. La classe passe en statut "Clos". Les données restent consultables.</div>
                </div>
                <button onClick={() => setCloturModal(true)}
                  style={{ padding:'8px 20px', borderRadius:9, border:'1.5px solid #dc2626', background:'#dc2626', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', flexShrink:0 }}>
                  🔒 Clôturer la classe
                </button>
              </div>
            ) : (
              <div style={{ marginTop:24, background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:12, padding:'14px 20px', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:18 }}>🔒</span>
                <div style={{ fontSize:13, color:'#475569', fontWeight:600 }}>Cette classe est clôturée. Toutes les données restent accessibles en lecture.</div>
              </div>
            )}

            {/* ── Modal confirmation clôture ── */}
            {cloturModal && (
              <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1400 }}
                onClick={() => { if (!cloturLoading) setCloturModal(false); }}>
                <div style={{ background:'#fff', borderRadius:18, padding:'32px 36px', maxWidth:480, width:'90vw', boxShadow:'0 30px 80px rgba(0,0,0,0.3)' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize:36, textAlign:'center', marginBottom:12 }}>🔒</div>
                  <div style={{ fontSize:17, fontWeight:800, color:'#991b1b', textAlign:'center', marginBottom:8 }}>Clôturer la classe ?</div>
                  <div style={{ fontSize:13, color:'#6b7280', textAlign:'center', marginBottom:20, lineHeight:1.6 }}>
                    Vous êtes sur le point de clôturer <strong>"{classe.nom}"</strong>.<br/>
                    Le statut passera à <strong>"Clos"</strong> et tous les acteurs seront notifiés.<br/>
                    <em>Les données restent consultables.</em>
                  </div>
                  <ul style={{ fontSize:12, color:'#374151', background:'#f9fafb', borderRadius:10, padding:'12px 16px', marginBottom:20, listStyle:'none' }}>
                    <li>✅ Statut classe → "Clos"</li>
                    <li>✅ Coach notifié</li>
                    <li>✅ Apprenants notifiés</li>
                    <li>✅ Entreprise cliente notifiée</li>
                    <li>✅ Admins e-learning notifiés</li>
                  </ul>
                  <div style={{ display:'flex', gap:12 }}>
                    <button onClick={() => setCloturModal(false)} disabled={cloturLoading}
                      style={{ flex:1, padding:'11px', borderRadius:9, border:'1px solid #e5e7eb', background:'#f9fafb', color:'#374151', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      Annuler
                    </button>
                    <button disabled={cloturLoading} onClick={async () => {
                      if (cloturLoading) return;
                      setCloturLoading(true);
                      try {
                        const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classe.id}/cloture`, {
                          method: 'POST',
                          headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                        });
                        const d = await r.json();
                        if (!r.ok) throw new Error(d.error || 'Erreur serveur');
                        const updated = { ...classe, statut: 'clos' };
                        setClasse(updated);
                        onClasseUpdated?.(updated);
                        setCloturModal(false);
                        setFlash({ type:'ok', msg:`🔒 Classe "${classe.nom}" clôturée avec succès.` });
                        setTimeout(() => setFlash(null), 4000);
                      } catch (e) {
                        setFlash({ type:'err', msg: e.message });
                        setCloturModal(false);
                      } finally {
                        setCloturLoading(false);
                      }
                    }}
                      style={{ flex:1, padding:'11px', borderRadius:9, border:'none', background: cloturLoading ? '#fca5a5' : '#dc2626', color:'#fff', fontSize:13, fontWeight:700, cursor: cloturLoading ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {cloturLoading ? '⏳ Clôture…' : '🔒 Confirmer la clôture'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Modal suspension définitive du coach ── */}
            {suspendModal && (() => {
              const coachActuel = coachesListe.find(c => c.id === classe.coach_id);
              const initiales = (c) => `${c.prenom?.[0]||''}${c.nom?.[0]||''}`.toUpperCase() || '?';
              const nbClassesActuelles = (coachId) => toutesClasses.filter(cl => cl.coach_id === coachId && cl.statut !== 'clos').length;
              const LIB_ROLE = { professeur_titulaire:'Titulaire dédié', professeur_remplacant:'Remplaçant dédié', coach:'Coach' };
              const candidats = coachesListe.filter(c => c.id !== classe.coach_id);

              return (
              <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1400 }}
                onClick={() => { if (!suspendLoading) setSuspendModal(false); }}>
                <div style={{ background:'#fff', borderRadius:18, width:'90vw', height:'90vh', maxWidth:'90vw', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 30px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}
                  onClick={e => e.stopPropagation()}>

                  {/* En-tête */}
                  <div style={{ padding:'22px 30px', borderBottom:'1px solid #e5e7eb', flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ fontSize:30 }}>🔴</div>
                      <div>
                        <div style={{ fontSize:18, fontWeight:800, color:'#991b1b' }}>Suspendre définitivement le coach</div>
                        <div style={{ fontSize:12.5, color:'#6b7280', marginTop:2 }}>
                          Classe <strong>"{classe.nom}"</strong> - le nouveau coach hérite du contexte pédagogique complet (devoirs inclus). Les honoraires déjà dus à l'ancien coach ne sont jamais réécrits.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Corps scrollable */}
                  <div style={{ flex:1, overflowY:'auto', padding:'24px 30px', display:'flex', flexDirection:'column', gap:24 }}>

                    {/* Coach actuel */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Coach titulaire actuel</div>
                      <div style={{ display:'flex', alignItems:'center', gap:14, background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:12, padding:'14px 18px' }}>
                        <div style={{ width:44, height:44, borderRadius:'50%', background:'#dc2626', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, flexShrink:0 }}>
                          {coachActuel ? initiales(coachActuel) : '?'}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14.5, fontWeight:800, color:'#111827' }}>{classe.coach_nom || 'Coach inconnu'}</div>
                          <div style={{ fontSize:12, color:'#6b7280', marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
                            {coachActuel?.email && <span>✉️ {coachActuel.email}</span>}
                            {coachActuel && <span>🎓 {LIB_ROLE[coachActuel.role] || coachActuel.role}</span>}
                            <span>📚 {nbClassesActuelles(classe.coach_id)} classe{nbClassesActuelles(classe.coach_id)>1?'s':''} active{nbClassesActuelles(classe.coach_id)>1?'s':''}</span>
                          </div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:'#991b1b', background:'#fee2e2', padding:'4px 10px', borderRadius:8 }}>Sera révoqué</span>
                      </div>
                    </div>

                    {/* Sélection du nouveau titulaire */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                        Nouveau coach titulaire * {candidats.length > 0 && <span style={{ fontWeight:600, textTransform:'none', letterSpacing:0 }}>- {candidats.length} disponible{candidats.length>1?'s':''}</span>}
                      </div>
                      {candidats.length === 0 ? (
                        <div style={{ padding:'16px', textAlign:'center', color:'#9ca3af', fontSize:13, border:'1px dashed #e5e7eb', borderRadius:10 }}>Aucun autre coach e-learning disponible.</div>
                      ) : (
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:10 }}>
                          {candidats.map(c => {
                            const actif = nouveauCoachId === c.id;
                            const nb = nbClassesActuelles(c.id);
                            return (
                              <div key={c.id} onClick={() => setNouveauCoachId(c.id)}
                                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, cursor:'pointer', border:`2px solid ${actif?'#dc2626':'#e5e7eb'}`, background: actif?'#fef2f2':'#fff', transition:'all 0.15s' }}>
                                <div style={{ width:38, height:38, borderRadius:'50%', background: actif?'#dc2626':'#e5e7eb', color: actif?'#fff':'#6b7280', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>
                                  {initiales(c)}
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:13.5, fontWeight:700, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.prenom} {c.nom}</div>
                                  <div style={{ fontSize:11.5, color:'#6b7280', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.email}</div>
                                  <div style={{ display:'flex', gap:6, marginTop:5, flexWrap:'wrap' }}>
                                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:7, background:'#eef2ff', color:'#4338ca' }}>{LIB_ROLE[c.role] || c.role}</span>
                                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:7, background: nb===0?'#ecfdf5':'#fffbeb', color: nb===0?'#059669':'#92400e' }}>📚 {nb} classe{nb>1?'s':''}</span>
                                    {c.actif === false && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:7, background:'#f3f4f6', color:'#6b7280' }}>Inactif</span>}
                                  </div>
                                </div>
                                {actif && <span style={{ fontSize:16, color:'#dc2626', flexShrink:0 }}>✓</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Motif */}
                    <div>
                      <label style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:10 }}>Motif *</label>
                      <textarea value={motifSuspension} onChange={e => setMotifSuspension(e.target.value)} rows={3}
                        placeholder="Ex : abandon de poste, faute grave, fin de contrat…"
                        style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1.5px solid #e5e7eb', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', boxSizing:'border-box' }} />
                    </div>
                  </div>

                  {/* Pied */}
                  <div style={{ display:'flex', gap:12, padding:'18px 30px', borderTop:'1px solid #e5e7eb', flexShrink:0 }}>
                    <button onClick={() => setSuspendModal(false)} disabled={suspendLoading}
                      style={{ flex:1, padding:'11px', borderRadius:9, border:'1px solid #e5e7eb', background:'#f9fafb', color:'#374151', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      Annuler
                    </button>
                    <button disabled={suspendLoading || !nouveauCoachId || !motifSuspension.trim()} onClick={suspendreCoach}
                      style={{ flex:1, padding:'11px', borderRadius:9, border:'none', background: (suspendLoading||!nouveauCoachId||!motifSuspension.trim()) ? '#fca5a5' : '#dc2626', color:'#fff', fontSize:13, fontWeight:700, cursor: (suspendLoading||!nouveauCoachId||!motifSuspension.trim()) ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {suspendLoading ? '⏳ Suspension…' : '🔴 Confirmer la suspension'}
                    </button>
                  </div>
                </div>
              </div>
              );
            })()}
            </>
          )}

          {/* ── APPRENANTS ── */}
          {tab === 'apprenants' && (
            <>
              <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
                {[
                  { l:'Inscrits',  v: apprenants.length,                                  c:couleurTheme },
                  { l:'Actifs',    v: apprenants.filter(a=>a.statut==='actif').length,    c:'#059669' },
                  { l:'Suspendus', v: apprenants.filter(a=>a.statut==='suspendu').length, c:'#DC2626' },
                  { l:'Capacité',  v: classe.capacite_max ? `${apprenants.length}/${classe.capacite_max}` : '-', c:COULEURS.gris400 },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ flex:1, minWidth:100, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>{l}</div>
                  </div>
                ))}
              </div>
              {loadApp ? (
                <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400 }}>Chargement…</div>
              ) : apprenants.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>👥</div>
                  <div style={{ fontWeight:600, marginBottom:4 }}>Aucun apprenant inscrit</div>
                  <div style={{ fontSize:12 }}>Les apprenants sont ajoutés lors de l'assignation depuis le parcours d'inscription.</div>
                </div>
              ) : (
                <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 80px', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Apprenant</span><span>Contact</span><span>Niveau</span><span>Statut</span><span></span>
                  </div>
                  {apprenants.map((a, i) => {
                    const nom  = a.nom_complet || '-';
                    const init = nom.split(/\s+/).map(p=>p[0]||'').slice(0,2).join('').toUpperCase();
                    const nv   = a.niveau_cecr;
                    const cfg  = { actif:{bg:'#D1FAE5',txt:'#065F46',lib:'Actif'}, suspendu:{bg:'#FEE2E2',txt:'#991B1B',lib:'Suspendu'} }[a.statut] || {bg:'#FEF3C7',txt:'#92400E',lib:a.statut};
                    return (
                      <div key={a.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 80px', padding:'11px 20px', borderBottom: i < apprenants.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13, background:'transparent', transition:'background 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = COULEURS.gris50; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:9, background:`${couleurTheme}18`, border:`1.5px solid ${couleurTheme}35`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:couleurTheme, flexShrink:0 }}>{init}</div>
                          <div>
                            <div style={{ fontWeight:700, color:COULEURS.navy }}>{nom}</div>
                            {a.date_inscription && <div style={{ fontSize:11, color:COULEURS.gris400 }}>Inscrit le {new Date(a.date_inscription).toLocaleDateString('fr-FR')}</div>}
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:COULEURS.gris600 }}>
                          {a.email && <div>{a.email}</div>}
                          {a.telephone && <div>{a.telephone}</div>}
                        </div>
                        <span>{nv ? <span style={{ background:NIV_C[nv]||couleurTheme, color:'#fff', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>{nv}</span> : <span style={{ color:COULEURS.gris400 }}>-</span>}</span>
                        <span style={{ background:cfg.bg, color:cfg.txt, borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700, display:'inline-block' }}>{cfg.lib}</span>
                        <button onClick={() => setAppModal(a)}
                          style={{ padding:'4px 10px', borderRadius:7, border:`1px solid ${couleurTheme}`, background: couleurTheme, color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          👁 Détail
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {appModal && (
            <ModalDetailApprenant
              apprenant={appModal}
              groupe={classe}
              entreprise={{ nom: classe.entreprise_nom }}
              onFermer={() => setAppModal(null)}
              canCreateParent={true}
            />
          )}

          {/* ── SESSIONS ── */}
          {tab === 'sessions' && (
            <OngletSessionsClasse classeId={classe.id} coachNom={classe.coach_nom} couleur={couleurTheme} />
          )}

          {/* ── DISPONIBILITÉS (EDITABLE) ── */}
          {tab === 'dispos' && (
            <div style={{ maxWidth:680 }}>
              <div style={{ background:`${couleurTheme}08`, border:`1px solid ${couleurTheme}20`, borderRadius:12, padding:'14px 18px', marginBottom:24, fontSize:13, color:COULEURS.navy, lineHeight:1.6 }}>
                ✏️ Modifiez l'emploi du temps de cette classe. Les créneaux sont enregistrés immédiatement.
              </div>

              {/* Liste des créneaux */}
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>📅 Créneaux horaires</div>
                  <button onClick={ajouterCreneau}
                    style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                    + Ajouter un créneau
                  </button>
                </div>

                {creneaux.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'20px 0', color:COULEURS.gris400, fontSize:13 }}>
                    Aucun créneau - cliquez sur "+ Ajouter un créneau"
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {creneaux.map((cr, i) => (
                      <div key={i} style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr auto', gap:10, alignItems:'center' }}>
                        <select value={cr.jour} onChange={e => editCreneau(i, 'jour', e.target.value)}
                          style={{ ...inp, padding:'9px 12px' }}>
                          {JOURS.map(j => <option key={j} value={j}>{j}</option>)}
                        </select>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <input type='time' value={cr.debut} onChange={e => editCreneau(i, 'debut', e.target.value)}
                            style={{ ...inp, padding:'9px 10px', flex:1 }} />
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:11, color:COULEURS.gris400, flexShrink:0 }}>→</span>
                          <input type='time' value={cr.fin} onChange={e => editCreneau(i, 'fin', e.target.value)}
                            style={{ ...inp, padding:'9px 10px', flex:1 }} />
                        </div>
                        <button onClick={() => supprimerCreneau(i)} disabled={creneaux.length === 1}
                          style={{ width:34, height:34, borderRadius:8, border:'none', background:'#FEE2E2', color:'#DC2626', fontSize:16, cursor: creneaux.length === 1 ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity: creneaux.length === 1 ? 0.4 : 1, flexShrink:0 }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Aperçu */}
              {creneaux.length > 0 && (
                <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>👁 Aperçu</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                    {creneaux.map((h, i) => (
                      <div key={i} style={{ background:`${couleurTheme}10`, border:`1px solid ${couleurTheme}30`, borderRadius:10, padding:'8px 16px', display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:700, color:couleurTheme }}>{h.jour}</span>
                        <span style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>{h.debut} – {h.fin}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={sauvegarderHoraire} disabled={saving || creneaux.length === 0}
                style={{ width:'100%', padding:'12px', borderRadius:10, border:'none', background: saving || creneaux.length === 0 ? COULEURS.gris200 : couleurTheme, color: saving || creneaux.length === 0 ? COULEURS.gris400 : '#fff', fontSize:14, fontWeight:700, cursor: saving || creneaux.length === 0 ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'background 0.2s' }}>
                {saving ? '⏳ Enregistrement…' : '💾 Enregistrer l\'emploi du temps'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
export function OngletClasses() {
  const { couleurTheme, couleurThemeFonce } = useTheme();

  const [classes,       setClasses]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modalCreation, setModalCreation] = useState(false);
  const [flash,         setFlash]         = useState(null);
  const [recherche,     setRecherche]     = useState('');
  const [filtreNiveau,  setFiltreNiveau]  = useState('');
  const [filtreType,    setFiltreType]    = useState('');
  const [filtreStatut,  setFiltreStatut]  = useState('');
  const [detail,        setDetail]        = useState(null);

  function chargerClasses() {
    setLoading(true);
    fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setClasses(d.classes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { chargerClasses(); }, []);

  function onClasseCreee(classe) {
    setClasses(prev => [{ ...classe, nb_apprenants: 0 }, ...prev]);
    setModalCreation(false);
    setFlash(`Classe "${classe.nom}" créée avec succès.`);
    setTimeout(() => setFlash(null), 4000);
  }

  const liste = classes.filter(g => {
    if (filtreNiveau && g.niveau !== filtreNiveau) return false;
    if (filtreType   && g.type_cours !== filtreType) return false;
    if (filtreStatut && g.statut !== filtreStatut) return false;
    if (recherche) {
      const q = recherche.toLowerCase();
      if (!`${g.nom} ${g.entreprise_nom || ''} ${g.coach_nom || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const NIV_ALL  = [...new Set(classes.map(g => g.niveau).filter(Boolean))].sort();
  const inp = { padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy, background:COULEURS.blanc };

  return (
    <>
      {flash && (
        <div style={{ background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:10, padding:'12px 20px', marginBottom:20, fontSize:13, color:'#065F46', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>✅ {flash}</span>
          <button onClick={() => setFlash(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#065F46' }}>×</button>
        </div>
      )}

      {/* Header + bouton */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>🏫 Classes BET E-Learning</div>
          <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>
            {liste.length} classe{liste.length !== 1 ? 's' : ''}{recherche || filtreNiveau || filtreType ? ' filtrées' : ' au total'}
          </div>
        </div>
        <button onClick={() => setModalCreation(true)}
          style={{ display:'flex', alignItems:'center', gap:7, background:couleurTheme, color:'#fff', border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', boxShadow:`0 4px 12px ${couleurTheme}40` }}>
          + Nouvelle classe
        </button>
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <input style={{ ...inp, flex:1, minWidth:200 }} placeholder='🔍 Nom, entreprise, coach…'
          value={recherche} onChange={e => setRecherche(e.target.value)} />
        <select style={inp} value={filtreNiveau} onChange={e => setFiltreNiveau(e.target.value)}>
          <option value=''>Tous niveaux</option>
          {NIV_ALL.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select style={inp} value={filtreType} onChange={e => setFiltreType(e.target.value)}>
          <option value=''>Tous formats</option>
          <option value='en_ligne'>🌐 En ligne</option>
          <option value='hybride'>🔀 Hybride</option>
          <option value='presentiel'>🏢 Présentiel</option>
        </select>
        <select style={inp} value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}>
          <option value=''>Tous statuts</option>
          <option value='actif'>✅ Active</option>
          <option value='clos'>🔒 Clôturée</option>
          <option value='archive'>📦 Archivée</option>
        </select>
        <button onClick={chargerClasses} style={{ ...inp, cursor:'pointer', fontWeight:600, color:COULEURS.gris600 }}>↻</button>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:COULEURS.gris400, fontSize:13 }}>Chargement…</div>
      ) : liste.length === 0 ? (
        <div style={{ background:COULEURS.blanc, borderRadius:14, padding:'48px 32px', border:`2px dashed ${COULEURS.gris200}`, textAlign:'center' }}>
          <div style={{ fontSize:44, marginBottom:10 }}>🏫</div>
          <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>
            {recherche || filtreNiveau || filtreType ? 'Aucune classe ne correspond aux filtres' : 'Aucune classe créée'}
          </div>
          {!recherche && !filtreNiveau && !filtreType && (
            <div style={{ fontSize:13, color:COULEURS.gris600 }}>Cliquez sur <strong>+ Nouvelle classe</strong> pour commencer.</div>
          )}
        </div>
      ) : (
        <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          {/* En-tête */}
          <div style={{ display:'grid', gridTemplateColumns:'2.5fr 1.2fr 1fr 1fr 1.4fr 1fr 120px', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            <span>Classe</span>
            <span>Entreprise</span>
            <span>Niveau</span>
            <span>Format</span>
            <span>Emploi du temps</span>
            <span>Apprenants</span>
            <span>Actions</span>
          </div>

          {liste.map((g, i) => {
            const niv      = g.niveau || '-';
            const nc       = NIV_CL_C[niv] || COULEURS.gris400;
            const typCol   = TYPE_CL_TAG[g.type_cours] || COULEURS.gris400;
            const horaires = Array.isArray(g.horaire) ? g.horaire : [];
            const ratio    = typeof g.nb_apprenants === 'number' ? `${g.nb_apprenants}/${g.capacite_max||'?'}` : '-';
            const pct      = g.capacite_max ? Math.min(100, Math.round((g.nb_apprenants||0) / g.capacite_max * 100)) : 0;

            const isClos = g.statut === 'clos';
            return (
              <div key={g.id}
                style={{ display:'grid', gridTemplateColumns:'2.5fr 1.2fr 1fr 1fr 1.4fr 1fr 120px', padding:'13px 20px', borderBottom: i < liste.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13, transition:'background 0.1s', cursor:'pointer', background: isClos ? '#fafafa' : 'transparent', opacity: isClos ? 0.75 : 1 }}
                onClick={() => setDetail(g)}
                onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                onMouseLeave={e => e.currentTarget.style.background = isClos ? '#fafafa' : 'transparent'}>

                {/* Nom + coach */}
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                    <span style={{ fontWeight:700, color: isClos ? COULEURS.gris400 : COULEURS.navy }}>{isClos ? '🔒 ' : ''}{g.nom}</span>
                    {isClos && <span style={{ fontSize:10, fontWeight:800, padding:'1px 7px', borderRadius:99, background:'#fee2e2', color:'#dc2626' }}>Clôturée</span>}
                  </div>
                  {g.coach_nom && <div style={{ fontSize:11, color:COULEURS.gris400 }}>👨‍🏫 {g.coach_nom}</div>}
                </div>

                {/* Entreprise */}
                <div style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>
                  {g.entreprise_nom ? <><span style={{ marginRight:4 }}>🏢</span>{g.entreprise_nom}</> : <span style={{ color:COULEURS.gris400 }}>-</span>}
                </div>

                {/* Niveau */}
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:34, height:24, borderRadius:6, background:`${nc}20`, color:nc, fontSize:11, fontWeight:800 }}>
                  {niv}
                </span>

                {/* Format */}
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:6, background:`${typCol}15`, color:typCol, fontSize:11, fontWeight:700, width:'fit-content' }}>
                  {TYPE_CL_LIB[g.type_cours] || g.type_cours}
                </span>

                {/* Emploi du temps */}
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  {horaires.length === 0
                    ? <span style={{ fontSize:11, color:COULEURS.gris400 }}>-</span>
                    : horaires.slice(0,2).map((h, hi) => (
                        <span key={hi} style={{ fontSize:11, color:COULEURS.gris600, fontWeight:500 }}>
                          <span style={{ fontWeight:700, color:couleurTheme }}>{h.jour.slice(0,3)}</span> {h.debut}–{h.fin}
                        </span>
                      ))
                  }
                  {horaires.length > 2 && <span style={{ fontSize:10, color:COULEURS.gris400 }}>+{horaires.length-2} autre{horaires.length-2>1?'s':''}</span>}
                </div>

                {/* Apprenants + barre */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:3 }}>{ratio}</div>
                  <div style={{ height:4, borderRadius:2, background:COULEURS.gris100, overflow:'hidden', width:60 }}>
                    <div style={{ height:'100%', borderRadius:2, width:`${pct}%`, background: pct >= 90 ? '#DC2626' : pct >= 60 ? '#F59E0B' : COULEURS.succes, transition:'width 0.3s' }} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:5 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setDetail(g)}
                    style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                    👁 Voir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <ModalDetailClasseOnboarding
          classe={detail}
          toutesClasses={classes}
          onFermer={() => setDetail(null)}
          onClasseUpdated={c => {
            setDetail(c);
            setClasses(prev => prev.map(cl => cl.id === c.id ? { ...cl, ...c } : cl));
          }}
        />
      )}

      {modalCreation && (
        <ModalNouvelleClasse onFermer={() => setModalCreation(false)} onCreee={onClasseCreee} />
      )}
    </>
  );
}

// ── Agent Placement Tests (étapes 5-6) ───────────────────────────────────────

const NIVEAUX_CECR_PL = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const NIV_COULEUR_PL  = { A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316' };

// Aucune colonne `age` n'existe en base (seulement `date_naissance`, pas toujours renseignée
// pour les profils adultes) - on calcule l'âge à l'affichage plutôt que de stocker une valeur
// qui se périmerait avec le temps.
// ageDepuisNaissance/testsCompatibles/ModalEnvoiGroupé/ModalResultatsTest/ModalAssignationEntreprise extraits dans DashboardAdminShared.jsx (import ci-dessus, partagés avec Placement)
export function OngletVueEnsembleOnboarding() {
  const navigate = useNavigate();
  const [chargement, setChargement] = useState(true);
  const [stats, setStats] = useState({
    entreprisesEnAttente: null, entreprisesActives: null,
    inscriptionsATraiter: null, inscriptionsVerifiees: null, inscriptionsAAssigner: null,
    classesActives: null,
  });
  const [notifications, setNotifications] = useState([]);
  const [repartitionInscriptions, setRepartitionInscriptions] = useState([]);
  const [inscriptionsParMois, setInscriptionsParMois] = useState([]);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [entR, inscR, classesR, notifsR] = await Promise.all([
          fetch(`${_API_URL_ADMIN}/api/entreprise/admin/liste`,   { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning`,    { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${_API_URL_ADMIN}/api/classes-elearning`,         { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${_API_URL_ADMIN}/api/notifications/mes-notifs?limit=10`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (annule) return;
        const entreprises   = entR?.entreprises || [];
        const inscriptions  = inscR?.inscriptions || inscR || [];
        const classes       = classesR?.classes || classesR || [];
        const aTraiter  = inscriptions.filter(i => i.statut === 'recu').length;
        const verifiees = inscriptions.filter(i => i.statut === 'verifie').length;
        const aAssigner = inscriptions.filter(i => i.statut === 'teste' && !i.classe_id).length;
        const assignees = inscriptions.filter(i => i.statut === 'teste' && i.classe_id).length;
        setStats({
          entreprisesEnAttente:  entreprises.filter(e => e.statut === 'en_attente').length,
          entreprisesActives:    entreprises.filter(e => e.statut === 'actif').length,
          inscriptionsATraiter:  aTraiter,
          inscriptionsVerifiees: verifiees,
          inscriptionsAAssigner: aAssigner,
          classesActives:        classes.filter(c => c.statut === 'actif').length,
        });
        setNotifications((notifsR?.notifications || []).slice(0, 8));

        setRepartitionInscriptions([
          { nom: 'À traiter',       valeur: aTraiter,  couleur: '#DC2626' },
          { nom: 'Vérifiées',       valeur: verifiees, couleur: '#0891B2' },
          { nom: 'Prêtes à assigner', valeur: aAssigner, couleur: '#7C3AED' },
          { nom: 'Assignées',       valeur: assignees, couleur: '#059669' },
        ]);

        // Inscriptions reçues par mois (6 derniers mois)
        const moisMap = {};
        const maintenant = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
          const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          moisMap[cle] = { cle, mois: d.toLocaleDateString('fr-FR', { month: 'short' }), total: 0 };
        }
        for (const insc of inscriptions) {
          if (!insc.created_at) continue;
          const cle = insc.created_at.slice(0, 7);
          if (moisMap[cle]) moisMap[cle].total += 1;
        }
        setInscriptionsParMois(Object.values(moisMap));
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, []);

  const cartes = [
    { titre: 'Entreprises en attente', sousTitre: 'validation à faire',      icone: '⏳', valeur: stats.entreprisesEnAttente,  chemin: '/admin/onboarding/entreprises', couleur: '#F59E0B' },
    { titre: 'Entreprises actives',    sousTitre: 'contrats en cours',       icone: '🏢', valeur: stats.entreprisesActives,    chemin: '/admin/onboarding/entreprises', couleur: '#059669' },
    { titre: 'À traiter',              sousTitre: 'inscriptions reçues',     icone: '📥', valeur: stats.inscriptionsATraiter,  chemin: '/admin/onboarding/parcours',    couleur: '#DC2626' },
    { titre: 'Vérifiées',              sousTitre: 'en attente de test',      icone: '✅', valeur: stats.inscriptionsVerifiees, chemin: '/admin/onboarding/parcours',    couleur: '#0891B2' },
    { titre: 'Prêtes à assigner',      sousTitre: 'testées, sans classe',    icone: '🎯', valeur: stats.inscriptionsAAssigner, chemin: '/admin/onboarding/parcours',    couleur: '#7C3AED' },
    { titre: 'Classes actives',        sousTitre: 'toutes entreprises',      icone: '🏫', valeur: stats.classesActives,        chemin: '/admin/onboarding/classes',     couleur: COULEURS.cyanFonce },
  ];

  return (
    <div>
      <div style={{ fontSize: 13, color: COULEURS.gris600, marginBottom: 20 }}>
        Vue d'ensemble - avancement du parcours d'inscription. Cliquez sur une carte pour l'ouvrir.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
        {cartes.map(c => (
          <div key={c.titre} onClick={() => navigate(c.chemin)}
            style={{ background: COULEURS.blanc, borderRadius: 14, padding: '20px', border: `1px solid ${COULEURS.gris200}`, borderTop: `4px solid ${c.couleur}`, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', transition: 'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'; }}
          >
            <div style={{ fontSize: 26, marginBottom: 8 }}>{c.icone}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: c.couleur }}>{chargement ? '…' : (c.valeur ?? '-')}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginTop: 6 }}>{c.titre}</div>
            <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>{c.sousTitre}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 28 }}>
        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>📥 Répartition des inscriptions</div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Chargement…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={repartitionInscriptions} dataKey="valeur" nameKey="nom" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {repartitionInscriptions.map((s, i) => <Cell key={i} fill={s.couleur} />)}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>📈 Inscriptions reçues - 6 derniers mois</div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Chargement…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={inscriptionsParMois}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="total" fill="#7C3AED" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: COULEURS.navy }}>🔔 Notifications récentes</div>
          <button onClick={() => navigate('/admin/notifications')} style={{ background: 'none', border: 'none', color: '#7C3AED', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Tout voir →</button>
        </div>
        <div style={{ background: COULEURS.blanc, borderRadius: 14, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Chargement…</div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Aucune notification récente.</div>
          ) : notifications.map((n, i) => (
            <div key={n.id || i} onClick={() => navigate('/admin/notifications')}
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 18px', borderBottom: i < notifications.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', cursor: 'pointer', background: n.lu ? 'transparent' : '#FDF4FF20' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.lu ? COULEURS.gris200 : '#7C3AED', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: n.lu ? 600 : 800, color: COULEURS.navy }}>{n.titre}</div>
                <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 2 }}>{n.message}</div>
              </div>
              <div style={{ fontSize: 11, color: COULEURS.gris400, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   SUIVI DÉMARRAGE & MES TÂCHES — portés depuis dash (OnboardingDashboard.jsx)

   POURQUOI CES DEUX ONGLETS ARRIVENT ICI. L'assistante Onboarding travaille sur les deux
   plateformes, et seul dash lui disait ce qu'il restait à traiter. Côté bet-elearning elle
   devait ouvrir chaque onglet pour le découvrir.

   LA SOURCE EST LA MÊME DES DEUX CÔTÉS : `GET /api/parcours/mes-apprenants-onboarding`, du
   Backend partagé. Aucune route n'a été ajoutée — c'est la raison pour laquelle ce portage
   est possible sans toucher au serveur.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

/* Les quatre étapes du démarrage d'un apprenant. Identiques à `CHECKLIST_ITEMS` de dash :
   deux listes différentes donneraient deux pourcentages pour le même dossier. */
const ETAPES_DEMARRAGE = [
  { id: 'bienvenue', label: 'Email de bienvenue envoyé',      icone: '✉️' },
  { id: 'acces',     label: 'Lien espace apprenant transmis', icone: '🔗' },
  { id: 'kit',       label: 'Lien matériel de cours envoyé',  icone: '📚' },
  { id: 'planning',  label: 'Planning des séances envoyé',    icone: '📅' },
];

/**
 * La checklist RÉELLEMENT atteinte par un apprenant.
 *
 * `bienvenue` et `acces` ne sont pas cochés à la main : le compte apprenant est créé dès
 * l'ajout au groupe (`creerAccesApprenantCore`, côté Backend), donc la présence d'un
 * `apprenant_id` vaut preuve d'envoi. Les cocher manuellement laisserait croire qu'il reste
 * un geste à faire. `kit` et `planning` restent manuels : aucun envoi automatique n'existe
 * pour eux aujourd'hui.
 */
const checklistReelle = (a) => ({
  ...(a.suivi_checklist || {}),
  bienvenue: !!a.apprenant_id,
  acces:     !!a.apprenant_id,
});

const pctDemarrage = (cl) => {
  const faites = ETAPES_DEMARRAGE.filter(i => (cl || {})[i.id]).length;
  return Math.round((faites / ETAPES_DEMARRAGE.length) * 100);
};

const _dateCourte = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Charge les apprenants suivis par l'assistante connectée. Partagé par les deux onglets. */
function useApprenantsOnboarding() {
  const [apprenants, setApprenants] = useState([]);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/parcours/mes-apprenants-onboarding`, { headers: _authHdrsAdmin() });
      const d = await r.json().catch(() => ({}));
      setApprenants(Array.isArray(d.apprenants) ? d.apprenants : []);
    } catch { setApprenants([]); }
    finally { setChargement(false); }
  }, []);

  useEffect(() => { recharger(); }, [recharger]);
  return { apprenants, setApprenants, chargement, recharger };
}

const PAR_PAGE_SUIVI = 10;

/**
 * SUIVI DÉMARRAGE — où en est chaque apprenant dans ses quatre étapes d'accueil.
 *
 * Les deux étapes manuelles sont COCHABLES ICI, avec mise à jour optimiste puis
 * `PATCH /api/groupes/apprenants/:id/suivi`. Un tableau en lecture seule aurait obligé
 * l'assistante à repasser sur dash pour cocher ce qu'elle vient de faire.
 */
export function OngletSuiviDemarrage() {
  const { couleurTheme } = useTheme();
  const { apprenants, setApprenants, chargement } = useApprenantsOnboarding();
  const [filtre, setFiltre] = useState('tous');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState(null);

  const filtres = apprenants.filter(a => {
    const pct = pctDemarrage(checklistReelle(a));
    if (filtre === 'termine' && pct !== 100) return false;
    if (filtre === 'non_termine' && pct === 100) return false;
    if (du && (!a.date_ajout || a.date_ajout < du)) return false;
    if (au && (!a.date_ajout || a.date_ajout > au)) return false;
    return true;
  });
  const visibles = filtres.slice((page - 1) * PAR_PAGE_SUIVI, page * PAR_PAGE_SUIVI);

  /* Coche optimiste : l'écran répond tout de suite, et on remet la valeur d'avant si le
     serveur refuse. Attendre la réponse donnerait une case qui met une seconde à réagir. */
  async function basculer(gaId, itemId) {
    const cible = apprenants.find(a => a.id === gaId);
    if (!cible) return;
    const avant = cible.suivi_checklist || {};
    const apres = { ...avant, [itemId]: !avant[itemId] };
    setApprenants(prev => prev.map(a => a.id === gaId ? { ...a, suivi_checklist: apres } : a));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/groupes/apprenants/${gaId}/suivi`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ suivi_checklist: apres }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setApprenants(prev => prev.map(a => a.id === gaId ? { ...a, suivi_checklist: avant } : a));
      toast.error("L'étape n'a pas pu être enregistrée", { duration: 5000 });
    }
  }

  const th = { padding: '9px 12px', fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', textAlign: 'left', fontWeight: 700 };
  const td = { padding: '10px 12px', color: COULEURS.gris900 };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>🚀 Suivi démarrage</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          Email de bienvenue · lien espace apprenant · lien matériel de cours · planning
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ v: 'tous', l: 'Tous' }, { v: 'non_termine', l: 'Non terminés' }, { v: 'termine', l: 'Terminés' }].map(s => (
            <button key={s.v} onClick={() => { setFiltre(s.v); setPage(1); }}
              style={{ padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                fontFamily: '"Plus Jakarta Sans",sans-serif',
                border: `1.5px solid ${filtre === s.v ? couleurTheme : COULEURS.gris200}`,
                background: filtre === s.v ? couleurTheme : COULEURS.blanc,
                color: filtre === s.v ? '#fff' : COULEURS.gris600 }}>
              {s.l}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <label style={{ fontSize: 11, color: COULEURS.gris400 }}>Du</label>
          <input type="date" value={du} onChange={e => { setDu(e.target.value); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12 }} />
          <label style={{ fontSize: 11, color: COULEURS.gris400 }}>au</label>
          <input type="date" value={au} onChange={e => { setAu(e.target.value); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12 }} />
          {(du || au) && (
            <button onClick={() => { setDu(''); setAu(''); setPage(1); }}
              style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, fontSize: 11, cursor: 'pointer' }}>✕</button>
          )}
        </div>
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtres.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 13, background: COULEURS.gris50, borderRadius: 12 }}>
          {apprenants.length === 0
            ? "Aucun apprenant ne vous est encore attribué."
            : 'Aucun apprenant ne correspond à ces filtres.'}
        </div>
      ) : (
        <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 10, overflow: 'hidden', background: COULEURS.blanc }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
              <thead>
                <tr style={{ background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
                  <th style={th}>Apprenant</th><th style={th}>Groupe</th><th style={th}>Coach</th>
                  <th style={th}>Inscrit le</th><th style={th}>Progression</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(a => {
                  const cl = checklistReelle(a);
                  const pct = pctDemarrage(cl);
                  const nom = `${a.prenom_apprenant || ''} ${a.nom_apprenant || ''}`.trim() || '?';
                  const teinte = pct === 100 ? COULEURS.succes : pct >= 50 ? couleurTheme : COULEURS.attention;
                  return (
                    <tr key={a.id} onClick={() => setOuvert(a.id === ouvert ? null : a.id)}
                      style={{ borderBottom: `1px solid ${COULEURS.gris100}`, cursor: 'pointer' }}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: couleurTheme + '20',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900,
                            fontSize: 13, color: couleurTheme, flexShrink: 0, overflow: 'hidden' }}>
                            {a.avatar_url
                              ? <img src={a.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : nom[0].toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 700, color: COULEURS.navy }}>{nom}</span>
                        </div>
                      </td>
                      <td style={td}>{a.groupe_nom || '—'}</td>
                      <td style={td}>{a.coach_nom || '—'}</td>
                      <td style={{ ...td, fontSize: 11, color: COULEURS.gris400 }}>{_dateCourte(a.date_ajout)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, maxWidth: 80, height: 6, background: COULEURS.gris200, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: teinte, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: teinte }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationSimple total={filtres.length} parPage={PAR_PAGE_SUIVI} page={page} onChange={setPage} />
        </div>
      )}

      {/* LE DÉTAIL S'OUVRE SOUS LE TABLEAU et non dans une modale : on coche deux cases et on
          passe au dossier suivant, une fenêtre à fermer à chaque fois serait un geste de trop. */}
      {ouvert && (() => {
        const a = apprenants.find(x => x.id === ouvert);
        if (!a) return null;
        const cl = checklistReelle(a);
        return (
          <div style={{ marginTop: 16, background: COULEURS.blanc, border: `1.5px solid ${couleurTheme}40`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 }}>
              <strong style={{ fontSize: 14, color: COULEURS.navy }}>
                {`${a.prenom_apprenant || ''} ${a.nom_apprenant || ''}`.trim()}
              </strong>
              <button onClick={() => setOuvert(null)}
                style={{ border: 'none', background: 'none', color: COULEURS.gris400, fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {ETAPES_DEMARRAGE.map(it => {
              const fait = !!cl[it.id];
              const auto = it.id === 'bienvenue' || it.id === 'acces';
              return (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderTop: `1px solid ${COULEURS.gris100}` }}>
                  <span style={{ fontSize: 16 }}>{it.icone}</span>
                  <span style={{ flex: 1, fontSize: 13, color: fait ? COULEURS.gris900 : COULEURS.gris600 }}>
                    {it.label}
                    {auto && <span style={{ fontSize: 10, color: COULEURS.gris400, marginLeft: 7 }}>automatique</span>}
                  </span>
                  {auto ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: fait ? COULEURS.succes : COULEURS.gris400 }}>
                      {fait ? '✓ fait' : 'en attente'}
                    </span>
                  ) : (
                    <button onClick={() => basculer(a.id, it.id)}
                      style={{ padding: '5px 13px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        border: `1.5px solid ${fait ? COULEURS.succes : COULEURS.gris200}`,
                        background: fait ? '#D1FAE5' : COULEURS.blanc,
                        color: fait ? '#065F46' : COULEURS.gris600 }}>
                      {fait ? '✓ fait' : 'marquer fait'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

/**
 * MES TÂCHES — ce qu'il reste à traiter, et où aller le traiter.
 *
 * CE N'EST PAS UNE ROUTE SERVEUR : il n'existe aucun `/api/taches`. Chaque ligne est un
 * compteur calculé sur des données que la plateforme sait déjà lire, et un raccourci vers
 * l'onglet qui permet d'agir. C'est exactement ce que fait dash — un écran d'aiguillage, pas
 * une file de travail persistée.
 *
 * LES COMPTEURS SONT CEUX DE DASH, moins ceux dont la donnée n'existe pas encore ici
 * (« groupes actifs sans coach » et « dossiers sans assistante » demandent des chargements que
 * cette page ne fait pas). Afficher une ligne à zéro faute de savoir la calculer ferait croire
 * qu'il n'y a rien à faire : mieux vaut ne pas l'afficher du tout, et le dire.
 */
export function OngletMesTachesOnboarding() {
  const navigate = useNavigate();
  const { couleurTheme } = useTheme();
  const { apprenants, chargement } = useApprenantsOnboarding();

  const suivisIncomplets = apprenants.filter(
    a => pctDemarrage(checklistReelle(a)) < 100).length;
  const sansGroupe = apprenants.filter(a => !a.groupe_nom).length;

  const taches = [
    { icone: '✅', label: 'Suivis de démarrage incomplets', n: suivisIncomplets, vers: '/admin/onboarding/suivi' },
    { icone: '🏫', label: 'Apprenants sans groupe attribué', n: sansGroupe, vers: '/admin/onboarding/classes' },
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
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 5 }}>
            Vos {apprenants.length} apprenant{apprenants.length > 1 ? 's' : ''} sont à jour.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {ouvertes.map(t => (
            <button key={t.label} onClick={() => navigate(t.vers)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%',
                padding: '15px 18px', borderRadius: 12, cursor: 'pointer', background: COULEURS.blanc,
                border: `1.5px solid ${COULEURS.gris200}`, borderLeft: `4px solid ${couleurTheme}`,
                fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
              <span style={{ fontSize: 22 }}>{t.icone}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: COULEURS.navy }}>{t.label}</span>
              <span style={{ background: couleurTheme + '18', color: couleurTheme, borderRadius: 20,
                padding: '4px 12px', fontSize: 13, fontWeight: 800 }}>{t.n}</span>
              <span style={{ color: COULEURS.gris400, fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11.5, color: COULEURS.gris400, marginTop: 18, lineHeight: 1.6 }}>
        Deux compteurs présents sur dash manquent encore ici — « groupes actifs sans coach » et
        « dossiers sans assistante » — faute des chargements correspondants sur cette page. Ils
        seront ajoutés avec les onglets Plannings et Dossiers à réaffecter.
      </p>
    </div>
  );
}
