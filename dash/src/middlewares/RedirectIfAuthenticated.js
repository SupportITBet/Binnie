import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const RedirectIfAuthenticated = ({ children }) => {
    const navigate = useNavigate();

    useEffect(() => {
        const userToken = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).token : null;

        if (userToken && userToken !== 'undefined') {
            // Rediriger vers la page d'accueil ou une autre page si l'utilisateur est connecté
            navigate('/persons');
        }
    }, [navigate]);

    return children; // Afficher les enfants (page de login) si l'utilisateur n'est pas connecté
};

export default RedirectIfAuthenticated;