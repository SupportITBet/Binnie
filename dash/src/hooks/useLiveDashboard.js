const useLiveDashboardHook = `
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
 
export function useLiveDashboard(adminId) {
  const [stats, setStats]   = useState(null);
  const [alertes, setAlertes] = useState([]);
 
  useEffect(() => {
    if (!adminId) return;
    const unsub = onSnapshot(doc(db, 'live_dashboard', adminId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStats(data.statsJour);
        setAlertes((data.alertes || []).filter(a => !a.traitee));
      }
    });
    return unsub;
  }, [adminId]);
 
  return { stats, alertes };
}
`;