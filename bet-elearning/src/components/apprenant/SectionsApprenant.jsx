import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { COULEURS } from '../../constants/couleurs';
import { accesSalle, MINUTES_OUVERTURE_SALLE } from '../../utils/ouvertureSalle';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const jeton = () => localStorage.getItem('bet_access_token') || localStorage.getItem('admin_token') || '';
const hdr = () => ({ Authorization: `Bearer ${jeton()}`, 'Content-Type': 'application/json', 'X-Plateforme': 'bet-elearning' });

/**
 * Les sept écrans qui manquaient à l'espace apprenant de bet-elearning face à celui de dash :
 * Mon profil, Planning, Objectifs, Paiement, Boutique, Mon témoignage, Contacts & Support.
 *
 * Ils vivent ICI et non dans `DashboardApprenant.jsx`, qui dépasse déjà 5 000 lignes : y
 * ajouter six cents lignes de plus aurait rendu le fichier impossible à relire.
 *
 * TOUTES LES DONNÉES VIENNENT DE ROUTES DÉJÀ EXISTANTES, sauf deux ajoutées pour l'occasion
 * (`/api/mon-espace/mon-parcours` et `/api/mon-espace/support`) : l'apprenant n'avait aucun
 * moyen de lire son dossier ni de demander de l'aide - la route des plaintes exige des
 * droits d'administration qu'il n'a pas.
 */

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '-');
const fmtMontant = (n) => (Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('fr-FR')} F` : '-');

function Entete({ icone, titre, soustitre }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 }}>{icone} {titre}</div>
      {soustitre && <div style={{ fontSize: 13, color: COULEURS.gris400, lineHeight: 1.6 }}>{soustitre}</div>}
    </div>
  );
}

function Vide({ icone, titre, detail }) {
  return (
    <div style={{ textAlign: 'center', padding: '46px 20px', background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icone}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>{titre}</div>
      {detail && <div style={{ fontSize: 12.5, color: COULEURS.gris400, marginTop: 6, maxWidth: 460, margin: '6px auto 0', lineHeight: 1.6 }}>{detail}</div>}
    </div>
  );
}

const champ = {
  width: '100%', padding: '10px 13px', borderRadius: 9, border: `1.5px solid ${COULEURS.gris200}`,
  fontSize: 13.5, fontFamily: 'inherit', color: COULEURS.navy, boxSizing: 'border-box', outline: 'none',
};
const label = { display: 'block', fontSize: 11.5, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 };

/* ══════════════════════════════════════════════════════════════
   1. MON PROFIL
   ══════════════════════════════════════════════════════════════
   Seul le SURNOM est modifiable, et c'est voulu : le nom, l'e-mail et le rôle viennent du
   dossier d'inscription. Les laisser éditer ici désynchroniserait le compte de son dossier
   commercial, qui sert de référence à la facturation et aux attestations. */
export function SectionMonProfil({ couleur }) {
  const [profil, setProfil] = useState(null);
  const [surnom, setSurnom] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/mon-espace/profil`, { headers: hdr() });
        const d = r.ok ? await r.json() : {};
        if (vivant && d.profil) { setProfil(d.profil); setSurnom(d.profil.surnom || ''); }
      } catch { /* l'écran affichera son état vide */ }
    })();
    return () => { vivant = false; };
  }, []);

  async function enregistrer() {
    setEnvoi(true);
    try {
      const r = await fetch(`${API}/api/mon-espace/profil`, {
        method: 'PATCH', headers: hdr(), body: JSON.stringify({ surnom: surnom.trim() || null }),
      });
      if (!r.ok) throw new Error('Enregistrement impossible');
      setProfil(p => ({ ...p, surnom: surnom.trim() || null }));
      toast.success('Profil mis à jour ✓');
    } catch (e) { toast.error(e.message); }
    finally { setEnvoi(false); }
  }

  if (!profil) return <Vide icone="👤" titre="Profil indisponible" detail="Impossible de charger votre fiche pour le moment." />;

  const lignes = [
    ['Prénom', profil.prenom || '-'],
    ['Nom', profil.nom || '-'],
    ['Adresse e-mail', profil.email || '-'],
  ];

  return (
    <div>
      <Entete icone="👤" titre="Mon profil"
        soustitre="Votre identité telle qu'elle figure sur votre dossier d'inscription." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14, marginBottom: 22 }}>
        {lignes.map(([l, v]) => (
          <div key={l} style={{ background: COULEURS.gris50, borderRadius: 10, padding: '12px 15px' }}>
            <div style={label}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '20px 22px', maxWidth: 520 }}>
        <label style={label} htmlFor="surnom-apprenant">Comment souhaitez-vous qu'on vous appelle ?</label>
        <input id="surnom-apprenant" value={surnom} onChange={e => setSurnom(e.target.value)} maxLength={40}
          placeholder={profil.prenom || 'Votre surnom'} style={champ} />
        <div style={{ fontSize: 11.5, color: COULEURS.gris400, marginTop: 7, lineHeight: 1.6 }}>
          Ce surnom remplace votre prénom dans l'application. Votre nom officiel reste celui de
          votre dossier — il sert aux attestations et aux bulletins, et ne se change que par
          votre conseiller.
        </div>
        <button onClick={enregistrer} disabled={envoi}
          style={{ marginTop: 14, padding: '10px 20px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
            background: envoi ? COULEURS.gris200 : couleur, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: envoi ? 'default' : 'pointer' }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   2. PLANNING
   ══════════════════════════════════════════════════════════════
   `GET /api/mon-espace/seances` est LA route de planning de l'apprenant - la même que
   l'espace web de dash. Une seconde route rendant la même donnée est la panne récurrente de
   ce projet : les deux divergent et personne ne sait laquelle fait foi.

   C'est l'en-tête `X-Plateforme` (posé par `hdr()`) qui lui dit OÙ lire : les séances d'un
   apprenant e-learning vivent dans `seances_elearning`, rattachées à sa classe, et non dans
   les tables de dash où il n'a aucune ligne. Sans cet aiguillage la route répondait
   correctement - une liste vide - et cet onglet restait désespérément vide. */
export function SectionPlanning({ couleur }) {
  const [seances, setSeances] = useState(null);
  const [filtre, setFiltre] = useState('a_venir');

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/mon-espace/seances`, { headers: hdr() });
        const d = r.ok ? await r.json() : {};
        if (vivant) setSeances(Array.isArray(d.seances) ? d.seances : []);
      } catch { if (vivant) setSeances([]); }
    })();
    return () => { vivant = false; };
  }, []);

  if (seances === null) return <div style={{ textAlign: 'center', padding: 60, color: COULEURS.gris400 }}>Chargement…</div>;

  const maintenant = new Date();
  const dateDe = (s) => new Date(`${s.date_seance || s.date}T${(s.heure_debut || '00:00').slice(0, 5)}:00`);
  const aVenir = seances.filter(s => dateDe(s) >= maintenant).sort((a, b) => dateDe(a) - dateDe(b));
  const passees = seances.filter(s => dateDe(s) < maintenant).sort((a, b) => dateDe(b) - dateDe(a));
  const liste = filtre === 'a_venir' ? aVenir : passees;

  const puce = (actif) => ({
    padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${actif ? couleur : COULEURS.gris200}`,
    background: actif ? `${couleur}15` : COULEURS.blanc, color: actif ? couleur : COULEURS.gris600,
  });

  return (
    <div>
      <Entete icone="📅" titre="Mon planning"
        soustitre="Toutes vos séances, y compris celles de vos classes précédentes." />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setFiltre('a_venir')} style={puce(filtre === 'a_venir')}>À venir ({aVenir.length})</button>
        <button onClick={() => setFiltre('passees')} style={puce(filtre === 'passees')}>Passées ({passees.length})</button>
      </div>

      {liste.length === 0 ? (
        <Vide icone="📅" titre={filtre === 'a_venir' ? 'Aucune séance à venir' : 'Aucune séance passée'}
          detail="Votre planning se remplira dès que des séances seront programmées pour votre classe." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {liste.map((s, i) => {
            const d = dateDe(s);
            return (
              <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: COULEURS.blanc,
                border: `1px solid ${COULEURS.gris200}`, borderLeft: `4px solid ${couleur}`, borderRadius: 12, padding: '14px 17px' }}>
                <div style={{ textAlign: 'center', minWidth: 54, flexShrink: 0 }}>
                  <div style={{ fontSize: 19, fontWeight: 900, color: couleur, lineHeight: 1 }}>{String(d.getDate()).padStart(2, '0')}</div>
                  <div style={{ fontSize: 10.5, color: COULEURS.gris400, textTransform: 'uppercase', marginTop: 3 }}>
                    {d.toLocaleDateString('fr-FR', { month: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.navy }}>{s.titre || s.classe_nom || 'Séance'}</div>
                  <div style={{ fontSize: 11.5, color: COULEURS.gris400, marginTop: 3 }}>
                    {s.heure_debut ? `${String(s.heure_debut).slice(0, 5)}${s.heure_fin ? ` – ${String(s.heure_fin).slice(0, 5)}` : ''}` : 'Horaire à confirmer'}
                    {s.classe_nom && s.titre ? ` · ${s.classe_nom}` : ''}
                    {/* Une classe terminée est signalée : sans cela, une séance ancienne
                        donnerait l'impression d'un cours encore en cours. */}
                    {s.classe_passee ? ' · classe terminée' : ''}
                  </div>
                </div>
                {/* LE LIEN DE LA SALLE, SOUS LA MÊME RÈGLE QUE PARTOUT AILLEURS (H-10).
                    Le planning le montrait seulement comme une date : l'apprenant devait
                    repasser par « Mon Live » pour rejoindre. Le présentiel, lui, n'a pas de
                    salle à ouvrir — on n'affiche donc pas de bouton verrouillé qui ne
                    s'ouvrira jamais. */}
                {(() => {
                  const acces = accesSalle(s, maintenant);
                  /* UNE SÉANCE CLÔTURÉE N'A PLUS DE SALLE. Sans ce cas, le planning
                     affichait « 🔒 Pas encore » sur un cours déjà passé — on y lisait une
                     attente là où il n'y a plus rien à attendre. */
                  if (acces.close) {
                    return <span title={acces.raison} style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 99, padding: '4px 11px',
                      background: COULEURS.gris100, color: COULEURS.gris600, whiteSpace: 'nowrap' }}>
                      {s.statut === 'annulee' ? '🚫 Annulée' : '✅ Terminée'}
                    </span>;
                  }
                  if (acces.presentiel) {
                    return <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 99, padding: '4px 11px',
                      background: '#D1FAE5', color: '#065F46', whiteSpace: 'nowrap' }}>🏢 Présentiel</span>;
                  }
                  if (!s.lien_visio) {
                    return <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 99, padding: '4px 11px',
                      background: '#FEF3C7', color: '#92400E', whiteSpace: 'nowrap' }}>⚠️ Lien à venir</span>;
                  }
                  return acces.joignable ? (
                    <a href={s.lien_visio} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 9, padding: '8px 15px',
                        background: COULEURS.succes, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      🎥 Rejoindre
                    </a>
                  ) : (
                    <span title={`La salle s'ouvre ${MINUTES_OUVERTURE_SALLE} min avant le début`}
                      style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 9, padding: '8px 15px',
                        background: COULEURS.gris100, color: COULEURS.gris400, whiteSpace: 'nowrap', cursor: 'not-allowed' }}>
                      🔒 {acces.libelleAttente || 'Pas encore'}
                    </span>
                  );
                })()}
                {s.statut && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 99, padding: '3px 10px',
                    background: COULEURS.gris100, color: COULEURS.gris600 }}>{s.statut}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   3. OBJECTIFS   ·   4. PAIEMENT
   ══════════════════════════════════════════════════════════════
   Les deux lisent LA MÊME ligne de `assignations_parcours` - un seul appel, donc, exposé
   par `/api/mon-espace/mon-parcours`. */
