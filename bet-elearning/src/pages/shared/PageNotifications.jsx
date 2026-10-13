import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { useNotifications } from '../../contexts/NotificationsContext';
import { CATEGORIES_NOTIF, CATEGORIE_AUTRE, categorieNotif, compterParCategorie, libelleSource } from '../../utils/categoriesNotif';
import { useAuth } from '../../contexts/AuthContext';
import { useAgeInterface } from '../../hooks/useAgeInterface';
import { useTheme } from '../../contexts/ThemeContext';

const PAR_PAGE = 20;

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)               return 'À l\'instant';
  if (diff < 3600000)             return `Il y a ${Math.round(diff / 60000)} min`;
  if (diff < 86400000)            return `Il y a ${Math.round(diff / 3600000)}h`;
  if (diff < 7 * 86400000)        return `Il y a ${Math.round(diff / 86400000)}j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

const FILTRES = [
  { id: 'tous',   lib: 'Toutes' },
  { id: 'non_lu', lib: 'Non lues' },
  { id: 'alerte', lib: '🔴 Alertes' },
  { id: 'info',   lib: '🔵 Infos' },
  { id: 'succes', lib: '🟢 Succès' },
];

export default function PageNotifications() {
  const { couleurTheme } = useTheme();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { notifs, nbNonLus, marquerLue, toutMarquerLu, COULEUR_TYPE } = useNotifications();
  const [filtre, setFiltre] = useState('tous');
  /* Le filtre par CATÉGORIE MÉTIER, distinct du filtre par état (lu / alerte / info).
     Il est devenu nécessaire quand la direction s'est mise à tout recevoir : sans lui,
     un paiement à vérifier se perd entre quarante séances créées. */
  const [categorie, setCategorie] = useState('toutes');
  const [notifDetail, setNotifDetail] = useState(null);
  const _ui = useAgeInterface(profile);
  const menuRole = profile?.role === 'apprenant' ? _ui.menuRole : undefined;

  // ── Filtrage par date + pagination (client, sur la liste temps réel du contexte -
  // qui combine Supabase et Firebase, donc on ne refait pas notre propre fetch ici) ──
  const [page,      setPage]      = useState(1);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin,   setDateFin]   = useState('');

  useEffect(() => { setPage(1); }, [dateDebut, dateFin, filtre, categorie]);

  const notifsFiltrees = notifs.filter(n => {
    if (filtre === 'non_lu' && n.lu) return false;
    if (filtre === 'alerte' && n.type !== 'alerte') return false;
    if (filtre === 'info'   && n.type !== 'info')   return false;
    if (filtre === 'succes' && n.type !== 'succes') return false;
    if (categorie !== 'toutes' && categorieNotif(n).cle !== categorie) return false;
    if (dateDebut && new Date(n.date) < new Date(dateDebut)) return false;
    if (dateFin   && new Date(n.date) > new Date(`${dateFin}T23:59:59`)) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const total      = notifsFiltrees.length;
  const totalPages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const pageActuelle = Math.min(page, totalPages);
  const notifsPage  = notifsFiltrees.slice((pageActuelle - 1) * PAR_PAGE, pageActuelle * PAR_PAGE);

  const comptesCategories = compterParCategorie(notifs);

  const stats = [
    { label: 'Total',    valeur: notifs.length,                             couleur: COULEURS.blanc },
    { label: 'Non lues', valeur: nbNonLus,                                   couleur: nbNonLus > 0 ? '#FCA5A5' : '#4ADE80' },
    { label: 'Page',     valeur: `${pageActuelle}/${totalPages}`,            couleur: '#93C5FD' },
  ];

  const S = {
    corps: { flex: 1, overflowY: 'auto', padding: '28px 32px' },
    entete: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    titre: { fontSize: 20, fontWeight: 800, color: COULEURS.navy },
    sousTitre: { fontSize: 13, color: COULEURS.gris400, marginTop: 2 },
    filtres: { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
    btnFiltre: (actif) => ({
      padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${actif ? couleurTheme : COULEURS.gris200}`,
      background: actif ? couleurTheme : COULEURS.blanc, color: actif ? '#fff' : COULEURS.gris600,
      fontSize: 12, fontWeight: actif ? 700 : 500, cursor: 'pointer',
      fontFamily: '"Plus Jakarta Sans", sans-serif', transition: 'all 0.15s',
    }),
    btnToutLire: {
      background: 'transparent', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8,
      padding: '8px 16px', fontSize: 12, fontWeight: 600, color: COULEURS.gris600,
      cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
    },
    liste: { display: 'flex', flexDirection: 'column', gap: 10 },
    carte: (lu, type) => ({
      background: lu ? COULEURS.blanc : (COULEUR_TYPE[type]?.fond || '#F8FAFC'),
      border: `1px solid ${lu ? COULEURS.gris200 : (COULEUR_TYPE[type]?.bord || COULEURS.gris200)}`,
      borderLeft: `4px solid ${lu ? COULEURS.gris200 : (COULEUR_TYPE[type]?.bord || couleurTheme)}`,
      borderRadius: 12, padding: '14px 18px',
      display: 'flex', gap: 14, alignItems: 'flex-start',
      cursor: 'pointer', transition: 'box-shadow 0.15s',
    }),
    iconeZone: (type) => ({
      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
      background: COULEUR_TYPE[type]?.fond || COULEURS.gris50,
      border: `1px solid ${COULEUR_TYPE[type]?.bord || COULEURS.gris200}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
    }),
    pointNonLu: {
      width: 8, height: 8, borderRadius: '50%', background: couleurTheme,
      flexShrink: 0, marginTop: 6,
    },
    notifTitre: (lu) => ({
      fontSize: 14, fontWeight: lu ? 500 : 700, color: COULEURS.navy, marginBottom: 4,
    }),
    notifMsg: { fontSize: 13, color: COULEURS.gris600, lineHeight: 1.5, marginBottom: 6 },
    notifMeta: { display: 'flex', alignItems: 'center', gap: 10 },
    notifDate: { fontSize: 11, color: COULEURS.gris400 },
    badgeType: (type) => ({
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: COULEUR_TYPE[type]?.fond || COULEURS.gris100,
      color: COULEUR_TYPE[type]?.texte || COULEURS.gris600,
    }),
    lienBtn: {
      fontSize: 11, fontWeight: 600, color: couleurTheme, cursor: 'pointer',
      background: 'none', border: 'none', padding: 0, fontFamily: '"Plus Jakarta Sans", sans-serif',
      textDecoration: 'underline',
    },
    vide: {
      textAlign: 'center', padding: 60, color: COULEURS.gris400,
      fontSize: 14, background: COULEURS.gris50, borderRadius: 16,
      border: `1px dashed ${COULEURS.gris200}`,
    },
    separateurJour: {
      fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase',
      letterSpacing: '0.07em', padding: '8px 0', marginTop: 8,
    },
  };

  // Grouper par jour
  function labelJour(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const hier = new Date(now); hier.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString())  return "Aujourd'hui";
    if (d.toDateString() === hier.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  }

  const groupes = notifsPage.reduce((acc, n) => {
    const j = labelJour(n.date);
    if (!acc[j]) acc[j] = [];
    acc[j].push(n);
    return acc;
  }, {});

  return (
    <TopNavLayout stats={stats} menuRole={menuRole}>
      <div style={S.corps}>

        {/* En-tête */}
        <div style={S.entete}>
          <div>
            <div style={S.titre}>
              🔔 Notifications
              {nbNonLus > 0 && (
                <span style={{ marginLeft: 10, background: '#EF4444', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700, verticalAlign: 'middle' }}>
                  {nbNonLus}
                </span>
              )}
            </div>
            <div style={S.sousTitre}>{total} notification{total > 1 ? 's' : ''} · {nbNonLus} non lue{nbNonLus > 1 ? 's' : ''}</div>
          </div>
          {nbNonLus > 0 && (
            <button style={S.btnToutLire} onClick={toutMarquerLu}>
              ✓ Tout marquer comme lu
            </button>
          )}
        </div>

        {/* Filtres */}
        <div style={S.filtres}>
          {FILTRES.map(f => (
            <button key={f.id} style={S.btnFiltre(filtre === f.id)} onClick={() => setFiltre(f.id)}>
              {f.lib}
            </button>
          ))}
        </div>

        {/* Filtre par catégorie métier */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {[{ cle: 'toutes', libelle: 'Toutes', icone: '🔔', couleur: COULEURS.navy }, ...CATEGORIES_NOTIF, CATEGORIE_AUTRE].map(c => {
            const n = c.cle === 'toutes' ? notifs.length : (comptesCategories[c.cle] || 0);
            // Une catégorie vide n'est pas proposée : un onglet qui ne mène nulle part
            // encombre autant que le bruit qu'on cherche à écarter.
            if (c.cle !== 'toutes' && n === 0) return null;
            const actif = categorie === c.cle;
            return (
              <button key={c.cle} onClick={() => setCategorie(c.cle)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 20,
                  border: `1.5px solid ${actif ? c.couleur : COULEURS.gris200}`,
                  background: actif ? `${c.couleur}15` : COULEURS.blanc,
                  color: actif ? c.couleur : COULEURS.gris600,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
                }}>
                <span>{c.icone}</span>{c.libelle}
                <span style={{ background: actif ? c.couleur : COULEURS.gris100, color: actif ? '#fff' : COULEURS.gris600, borderRadius: 10, padding: '1px 7px', fontSize: 10 }}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Filtre par date */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: COULEURS.gris600, fontWeight: 600 }}>Du</label>
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif' }} />
          <label style={{ fontSize: 12, color: COULEURS.gris600, fontWeight: 600 }}>au</label>
          <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif' }} />
          {(dateDebut || dateFin) && (
            <button onClick={() => { setDateDebut(''); setDateFin(''); }}
              style={{ ...S.btnFiltre(false), padding: '6px 14px' }}>
              ✕ Réinitialiser
            </button>
          )}
        </div>

        {/* Liste groupée par jour */}
        {total === 0 ? (
          <div style={S.vide}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
            <div style={{ fontWeight: 600, color: COULEURS.navy, marginBottom: 6 }}>Aucune notification</div>
            <div>Vous êtes à jour !</div>
          </div>
        ) : (
          Object.entries(groupes).map(([jour, items]) => (
            <div key={jour}>
              <div style={S.separateurJour}>{jour}</div>
              <div style={S.liste}>
                {items.map(n => (
                  <div
                    key={n.id}
                    style={S.carte(n.lu, n.type)}
                    onClick={() => setNotifDetail(n)}
                  >
                    <div style={S.iconeZone(n.type)}>{n.icone}</div>
                    <div style={{ flex: 1 }}>
                      <div style={S.notifTitre(n.lu)}>{n.titre}</div>
                      <div style={S.notifMsg}>{n.message}</div>
                      <div style={S.notifMeta}>
                        <span style={S.badgeType(n.type)}>
                          {n.type === 'alerte' ? 'Alerte' : n.type === 'succes' ? 'Succès' : 'Info'}
                        </span>
                        {/* La catégorie métier, et l'origine. `source` ne filtre plus
                            la liste (le cloisonnement par plateforme a été levé) : elle
                            sert maintenant à dire d'où vient la notification. */}
                        {(() => {
                          const c = categorieNotif(n);
                          return (
                            <span style={{ padding: '2px 8px', borderRadius: 10, background: `${c.couleur}15`, color: c.couleur, fontSize: 10, fontWeight: 700 }}>
                              {c.icone} {c.libelle}
                            </span>
                          );
                        })()}
                        {(() => {
                          const src = libelleSource(n.source);
                          return src ? (
                            <span style={{ padding: '2px 8px', borderRadius: 10, border: `1px solid ${src.couleur}40`, color: src.couleur, fontSize: 10, fontWeight: 600 }}>
                              {src.lib}
                            </span>
                          ) : null;
                        })()}
                        <span style={S.notifDate}>{fmtDate(n.date)}</span>
                        {!n.lu && (
                          <button
                            style={{ ...S.lienBtn, color: COULEURS.gris400 }}
                            onClick={e => { e.stopPropagation(); marquerLue(n.id); }}
                          >
                            Marquer comme lu
                          </button>
                        )}
                      </div>
                    </div>
                    {!n.lu && <div style={S.pointNonLu} />}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Pagination */}
        {total > PAR_PAGE && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 24 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pageActuelle <= 1}
              style={{ ...S.btnFiltre(false), opacity: pageActuelle <= 1 ? 0.5 : 1, cursor: pageActuelle <= 1 ? 'not-allowed' : 'pointer' }}
            >
              ← Précédent
            </button>
            <span style={{ fontSize: 12, color: COULEURS.gris600, fontWeight: 600 }}>Page {pageActuelle} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={pageActuelle >= totalPages}
              style={{ ...S.btnFiltre(false), opacity: pageActuelle >= totalPages ? 0.5 : 1, cursor: pageActuelle >= totalPages ? 'not-allowed' : 'pointer' }}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      {/* Modal détail notification */}
      {notifDetail && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}
          onClick={() => setNotifDetail(null)}
        >
          <div
            style={{ background: COULEURS.blanc, borderRadius: 16, width: '92%', maxWidth: 640, maxHeight: '85vh', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              background: COULEUR_TYPE[notifDetail.type]?.fond || COULEURS.gris50,
              borderBottom: `1px solid ${COULEUR_TYPE[notifDetail.type]?.bord || COULEURS.gris200}`,
              padding: '20px 24px', display: 'flex', gap: 14, alignItems: 'flex-start', flexShrink: 0,
            }}>
              <div style={S.iconeZone(notifDetail.type)}>{notifDetail.icone}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 }}>{notifDetail.titre}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={S.badgeType(notifDetail.type)}>
                    {notifDetail.type === 'alerte' ? 'Alerte' : notifDetail.type === 'succes' ? 'Succès' : 'Info'}
                  </span>
                  <span style={S.notifDate}>{fmtDate(notifDetail.date)}</span>
                </div>
              </div>
              <button
                onClick={() => setNotifDetail(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COULEURS.gris400 }}
              >×</button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', minHeight: 0 }}>
              <div style={{ fontSize: 14, color: COULEURS.gris600, lineHeight: 1.6, marginBottom: 20, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {notifDetail.message || 'Aucun détail supplémentaire.'}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {!notifDetail.lu && (
                  <button
                    onClick={() => { marquerLue(notifDetail.id); setNotifDetail(null); }}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                  >
                    ✓ Marquer comme lu
                  </button>
                )}
                {notifDetail.lien && (
                  <button
                    onClick={() => { marquerLue(notifDetail.id); navigate(notifDetail.lien); setNotifDetail(null); }}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: couleurTheme, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                  >
                    Voir la page liée →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </TopNavLayout>
  );
}
