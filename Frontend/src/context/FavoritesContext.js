// src/context/FavoritesContext.js
import React, { createContext, useReducer, useEffect } from 'react';
import { favoritesReducer } from '../reducers/favoritesReducer';

export const FavoritesContext = createContext();

const FavoritesContextProvider = ({ children }) => {
  const [favorites, dispatch] = useReducer(favoritesReducer, [], () => {
    const localData = localStorage.getItem('favorites');
    return localData ? JSON.parse(localData) : [];
  });

  /* persistance */
  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }, [favorites]);

  return (
    <FavoritesContext.Provider value={{ favorites, dispatch }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export default FavoritesContextProvider;