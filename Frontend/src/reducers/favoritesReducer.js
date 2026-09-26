export const favoritesReducer = (state, action) => {
  switch (action.type) {
    /* --------- Ajoute si absent / retire si déjà présent --------- */
    case 'TOGGLE_FAV': {
      const prod = action.payload;
      const already = state.some((p) => p._id === prod._id);
      return already
        ? state.filter((p) => p._id !== prod._id)
        : [...state, prod];
    }

    /* --------- Retire explicitement (par ex. dans la page Fav) ----- */
    case 'REMOVE_FAV':
      return state.filter((p) => p._id !== action.payload); // payload = _id

    /* --------- Vide la liste (facultatif) -------------------------- */
    case 'RESET_FAV':
      return [];

    default:
      return state;
  }
};