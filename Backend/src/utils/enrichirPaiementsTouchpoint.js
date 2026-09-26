import supabase from "../config/supabase.js";

// Enrichissement TouchPoint : ref_transaction (paiements_parcours) == order_number
// (paiements_touchpoint) - payment_token et le vrai payment_mode (opérateur : MTN,
// Orange, Moov, Wave...) n'existent que sur cette table, pas sur paiements_parcours
// (qui ne stocke que "TouchPoint" en générique). Sans ce lien, le reçu/détail affiché
// (commercial, comptable, ou l'apprenant lui-même dans son espace) avait bien moins
// d'infos que la vue SuperAdmin/Admin. Extrait dans un utilitaire partagé car utilisé
// à la fois par paiements.js (vues staff) et apprenants.js (espace apprenant).
export async function enrichirPaiementsAvecTouchPoint(paiements) {
  const refs = [...new Set((paiements || []).map(p => p.ref_transaction).filter(Boolean))];
  if (!refs.length) return paiements || [];
  const { data: tpRows } = await supabase
    .from("paiements_touchpoint")
    .select("order_number, payment_token, payment_mode, offre_type, niveau, created_at, updated_at")
    .in("order_number", refs);
  const tpByRef = Object.fromEntries((tpRows || []).map(t => [t.order_number, t]));
  return (paiements || []).map(p => ({
    ...p,
    payment_token:      tpByRef[p.ref_transaction]?.payment_token || null,
    payment_mode_reel:  tpByRef[p.ref_transaction]?.payment_mode || null,
    niveau:             tpByRef[p.ref_transaction]?.niveau || null,
    touchpoint_cree_le: tpByRef[p.ref_transaction]?.created_at || null,
    touchpoint_maj_le:  tpByRef[p.ref_transaction]?.updated_at || null,
  }));
}
