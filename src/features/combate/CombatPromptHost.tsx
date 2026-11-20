import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getCombatPrompts, registerCombatPromptHost, subscribeCombatPrompts } from './combatPrompt';

/** Ventana S\u00ed / No del combate (una pregunta cada vez). Escape, clic fuera o cerrar = No. */
export default function CombatPromptHost() {
  const prompts = useSyncExternalStore(subscribeCombatPrompts, getCombatPrompts, getCombatPrompts);
  const current = prompts[0];
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => registerCombatPromptHost(), []);
  useEffect(() => {
    if (!current) return;
    (current.suggestYes ? yesRef.current : noRef.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); current.resolve(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current]);
  if (!current) return null;
  return (
    <div className="combat-prompt-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) current.resolve(false); }}>
      <div className="combat-prompt" role="dialog" aria-modal="true" aria-labelledby={`combat-prompt-${current.id}`}>
        <button type="button" className="combat-prompt__close" aria-label="Cerrar (No)" onClick={() => current.resolve(false)}>\u00d7</button>
        <p className="combat-panel__picker-title" id={`combat-prompt-${current.id}`}>{current.title}</p>
        {current.body && <p className="combat-page__hint">{current.body}</p>}
        <div className="combat-panel__picker-actions">
          <button ref={yesRef} type="button" className="combat-btn combat-btn--small combat-btn--gold" onClick={() => current.resolve(true)}>{current.yesLabel}</button>
          <button ref={noRef} type="button" className="combat-btn combat-btn--small" onClick={() => current.resolve(false)}>{current.noLabel}</button>
        </div>
        {prompts.length > 1 && <p className="combat-page__hint">{`${prompts.length - 1} pregunta(s) m\u00e1s en cola`}</p>}
      </div>
    </div>
  );
}