function useMonParcours() {
  const [parcours, setParcours] = useState(undefined);   // undefined = en cours, null = aucun
  const charger = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/mon-espace/mon-parcours`, { headers: hdr() });
      const d = r.ok ? await r.json() : {};
      setParcours(d.parcours ?? null);
    } catch { setParcours(null); }
  }, []);
  useEffect(() => { charger(); }, [charger]);
  return parcours;
}

const SANS_DOSSIER = "Aucun dossier d'inscription n'est rattaché à votre adresse e-mail. "
  + "C'est le cas lorsque votre entreprise vous a inscrit directement : votre conseiller "
  + "pédagogique peut vous renseigner.";

export function SectionObjectifs({ couleur }) {
  const p = useMonParcours();
  if (p === undefined) return <div style={{ textAlign: 'center', padding: 60, color: COULEURS.gris400 }}>Chargement…</div>;

  return (
    <div>
      <Entete icone="🎯" titre="Mes objectifs"
        soustitre="Ce que vous visez, et où vous en êtes dans votre parcours." />

      {!p ? (
        <Vide icone="🎯" titre="Aucun objectif enregistré" detail={SANS_DOSSIER} />
      ) : (
        <>
          {p.objectif_client ? (
            <div style={{ padding: '20px 24px', borderRadius: 14, background: `linear-gradient(135deg, ${couleur}, ${couleur}CC)`, color: '#fff', marginBottom: 20 }}>
              <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: '0.06em', marginBottom: 7 }}>OBJECTIF PRINCIPAL</div>
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.5 }}>{p.objectif_client}</div>
            </div>
          ) : (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '13px 16px', marginBottom: 20, fontSize: 12.5, color: '#78350F', lineHeight: 1.6 }}>
              Aucun objectif n'a été noté sur votre dossier. Parlez-en à votre conseiller
              pédagogique : un objectif écrit oriente le choix des contenus et le rythme des séances.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            {[
              ['Niveau à l\'inscription', p.niveau_client || 'Non évalué'],
              ['Formule', p.type_coaching || p.type_cours || '-'],
              ['Début de formation', fmtDate(p.date_debut_formation)],
              ['Statut du dossier', p.statut || '-'],
            ].map(([l, v]) => (
              <div key={l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderTop: `3px solid ${couleur}`, borderRadius: 12, padding: '15px 17px' }}>
                <div style={label}>{l}</div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: COULEURS.navy, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SectionPaiement({ couleur }) {
  const p = useMonParcours();
  if (p === undefined) return <div style={{ textAlign: 'center', padding: 60, color: COULEURS.gris400 }}>Chargement…</div>;

  const plan = p?.plan_paiement || null;
  const mois = Array.isArray(plan?.mois) ? plan.mois : [];
  const aujourdhui = new Date();

  /* UN MOIS NEUTRALISÉ N'EST PAS UN MOIS PAYÉ. Les pauses de formation mettent `montant` à
     zéro en conservant `montant_initial` : le compter comme réglé gonflerait le total versé
     et ferait croire à l'apprenant qu'il a payé ce qu'on a simplement suspendu. */
  const estNeutralise = (m) => !!m.neutralise;
  const totalPaye = mois.filter(m => !estNeutralise(m)).reduce((s, m) => s + Number(m.montant_paye || 0), 0);
  const impayes = mois.filter(m => !estNeutralise(m) && Number(m.montant_paye || 0) < Number(m.montant || 0)
    && m.date_echeance && new Date(m.date_echeance) < aujourdhui);

  return (
    <div>
      <Entete icone="💳" titre="Mon paiement"
        soustitre="L'état de votre échéancier, tel qu'il figure à votre dossier." />

      {!p ? (
        <Vide icone="💳" titre="Aucun échéancier" detail={SANS_DOSSIER} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 22 }}>
            {[
              ['Statut', p.statut_paiement || '-', couleur],
              ['Mode de règlement', p.mode_paiement || '-', couleur],
              ['Total versé', fmtMontant(p.montant_paye ?? totalPaye), '#16A34A'],
              ['Échéances en retard', impayes.length, impayes.length ? '#DC2626' : '#16A34A'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderTop: `3px solid ${c}`, borderRadius: 12, padding: '15px 17px' }}>
                <div style={label}>{l}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: c, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>

          {mois.length === 0 ? (
            <Vide icone="🧾" titre="Aucune échéance détaillée"
              detail="Votre dossier ne porte pas d'échéancier mensuel. Si vous pensez que c'est une erreur, contactez votre conseiller depuis l'onglet Contacts & Support." />
          ) : (
            <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: COULEURS.gris50 }}>
                      {['Mois', 'Échéance', 'Montant dû', 'Versé', 'État'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mois.map((m, i) => {
                      const du = Number(m.montant || 0);
                      const paye = Number(m.montant_paye || 0);
                      const neutre = estNeutralise(m);
                      const enRetard = !neutre && paye < du && m.date_echeance && new Date(m.date_echeance) < aujourdhui;
                      const solde = !neutre && du > 0 && paye >= du;
                      return (
                        <tr key={m.id || i} style={{ borderTop: `1px solid ${COULEURS.gris100}`, opacity: neutre ? 0.65 : 1 }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: COULEURS.navy }}>{m.libelle || m.mois || `Mois ${i + 1}`}</td>
                          <td style={{ padding: '10px 14px' }}>{fmtDate(m.date_echeance)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {neutre ? <span style={{ color: COULEURS.gris400 }}>—</span> : fmtMontant(du)}
                          </td>
                          <td style={{ padding: '10px 14px' }}>{fmtMontant(paye)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {neutre ? (
                              <span title={m.neutralise?.motif || 'Formation suspendue sur cette période'}
                                style={{ background: COULEURS.gris100, color: COULEURS.gris600, borderRadius: 10, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'help' }}>
                                ⏸️ Suspendu
                              </span>
                            ) : enRetard ? (
                              <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 10, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>En retard</span>
                            ) : solde ? (
                              <span style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 10, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>Payé</span>
                            ) : (
                              <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 10, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>À venir</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   5. BOUTIQUE
   ══════════════════════════════════════════════════════════════
   Catalogue en consultation : aucun paiement en ligne n'existe côté apprenant, et simuler
   un panier qui ne mène à rien serait pire que pas de panier du tout. */
export function SectionBoutique({ couleur }) {
  const [produits, setProduits] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/boutique/produits/actifs`);
        const d = r.ok ? await r.json() : [];
        /* Cette route rend un TABLEAU NU, là où le reste de l'API enveloppe ses
           résultats (`{ produits: [...] }`). Vérifié sur le serveur : lire `d.produits`
           seul aurait donné une boutique vide en permanence. */
        if (vivant) setProduits(Array.isArray(d) ? d : (d.produits || []));
      } catch { if (vivant) setProduits([]); }
    })();
    return () => { vivant = false; };
  }, []);

  if (produits === null) return <div style={{ textAlign: 'center', padding: 60, color: COULEURS.gris400 }}>Chargement…</div>;

  return (
    <div>
      <Entete icone="🛒" titre="Boutique"
        soustitre="Manuels, accessoires et supports proposés par BET. Pour commander, adressez-vous à votre conseiller." />

      {produits.length === 0 ? (
        <Vide icone="🛒" titre="Aucun article disponible" detail="Le catalogue est vide pour le moment." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 16 }}>
          {produits.map(p => (
            <div key={p.id} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 140, background: COULEURS.gris50, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {p.image_url
                  ? <img src={p.image_url} alt={p.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 40 }}>📦</span>}
              </div>
              <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: COULEURS.navy }}>{p.nom}</div>
                {p.categorie && <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>{p.categorie}</div>}
                {p.description && (
                  <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 7, lineHeight: 1.55, flex: 1 }}>{p.description}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: couleur }}>{fmtMontant(p.prix)}</span>
                  {/* Le stock est annoncé plutôt que masqué : demander un article épuisé
                      fait perdre du temps à l'apprenant comme au conseiller. */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: Number(p.stock) > 0 ? '#16A34A' : '#DC2626' }}>
                    {Number(p.stock) > 0 ? `En stock (${p.stock})` : 'Épuisé'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   6. MON TÉMOIGNAGE
   ══════════════════════════════════════════════════════════════ */
export function SectionTemoignage({ couleur, profile }) {
  const [texte, setTexte] = useState('');
  const [etoiles, setEtoiles] = useState(5);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [refus, setRefus] = useState(null);

  async function soumettre() {
    if (!texte.trim() || envoi) return;
    setEnvoi(true); setRefus(null);
    try {
      /* `apprenant_id` est EXIGÉ par la route, et c'est lui qui porte les deux contrôles :
         il faut une certification BET valide, et un seul témoignage à la fois. On remonte
         donc le message du serveur tel quel plutôt qu'un « envoi impossible » générique -
         « il vous faut une certification » est une réponse, pas une panne. */
      const r = await fetch(`${API}/api/temoignages/soumettre`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apprenant_id: profile?.id,
          texte: texte.trim(),
          etoiles,
          role: 'Apprenant BET E-Learning',
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setRefus(d.error || 'Envoi impossible pour le moment.'); return; }
      setEnvoye(true);
      toast.success('Merci ! Votre témoignage a été transmis.');
    } catch { setRefus('Envoi impossible pour le moment.'); }
    finally { setEnvoi(false); }
  }

  if (envoye) {
    return (
      <div>
        <Entete icone="⭐" titre="Mon témoignage" />
        <Vide icone="🎉" titre="Merci pour votre témoignage !"
          detail="Il a été transmis à l'équipe BET. Après relecture, il pourra être publié sur le site — votre accord est demandé avant toute publication." />
      </div>
    );
  }

  return (
    <div>
      <Entete icone="⭐" titre="Mon témoignage"
        soustitre="Racontez votre expérience. Rien n'est publié sans relecture ni sans votre accord." />

      {/* LA RÈGLE EST ANNONCÉE AVANT, pas après le clic : buter sur un refus une fois le
          texte écrit est la pire façon de l'apprendre. */}
      <div style={{ background: COULEURS.gris50, border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, padding: '12px 16px', marginBottom: 18, fontSize: 12.5, color: COULEURS.gris600, lineHeight: 1.6, maxWidth: 640 }}>
        Le témoignage est réservé aux apprenants titulaires d'<strong>au moins une certification
        BET validée</strong>, et un seul témoignage peut être en cours à la fois.
      </div>

      {refus && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: '12px 16px', marginBottom: 18, fontSize: 12.5, color: '#991B1B', lineHeight: 1.6, maxWidth: 640 }}>
          {refus}
        </div>
      )}

      <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '22px 24px', maxWidth: 640 }}>
        <div style={label}>Votre note</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setEtoiles(n)} aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 27, padding: 0, lineHeight: 1,
                filter: n <= etoiles ? 'none' : 'grayscale(1) opacity(0.35)' }}>⭐</button>
          ))}
        </div>

        <label style={label} htmlFor="texte-temoignage">Votre témoignage</label>
        <textarea id="texte-temoignage" value={texte} onChange={e => setTexte(e.target.value)} rows={6} maxLength={1200}
          placeholder="Ce que la formation vous a apporté, ce qui vous a marqué…"
          style={{ ...champ, resize: 'vertical', lineHeight: 1.6 }} />
        <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 5 }}>{texte.length}/1200</div>

        <button onClick={soumettre} disabled={!texte.trim() || envoi}
          style={{ marginTop: 16, padding: '11px 22px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
            background: (!texte.trim() || envoi) ? COULEURS.gris200 : couleur,
            color: (!texte.trim() || envoi) ? COULEURS.gris400 : '#fff',
            fontSize: 13.5, fontWeight: 700, cursor: (!texte.trim() || envoi) ? 'default' : 'pointer' }}>
          {envoi ? 'Envoi…' : 'Envoyer mon témoignage'}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   7. CONTACTS & SUPPORT
   ══════════════════════════════════════════════════════════════ */
