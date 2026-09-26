import { useState, useEffect } from 'react';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { NIVEAUX_CECR, CATEGORIES_COMPETENCES, COMPETENCES_DEFAUT, chargerCompetences, sauverCompetences } from '../../constants/niveauxCECR';
import { useTheme } from '../../contexts/ThemeContext';
import { FOOTER_DEFAUT, fetchFooterConfig, saveFooterConfig } from '../../constants/footerConfig';
import { lirePackages, chargerPackages, creerPackageCommercial, modifierPackageCommercial, supprimerPackageCommercial } from '../../constants/packagesCommerciaux';

// ── Palette couleurs packages ─────────────────────────────────────────────────
const PALETTE = [
  '#94A3B8','#0891B2','#8B5CF6','#F97316',
  '#059669','#DC2626','#D97706','#2563EB',
];

const COULEUR_NIV = { A1: '#10B981', A2: '#0891B2', B1: '#7C3AED', B2: '#D97706', C1: '#F59E0B', C2: '#EF4444' };

function Toggle({ valeur, onChange }) {
  const { couleurTheme } = useTheme();
  return (
    <button
      onClick={() => onChange(!valeur)}
      style={{ width: 44, height: 24, borderRadius: 12, background: valeur ? couleurTheme : COULEURS.gris200, position: 'relative', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}
    >
      <span style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', left: valeur ? 23 : 3, transition: 'left 0.2s' }} />
    </button>
  );
}

export default function GestionConfiguration() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const [onglet, setOnglet]     = useState('parametres');
  const [packages, setPackages] = useState(lirePackages);
  const [pkgModal, setPkgModal] = useState(null);
  const [pkgForm, setPkgForm]   = useState({ libelle:'', description:'', tarif:150000, max_benef:10, couleur:'#0891B2', actif:true });
  const [pkgLoading, setPkgLoading] = useState(true);
  const [pkgErr,     setPkgErr]     = useState('');

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) { setPkgLoading(false); return; }
    chargerPackages(token).then(pkgs => { setPackages(pkgs); setPkgLoading(false); });
  }, []);
  // ── Compétences par niveau (config_competences_elearning, en base) ──
  const [competences,     setCompetences]     = useState(COMPETENCES_DEFAUT);
  const [compLoading,     setCompLoading]     = useState(true);
  const [compErr,         setCompErr]         = useState('');
  const [niveauActif,     setNiveauActif]     = useState('A1');
  const [catActif,        setCatActif]        = useState('tous');
  const [formComp,        setFormComp]        = useState(null); // null | { idx, libelle, description, categorie }
  const COMP_VIDE = { libelle:'', description:'', categorie: CATEGORIES_COMPETENCES[0].id };

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) { setCompLoading(false); return; }
    chargerCompetences(token).then(c => { setCompetences(c); setCompLoading(false); });
  }, []);

  // ── Footer (config_footer_elearning, en base) ──
  const [footerCfg,     setFooterCfg]     = useState(FOOTER_DEFAUT);
  const [footerLoading, setFooterLoading] = useState(true);
  const [footerSaving,  setFooterSaving]  = useState(false);
  const [footerSaved,   setFooterSaved]   = useState(false);
  const [footerErr,     setFooterErr]     = useState('');

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) { setFooterLoading(false); return; }
    fetchFooterConfig(token).then(cfg => { setFooterCfg(cfg); setFooterLoading(false); });
  }, []);

  function chFooter(patch) { setFooterCfg(f => ({ ...f, ...patch })); setFooterSaved(false); }
  function chFooterColonne(ci, patch) {
    setFooterCfg(f => ({ ...f, colonnes: f.colonnes.map((c, i) => i === ci ? { ...c, ...patch } : c) }));
    setFooterSaved(false);
  }
  function chFooterLien(ci, li, patch) {
    setFooterCfg(f => ({ ...f, colonnes: f.colonnes.map((c, i) => i === ci
      ? { ...c, liens: c.liens.map((l, j) => j === li ? { ...l, ...patch } : l) }
      : c) }));
    setFooterSaved(false);
  }
  function ajouterLienFooter(ci) {
    setFooterCfg(f => ({ ...f, colonnes: f.colonnes.map((c, i) => i === ci ? { ...c, liens: [...c.liens, { label:'', url:'' }] } : c) }));
    setFooterSaved(false);
  }
  function supprimerLienFooter(ci, li) {
    setFooterCfg(f => ({ ...f, colonnes: f.colonnes.map((c, i) => i === ci ? { ...c, liens: c.liens.filter((_, j) => j !== li) } : c) }));
    setFooterSaved(false);
  }
  async function enregistrerFooter() {
    const token = localStorage.getItem('admin_token');
    setFooterSaving(true); setFooterErr('');
    try {
      const d = await saveFooterConfig(footerCfg, token);
      setFooterCfg(d);
      setFooterSaved(true);
      setTimeout(() => setFooterSaved(false), 3000);
    } catch (e) {
      setFooterErr(e.message);
    } finally {
      setFooterSaving(false);
    }
  }

  async function persisterCompetences(updated) {
    const token = localStorage.getItem('admin_token');
    setCompetences(updated);
    setCompErr('');
    try {
      await sauverCompetences(updated, token);
    } catch (e) {
      setCompErr(e.message);
    }
  }
  function ajouterCompetence() {
    if (!formComp?.libelle.trim()) return;
    const nouv = { id:`comp-${Date.now()}`, categorie: formComp.categorie, libelle: formComp.libelle.trim(), description: formComp.description.trim() };
    const updated = { ...competences, [niveauActif]: [...(competences[niveauActif] || []), nouv] };
    persisterCompetences(updated); setFormComp(null);
  }
  function modifierCompetence() {
    if (!formComp?.libelle.trim()) return;
    const updated = { ...competences, [niveauActif]: competences[niveauActif].map((c, i) => i === formComp.idx ? { ...c, libelle: formComp.libelle.trim(), description: formComp.description.trim(), categorie: formComp.categorie } : c) };
    persisterCompetences(updated); setFormComp(null);
  }
  function supprimerCompetence(idx) {
    const updated = { ...competences, [niveauActif]: competences[niveauActif].filter((_, i) => i !== idx) };
    persisterCompetences(updated);
  }

  function ouvrirNouveauPkg() {
    setPkgForm({ libelle:'', description:'', tarif:150000, max_benef:10, couleur:'#0891B2', actif:true });
    setPkgModal('new');
  }
  function ouvrirEditerPkg(pkg) {
    setPkgForm({ ...pkg });
    setPkgModal(pkg);
  }
  async function sauverPkg() {
    if (!pkgForm.libelle.trim()) return;
    const token = localStorage.getItem('admin_token');
    setPkgErr('');
    try {
      const liste = pkgModal === 'new'
        ? await creerPackageCommercial(pkgForm, token)
        : await modifierPackageCommercial(pkgModal.id, pkgForm, token);
      setPackages(liste);
      setPkgModal(null);
    } catch (e) {
      setPkgErr(e.message);
    }
  }
  async function supprimerPkg(id) {
    const token = localStorage.getItem('admin_token');
    setPkgErr('');
    try {
      const liste = await supprimerPackageCommercial(id, token);
      setPackages(liste);
    } catch (e) {
      setPkgErr(e.message);
    }
  }
  async function togglePkgActif(pkg) {
    const token = localStorage.getItem('admin_token');
    try {
      const liste = await modifierPackageCommercial(pkg.id, { actif: !pkg.actif }, token);
      setPackages(liste);
    } catch (e) {
      setPkgErr(e.message);
    }
  }

  const stats = [
    { label: 'Niveaux CECR',   valeur: Object.keys(NIVEAUX_CECR).length,      couleur: '#A78BFA' },
    { label: 'Packages',        valeur: packages.length,                       couleur: COULEURS.attention },
  ];

  const ONGLETS = [
    { id: 'parametres',  lib: 'Paramètres généraux', icone: '⚙️' },
    { id: 'niveaux',     lib: 'Niveaux CECR',         icone: '📊' },
    { id: 'competences', lib: 'Compétences',           icone: '🎯' },
    { id: 'packages',    lib: 'Packages & Contrats',   icone: '📦' },
  ];

  const S = {
    page:      { padding: 32, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    hd:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
    titre:     { fontSize: 22, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 },
    sous:      { fontSize: 13, color: COULEURS.gris400 },
    tabs:      { display: 'flex', gap: 2, marginBottom: 28, borderBottom: `2px solid ${COULEURS.gris200}`, overflowX: 'auto', scrollbarWidth: 'none' },
    tab:       (a) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: a ? `2px solid ${couleurTheme}` : '2px solid transparent', color: a ? couleurTheme : COULEURS.gris600, fontWeight: a ? 700 : 500, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: -2, whiteSpace: 'nowrap', flexShrink: 0 }),
    section:   { background: COULEURS.blanc, borderRadius: 12, padding: 24, border: `1px solid ${COULEURS.gris200}`, marginBottom: 20 },
    secTitre:  { fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${COULEURS.gris100}` },
    grille2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
    groupe:    { display: 'flex', flexDirection: 'column', gap: 6 },
    label:     { fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em' },
    input:     { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    inputNum:  { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    toggleLigne: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: COULEURS.gris50, borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, marginBottom: 10 },
    // Niveaux CECR
    carteNiv:  (c) => ({ borderRadius: 12, padding: '16px 20px', border: `1px solid ${c}30`, background: c + '08', marginBottom: 12 }),
  };

  return (
    <>
    <TopNavLayout stats={stats}>
      <div style={S.page}>

        {/* En-tête */}
        <div style={S.hd}>
          <div>
            <div style={S.titre}>⚙️ Configuration de la plateforme</div>
            <div style={S.sous}>Paramètres globaux BET E-Learning</div>
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

        {/* ── PARAMÈTRES GÉNÉRAUX ── */}
        {onglet === 'parametres' && (
          <>
            {/* ── Footer de l'application ── */}
            <div style={S.section}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, paddingBottom:12, borderBottom:`1px solid ${COULEURS.gris100}` }}>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>🦶 Pied de page (footer)</div>
                <button onClick={enregistrerFooter} disabled={footerSaving || footerLoading}
                  style={{ padding:'8px 18px', borderRadius:8, border:'none', background: footerSaved ? COULEURS.succes : couleurTheme, color:'#fff', fontSize:12, fontWeight:700, cursor: (footerSaving||footerLoading) ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', opacity: (footerSaving||footerLoading) ? 0.6 : 1 }}>
                  {footerSaving ? '⏳ Enregistrement…' : footerSaved ? '✓ Enregistré !' : '💾 Enregistrer le footer'}
                </button>
              </div>

              {footerLoading ? (
                <div style={{ textAlign:'center', padding:30, color:COULEURS.gris400 }}>Chargement…</div>
              ) : (
                <>
                  {footerErr && <div style={{ background:'#FEF2F2', color:'#991B1B', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:14 }}>{footerErr}</div>}

                  <div style={S.toggleLigne}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Afficher le footer</div>
                      <div style={{ fontSize:12, color:COULEURS.gris400 }}>Masquer entièrement le pied de page sur toutes les pages de l'application</div>
                    </div>
                    <Toggle valeur={footerCfg.visible} onChange={v => chFooter({ visible: v })} />
                  </div>

                  <div style={{ ...S.grille2, marginTop:14 }}>
                    <div style={S.groupe}>
                      <label style={S.label}>Tagline (sous le logo)</label>
                      <input style={S.input} value={footerCfg.tagline} onChange={e => chFooter({ tagline: e.target.value })} />
                    </div>
                    <div style={S.groupe}>
                      <label style={S.label}>Texte copyright (bas de page)</label>
                      <input style={S.input} value={footerCfg.copyright_texte} onChange={e => chFooter({ copyright_texte: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ ...S.groupe, marginBottom:16 }}>
                    <label style={S.label}>Description</label>
                    <textarea rows={2} style={{ ...S.input, resize:'vertical', fontFamily:'inherit' }} value={footerCfg.description} onChange={e => chFooter({ description: e.target.value })} />
                  </div>
                  <div style={{ ...S.groupe, marginBottom:20, maxWidth:160 }}>
                    <label style={S.label}>Version affichée</label>
                    <input style={S.input} value={footerCfg.version} onChange={e => chFooter({ version: e.target.value })} />
                  </div>

                  {/* Colonnes de liens */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                    {footerCfg.colonnes.map((col, ci) => (
                      <div key={ci} style={{ background:COULEURS.gris50, borderRadius:10, padding:14, border:`1px solid ${COULEURS.gris200}` }}>
                        <input value={col.titre} onChange={e => chFooterColonne(ci, { titre: e.target.value })}
                          style={{ ...S.input, fontWeight:700, marginBottom:10, background:COULEURS.blanc }} placeholder="Titre de la colonne" />
                        {col.liens.map((lien, li) => (
                          <div key={li} style={{ display:'flex', gap:6, marginBottom:6, alignItems:'center' }}>
                            <input value={lien.label} onChange={e => chFooterLien(ci, li, { label: e.target.value })}
                              placeholder="Libellé" style={{ ...S.input, fontSize:12, padding:'6px 9px' }} />
                            <input value={lien.url} onChange={e => chFooterLien(ci, li, { url: e.target.value })}
                              placeholder="URL (optionnel)" style={{ ...S.input, fontSize:12, padding:'6px 9px' }} />
                            <button onClick={() => supprimerLienFooter(ci, li)}
                              style={{ background:'#FEF2F2', color:'#991B1B', border:'none', borderRadius:6, padding:'6px 8px', fontSize:11, cursor:'pointer', flexShrink:0 }}>🗑</button>
                          </div>
                        ))}
                        <button onClick={() => ajouterLienFooter(ci)}
                          style={{ width:'100%', padding:'6px', borderRadius:6, border:`1px dashed ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:11, fontWeight:600, cursor:'pointer', marginTop:2 }}>
                          + Ajouter un lien
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

          </>
        )}

        {/* ── NIVEAUX CECR ── */}
        {onglet === 'niveaux' && (
          <>
            <div style={{ fontSize: 13, color: COULEURS.gris400, marginBottom: 20 }}>
              Les niveaux CECR définissent le référentiel d'évaluation de la plateforme. Les seuils de score déterminent l'affectation automatique des apprenants.
            </div>
            {Object.values(NIVEAUX_CECR).map(n => (
              <div key={n.code} style={S.carteNiv(COULEUR_NIV[n.code] || couleurTheme)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: COULEUR_NIV[n.code], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff' }}>
                      {n.code}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy }}>{n.libelle}</div>
                      <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 2 }}>{n.description}</div>
                    </div>
                  </div>
                  <span style={{ padding: '4px 12px', borderRadius: 20, background: COULEUR_NIV[n.code] + '20', color: COULEUR_NIV[n.code], fontSize: 12, fontWeight: 700 }}>
                    {n.seuil_min} – {n.seuil_max} pts
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={S.groupe}>
                    <label style={S.label}>Score minimum</label>
                    <input style={S.inputNum} type="number" defaultValue={n.seuil_min} readOnly style={{ ...S.inputNum, background: COULEURS.gris50 }} />
                  </div>
                  <div style={S.groupe}>
                    <label style={S.label}>Score maximum</label>
                    <input style={S.inputNum} type="number" defaultValue={n.seuil_max} readOnly style={{ ...S.inputNum, background: COULEURS.gris50 }} />
                  </div>
                </div>
              </div>
            ))}
            <div style={{ padding: '12px 16px', background: '#EDE9FE', borderRadius: 10, border: '1px solid #C4B5FD', fontSize: 12, color: '#5B21B6', marginTop: 8 }}>
              ℹ️ Les niveaux C1 et C2 sont en cours d'intégration au référentiel BET - disponibles prochainement.
            </div>
          </>
        )}

        {/* ── COMPÉTENCES PAR NIVEAU ── */}
        {onglet === 'competences' && (() => {
          const compsDuNiveau = competences[niveauActif] || [];
          const compsFiltrees = catActif === 'tous' ? compsDuNiveau : compsDuNiveau.filter(c => c.categorie === catActif);
          const niveauInfo    = NIVEAUX_CECR[niveauActif] || {};
          const INP = { padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none', color:COULEURS.navy };

          return (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy }}>🎯 Compétences par niveau CECR</div>
                  <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:4 }}>
                    Définissez les compétences acquises à chaque niveau. L'apprenant les verra dans son tableau de bord.
                    {compLoading && <span style={{ marginLeft:8, color:COULEURS.attention }}>⏳ Chargement…</span>}
                  </div>
                  {compErr && <div style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>⚠ {compErr}</div>}
                </div>
                <button onClick={() => setFormComp({ ...COMP_VIDE, idx:-1 })}
                  style={{ padding:'9px 18px', borderRadius:8, border:'none', background:niveauInfo.couleur||couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  ＋ Ajouter une compétence
                </button>
              </div>

              {/* Sélecteur de niveau */}
              <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
                {Object.values(NIVEAUX_CECR).map(n => (
                  <button key={n.code} onClick={() => { setNiveauActif(n.code); setCatActif('tous'); setFormComp(null); }}
                    style={{ padding:'7px 16px', borderRadius:20, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', border:`2px solid ${niveauActif===n.code ? n.couleur : COULEURS.gris200}`, background: niveauActif===n.code ? n.couleur : COULEURS.blanc, color: niveauActif===n.code ? '#fff' : COULEURS.gris600, transition:'all 0.15s' }}>
                    {n.code} <span style={{ fontWeight:400, fontSize:11 }}>· {n.libelle}</span>
                    <span style={{ marginLeft:6, background: niveauActif===n.code?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.08)', borderRadius:20, padding:'1px 7px', fontSize:11 }}>{(competences[n.code]||[]).length}</span>
                  </button>
                ))}
              </div>

              {/* Info niveau */}
              <div style={{ padding:'12px 16px', borderRadius:10, background:niveauInfo.couleurFond||COULEURS.gris50, border:`1px solid ${niveauInfo.couleur||COULEURS.gris200}30`, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:22, fontWeight:900, color:niveauInfo.couleur }}>{niveauActif}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{niveauInfo.libelle}</div>
                  <div style={{ fontSize:12, color:COULEURS.gris600 }}>{niveauInfo.description}</div>
                </div>
                <div style={{ marginLeft:'auto', fontSize:20, fontWeight:900, color:niveauInfo.couleur }}>{compsDuNiveau.length} compétence{compsDuNiveau.length!==1?'s':''}</div>
              </div>

              {/* Filtre par catégorie */}
              <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
                <button onClick={() => setCatActif('tous')} style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', border:`1.5px solid ${catActif==='tous'?couleurTheme:COULEURS.gris200}`, background:catActif==='tous'?couleurTheme:COULEURS.blanc, color:catActif==='tous'?'#fff':COULEURS.gris600 }}>
                  Toutes ({compsDuNiveau.length})
                </button>
                {CATEGORIES_COMPETENCES.map(cat => {
                  const nb = compsDuNiveau.filter(c => c.categorie === cat.id).length;
                  if (nb === 0) return null;
                  return (
                    <button key={cat.id} onClick={() => setCatActif(cat.id)} style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', border:`1.5px solid ${catActif===cat.id?cat.couleur:COULEURS.gris200}`, background:catActif===cat.id?cat.couleur:COULEURS.blanc, color:catActif===cat.id?'#fff':COULEURS.gris600 }}>
                      {cat.icone} {cat.lib} ({nb})
                    </button>
                  );
                })}
              </div>

              {/* Formulaire ajout/édition */}
              {formComp && (
                <div style={{ background:'#EFF6FF', borderRadius:12, padding:'18px 20px', border:'1.5px solid #BFDBFE', marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:'#1E40AF', marginBottom:14 }}>
                    {formComp.idx === -1 ? '＋ Nouvelle compétence' : '✏️ Modifier la compétence'}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:5 }}>Catégorie *</label>
                      <select value={formComp.categorie} onChange={e => setFormComp(f => ({ ...f, categorie:e.target.value }))}
                        style={{ ...INP }}>
                        {CATEGORIES_COMPETENCES.map(cat => <option key={cat.id} value={cat.id}>{cat.icone} {cat.lib}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:5 }}>Compétence *</label>
                      <input value={formComp.libelle} onChange={e => setFormComp(f => ({ ...f, libelle:e.target.value }))} placeholder="Ex : Se présenter simplement" style={INP} />
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:5 }}>Description / exemple (optionnel)</label>
                    <input value={formComp.description} onChange={e => setFormComp(f => ({ ...f, description:e.target.value }))} placeholder="Ex : Dire son prénom, son âge, sa nationalité" style={INP} />
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={formComp.idx === -1 ? ajouterCompetence : modifierCompetence} disabled={!formComp.libelle.trim()}
                      style={{ padding:'9px 20px', borderRadius:8, border:'none', background:formComp.libelle.trim()?'#1D4ED8':COULEURS.gris200, color:'#fff', fontSize:13, fontWeight:700, cursor:formComp.libelle.trim()?'pointer':'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                      {formComp.idx === -1 ? 'Ajouter' : 'Enregistrer'}
                    </button>
                    <button onClick={() => setFormComp(null)} style={{ padding:'9px 16px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Annuler</button>
                  </div>
                </div>
              )}

              {/* Liste des compétences */}
              {compsFiltrees.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}` }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🎯</div>
                  <div style={{ fontSize:14, fontWeight:600 }}>Aucune compétence pour ce filtre</div>
                  <div style={{ fontSize:12, marginTop:6 }}>Cliquez sur "Ajouter une compétence" pour commencer</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {compsFiltrees.map((c, ci) => {
                    const cat = CATEGORIES_COMPETENCES.find(x => x.id === c.categorie) || CATEGORIES_COMPETENCES[0];
                    const idxReel = compsDuNiveau.indexOf(c);
                    return (
                      <div key={c.id||ci} style={{ background:COULEURS.blanc, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}`, display:'flex', alignItems:'flex-start', gap:12 }}>
                        <div style={{ width:36, height:36, borderRadius:9, background:cat.couleur+'15', border:`1px solid ${cat.couleur}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0, marginTop:2 }}>{cat.icone}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                            <span style={{ padding:'2px 8px', borderRadius:20, background:cat.couleur+'15', color:cat.couleur, fontSize:10, fontWeight:700 }}>{cat.lib}</span>
                          </div>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom: c.description ? 3 : 0 }}>{c.libelle}</div>
                          {c.description && <div style={{ fontSize:11, color:COULEURS.gris500, fontStyle:'italic' }}>{c.description}</div>}
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <button onClick={() => setFormComp({ idx:idxReel, libelle:c.libelle, description:c.description||'', categorie:c.categorie })}
                            style={{ background:'#EFF6FF', color:'#1D4ED8', border:'none', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontWeight:600 }}>✏️</button>
                          <button onClick={() => supprimerCompetence(idxReel)}
                            style={{ background:'#FEF2F2', color:'#991B1B', border:'none', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontWeight:600 }}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── PACKAGES & CONTRATS ── */}
        {onglet === 'packages' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy }}>📦 Packages commerciaux</div>
                <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:3 }}>
                  Ces packages sont utilisés lors de la création d'une entreprise cliente.
                </div>
              </div>
              <button
                onClick={ouvrirNouveauPkg}
                style={{ padding:'9px 18px', borderRadius:8, border:'none', background:couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
              >
                + Nouveau package
              </button>
            </div>

            {pkgErr && <div style={{ background:'#FEF2F2', color:'#991B1B', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:16 }}>{pkgErr}</div>}

            {pkgLoading ? (
              <div style={{ textAlign:'center', padding:30, color:COULEURS.gris400 }}>Chargement…</div>
            ) : (
            <>
            {/* Grille packages */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16, marginBottom:32 }}>
              {packages.map(pkg => (
                <div key={pkg.id} style={{ background:COULEURS.blanc, borderRadius:16, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', opacity:pkg.actif?1:0.55 }}>
                  {/* Bandeau couleur */}
                  <div style={{ height:6, background:pkg.couleur }} />
                  <div style={{ padding:'18px 20px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:17, fontWeight:800, color:COULEURS.navy }}>{pkg.libelle}</div>
                        {pkg.description && <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:3 }}>{pkg.description}</div>}
                      </div>
                      <Toggle valeur={pkg.actif} onChange={() => togglePkgActif(pkg)} />
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                      <div style={{ background:COULEURS.gris50, borderRadius:8, padding:'10px 12px', borderLeft:`3px solid ${pkg.couleur}` }}>
                        <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:3, textTransform:'uppercase', letterSpacing:'0.04em' }}>Tarif / bénéf.</div>
                        <div style={{ fontSize:16, fontWeight:800, color:pkg.couleur }}>
                          {pkg.tarif?.toLocaleString('fr-FR')} <span style={{ fontSize:11, fontWeight:500, color:COULEURS.gris600 }}>FCFA</span>
                        </div>
                      </div>
                      <div style={{ background:COULEURS.gris50, borderRadius:8, padding:'10px 12px', borderLeft:`3px solid ${pkg.couleur}` }}>
                        <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:3, textTransform:'uppercase', letterSpacing:'0.04em' }}>Max bénéf.</div>
                        <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>
                          {pkg.max_benef >= 999 ? '∞' : pkg.max_benef}
                        </div>
                      </div>
                    </div>

                    <div style={{ display:'flex', gap:8 }}>
                      <button
                        onClick={() => ouvrirEditerPkg(pkg)}
                        style={{ flex:1, padding:'7px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
                      >
                        ✏️ Modifier
                      </button>
                      <button
                        onClick={() => supprimerPkg(pkg.id)}
                        style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Carte "Nouveau" */}
              <button
                onClick={ouvrirNouveauPkg}
                style={{ background:'transparent', border:`2px dashed ${COULEURS.gris200}`, borderRadius:16, minHeight:180, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:COULEURS.gris400, fontFamily:'"Plus Jakarta Sans", sans-serif', transition:'border-color 0.15s' }}
              >
                <span style={{ fontSize:32 }}>+</span>
                <span style={{ fontSize:13, fontWeight:600 }}>Nouveau package</span>
              </button>
            </div>

            {/* Info */}
            <div style={{ background:'#EFF6FF', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#1E40AF', lineHeight:1.7 }}>
              💡 Les packages actifs apparaissent dans le formulaire de création d'entreprise. Désactiver un package le masque sans le supprimer.
            </div>
            </>
            )}
          </div>
        )}

      </div>
    </TopNavLayout>

    {/* ── MODAL PACKAGE ── */}
    {pkgModal !== null && (
      <>
        <div onClick={() => setPkgModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000 }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', background:COULEURS.blanc, borderRadius:20, boxShadow:'0 24px 64px rgba(0,0,0,0.25)', zIndex:1001, fontFamily:'"Plus Jakarta Sans", sans-serif', overflow:'hidden' }}>

          {/* En-tête */}
          <div style={{ background:`linear-gradient(135deg,${COULEURS.navy},#0E4F6B)`, padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>
              {pkgModal === 'new' ? '+ Nouveau package' : `✏️ Modifier - ${pkgModal.libelle}`}
            </div>
            <button onClick={() => setPkgModal(null)} style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer' }}>✕</button>
          </div>

          {/* Formulaire */}
          <div style={{ padding:'24px', display:'flex', flexDirection:'column', gap:16 }}>

            {/* Nom */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                Nom du package *
              </label>
              <input
                style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:14, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }}
                placeholder="ex : Business, Premium…"
                value={pkgForm.libelle}
                onChange={e => setPkgForm(p => ({ ...p, libelle:e.target.value }))}
              />
            </div>

            {/* Description */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                Description
              </label>
              <input
                style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }}
                placeholder="ex : Idéal pour les PME de 10 à 25 bénéficiaires"
                value={pkgForm.description || ''}
                onChange={e => setPkgForm(p => ({ ...p, description:e.target.value }))}
              />
            </div>

            {/* Tarif + Max bénéf */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                  Tarif / bénéficiaire (FCFA) *
                </label>
                <input
                  type="number" min={0}
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:14, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }}
                  value={pkgForm.tarif}
                  onChange={e => setPkgForm(p => ({ ...p, tarif:parseInt(e.target.value)||0 }))}
                />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                  Max bénéficiaires *
                </label>
                <input
                  type="number" min={1}
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:14, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }}
                  placeholder="999 = illimité"
                  value={pkgForm.max_benef}
                  onChange={e => setPkgForm(p => ({ ...p, max_benef:parseInt(e.target.value)||1 }))}
                />
              </div>
            </div>

            {/* Couleur */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>
                Couleur du package
              </label>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => setPkgForm(p => ({ ...p, couleur:c }))}
                    style={{ width:32, height:32, borderRadius:'50%', background:c, border:`3px solid ${pkgForm.couleur===c?COULEURS.navy:'transparent'}`, cursor:'pointer', boxShadow:pkgForm.couleur===c?'0 0 0 2px #fff inset':undefined, transition:'border 0.15s' }}
                    title={c}
                  />
                ))}
                {/* Couleur personnalisée */}
                <div style={{ position:'relative' }}>
                  <input
                    type="color"
                    value={pkgForm.couleur}
                    onChange={e => setPkgForm(p => ({ ...p, couleur:e.target.value }))}
                    style={{ width:32, height:32, borderRadius:'50%', border:`3px solid ${COULEURS.gris200}`, cursor:'pointer', padding:0, background:'transparent' }}
                    title="Couleur personnalisée"
                  />
                </div>
              </div>
              {/* Aperçu */}
              <div style={{ marginTop:10, padding:'8px 14px', borderRadius:8, background:pkgForm.couleur+'15', border:`1px solid ${pkgForm.couleur}40`, fontSize:12, fontWeight:700, color:pkgForm.couleur, display:'inline-block' }}>
                Aperçu - {pkgForm.libelle || 'Nom du package'}
              </div>
            </div>

            {/* Actif */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:COULEURS.gris50, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Actif</div>
                <div style={{ fontSize:11, color:COULEURS.gris400 }}>Visible dans le formulaire de création d'entreprise</div>
              </div>
              <Toggle valeur={pkgForm.actif} onChange={v => setPkgForm(p => ({ ...p, actif:v }))} />
            </div>

          </div>

          {/* Pied */}
          <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={() => setPkgModal(null)} style={{ padding:'9px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              Annuler
            </button>
            <button
              onClick={sauverPkg}
              disabled={!pkgForm.libelle.trim()}
              style={{ padding:'9px 20px', borderRadius:8, border:'none', background:pkgForm.libelle.trim()?COULEURS.succes:COULEURS.gris200, color:'#fff', fontSize:13, fontWeight:700, cursor:pkgForm.libelle.trim()?'pointer':'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
            >
              {pkgModal === 'new' ? '✅ Créer le package' : '💾 Enregistrer'}
            </button>
          </div>
        </div>
      </>
    )}
    </>
  );
}
