export const cartReducer = (state, action) => {
    switch (action.type) {
        case 'ADD_TO_CART':
            const existingItem = state.find(item => item._id === action.payload._id);
            if (existingItem) {
                return state.map(item =>
                    item._id === action.payload._id ? { ...item, quantity: item.quantity + 1 } : item
                );
            } else {
                return [...state, { ...action.payload, quantity: 1 }];
            }
            case 'REMOVE_FROM_CART':
                return state.map(item =>
                    item._id === action.payload ? { ...item, quantity: item.quantity - 1 } : item
                ).filter(item => item.quantity > 0);
            case 'CLEAR_CART':
                return [];
            default:
                return state;
        }
};