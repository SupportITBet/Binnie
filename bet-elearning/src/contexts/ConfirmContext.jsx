import { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

/**
 * Remplace window.confirm / window.alert / window.prompt par des modals cohérents avec le
 * reste de l'app (les dialogues natifs du navigateur ne peuvent pas être stylés et cassent le
 * design partout où ils apparaissent).
 *
 * const confirm = useConfirm(); if (!(await confirm('Supprimer ?'))) return;
 * const alerte  = useAlerte();  await alerte('Enregistré avec succès.');
 * const prompt  = usePrompt();  const val = await prompt('Résolution :'); if (val) ...
 *
 * Options communes : { titre, danger, confirmLabel, cancelLabel }. `prompt` accepte en plus
 * { valeurInitiale, placeholder }.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { mode: 'confirm'|'alerte'|'prompt', message, titre, danger, confirmLabel, cancelLabel, valeur, resolve }

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setState({
        mode: 'confirm', message,
        titre:        opts.titre || 'Confirmer l\'action',
        danger:       opts.danger !== false,
        confirmLabel: opts.confirmLabel || 'Confirmer',
        cancelLabel:  opts.cancelLabel || 'Annuler',
        resolve,
      });
    });
  }, []);

  const alerte = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setState({
        mode: 'alerte', message,
        titre:        opts.titre || 'Information',
        danger:       opts.danger === true,
        confirmLabel: opts.confirmLabel || 'OK',
        resolve,
      });
    });
  }, []);

  const prompt = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setState({
        mode: 'prompt', message,
        titre:        opts.titre || 'Saisie requise',
        confirmLabel: opts.confirmLabel || 'Valider',
        cancelLabel:  opts.cancelLabel || 'Annuler',
        placeholder:  opts.placeholder || '',
        valeur:       opts.valeurInitiale || '',
        resolve,
      });
    });
  }, []);

  function repondre(valeur) {
    state?.resolve(valeur);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm, alerte, prompt }}>
      {children}
      {state && (
        <div
          onClick={() => repondre(state.mode === 'prompt' ? null : false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: '26px 28px', maxWidth: 420, width: '90vw', boxShadow: '0 30px 80px rgba(0,0,0,0.3)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: state.danger ? '#991B1B' : '#0B1220', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              {state.danger && <span style={{ fontSize: 18 }}>⚠️</span>}
              {state.titre}
            </div>
            <div style={{ fontSize: 13.5, color: '#4B5563', lineHeight: 1.6, marginBottom: state.mode === 'prompt' ? 12 : 22, whiteSpace: 'pre-line' }}>
              {state.message}
            </div>
            {state.mode === 'prompt' && (
              <input
                autoFocus
                type="text"
                value={state.valeur}
                placeholder={state.placeholder}
                onChange={e => setState(s => ({ ...s, valeur: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && state.valeur.trim()) repondre(state.valeur); if (e.key === 'Escape') repondre(null); }}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 22 }}
              />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              {state.mode !== 'alerte' && (
                <button
                  onClick={() => repondre(state.mode === 'prompt' ? null : false)}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {state.cancelLabel}
                </button>
              )}
              <button
                onClick={() => repondre(state.mode === 'prompt' ? state.valeur : true)}
                disabled={state.mode === 'prompt' && !state.valeur.trim()}
                autoFocus={state.mode !== 'prompt'}
                style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: (state.mode === 'prompt' && !state.valeur.trim()) ? '#93c5fd' : (state.danger ? '#dc2626' : '#2563eb'), color: '#fff', fontSize: 13, fontWeight: 700, cursor: (state.mode === 'prompt' && !state.valeur.trim()) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

function useConfirmContext() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm/useAlerte/usePrompt doivent être utilisés sous <ConfirmProvider>');
  return ctx;
}

export function useConfirm() { return useConfirmContext().confirm; }
export function useAlerte()  { return useConfirmContext().alerte; }
export function usePrompt()  { return useConfirmContext().prompt; }
