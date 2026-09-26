import supabase from "../config/supabase.js";

// dash a de vrais garde-fous de propriété (403 si coach_id !== l'appelant), contrairement à
// bet-elearning qui n'en a aucun sur ses routes séance/classe. Pour qu'un remplaçant dash
// puisse effectivement voir/animer le groupe et les séances qui lui sont délégués, il faut
// donc explicitement élargir ces garde-fous - d'où ce helper, consulté partout où dash
// vérifie `groupe.coach_id === req.profil.id`.
export async function estDelegueSurGroupe(coachId, groupeId) {
  if (!coachId || !groupeId) return false;
  const { data } = await supabase
    .from("delegations")
    .select("id")
    .eq("remplacant_id", coachId)
    .eq("groupe_id", groupeId)
    .eq("statut", "active")
    .maybeSingle();
  return !!data;
}

// Renvoie l'ensemble des groupe_id actuellement délégués à ce coach (délégations actives) -
// utilisé pour élargir les listes (GET /api/groupes, GET /api/seances) au-delà de coach_id=moi.
export async function groupesDeleguesA(coachId) {
  if (!coachId) return [];
  const { data } = await supabase
    .from("delegations")
    .select("groupe_id")
    .eq("remplacant_id", coachId)
    .eq("statut", "active");
  return [...new Set((data || []).map(d => d.groupe_id).filter(Boolean))];
}

// Renvoie l'ensemble des ids de séances (table `seances`) précisément couvertes par une
// délégation active de ce coach - contrairement à groupesDeleguesA, qui élargit à TOUT le
// groupe (nécessaire pour que le remplaçant voie le contexte de classe : roster, évaluations,
// séances passées), ce helper reste au périmètre exact du remplacement déclaré : une ou
// plusieurs séances précises pour une cause précise, jamais "devenir titulaire de la classe".
// Utilisé là où l'accès élargi doit rester strictement borné à ces séances (ex: Session Live,
// que le remplaçant doit pouvoir ouvrir/animer, mais pas au-delà de ce qui lui a été confié).
export async function sessionsDeleguesA(coachId) {
  if (!coachId) return [];
  const { data } = await supabase
    .from("delegations")
    .select("sessions_ids")
    .eq("remplacant_id", coachId)
    .eq("statut", "active");
  return [...new Set((data || []).flatMap(d => d.sessions_ids || []).filter(Boolean))];
}

// Symétrique de sessionsDeleguesA, côté titulaire absent : renvoie les ids de séances qu'il a
// délégués à un remplaçant (délégation active). Dès qu'une séance est confiée à un remplaçant,
// elle doit disparaître des données du titulaire (Session Live, planning) - sinon les deux
// coachs la voient et pourraient tous les deux tenter de l'animer/la clôturer.
export async function sessionsDeleguesPar(coachId) {
  if (!coachId) return [];
  const { data } = await supabase
    .from("delegations")
    .select("sessions_ids")
    .eq("titulaire_id", coachId)
    .eq("statut", "active");
  return [...new Set((data || []).flatMap(d => d.sessions_ids || []).filter(Boolean))];
}

// Renvoie la délégation active du groupe (avec le nom du remplaçant), ou null. Utilisé pour
// bloquer le titulaire sur les actions d'écriture (modifier la classe, ajouter un fichier, un
// cours, une évaluation, une présence...) tant qu'une délégation est active - le titulaire
// gardait jusqu'ici un accès total en parallèle du remplaçant, les deux pouvant agir sur la
// même classe au même moment sans qu'aucun ne le sache.
export async function delegationActiveSurGroupe(groupeId) {
  if (!groupeId) return null;
  const { data } = await supabase
    .from("delegations")
    .select("id, remplacant_id")
    .eq("groupe_id", groupeId)
    .eq("statut", "active")
    .maybeSingle();
  if (!data) return null;
  // Requête séparée (plutôt qu'un embed PostgREST) : `delegations` a deux FK vers
  // `utilisateurs` (titulaire_id, remplacant_id), ce qui rend l'embed ambigu sans préciser
  // le nom exact de la contrainte - une requête directe évite ce risque.
  let nomRemplacant = "un remplaçant";
  if (data.remplacant_id) {
    const { data: u } = await supabase.from("utilisateurs").select("nom, prenom").eq("id", data.remplacant_id).maybeSingle();
    if (u) nomRemplacant = [u.prenom, u.nom].filter(Boolean).join(" ") || nomRemplacant;
  }
  return { id: data.id, remplacant_id: data.remplacant_id, remplacant_nom: nomRemplacant };
}

// Bloque le titulaire d'un groupe (mais jamais le remplaçant) sur toute action d'écriture
// tant qu'une délégation est active - jusqu'ici le titulaire gardait un accès total en
// parallèle du remplaçant, les deux pouvant modifier la même classe au même moment.
// Prend directement un coachId (pas `req`) pour rester utilisable aussi bien depuis les
// routes authenticateAdmin (req.profil.id) que authenticateCoach (req.coachId), qui n'ont
// pas la même forme de req. Retourne un message d'erreur (à renvoyer en 403) ou null.
export async function refuserSiTitulaireDelegue(coachId, groupeId) {
  if (!coachId || !groupeId) return null;
  const deleg = await delegationActiveSurGroupe(groupeId);
  if (deleg && deleg.remplacant_id !== coachId) {
    return `Ce groupe est actuellement délégué à ${deleg.remplacant_nom} - vous ne pouvez pas le modifier tant que la délégation n'est pas clôturée.`;
  }
  return null;
}
