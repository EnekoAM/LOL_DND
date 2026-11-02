import { useState, type FormEvent } from 'react';
import type { PlayerAumento, PlayerQuest } from '../../data/players';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'No se pudo guardar');

/** Guarda la lista entera y deja el error a la vista del panel. */
function useListSave<T>(onChange: (items: T[]) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (next: T[]): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await onChange(next);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}

type QuestProps = {
  quests: PlayerQuest[];
  canEdit: boolean;
  onChange: (quests: PlayerQuest[]) => Promise<void>;
};

/** Quests añadidas por el admin (la «Quest de top» va aparte, ligada a unlocks.questTop). */
export const QuestList = ({ quests, canEdit, onChange }: QuestProps) => {
  const { busy, error, save } = useListSave(onChange);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
    setReward('');
    setAdding(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    const quest: PlayerQuest = { id: newId(), name: trimmed, done: false };
    if (description.trim()) quest.description = description.trim();
    if (reward.trim()) quest.reward = reward.trim();
    if (await save([...quests, quest])) reset();
  };

  const toggle = (id: string) =>
    void save(quests.map(q => (q.id === id ? { ...q, done: !q.done } : q)));
  const remove = (quest: PlayerQuest) => {
    if (!window.confirm(`¿Borrar la quest «${quest.name}»?`)) return;
    void save(quests.filter(q => q.id !== quest.id));
  };

  return (
    <>
      {quests.map(quest => (
        <li key={quest.id} className={cx('sheet-quest', quest.done && 'sheet-quest--done')}>
          <span className="sheet-quest__mark" aria-hidden="true">{quest.done ? '✔' : '◇'}</span>
          <div className="sheet-quest__body">
            <div className="sheet-quest__name">{quest.name}</div>
            {quest.description && <div className="sheet-quest__desc">{quest.description}</div>}
            {quest.reward && <div className="sheet-quest__reward">Recompensa: {quest.reward}</div>}
          </div>
          {canEdit ? (
            <div className="sheet-quest__actions">
              <button type="button" className="sheet-quest__btn" disabled={busy} onClick={() => toggle(quest.id)}>
                {quest.done ? 'Marcar pendiente' : 'Marcar completada'}
              </button>
              <button
                type="button"
                className="sheet-quest__btn sheet-quest__btn--danger"
                disabled={busy}
                title="Borrar quest"
                aria-label={`Borrar ${quest.name}`}
                onClick={() => remove(quest)}
              >
                ✕
              </button>
            </div>
          ) : (
            <span className="sheet-quest__state">{quest.done ? 'Completada' : 'Pendiente'}</span>
          )}
        </li>
      ))}
      {canEdit && (
        <li className="sheet-add">
          {adding ? (
            <form className="sheet-add__form" onSubmit={event => void submit(event)}>
              <input
                className="sheet-add__input"
                placeholder="Nombre de la quest"
                value={name}
                maxLength={80}
                autoFocus
                onChange={event => setName(event.target.value)}
              />
              <textarea
                className="sheet-add__input sheet-add__textarea"
                placeholder="Descripción (opcional)"
                value={description}
                maxLength={500}
                rows={2}
                onChange={event => setDescription(event.target.value)}
              />
              <input
                className="sheet-add__input"
                placeholder="Recompensa (opcional)"
                value={reward}
                maxLength={120}
                onChange={event => setReward(event.target.value)}
              />
              <div className="sheet-add__row">
                <button type="submit" className="sheet-quest__btn" disabled={busy || !name.trim()}>
                  {busy ? 'Guardando…' : 'Añadir'}
                </button>
                <button type="button" className="sheet-quest__btn sheet-quest__btn--ghost" disabled={busy} onClick={reset}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="sheet-add__open" onClick={() => setAdding(true)}>
              + Añadir quest
            </button>
          )}
        </li>
      )}
      {error && <li className="calc-build-error">{error}</li>}
    </>
  );
};

type AumentoProps = {
  aumentos: PlayerAumento[];
  canEdit: boolean;
  onChange: (aumentos: PlayerAumento[]) => Promise<void>;
};

export const AumentoList = ({ aumentos, canEdit, onChange }: AumentoProps) => {
  const { busy, error, save } = useListSave(onChange);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
    setAdding(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    const aumento: PlayerAumento = { id: newId(), name: trimmed };
    if (description.trim()) aumento.description = description.trim();
    if (await save([...aumentos, aumento])) reset();
  };

  const remove = (aumento: PlayerAumento) => {
    if (!window.confirm(`¿Borrar el aumento «${aumento.name}»?`)) return;
    void save(aumentos.filter(a => a.id !== aumento.id));
  };

  return (
    <ul className="sheet-quests">
      {aumentos.length === 0 && !canEdit && <li className="calc-build-empty">Todavía no hay aumentos.</li>}
      {aumentos.map(aumento => (
        <li key={aumento.id} className="sheet-quest sheet-aumento">
          <span className="sheet-quest__mark" aria-hidden="true">✦</span>
          <div className="sheet-quest__body">
            <div className="sheet-quest__name">{aumento.name}</div>
            {aumento.description && <div className="sheet-quest__desc">{aumento.description}</div>}
          </div>
          {canEdit && (
            <button
              type="button"
              className="sheet-quest__btn sheet-quest__btn--danger"
              disabled={busy}
              title="Borrar aumento"
              aria-label={`Borrar ${aumento.name}`}
              onClick={() => remove(aumento)}
            >
              ✕
            </button>
          )}
        </li>
      ))}
      {canEdit && (
        <li className="sheet-add">
          {adding ? (
            <form className="sheet-add__form" onSubmit={event => void submit(event)}>
              <input
                className="sheet-add__input"
                placeholder="Nombre del aumento"
                value={name}
                maxLength={80}
                autoFocus
                onChange={event => setName(event.target.value)}
              />
              <textarea
                className="sheet-add__input sheet-add__textarea"
                placeholder="Efecto / descripción (opcional)"
                value={description}
                maxLength={500}
                rows={2}
                onChange={event => setDescription(event.target.value)}
              />
              <div className="sheet-add__row">
                <button type="submit" className="sheet-quest__btn" disabled={busy || !name.trim()}>
                  {busy ? 'Guardando…' : 'Añadir'}
                </button>
                <button type="button" className="sheet-quest__btn sheet-quest__btn--ghost" disabled={busy} onClick={reset}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="sheet-add__open" onClick={() => setAdding(true)}>
              + Añadir aumento
            </button>
          )}
        </li>
      )}
      {error && <li className="calc-build-error">{error}</li>}
    </ul>
  );
};
