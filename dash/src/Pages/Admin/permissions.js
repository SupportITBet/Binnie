// 🔹 Définition complète des rôles & permissions
export const rolesPermissions = {
  // 🔸 Administrateur principal
  admin: [
     "view_users", "create_users", "edit_users", "delete_users",
    "view_documents", "upload_documents", "delete_documents",
    "create_projects", "view_projects", "edit_projects", "delete_projects",
    "create_homes", "view_homes", "edit_homes", "delete_homes", "archive_homes",
    "create_tenants", "view_tenants", "edit_tenants", "delete_tenants", "archive_tenants", "manage_payments", "view_payments",
    "generate_reports", "manage_settings", "view_archives", "allow_signatures","manage_work",
    "send_receipt","increase_rent","create_charges","update_charges","delete_charges"
  ],

  // 🔸 Manager
  manager: [
    "view_users",
    "view_documents", "upload_documents",
    "create_projects", "view_projects", "edit_projects",
    "create_homes", "view_homes", "edit_homes",
    "create_tenants", "view_tenants", "edit_tenants", "archive_tenants",
    "manage_payments", "edit_payments", "view_payments", "delete_payments",
    "generate_reports"
  ],

  // 🔸 Agent immobilier
  agent: [
    "view_documents", "upload_documents", "view_archives",
    "view_projects", "create_homes", "view_homes", "archive_homes",
    "create_tenants", "view_tenants",
    "manage_payments"
  ],

  // 🔸 Auditeur
  auditor: [
    "view_projects", "view_homes", "view_tenants",
    "view_documents", "view_payments", "generate_reports"
  ],

  // 🔸 Utilisateur standard (fallback)
  user: [
    "view_documents", 
    // "upload_documents", 
    "view_archives",
    // "create_tenants", "view_tenants", "edit_tenants",
    // "archive_homes", "edit_projects",
    // "create_homes", "edit_homes", 
    "view_homes",
    "view_projects", "view_payments",
    // "manage_rentals", "manage_payments"
  ]
};

// 🔹 Traduction FR pour affichage
export const permissionLabels = {
  view_users: "Voir utilisateurs",
  create_users: "Créer utilisateurs",
  edit_users: "Modifier utilisateurs",
  delete_users: "Supprimer utilisateurs",
  view_documents: "Voir documents",
  upload_documents: "Télécharger documents",
  delete_documents: "Supprimer documents",
  create_projects: "Créer projets",
  view_projects: "Voir projets",
  edit_projects: "Modifier projets",
  delete_projects: "Supprimer projets",
  create_homes: "Créer maisons",
  view_homes: "Voir maisons",
  edit_homes: "Modifier maisons",
  delete_homes: "Supprimer maisons",
  archive_homes: "Archiver maisons",
  create_tenants: "Créer locataires",
  view_tenants: "Voir locataires",
  edit_tenants: "Modifier locataires",
  delete_tenants: "Supprimer locataires",
  archive_tenants: "Archiver locataires",
  manage_payments: "Gérer paiements",
  edit_payments: "Modifier paiements",
  delete_payments: "Supprimer paiements",
  view_payments: "Voir paiements",
  generate_reports: "Générer rapports",
  manage_settings: "Paramètres généraux",
  view_archives: "Voir archives",
  allow_signatures:"Autoriser les signatures",
  manage_work:"Autoriser les travaux",
   send_receipt:"Envoi reçu/mail",
   increase_rent:"Augmenter Loyer",
   create_charges: "Créer des charges",
update_charges: "Mettre a jour charges",
delete_charges : "Supprimer les charges",
};