import supabase from "supabase"

// src/context/AuthContext.jsx
const user = await supabase.auth.getUser();
const { data: profil } = await supabase
  .from('utilisateurs')
  .select('role, prenom, nom')
  .eq('id', user.id)
  .single();

// Redirection selon rôle
const routes = {
  apprenant:    '/espace-apprenant',
  coach:        '/espace-coach',
  admin:        '/admin-dashboard',
  gestionnaire: '/espace-gestionnaire',
  commercial:   '/espace-commercial',
  drh:          '/espace-rh',
};