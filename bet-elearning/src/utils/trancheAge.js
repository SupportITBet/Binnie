export function calcTranche(dateStr) {
  if (!dateStr) return 'adulte';
  const dn = new Date(dateStr);
  if (isNaN(dn.getTime())) return 'adulte';
  const age = Math.floor((Date.now() - dn.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age <= 12) return 'enfant';
  if (age <= 17) return 'adolescent';
  return 'adulte';
}