export function SectionSupport({ couleur }) {
  const [objet, setObjet] = useState('');
  const [description, setDescription] = useState('');
  const [priorite, setPriorite] = useState('normale');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function envoyer() {
    if (!objet.trim() || envoi) return;
    setEnvoi(true);
    try {
      const r = await fetch(`${API}/api/mon-espace/support`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ objet: objet.trim(), description: description.trim(), priorite }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Envoi impossible');
      setEnvoye(true);
      toast.success('Votre demande a été transmise ✓');
    } catch (e) { toast.error(e.message); }
    finally { setEnvoi(false); }
  }

  return (
    <div>
      <Entete icone="📞" titre="Contacts & Support"
        soustitre="Une question, un problème technique, une demande sur votre dossier ?" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 24 }}>
        {[
          ['📧', 'E-mail', 'contact@binniesenglishtraining.com'],
          ['📱', 'Téléphone / WhatsApp', '+225 07 00 00 00 00'],
          ['🏢', 'Adresse', 'Abidjan, Côte d\'Ivoire'],
        ].map(([ico, l, v]) => (
          <div key={l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderTop: `3px solid ${couleur}`, borderRadius: 12, padding: '15px 17px' }}>
            <div style={{ fontSize: 22, marginBottom: 7 }}>{ico}</div>
            <div style={label}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginTop: 3, wordBreak: 'break-word' }}>{v}</div>
          </div>
        ))}
      </div>

      {envoye ? (
        <Vide icone="✅" titre="Demande transmise"
          detail="Notre équipe support l'a reçue et vous répondra par e-mail ou dans vos messages. Vous pouvez suivre les échanges depuis l'onglet Messages." />
      ) : (
        <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: COULEURS.navy, marginBottom: 16 }}>Écrire au support</div>

          <label style={label} htmlFor="objet-support">Objet</label>
          <input id="objet-support" value={objet} onChange={e => setObjet(e.target.value)} maxLength={200}
            placeholder="Ex. Je n'arrive pas à ouvrir un devoir" style={{ ...champ, marginBottom: 16 }} />

          <label style={label} htmlFor="desc-support">Détail <span style={{ fontWeight: 400, textTransform: 'none' }}>(facultatif)</span></label>
          <textarea id="desc-support" value={description} onChange={e => setDescription(e.target.value)} rows={5} maxLength={4000}
            placeholder="Décrivez ce qui se passe, et depuis quand."
            style={{ ...champ, resize: 'vertical', lineHeight: 1.6, marginBottom: 16 }} />

          <label style={label} htmlFor="prio-support">Urgence</label>
          <select id="prio-support" value={priorite} onChange={e => setPriorite(e.target.value)} style={{ ...champ, maxWidth: 260 }}>
            <option value="normale">Normale</option>
            <option value="haute">Bloquant — je ne peux pas suivre mes cours</option>
          </select>

          <button onClick={envoyer} disabled={!objet.trim() || envoi}
            style={{ marginTop: 18, padding: '11px 22px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
              background: (!objet.trim() || envoi) ? COULEURS.gris200 : couleur,
              color: (!objet.trim() || envoi) ? COULEURS.gris400 : '#fff',
              fontSize: 13.5, fontWeight: 700, cursor: (!objet.trim() || envoi) ? 'default' : 'pointer' }}>
            {envoi ? 'Envoi…' : 'Envoyer ma demande'}
          </button>
        </div>
      )}
    </div>
  );
}
