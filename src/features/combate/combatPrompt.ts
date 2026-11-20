/**
 * Preguntas S\u00ed / No en combate (p. ej. \u00ab\u00bfHay m\u00e1s de un campe\u00f3n enemigo cerca?\u00bb de Invierno eterno).
 * Las lanza el motor de efectos desde cualquier camino (habilidades, control manual, reacciones) y las pinta
 * CombatPromptHost (montado en Combate). Sin host montado: window.confirm. Escape / cerrar = No.
 */
export type CombatYesNo = {
  id: number;
  title: string;
  body?: string;
  yesLabel: string;
  noLabel: string;
  /** Bot\u00f3n con el foco al abrir (sugerencia; decide quien juega). */
  suggestYes?: boolean;
  resolve: (yes: boolean) => void;
};

let queue: CombatYesNo[] = [];
let seq = 0;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export const subscribeCombatPrompts = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getCombatPrompts = (): CombatYesNo[] => queue;

/** El host se registra al montarse (si no hay ninguno, se usa window.confirm). */
export function registerCombatPromptHost(): () => void {
  hosts += 1;
  return () => {
    hosts = Math.max(0, hosts - 1);
    // Sin host: las preguntas pendientes cuentan como No (no se queda colgada la acci\u00f3n).
    if (hosts === 0) for (const prompt of [...queue]) prompt.resolve(false);
  };
}

export function askCombatYesNo(options: Omit<CombatYesNo, 'id' | 'resolve'>): Promise<boolean> {
  if (hosts === 0) {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return Promise.resolve(window.confirm([options.title, options.body].filter(Boolean).join('\n\n')));
  }
  return new Promise(resolve => {
    const id = ++seq;
    let done = false;
    queue = [...queue, {
      ...options,
      id,
      resolve: yes => {
        if (done) return;
        done = true;
        queue = queue.filter(prompt => prompt.id !== id);
        emit();
        resolve(yes);
      },
    }];
    emit();
  });
}
