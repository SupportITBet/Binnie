import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

export default function NavbarList() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  // Fermer le dropdown si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div>
      {/* Topbar */}
      <div className='topbar'>
        <div className='logo'>Mon SaaS Pro</div>
        <div className='topbar-right'>
          <div className='notification'>
            <i className="fa-regular fa-bell"></i>
            <span className='badge'>3</span>
          </div>
          <div className='user' ref={dropdownRef} onClick={() => setDropdownOpen(!dropdownOpen)}>
            <img src="https://i.pravatar.cc/40?img=3" alt="profil" />
            <span className="username">Fodé</span>
            <i className="fa-solid fa-chevron-down"></i>

            {/* DROPDOWN */}
            {dropdownOpen && (
              <div className='dropdown-menu'>
                <NavLink to="/profil">
                  <i className="fa-solid fa-user"></i> Profil
                </NavLink>
                <NavLink to="/settings">
                  <i className="fa-solid fa-gear"></i> Paramètres
                </NavLink>
                <NavLink to="/notifications">
                  <i className="fa-solid fa-bell"></i> Notifications
                </NavLink>
                <NavLink to="/logout">
                  <i className="fa-solid fa-right-from-bracket"></i> Déconnexion
                </NavLink>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navbar horizontal */}
      <div className='container__navbarList'>
        <div className='content__navbarList'>
          
          <NavLink to="/accueil" className={({ isActive }) => isActive ? 'active' : ''}><i className="fa-solid fa-house"></i> Accueil</NavLink>
          <NavLink to="/articles" className={({ isActive }) => isActive ? 'active' : ''}><i className="fa-solid fa-building"></i> Structures</NavLink>
          <NavLink to="/traitement" className={({ isActive }) => isActive ? 'active' : ''}><i className="fa-solid fa-cart-shopping"></i> Mes Commandes</NavLink>
          <NavLink to="/clients" className={({ isActive }) => isActive ? 'active' : ''}><i className="fa-solid fa-users"></i> Clients</NavLink>
          <NavLink to="/nos--fournisseurs" className={({ isActive }) => isActive ? 'active' : ''}><i className="fa-solid fa-truck"></i> Fournisseurs</NavLink>
          <NavLink to="/Mes--statistiques" className={({ isActive }) => isActive ? 'active' : ''}><i className="fa-solid fa-chart-line"></i> Statistiques</NavLink>
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}><i className="fa-solid fa-user-circle"></i> Profil</NavLink>
        </div>
      </div>
    </div>
  );
}