import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm, useAlerte } from '../../contexts/ConfirmContext';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { SECTEURS } from '../../mock/entreprises';
import { lirePackages, chargerPackages } from '../../constants/packagesCommerciaux';
import { genererRecuVersement } from '../../utils/recuVersement';
import { useTheme } from '../../contexts/ThemeContext';

import { fetchUpload } from "../../utils/fetchUpload";
import { estRole } from '../../constants/roles';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
function authHeaders() {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatFCFA(n) {
  return n?.toLocaleString('fr-FR') + ' FCFA';
}

function joursRestants(dateFin) {
  const diff = new Date(dateFin) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
function dureeFormation(dateDebut, dateFin) {
  const d1 = new Date(dateDebut);
  const d2 = new Date(dateFin);
  const mois = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (mois >= 12 && mois % 12 === 0) return `${mois / 12} an${mois / 12 > 1 ? 's' : ''}`;
  if (mois >= 12) return `${Math.floor(mois / 12)} an${Math.floor(mois / 12) > 1 ? 's' : ''} et ${mois % 12} mois`;
  return `${mois} mois`;
}

const STATUT_CONFIG = {
  actif:          { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  expire_bientot: { bg: '#FEF3C7', txt: '#92400E', lib: 'Expire bientôt' },
  prospect:       { bg: '#EDE9FE', txt: '#5B21B6', lib: 'Prospect' },
  suspendu:       { bg: '#FEE2E2', txt: '#991B1B', lib: 'Suspendu' },
  en_attente:     { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente' },
  certifie:       { bg: '#DBEAFE', txt: '#1E40AF', lib: 'Certifié' },
  refuse:         { bg: '#FEE2E2', txt: '#991B1B', lib: 'Refusé' },
};

const NIVEAU_COULEUR = {
  A1: '#94A3B8', A2: '#60A5FA', B1: '#34D399', B2: '#818CF8', C1: '#F59E0B', C2: '#F97316',
};

// ─── Helper mot de passe affiché dans la modale credentials ─────────────────
function genererMotDePasse(nomEntreprise) {
  const base = nomEntreprise.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
  return `BET-${base}-${new Date().getFullYear()}`;
}

// ─── Modale affichage des credentials ───────────────────────────────────────
function ModalCredentials({ credentials, nomEntreprise, onFermer }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const [copie, setCopie] = useState('');
  function copier(texte, champ) {
    navigator.clipboard?.writeText(texte).catch(() => {});
    setCopie(champ);
    setTimeout(() => setCopie(''), 2000);
  }

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' },
    modal:   { background: COULEURS.blanc, borderRadius: 18, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', boxShadow: '0 32px 80px rgba(0,0,0,0.35)', overflow: 'hidden' },
    header:  { background: `linear-gradient(135deg, #065F46, ${COULEURS.succes})`, padding: '22px 24px', textAlign: 'center' },
    icone:   { fontSize: 40, marginBottom: 8 },
    titre:   { fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 },
    sous:    { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
    corps:   { padding: 24 },
    alerte:  { background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#92400E', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' },
    champ:   { background: COULEURS.gris50, borderRadius: 10, padding: '14px 16px', marginBottom: 12, border: `1px solid ${COULEURS.gris200}` },
    champLbl:{ fontSize: 10, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
    champVal:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    valTxt:  { fontSize: 15, fontWeight: 700, color: COULEURS.navy, fontFamily: 'monospace' },
    btnCopy: (ok) => ({ padding: '5px 12px', borderRadius: 6, border: `1px solid ${ok ? COULEURS.succes : COULEURS.gris200}`, background: ok ? '#D1FAE5' : COULEURS.blanc, color: ok ? COULEURS.succes : COULEURS.gris600, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif', transition: 'all 0.15s' }),
    footer:  { padding: '16px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 10, justifyContent: 'flex-end' },
    btnFerm: { padding: '9px 22px', borderRadius: 8, border: 'none', background: couleurTheme, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  };

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={S.icone}>✅</div>
          <div style={S.titre}>Compte RH créé avec succès</div>
          <div style={S.sous}>{nomEntreprise} - transmettez ces identifiants au responsable RH</div>
        </div>
        <div style={S.corps}>
          <div style={S.alerte}>
            <span>⚠️</span>
            <span>Ces identifiants n'apparaîtront <strong>qu'une seule fois</strong>. Notez-les ou transmettez-les immédiatement au responsable RH. Le mot de passe devra être changé à la première connexion.</span>
          </div>

          {[
            { lbl: 'Adresse email de connexion', val: credentials.email, champ: 'email' },
            { lbl: 'Mot de passe temporaire',    val: credentials.mot_de_passe, champ: 'mdp' },
          ].map(({ lbl, val, champ }) => (
            <div key={champ} style={S.champ}>
              <div style={S.champLbl}>{lbl}</div>
              <div style={S.champVal}>
                <span style={S.valTxt}>{val}</span>
                <button style={S.btnCopy(copie === champ)} onClick={() => copier(val, champ)}>
                  {copie === champ ? '✓ Copié' : '📋 Copier'}
                </button>
              </div>
            </div>
          ))}

          <div style={{ background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#5B21B6', marginTop: 4 }}>
            <strong>URL de connexion :</strong> http://localhost:3003/connexion<br />
            <strong>Rôle :</strong> Responsable RH - accès au tableau de bord entreprise uniquement
          </div>
        </div>
        <div style={S.footer}>
          <button style={S.btnFerm} onClick={onFermer}>J'ai noté les identifiants</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale entreprise ───────────────────────────────────────────────────────
// modeValidation : réutilisation de ce même formulaire pour valider une inscription
// soumise par une assistante - préremplit tout depuis l'entreprise en attente, et garde la
// section "Compte RH" visible (contrairement à une simple édition) puisque le compte n'a
// pas encore été créé à ce stade.
function ModalEntreprise({ entreprise, modeValidation, onFermer, onSauvegarder }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile } = useAuth();
  const alerte = useAlerte();
  const confirm = useConfirm();
  // Seuls l'admin BET (manager/superviseur) et l'Assistant E-Learning peuvent augmenter le
  // quota de bénéficiaires ici, même hors création - les autres doivent passer par l'onglet
  // Contrats pour ne pas décaler le contrat réel.
  const peutModifierQuota = estRole(profile?.role, ['admin_manager', 'admin_superviseur', 'admin_elearning']);
  const [form, setForm] = useState(() => {
    if (entreprise && modeValidation) {
      // Pré-remplissage best-effort du compte RH depuis le contact transmis à la soumission.
      const parts = (entreprise.referent_rh_nom || '').trim().split(/\s+/);
      return {
        ...entreprise,
        rh_prenom: parts.length > 1 ? parts[0] : '',
        rh_nom:    parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || ''),
        rh_email:  entreprise.referent_rh_email || '',
      };
    }
    if (entreprise) {
      return {
        ...entreprise,
        // Normalise les champs RH pour l'édition (pas de compte RH recréé)
        rh_prenom: '', rh_nom: '', rh_email: '',
      };
    }
    return {
      nom: '', rccm: '', initiales: '', secteur: SECTEURS[0],
      referent_rh_email: '', referent_rh_telephone: '', referent_rh_nom: '',
      adresse: '', ville: 'Abidjan', pays: "Côte d'Ivoire",
      package_elearning: 'business', nb_licences: 10,
      libelle_personnalise: '', tarif_personnalise: '',
      statut: 'actif', notes: '',
      date_debut_contrat: '', date_fin_contrat: '',
      option_replay: false,
      types_sessions: ['ligne'],
      rh_prenom: '', rh_nom: '', rh_email: '',
      logo_url: null,
    };
  });
  const [logoPreview, setLogoPreview] = useState(entreprise?.logo_url || null);
  const [logoHover, setLogoHover]     = useState(false);
  const isCreation = !entreprise || modeValidation;
  // Pré-remplit automatiquement le compte d'accès RH à partir du "Responsable / Interlocuteur
  // BET" saisi juste au-dessus - évite de retaper le même nom/email deux fois lors d'une
  // création franche. Reste modifiable si le login doit différer du contact principal.
  // (modeValidation a déjà sa propre logique de pré-remplissage à l'ouverture, voir plus haut -
  // on ne la retouche pas ici pour ne pas écraser une correction déjà faite par l'admin.)
  const [rhAutoRempli, setRhAutoRempli] = useState({ prenom: true, nom: true, email: true });
  useEffect(() => {
    if (entreprise) return; // uniquement en création franche, pas en édition ni validation
    const parts = (form.referent_rh_nom || '').trim().split(/\s+/).filter(Boolean);
    if (rhAutoRempli.prenom) ch('rh_prenom', parts.length > 1 ? parts[0] : '');
    if (rhAutoRempli.nom)    ch('rh_nom', parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.referent_rh_nom]);
  useEffect(() => {
    if (entreprise) return;
    if (rhAutoRempli.email) ch('rh_email', form.referent_rh_email || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.referent_rh_email]);

  async function gererLogo(e) {
    const fichier = e.target.files[0];
    if (!fichier) return;
    setLogoPreview(URL.createObjectURL(fichier));
    try {
      const fd = new FormData();
      fd.append('logo', fichier);
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_URL}/api/entreprise/admin/upload-logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      ch('logo_url', data.logo_url);
    } catch (err) {
      console.error('Erreur upload logo:', err);
      await alerte('Impossible d\'uploader le logo : ' + err.message, { titre: 'Upload du logo', danger: true });
    }
  }

  const [preuveUploading, setPreuveUploading] = useState(false);
  const [preuveFichierEnAttente, setPreuveFichierEnAttente] = useState(null); // { file } - sélectionné mais pas encore envoyé
  function gererPreuve(e) {
    const fichier = e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) { alerte('Fichier trop lourd (max 10 Mo).', { titre: 'Fichier trop volumineux', danger: true }); return; }
    setPreuveFichierEnAttente(fichier);
  }
  async function validerPreuve() {
    if (!preuveFichierEnAttente) return;
    setPreuveUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', preuveFichierEnAttente);
      const token = localStorage.getItem('admin_token');
      const res = await fetchUpload(`${API_URL}/api/upload/document`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      ch('fichier_preuve_url', data.file.url);
      ch('fichier_preuve_nom', preuveFichierEnAttente.name);
      setPreuveFichierEnAttente(null);
    } catch (err) {
      console.error('Erreur upload preuve:', err);
      await alerte('Impossible d\'uploader le fichier : ' + err.message, { titre: 'Upload du document', danger: true });
    } finally {
      setPreuveUploading(false);
    }
  }

  const packagesActifs = lirePackages().filter(p => p.actif !== false);
  const estPersonnalise = form.package_elearning === 'personnalise';
  const pkg = estPersonnalise
    ? { libelle: form.libelle_personnalise || 'Personnalisé', tarif: form.tarif_personnalise || 0, max_benef: 999, couleur: '#7C3AED' }
    : packagesActifs.find((p) => p.id === form.package_elearning) || packagesActifs[0] || {};
  const ca = (pkg.tarif || 0) * (form.nb_licences || 0);

  function ch(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modal: { background: COULEURS.blanc, borderRadius: 16, padding: 32, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' },
    titre: { fontSize: 18, fontWeight: 800, color: COULEURS.navy, marginBottom: 24, display: 'flex', justifyContent: 'space-between' },
    btnX: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COULEURS.gris400 },
    section: { marginBottom: 20 },
    sectionTitre: { fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${COULEURS.gris100}` },
    grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
    groupe: { display: 'flex', flexDirection: 'column', gap: 5 },
    label: { fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em' },
    input: { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    select: { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.blanc, color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    textarea: { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 72 },
    caBadge: { background: '#D1FAE5', color: '#065F46', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 700, marginTop: 8, display: 'flex', justifyContent: 'space-between' },
    btnRow: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 },
    btnCancel: { padding: '10px 20px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnSave: { padding: '10px 24px', borderRadius: 8, border: 'none', background: couleurTheme, color: COULEURS.blanc, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.titre}>
          <span>{modeValidation ? `✓ Valider l'inscription de ${entreprise.nom}` : entreprise ? 'Modifier l\'entreprise' : '+ Créer un compte entreprise'}</span>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>
        {modeValidation && (
          <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 10, padding: '10px 16px', fontSize: 12, color: '#065F46', marginBottom: 20 }}>
            ✅ Vérifiez et corrigez si besoin les informations soumises par l'assistante, puis complétez le compte RH avant de valider.
          </div>
        )}

        {/* ── Logo / Photo de profil ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${COULEURS.gris100}` }}>
          <label
            htmlFor="logo-upload"
            style={{ cursor: 'pointer', position: 'relative', flexShrink: 0 }}
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
          >
            {/* Cercle avatar */}
            <div style={{
              width: 96, height: 96, borderRadius: 20,
              background: logoPreview ? 'transparent' : `linear-gradient(135deg, ${couleurTheme}, ${couleurThemeFonce})`,
              border: `3px solid ${logoHover ? couleurTheme : COULEURS.gris200}`,
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.15s',
              boxShadow: logoHover ? `0 0 0 4px ${couleurTheme}25` : 'none',
            }}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>
                  {form.nom ? form.nom.slice(0, 2).toUpperCase() : '🏢'}
                </span>
              )}
            </div>

            {/* Overlay caméra */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 20,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: logoHover ? 1 : 0, transition: 'opacity 0.15s',
            }}>
              <span style={{ fontSize: 24 }}>📷</span>
            </div>

            <input
              id="logo-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: 'none' }}
              onChange={gererLogo}
            />
          </label>

          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>
              Logo / Photo de profil
            </div>
            <div style={{ fontSize: 12, color: COULEURS.gris400, lineHeight: 1.6, marginBottom: 10 }}>
              PNG, JPG, WEBP ou SVG - max 2 Mo<br />
              Recommandé : 200×200 px minimum
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label htmlFor="logo-upload" style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${couleurTheme}`, color: couleurTheme, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {logoPreview ? '🔄 Changer' : '⬆ Importer'}
              </label>
              {logoPreview && (
                <button
                  type="button"
                  onClick={() => { setLogoPreview(null); ch('logo_url', null); }}
                  style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                >
                  🗑 Supprimer
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Infos générales */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Informations générales</div>
          <div style={{ ...S.grille2, marginBottom: 12 }}>
            <div style={S.groupe}>
              <label style={S.label}>Nom de l'entreprise *</label>
              <input style={S.input} value={form.nom} onChange={(e) => ch('nom', e.target.value)} placeholder="TLG PHARMA" />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Secteur d'activité *</label>
              <select
                style={S.select}
                value={SECTEURS.includes(form.secteur) ? form.secteur : 'Autre'}
                onChange={(e) => ch('secteur', e.target.value === 'Autre' ? '' : e.target.value)}
              >
                {SECTEURS.map((s) => <option key={s}>{s}</option>)}
              </select>
              {(!SECTEURS.includes(form.secteur) || form.secteur === '') && (
                <input
                  style={{ ...S.input, marginTop: 8, borderColor: couleurTheme }}
                  value={SECTEURS.includes(form.secteur) ? '' : form.secteur}
                  onChange={(e) => ch('secteur', e.target.value)}
                  placeholder="Précisez votre secteur d'activité…"
                  autoFocus
                />
              )}
            </div>
          </div>
          <div style={{ ...S.grille2, marginBottom: 12 }}>
            <div style={S.groupe}>
              <label style={S.label}>Email de contact *</label>
              <input style={S.input} type="email" value={form.referent_rh_email || ''} onChange={(e) => ch('referent_rh_email', e.target.value)} placeholder="contact@entreprise.ci" />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Téléphone</label>
              <input style={S.input} value={form.referent_rh_telephone || ''} onChange={(e) => ch('referent_rh_telephone', e.target.value)} placeholder="+225 27 20 00 00 00" />
            </div>
          </div>
          <div style={{ ...S.grille2 }}>
            <div style={S.groupe}>
              <label style={S.label}>Responsable / Interlocuteur BET</label>
              <input style={S.input} value={form.referent_rh_nom || ''} onChange={(e) => ch('referent_rh_nom', e.target.value)} placeholder="Nom du contact principal" />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>RCCM</label>
              <input style={S.input} value={form.rccm || ''} onChange={(e) => ch('rccm', e.target.value)} placeholder="CI-ABJ-2024-…" />
            </div>
          </div>
        </div>

        {/* ── Charte graphique ── */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Charte graphique du dashboard client</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginBottom: 14, lineHeight: 1.6 }}>
            Cette couleur sera appliquée à la bannière et aux accents du tableau de bord de l'entreprise.
          </div>

          {/* Palette prédéfinie */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { hex: '#0891B2', nom: 'Cyan BET'      },
              { hex: '#003087', nom: 'Marine'         },
              { hex: '#F97316', nom: 'Orange'         },
              { hex: '#DC2626', nom: 'Rouge'          },
              { hex: '#7C3AED', nom: 'Violet'         },
              { hex: '#059669', nom: 'Vert'           },
              { hex: '#0E7490', nom: 'Bleu pétrole'  },
              { hex: '#B45309', nom: 'Ambre'          },
              { hex: '#BE185D', nom: 'Rose foncé'    },
              { hex: '#1D4ED8', nom: 'Bleu roi'      },
              { hex: '#374151', nom: 'Ardoise'        },
              { hex: '#0F766E', nom: 'Sarcelle'       },
            ].map(({ hex, nom }) => (
              <button
                key={hex}
                type="button"
                title={nom}
                onClick={() => ch('couleur', hex)}
                style={{
                  width: 36, height: 36, borderRadius: 10, background: hex, border: 'none',
                  cursor: 'pointer', flexShrink: 0, transition: 'transform 0.15s, box-shadow 0.15s',
                  outline: form.couleur === hex ? `3px solid ${hex}` : '3px solid transparent',
                  outlineOffset: 2,
                  boxShadow: form.couleur === hex ? `0 0 0 2px #fff, 0 0 0 4px ${hex}` : '0 2px 4px rgba(0,0,0,0.15)',
                  transform: form.couleur === hex ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>

          {/* Prévisualisation + sélecteur libre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Couleur personnalisée</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                <input
                  type="color"
                  value={form.couleur || '#0891B2'}
                  onChange={e => ch('couleur', e.target.value)}
                  style={{ width: 44, height: 36, borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, cursor: 'pointer', padding: 2, background: 'transparent' }}
                />
                <input
                  style={{ ...S.input, fontFamily: 'monospace', textTransform: 'uppercase', width: 120 }}
                  value={form.couleur || '#0891B2'}
                  onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) ch('couleur', e.target.value); }}
                  placeholder="#0891B2"
                  maxLength={7}
                />
              </div>
            </div>

            {/* Aperçu bannière */}
            <div style={{ flex: 2, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
              <div style={{ background: `linear-gradient(135deg, ${form.couleur || '#003087'} 0%, ${form.couleur || '#0891B2'}CC 100%)`, padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                  {form.nom || 'Mon Entreprise'} × BET
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
                  Aperçu de la bannière du dashboard
                </div>
              </div>
              <div style={{ background: COULEURS.blanc, padding: '10px 18px', display: 'flex', gap: 8 }}>
                {['Tableau de bord', 'Bénéficiaires', 'Rapports'].map(l => (
                  <span key={l} style={{ fontSize: 11, fontWeight: 600, color: form.couleur || couleurTheme, padding: '3px 10px', borderRadius: 20, background: (form.couleur || couleurTheme) + '18' }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Adresse */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Adresse</div>
          <div style={{ ...S.grille2, marginBottom: 12 }}>
            <div style={S.groupe}>
              <label style={S.label}>Ville</label>
              <input style={S.input} value={form.ville} onChange={(e) => ch('ville', e.target.value)} placeholder="Abidjan" />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Pays</label>
              <input style={S.input} value={form.pays || ''} onChange={(e) => ch('pays', e.target.value)} placeholder="Côte d'Ivoire" />
            </div>
          </div>
          <div style={S.groupe}>
            <label style={S.label}>Adresse complète</label>
            <input style={S.input} value={form.adresse} onChange={(e) => ch('adresse', e.target.value)} placeholder="Quartier, Rue…" />
          </div>
          <div style={{ ...S.groupe, marginTop: 12 }}>
            <label style={S.label}>Site web (optionnel)</label>
            <input style={S.input} type="url" value={form.site_web || ''} onChange={(e) => ch('site_web', e.target.value)} placeholder="https://entreprise.ci" />
          </div>
        </div>

        {/* ── Modalités de sessions ── */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Modalités de formation</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginBottom: 16, lineHeight: 1.6 }}>
            Choisissez les types de sessions disponibles pour les apprenants de cette entreprise.
            Une entreprise peut démarrer en présentiel uniquement et ajouter les sessions live à tout moment.
          </div>

          {/* Cartes toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {[
              {
                val: 'presentiel',
                ic: '🏢',
                lib: 'Présentiel',
                sub: 'Cours en salle, chez le client ou dans un centre.',
                desc: 'Le coach se déplace ou les apprenants convergent vers un lieu. Aucun lien de visioconférence requis.',
                col: '#F59E0B',
                bgOff: '#FFFBEB',
              },
              {
                val: 'ligne',
                ic: '📹',
                lib: 'En ligne (Live)',
                sub: 'Sessions live via Zoom, Google Meet ou Teams.',
                desc: 'Les apprenants rejoignent la session depuis partout. Un lien de visioconférence est partagé avant chaque cours.',
                col: couleurTheme,
                bgOff: '#EFF6FF',
              },
            ].map(({ val, ic, lib, sub, desc, col, bgOff }) => {
              const actif = (form.types_sessions || ['ligne']).includes(val);
              const seulActif = actif && (form.types_sessions || []).length === 1;
              return (
                <div
                  key={val}
                  onClick={() => {
                    if (seulActif || !isCreation) return;
                    const ts = form.types_sessions || ['ligne'];
                    const nouveaux = actif ? ts.filter(t => t !== val) : [...ts, val];
                    // Désactiver option_replay si "ligne" est retiré
                    if (val === 'ligne' && actif) {
                      setForm(f => ({ ...f, types_sessions: nouveaux, option_replay: false }));
                    } else {
                      ch('types_sessions', nouveaux);
                    }
                  }}
                  style={{
                    padding: '16px 18px', borderRadius: 12, cursor: (seulActif || !isCreation) ? 'not-allowed' : 'pointer',
                    border: `2px solid ${actif ? col : COULEURS.gris200}`,
                    background: actif ? `${col}12` : bgOff,
                    transition: 'all 0.15s',
                    opacity: !isCreation ? 0.55 : (seulActif ? 0.7 : 1),
                    position: 'relative',
                  }}
                >
                  {actif && (
                    <div style={{ position: 'absolute', top: 10, right: 10, background: col, color: '#fff', borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 700 }}>
                      ✓ Activé
                    </div>
                  )}
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{ic}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: actif ? col : COULEURS.navy, marginBottom: 4 }}>{lib}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: actif ? col : COULEURS.gris600, marginBottom: 8 }}>{sub}</div>
                  <div style={{ fontSize: 11, color: COULEURS.gris400, lineHeight: 1.5 }}>{desc}</div>
                </div>
              );
            })}
          </div>

          {/* Info contextuelle */}
          {(() => {
            const ts = form.types_sessions || ['ligne'];
            const hybride = ts.includes('presentiel') && ts.includes('ligne');
            const presentielOnly = ts.includes('presentiel') && !ts.includes('ligne');
            const ligneOnly = ts.includes('ligne') && !ts.includes('presentiel');
            if (hybride) return (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#F5F3FF', border: '1px solid #DDD6FE', fontSize: 12, color: '#5B21B6', fontWeight: 600 }}>
                🔀 Formule hybride - les coaches pourront planifier des sessions présentielle <strong>et</strong> en ligne pour cette entreprise.
              </div>
            );
            if (presentielOnly) return (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 12, color: '#92400E' }}>
                🏢 <strong>Présentiel uniquement.</strong> Les sessions en ligne peuvent être ajoutées à tout moment en activant l'option ci-dessus.
              </div>
            );
            if (ligneOnly) return (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: 12, color: '#1E40AF' }}>
                📹 <strong>En ligne uniquement.</strong> Les sessions live nécessitent un lien Zoom/Meet/Teams à chaque séance.
              </div>
            );
            return null;
          })()}
        </div>

        {/* ── Options payantes (uniquement si "En ligne" activé) ── */}
        {(form.types_sessions || ['ligne']).includes('ligne') && (
          <div style={S.section}>
            <div style={S.sectionTitre}>Options payantes</div>
            <div
              onClick={() => { if (isCreation) ch('option_replay', !form.option_replay); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderRadius: 12, cursor: isCreation ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                border: `1.5px solid ${form.option_replay ? '#8B5CF6' : COULEURS.gris200}`,
                background: form.option_replay ? '#F5F3FF' : COULEURS.gris50,
                opacity: isCreation ? 1 : 0.55,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>▶️</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.option_replay ? '#5B21B6' : COULEURS.navy }}>
                    Replay des sessions
                  </div>
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>
                    Accès aux enregistrements des sessions live · Option payante · +15% du montant contrat
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {form.option_replay && ca > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7C3AED', background: '#EDE9FE', padding: '3px 10px', borderRadius: 20 }}>
                    +{formatFCFA(Math.round(ca * 0.15))}
                  </span>
                )}
                <div
                  onClick={e => { e.stopPropagation(); if (isCreation) ch('option_replay', !form.option_replay); }}
                  style={{ width: 46, height: 26, borderRadius: 13, background: form.option_replay ? '#8B5CF6' : COULEURS.gris200, position: 'relative', cursor: isCreation ? 'pointer' : 'not-allowed', transition: 'background 0.2s', flexShrink: 0 }}
                >
                  <div style={{ position: 'absolute', top: 3, left: form.option_replay ? 22 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </div>
              </div>
            </div>
            {form.option_replay && ca > 0 && (
              <div style={{ marginTop: 8, padding: '8px 14px', borderRadius: 8, background: '#EDE9FE', fontSize: 12, color: '#5B21B6', fontWeight: 600 }}>
                💜 Total avec option replay : <strong>{formatFCFA(ca + Math.round(ca * 0.15))}</strong>
              </div>
            )}
          </div>
        )}

        {/* Contrat */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Contrat & Package</div>
          {!isCreation && (
            <div style={{ background: '#F1F5F9', border: `1px solid ${COULEURS.gris200}`, borderRadius: 8, padding: '8px 14px', fontSize: 11, color: COULEURS.gris600, marginBottom: 12 }}>
              🔒 Ces champs sont figés ici pour éviter un décalage avec le vrai contrat - pour les modifier, ouvrez le contrat correspondant dans l'onglet Contrats.
              {peutModifierQuota && ' Le nombre de bénéficiaires reste modifiable ci-contre (admin BET / Assistant E-Learning).'}
            </div>
          )}
          <div style={{ ...S.grille2, marginBottom: 12 }}>
            <div style={S.groupe}>
              <label style={S.label}>Package *</label>
              <select style={{ ...S.select, ...(!isCreation ? { background: COULEURS.gris100, color: COULEURS.gris400, cursor: 'not-allowed' } : {}) }} disabled={!isCreation} value={form.package_elearning || ''} onChange={(e) => ch('package_elearning', e.target.value)}>
                <option value="" disabled>- Sélectionner -</option>
                {packagesActifs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.libelle} - {(p.tarif||0).toLocaleString('fr-FR')} FCFA/bénéf. (max {p.max_benef >= 999 ? '∞' : p.max_benef})
                  </option>
                ))}
                <option value="personnalise">➕ Package personnalisé…</option>
              </select>
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Nombre de bénéficiaires</label>
              <input style={{ ...S.input, ...((!isCreation && !peutModifierQuota) ? { background: COULEURS.gris100, color: COULEURS.gris400, cursor: 'not-allowed' } : {}) }} disabled={!isCreation && !peutModifierQuota} type="number" min="1" max={pkg.max_benef}
                value={form.nb_licences || ''}
                onChange={(e) => ch('nb_licences', parseInt(e.target.value) || 0)} />
            </div>
          </div>
          {estPersonnalise && (
            <div style={{ ...S.grille2, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={S.groupe}>
                <label style={S.label}>Libellé de l'offre *</label>
                <input style={{ ...S.input, ...(!isCreation ? { background: COULEURS.gris100, color: COULEURS.gris400, cursor: 'not-allowed' } : {}) }} disabled={!isCreation}
                  value={form.libelle_personnalise || ''} placeholder="Ex : Offre corporate Q3 2026"
                  onChange={(e) => ch('libelle_personnalise', e.target.value)} />
              </div>
              <div style={S.groupe}>
                <label style={S.label}>Tarif / bénéficiaire (FCFA) *</label>
                <input style={{ ...S.input, ...(!isCreation ? { background: COULEURS.gris100, color: COULEURS.gris400, cursor: 'not-allowed' } : {}) }} disabled={!isCreation}
                  type="number" min="0" value={form.tarif_personnalise || ''} placeholder="ex : 150000"
                  onChange={(e) => ch('tarif_personnalise', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          )}
          <div style={S.grille2}>
            <div style={S.groupe}>
              <label style={S.label}>Date de début</label>
              <input style={{ ...S.input, ...(!isCreation ? { background: COULEURS.gris100, color: COULEURS.gris400, cursor: 'not-allowed' } : {}) }} disabled={!isCreation} type="date" value={form.date_debut_contrat} onChange={(e) => ch('date_debut_contrat', e.target.value)} />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Date de fin</label>
              <input style={{ ...S.input, ...(!isCreation ? { background: COULEURS.gris100, color: COULEURS.gris400, cursor: 'not-allowed' } : {}) }} disabled={!isCreation} type="date" value={form.date_fin_contrat} onChange={(e) => ch('date_fin_contrat', e.target.value)} />
            </div>
          </div>
          {ca > 0 && (
            <div style={S.caBadge}>
              <span>CA estimé du contrat</span>
              <span>{formatFCFA(ca)}</span>
            </div>
          )}
        </div>

        {modeValidation && (!form.package_elearning || !form.date_debut_contrat || !form.date_fin_contrat) && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#991B1B', marginBottom: 18 }}>
            ⚠️ Package ou dates de contrat manquants - aucun contrat ne sera créé automatiquement à la validation. Complétez-les ci-dessus, ou créez le contrat manuellement depuis l'onglet Contrats après validation.
          </div>
        )}

        {/* Compte RH - à la création, ou lors d'une validation de parcours */}
        {isCreation && (
          <div style={S.section}>
            <div style={{ ...S.sectionTitre, color: couleurTheme, borderColor: couleurThemeClair }}>
              🔑 Compte d'accès RH - Dashboard entreprise
            </div>
            <div style={{ background: couleurThemeClair, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: couleurThemeFonce }}>
              Un compte de connexion sera automatiquement généré pour le responsable RH. Il permettra d'accéder au tableau de bord de l'entreprise (bénéficiaires, progression, rapports).
            </div>
            <div style={{ fontSize: 11, color: couleurThemeFonce, marginBottom: 10 }}>
              ✓ Pré-rempli depuis le contact ci-dessus - modifiez si le compte de connexion doit être différent.
            </div>
            <div style={{ ...S.grille2, marginBottom: 12 }}>
              <div style={S.groupe}>
                <label style={S.label}>Prénom RH *</label>
                <input style={S.input} value={form.rh_prenom} onChange={(e) => { setRhAutoRempli(p => ({ ...p, prenom: false })); ch('rh_prenom', e.target.value); }} placeholder="Prénom du responsable RH" />
              </div>
              <div style={S.groupe}>
                <label style={S.label}>Nom RH *</label>
                <input style={S.input} value={form.rh_nom} onChange={(e) => { setRhAutoRempli(p => ({ ...p, nom: false })); ch('rh_nom', e.target.value); }} placeholder="Nom du responsable RH" />
              </div>
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Email de connexion RH *</label>
              <input style={S.input} type="email" value={form.rh_email}
                onChange={(e) => { setRhAutoRempli(p => ({ ...p, email: false })); ch('rh_email', e.target.value); }}
                placeholder="rh@entreprise.ci - servira d'identifiant de connexion" />
            </div>
            <div style={{ background: COULEURS.gris50, borderRadius: 8, padding: '10px 14px', marginTop: 10, fontSize: 12, color: COULEURS.gris600, display: 'flex', justifyContent: 'space-between' }}>
              <span>🔐 Mot de passe temporaire généré :</span>
              <strong style={{ fontFamily: 'monospace', color: COULEURS.navy }}>
                {form.nom ? genererMotDePasse(form.nom) : `BET-NOM-${new Date().getFullYear()}`}
              </strong>
            </div>
          </div>
        )}

        {/* ── Documents ── */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Documents</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginBottom: 10 }}>
            Contrat signé, bon de commande… - PDF, Word ou Excel, 10 Mo max.
          </div>
          {form.fichier_preuve_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.gris50 }}>
              <span style={{ fontSize: 18 }}>📎</span>
              <a href={form.fichier_preuve_url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13, fontWeight: 600, color: couleurTheme, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {form.fichier_preuve_nom || 'Voir le fichier'}
              </a>
              <button type="button" onClick={() => { ch('fichier_preuve_url', null); ch('fichier_preuve_nom', ''); }}
                style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                🗑 Retirer
              </button>
            </div>
          ) : preuveFichierEnAttente ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${couleurTheme}`, background: `${couleurTheme}08` }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preuveFichierEnAttente.name}
              </span>
              <button type="button" onClick={() => setPreuveFichierEnAttente(null)} disabled={preuveUploading}
                style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: preuveUploading ? 'default' : 'pointer', background: 'transparent', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                ✕ Annuler
              </button>
              <button type="button" onClick={validerPreuve} disabled={preuveUploading}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: preuveUploading ? 'wait' : 'pointer', background: couleurTheme, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                {preuveUploading ? 'Envoi…' : '✅ Valider'}
              </button>
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 8, border: `1.5px dashed ${COULEURS.gris200}`, cursor: 'pointer', color: COULEURS.gris600, fontSize: 13 }}>
              <span style={{ fontSize: 18 }}>⬆️</span>
              Importer un fichier
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={gererPreuve} />
            </label>
          )}
        </div>

        {/* Notes */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Notes internes</div>
          <textarea style={S.textarea} value={form.notes} onChange={(e) => ch('notes', e.target.value)} placeholder="Informations complémentaires, conditions particulières…" />
        </div>

        <div style={S.btnRow}>
          <button style={S.btnCancel} onClick={onFermer}>Annuler</button>
          <button style={S.btnSave} onClick={async () => {
            // Confirmation pour une création franche et pour une modification - pas pour la
            // validation d'un parcours déjà soumis (déjà un acte volontaire distinct, avec sa
            // propre confirmation dans le flux "valider").
            if (!entreprise && !modeValidation) {
              if (!(await confirm(`Créer l'entreprise "${form.nom || 'sans nom'}" et son compte RH ?`, { titre: 'Confirmer la création' }))) return;
            } else if (entreprise && !modeValidation) {
              if (!(await confirm(`Enregistrer les modifications apportées à "${form.nom || entreprise.nom}" ?`, { titre: 'Confirmer la modification' }))) return;
            }
            // `ca` (package.tarif × nb_licences) n'était affiché qu'à l'écran ("CA estimé du
            // contrat") sans jamais être renvoyé au serveur - montant_contrat restait à 0 sur
            // la fiche entreprise malgré un package et un nombre de bénéficiaires renseignés.
            onSauvegarder({ ...form, montant_contrat: ca });
          }}>
            {modeValidation ? '✓ Valider et créer le compte RH' : entreprise ? 'Enregistrer' : '🏢 Créer l\'entreprise + compte RH'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Modale détail entreprise ────────────────────────────────────────────────
// ─── Modale ajout de versement ──────────────────────────────────────────────
function ModalAjoutVersement({ entreprise, echeanceLiee, echeanciers, soldeRestant, paiementAModifier, onFermer, onSauvegarder }) {
  const confirm = useConfirm();
  const today = new Date().toISOString().split('T')[0];
  const enEdition = !!paiementAModifier;
  const [form, setForm] = useState(() => enEdition ? {
    entreprise_id: entreprise.id,
    montant: paiementAModifier.montant,
    date: (paiementAModifier.date || '').slice(0, 10),
    mode: paiementAModifier.mode || MODES_PAIEMENT[0],
    reference: paiementAModifier.reference || '',
    note: paiementAModifier.note || '',
    echeance_id: paiementAModifier.echeance_id || '',
  } : {
    entreprise_id: entreprise.id,
    montant: echeanceLiee ? echeanceLiee.montant : '',
    date: today,
    mode: MODES_PAIEMENT[0],
    reference: '',
    note: echeanceLiee ? echeanceLiee.libelle : '',
    echeance_id: echeanceLiee?.id || '',
  });

  function ch(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' },
    modal: { background: COULEURS.blanc, borderRadius: 16, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' },
    header: { background: `linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    headerTitre: { fontSize: 16, fontWeight: 800, color: '#fff' },
    headerSous: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
    btnX: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#fff' },
    corps: { padding: 24 },
    groupe: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 },
    label: { fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em' },
    input: { padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    select: { padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.blanc, color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 },
    infoSolde: { background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#065F46', display: 'flex', justifyContent: 'space-between' },
    echeanceBadge: { background: entreprise.couleur + '15', border: `1px solid ${entreprise.couleur}40`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: entreprise.couleur, fontWeight: 600 },
    footer: { padding: '16px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 12, justifyContent: 'flex-end' },
    btnCancel: { padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnSave: { padding: '9px 22px', borderRadius: 8, border: 'none', background: entreprise.couleur, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.headerTitre}>{enEdition ? '✏️ Modifier le versement' : '💰 Enregistrer un versement'}</div>
            <div style={S.headerSous}>{entreprise.nom}</div>
          </div>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>

        <div style={S.corps}>
          {/* Solde restant */}
          <div style={S.infoSolde}>
            <span>Solde restant dû</span>
            <strong>{formatFCFA(soldeRestant)}</strong>
          </div>

          {/* Échéance liée (si pré-sélectionnée) */}
          {echeanceLiee && (
            <div style={S.echeanceBadge}>
              📅 Échéance liée : <strong>{echeanceLiee.libelle}</strong> - prévue le {echeanceLiee.date_prevue}
            </div>
          )}

          {/* Lier à une échéance */}
          {!enEdition && !echeanceLiee && echeanciers.filter(e => e.statut !== 'paye').length > 0 && (
            <div style={S.groupe}>
              <label style={S.label}>Lier à une échéance (optionnel)</label>
              <select style={S.select} value={form.echeance_id} onChange={e => ch('echeance_id', e.target.value)}>
                <option value="">- Versement libre -</option>
                {echeanciers.filter(e => e.statut !== 'paye').map(e => (
                  <option key={e.id} value={e.id}>{e.libelle} - {formatFCFA(e.montant)} (prévu {e.date_prevue})</option>
                ))}
              </select>
            </div>
          )}

          {/* Montant + Date */}
          <div style={S.grille2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={S.label}>Montant (FCFA) *</label>
              <input style={S.input} type="number" min="0" value={form.montant}
                onChange={e => ch('montant', parseInt(e.target.value) || '')}
                placeholder="ex: 2 750 000" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={S.label}>Date du versement *</label>
              <input style={S.input} type="date" value={form.date} onChange={e => ch('date', e.target.value)} />
            </div>
          </div>

          {/* Mode + Référence */}
          <div style={S.grille2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={S.label}>Mode de paiement *</label>
              <select style={S.select} value={form.mode} onChange={e => ch('mode', e.target.value)}>
                {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={S.label}>Référence / N° bordereau</label>
              <input style={S.input} value={form.reference} onChange={e => ch('reference', e.target.value)} placeholder="VIR-2025-XXX" />
            </div>
          </div>

          {/* Note */}
          <div style={S.groupe}>
            <label style={S.label}>Note / Libellé</label>
            <input style={S.input} value={form.note} onChange={e => ch('note', e.target.value)} placeholder="Ex : Règlement T3 2025" />
          </div>
        </div>

        <div style={S.footer}>
          <button style={S.btnCancel} onClick={onFermer}>Annuler</button>
          <button
            style={{ ...S.btnSave, opacity: !form.montant || !form.date ? 0.5 : 1 }}
            disabled={!form.montant || !form.date}
            onClick={async () => {
              const msg = enEdition
                ? `Corriger ce versement à ${formatFCFA(form.montant)} pour ${entreprise.nom} ?`
                : `Enregistrer un versement de ${formatFCFA(form.montant)} pour ${entreprise.nom} ?`;
              if (!(await confirm(msg, { titre: enEdition ? 'Confirmer la correction' : 'Confirmer le versement', confirmLabel: enEdition ? 'Corriger' : 'Enregistrer', danger: false }))) return;
              onSauvegarder(form);
            }}
          >
            {enEdition ? '✓ Enregistrer la correction' : '✓ Enregistrer le versement'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale renouvellement de contrat ──────────────────────────────────────
// Contrairement à "Modifier l'entreprise" (qui mute le contrat actif en place et efface ses
// anciennes conditions), ce formulaire appelle POST /admin/:id/renouveler-contrat : l'ancien
// contrat est archivé (statut → 'expire') et un nouveau contrat 'actif' est créé - les classes,
// bénéficiaires et versements de l'entreprise ne sont jamais touchés (rattachés à entreprise_id).
export function ModalRenouvellementContrat({ entreprise, onFermer, onSauvegarder, modeProposition = false, beneficiairesActifs = 0 }) {
  const { couleurTheme } = useTheme();
  const confirm = useConfirm();
  const [placesSupplementaires, setPlacesSupplementaires] = useState(0);
  const [form, setForm] = useState({
    package_elearning: entreprise.package_elearning || '',
    nb_licences: Math.max(entreprise.nb_licences || 10, beneficiairesActifs),
    libelle_personnalise: '', tarif_personnalise: '',
    date_debut_contrat: '', date_fin_contrat: '',
    option_replay: entreprise.option_replay || false,
    types_sessions: entreprise.types_sessions || ['ligne'],
  });
  function ch(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const packagesActifs = lirePackages().filter(p => p.actif !== false);
  const estPersonnalise = form.package_elearning === 'personnalise';
  const pkg = estPersonnalise
    ? { libelle: form.libelle_personnalise || 'Personnalisé', tarif: form.tarif_personnalise || 0, max_benef: 999, couleur: '#7C3AED' }
    : packagesActifs.find(p => p.id === form.package_elearning) || {};
  const ca = Math.round((pkg.tarif || 0) * (form.nb_licences || 0));
  const nbLicencesInsuffisant = (form.nb_licences || 0) < beneficiairesActifs;
  // Le <input max=...> HTML n'empêche pas de taper directement un nombre plus grand - on
  // revalide donc explicitement contre le plafond du package choisi avant de pouvoir valider.
  const nbLicencesDepasseMax = pkg.max_benef != null && (form.nb_licences || 0) > pkg.max_benef;
  const ancienNbLicences = entreprise.nb_licences || 0;

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' },
    modal: { background: COULEURS.blanc, borderRadius: 16, width: 720, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' },
    header: { background: `linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0 },
    headerTitre: { fontSize: 16, fontWeight: 800, color: '#fff' },
    headerSous: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
    btnX: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#fff' },
    corps: { padding: 24 },
    groupe: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 },
    label: { fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em' },
    input: { padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    select: { padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.blanc, color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 },
    footer: { padding: '16px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 12, justifyContent: 'flex-end' },
    btnCancel: { padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnSave: { padding: '9px 22px', borderRadius: 8, border: 'none', background: entreprise.couleur, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  };

  const champsValides = form.package_elearning && form.nb_licences > 0 && form.date_debut_contrat && form.date_fin_contrat
    && !nbLicencesInsuffisant && !nbLicencesDepasseMax
    && (!estPersonnalise || (form.libelle_personnalise && form.tarif_personnalise > 0));

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div>
            <div style={S.headerTitre}>{modeProposition ? '🔄 Proposer un renouvellement' : '🔄 Renouveler le contrat'}</div>
            <div style={S.headerSous}>{entreprise.nom}</div>
          </div>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>

        <div style={S.corps}>
          <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#0369A1' }}>
            {modeProposition
              ? "ℹ️ Cette proposition sera envoyée à l'admin BET pour validation - le contrat actuel reste inchangé tant qu'elle n'est pas validée."
              : 'ℹ️ L\'ancien contrat sera archivé (statut "Expiré"), un nouveau contrat "Actif" sera créé avec les conditions ci-dessous. Les classes, bénéficiaires et versements existants ne sont pas affectés.'}
          </div>

          <div style={S.grille2}>
            <div style={S.groupe}>
              <label style={S.label}>Package *</label>
              <select style={S.select} value={form.package_elearning} onChange={e => ch('package_elearning', e.target.value)}>
                <option value="" disabled>- Sélectionner -</option>
                {packagesActifs.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.libelle} - {(p.tarif || 0).toLocaleString('fr-FR')} FCFA/bénéf. (max {p.max_benef >= 999 ? '∞' : p.max_benef})
                  </option>
                ))}
                <option value="personnalise">➕ Package personnalisé…</option>
              </select>
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Nombre de bénéficiaires (total) *</label>
              <input style={{ ...S.input, ...((nbLicencesInsuffisant || nbLicencesDepasseMax) ? { borderColor: '#DC2626', color: '#DC2626' } : {}) }} type="number" min={beneficiairesActifs || 1} max={pkg.max_benef} value={form.nb_licences}
                onChange={e => { ch('nb_licences', parseInt(e.target.value) || 0); setPlacesSupplementaires(0); }} />
              {beneficiairesActifs > 0 && (
                <div style={{ fontSize: 11, color: nbLicencesInsuffisant ? '#DC2626' : COULEURS.gris400, fontWeight: nbLicencesInsuffisant ? 700 : 400 }}>
                  {nbLicencesInsuffisant
                    ? `⚠️ Insuffisant : ${beneficiairesActifs} bénéficiaire(s) déjà actif(s) - indiquez le total pour la nouvelle période, pas un delta.`
                    : `ℹ️ ${beneficiairesActifs} bénéficiaire(s) actif(s) actuellement - ce nombre doit couvrir le total pour la nouvelle période.`}
                </div>
              )}
              {nbLicencesDepasseMax && (
                <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>
                  ⚠️ Dépasse le plafond du package choisi ({pkg.max_benef} max) - choisissez un package supérieur ou "Package personnalisé".
                </div>
              )}
            </div>
          </div>

          {ancienNbLicences > 0 && (
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#0369A1', marginBottom: 6 }}>
                💡 Aide au calcul - préserve les places déjà payées non utilisées (ne les recompte pas comme "nouvelles")
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: COULEURS.gris600, whiteSpace: 'nowrap' }}>Ancien total : <strong>{ancienNbLicences}</strong> +</span>
                <input
                  style={{ ...S.input, width: 90 }}
                  type="number" min="0"
                  value={placesSupplementaires}
                  onChange={e => {
                    const delta = Math.max(0, parseInt(e.target.value) || 0);
                    setPlacesSupplementaires(delta);
                    ch('nb_licences', ancienNbLicences + delta);
                  }}
                  placeholder="0"
                />
                <span style={{ fontSize: 12, color: COULEURS.gris600, whiteSpace: 'nowrap' }}>places supplémentaires = <strong>{ancienNbLicences + placesSupplementaires}</strong> places au total</span>
              </div>
            </div>
          )}

          {estPersonnalise && (
            <div style={{ ...S.grille2, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: 12 }}>
              <div style={S.groupe}>
                <label style={S.label}>Libellé de l'offre *</label>
                <input style={S.input} value={form.libelle_personnalise} placeholder="Ex : Offre corporate Q3 2026"
                  onChange={e => ch('libelle_personnalise', e.target.value)} />
              </div>
              <div style={S.groupe}>
                <label style={S.label}>Tarif / bénéficiaire (FCFA) *</label>
                <input style={S.input} type="number" min="0" value={form.tarif_personnalise} placeholder="ex : 150000"
                  onChange={e => ch('tarif_personnalise', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          )}

          <div style={S.grille2}>
            <div style={S.groupe}>
              <label style={S.label}>Date de début *</label>
              <input style={S.input} type="date" value={form.date_debut_contrat} onChange={e => ch('date_debut_contrat', e.target.value)} />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Date de fin *</label>
              <input style={S.input} type="date" value={form.date_fin_contrat} onChange={e => ch('date_fin_contrat', e.target.value)} />
            </div>
          </div>

          {ca > 0 && (
            <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#065F46', fontWeight: 700 }}>
              <span>CA estimé du nouveau contrat</span>
              <span>{ca.toLocaleString('fr-FR')} FCFA</span>
            </div>
          )}
        </div>

        <div style={S.footer}>
          <button style={S.btnCancel} onClick={onFermer}>Annuler</button>
          <button
            style={{ ...S.btnSave, opacity: champsValides ? 1 : 0.5 }}
            disabled={!champsValides}
            onClick={async () => {
              const msg = modeProposition
                ? `Proposer ce renouvellement pour ${entreprise.nom} (${form.nb_licences} bénéficiaires jusqu'au ${form.date_fin_contrat}) à l'admin BET ?`
                : `Renouveler le contrat de ${entreprise.nom} avec ${form.nb_licences} bénéficiaires jusqu'au ${form.date_fin_contrat} ? L'ancien contrat sera archivé.`;
              if (!(await confirm(msg, { titre: modeProposition ? 'Confirmer la proposition' : 'Confirmer le renouvellement', confirmLabel: modeProposition ? 'Proposer' : 'Renouveler', danger: false }))) return;
              onSauvegarder({ ...form, montant_contrat: ca });
            }}
          >
            {modeProposition ? '✓ Proposer le renouvellement' : '✓ Renouveler le contrat'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Modale détail bénéficiaire ──────────────────────────────────────────────
function ModalDetailBeneficiaire({ benef, entreprise, onFermer, onEditer }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const alerte = useAlerte();
  const [tab, setTab]             = useState('infos');

  // Le suivi réel (présences, évaluations, planning) n'existe que pour les bénéficiaires
  // "elearning" - benef.id correspond alors à classes_elearning_apprenants.id. Les bénéficiaires
  // "ancien" système (beneficiaires_entreprise) n'ont pas cette inscription réelle.
  // Deux chemins ouvrent ce modal : la liste "Bénéficiaires" (via /admin/:id/beneficiaires, qui
  // pose bien _source) et le clic sur un apprenant depuis l'onglet "Classes" (ModalDetailClasseGestion
  // → onOuvrirBenef, qui ne pose PAS _source mais fournit toujours classe_id car ce sont de vraies
  // lignes classes_elearning_apprenants) - d'où le fallback sur classe_id.
  const estElearning = (benef._source === 'elearning' || !!benef.classe_id) && !!benef.id;

  const [presences,   setPresences]   = useState([]);
  const [chargPres,   setChargPres]   = useState(false);
  const [evaluations, setEvaluations] = useState([]);
  const [chargEvals,  setChargEvals]  = useState(false);
  const [seances,     setSeances]     = useState([]);
  const [chargSeances, setChargSeances] = useState(false);

  const [noteInterne, setNoteInterne] = useState(benef.notes_internes || '');
  const [noteSaving,  setNoteSaving]  = useState(false);
  const [noteSauvee,  setNoteSauvee]  = useState(false);
  const [noteErr,     setNoteErr]     = useState('');

  // Gamification (points + badges) - clé sur l'ID du VRAI compte apprenant (utilisateurs.id),
  // pas sur l'inscription classe_elearning_apprenants. Un bénéficiaire sans compte créé n'a
  // donc pas encore de gamification (apprenant_id null tant qu'il ne s'est pas connecté).
  const [gamif,      setGamif]      = useState(null);
  const [chargGamif, setChargGamif] = useState(false);

  useEffect(() => {
    if (!estElearning) return;
    setChargPres(true);
    const token = localStorage.getItem('admin_token');
    fetch(`${API_URL}/api/elearning/apprenants/${benef.id}/presences`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json()).then(d => setPresences(d.presences || []))
      .catch(() => {}).finally(() => setChargPres(false));

    setChargEvals(true);
    fetch(`${API_URL}/api/elearning/apprenants/${benef.id}/evaluations`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json()).then(d => setEvaluations(d.evaluations || []))
      .catch(() => {}).finally(() => setChargEvals(false));

    if (benef.classe_id) {
      setChargSeances(true);
      fetch(`${API_URL}/api/elearning/seances?classe_id=${benef.classe_id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.json()).then(d => setSeances(d.seances || []))
        .catch(() => {}).finally(() => setChargSeances(false));
    }

    if (benef.apprenant_id) {
      setChargGamif(true);
      fetch(`${API_URL}/api/gamification/admin/${benef.apprenant_id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.json()).then(d => setGamif({ solde: d.solde || 0, badges: d.badges || [] }))
        .catch(() => setGamif({ solde: 0, badges: [] })).finally(() => setChargGamif(false));
    }
  }, [estElearning, benef.id, benef.classe_id, benef.apprenant_id]);

  async function sauvegarderNote() {
    setNoteSaving(true);
    setNoteErr('');
    try {
      const token = localStorage.getItem('admin_token');
      const r = await fetch(`${API_URL}/api/classes-elearning/apprenants/${benef.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ notes_internes: noteInterne }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
      setNoteSauvee(true);
    } catch (e) {
      setNoteErr(e.message);
    } finally {
      setNoteSaving(false);
    }
  }

  const cfgB  = STATUT_CONFIG[benef.statut] || STATUT_CONFIG.en_attente;
  const nCoul = NIVEAU_COULEUR[benef.niveau_cecr] || COULEURS.gris400;
  const init  = `${benef.prenom?.[0] || ''}${benef.nom?.[0] || ''}`.toUpperCase();

  const sessionsFaites = presences.filter(p => p.statut === 'present').length;
  const sessionsTotal  = presences.length;
  const tauxPresence   = sessionsTotal ? Math.round((sessionsFaites / sessionsTotal) * 100) : 0;
  const devoirsRendus  = evaluations.filter(e => e.source === 'devoir').length;
  const moy = evaluations.length
    ? (evaluations.reduce((s, e) => s + ((e.note || 0) / (e.note_max || 20)) * 20, 0) / evaluations.length).toFixed(1)
    : '--';

  const niveauSuivant = { A1:'A2', A2:'B1', B1:'B2', B2:'C1', C1:'C2', C2:'C2' };

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const sessionsAvenir = seances.filter(s => s.date >= aujourdhui && s.statut !== 'annulee').slice(0, 3);
  const sessionsPassees = presences; // déjà triées desc par le backend

  const TABS = [
    { id: 'infos',        lib: 'Informations',  icone: '👤' },
    { id: 'suivi',        lib: 'Suivi',          icone: '📊' },
    { id: 'progression',  lib: 'Progression',    icone: '📈' },
    { id: 'planning',     lib: 'Planning',        icone: '📅', badge: sessionsAvenir.length || null },
    { id: 'certifications', lib: 'Certifications', icone: '🏅' },
    { id: 'objectifs',    lib: 'Objectifs',       icone: '🎯' },
    { id: 'gamification', lib: 'Gamification',    icone: '🌟', badge: gamif?.badges?.filter(b => b.obtenu).length || null },
    { id: 'notes',        lib: 'Notes internes',  icone: '📝' },
  ];

  const S = {
    overlay:  { position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' },
    modal:    { background: COULEURS.gris50, borderRadius: 20, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.35)', overflow: 'hidden' },
    // Header
    header:   { background: `linear-gradient(135deg, ${entreprise.couleur}BB 0%, ${entreprise.couleur} 100%)`, padding: '22px 26px', flexShrink: 0 },
    hTop:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    avatar:   { width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0 },
    nom:      { fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 3 },
    poste:    { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
    btnX:     { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#fff', flexShrink: 0 },
    hStats:   { display: 'flex', gap: 20 },
    hStat:    { textAlign: 'center' },
    hStatVal: { fontSize: 18, fontWeight: 800, color: '#fff' },
    hStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.05em' },
    hSep:     { width: 1, background: 'rgba(255,255,255,0.2)', alignSelf: 'stretch' },
    // Tabs
    tabs: { display: 'flex', background: COULEURS.blanc, borderBottom: `1px solid ${COULEURS.gris200}`, padding: '0 8px', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' },
    tab:  (a) => ({ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 12px', cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: a ? `2px solid ${entreprise.couleur}` : '2px solid transparent', color: a ? entreprise.couleur : COULEURS.gris600, fontWeight: a ? 700 : 500, fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0 }),
    // Corps
    corps: { flex: 1, overflowY: 'auto', padding: 22 },
    // Infos
    grille2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
    carteInfo: { background: COULEURS.blanc, borderRadius: 10, padding: '12px 16px', border: `1px solid ${COULEURS.gris200}` },
    ciLbl:     { fontSize: 10, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
    ciVal:     { fontSize: 13, fontWeight: 600, color: COULEURS.navy },
    badge:     (bg, txt) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: bg, color: txt, fontSize: 11, fontWeight: 600 }),
    // Suivi
    presenceLigne: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${COULEURS.gris100}` },
    presenceIcn:   (ok) => ({ width: 28, height: 28, borderRadius: '50%', background: ok ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }),
    barreEnv:  { height: 8, background: COULEURS.gris100, borderRadius: 4, overflow: 'hidden' },
    barreRem:  (c, p) => ({ height: '100%', width: `${Math.min(p, 100)}%`, background: c, borderRadius: 4, transition: 'width 0.5s' }),
    // Progression
    compLigne: { marginBottom: 16 },
    noteLigne: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: COULEURS.blanc, borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, marginBottom: 8 },
    noteBadge: (note, max) => {
      const p = (note / max) * 100;
      return { padding: '2px 10px', borderRadius: 20, background: p >= 70 ? '#D1FAE5' : p >= 50 ? '#FEF3C7' : '#FEE2E2', color: p >= 70 ? '#065F46' : p >= 50 ? '#92400E' : '#991B1B', fontSize: 12, fontWeight: 700 };
    },
    // Footer
    footer: { padding: '14px 22px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 10, justifyContent: 'flex-end', background: COULEURS.blanc, flexShrink: 0 },
    btnSec:  { padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnPrim: { padding: '8px 18px', borderRadius: 8, border: 'none', background: entreprise.couleur, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div style={S.hTop}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={S.avatar}>{init}</div>
              <div>
                <div style={S.nom}>{benef.prenom} {benef.nom}</div>
                <div style={S.poste}>{benef.poste || '-'} · {entreprise.nom}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                  <span style={{ ...S.badge(cfgB.bg, cfgB.txt), fontSize: 10 }}>{cfgB.lib}</span>
                  {benef.niveau_cecr && (
                    <span style={{ padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                      {benef.niveau_cecr}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button style={S.btnX} onClick={onFermer}>×</button>
          </div>
          {/* Mini stats */}
          <div style={S.hStats}>
            <div style={S.hStat}>
              <div style={S.hStatVal}>{estElearning ? `${tauxPresence}%` : '-'}</div>
              <div style={S.hStatLbl}>Présence</div>
            </div>
            <div style={S.hSep} />
            <div style={S.hStat}>
              <div style={S.hStatVal}>{estElearning ? `${moy}/20` : '-'}</div>
              <div style={S.hStatLbl}>Moyenne</div>
            </div>
            <div style={S.hSep} />
            <div style={S.hStat}>
              <div style={S.hStatVal}>{estElearning ? `${sessionsFaites}/${sessionsTotal}` : '-'}</div>
              <div style={S.hStatLbl}>Sessions</div>
            </div>
            <div style={S.hSep} />
            <div style={S.hStat}>
              <div style={S.hStatVal}>{estElearning ? devoirsRendus : '-'}</div>
              <div style={S.hStatLbl}>Devoirs</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              <span>{t.icone}</span><span>{t.lib}</span>
            </button>
          ))}
        </div>

        {/* Corps */}
        <div style={S.corps}>

          {/* ── INFORMATIONS ── */}
          {tab === 'infos' && (
            <>
              <div style={S.grille2}>
                <div style={S.carteInfo}>
                  <div style={S.ciLbl}>Prénom</div>
                  <div style={S.ciVal}>{benef.prenom}</div>
                </div>
                <div style={S.carteInfo}>
                  <div style={S.ciLbl}>Nom</div>
                  <div style={S.ciVal}>{benef.nom}</div>
                </div>
                <div style={{ ...S.carteInfo, gridColumn: '1 / -1' }}>
                  <div style={S.ciLbl}>Email professionnel</div>
                  <div style={{ ...S.ciVal, color: couleurTheme }}>{benef.email}</div>
                </div>
                <div style={S.carteInfo}>
                  <div style={S.ciLbl}>Poste / Fonction</div>
                  <div style={S.ciVal}>{benef.poste || '-'}</div>
                </div>
                <div style={S.carteInfo}>
                  <div style={S.ciLbl}>Date d'inscription</div>
                  <div style={S.ciVal}>{benef.date_inscription || '-'}</div>
                </div>
              </div>

              {/* Entreprise */}
              <div style={{ ...S.carteInfo, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: entreprise.couleur + '20', border: `1.5px solid ${entreprise.couleur}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: entreprise.couleur, flexShrink: 0 }}>
                  {entreprise.initiales}
                </div>
                <div>
                  <div style={S.ciLbl}>Entreprise</div>
                  <div style={S.ciVal}>{entreprise.nom}</div>
                  <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{entreprise.secteur} · {entreprise.ville}</div>
                </div>
              </div>

              {/* Statut + Niveau */}
              <div style={S.grille2}>
                <div style={S.carteInfo}>
                  <div style={S.ciLbl}>Statut actuel</div>
                  <div style={{ marginTop: 4 }}>
                    <span style={S.badge(cfgB.bg, cfgB.txt)}>{cfgB.lib}</span>
                  </div>
                </div>
                <div style={S.carteInfo}>
                  <div style={S.ciLbl}>Niveau CECR</div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: nCoul }}>{benef.niveau_cecr || '-'}</span>
                    {benef.niveau_cecr && <span style={{ fontSize: 11, color: COULEURS.gris400 }}>→ objectif {niveauSuivant[benef.niveau_cecr]}</span>}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── SUIVI ── */}
          {tab === 'suivi' && (
            <>
              {!estElearning ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>
                  Le suivi des sessions n'est disponible que pour les bénéficiaires inscrits via le parcours e-learning.
                </div>
              ) : chargPres ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
              ) : (
                <>
                  {/* Taux de présence */}
                  <div style={{ ...S.carteInfo, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>Assiduité</div>
                        <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{sessionsFaites} présences sur {sessionsTotal} sessions</div>
                      </div>
                      <span style={{ fontSize: 24, fontWeight: 800, color: tauxPresence >= 75 ? COULEURS.succes : COULEURS.attention }}>
                        {tauxPresence}%
                      </span>
                    </div>
                    <div style={S.barreEnv}>
                      <div style={S.barreRem(tauxPresence >= 75 ? COULEURS.succes : COULEURS.attention, tauxPresence)} />
                    </div>
                    {sessionsTotal > 0 && tauxPresence < 75 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: COULEURS.attention, fontWeight: 600 }}>
                        ⚠️ Taux inférieur au seuil requis (75%)
                      </div>
                    )}
                  </div>

                  {/* KPIs suivi */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    {[
                      { lib: 'Sessions assistées', val: sessionsFaites, c: COULEURS.succes },
                      { lib: 'Absences',           val: sessionsTotal - sessionsFaites, c: COULEURS.erreur },
                      { lib: 'Devoirs rendus',     val: devoirsRendus, c: '#818CF8' },
                    ].map(({ lib, val, c }) => (
                      <div key={lib} style={{ flex: 1, background: COULEURS.blanc, borderRadius: 10, padding: '12px 14px', border: `1px solid ${COULEURS.gris200}`, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{val}</div>
                        <div style={{ fontSize: 10, color: COULEURS.gris400 }}>{lib}</div>
                      </div>
                    ))}
                  </div>

                  {/* Historique présences */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy, marginBottom: 10 }}>Historique des sessions</div>
                  {presences.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 10 }}>Aucune session enregistrée pour l'instant.</div>
                  ) : (
                    presences.map((p, i) => (
                      <div key={p.id || i} style={S.presenceLigne}>
                        <div style={S.presenceIcn(p.statut === 'present')}>
                          {p.statut === 'present' ? '✓' : '✗'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: COULEURS.navy }}>{p.seance?.objectifs_session || p.seance?.type || 'Session'}</div>
                          <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{p.seance?.date ? new Date(p.seance.date).toLocaleDateString('fr-FR') : '-'}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: p.statut === 'present' ? COULEURS.succes : COULEURS.erreur }}>
                          {p.statut === 'present' ? 'Présent' : 'Absent'}
                        </span>
                      </div>
                    ))
                  )}
                </>
              )}
            </>
          )}

          {/* ── PROGRESSION ── */}
          {tab === 'progression' && (
            <>
              {/* Niveau actuel + objectif */}
              <div style={{ background: `linear-gradient(135deg, ${entreprise.couleur}15, ${entreprise.couleur}30)`, border: `1px solid ${entreprise.couleur}40`, borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Niveau actuel</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: nCoul, lineHeight: 1 }}>{benef.niveau_cecr || '-'}</div>
                </div>
                <div style={{ fontSize: 28, color: COULEURS.gris200 }}>→</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Objectif</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: COULEURS.gris400, lineHeight: 1 }}>
                    {benef.niveau_cecr ? niveauSuivant[benef.niveau_cecr] : '-'}
                  </div>
                </div>
              </div>

              {!estElearning ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>
                  Les évaluations ne sont disponibles que pour les bénéficiaires inscrits via le parcours e-learning.
                </div>
              ) : chargEvals ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
              ) : (
                <>
                  {/* Évaluations */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy, marginBottom: 12 }}>Évaluations</div>
                  {evaluations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 10, marginBottom: 16 }}>Aucune évaluation enregistrée pour l'instant.</div>
                  ) : (
                    evaluations.map((e) => (
                      <div key={e.id} style={S.noteLigne}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: COULEURS.navy }}>{e.titre}</div>
                          <div style={{ fontSize: 10, color: COULEURS.gris400 }}>{e.date_evaluation ? new Date(e.date_evaluation).toLocaleDateString('fr-FR') : '-'}</div>
                        </div>
                        <span style={S.noteBadge(e.note || 0, e.note_max || 20)}>{e.note ?? '-'}/{e.note_max || 20}</span>
                      </div>
                    ))
                  )}

                  {/* Moyenne générale */}
                  {evaluations.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: entreprise.couleur + '10', borderRadius: 8, border: `1px solid ${entreprise.couleur}30`, marginTop: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>Moyenne générale</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: entreprise.couleur }}>{moy}/20</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── PLANNING ── */}
          {tab === 'planning' && (
            <>
              {!estElearning ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>
                  Le planning n'est disponible que pour les bénéficiaires inscrits via le parcours e-learning.
                </div>
              ) : (chargSeances || chargPres) ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
              ) : (
                <>
                  {/* Prochaines sessions */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 12 }}>
                    📅 Prochaines sessions ({sessionsAvenir.length})
                  </div>
                  {sessionsAvenir.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 10, marginBottom: 16 }}>Aucune session planifiée pour l'instant.</div>
                  ) : (
                    sessionsAvenir.map((s) => {
                      const d = new Date(s.date);
                      const lien = s.lien_zoom || s.lien_meet || s.lien_teams || null;
                      return (
                        <div key={s.id} style={{ background: COULEURS.blanc, borderRadius: 10, padding: '14px 16px', border: `1.5px solid ${entreprise.couleur}40`, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: entreprise.couleur + '15', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: entreprise.couleur, textTransform: 'uppercase' }}>{d.toLocaleDateString('fr-FR', { month: 'short' })}</div>
                              <div style={{ fontSize: 18, fontWeight: 900, color: entreprise.couleur, lineHeight: 1 }}>{d.getDate()}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>{s.objectifs_session || s.type || 'Session'}</div>
                              <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{s.heure_debut?.slice(0,5)} – {s.heure_fin?.slice(0,5)}{benef.coach_nom ? ` · Coach : ${benef.coach_nom}` : ''}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 20, background: '#DBEAFE', color: '#1E40AF', fontSize: 10, fontWeight: 600 }}>Planifiée</span>
                            {lien && <a href={lien} style={{ padding: '5px 12px', borderRadius: 6, background: '#10B981', color: '#fff', fontSize: 11, fontWeight: 700, textDecoration: 'none' }} target="_blank" rel="noreferrer">🔗 Rejoindre</a>}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Historique */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 12, marginTop: 20 }}>
                    🗓️ Historique des sessions ({sessionsPassees.length})
                  </div>
                  {sessionsPassees.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 10 }}>Aucune session passée pour l'instant.</div>
                  ) : (
                    sessionsPassees.map((p, i) => (
                      <div key={p.id || i} style={S.presenceLigne}>
                        <div style={S.presenceIcn(p.statut === 'present')}>{p.statut === 'present' ? '✓' : '✗'}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: COULEURS.navy }}>{p.seance?.objectifs_session || p.seance?.type || 'Session'}</div>
                          <div style={{ fontSize: 11, color: COULEURS.gris400 }}>
                            {p.seance?.date ? new Date(p.seance.date).toLocaleDateString('fr-FR') : '-'}
                            {p.seance?.heure_debut ? ` · ${p.seance.heure_debut.slice(0,5)}` : ''}
                            {benef.coach_nom ? ` · ${benef.coach_nom}` : ''}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: p.statut === 'present' ? COULEURS.succes : COULEURS.erreur }}>
                          {p.statut === 'present' ? 'Présent' : 'Absent'}
                        </span>
                      </div>
                    ))
                  )}
                </>
              )}
            </>
          )}

          {/* ── CERTIFICATIONS ── */}
          {tab === 'certifications' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy, marginBottom: 10 }}>Certificats & Attestations</div>
              {benef.statut === 'certifie' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: COULEURS.blanc, borderRadius: 10, border: `1px solid ${COULEURS.gris200}`, marginBottom: 8 }}>
                  <div style={{ fontSize: 28 }}>🎓</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>Certifié{benef.niveau_cecr ? ` - Niveau ${benef.niveau_cecr}` : ''}</div>
                    <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{benef.date_inscription ? `Inscrit depuis le ${benef.date_inscription}` : ''}</div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 10 }}>
                  Aucune certification enregistrée pour l'instant.
                </div>
              )}
              <div style={{ marginTop: 16, fontSize: 11, color: COULEURS.gris400, fontStyle: 'italic' }}>
                Le suivi détaillé des examens et badges n'est pas encore disponible dans le système.
              </div>
            </>
          )}

          {/* ── OBJECTIFS ── */}
          {tab === 'objectifs' && (
            <>
              {/* Niveau cible (déduit automatiquement du niveau CECR actuel) */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, background: COULEURS.blanc, borderRadius: 10, padding: '14px 16px', border: `1px solid ${COULEURS.gris200}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginBottom: 4 }}>NIVEAU ACTUEL</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: nCoul }}>{benef.niveau_cecr || '-'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 20, color: COULEURS.gris300 }}>→</div>
                <div style={{ flex: 1, background: entreprise.couleur + '10', borderRadius: 10, padding: '14px 16px', border: `1px solid ${entreprise.couleur}30`, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginBottom: 4 }}>NIVEAU CIBLE</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: entreprise.couleur }}>
                    {benef.niveau_cecr ? niveauSuivant[benef.niveau_cecr] : '-'}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: COULEURS.gris400, fontStyle: 'italic' }}>
                Le suivi d'objectifs pédagogiques personnalisés (échéances, priorités) n'est pas encore disponible dans le système - seul le niveau CECR cible est calculé automatiquement.
              </div>
            </>
          )}

          {/* ── GAMIFICATION ── */}
          {tab === 'gamification' && (
            <>
              {!benef.apprenant_id ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>
                  Ce bénéficiaire n'a pas encore activé son compte apprenant - la gamification démarre à sa première connexion.
                </div>
              ) : chargGamif ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
              ) : (
                <>
                  <div style={{ background: 'linear-gradient(135deg,#FCD34D20,#F9731620)', borderRadius: 12, padding: '16px 20px', border: '1px solid #FCD34D40', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ fontSize: 32 }}>🌟</div>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#F97316' }}>{gamif?.solde ?? 0} pts</div>
                        <div style={{ fontSize: 12, color: COULEURS.gris600 }}>Points de gamification accumulés</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy, marginBottom: 10 }}>
                    Badges ({gamif?.badges?.filter(b => b.obtenu).length || 0}/{gamif?.badges?.length || 0} obtenus)
                  </div>
                  {!gamif?.badges?.length ? (
                    <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 10 }}>Aucun badge disponible dans le catalogue.</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {gamif.badges.map(b => (
                        <div key={b.id} title={b.description}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: COULEURS.blanc, borderRadius: 12, padding: '14px 16px', border: `1.5px solid ${b.obtenu ? '#FCD34D80' : COULEURS.gris200}`, minWidth: 100, opacity: b.obtenu ? 1 : 0.45 }}>
                          <div style={{ fontSize: 26 }}>{b.icone || '🏅'}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.navy, textAlign: 'center' }}>{b.nom}</div>
                          <div style={{ fontSize: 9, color: COULEURS.gris400 }}>{b.obtenu ? (b.obtenu_le ? new Date(b.obtenu_le).toLocaleDateString('fr-FR') : 'Obtenu') : 'Verrouillé'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── NOTES INTERNES ── */}
          {tab === 'notes' && (
            <>
              {!estElearning ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>
                  Les notes internes ne sont disponibles que pour les bénéficiaires inscrits via le parcours e-learning.
                </div>
              ) : (
                <div style={{ background: COULEURS.blanc, borderRadius: 10, padding: '14px 16px', border: `1px solid ${COULEURS.gris200}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy, marginBottom: 8 }}>Note interne (visible uniquement par l'équipe BET)</div>
                  <textarea
                    value={noteInterne}
                    onChange={e => { setNoteInterne(e.target.value); setNoteSauvee(false); setNoteErr(''); }}
                    placeholder="Observations, recommandations pédagogiques, points d'attention…"
                    rows={6}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', resize: 'vertical', color: COULEURS.navy, lineHeight: 1.6 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    {noteErr && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{noteErr}</span>}
                    <button
                      disabled={noteSaving}
                      onClick={sauvegarderNote}
                      style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: noteSauvee ? COULEURS.succes : entreprise.couleur, color: '#fff', cursor: noteSaving ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif', transition: 'background 0.15s' }}
                    >
                      {noteSaving ? '⏳ Enregistrement…' : noteSauvee ? '✓ Sauvegardé' : '💾 Sauvegarder'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.btnSec} onClick={onFermer}>Fermer</button>
          <button style={S.btnPrim} onClick={() => { onFermer(); onEditer(benef); }}>
            ✏️ Modifier le bénéficiaire
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale soumission inscription parcours (assistante → admin) ────────────
export function ModalSoumissionParcours({ onFermer, onSauvegarder, donneesInitiales }) {
  const { couleurTheme, couleurThemeClair, couleurThemeFonce } = useTheme();
  const alerte = useAlerte();
  const [form, setForm] = useState(() => ({
    nom: '', rccm: '', initiales: '', secteur: SECTEURS[0],
    referent_rh_nom: '', referent_rh_email: '', referent_rh_telephone: '',
    adresse: '', ville: 'Abidjan', pays: "Côte d'Ivoire",
    package_elearning: '', nb_licences: 10,
    libelle_personnalise: '', tarif_personnalise: '',
    montant_contrat: 0, devise: 'FCFA',
    date_debut_contrat: '', date_fin_contrat: '',
    option_replay: false, types_sessions: ['ligne'],
    couleur: '#0891B2', logo_url: null, fichier_preuve_url: null, fichier_preuve_nom: '', notes: '',
    ...donneesInitiales,
  }));
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoHover,   setLogoHover]   = useState(false);
  function ch(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function gererLogo(e) {
    const fichier = e.target.files[0];
    if (!fichier) return;
    setLogoPreview(URL.createObjectURL(fichier));
    try {
      const fd = new FormData();
      fd.append('logo', fichier);
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_URL}/api/entreprise/admin/upload-logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      ch('logo_url', data.logo_url);
    } catch (err) {
      console.error('Erreur upload logo:', err);
      await alerte('Impossible d\'uploader le logo : ' + err.message, { titre: 'Upload du logo', danger: true });
    }
  }

  const [preuveUploading, setPreuveUploading] = useState(false);
  const [preuveFichierEnAttente, setPreuveFichierEnAttente] = useState(null); // { file } - sélectionné mais pas encore envoyé
  function gererPreuve(e) {
    const fichier = e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) { alerte('Fichier trop lourd (max 10 Mo).', { titre: 'Fichier trop volumineux', danger: true }); return; }
    setPreuveFichierEnAttente(fichier);
  }
  async function validerPreuve() {
    if (!preuveFichierEnAttente) return;
    setPreuveUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', preuveFichierEnAttente);
      const token = localStorage.getItem('admin_token');
      const res = await fetchUpload(`${API_URL}/api/upload/document`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      ch('fichier_preuve_url', data.file.url);
      ch('fichier_preuve_nom', preuveFichierEnAttente.name);
      setPreuveFichierEnAttente(null);
    } catch (err) {
      console.error('Erreur upload preuve:', err);
      await alerte('Impossible d\'uploader le fichier : ' + err.message, { titre: 'Upload du document', danger: true });
    } finally {
      setPreuveUploading(false);
    }
  }

  const packagesActifs = lirePackages().filter(p => p.actif !== false);
  const estPersonnalise = form.package_elearning === 'personnalise';
  const pkg = estPersonnalise
    ? { libelle: form.libelle_personnalise || 'Personnalisé', tarif: form.tarif_personnalise || 0, max_benef: 999, couleur: '#7C3AED' }
    : packagesActifs.find(p => p.id === form.package_elearning) || packagesActifs[0] || {};
  const ca = (pkg.tarif || 0) * (form.nb_licences || 0);

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modal: { background: COULEURS.blanc, borderRadius: 16, padding: 32, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' },
    titre: { fontSize: 18, fontWeight: 800, color: COULEURS.navy, marginBottom: 8, display: 'flex', justifyContent: 'space-between' },
    sous: { fontSize: 12, color: COULEURS.gris400, marginBottom: 24 },
    section: { marginBottom: 20 },
    sectionTitre: { fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${COULEURS.gris100}` },
    grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 },
    groupe: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 },
    label: { fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em' },
    input: { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    select: { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.blanc, color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    textarea: { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 60 },
    btnRow: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 },
    btnCancel: { padding: '10px 20px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnSave: { padding: '10px 24px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    caBadge: { background: '#D1FAE5', color: '#065F46', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 700, marginTop: 8, display: 'flex', justifyContent: 'space-between' },
    infoBanner: { background: couleurThemeClair, border: `1px solid ${couleurTheme}30`, borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: couleurThemeFonce },
    btnX: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COULEURS.gris400 },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.titre}>
          <span>📋 Soumettre une inscription entreprise</span>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>
        <div style={S.sous}>Formulaire de pré-inscription - l'entreprise sera en statut <strong>En attente</strong> jusqu'à validation admin.</div>
        <div style={S.infoBanner}>
          ℹ️ Le compte RH sera créé par l'admin lors de la validation. Renseignez les informations contractuelles au maximum pour faciliter la validation.
        </div>

        {/* ── Logo / Photo de profil ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${COULEURS.gris100}` }}>
          <label
            htmlFor="logo-upload-parcours"
            style={{ cursor: 'pointer', position: 'relative', flexShrink: 0 }}
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
          >
            <div style={{
              width: 88, height: 88, borderRadius: 18,
              background: logoPreview ? 'transparent' : `linear-gradient(135deg, ${couleurTheme}, ${couleurThemeFonce})`,
              border: `3px solid ${logoHover ? couleurTheme : COULEURS.gris200}`,
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.15s',
              boxShadow: logoHover ? `0 0 0 4px ${couleurTheme}25` : 'none',
            }}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>
                  {form.nom ? form.nom.slice(0, 2).toUpperCase() : '🏢'}
                </span>
              )}
            </div>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 18,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: logoHover ? 1 : 0, transition: 'opacity 0.15s',
            }}>
              <span style={{ fontSize: 22 }}>📷</span>
            </div>
            <input
              id="logo-upload-parcours"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: 'none' }}
              onChange={gererLogo}
            />
          </label>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>Logo / Photo de profil</div>
            <div style={{ fontSize: 12, color: COULEURS.gris400, lineHeight: 1.6, marginBottom: 10 }}>
              PNG, JPG, WEBP ou SVG - max 2 Mo<br />Recommandé : 200×200 px minimum
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label htmlFor="logo-upload-parcours" style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${couleurTheme}`, color: couleurTheme, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {logoPreview ? '🔄 Changer' : '⬆ Importer'}
              </label>
              {logoPreview && (
                <button type="button" onClick={() => { setLogoPreview(null); ch('logo_url', null); }}
                  style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                  🗑 Supprimer
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Infos générales */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Informations entreprise</div>
          <div style={{ ...S.grille2 }}>
            <div style={S.groupe}>
              <label style={S.label}>Nom de l'entreprise *</label>
              <input style={S.input} value={form.nom} onChange={e => { ch('nom', e.target.value); ch('initiales', e.target.value.slice(0,2).toUpperCase()); }} placeholder="Ex : TLG PHARMA" />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Secteur d'activité</label>
              <select style={S.select} value={SECTEURS.includes(form.secteur) ? form.secteur : 'Autre'} onChange={e => ch('secteur', e.target.value === 'Autre' ? '' : e.target.value)}>
                {SECTEURS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ ...S.grille2 }}>
            <div style={S.groupe}>
              <label style={S.label}>RCCM</label>
              <input style={S.input} value={form.rccm || ''} onChange={e => ch('rccm', e.target.value)} placeholder="CI-ABJ-2024-…" />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Ville</label>
              <input style={S.input} value={form.ville} onChange={e => ch('ville', e.target.value)} placeholder="Abidjan" />
            </div>
          </div>
          <div style={{ ...S.grille2 }}>
            <div style={S.groupe}>
              <label style={S.label}>Pays</label>
              <input style={S.input} value={form.pays || ''} onChange={e => ch('pays', e.target.value)} placeholder="Côte d'Ivoire" />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Adresse</label>
              <input style={S.input} value={form.adresse} onChange={e => ch('adresse', e.target.value)} placeholder="Quartier, Rue…" />
            </div>
          </div>
        </div>

        {/* ── Charte graphique ── */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Charte graphique du dashboard client</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginBottom: 14, lineHeight: 1.6 }}>
            Cette couleur sera appliquée à la bannière et aux accents du tableau de bord de l'entreprise.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { hex: '#0891B2', nom: 'Cyan BET'      },
              { hex: '#003087', nom: 'Marine'         },
              { hex: '#F97316', nom: 'Orange'         },
              { hex: '#DC2626', nom: 'Rouge'          },
              { hex: '#7C3AED', nom: 'Violet'         },
              { hex: '#059669', nom: 'Vert'           },
              { hex: '#0E7490', nom: 'Bleu pétrole'  },
              { hex: '#B45309', nom: 'Ambre'          },
              { hex: '#BE185D', nom: 'Rose foncé'    },
              { hex: '#1D4ED8', nom: 'Bleu roi'      },
              { hex: '#374151', nom: 'Ardoise'        },
              { hex: '#0F766E', nom: 'Sarcelle'       },
            ].map(({ hex, nom }) => (
              <button key={hex} type="button" title={nom} onClick={() => ch('couleur', hex)}
                style={{
                  width: 32, height: 32, borderRadius: 9, background: hex, border: 'none',
                  cursor: 'pointer', flexShrink: 0, transition: 'transform 0.15s, box-shadow 0.15s',
                  outline: form.couleur === hex ? `3px solid ${hex}` : '3px solid transparent',
                  outlineOffset: 2,
                  boxShadow: form.couleur === hex ? `0 0 0 2px #fff, 0 0 0 4px ${hex}` : '0 2px 4px rgba(0,0,0,0.15)',
                  transform: form.couleur === hex ? 'scale(1.15)' : 'scale(1)',
                }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Couleur personnalisée</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                <input type="color" value={form.couleur || '#0891B2'} onChange={e => ch('couleur', e.target.value)}
                  style={{ width: 40, height: 34, borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                <input style={{ ...S.input, fontFamily: 'monospace', textTransform: 'uppercase', width: 110 }}
                  value={form.couleur || '#0891B2'}
                  onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) ch('couleur', e.target.value); }}
                  placeholder="#0891B2" maxLength={7} />
              </div>
            </div>
            <div style={{ flex: 2, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
              <div style={{ background: `linear-gradient(135deg, ${form.couleur || '#003087'} 0%, ${form.couleur || '#0891B2'}CC 100%)`, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{form.nom || 'Mon Entreprise'} × BET</div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact RH */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Responsable RH / Contact entreprise</div>
          <div style={{ ...S.grille2 }}>
            <div style={S.groupe}>
              <label style={S.label}>Nom complet RH</label>
              <input style={S.input} value={form.referent_rh_nom} onChange={e => ch('referent_rh_nom', e.target.value)} placeholder="Nom du responsable RH" />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Téléphone RH</label>
              <input style={S.input} value={form.referent_rh_telephone} onChange={e => ch('referent_rh_telephone', e.target.value)} placeholder="+225 07 00 00 00 00" />
            </div>
          </div>
          <div style={S.groupe}>
            <label style={S.label}>Email de connexion RH *</label>
            <input style={S.input} type="email" value={form.referent_rh_email} onChange={e => ch('referent_rh_email', e.target.value)} placeholder="rh@entreprise.ci - servira d'identifiant" />
          </div>
        </div>

        {/* Contrat & Package */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Contrat & Package</div>
          <div style={{ ...S.grille2 }}>
            <div style={S.groupe}>
              <label style={S.label}>Package</label>
              <select style={S.select} value={form.package_elearning} onChange={e => ch('package_elearning', e.target.value)}>
                <option value="">- Sélectionner un package -</option>
                {packagesActifs.map(p => (
                  <option key={p.id} value={p.id}>{p.libelle} - {(p.tarif||0).toLocaleString('fr-FR')} FCFA/bénéf.</option>
                ))}
                <option value="personnalise">➕ Package personnalisé…</option>
              </select>
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Nombre de bénéficiaires</label>
              <input style={S.input} type="number" min="1" value={form.nb_licences} onChange={e => ch('nb_licences', parseInt(e.target.value)||0)} />
            </div>
          </div>
          {estPersonnalise && (
            <div style={{ ...S.grille2, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={S.groupe}>
                <label style={S.label}>Libellé de l'offre *</label>
                <input style={S.input} value={form.libelle_personnalise || ''} placeholder="Ex : Offre corporate Q3 2026"
                  onChange={e => ch('libelle_personnalise', e.target.value)} />
              </div>
              <div style={S.groupe}>
                <label style={S.label}>Tarif / bénéficiaire (FCFA) *</label>
                <input style={S.input} type="number" min="0" value={form.tarif_personnalise || ''} placeholder="ex : 150000"
                  onChange={e => ch('tarif_personnalise', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          )}
          <div style={{ ...S.grille2 }}>
            <div style={S.groupe}>
              <label style={S.label}>Date de début *</label>
              <input style={S.input} type="date" value={form.date_debut_contrat} onChange={e => ch('date_debut_contrat', e.target.value)} />
            </div>
            <div style={S.groupe}>
              <label style={S.label}>Date de fin *</label>
              <input style={S.input} type="date" value={form.date_fin_contrat} onChange={e => ch('date_fin_contrat', e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: -4, marginBottom: 8 }}>
            ⚠️ Sans ces deux dates, le contrat ne sera pas créé automatiquement à la validation.
          </div>
          {ca > 0 && (
            <div style={S.caBadge}>
              <span>CA estimé</span>
              <span>{formatFCFA(ca)}</span>
            </div>
          )}
        </div>

        {/* Sessions */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Modalités de formation</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[{ val: 'ligne', lib: '📹 En ligne' }, { val: 'presentiel', lib: '🏢 Présentiel' }].map(({ val, lib }) => {
              const actif = (form.types_sessions || []).includes(val);
              return (
                <div key={val} onClick={() => {
                  const ts = form.types_sessions || [];
                  ch('types_sessions', actif ? ts.filter(t => t !== val) : [...ts, val]);
                }} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${actif ? couleurTheme : COULEURS.gris200}`, background: actif ? couleurTheme + '10' : COULEURS.gris50, fontWeight: actif ? 700 : 500, color: actif ? couleurTheme : COULEURS.gris600, fontSize: 13, textAlign: 'center' }}>
                  {lib}
                  {actif && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
              );
            })}
          </div>
          {(form.types_sessions || []).includes('ligne') && (
            <div onClick={() => ch('option_replay', !form.option_replay)} style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${form.option_replay ? '#8B5CF6' : COULEURS.gris200}`, background: form.option_replay ? '#F5F3FF' : COULEURS.gris50, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: form.option_replay ? '#5B21B6' : COULEURS.gris600 }}>
              <span>▶️ Option Replay</span>
              <span style={{ fontWeight: 700 }}>{form.option_replay ? '✓ Activé' : '✗ Non'}</span>
            </div>
          )}
        </div>

        {/* ── Documents ── */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Documents</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginBottom: 10 }}>
            Contrat signé, bon de commande… - PDF, Word ou Excel, 10 Mo max.
          </div>
          {form.fichier_preuve_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.gris50 }}>
              <span style={{ fontSize: 18 }}>📎</span>
              <a href={form.fichier_preuve_url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13, fontWeight: 600, color: couleurTheme, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {form.fichier_preuve_nom || 'Voir le fichier'}
              </a>
              <button type="button" onClick={() => { ch('fichier_preuve_url', null); ch('fichier_preuve_nom', ''); }}
                style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                🗑 Retirer
              </button>
            </div>
          ) : preuveFichierEnAttente ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${couleurTheme}`, background: `${couleurTheme}08` }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preuveFichierEnAttente.name}
              </span>
              <button type="button" onClick={() => setPreuveFichierEnAttente(null)} disabled={preuveUploading}
                style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: preuveUploading ? 'default' : 'pointer', background: 'transparent', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                ✕ Annuler
              </button>
              <button type="button" onClick={validerPreuve} disabled={preuveUploading}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: preuveUploading ? 'wait' : 'pointer', background: couleurTheme, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                {preuveUploading ? 'Envoi…' : '✅ Valider'}
              </button>
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 8, border: `1.5px dashed ${COULEURS.gris200}`, cursor: 'pointer', color: COULEURS.gris600, fontSize: 13 }}>
              <span style={{ fontSize: 18 }}>⬆️</span>
              Importer un fichier
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={gererPreuve} />
            </label>
          )}
        </div>

        {/* Notes */}
        <div style={S.section}>
          <div style={S.sectionTitre}>Notes / Informations complémentaires</div>
          <textarea style={S.textarea} value={form.notes} onChange={e => ch('notes', e.target.value)} placeholder="Conditions particulières, contexte commercial, remarques…" />
        </div>

        {(() => {
          const manquants = [];
          if (!form.nom) manquants.push('nom de l\'entreprise');
          if (!form.package_elearning) manquants.push('package');
          if (form.package_elearning === 'personnalise' && !form.libelle_personnalise) manquants.push('libellé de l\'offre personnalisée');
          if (form.package_elearning === 'personnalise' && !form.tarif_personnalise) manquants.push('tarif de l\'offre personnalisée');
          if (!form.date_debut_contrat) manquants.push('date de début');
          if (!form.date_fin_contrat) manquants.push('date de fin');
          return manquants.length > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#991B1B', marginBottom: 8 }}>
              ⚠️ Champs requis manquants : {manquants.join(', ')}.
            </div>
          );
        })()}
        <div style={S.btnRow}>
          <button style={S.btnCancel} onClick={onFermer}>Annuler</button>
          <button
            style={{ ...S.btnSave, opacity: (!form.nom || !form.package_elearning || (estPersonnalise && (!form.libelle_personnalise || !form.tarif_personnalise)) || !form.date_debut_contrat || !form.date_fin_contrat) ? 0.5 : 1 }}
            disabled={!form.nom || !form.package_elearning || (estPersonnalise && (!form.libelle_personnalise || !form.tarif_personnalise)) || !form.date_debut_contrat || !form.date_fin_contrat}
            onClick={() => onSauvegarder({ ...form, montant_contrat: ca })}
          >
            📋 Soumettre pour validation
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale bénéficiaire rapide (dans la modale détail) ─────────────────────
function ModalBeneficiaireRapide({ entreprise, benef, onFermer, onSauvegarder }) {
  const [form, setForm] = useState(
    benef
      ? { ...benef }
      : {
          entreprise_id: entreprise.id,
          prenom: '', nom: '', email: '',
          poste: '', niveau_cecr: '', statut: 'en_attente',
          date_inscription: new Date().toISOString().split('T')[0],
        }
  );
  function ch(k, v) { setForm(f => ({ ...f, [k]: v })); }
  const isEdit = !!benef;

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, backdropFilter: 'blur(4px)' },
    modal: { background: COULEURS.blanc, borderRadius: 16, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' },
    header: { background: `linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    headerTitre: { fontSize: 15, fontWeight: 800, color: '#fff' },
    headerSous: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    btnX: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#fff' },
    corps: { padding: 20 },
    grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
    groupe: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
    label: { fontSize: 10, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' },
    input: { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    select: { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.blanc, color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    footer: { padding: '14px 20px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 10, justifyContent: 'flex-end', background: COULEURS.gris50 },
    btnCancel: { padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnSave: { padding: '8px 20px', borderRadius: 8, border: 'none', background: entreprise.couleur, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div>
            <div style={S.headerTitre}>{isEdit ? '✏️ Modifier le bénéficiaire' : '＋ Ajouter un bénéficiaire'}</div>
            <div style={S.headerSous}>{entreprise.nom}</div>
          </div>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>

        <div style={S.corps}>
          <div style={S.grille2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={S.label}>Prénom *</label>
              <input style={S.input} value={form.prenom} onChange={e => ch('prenom', e.target.value)} placeholder="Prénom" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={S.label}>Nom *</label>
              <input style={S.input} value={form.nom} onChange={e => ch('nom', e.target.value)} placeholder="Nom" />
            </div>
          </div>

          <div style={S.groupe}>
            <label style={S.label}>Email professionnel *</label>
            <input style={S.input} type="email" value={form.email} onChange={e => ch('email', e.target.value)} placeholder="prenom.nom@entreprise.ci" />
          </div>

          <div style={S.grille2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={S.label}>Poste / Fonction</label>
              <input style={S.input} value={form.poste} onChange={e => ch('poste', e.target.value)} placeholder="Ex : Pharmacien" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={S.label}>Niveau CECR</label>
              <select style={S.select} value={form.niveau_cecr} onChange={e => ch('niveau_cecr', e.target.value)}>
                <option value="">- À évaluer -</option>
                {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div style={S.grille2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={S.label}>Statut</label>
              <select style={S.select} value={form.statut} onChange={e => ch('statut', e.target.value)}>
                <option value="en_attente">En attente</option>
                <option value="actif">Actif</option>
                <option value="certifie">Certifié</option>
                <option value="suspendu">Suspendu</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={S.label}>Date d'inscription</label>
              <input style={S.input} type="date" value={form.date_inscription} onChange={e => ch('date_inscription', e.target.value)} />
            </div>
          </div>
        </div>

        <div style={S.footer}>
          <button style={S.btnCancel} onClick={onFermer}>Annuler</button>
          <button
            style={{ ...S.btnSave, opacity: (!form.prenom || !form.nom || !form.email) ? 0.5 : 1 }}
            disabled={!form.prenom || !form.nom || !form.email}
            onClick={() => onSauvegarder(form)}
          >
            {isEdit ? 'Enregistrer les modifications' : 'Ajouter le bénéficiaire'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Onglet Sessions commun aux modals de détail classe ────────────────────────
const _SESS_PAGE = 10;

function OngletSessionsClasse({ classeId, coachNom, couleur }) {
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
    fetch(`${API_URL}/api/elearning/seances?classe_id=${classeId}`, { headers: authHeaders() })
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

function OngletPresencesClasse({ classeId, couleur }) {
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
    fetch(`${API_URL}/api/elearning/classes/${classeId}/presences`, { headers: authHeaders() })
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

// ─── Modal Détail Classe (Admin BET / Onboarding → onglet Bénéficiaires) ──────
function ModalDetailClasseGestion({ classe, entreprise, onFermer, onOuvrirBenef }) {
  const [tab, setTab] = useState('infos');
  const coulEnt    = entreprise?.couleur || '#3B82F6';
  const apprenants = classe.apprenants || [];
  const actifs     = apprenants.filter(a => a.statut === 'actif');
  const horaires   = Array.isArray(classe.horaire) ? classe.horaire : [];

  const TABS_CL = [
    { id: 'infos',      lib: 'Infos',      icone: 'ℹ️' },
    { id: 'apprenants', lib: 'Apprenants', icone: '👥', badge: apprenants.length },
    { id: 'presences',  lib: 'Présences',  icone: '✅' },
    { id: 'sessions',   lib: 'Sessions',   icone: '📅' },
    { id: 'acces',      lib: 'Accès',      icone: '🔐' },
  ];

  function ouvrirBenef(a) {
    const parts  = (a.nom_complet || '').trim().split(' ');
    const prenom = parts[0] || '';
    const nom    = parts.slice(1).join(' ') || '';
    onOuvrirBenef({ ...a, prenom, nom, entreprise_id: entreprise?.id });
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1500, backdropFilter:'blur(3px)' }} onClick={onFermer}>
      <div style={{ background:COULEURS.gris50, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${coulEnt}BB 0%, ${coulEnt} 100%)`, padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>🏫 {classe.nom}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3 }}>
                {classe.niveau_cecr || classe.cecr_min || '-'} · {classe.format || 'En ligne'} · {apprenants.length} apprenant{apprenants.length !== 1 ? 's' : ''}
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {[{ lib:'Total', val:apprenants.length }, { lib:'Actifs', val:actifs.length }, { lib:'Niveaux renseignés', val:apprenants.filter(a=>a.niveau_cecr).length }].map(({lib,val}) => (
              <div key={lib} style={{ textAlign:'center' }}>
                <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{val}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{lib}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', background:COULEURS.blanc, borderBottom:`1px solid ${COULEURS.gris200}`, padding:'0 8px', flexShrink:0 }}>
          {TABS_CL.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display:'flex', alignItems:'center', gap:5, padding:'10px 14px', cursor:'pointer', border:'none', background:'transparent', borderBottom: tab===t.id ? `2px solid ${coulEnt}` : '2px solid transparent', color: tab===t.id ? coulEnt : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', marginBottom:-1, whiteSpace:'nowrap' }}>
              {t.icone} {t.lib}
              {t.badge > 0 && <span style={{ background:coulEnt, color:'#fff', borderRadius:10, fontSize:9, padding:'1px 5px', fontWeight:700, marginLeft:3 }}>{t.badge}</span>}
            </button>
          ))}
        </div>
        {/* Corps */}
        <div style={{ flex:1, overflowY:'auto', padding:22 }}>
          {tab === 'infos' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {[
                { lib:'Nom de la classe', val: classe.nom },
                { lib:'Statut',           val: classe.statut || '-' },
                { lib:'Niveau CECR',      val: classe.niveau_cecr || classe.cecr_min || '-' },
                { lib:'Format',           val: classe.format || 'En ligne' },
                { lib:'Capacité',         val: `${apprenants.length} / ${classe.capacite || classe.effectif_max || '?'} places` },
                { lib:'Date début',       val: classe.date_debut ? new Date(classe.date_debut).toLocaleDateString('fr-FR') : '-' },
                { lib:'Date fin',         val: classe.date_fin   ? new Date(classe.date_fin).toLocaleDateString('fr-FR')   : '-' },
                { lib:'Coach',            val: classe.coach_nom || classe.professeur_nom || '-' },
              ].map(({lib, val}) => (
                <div key={lib} style={{ background:COULEURS.blanc, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{lib}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{val}</div>
                </div>
              ))}
              {horaires.length > 0 ? (
                <div style={{ gridColumn:'1/-1', background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'16px 20px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:12 }}>📅 Emploi du temps</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {horaires.map((h, i) => (
                      <div key={i} style={{ background:`${coulEnt}10`, border:`1px solid ${coulEnt}30`, borderRadius:10, padding:'7px 14px', display:'flex', gap:8, alignItems:'center' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:coulEnt }}>{h.jour}</span>
                        <span style={{ fontSize:11, color:COULEURS.navy, fontWeight:600 }}>{h.debut} – {h.fin}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ gridColumn:'1/-1', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#92400E' }}>
                  📅 Aucun créneau horaire configuré pour cette classe.
                </div>
              )}
            </div>
          )}

          {tab === 'apprenants' && (
            apprenants.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400, border:`2px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
                <div>Aucun apprenant dans cette classe.</div>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                  {[{ lib:'Total', val:apprenants.length, c:COULEURS.navy }, { lib:'Actifs', val:actifs.length, c:COULEURS.succes }, { lib:'Avec niveau', val:apprenants.filter(a=>a.niveau_cecr).length, c:'#818CF8' }].map(({lib,val,c}) => (
                    <div key={lib} style={{ flex:1, background:COULEURS.blanc, borderRadius:10, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:c }}>{val}</div>
                      <div style={{ fontSize:10, color:COULEURS.gris400 }}>{lib}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 0.8fr 1fr 80px', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Apprenant</span><span>Email</span><span>Niveau</span><span>Statut</span><span></span>
                  </div>
                  {apprenants.map((a, i) => {
                    const cfgA  = STATUT_CONFIG[a.statut] || STATUT_CONFIG.en_attente;
                    const nCoul = NIVEAU_COULEUR[a.niveau_cecr] || COULEURS.gris400;
                    const parts = (a.nom_complet || '').trim().split(' ');
                    const init  = parts.map(p => p[0] || '').slice(0,2).join('').toUpperCase();
                    return (
                      <div key={a.id || i} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 0.8fr 1fr 80px', padding:'11px 16px', borderBottom: i < apprenants.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background:`${coulEnt}20`, border:`1.5px solid ${coulEnt}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:coulEnt, flexShrink:0 }}>{init}</div>
                          <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:12 }}>{a.nom_complet}</div>
                        </div>
                        <span style={{ fontSize:11, color:COULEURS.gris600 }}>{a.email || '-'}</span>
                        <span style={{ fontWeight:800, color:nCoul }}>{a.niveau_cecr || '-'}</span>
                        <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:cfgA.bg, color:cfgA.txt, fontSize:11, fontWeight:600 }}>{cfgA.lib}</span>
                        <button onClick={() => ouvrirBenef(a)} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${coulEnt}`, background:`${coulEnt}10`, color:coulEnt, cursor:'pointer', fontSize:10, fontFamily:'"Plus Jakarta Sans",sans-serif', fontWeight:600 }}>👁 Détail</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )
          )}

          {tab === 'presences' && (
            <OngletPresencesClasse classeId={classe.id} couleur={coulEnt} />
          )}

          {tab === 'sessions' && (
            <OngletSessionsClasse classeId={classe.id} coachNom={classe.coach_nom} couleur={coulEnt} />
          )}


          {tab === 'acces' && (
            apprenants.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400, border:`2px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                <div style={{ fontSize:36, marginBottom:10 }}>🔐</div>
                <div>Aucun apprenant à afficher.</div>
              </div>
            ) : (
              <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1.8fr 1fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  <span>Apprenant</span><span>Email</span><span>Accès plateforme</span>
                </div>
                {apprenants.map((a, i) => {
                  const acces = a.acces_elearning === 'activé' || a.statut === 'actif';
                  const cfgAcc = acces ? { bg:'#D1FAE5', txt:'#065F46', lib:'Activé' } : { bg:'#FEF3C7', txt:'#92400E', lib:'En attente' };
                  return (
                    <div key={a.id || i} style={{ display:'grid', gridTemplateColumns:'2fr 1.8fr 1fr', padding:'11px 16px', borderBottom: i < apprenants.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13 }}>
                      <span style={{ fontWeight:600, color:COULEURS.navy }}>{a.nom_complet}</span>
                      <span style={{ fontSize:11, color:COULEURS.gris600 }}>{a.email || '-'}</span>
                      <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:cfgAcc.bg, color:cfgAcc.txt, fontSize:11, fontWeight:600 }}>{cfgAcc.lib}</span>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const STATUT_PAI = {
  recu:        { bg: '#D1FAE5', txt: '#065F46', lib: 'Reçu',        icone: '✅' },
  en_attente:  { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente',  icone: '⏳' },
  retard:      { bg: '#FEE2E2', txt: '#991B1B', lib: 'En retard',   icone: '🚨' },
  a_venir:     { bg: '#EDE9FE', txt: '#5B21B6', lib: 'À venir',     icone: '📅' },
};

const MODES_PAIEMENT = ['Virement bancaire', 'Chèque', 'Chèque de banque', 'Espèces', 'Mobile Money'];

export const STATUT_CONTRAT_LIB = {
  brouillon: { bg: '#F1F5F9', txt: '#475569', lib: '📝 Brouillon' },
  actif:     { bg: '#D1FAE5', txt: '#065F46', lib: '✅ Actif' },
  suspendu:  { bg: '#FEF3C7', txt: '#92400E', lib: '⏸️ Suspendu' },
  expire:    { bg: '#F1F5F9', txt: '#64748B', lib: '⌛ Expiré' },
  resilie:   { bg: '#FEE2E2', txt: '#991B1B', lib: '🚫 Résilié' },
};

function ModalDetailEntreprise({ entreprise, contrats, beneficiaires, paiements, echeanciers, onFermer, onEditer, onAjouterPaiement, onModifierPaiement, onSupprimerPaiement, onRenouvelerContrat, onChangerStatutContrat, onProposerRenouvellement, onValiderRenouvellement, peutGererContrat = false, peutProposerRenouvellement = false, onSauvegarderBeneficiaire, onPreuveSupprimee, ongletInitial, lectureSeule = false, peutSaisirPaiements: peutSaisirPaiementsRole = false, peutModifierPaiements: peutModifierPaiementsRole = false, peutSupprimerPaiements = false }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const confirm = useConfirm();
  const alerte = useAlerte();
  // Une inscription refusée par l'admin BET est gelée : plus aucune saisie (versement...)
  // n'est possible dessus tant qu'elle n'a pas été réactivée.
  const entrepriseRefusee = entreprise.statut === 'refuse';
  const peutSaisirPaiements = peutSaisirPaiementsRole && !entrepriseRefusee;
  const peutModifierPaiements = peutModifierPaiementsRole && !entrepriseRefusee;
  const [modalRenouvellement, setModalRenouvellement] = useState(false);
  const [contratHistoriqueOuvert, setContratHistoriqueOuvert] = useState(null);
  const [tab, setTab]               = useState(ongletInitial || 'infos');
  const [modalPaie, setModalPaie]   = useState(false);
  const [paiementDetail, setPaiementDetail] = useState(null);
  const [paiementAEditer, setPaiementAEditer] = useState(null);
  const [echeanceLiee, setEchLiee]  = useState(null);
  const [modalBen, setModalBen]     = useState(false);
  const [benEdite, setBenEdite]     = useState(null);
  const [benDetail, setBenDetail]   = useState(null);
  const [classeActive, setClasseActive] = useState(null);
  const [classeDetail, setClasseDetail] = useState(null);
  const [classesEntL,  setClassesEntL]  = useState([]);
  const [chargClassesEntL, setChargClassesEntL] = useState(false);
  const [logoLocal, setLogoLocal]   = useState(entreprise.logo_url || null);
  const [logoHover, setLogoHover]   = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [documents, setDocuments]   = useState([]);
  const [chargDocs, setChargDocs]   = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  // La "preuve d'inscription" est désormais une ligne réelle de entreprise_documents
  // (type='preuve_inscription', voir syncPreuveDocument côté backend) - plus besoin de la
  // fabriquer côté client à partir de entreprise.fichier_preuve_url.
  const documentsAffiches = documents;

  async function supprimerPaiement(p) {
    if (!(await confirm(`Supprimer définitivement ce versement de ${formatFCFA(p.montant)} pour ${entreprise.nom} ?`, { titre: 'Supprimer le versement', confirmLabel: 'Supprimer', danger: true }))) return;
    onSupprimerPaiement(p);
    setPaiementDetail(null);
  }

  useEffect(() => {
    if (tab !== 'documents') return;
    setChargDocs(true);
    const token = localStorage.getItem('admin_token');
    fetch(`${API_URL}/api/entreprise/admin/${entreprise.id}/documents`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
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
    if (fichier.size > 10 * 1024 * 1024) { alerte('Fichier trop lourd (max 10 Mo).', { titre: 'Fichier trop volumineux', danger: true }); return; }
    setDocFichierEnAttente(fichier);
  }
  async function validerDepotDocument() {
    const fichier = docFichierEnAttente;
    if (!fichier) return;
    setDocUploading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const fd = new FormData();
      fd.append('file', fichier);
      const resUpload = await fetchUpload(`${API_URL}/api/upload/document`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const dataUpload = await resUpload.json();
      if (!resUpload.ok) throw new Error(dataUpload.error || 'Erreur serveur');

      const resDoc = await fetch(`${API_URL}/api/entreprise/admin/${entreprise.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ nom: fichier.name, url: dataUpload.file.url, format: dataUpload.file.format, taille: dataUpload.file.size }),
      });
      const dataDoc = await resDoc.json();
      if (!resDoc.ok) throw new Error(dataDoc.error || 'Erreur serveur');
      setDocuments(prev => [dataDoc.document, ...prev]);
      setDocFichierEnAttente(null);
    } catch (err) {
      console.error('Erreur dépôt document:', err);
      await alerte('Impossible de déposer le document : ' + err.message, { titre: 'Dépôt du document', danger: true });
    } finally {
      setDocUploading(false);
    }
  }

  async function supprimerDocument(docId) {
    if (!(await confirm('Supprimer ce document ?', { titre: 'Supprimer le document' }))) return;
    try {
      const token = localStorage.getItem('admin_token');
      const docSupprime = documents.find(d => d.id === docId);
      const res = await fetch(`${API_URL}/api/entreprise/admin/${entreprise.id}/documents/${docId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur serveur'); }
      setDocuments(prev => prev.filter(d => d.id !== docId));
      // Le backend vide déjà comptes_entreprises.fichier_preuve_url dans ce cas - on répercute
      // ça sur l'état local pour que le formulaire d'édition ne le fasse pas réapparaître.
      if (docSupprime?.type === 'preuve_inscription') onPreuveSupprimee?.();
    } catch (err) {
      await alerte('Impossible de supprimer : ' + err.message, { titre: 'Suppression du document', danger: true });
    }
  }

  async function mettreAJourLogo(e) {
    const fichier = e.target.files[0];
    if (!fichier) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', fichier);
      fd.append('entrepriseId', entreprise.id);
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_URL}/api/entreprise/admin/upload-logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setLogoLocal(data.logo_url);
    } catch (err) {
      console.error('Erreur upload logo:', err);
      await alerte('Impossible d\'uploader le logo : ' + err.message, { titre: 'Upload du logo', danger: true });
    } finally {
      setLogoUploading(false);
    }
  }

  // Une entreprise peut avoir plusieurs contrats (historique de renouvellements) - on affiche
  // toujours le contrat actif en priorité, sinon le plus récent (contrats trié par created_at desc).
  const contratsEnt = contrats.filter((c) => c.entreprise_id === entreprise.id);
  const contrat  = contratsEnt.find((c) => c.statut === 'actif') || contratsEnt[0];
  const benefs   = beneficiaires.filter((b) => b.entreprise_id === entreprise.id);
  const pais     = paiements.filter((p) => p.entreprise_id === entreprise.id);
  const echs     = echeanciers.filter((e) => e.entreprise_id === entreprise.id);
  const cfg      = STATUT_CONFIG[entreprise.statut] || STATUT_CONFIG.actif;
  const nbLicences = entreprise.nb_licences || 0;
  const nbActifsBenef = benefs.length;
  const pct      = nbLicences > 0 ? Math.round((nbActifsBenef / nbLicences) * 100) : 0;
  const jours    = contrat ? joursRestants(contrat.date_fin) : null;

  const totalEncaisse  = pais.filter(p => p.statut === 'recu').reduce((s, p) => s + p.montant, 0);
  const montantContrat = contrat?.montant_ht || 0;
  const soldeRestant   = montantContrat - totalEncaisse;
  const pctPaie        = montantContrat > 0 ? Math.round((totalEncaisse / montantContrat) * 100) : 0;
  const pctPaiGlobal   = montantContrat > 0 ? Math.round((totalEncaisse / montantContrat) * 100) : 0;

  const ACTIVITE_FICTIVE = [
    { icone: '✅', lib: 'Contrat signé',          detail: contrat ? `REF-${(contrat.id || '').split('-')[0]?.toUpperCase()}` : '-',  date: contrat?.created_at ? new Date(contrat.created_at).toLocaleDateString('fr-FR') : '-' },
    { icone: '👤', lib: 'Bénéficiaires inscrits', detail: `${benefs.length} bénéficiaire(s) ajouté(s)`,     date: entreprise.date_debut_contrat || '-' },
    { icone: '💰', lib: 'Acompte reçu',           detail: `${formatFCFA(totalEncaisse)}`,                    date: contrat?.date_debut || '-' },
    { icone: '📧', lib: 'Email de bienvenue',      detail: `Envoyé à ${entreprise.referent_rh_email || '-'}`, date: contrat?.date_debut || '-' },
    { icone: '📊', lib: 'Tests de niveau',         detail: `${benefs.filter(b => b.niveau_cecr).length} bénéficiaire(s) évalué(s)`, date: '-' },
  ];
  const echeancesEnRetard = echs.filter(e => e.statut === 'en_attente' && new Date(e.date_prevue) < new Date()).length;

  const [copieCle, setCopieCle] = useState('');
  function copier(texte, cle) {
    navigator.clipboard?.writeText(texte).catch(() => {});
    setCopieCle(cle);
    setTimeout(() => setCopieCle(''), 2500);
  }

  // ── Credentials RH ──
  const [cred,          setCred]          = useState(null);
  const [chargCred,     setChargCred]     = useState(false);
  const [mdpVisible,    setMdpVisible]    = useState(false);
  const [resetConfirm,  setResetConfirm]  = useState(false);
  const [resetLoading,  setResetLoading]  = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm,    setCreateForm]    = useState({ prenom: '', nom: '', email: entreprise.referent_rh_email || '' });

  useEffect(() => {
    if (tab !== 'beneficiaires' && tab !== 'classes' && tab !== 'contrat') return;
    if (classesEntL.length > 0 || chargClassesEntL) return;
    setChargClassesEntL(true);
    fetch(`${API_URL}/api/entreprise/admin/${entreprise.id}/classes`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setClassesEntL(d.classes || []))
      .catch(() => {})
      .finally(() => setChargClassesEntL(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'acces') return;
    if (cred) return;
    setChargCred(true);
    fetch(`${API_URL}/api/entreprise/admin/${entreprise.id}/credentials`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setCred(d.credentials ? d.credentials : { error: d.error }))
      .catch(() => setCred({ error: 'Erreur réseau' }))
      .finally(() => setChargCred(false));
  }, [tab]);

  async function reinitialiserMdp() {
    setResetLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/entreprise/admin/${entreprise.id}/reset-password`, {
        method: 'PATCH', headers: authHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setCred(prev => ({ ...prev, mdp_initial: d.nouveau_mdp, mdp_temporaire: true }));
      setMdpVisible(true);
      setResetConfirm(false);
    } catch (err) { await alerte('Erreur : ' + err.message, { titre: 'Réinitialisation du mot de passe', danger: true }); }
    finally { setResetLoading(false); }
  }

  async function creerCompteRH() {
    if (!createForm.email) return;
    setCreateLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/entreprise/admin/${entreprise.id}/creer-compte-rh`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ rh_prenom: createForm.prenom, rh_nom: createForm.nom, rh_email: createForm.email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setCred({ email: d.email, prenom: d.prenom, nom: d.nom, mdp_initial: d.mot_de_passe, mdp_temporaire: true });
      setMdpVisible(true);
    } catch (err) { await alerte('Erreur : ' + err.message, { titre: 'Création du compte RH', danger: true }); }
    finally { setCreateLoading(false); }
  }

  const classesEnt = classesEntL;
  const beneficiairesActifsCount = classesEnt.reduce((s, c) => s + (c.apprenants || []).filter(a => a.statut === 'actif').length, 0);

  const TABS = [
    { id: 'infos',        lib: 'Informations',  icone: '🏢' },
    { id: 'contrat',      lib: 'Contrat',        icone: '📄' },
    { id: 'paiements',    lib: 'Paiements',      icone: '💰', badge: echeancesEnRetard > 0 ? `${echeancesEnRetard} retard` : pais.length },
    { id: 'beneficiaires',lib: 'Classes',        icone: '👥', badge: benefs.length },
    { id: 'acces',        lib: 'Accès RH',       icone: '🔑', badge: entreprise.referent_rh_email ? '1' : null },
    { id: 'documents',    lib: 'Documents',      icone: '📁', badge: documents.length || null },
    { id: 'activite',     lib: 'Activité',       icone: '📋' },
  ];

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' },
    modal: { background: COULEURS.gris50, borderRadius: 20, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.35)', overflow: 'hidden' },
    // Header coloré
    header: { background: `linear-gradient(135deg, ${entreprise.couleur}CC 0%, ${entreprise.couleur} 100%)`, padding: '24px 28px', flexShrink: 0 },
    headerTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
    avatarGrand: { width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0, overflow: 'hidden' },
    nomModal: { fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 4 },
    sousTitreModal: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
    btnX: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: '#fff', flexShrink: 0 },
    headerStats: { display: 'flex', gap: 20 },
    hStat: { textAlign: 'center' },
    hStatVal: { fontSize: 18, fontWeight: 800, color: '#fff' },
    hStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' },
    hSep: { width: 1, background: 'rgba(255,255,255,0.2)', alignSelf: 'stretch' },
    // Tabs
    tabs: { display: 'flex', background: COULEURS.blanc, borderBottom: `1px solid ${COULEURS.gris200}`, padding: '0 8px', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' },
    tab: (a) => ({ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 12px', cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: a ? `2px solid ${entreprise.couleur}` : '2px solid transparent', color: a ? entreprise.couleur : COULEURS.gris600, fontWeight: a ? 700 : 500, fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0 }),
    tabBadge: (a) => ({ background: a ? entreprise.couleur : COULEURS.gris200, color: a ? '#fff' : COULEURS.gris600, borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }),
    // Corps
    corps: { flex: 1, overflowY: 'auto', padding: 24 },
    // Sections infos
    grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
    carteInfo: { background: COULEURS.blanc, borderRadius: 12, padding: '14px 18px', border: `1px solid ${COULEURS.gris200}` },
    carteLabel: { fontSize: 10, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 },
    carteVal: { fontSize: 14, fontWeight: 600, color: COULEURS.navy },
    // Barre progression
    barreEnv: { height: 8, background: COULEURS.gris100, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
    barreRem: (couleur, p) => ({ height: '100%', width: `${p}%`, background: couleur, borderRadius: 4, transition: 'width 0.5s' }),
    // Contrat bloc
    carteContrat: { background: COULEURS.blanc, borderRadius: 12, padding: 20, border: `1px solid ${COULEURS.gris200}`, marginBottom: 16 },
    contratTitre: { fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${COULEURS.gris100}` },
    ligneContrat: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${COULEURS.gris50}`, fontSize: 13 },
    ligneContratLbl: { color: COULEURS.gris600 },
    ligneContratVal: { fontWeight: 600, color: COULEURS.navy },
    // Bénéficiaires liste
    ligneBen: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${COULEURS.gris100}` },
    avatarBen: (c) => ({ width: 34, height: 34, borderRadius: '50%', background: c + '20', border: `1.5px solid ${c}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: c, flexShrink: 0 }),
    // Activité
    ligneAct: { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderBottom: `1px solid ${COULEURS.gris100}` },
    actIcn: (c) => ({ width: 32, height: 32, borderRadius: '50%', background: c + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }),
    // Footer
    footer: { padding: '16px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 12, justifyContent: 'flex-end', background: COULEURS.blanc, flexShrink: 0 },
    btnSec: { padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnPrim: { padding: '9px 20px', borderRadius: 8, border: 'none', background: entreprise.couleur, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    badge: (bg, txt) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: bg, color: txt, fontSize: 11, fontWeight: 600 }),
    // ── Paiements ──
    recapPaie: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 },
    kpiPaie: (c) => ({ background: COULEURS.blanc, borderRadius: 12, padding: '14px 16px', border: `1px solid ${COULEURS.gris200}`, textAlign: 'center' }),
    kpiPaieVal: (c) => ({ fontSize: 20, fontWeight: 800, color: c || COULEURS.navy, marginBottom: 3 }),
    kpiPaieLbl: { fontSize: 10, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em' },
    sectionTitrePaie: { fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 12, marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    tableauPaie: { background: COULEURS.blanc, borderRadius: 10, overflow: 'hidden', border: `1px solid ${COULEURS.gris200}`, marginBottom: 20 },
    thPaie: (cols) => ({ display: 'grid', gridTemplateColumns: cols, padding: '8px 14px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`, fontSize: 10, fontWeight: 700, color: COULEURS.gris500 || COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }),
    trPaie: (cols) => ({ display: 'grid', gridTemplateColumns: cols, padding: '11px 14px', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 12, alignItems: 'center' }),
    btnAjout: { padding: '7px 14px', borderRadius: 8, border: 'none', background: entreprise.couleur, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'flex', alignItems: 'center', gap: 5 },
    btnEchPaie: { padding: '4px 10px', borderRadius: 6, border: `1px solid ${entreprise.couleur}`, background: entreprise.couleur + '15', color: entreprise.couleur, cursor: 'pointer', fontSize: 11, fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 600 },
  };

  return (
    <>
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>

        {/* ── Header coloré ── */}
        <div style={S.header}>
          <div style={S.headerTop}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{ ...S.avatarGrand, position: 'relative', cursor: lectureSeule ? 'default' : 'pointer' }}
                onMouseEnter={() => !lectureSeule && setLogoHover(true)}
                onMouseLeave={() => setLogoHover(false)}
                onClick={() => !lectureSeule && document.getElementById('input-logo-detail').click()}
              >
                {logoLocal && !logoLocal.startsWith('blob:')
                  ? <img src={logoLocal} alt={entreprise.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={ev => { ev.target.style.display = 'none'; }}/>
                  : entreprise.initiales || '🏢'
                }
                {!lectureSeule && (logoHover || logoUploading) && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 18 }}>{logoUploading ? '⏳' : '📷'}</span>
                    {!logoUploading && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>Modifier</span>}
                  </div>
                )}
                <input
                  id="input-logo-detail"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={mettreAJourLogo}
                />
              </div>
              <div>
                <div style={S.nomModal}>{entreprise.nom}</div>
                <div style={S.sousTitreModal}>{entreprise.secteur} · {entreprise.ville || '-'}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ ...S.badge(cfg.bg, cfg.txt), fontSize: 10 }}>{cfg.lib}</span>
                </div>
              </div>
            </div>
            <button style={S.btnX} onClick={onFermer}>×</button>
          </div>
          {/* Mini stats dans le header */}
          <div style={S.headerStats}>
            <div style={S.hStat}>
              <div style={S.hStatVal}>{nbActifsBenef}/{nbLicences}</div>
              <div style={S.hStatLbl}>Bénéficiaires</div>
            </div>
            <div style={S.hSep} />
            <div style={S.hStat}>
              <div style={S.hStatVal}>{((entreprise.montant_contrat || 0) / 1000000).toFixed(1)}M</div>
              <div style={S.hStatLbl}>FCFA contrat</div>
            </div>
            <div style={S.hSep} />
            <div style={S.hStat}>
              <div style={S.hStatVal}>{pct}%</div>
              <div style={S.hStatLbl}>Taux remplissage</div>
            </div>
            {jours !== null && (
              <>
                <div style={S.hSep} />
                <div style={S.hStat}>
                  <div style={{ ...S.hStatVal, color: jours < 60 ? '#FCA5A5' : '#fff' }}>
                    {jours > 0 ? `J-${jours}` : 'Expiré'}
                  </div>
                  <div style={S.hStatLbl}>Fin contrat</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Sous-onglets ── */}
        <div style={S.tabs}>
          {TABS.map((t) => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              <span>{t.icone}</span>
              <span>{t.lib}</span>
              {t.badge != null && <span style={S.tabBadge(tab === t.id)}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ── Corps ── */}
        <div style={S.corps}>

          {/* INFORMATIONS */}
          {tab === 'infos' && (
            <>
              <div style={S.grille2}>
                <div style={S.carteInfo}>
                  <div style={S.carteLabel}>Secteur d'activité</div>
                  <div style={S.carteVal}>{entreprise.secteur}</div>
                </div>
                <div style={S.carteInfo}>
                  <div style={S.carteLabel}>Responsable / Interlocuteur</div>
                  <div style={S.carteVal}>{entreprise.referent_rh_nom || '-'}</div>
                </div>
                <div style={S.carteInfo}>
                  <div style={S.carteLabel}>Email de contact</div>
                  <div style={{ ...S.carteVal, color: couleurTheme }}>{entreprise.referent_rh_email || '-'}</div>
                </div>
                <div style={S.carteInfo}>
                  <div style={S.carteLabel}>Téléphone</div>
                  <div style={S.carteVal}>{entreprise.referent_rh_telephone || '-'}</div>
                </div>
                <div style={{ ...S.carteInfo, gridColumn: '1 / -1' }}>
                  <div style={S.carteLabel}>Adresse complète</div>
                  <div style={S.carteVal}>{entreprise.adresse || '-'} · {entreprise.ville || '-'}</div>
                </div>
              </div>

              {/* Barre bénéficiaires */}
              <div style={{ ...S.carteInfo, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={S.carteLabel}>Taux d'occupation des places</div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: entreprise.couleur }}>{pct}%</span>
                </div>
                <div style={S.barreEnv}>
                  <div style={S.barreRem(entreprise.couleur, pct)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: COULEURS.gris400, marginTop: 6 }}>
                  <span>{nbActifsBenef} inscrits</span>
                  <span>{nbLicences} places contractuelles</span>
                </div>
              </div>

              {/* Modalités de sessions */}
              {(() => {
                const ts = entreprise.types_sessions || ['ligne'];
                const aPresentiel = ts.includes('presentiel');
                const aLigne = ts.includes('ligne');
                const hybride = aPresentiel && aLigne;
                return (
                  <div style={{ ...S.carteInfo, marginBottom: 16 }}>
                    <div style={S.carteLabel}>Modalités de formation</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      {aPresentiel && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: '#FEF3C7', border: '1.5px solid #FDE68A', fontSize: 12, fontWeight: 700, color: '#92400E' }}>
                          🏢 Présentiel
                        </div>
                      )}
                      {aLigne && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: '#E0F2FE', border: '1.5px solid #BAE6FD', fontSize: 12, fontWeight: 700, color: '#0E7490' }}>
                          📹 En ligne
                        </div>
                      )}
                      {hybride && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: '#F5F3FF', border: '1.5px solid #DDD6FE', fontSize: 12, fontWeight: 700, color: '#5B21B6' }}>
                          🔀 Hybride
                        </div>
                      )}
                    </div>
                    {aPresentiel && !aLigne && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#92400E', fontStyle: 'italic' }}>
                        Les sessions en ligne peuvent être ajoutées à tout moment via Modifier → Modalités de formation.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Notes */}
              {entreprise.notes && (
                <div style={{ ...S.carteInfo, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <div style={{ ...S.carteLabel, color: '#92400E' }}>Notes internes</div>
                  <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.6 }}>{entreprise.notes}</div>
                </div>
              )}
            </>
          )}

          {/* CONTRAT */}
          {tab === 'contrat' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                {peutGererContrat && contrat && (
                  <select
                    value={contrat.statut || 'actif'}
                    onChange={e => onChangerStatutContrat(contrat.id, e.target.value)}
                    style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif', background: COULEURS.blanc, color: COULEURS.navy }}
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
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: entreprise.couleur, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                  >
                    {peutGererContrat ? '🔄 Renouveler le contrat' : '🔄 Proposer un renouvellement'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#F1F5F9', color: '#64748B', fontWeight: 600 }}>🔒 Lecture seule</span>
                )}
              </div>
           
              {contrat ? (
                <>
                  {/* Bloc référence + package */}
                  <div style={{ ...S.carteContrat, borderTop: `4px solid ${entreprise.couleur}` }}>
                    <div style={S.contratTitre}>📄 REF-{(contrat.id || '').split('-')[0]?.toUpperCase() || '-'} - Package {contrat.package || '-'}</div>
                    {[
                      { lib: 'Date de création',       val: contrat.created_at ? new Date(contrat.created_at).toLocaleDateString('fr-FR') : '-' },
                      { lib: 'Période de validité',    val: `${contrat.date_debut || '-'} → ${contrat.date_fin || '-'}` },
                      { lib: 'Durée de formation',     val: contrat.date_debut && contrat.date_fin ? `${contrat.date_debut} - ${contrat.date_fin} (${dureeFormation(contrat.date_debut, contrat.date_fin)})` : '-' },
                      { lib: 'Nombre de bénéficiaires',val: `${contrat.nb_licences || 0} places` },
                      { lib: 'Type de sessions',       val: (contrat.types_sessions || []).join(', ') || '-' },
                      { lib: 'Option replay',          val: contrat.option_replay ? '✓ Activé' : '✗ Non' },
                    ].map(({ lib, val }) => (
                      <div key={lib} style={S.ligneContrat}>
                        <span style={S.ligneContratLbl}>{lib}</span>
                        <span style={S.ligneContratVal}>{val}</span>
                      </div>
                    ))}
                    {jours !== null && (
                      <div style={S.ligneContrat}>
                        <span style={S.ligneContratLbl}>Temps restant</span>
                        <span style={{ ...S.ligneContratVal, color: jours < 60 ? '#DC2626' : COULEURS.succes }}>
                          {jours > 0 ? `${jours} jours (J-${jours})` : '⚠️ Expiré'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bloc financier */}
                  <div style={S.carteContrat}>
                    <div style={S.contratTitre}>💰 Situation financière</div>
                    {[
                      { lib: 'Montant total du contrat', val: formatFCFA(montantContrat), accent: true },
                      { lib: 'Encaissé',                 val: formatFCFA(totalEncaisse) },
                      { lib: 'Solde restant dû',         val: formatFCFA(soldeRestant), rouge: soldeRestant > 0 },
                    ].map(({ lib, val, accent, rouge }) => (
                      <div key={lib} style={S.ligneContrat}>
                        <span style={S.ligneContratLbl}>{lib}</span>
                        <span style={{ ...S.ligneContratVal, color: rouge ? '#DC2626' : accent ? entreprise.couleur : COULEURS.navy, fontSize: accent ? 15 : 13 }}>{val}</span>
                      </div>
                    ))}
                    {/* Barre paiement */}
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: COULEURS.gris400, marginBottom: 6 }}>
                        <span>Taux de paiement</span>
                        <span style={{ fontWeight: 700, color: pctPaie === 100 ? COULEURS.succes : COULEURS.attention }}>{pctPaie}%</span>
                      </div>
                      <div style={S.barreEnv}>
                        <div style={S.barreRem(pctPaie === 100 ? COULEURS.succes : COULEURS.attention, pctPaie)} />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: COULEURS.gris400 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                  <div>Aucun contrat enregistré pour cette entreprise.</div>
                </div>
              )}

              {/* ── Historique des contrats précédents (renouvellements) ── */}
              {contratsEnt.filter(c => c.id !== contrat?.id).length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 10 }}>
                    📚 Historique des contrats ({contratsEnt.filter(c => c.id !== contrat?.id).length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {contratsEnt.filter(c => c.id !== contrat?.id).map(c => {
                      const cfgC = STATUT_CONTRAT_LIB[c.statut] || STATUT_CONTRAT_LIB.expire;
                      const ouvert = contratHistoriqueOuvert === c.id;
                      return (
                        <div key={c.id} style={{ background: COULEURS.gris50, border: `1px solid ${COULEURS.gris200}`, borderRadius: 10, padding: '12px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy }}>📄 REF-{(c.id || '').split('-')[0]?.toUpperCase() || '-'} - Package {c.package || '-'}</span>
                            <span style={{ padding: '2px 10px', borderRadius: 20, background: cfgC.bg, color: cfgC.txt, fontSize: 10, fontWeight: 700 }}>{cfgC.lib}</span>
                          </div>
                          <div style={{ fontSize: 11, color: COULEURS.gris600 }}>
                            {c.date_debut || '-'} → {c.date_fin || '-'} · {c.nb_licences || 0} places · {formatFCFA(c.montant_ht)}
                          </div>
                          {c.statut === 'brouillon' && peutGererContrat && (
                            <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 11, color: '#92400E' }}>🕒 Renouvellement proposé - en attente de validation</span>
                              <button
                                onClick={async () => {
                                  if (!(await confirm(`Valider ce renouvellement pour ${entreprise.nom} ? L'ancien contrat sera archivé et ce nouveau contrat sera activé.`, { titre: 'Valider le renouvellement', confirmLabel: 'Valider', danger: false }))) return;
                                  onValiderRenouvellement(c.id);
                                }}
                                style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                              >
                                ✓ Valider
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => setContratHistoriqueOuvert(ouvert ? null : c.id)}
                            style={{ marginTop: 8, background: 'none', border: 'none', color: entreprise.couleur, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                          >
                            {ouvert ? '▲ Masquer les détails' : '▼ Voir les détails'}
                          </button>
                          {ouvert && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COULEURS.gris200}` }}>
                              {[
                                { lib: 'Date de création',   val: c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-' },
                                { lib: 'Durée de formation', val: c.date_debut && c.date_fin ? dureeFormation(c.date_debut, c.date_fin) : '-' },
                                { lib: 'Type de sessions',   val: (c.types_sessions || []).join(', ') || '-' },
                                { lib: 'Option replay',      val: c.option_replay ? '✓ Activé' : '✗ Non' },
                                { lib: 'Devise',              val: c.devise || 'FCFA' },
                              ].map(({ lib, val }) => (
                                <div key={lib} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                                  <span style={{ color: COULEURS.gris400 }}>{lib}</span>
                                  <span style={{ fontWeight: 600, color: COULEURS.navy }}>{val}</span>
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

          {/* BÉNÉFICIAIRES */}
          {tab === 'beneficiaires' && (
            <>
              {/* KPIs */}
              <div style={{ display:'flex', gap:10, marginBottom:18 }}>
                {[
                  { lib:'Classes',    val: classesEnt.length,                                                              c: entreprise.couleur },
                  { lib:'Total',      val: classesEnt.reduce((s,c) => s + (c.apprenants||[]).length, 0),                  c: COULEURS.navy },
                  { lib:'Actifs',     val: classesEnt.reduce((s,c) => s + (c.apprenants||[]).filter(a=>a.statut==='actif').length, 0), c: COULEURS.succes },
                  { lib:'En attente', val: classesEnt.reduce((s,c) => s + (c.apprenants||[]).filter(a=>a.statut!=='actif').length, 0), c: COULEURS.attention },
                ].map(({lib,val,c}) => (
                  <div key={lib} style={{ flex:1, background:COULEURS.blanc, borderRadius:10, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:800, color:c }}>{val}</div>
                    <div style={{ fontSize:10, color:COULEURS.gris400 }}>{lib}</div>
                  </div>
                ))}
              </div>
              {/* Classes cards */}
              {chargClassesEntL ? (
                <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
                  <div>Chargement des classes…</div>
                </div>
              ) : classesEnt.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400, border:`2px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🏫</div>
                  <div>Aucune classe configurée pour cette entreprise.</div>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
                  {classesEnt.map(c => {
                    const appList   = c.apprenants || [];
                    const nbActifs  = appList.filter(a => a.statut === 'actif').length;
                    const horaires  = Array.isArray(c.horaire) ? c.horaire : [];
                    const niv       = c.niveau_cecr || c.cecr_min || '-';
                    const nivCoul   = NIVEAU_COULEUR[niv] || entreprise.couleur;
                    const pct       = c.capacite > 0 ? Math.min(Math.round((appList.length / c.capacite) * 100), 100) : 0;
                    const coulBarre = pct >= 100 ? '#DC2626' : pct >= 80 ? '#F97316' : COULEURS.succes;
                    return (
                      <div key={c.id} onClick={() => setClasseDetail(c)}
                        style={{ background:COULEURS.blanc, borderRadius:14, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.13)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.transform='none'; }}>
                        {/* Bandeau couleur */}
                        <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}BB, ${entreprise.couleur})`, padding:'14px 16px' }}>
                          <div style={{ fontSize:14, fontWeight:800, color:'#fff', marginBottom:2 }}>{c.nom}</div>
                          <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)' }}>{c.format || 'En ligne'} · {appList.length} apprenant{appList.length!==1?'s':''}</div>
                          {horaires.length > 0 && (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
                              {horaires.slice(0,3).map((h,i) => (
                                <span key={i} style={{ background:'rgba(255,255,255,0.2)', borderRadius:6, padding:'2px 8px', fontSize:10, color:'#fff', fontWeight:600 }}>{h.jour} {h.debut}–{h.fin}</span>
                              ))}
                              {horaires.length > 3 && <span style={{ background:'rgba(255,255,255,0.15)', borderRadius:6, padding:'2px 8px', fontSize:10, color:'#fff' }}>+{horaires.length-3}</span>}
                            </div>
                          )}
                        </div>
                        {/* Corps */}
                        <div style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                            <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:`${nivCoul}20`, color:nivCoul, fontSize:11, fontWeight:700 }}>{niv}</span>
                            <span style={{ fontSize:11, color: c.statut === 'actif' ? COULEURS.succes : COULEURS.gris400, fontWeight:600 }}>{c.statut === 'actif' ? '✅ Active' : '⏸ Inactive'}</span>
                          </div>
                          {c.capacite > 0 && (
                            <>
                              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:COULEURS.gris600, marginBottom:4 }}>
                                <span>{appList.length}/{c.capacite} places · {nbActifs} actifs</span>
                                <span style={{ fontWeight:700, color:coulBarre }}>{pct}%</span>
                              </div>
                              <div style={{ height:4, background:COULEURS.gris100, borderRadius:2, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${pct}%`, background:coulBarre, borderRadius:2 }} />
                              </div>
                            </>
                          )}
                          <div style={{ marginTop:10, fontSize:11, color:couleurTheme, fontWeight:600, textAlign:'right' }}>Voir les apprenants →</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* PAIEMENTS */}
          {tab === 'paiements' && (
            <>
              {/* Récap financier */}
              <div style={S.recapPaie}>
                <div style={S.kpiPaie()}>
                  <div style={S.kpiPaieVal(entreprise.couleur)}>{formatFCFA(montantContrat)}</div>
                  <div style={S.kpiPaieLbl}>Montant total contrat</div>
                </div>
                <div style={S.kpiPaie()}>
                  <div style={S.kpiPaieVal(COULEURS.succes)}>{formatFCFA(totalEncaisse)}</div>
                  <div style={S.kpiPaieLbl}>Encaissé</div>
                </div>
                <div style={S.kpiPaie()}>
                  <div style={S.kpiPaieVal(soldeRestant > 0 ? '#DC2626' : COULEURS.succes)}>{formatFCFA(soldeRestant)}</div>
                  <div style={S.kpiPaieLbl}>Solde restant dû</div>
                </div>
              </div>

              {/* Barre de progression globale */}
              <div style={{ background: COULEURS.blanc, borderRadius: 10, padding: '14px 16px', border: `1px solid ${COULEURS.gris200}`, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                  <span style={{ color: COULEURS.gris600, fontWeight: 600 }}>Taux d'encaissement</span>
                  <span style={{ fontWeight: 800, color: pctPaiGlobal === 100 ? COULEURS.succes : COULEURS.attention }}>{pctPaiGlobal}%</span>
                </div>
                <div style={{ height: 10, background: COULEURS.gris100, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pctPaiGlobal}%`, background: pctPaiGlobal === 100 ? COULEURS.succes : entreprise.couleur, borderRadius: 5, transition: 'width 0.5s' }} />
                </div>
                {echeancesEnRetard > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#DC2626', fontWeight: 600 }}>
                    ⚠️ {echeancesEnRetard} échéance{echeancesEnRetard > 1 ? 's' : ''} en retard
                  </div>
                )}
              </div>

              {/* ── Échéancier ── */}
              <div style={S.sectionTitrePaie}>
                <span>📅 Échéancier de paiement</span>
                {peutSaisirPaiements && <button style={S.btnAjout} onClick={() => { setEchLiee(null); setModalPaie(true); }}>＋ Versement</button>}
                {entrepriseRefusee && (
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#FEE2E2', color: '#991B1B', fontWeight: 600 }}>
                    ❌ Inscription refusée - aucune saisie possible
                  </span>
                )}
              </div>
              {echs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: COULEURS.gris400, fontSize: 13 }}>Aucun échéancier défini.</div>
              ) : (
                <div style={S.tableauPaie}>
                  <div style={S.thPaie('28px 1.5fr 1fr 1fr 1fr 100px')}>
                    <span>#</span><span>Libellé</span><span>Montant</span><span>Date prévue</span><span>Statut</span><span>Action</span>
                  </div>
                  {echs.map((e) => {
                    const sp = STATUT_PAI[e.statut] || STATUT_PAI.a_venir;
                    const retard = e.statut === 'en_attente' && new Date(e.date_prevue) < new Date();
                    const statutEffectif = retard ? STATUT_PAI.retard : sp;
                    return (
                      <div key={e.id} style={{ ...S.trPaie('28px 1.5fr 1fr 1fr 1fr 100px'), background: retard ? '#FFF5F5' : undefined }}>
                        <span style={{ fontWeight: 700, color: COULEURS.gris400 }}>{e.num}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: COULEURS.navy }}>{e.libelle}</div>
                          {e.date_paiement && <div style={{ fontSize: 10, color: COULEURS.succes }}>Reçu le {e.date_paiement}</div>}
                        </div>
                        <span style={{ fontWeight: 700, color: COULEURS.navy }}>{(e.montant / 1000000).toFixed(3)}M</span>
                        <span style={{ color: retard ? '#DC2626' : COULEURS.gris600 }}>{e.date_prevue}</span>
                        <span style={{ ...S.badge(statutEffectif.bg, statutEffectif.txt) }}>
                          {statutEffectif.icone} {statutEffectif.lib}
                        </span>
                        {e.statut !== 'paye' ? (
                          peutSaisirPaiements
                            ? <button style={S.btnEchPaie} onClick={() => { setEchLiee(e); setModalPaie(true); }}>Enregistrer</button>
                            : <span style={{ fontSize: 11, color: COULEURS.gris400 }}>-</span>
                        ) : (
                          <span style={{ fontSize: 11, color: COULEURS.succes }}>✓ Soldé</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Historique des versements ── */}
              <div style={S.sectionTitrePaie}>
                <span>🧾 Historique des versements ({pais.length})</span>
              </div>
              {pais.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: COULEURS.gris400, fontSize: 13 }}>Aucun versement enregistré.</div>
              ) : (() => {
                const avecActions = peutModifierPaiements || peutSupprimerPaiements;
                const colsPaie = avecActions ? '1fr 1fr 1fr 1fr 90px 70px' : '1fr 1fr 1fr 1fr 90px';
                return (
                <div style={S.tableauPaie}>
                  <div style={S.thPaie(colsPaie)}>
                    <span>Date</span><span>Référence</span><span>Mode</span><span>Note</span><span>Montant</span>{avecActions && <span>Actions</span>}
                  </div>
                  {[...pais].reverse().map((p) => {
                    const sp = STATUT_PAI[p.statut] || STATUT_PAI.recu;
                    return (
                      <div key={p.id} onClick={() => setPaiementDetail(p)} style={{ ...S.trPaie(colsPaie), cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ color: COULEURS.gris600 }}>{p.date}</span>
                        <span style={{ fontWeight: 600, color: COULEURS.navy, fontSize: 11 }}>{p.reference}</span>
                        <span style={{ color: COULEURS.gris600, fontSize: 11 }}>{p.mode}</span>
                        <span style={{ color: COULEURS.gris400, fontSize: 11 }}>{p.note || '-'}</span>
                        <span style={{ fontWeight: 800, color: p.statut === 'recu' ? COULEURS.succes : COULEURS.attention, textAlign: 'right' }}>
                          {(p.montant / 1000000).toFixed(3)}M
                        </span>
                        {avecActions && (
                          <span style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                            {peutModifierPaiements && (
                              <button onClick={() => { setPaiementAEditer(p); setModalPaie(true); }}
                                title="Modifier" style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, cursor: 'pointer', fontSize: 12 }}>✏️</button>
                            )}
                            {peutSupprimerPaiements && (
                              <button onClick={() => supprimerPaiement(p)}
                                title="Supprimer" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #FCA5A5', background: '#FFF5F5', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {/* Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: COULEURS.gris50, borderTop: `2px solid ${COULEURS.gris200}` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy }}>TOTAL ENCAISSÉ</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: COULEURS.succes }}>{formatFCFA(totalEncaisse)}</span>
                  </div>
                </div>
                );
              })()}
            </>
          )}

          {/* ACCÈS RH */}
          {tab === 'acces' && (
            <>
              {chargCred ? (
                <div style={{ padding: 40, textAlign: 'center', color: COULEURS.gris400 }}>Chargement…</div>
              ) : cred?.error ? (
                /* ── Aucun compte → formulaire création ── */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, marginBottom: 20 }}>
                    <span style={{ fontSize: 24 }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#92400E' }}>Aucun compte RH créé</div>
                      <div style={{ fontSize: 12, color: '#92400E', opacity: 0.8 }}>Créez le compte de connexion pour le responsable RH</div>
                    </div>
                  </div>
                  <div style={{ background: COULEURS.blanc, borderRadius: 12, padding: 20, border: `1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 16 }}>🔑 Créer le compte RH</div>
                    {[
                      { lbl: 'Prénom', key: 'prenom', placeholder: 'ex : Marie' },
                      { lbl: 'Nom',    key: 'nom',    placeholder: 'ex : Dupont' },
                      { lbl: 'Email de connexion', key: 'email', placeholder: 'rh@entreprise.com' },
                    ].map(({ lbl, key, placeholder }) => (
                      <div key={key} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{lbl}</div>
                        <input
                          value={createForm[key]}
                          onChange={e => setCreateForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', boxSizing: 'border-box', outline: 'none' }}
                        />
                      </div>
                    ))}
                    <button
                      onClick={creerCompteRH}
                      disabled={createLoading || !createForm.email}
                      style={{ width: '100%', padding: '11px', borderRadius: 9, border: 'none', background: createForm.email ? entreprise.couleur : COULEURS.gris200, color: '#fff', fontSize: 13, fontWeight: 700, cursor: createForm.email ? 'pointer' : 'not-allowed', fontFamily: '"Plus Jakarta Sans", sans-serif', marginTop: 4 }}
                    >
                      {createLoading ? '⏳ Création…' : '✅ Créer le compte RH'}
                    </button>
                  </div>
                </div>
              ) : cred ? (
                /* ── Compte existant → afficher les credentials ── */
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 12, marginBottom: 20 }}>
                    <span style={{ fontSize: 24 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#065F46' }}>Compte RH actif - {cred.prenom} {cred.nom}</div>
                      <div style={{ fontSize: 12, color: '#065F46', opacity: 0.8 }}>Accès au tableau de bord entreprise</div>
                    </div>
                  </div>

                  <div style={{ background: COULEURS.blanc, borderRadius: 12, padding: 20, border: `1px solid ${COULEURS.gris200}`, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${COULEURS.gris100}` }}>
                      Identifiants de connexion
                    </div>

                    {[
                      { lbl: 'Email de connexion', val: cred.email,        key: 'email', masque: false },
                      { lbl: 'Mot de passe',        val: cred.mdp_initial, key: 'mdp',   masque: true  },
                    ].map(({ lbl, val, key, masque }) => (
                      <div key={key} style={{ background: COULEURS.gris50, borderRadius: 10, padding: '12px 16px', marginBottom: 10, border: `1px solid ${COULEURS.gris200}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{lbl}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, fontFamily: 'monospace', letterSpacing: masque ? '0.08em' : 'normal' }}>
                            {masque && !mdpVisible ? '••••••••••••' : (val || '-')}
                          </span>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            {masque && (
                              <button onClick={() => setMdpVisible(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: COULEURS.gris400 }}>
                                {mdpVisible ? '🙈' : '👁'}
                              </button>
                            )}
                            {val && (
                              <button
                                onClick={() => copier(val, key)}
                                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${copieCle === key ? COULEURS.succes : COULEURS.gris200}`, background: copieCle === key ? '#D1FAE5' : COULEURS.blanc, color: copieCle === key ? COULEURS.succes : COULEURS.gris600, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif', whiteSpace: 'nowrap' }}
                              >
                                {copieCle === key ? '✓ Copié' : '📋 Copier'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {cred.mdp_temporaire && (
                      <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1D4ED8', marginBottom: 14 }}>
                        ℹ️ Mot de passe temporaire - l'utilisateur doit le modifier à la première connexion.
                      </div>
                    )}

                    {/* Réinitialiser */}
                    {!resetConfirm ? (
                      <>
                        <button onClick={() => setResetConfirm(true)} style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1.5px solid #DC2626', background: '#FEF2F2', color: '#DC2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', marginTop: 6 }}>
                          🔄 Réinitialiser le mot de passe
                        </button>
                        {/* Renvoi des accès par email - envoi réel à configurer plus tard */}
                        <button onClick={() => toast.success(`📧 Accès renvoyés par email à ${cred.email}`)} style={{ width: '100%', padding: '10px', borderRadius: 9, border: `1.5px solid ${entreprise.couleur}`, background: '#fff', color: entreprise.couleur, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', marginTop: 10 }}>
                          📧 Renvoyer les accès par email
                        </button>
                      </>
                    ) : (
                      <div style={{ background: '#FEF2F2', borderRadius: 10, border: '1.5px solid #FECACA', padding: '14px 16px', marginTop: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 8 }}>⚠️ Confirmer la réinitialisation ?</div>
                        <div style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 12 }}>L'ancien mot de passe sera immédiatement invalidé.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={reinitialiserMdp} disabled={resetLoading} style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: resetLoading ? 'not-allowed' : 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                            {resetLoading ? '⏳ En cours…' : '✅ Confirmer'}
                          </button>
                          <button onClick={() => setResetConfirm(false)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </>
          )}

          {/* ACTIVITÉ */}
          {/* CLASSES */}
          {tab === 'classes' && (
            <>
              {/* Mini stats */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                {[
                  { l: 'Total',    v: classesEnt.length,                                    c: COULEURS.navy   },
                  { l: 'Actives',  v: classesEnt.filter(g => g.statut === 'actif').length,   c: COULEURS.succes },
                  { l: 'Inactives',v: classesEnt.filter(g => g.statut !== 'actif').length,   c: COULEURS.gris400},
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ flex: 1, background: COULEURS.blanc, borderRadius: 10, padding: '12px 14px', border: `1px solid ${COULEURS.gris200}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
                    <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{l}</div>
                  </div>
                ))}
              </div>

              {classesEnt.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 12 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🏫</div>
                  <div>Aucune classe créée pour cette entreprise.</div>
                </div>
              ) : (
                classesEnt.map(g => {
                  const active   = g.statut === 'actif';
                  const appList  = g.apprenants || [];
                  return (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: `1px solid ${COULEURS.gris100}` }}>
                      {/* Barre accent */}
                      <div style={{ width: 4, height: 48, borderRadius: 4, background: active ? entreprise.couleur : COULEURS.gris200, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: COULEURS.navy, fontSize: 13, marginBottom: 4 }}>{g.nom}</div>
                        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: COULEURS.gris600, flexWrap: 'wrap' }}>
                          {g.niveau && (
                            <span style={{ fontWeight: 700, color: NIVEAU_COULEUR[g.niveau] || COULEURS.navy }}>{g.niveau}</span>
                          )}
                          <span>{appList.length}{g.capacite_max ? `/${g.capacite_max}` : ''} apprenant{appList.length !== 1 ? 's' : ''}</span>
                          {g.coach_nom && <span>👩‍🏫 {g.coach_nom}</span>}
                        </div>
                      </div>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: active ? '#D1FAE5' : '#F1F5F9',
                        color: active ? '#065F46' : '#64748B',
                        flexShrink: 0,
                      }}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'documents' && (
            <>
              {!lectureSeule && (
                docFichierEnAttente ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: `1.5px solid ${couleurTheme}`, background: `${couleurTheme}08`, marginBottom: 16 }}>
                    <span style={{ fontSize: 18 }}>📄</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {docFichierEnAttente.name}
                    </span>
                    <button type="button" onClick={() => setDocFichierEnAttente(null)} disabled={docUploading}
                      style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: docUploading ? 'default' : 'pointer', background: 'transparent', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      ✕ Annuler
                    </button>
                    <button type="button" onClick={validerDepotDocument} disabled={docUploading}
                      style={{ padding: '6px 14px', borderRadius: 8, border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: docUploading ? 'wait' : 'pointer', background: couleurTheme, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      {docUploading ? 'Envoi…' : '✅ Valider le dépôt'}
                    </button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 12, border: `2px dashed ${COULEURS.gris200}`, cursor: 'pointer', marginBottom: 16, fontSize: 13, fontWeight: 600, color: couleurTheme, background: COULEURS.blanc }}>
                    📎 Déposer un document (PDF, Word, Excel… - max 10 Mo)
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style={{ display: 'none' }} onChange={deposerDocument} />
                  </label>
                )
              )}
              {chargDocs ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
              ) : (documentsAffiches.length === 0) ? (
                <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Aucun document déposé pour cette entreprise.</div>
              ) : (
                documentsAffiches.map(doc => {
                  const estPreuve = doc.type === 'preuve_inscription';
                  return (
                    <div key={doc.id} style={{ ...S.ligneAct, alignItems: 'center' }}>
                      <div style={S.actIcn(entreprise.couleur)}>{estPreuve ? '📎' : '📄'}</div>
                      <a href={doc.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nom}</div>
                        <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 2 }}>{estPreuve ? `Document · Déposé par ${doc.depose_par_nom || '-'}` : `Déposé par ${doc.depose_par_nom || '-'}`}</div>
                      </a>
                      <span style={{ fontSize: 11, color: COULEURS.gris400, flexShrink: 0, marginRight: lectureSeule ? 0 : 10 }}>{(doc.created_at || '').slice(0, 10)}</span>
                      {!lectureSeule && (
                        <button type="button" onClick={() => supprimerDocument(doc.id)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 16, flexShrink: 0 }} title="Supprimer">🗑️</button>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'activite' && (
            <>
              {ACTIVITE_FICTIVE.map((a, i) => (
                <div key={i} style={S.ligneAct}>
                  <div style={S.actIcn(entreprise.couleur)}>{a.icone}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>{a.lib}</div>
                    <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 2 }}>{a.detail}</div>
                  </div>
                  <span style={{ fontSize: 11, color: COULEURS.gris400, flexShrink: 0 }}>{a.date}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={S.footer}>
          <button style={S.btnSec} onClick={onFermer}>Fermer</button>
          {!lectureSeule && (
            <button style={S.btnPrim} onClick={() => { onFermer(); onEditer(entreprise); }}>
              ✏️ Modifier l'entreprise
            </button>
          )}
          {lectureSeule && (
            <div style={{ padding:'8px 14px', borderRadius:8, background:'#EFF6FF', border:'1px solid #BFDBFE', color:'#1D4ED8', fontSize:12, fontWeight:600 }}>
              {peutSaisirPaiements ? '👁 Consultation · paiements autorisés' : '🔒 Mode lecture seule'}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Modale renouvellement de contrat (renouvellement direct pour l'admin BET,
        proposition à valider pour l'assistante e-learning) ── */}
    {modalRenouvellement && (
      <ModalRenouvellementContrat
        entreprise={entreprise}
        modeProposition={!peutGererContrat}
        beneficiairesActifs={beneficiairesActifsCount}
        onFermer={() => setModalRenouvellement(false)}
        onSauvegarder={async (form) => {
          const ok = peutGererContrat
            ? await onRenouvelerContrat(entreprise.id, form)
            : await onProposerRenouvellement(entreprise.id, form);
          if (ok) setModalRenouvellement(false);
        }}
      />
    )}

    {/* ── Modale ajout / correction versement ── */}
    {modalPaie && (
      <ModalAjoutVersement
        entreprise={entreprise}
        echeanceLiee={echeanceLiee}
        echeanciers={echs}
        soldeRestant={soldeRestant}
        paiementAModifier={paiementAEditer}
        onFermer={() => { setModalPaie(false); setEchLiee(null); setPaiementAEditer(null); }}
        onSauvegarder={(paie) => {
          if (paiementAEditer) onModifierPaiement(paiementAEditer.id, paie);
          else onAjouterPaiement(paie);
          setModalPaie(false);
          setEchLiee(null);
          setPaiementAEditer(null);
        }}
      />
    )}

    {/* ── Modale détail versement (traçabilité + reçu) ── */}
    {paiementDetail && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150, backdropFilter: 'blur(4px)' }} onClick={() => setPaiementDetail(null)}>
        <div style={{ background: COULEURS.blanc, borderRadius: 16, width: 640, maxWidth: '94vw', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
          <div style={{ background: `linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>💰 Détail du versement</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>{entreprise.nom}</div>
            </div>
            <button onClick={() => setPaiementDetail(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: 24 }}>
            {[
              { lbl: 'Montant', val: formatFCFA(paiementDetail.montant) },
              { lbl: 'Date du versement', val: paiementDetail.date },
              { lbl: 'Mode de paiement', val: paiementDetail.mode || '-' },
              { lbl: 'Référence', val: paiementDetail.reference || '-' },
              { lbl: 'Note', val: paiementDetail.note || '-' },
            ].map(({ lbl, val }) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 13 }}>
                <span style={{ color: COULEURS.gris600 }}>{lbl}</span>
                <span style={{ fontWeight: 700, color: COULEURS.navy }}>{val}</span>
              </div>
            ))}
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '12px 16px', marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>🔍 Traçabilité</div>
              <div style={{ fontSize: 13, color: '#0F172A' }}>
                Enregistré par <strong>{paiementDetail.cree_par_nom || 'Inconnu'}</strong>
                {paiementDetail.created_at && <> le {new Date(paiementDetail.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
              </div>
            </div>
          </div>
          <div style={{ padding: '14px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => setPaiementDetail(null)} style={{ padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
            {peutModifierPaiements && (
              <button onClick={() => { setPaiementAEditer(paiementDetail); setPaiementDetail(null); setModalPaie(true); }} style={{ padding: '9px 20px', borderRadius: 8, border: `1.5px solid ${entreprise.couleur}`, background: COULEURS.blanc, color: entreprise.couleur, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                ✏️ Modifier
              </button>
            )}
            {peutSupprimerPaiements && (
              <button onClick={() => supprimerPaiement(paiementDetail)} style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #FCA5A5', background: '#FFF5F5', color: '#991B1B', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                🗑️ Supprimer
              </button>
            )}
            <button onClick={() => genererRecuVersement(paiementDetail, entreprise, { montantContrat, soldeRestant })} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: entreprise.couleur, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              🧾 Générer le reçu
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modale ajout / modification bénéficiaire ── */}
    {modalBen && (
      <ModalBeneficiaireRapide
        entreprise={entreprise}
        benef={benEdite}
        onFermer={() => { setModalBen(false); setBenEdite(null); }}
        onSauvegarder={(form) => {
          onSauvegarderBeneficiaire(form);
          setModalBen(false);
          setBenEdite(null);
        }}
      />
    )}

    {/* ── Modale détail classe (bénéficiaires onglet) ── */}
    {classeDetail && (
      <ModalDetailClasseGestion
        classe={classeDetail}
        entreprise={entreprise}
        onFermer={() => setClasseDetail(null)}
        onOuvrirBenef={b => setBenDetail(b)}
      />
    )}

    {/* ── Modale détail bénéficiaire ── */}
    {benDetail && (
      <ModalDetailBeneficiaire
        benef={benDetail}
        entreprise={entreprise}
        onFermer={() => setBenDetail(null)}
        onEditer={(b) => {
          setBenDetail(null);
          setBenEdite(b);
          setModalBen(true);
        }}
      />
    )}
    </>
  );
}

// ─── Composant Pagination ────────────────────────────────────────────────────
function Pagination({ total, parPage, page, onChange }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const nbPages = Math.max(1, Math.ceil(total / parPage));
  if (nbPages <= 1) return null;

  const pages = Array.from({ length: nbPages }, (_, i) => i + 1);
  const btn = (actif) => ({
    minWidth: 42, height: 42, padding: '0 6px', borderRadius: 9,
    border: `1.5px solid ${actif ? couleurTheme : COULEURS.gris200}`,
    background: actif ? couleurTheme : COULEURS.blanc,
    color: actif ? COULEURS.blanc : COULEURS.navy,
    fontSize: 15, fontWeight: actif ? 700 : 500,
    cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: `1px solid ${COULEURS.gris100}` }}>
      <span style={{ fontSize: 13, color: COULEURS.gris600 }}>
        Page {page} sur {nbPages} · {total} résultat{total > 1 ? 's' : ''}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...btn(false), opacity: page === 1 ? 0.35 : 1 }} disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
        {pages.map(p => <button key={p} style={btn(p === page)} onClick={() => onChange(p)}>{p}</button>)}
        <button style={{ ...btn(false), opacity: page === nbPages ? 0.35 : 1 }} disabled={page === nbPages} onClick={() => onChange(page + 1)}>›</button>
      </div>
    </div>
  );
}

const PAR_PAGE = 15;

// ─── Page principale ──────────────────────────────────────────────────────────
export default function GestionEntreprises() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile } = useAuth();
  const confirm = useConfirm();
  const alerte = useAlerte();
  // ⚠️ La façade "admin_elearning" est partagée entre un éventuel admin e-learning ET le rôle
  // physique "commercial" (l'assistante e-learning) - la whitelister ici court-circuiterait
  // toujours la matrice de permissions pour elle. Seul "admin_manager"/"admin_superviseur"
  // sont des façades sans ambiguïté (super_admin/admin/manager/superviseur).
  /* L'ADMINISTRATEUR CONSULTE, IL N'ÉCRIT PAS, sur le portefeuille entreprises. `estRole` avec
     la famille `admin_manager` l'y autorisait — elle contient super_admin, admin ET manager.
     On nomme donc les rôles un par un : le Super Admin garde la main (il a tout), le Manager
     aussi, l'Administrateur passe en lecture. `lectureSeule` en découle juste en dessous et
     ferme d'un coup tous les points d'entrée en écriture de cet écran. */
  const peutModifier        = estRole(profile?.role, ['super_admin', 'manager', 'admin_manager', 'admin_superviseur']) || profile?.permissions?.crm_entreprises?.update === true;
  // Module dédié "contrat" (renouvellement/statut) - distinct de "crm_entreprises" (fiche entreprise).
  // L'assistante e-learning a le droit "créer" (pas "modifier") sur ce module : elle peut donc
  // proposer un renouvellement, mais seul l'admin BET (droit "modifier") peut le valider.
  const peutGererContratModule = estRole(profile?.role, ['admin_manager', 'admin_superviseur']) || profile?.permissions?.contrat?.update === true;
  const peutProposerRenouvellement = !peutGererContratModule && profile?.permissions?.contrat?.create === true;
  const peutSaisirPaiements = estRole(profile?.role, 'admin_manager') || profile?.permissions?.finances?.create === true;
  const peutModifierPaiements = estRole(profile?.role, 'admin_manager') || profile?.permissions?.finances?.update === true;
  // Suppression réservée à l'admin BET - jamais à l'assistante e-learning.
  const peutSupprimerPaiements = estRole(profile?.role, ['admin_manager', 'admin_superviseur']) || profile?.permissions?.finances?.delete === true;
  const lectureSeule        = !peutModifier;

  const [onglet, setOnglet]           = useState('overview');
  const [entreprises, setEntreprises] = useState([]);
  const [beneficiaires, setBenef]     = useState([]);
  // Distinct de `beneficiaires` (qui ne contient que ceux de l'entreprise dont le détail est
  // ouvert, vidé à la fermeture) - celui-ci couvre TOUTES les entreprises, alimenté une fois
  // au chargement de la liste, pour que les compteurs "Bénéficiaires" du tableau restent
  // corrects sans avoir à ouvrir chaque fiche.
  const [beneficiairesTous, setBeneficiairesTous] = useState([]);
  const [contrats, setContrats]       = useState([]);
  const [paiements, setPaiements]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);

  const [modalEnt, setModalEnt]     = useState(false);
  const [entEdite, setEntEdite]     = useState(null);
  const [entDetail, setEntDetail]   = useState(null);
  const [rechEnt, setRechEnt]       = useState('');
  const [filtreEnt, setFiltreEnt]   = useState('tous');
  const [pageEnt, setPageEnt]       = useState(1);
  const [credentialsData, setCredData] = useState(null);
  const [modalParcours, setModalParcours] = useState(false);
  const [modalValider, setModalValider]   = useState(false);
  const [parcoursEdite, setParcoursEdite] = useState(null);
  const [contratDetail, setContratDetail] = useState(null);

  // ── Chargement initial ──────────────────────────────────────────
  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [entRes, contratsRes, paiementsRes] = await Promise.all([
        fetch(`${API_URL}/api/entreprise/admin/liste`,     { headers: authHeaders() }),
        fetch(`${API_URL}/api/entreprise/admin/contrats`,  { headers: authHeaders() }),
        fetch(`${API_URL}/api/entreprise/admin/paiements`, { headers: authHeaders() }),
      ]);
      if (entRes.ok)      { const d = await entRes.json();      setEntreprises(d.entreprises || []); setBeneficiairesTous(d.beneficiaires || []); }
      if (contratsRes.ok) { const d = await contratsRes.json(); setContrats(d.contrats || []); }
      if (paiementsRes.ok){ const d = await paiementsRes.json(); setPaiements(d.paiements || []); }
    } catch (err) { console.error("Erreur chargement entreprises:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Rafraîchit le cache des packages commerciaux (base de données) - lu de façon synchrone
  // via lirePackages() à de nombreux endroits de ce fichier (formulaire de création,
  // calcul du CA, détail contrat…), voir constants/packagesCommerciaux.js.
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) chargerPackages(token);
  }, []);

  // Charger les bénéficiaires d'une entreprise quand on ouvre son détail
  async function chargerBeneficiaires(entrepriseId) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/${entrepriseId}/beneficiaires`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setBenef(d.beneficiaires || []); }
    } catch {}
  }

  function ouvrirDetail(e) { setEntDetail(e); chargerBeneficiaires(e.id); }
  function fermerDetail()  { setEntDetail(null); setBenef([]); }
  function ouvrirEditionDepuisDetail(e) { setEntEdite(e); setModalEnt(true); }

  async function sauvegarderBeneficiaireDepuisDetail(form) {
    try {
      const url    = form.id ? `${API_URL}/api/entreprise/admin/beneficiaire/${form.id}` : `${API_URL}/api/entreprise/admin/beneficiaire`;
      const method = form.id ? 'PATCH' : 'POST';
      const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify({ ...form, entreprise_id: entDetail?.id }) });
      if (r.ok) {
        const d = await r.json();
        if (form.id) setBenef(prev => prev.map(b => b.id === form.id ? { ...b, ...d.beneficiaire } : b));
        else         setBenef(prev => [d.beneficiaire, ...prev]);
      }
    } catch (err) { console.error(err); }
  }

  async function ajouterPaiement(paie) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/${paie.entreprise_id}/paiements`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          montant:     paie.montant,
          date:        paie.date,
          mode:        paie.mode,
          reference:   paie.reference,
          note:        paie.note,
          echeance_id: paie.echeance_id || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de l\'enregistrement du versement'); return; }
      setPaiements(prev => [d.paiement, ...prev]);
      toast.success('Versement enregistré ✓');
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }

  async function modifierPaiement(paieId, paie) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/${paie.entreprise_id}/paiements/${paieId}`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({
          montant:   paie.montant,
          date:      paie.date,
          mode:      paie.mode,
          reference: paie.reference,
          note:      paie.note,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la correction du versement'); return; }
      setPaiements(prev => prev.map(p => p.id === paieId ? d.paiement : p));
      toast.success('Versement corrigé ✓');
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }

  async function supprimerPaiement(p) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/${p.entreprise_id}/paiements/${p.id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la suppression du versement'); return; }
      setPaiements(prev => prev.filter(x => x.id !== p.id));
      toast.success('Versement supprimé ✓');
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }

  async function renouvelerContrat(entrepriseId, form) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/${entrepriseId}/renouveler-contrat`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors du renouvellement du contrat'); return false; }
      setEntreprises(prev => prev.map(e => e.id === entrepriseId ? d.entreprise : e));
      setContrats(prev => [d.contrat, ...prev.map(c => c.entreprise_id === entrepriseId ? { ...c, statut: 'expire' } : c)]);
      toast.success('Contrat renouvelé ✓');
      return true;
    } catch (err) {
      toast.error('Erreur réseau');
      return false;
    }
  }

  async function changerStatutContrat(contratId, statut) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/contrat/${contratId}/statut`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ statut }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors du changement de statut'); return; }
      setContrats(prev => prev.map(c => {
        if (c.id === contratId) return d.contrat;
        if (statut === 'actif' && c.entreprise_id === d.contrat.entreprise_id && c.id !== contratId) return { ...c, statut: 'expire' };
        return c;
      }));
      toast.success('Statut du contrat mis à jour ✓');
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }

  async function proposerRenouvellement(entrepriseId, form) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/${entrepriseId}/proposer-renouvellement`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la proposition de renouvellement'); return false; }
      setContrats(prev => [d.contrat, ...prev]);
      toast.success('Renouvellement proposé - en attente de validation par l\'admin BET ✓');
      return true;
    } catch (err) {
      toast.error('Erreur réseau');
      return false;
    }
  }

  async function validerRenouvellement(contratId) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/contrat/${contratId}/valider-renouvellement`, {
        method: 'PATCH', headers: authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la validation du renouvellement'); return; }
      setEntreprises(prev => prev.map(e => e.id === d.entreprise.id ? d.entreprise : e));
      setContrats(prev => prev.map(c => {
        if (c.id === d.contrat.id) return d.contrat;
        if (c.entreprise_id === d.contrat.entreprise_id && c.id !== d.contrat.id && c.statut === 'actif') return { ...c, statut: 'expire' };
        return c;
      }));
      toast.success('Renouvellement validé ✓');
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }

  async function soumettreInscription(form) {
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/soumettre-parcours`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { await alerte(d.error || 'Erreur lors de la soumission', { titre: 'Soumission du dossier', danger: true }); return; }
      setEntreprises(prev => [d.entreprise, ...prev]);
      setModalParcours(false);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function validerInscription(entrepriseId, rhForm) {
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/${entrepriseId}/valider`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify(rhForm),
      });
      const d = await r.json();
      if (!r.ok) { await alerte(d.error || 'Erreur lors de la validation', { titre: 'Validation de l\'inscription', danger: true }); return; }
      setEntreprises(prev => prev.map(e => e.id === entrepriseId ? d.entreprise : e));
      setModalValider(false); setParcoursEdite(null);
      charger();
      if (d.compteRH) {
        setCredData({ ...d.compteRH, nomEntreprise: d.entreprise.nom });
      }
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function refuserInscription(entrepriseId, motif) {
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/${entrepriseId}/refuser`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ motif }),
      });
      if (r.ok) {
        const d = await r.json();
        setEntreprises(prev => prev.map(e => e.id === entrepriseId ? d.entreprise : e));
      }
    } catch (err) { console.error(err); }
  }

  // ── Agrégats ────────────────────────────────────────────────────
  const caTotal    = contrats.filter(c => c.statut === 'actif').reduce((s, c) => s + (c.montant_ht || 0), 0);
  const nbActives  = entreprises.filter(e => e.statut === 'actif').length;
  const nbBenefAct = beneficiairesTous.filter(b => b.statut === 'actif').length;
  const expBientot = entreprises.filter(e => {
    if (!e.date_fin_contrat) return false;
    return (new Date(e.date_fin_contrat) - new Date()) / (1000*60*60*24) <= 30;
  }).length;

  const entFiltrees = entreprises
    .filter(e => filtreEnt === 'tous' || e.statut === filtreEnt)
    .filter(e => rechEnt === '' || `${e.nom} ${e.secteur} ${e.ville}`.toLowerCase().includes(rechEnt.toLowerCase()));

  const entPage = entFiltrees.slice((pageEnt - 1) * PAR_PAGE, pageEnt * PAR_PAGE);

  async function sauvegarderEnt(form) {
    setSaving(true);
    try {
      if (entEdite) {
        const r = await fetch(`${API_URL}/api/entreprise/admin/${entEdite.id}`, {
          method: 'PATCH', headers: authHeaders(), body: JSON.stringify(form),
        });
        if (r.ok) {
          const d = await r.json();
          setEntreprises(prev => prev.map(e => e.id === entEdite.id ? d.entreprise : e));
          setEntDetail(prev => prev && prev.id === entEdite.id ? { ...prev, ...d.entreprise } : prev);
          // Le contrat (table séparée, lue par les onglets Contrat/Paiements) a pu être
          // synchronisé côté serveur (nouveau montant/quota) - sans ce rafraîchissement,
          // ces onglets restaient figés sur l'ancien montant tant que la page n'était pas
          // rechargée entièrement, même si comptes_entreprises était déjà à jour.
          fetch(`${API_URL}/api/entreprise/admin/contrats`, { headers: authHeaders() })
            .then(r2 => r2.ok ? r2.json() : null)
            .then(d2 => { if (d2) setContrats(d2.contrats || []); })
            .catch(() => {});
        }
        setModalEnt(false); setEntEdite(null);
      } else {
        const r = await fetch(`${API_URL}/api/entreprise/admin/creer`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
        });
        const d = await r.json();
        if (!r.ok) { await alerte(d.error || "Erreur lors de la création", { titre: 'Création de l\'entreprise', danger: true }); return; }
        setEntreprises(prev => [d.entreprise, ...prev]);
        setModalEnt(false); setEntEdite(null);
        charger(); // rafraîchit les contrats après création
        if (d.compteRH) {
          setCredData({ ...d.compteRH, nomEntreprise: d.entreprise.nom });
          setEntDetail({ ...d.entreprise, _ouvrirSurAcces: true });
        }
      }
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  const stats = [
    { label: 'Entreprises actives', valeur: nbActives,                 couleur: couleurTheme },
    { label: 'Bénéficiaires actifs',valeur: nbBenefAct,               couleur: COULEURS.succes },
    { label: 'CA contrats actifs',  valeur: `${(caTotal/1000000).toFixed(1)}M FCFA`, couleur: '#FBBF24' },
    { label: 'Contrats à renouveler',valeur: expBientot,              couleur: expBientot > 0 ? '#F87171' : COULEURS.blanc },
  ];

  const parcoursEnAttente = entreprises.filter(e => e.statut === 'en_attente');

  const ONGLETS = [
    { id: 'overview',     lib: "Vue d'ensemble",  icone: '📊' },
    { id: 'entreprises',  lib: 'Entreprises',      icone: '🏢', badge: entreprises.filter(e => e.statut !== 'en_attente').length },
    { id: 'contrats',     lib: 'Contrats',         icone: '📄', badge: contrats.length },
    { id: 'parcours',     lib: 'Entreprise Parcours', icone: '📋', badge: parcoursEnAttente.length || null, alerte: parcoursEnAttente.length > 0 },
  ];

  const S = {
    page:        { padding: 32, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
    pageTitre:   { fontSize: 22, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 },
    pageSousTitre: { fontSize: 13, color: COULEURS.gris400 },
    btnRow:      { display: 'flex', gap: 12 },
    btnSec:      { padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'flex', alignItems: 'center', gap: 6 },
    btnPrim:     { padding: '9px 20px', borderRadius: 8, border: 'none', background: couleurTheme, color: COULEURS.blanc, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'flex', alignItems: 'center', gap: 6 },
    sousOnglets: { display: 'flex', gap: 4, marginBottom: 28, borderBottom: `2px solid ${COULEURS.gris200}` },
    tabSous: (a) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: a ? `2px solid ${couleurTheme}` : '2px solid transparent', color: a ? couleurTheme : COULEURS.gris600, fontWeight: a ? 700 : 500, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: -2, transition: 'all 0.15s' }),
    tabBadge: (a) => ({ background: a ? couleurTheme : COULEURS.gris200, color: a ? COULEURS.blanc : COULEURS.gris600, borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }),
    // KPI
    grilleKpi: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 },
    carteKpi: (alerte) => ({ background: alerte ? '#FFF5F5' : COULEURS.blanc, borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${alerte ? '#FECACA' : COULEURS.gris200}` }),
    kpiIcn:  { fontSize: 22, marginBottom: 8 },
    kpiLbl:  { fontSize: 11, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
    kpiVal:  (c) => ({ fontSize: 26, fontWeight: 800, color: c || COULEURS.navy, lineHeight: 1, marginBottom: 4 }),
    kpiSub:  { fontSize: 11, color: COULEURS.gris400 },
    // Grille cards entreprises overview
    grilleEnt: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, marginBottom: 32 },
    carteEnt:  { background: COULEURS.blanc, borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${COULEURS.gris200}`, cursor: 'pointer' },
    // Tableau
    tableau:       { background: COULEURS.blanc, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${COULEURS.gris200}` },
    barreFiltre:   { padding: '16px 20px', borderBottom: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
    inputRech:     { padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', flex: 1, minWidth: 200 },
    selectFiltre:  { padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.blanc, color: COULEURS.navy },
    tabHead: (cols) => ({ display: 'grid', gridTemplateColumns: cols, padding: '10px 20px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`, fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }),
    tabLigne: (cols) => ({ display: 'grid', gridTemplateColumns: cols, padding: '14px 20px', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 13, alignItems: 'center' }),
    avatarEnt: (couleur) => ({ width: 38, height: 38, borderRadius: 10, background: couleur + '20', border: `1.5px solid ${couleur}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: couleur, flexShrink: 0, overflow: 'hidden' }),
    nomEnt:    { fontWeight: 700, color: COULEURS.navy, fontSize: 13 },
    badge:     (bg, txt) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: bg, color: txt, fontSize: 11, fontWeight: 600 }),
    btnEdit:   { padding: '5px 12px', borderRadius: 6, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 11, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    // Alerte expire
    alerteExpire: { background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#92400E' },
  };

  const COLS_ENT  = '2.5fr 1.5fr 1.5fr 1fr 1fr 1fr 110px';
  const COLS_CONT = '1.2fr 2fr 1fr 1fr 1.2fr 1fr 1fr';

  return (
    <TopNavLayout stats={stats}>
      <div style={S.page}>
        {/* En-tête */}
        <div style={S.pageHeader}>
          <div>
            <div style={S.pageTitre}>Gestion des Entreprises & Bénéficiaires</div>
            <div style={S.pageSousTitre}>Comptes entreprises, employés et contrats de formation BET</div>
          </div>
          <div style={S.btnRow}>
            {lectureSeule && (
              <div style={{ padding:'8px 16px', borderRadius:8, background:'#EFF6FF', border:'1px solid #BFDBFE', color:'#1D4ED8', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                {peutSaisirPaiements ? '👁 Mode consultation - saisie de paiements autorisée' : '🔒 Mode lecture seule'}
              </div>
            )}
            {!lectureSeule && <button style={S.btnPrim} onClick={() => { setEntEdite(null); setModalEnt(true); }}>
              <span>＋</span> Nouvelle entreprise
            </button>}
          </div>
        </div>

        {/* Alerte expire */}
        {expBientot > 0 && (
          <div style={S.alerteExpire}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span><strong>{expBientot} contrat{expBientot > 1 ? 's' : ''}</strong> expire{expBientot > 1 ? 'nt' : ''} dans moins de 30 jours. Pensez à contacter les entreprises concernées pour le renouvellement.</span>
          </div>
        )}

        {/* Sous-onglets */}
        <div style={S.sousOnglets}>
          {ONGLETS.map((o) => (
            <button key={o.id} style={S.tabSous(onglet === o.id)} onClick={() => setOnglet(o.id)}>
              <span>{o.icone}</span><span>{o.lib}</span>
              {o.badge != null && (
                <span style={{
                  ...S.tabBadge(onglet === o.id),
                  ...(o.alerte && onglet !== o.id ? { background: '#EF4444', color: '#fff' } : {}),
                }}>{o.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── VUE D'ENSEMBLE ── */}
        {onglet === 'overview' && (
          <>
            <div style={S.grilleKpi}>
              <div style={S.carteKpi(false)}>
                <div style={S.kpiIcn}>🏢</div>
                <div style={S.kpiLbl}>Entreprises actives</div>
                <div style={S.kpiVal(couleurTheme)}>{nbActives}</div>
                <div style={S.kpiSub}>{entreprises.length} au total</div>
              </div>
              <div style={S.carteKpi(false)}>
                <div style={S.kpiIcn}>👥</div>
                <div style={S.kpiLbl}>Bénéficiaires actifs</div>
                <div style={S.kpiVal(COULEURS.succes)}>{nbBenefAct}</div>
                <div style={S.kpiSub}>{beneficiairesTous.length} inscrits total</div>
              </div>
              <div style={S.carteKpi(false)}>
                <div style={S.kpiIcn}>💰</div>
                <div style={S.kpiLbl}>CA contrats actifs</div>
                <div style={S.kpiVal('#D97706')}>{(caTotal / 1000000).toFixed(1)}M</div>
                <div style={S.kpiSub}>FCFA</div>
              </div>
              <div style={S.carteKpi(expBientot > 0)}>
                <div style={S.kpiIcn}>⏰</div>
                <div style={S.kpiLbl}>Contrats à renouveler</div>
                <div style={S.kpiVal(expBientot > 0 ? '#DC2626' : COULEURS.navy)}>{expBientot}</div>
                <div style={S.kpiSub}>Dans les 30 prochains jours</div>
              </div>
            </div>

            {/* Tableau entreprises */}
            <div style={S.tableau}>
              <div style={S.barreFiltre}>
                <input style={S.inputRech} placeholder="Rechercher une entreprise…" value={rechEnt} onChange={(e) => { setRechEnt(e.target.value); setPageEnt(1); }} />
                <select style={S.selectFiltre} value={filtreEnt} onChange={(e) => { setFiltreEnt(e.target.value); setPageEnt(1); }}>
                  <option value="tous">Tous les statuts</option>
                  <option value="actif">Actif</option>
                  <option value="expire_bientot">Expire bientôt</option>
                  <option value="prospect">Prospect</option>
                  <option value="suspendu">Suspendu</option>
                </select>
              </div>
              <div style={S.tabHead(COLS_ENT)}>
                <span>Entreprise</span><span>Secteur</span><span>Responsable</span>
                <span>Bénéficiaires</span><span>CA contrat</span><span>Statut</span><span>Actions</span>
              </div>
              {entPage.map((e) => {
                const cfg = STATUT_CONFIG[e.statut] || STATUT_CONFIG.actif;
                const nbL = e.nb_licences || 0;
                const nbB = beneficiairesTous.filter(b => b.entreprise_id === e.id).length;
                const pct = nbL > 0 ? Math.round((nbB / nbL) * 100) : 0;
                return (
                  <div key={e.id} style={S.tabLigne(COLS_ENT)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => ouvrirDetail(e)}>
                      <div style={S.avatarEnt(e.couleur)}>
                        {e.logo_url && !e.logo_url.startsWith('blob:')
                          ? <img src={e.logo_url} alt={e.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : e.initiales}
                      </div>
                      <div>
                        <div style={{ ...S.nomEnt, color: couleurTheme, textDecoration: 'underline' }}>{e.nom}</div>
                        <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{e.ville || '-'}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{e.secteur}</span>
                    <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{e.referent_rh_nom || '-'}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: COULEURS.navy, fontSize: 13, marginBottom: 3 }}>
                        {nbB}/{nbL}
                      </div>
                      <div style={{ height: 4, background: COULEURS.gris100, borderRadius: 2, overflow: 'hidden', width: 60 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: e.couleur, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 2 }}>{pct}%</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COULEURS.navy }}>{((e.montant_contrat || 0) / 1000000).toFixed(1)}M FCFA</span>
                    <div>
                      <span style={S.badge(cfg.bg, cfg.txt)}>{cfg.lib}</span>
                      {(e.date_debut_contrat || e.date_fin_contrat) && (
                        <div style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 4, whiteSpace: 'nowrap' }}>
                          {e.date_debut_contrat || '-'} → {e.date_fin_contrat || '-'}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={S.btnEdit} onClick={() => ouvrirDetail(e)}>👁 Détails</button>
                      {!lectureSeule && <button style={S.btnEdit} onClick={(ev) => { ev.stopPropagation(); setEntEdite(e); setModalEnt(true); }}>✏️</button>}
                    </div>
                  </div>
                );
              })}
              {entFiltrees.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: COULEURS.gris400 }}>Aucune entreprise trouvée.</div>
              )}
              <Pagination total={entFiltrees.length} parPage={PAR_PAGE} page={pageEnt} onChange={setPageEnt} />
            </div>
          </>
        )}

        {/* ── ENTREPRISES ── */}
        {onglet === 'entreprises' && (
          <div style={S.tableau}>
            <div style={S.barreFiltre}>
              <input style={S.inputRech} placeholder="Rechercher une entreprise…" value={rechEnt} onChange={(e) => { setRechEnt(e.target.value); setPageEnt(1); }} />
              <select style={S.selectFiltre} value={filtreEnt} onChange={(e) => { setFiltreEnt(e.target.value); setPageEnt(1); }}>
                <option value="tous">Tous les statuts</option>
                <option value="actif">Actif</option>
                <option value="expire_bientot">Expire bientôt</option>
                <option value="prospect">Prospect</option>
                <option value="suspendu">Suspendu</option>
              </select>
            </div>
            <div style={S.tabHead(COLS_ENT)}>
              <span>Entreprise</span><span>Secteur</span><span>Responsable</span>
              <span>Bénéficiaires</span><span>CA contrat</span><span>Statut</span><span>Actions</span>
            </div>
            {entPage.map((e) => {
              const cfg = STATUT_CONFIG[e.statut] || STATUT_CONFIG.actif;
              const nbL = e.nb_licences || 0;
              const nbB = beneficiairesTous.filter(b => b.entreprise_id === e.id).length;
              return (
                <div key={e.id} style={S.tabLigne(COLS_ENT)}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                    onClick={() => ouvrirDetail(e)}
                  >
                    <div style={S.avatarEnt(e.couleur)}>
                      {e.logo_url && !e.logo_url.startsWith('blob:')
                        ? <img src={e.logo_url} alt={e.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : e.initiales}
                    </div>
                    <div>
                      <div style={{ ...S.nomEnt, color: couleurTheme, textDecoration: 'underline' }}>{e.nom}</div>
                      <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{e.ville || '-'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{e.secteur}</span>
                  <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{e.referent_rh_nom || '-'}</span>
                  <span style={{ fontWeight: 700, color: COULEURS.navy }}>{nbB}/{nbL}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COULEURS.navy }}>{((e.montant_contrat || 0) / 1000000).toFixed(1)}M FCFA</span>
                  <div>
                    <span style={S.badge(cfg.bg, cfg.txt)}>{cfg.lib}</span>
                    {(e.date_debut_contrat || e.date_fin_contrat) && (
                      <div style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 4, whiteSpace: 'nowrap' }}>
                        {e.date_debut_contrat || '-'} → {e.date_fin_contrat || '-'}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={S.btnEdit} onClick={() => ouvrirDetail(e)}>👁 Détails</button>
                    <button style={S.btnEdit} onClick={(ev) => { ev.stopPropagation(); setEntEdite(e); setModalEnt(true); }}>✏️</button>
                  </div>
                </div>
              );
            })}
            {entFiltrees.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: COULEURS.gris400 }}>Aucune entreprise trouvée.</div>
            )}
            <Pagination total={entFiltrees.length} parPage={PAR_PAGE} page={pageEnt} onChange={setPageEnt} />
          </div>
        )}

        {/* ── CONTRATS ── */}
        {onglet === 'contrats' && (
          <div style={S.tableau}>
            <div style={S.barreFiltre}>
              <span style={{ fontSize: 14, fontWeight: 600, color: COULEURS.navy }}>
                {contrats.length} contrat{contrats.length > 1 ? 's' : ''} enregistré{contrats.length > 1 ? 's' : ''}
              </span>
            </div>
            <div style={S.tabHead(COLS_CONT)}>
              <span>Référence</span><span>Entreprise</span><span>Package</span>
              <span>Bénéf.</span><span>Montant</span><span>Fin contrat</span><span>Statut</span>
            </div>
            {contrats.map((c) => {
              const ent = entreprises.find(e => e.id === c.entreprise_id);
              const cfg = STATUT_CONFIG[c.statut] || STATUT_CONFIG.actif;
              const jours = joursRestants(c.date_fin);
              const pkg = lirePackages().find(p => p.libelle === c.package);
              return (
                <div key={c.id} style={{ ...S.tabLigne(COLS_CONT), cursor: 'pointer' }} onClick={() => setContratDetail(c)}>
                  <div>
                    <div style={{ fontWeight: 700, color: COULEURS.navy, fontSize: 12 }}>REF-{(c.id || '').split('-')[0]?.toUpperCase()}</div>
                    <div style={{ fontSize: 10, color: COULEURS.gris400 }}>Créé le {c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ent && <div style={{ ...S.avatarEnt(ent.couleur), width: 24, height: 24, fontSize: 9, borderRadius: 6 }}>{ent.initiales}</div>}
                    <span style={{ fontSize: 12, fontWeight: 600, color: COULEURS.navy }}>{ent?.nom || c.entreprise_id}</span>
                  </div>
                  <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: (pkg?.couleur || couleurTheme) + '20', color: pkg?.couleur || couleurTheme, fontSize: 11, fontWeight: 700 }}>
                    {c.package}
                  </span>
                  <span style={{ fontWeight: 700, color: COULEURS.navy }}>{c.nb_licences || 0}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: COULEURS.navy, fontSize: 13 }}>{((c.montant_ht || 0) / 1000000).toFixed(1)}M FCFA</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: COULEURS.navy }}>{c.date_fin}</div>
                    <div style={{ fontSize: 10, color: jours < 60 ? '#DC2626' : COULEURS.gris400 }}>
                      {jours > 0 ? `J-${jours}` : 'Expiré'}
                    </div>
                  </div>
                  <span style={S.badge(cfg.bg, cfg.txt)}>{cfg.lib}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ENTREPRISE PARCOURS ── */}
        {onglet === 'parcours' && (
          <div>
            {/* En-tête */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 }}>
                  Inscriptions entreprise en attente de validation
                </div>
                <div style={{ fontSize: 12, color: COULEURS.gris400 }}>
                  Les inscriptions soumises par les assistantes e-learning et corporate sont listées ici pour validation.
                </div>
              </div>
            </div>

            {parcoursEnAttente.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 24px', color: COULEURS.gris400, background: COULEURS.blanc, borderRadius: 14, border: `2px dashed ${COULEURS.gris200}` }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Aucune inscription en attente</div>
                <div style={{ fontSize: 13 }}>Les inscriptions soumises par les assistantes apparaîtront ici pour validation admin.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {parcoursEnAttente.map(e => {
                  const dateCreation = e.created_at ? new Date(e.created_at).toLocaleDateString('fr-FR') : '-';
                  const pkg = lirePackages().find(p => p.id === e.package_elearning);
                  return (
                    <div key={e.id} style={{ background: COULEURS.blanc, borderRadius: 14, border: `1px solid ${COULEURS.gris200}`, borderLeft: `4px solid #F59E0B`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      {/* Header card */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${COULEURS.gris100}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: (e.couleur || '#F59E0B') + '20', border: `1.5px solid ${e.couleur || '#F59E0B'}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: e.couleur || '#F59E0B', flexShrink: 0 }}>
                            {e.initiales}
                          </div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: COULEURS.navy }}>{e.nom}</div>
                            <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 2 }}>
                              {e.secteur || '-'} · {e.ville || '-'} · Soumis le {dateCreation}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ padding: '4px 12px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700 }}>
                            ⏳ En attente
                          </span>
                          <button
                            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: COULEURS.succes, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                            onClick={() => { setParcoursEdite(e); setModalValider(true); }}
                          >
                            ✓ Valider
                          </button>
                          <button
                            style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid #FCA5A5`, background: '#FFF5F5', color: '#991B1B', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                            onClick={async () => {
                              if (await confirm(`Refuser l'inscription de ${e.nom} ?`, { titre: 'Refuser l\'inscription' })) {
                                refuserInscription(e.id, '');
                              }
                            }}
                          >
                            ✕ Refuser
                          </button>
                        </div>
                      </div>
                      {/* Détails */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 0 }}>
                        {[
                          { lbl: 'RCCM',              val: e.rccm || '-' },
                          { lbl: 'Responsable RH',   val: e.referent_rh_nom || '-' },
                          { lbl: 'Email RH',          val: e.referent_rh_email || '-' },
                          { lbl: 'Téléphone',         val: e.referent_rh_telephone || '-' },
                          { lbl: 'Package',            val: e.package_elearning === 'personnalise' ? `${e.libelle_personnalise || 'Personnalisé'} (sur-mesure)` : (pkg?.libelle || e.package_elearning || '-') },
                          { lbl: 'Bénéficiaires',     val: `${e.nb_licences || 0} places` },
                          { lbl: 'Montant contrat',   val: e.montant_contrat > 0 ? `${(e.montant_contrat / 1000000).toFixed(2)}M FCFA` : '-' },
                          { lbl: 'Début contrat',     val: e.date_debut_contrat || '-' },
                          { lbl: 'Fin contrat',       val: e.date_fin_contrat || '-' },
                          { lbl: 'Sessions',          val: (e.types_sessions || []).join(' + ') || '-' },
                          { lbl: 'Option replay',     val: e.option_replay ? '✓ Oui' : '✗ Non' },
                        ].map(({ lbl, val }) => (
                          <div key={lbl} style={{ padding: '12px 20px', borderRight: `1px solid ${COULEURS.gris100}`, borderTop: `1px solid ${COULEURS.gris100}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{lbl}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: COULEURS.navy }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {e.fichier_preuve_url && (
                        <div style={{ padding: '10px 20px', borderTop: `1px solid ${COULEURS.gris100}` }}>
                          <a href={e.fichier_preuve_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: couleurTheme, textDecoration: 'underline' }}>
                            📎 Voir la preuve jointe (contrat / bon de commande)
                          </a>
                        </div>
                      )}
                      {e.notes && (
                        <div style={{ padding: '10px 20px', background: '#FFFBEB', borderTop: `1px solid ${COULEURS.gris100}`, fontSize: 12, color: '#78350F' }}>
                          📝 {e.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modale soumission inscription parcours */}
      {modalParcours && (
        <ModalSoumissionParcours
          onFermer={() => setModalParcours(false)}
          onSauvegarder={soumettreInscription}
        />
      )}

      {/* Modale validation parcours - même formulaire complet que la création d'entreprise,
          préréempli, pour permettre à l'admin de corriger n'importe quel champ avant validation */}
      {modalValider && parcoursEdite && (
        <ModalEntreprise
          entreprise={parcoursEdite}
          modeValidation
          onFermer={() => { setModalValider(false); setParcoursEdite(null); }}
          onSauvegarder={(form) => validerInscription(parcoursEdite.id, form)}
        />
      )}

      {/* Modale détail entreprise */}
      {entDetail && (
        <ModalDetailEntreprise
          entreprise={entDetail}
          contrats={contrats}
          beneficiaires={beneficiaires}
          paiements={paiements}
          echeanciers={[]}
          onFermer={fermerDetail}
          onEditer={ouvrirEditionDepuisDetail}
          onAjouterPaiement={ajouterPaiement}
          onModifierPaiement={modifierPaiement}
          onSupprimerPaiement={supprimerPaiement}
          peutModifierPaiements={peutModifierPaiements}
          peutSupprimerPaiements={peutSupprimerPaiements}
          onRenouvelerContrat={renouvelerContrat}
          onChangerStatutContrat={changerStatutContrat}
          onProposerRenouvellement={proposerRenouvellement}
          onValiderRenouvellement={validerRenouvellement}
          peutGererContrat={peutGererContratModule}
          peutProposerRenouvellement={peutProposerRenouvellement}
          onSauvegarderBeneficiaire={sauvegarderBeneficiaireDepuisDetail}
          onPreuveSupprimee={() => {
            const patch = { fichier_preuve_url: null, fichier_preuve_nom: null };
            setEntDetail(prev => prev ? { ...prev, ...patch } : prev);
            setEntreprises(prev => prev.map(e => e.id === entDetail?.id ? { ...e, ...patch } : e));
          }}
          ongletInitial={entDetail._ouvrirSurAcces ? 'acces' : 'infos'}
          lectureSeule={lectureSeule}
          peutSaisirPaiements={peutSaisirPaiements}
        />
      )}

      {/* Modale création/édition entreprise */}
      {modalEnt && (
        <ModalEntreprise entreprise={entEdite} onFermer={() => { setModalEnt(false); setEntEdite(null); }} onSauvegarder={sauvegarderEnt} />
      )}

      {/* Modale détail contrat */}
      {contratDetail && (
        <ModalDetailContrat
          contrat={contratDetail}
          entreprise={entreprises.find(e => e.id === contratDetail.entreprise_id)}
          onFermer={() => setContratDetail(null)}
          onVoirEntreprise={(ent) => { setContratDetail(null); setEntDetail(ent); }}
        />
      )}

    </TopNavLayout>
  );
}

// ─── Modale détail contrat ────────────────────────────────────────────────
function ModalDetailContrat({ contrat: c, entreprise: ent, onFermer, onVoirEntreprise }) {
  const { couleurTheme } = useTheme();
  const cfg   = STATUT_CONFIG[c.statut] || STATUT_CONFIG.actif;
  const jours = c.date_fin ? joursRestants(c.date_fin) : null;
  const pkg   = lirePackages().find(p => p.libelle === c.package);
  const coul  = ent?.couleur || pkg?.couleur || couleurTheme;

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' },
    modal:   { background: COULEURS.gris50, borderRadius: 20, width: '70vw', maxWidth: '70vw', height: '70vh', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.35)', overflow: 'hidden' },
    header:  { background: `linear-gradient(135deg, ${coul}CC 0%, ${coul} 100%)`, padding: '22px 26px', flexShrink: 0 },
    btnX:    { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#fff', flexShrink: 0 },
    corps:   { flex: 1, overflowY: 'auto', padding: 22 },
    grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
    carte:   { background: COULEURS.blanc, borderRadius: 10, padding: '12px 16px', border: `1px solid ${COULEURS.gris200}` },
    lbl:     { fontSize: 10, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
    val:     { fontSize: 14, fontWeight: 700, color: COULEURS.navy },
    badge:   (bg, txt) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: bg, color: txt, fontSize: 11, fontWeight: 600 }),
    footer:  { padding: '14px 22px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 10, justifyContent: 'flex-end', background: COULEURS.blanc, flexShrink: 0 },
    btnSec:  { padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnPrim: { padding: '8px 18px', borderRadius: 8, border: 'none', background: coul, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>REF-{(c.id || '').split('-')[0]?.toUpperCase()}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{ent?.nom || c.entreprise_id}</div>
              <div style={{ marginTop: 8 }}><span style={S.badge(cfg.bg, cfg.txt)}>{cfg.lib}</span></div>
            </div>
            <button style={S.btnX} onClick={onFermer}>×</button>
          </div>
        </div>

        <div style={S.corps}>
          <div style={S.grille2}>
            <div style={S.carte}>
              <div style={S.lbl}>Référence</div>
              <div style={S.val}>REF-{(c.id || '').split('-')[0]?.toUpperCase()}</div>
            </div>
            <div style={S.carte}>
              <div style={S.lbl}>Entreprise</div>
              <div style={S.val}>{ent?.nom || c.entreprise_id}</div>
            </div>
            <div style={S.carte}>
              <div style={S.lbl}>Package</div>
              <div style={S.val}>{c.package || '-'}</div>
            </div>
            <div style={S.carte}>
              <div style={S.lbl}>Licences</div>
              <div style={S.val}>{c.nb_licences || 0}</div>
            </div>
            <div style={S.carte}>
              <div style={S.lbl}>Montant</div>
              <div style={S.val}>{((c.montant_ht || 0) / 1000000).toFixed(1)}M {c.devise || 'FCFA'}</div>
            </div>
            <div style={S.carte}>
              <div style={S.lbl}>Devise</div>
              <div style={S.val}>{c.devise || 'FCFA'}</div>
            </div>
            <div style={S.carte}>
              <div style={S.lbl}>Date de début</div>
              <div style={S.val}>{c.date_debut || '-'}</div>
            </div>
            <div style={S.carte}>
              <div style={S.lbl}>Date de fin</div>
              <div style={S.val}>{c.date_fin || '-'}</div>
              {jours !== null && (
                <div style={{ fontSize: 11, color: jours < 60 ? '#DC2626' : COULEURS.gris400, marginTop: 2 }}>
                  {jours > 0 ? `J-${jours}` : 'Expiré'}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...S.carte, marginBottom: 12 }}>
            <div style={S.lbl}>Modalités de sessions</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {(c.types_sessions || []).length === 0 ? (
                <span style={S.val}>-</span>
              ) : c.types_sessions.map(t => (
                <span key={t} style={S.badge(couleurTheme + '15', couleurTheme)}>{t === 'presentiel' ? '🏢 Présentiel' : '📹 En ligne'}</span>
              ))}
              {c.option_replay && <span style={S.badge('#EDE9FE', '#5B21B6')}>🎬 Replay inclus</span>}
            </div>
          </div>

          <div style={S.carte}>
            <div style={S.lbl}>Créé le</div>
            <div style={S.val}>{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-'}</div>
          </div>
        </div>

        <div style={S.footer}>
          <button style={S.btnSec} onClick={onFermer}>Fermer</button>
          {ent && (
            <button style={S.btnPrim} onClick={() => onVoirEntreprise(ent)}>🏢 Voir l'entreprise</button>
          )}
        </div>
      </div>
    </div>
  );
}
