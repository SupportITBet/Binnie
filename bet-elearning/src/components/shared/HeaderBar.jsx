import { useAuth } from '../../contexts/AuthContext';
import { COULEURS } from '../../constants/couleurs';
import { LIBELLES_ROLES } from '../../constants/roles';

export default function HeaderBar({ titre, sousTitre }) {
  const { profile } = useAuth();

  const styles = {
    header: {
      height: 64,
      background: COULEURS.blanc,
      borderBottom: `1px solid ${COULEURS.gris200}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      flexShrink: 0,
    },
    titreZone: {
      display: 'flex',
      flexDirection: 'column',
    },
    titre: {
      fontSize: 18,
      fontWeight: 700,
      color: COULEURS.navy,
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      lineHeight: 1.2,
    },
    sousTitre: {
      fontSize: 12,
      color: COULEURS.gris400,
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    },
    droite: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    },
    badge: {
      background: COULEURS.cyanClair,
      color: COULEURS.cyanFonce,
      padding: '4px 12px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    },
    date: {
      fontSize: 12,
      color: COULEURS.gris400,
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    },
  };

  const dateAujourd = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <header style={styles.header}>
      <div style={styles.titreZone}>
        {titre && <div style={styles.titre}>{titre}</div>}
        {sousTitre && <div style={styles.sousTitre}>{sousTitre}</div>}
      </div>
      <div style={styles.droite}>
        <span style={styles.date}>{dateAujourd}</span>
        {profile && (
          <span style={styles.badge}>
            {LIBELLES_ROLES[profile.role] || profile.role}
          </span>
        )}
      </div>
    </header>
  );
}
