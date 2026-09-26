import { createContext, useContext, useState } from 'react';
import { MOCK_USERS_INTERNES } from '../mock/usersInternes';

const UsersContext = createContext(null);

export function UsersProvider({ children }) {
  const [users, setUsers] = useState(MOCK_USERS_INTERNES);

  function ajouterUser(form) {
    const nvUser = {
      ...form,
      id: `ui-${Date.now()}`,
      initiales: `${form.prenom?.[0] || ''}${form.nom?.[0] || ''}`.toUpperCase(),
      date_creation: new Date().toISOString().split('T')[0],
      derniere_connexion: '--',
      permissions: [],
    };
    setUsers(prev => [...prev, nvUser]);
    return nvUser;
  }

  function modifierUser(form) {
    setUsers(prev => prev.map(u => u.id === form.id ? { ...u, ...form } : u));
  }

  function supprimerUser(id) {
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  function toggleActifUser(id) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, est_actif: !u.est_actif } : u));
  }

  return (
    <UsersContext.Provider value={{ users, ajouterUser, modifierUser, supprimerUser, toggleActifUser }}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error('useUsers must be used within UsersProvider');
  return ctx;
}
