import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const RequireAuth = ({ children }) => {
    const navigate = useNavigate();

    useEffect(() => {
        const userToken = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).token : null;

        if (!userToken || userToken === 'undefined') {
            // Rediriger vers la page de login si l'utilisateur n'est pas connecté
            navigate('/');
        }
    }, [navigate]);

    return children; // Afficher les enfants (page protégée) si l'utilisateur est connecté
};

export default RequireAuth;