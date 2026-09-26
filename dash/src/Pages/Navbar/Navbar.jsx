import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useUserContext } from '../../contexts/UserContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import toast from 'react-hot-toast';

export default function Navbar() {
  const { user, logout } = useUserContext();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const logoutHandler = async () => {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    logout();
    toast.success('Déconnexion réussie !');
    navigate('/');
  };

  // Menu dynamique selon le rôle
  const roleMenu = {
    admin: [
      { name: 'Dashboard', path: '/admin/dashboard', icon: 'fa-solid fa-house' },
      { name: 'Professeurs', path: '/admin/professors', icon: 'fa-solid fa-chalkboard-teacher' },
      { name: 'Étudiants', path: '/admin/students', icon: 'fa-solid fa-users' },
      { name: 'Examens', path: '/admin/exams', icon: 'fa-solid fa-file-alt' },
      { name: 'Profil', path: '/admin/profile', icon: 'fa-solid fa-user-circle' },
    ],
    prof: [
      { name: 'Dashboard', path: '/prof/dashboard', icon: 'fa-solid fa-house' },
      { name: 'Mes Examens', path: '/prof/exams', icon: 'fa-solid fa-file-alt' },
      { name: 'Mes Étudiants', path: '/prof/students', icon: 'fa-solid fa-users' },
      { name: 'Profil', path: '/prof/profile', icon: 'fa-solid fa-user-circle' },
    ],
    etudiant: [
      { name: 'Dashboard', path: '/student/dashboard', icon: 'fa-solid fa-house' },
      { name: 'Mes Examens', path: '/student/exams', icon: 'fa-solid fa-file-alt' },
      { name: 'Profil', path: '/student/profile', icon: 'fa-solid fa-user-circle' },
    ],
    administration: [
      { name: 'Accueil', path: '/administration/home', icon: 'fa-solid fa-house' },
      { name: 'Gestion Examens', path: '/administration/exams', icon: 'fa-solid fa-file-alt' },
      { name: 'Rapports', path: '/administration/reports', icon: 'fa-solid fa-chart-line' },
      { name: 'Profil', path: '/administration/profile', icon: 'fa-solid fa-user-circle' },
    ],
  };

  const menuItems = user?.role ? roleMenu[user.role] : [];

  return (
    <div className="navbar-global">

      <header className="navbar-top">
        <div className="navbar-left">
          <Link to="/accueil">
            <img src={`${process.env.PUBLIC_URL}/logo df.png`} alt="Logo" className="navbar-logo" />
          </Link>
        </div>

        <div className="navbar-center">
          <h2 className="navbar-title">DF Manager</h2>
        </div>

        <div className="navbar-right">
          {user ? (
            <>
              <div className="navbar-user-info desktop-only">
                <Link to={menuItems.find(i => i.name === 'Profil')?.path} className="btn-profil">
                  <i className="fa-solid fa-user-circle"></i> {user.fullname}
                </Link>
                <button onClick={logoutHandler} className="btn-logout">
                  <i className="fa-solid fa-right-from-bracket"></i> Déconnexion
                </button>
              </div>

              <div className="mobile-dropdown mobile-only">
                <button className="btn-profil" onClick={() => setDropdownOpen(!dropdownOpen)}>
                  Mon profil <i className="fa-solid fa-user-circle"></i>
                </button>

                {dropdownOpen && (
                  <div className="dropdown-menu">
                    {menuItems.map((item, idx) => (
                      <Link key={idx} to={item.path} onClick={() => setDropdownOpen(false)}>
                        <i className={item.icon}></i> {item.name}
                      </Link>
                    ))}
                    <button onClick={logoutHandler}>Déconnexion</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link to="/" className="btn-login">Login</Link>
          )}
        </div>
      </header>

      <nav className="navbar-menu">
        {menuItems.map((item, idx) => (
          <NavLink key={idx} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
            <i className={item.icon}></i> {item.name}
          </NavLink>
        ))}
      </nav>

      <style>{`/* --- Styles identiques à ton code existant --- */
.navbar-global { font-family: 'Arial', sans-serif; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 100; }
.navbar-top { display: flex; justify-content: space-between; align-items: center; padding: 10px; }
.navbar-logo { height: 50px; }
.navbar-title { margin: 0; font-size: 1.5rem; color: #333; }
.navbar-user-info { display: flex; align-items: center; gap: 10px; position: relative; }
.btn-profil, .btn-logout, .btn-login { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-size: 0.875rem; transition: all 0.2s ease; }
.btn-profil { background: #f0f0f0; color: #333; }
.btn-profil:hover { background: #e0e0e0; }
.btn-logout { background: #e74c3c; color: white; }
.btn-logout:hover { background: #c0392b; }
.btn-login { background: #667eea; color: white; }
.btn-login:hover { background: #5661c9; }
.navbar-menu { display: flex; flex-wrap: wrap; gap: 10px; background: #fff; padding: 10px 20px; border-top: 1px solid #eee; }
.navbar-menu a { display: flex; align-items: center; gap: 5px; text-decoration: none; color: #333; padding: 8px 12px; border-radius: 6px; transition: all 0.2s ease; }
.navbar-menu a:hover { background: #f0f0f0; }
.navbar-menu a.active { background: #667eea; color: white; }
.desktop-only { display: flex; gap: 10px; }
.mobile-only { display: none; position: relative; flex-direction: column; }
@media (max-width: 768px) { .desktop-only { display: none; } .mobile-only { display: flex; } }
`}</style>
    </div>
  );
}