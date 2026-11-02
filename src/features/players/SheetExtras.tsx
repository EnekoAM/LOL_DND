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

type EntryValues = { name: string; description: string; reward: string };

type EntryFormProps = {
  initial?: Partial<EntryValues>;
  namePlaceholder: string;
  descPlaceholder: string;
  withReward?: boolean;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: EntryValues) => Promise<void>;
  onCancel: () => void;
};

/** Formulario común para añadir o editar quests/aumentos. */
const EntryForm = ({ initial, namePlaceholder, descPlaceholder, withReward, submitLabel, busy, onSubmit, onCancel }: EntryFormProps) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [reward, setReward] = useState(initial?.reward ?? '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    void onSubmit({ name: name.trim(), description: description.trim(), reward: reward.trim() });
  };
  return (
    <form className="sheet-add__form" onSubmit={submit}>
      <input className="sheet-add__input" placeholder={namePlaceholder} value={name} maxLength={80} autoFocus onChange={e => setName(e.target.value)} />
      <textarea className="sheet-add__input sheet-add__textarea" placeholder={descPlaceholder} value={description} maxLength={500} rows={2} onChange={e => setDescription(e.target.value)} />
      {withReward && (
        <input className="sheet-add__input" placeholder="Recompensa (opcional)" value={reward} maxLength={120} onChange={e => setReward(e.target.value)} />
      )}
      <div className="sheet-add__row">
        <button type="submit" className="sheet-quest__btn" disabled={busy || !name.trim()}>
          {busy ? 'Guardando…' : submitLabel}
        </button>
        <button type="button" className="sheet-quest__btn sheet-quest__btn--ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

const withOptional = <T extends { description?: string; reward?: string }>(base: T, values: EntryValues, withReward: boolean): T => {
  const next = { ...base };
  delete next.description;
  if (values.description) next.description = values.description;
  if (withReward) {
    delete next.reward;
    if (values.reward) next.reward = values.reward;
  }
  return next;
};

type QuestProps = {
  quests: PlayerQuest[];
  canEdit: boolean;
  /** Admin/editor: ve también las quests ocultas para players. */
  showHidden?: boolean;
  onChange: (quests: PlayerQuest[]) => Promise<void>;
};

/** Quests añadidas por el admin (la «Quest de top» va aparte, ligada a unlocks.questTop). */
export const QuestList = ({ quests, canEdit, showHidden = canEdit, onChange }: QuestProps) => {
  const { busy, error, save } = useListSave(onChange);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const add = async (values: EntryValues) => {
    const quest = withOptional<PlayerQuest>({ id: newId(), name: values.name, done: false }, values, true);
    if (await save([...quests, quest])) setAdding(false);
  };
  const edit = async (id: string, values: EntryValues) => {
    const next = quests.map(q => (q.id === id ? withOptional<PlayerQuest>({ ...q, name: values.name }, values, true) : q));
    if (await save(next)) setEditingId(null);
  };
  const toggle = (id: string) => void save(quests.map(q => (q.id === id ? { ...q, done: !q.done } : q)));
  const toggleHidden = (id: string) =>
    void save(
      quests.map(q => {
        if (q.id !== id) return q;
        const next = { ...q };
        if (q.hidden) delete next.hidden;
        else next.hidden = true;
        return next;
      }),
    );
  const visible = showHidden ? quests : quests.filter(q => !q.hidden);
  const remove = (quest: PlayerQuest) => {
    if (!window.confirm(`¿Quitar la quest «${quest.name}»?`)) return;
    void save(quests.filter(q => q.id !== quest.id));
  };

  return (
    <>
      {!canEdit && visible.length === 0 && <li className="calc-build-empty">Todavía no hay quests.</li>}
      {visible.map(quest =>
        editingId === quest.id ? (
          <li key={quest.id} className="sheet-add">
            <EntryForm
              initial={{ name: quest.name, description: quest.description ?? '', reward: quest.reward ?? '' }}
              namePlaceholder="Nombre de la quest"
              descPlaceholder="Descripción (opcional)"
              withReward
              submitLabel="Guardar"
              busy={busy}
              onSubmit={values => edit(quest.id, values)}
              onCancel={() => setEditingId(null)}
            />
          </li>
        ) : (
          <li key={quest.id} className={cx('sheet-quest', quest.done && 'sheet-quest--done', quest.hidden && 'sheet-quest--hidden')}>
            <span className="sheet-quest__mark" aria-hidden="true">{quest.done ? '✔' : '◇'}</span>
            <div className="sheet-quest__body">
              <div className="sheet-quest__name">
                {quest.name}
                {quest.hidden && <span className="sheet-quest__tag">Oculta para players</span>}
              </div>
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
                  className="sheet-quest__btn"
                  disabled={busy}
                  title={quest.hidden ? 'Los players no la ven' : 'Los players la ven'}
                  aria-pressed={!quest.hidden}
                  onClick={() => toggleHidden(quest.id)}
                >
                  {quest.hidden ? '🚫 Oculta' : '👁 Visible'}
                </button>
                <button type="button" className="sheet-quest__btn" disabled={busy} title="Editar quest" onClick={() => setEditingId(quest.id)}>
                  ✎ Editar
                </button>
                <button type="button" className="sheet-quest__btn sheet-quest__btn--danger" disabled={busy} title="Quitar quest" aria-label={`Quitar ${quest.name}`} onClick={() => remove(quest)}>
                  ✕ Quitar
                </button>
              </div>
            ) : (
              <span className="sheet-quest__state">{quest.done ? 'Completada' : 'Pendiente'}</span>
            )}
          </li>
        ),
      )}
      {canEdit && quests.length === 0 && !adding && (
        <li className="sheet-hint">Las quests que añadas tendrán Editar y Quitar. Si el nombre incluye «top» (p. ej. «Quest de top»), al completarla se desbloquean los niveles 19 y 20.</li>
      )}
      {canEdit && (
        <li className="sheet-add">
          {adding ? (
            <EntryForm namePlaceholder="Nombre de la quest" descPlaceholder="Descripción (opcional)" withReward submitLabel="Añadir" busy={busy} onSubmit={add} onCancel={() => setAdding(false)} />
          ) : (
            <button type="button" className="sheet-add__open" onClick={() => setAdding(true)}>+ Añadir quest</button>
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
  /** Admin/editor: ve también los aumentos ocultos para players. */
  showHidden?: boolean;
  onChange: (aumentos: PlayerAumento[]) => Promise<void>;
};

export const AumentoList = ({ aumentos, canEdit, showHidden = canEdit, onChange }: AumentoProps) => {
  const { busy, error, save } = useListSave(onChange);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const add = async (values: EntryValues) => {
    const aumento = withOptional<PlayerAumento>({ id: newId(), name: values.name }, values, false);
    if (await save([...aumentos, aumento])) setAdding(false);
  };
  const edit = async (id: string, values: EntryValues) => {
    const next = aumentos.map(a => (a.id === id ? withOptional<PlayerAumento>({ ...a, name: values.name }, values, false) : a));
    if (await save(next)) setEditingId(null);
  };
  const toggleHidden = (id: string) =>
    void save(
      aumentos.map(a => {
        if (a.id !== id) return a;
        const next = { ...a };
        if (a.hidden) delete next.hidden;
        else next.hidden = true;
        return next;
      }),
    );
  const visible = showHidden ? aumentos : aumentos.filter(a => !a.hidden);
  const remove = (aumento: PlayerAumento) => {
    if (!window.confirm(`¿Quitar el aumento «${aumento.name}»?`)) return;
    void save(aumentos.filter(a => a.id !== aumento.id));
  };

  return (
    <ul className="sheet-quests">
      {visible.length === 0 && !canEdit && <li className="calc-build-empty">Todavía no hay aumentos.</li>}
      {aumentos.length === 0 && canEdit && !adding && (
        <li className="sheet-hint">Los aumentos que añadas tendrán Editar y Quitar.</li>
      )}
      {visible.map(aumento =>
        editingId === aumento.id ? (
          <li key={aumento.id} className="sheet-add">
            <EntryForm
              initial={{ name: aumento.name, description: aumento.description ?? '' }}
              namePlaceholder="Nombre del aumento"
              descPlaceholder="Efecto / descripción (opcional)"
              submitLabel="Guardar"
              busy={busy}
              onSubmit={values => edit(aumento.id, values)}
              onCancel={() => setEditingId(null)}
            />
          </li>
        ) : (
          <li key={aumento.id} className={cx('sheet-quest', 'sheet-aumento', aumento.hidden && 'sheet-quest--hidden')}>
            <span className="sheet-quest__mark" aria-hidden="true">✦</span>
            <div className="sheet-quest__body">
              <div className="sheet-quest__name">
                {aumento.name}
                {aumento.hidden && <span className="sheet-quest__tag">Oculto para players</span>}
              </div>
              {aumento.description && <div className="sheet-quest__desc">{aumento.description}</div>}
            </div>
            {canEdit && (
              <div className="sheet-quest__actions">
                <button
                  type="button"
                  className="sheet-quest__btn"
                  disabled={busy}
                  title={aumento.hidden ? 'Los players no lo ven' : 'Los players lo ven'}
                  aria-pressed={!aumento.hidden}
                  onClick={() => toggleHidden(aumento.id)}
                >
                  {aumento.hidden ? '🚫 Oculto' : '👁 Visible'}
                </button>
                <button type="button" className="sheet-quest__btn" disabled={busy} title="Editar aumento" onClick={() => setEditingId(aumento.id)}>
                  ✎ Editar
                </button>
                <button type="button" className="sheet-quest__btn sheet-quest__btn--danger" disabled={busy} title="Quitar aumento" aria-label={`Quitar ${aumento.name}`} onClick={() => remove(aumento)}>
                  ✕ Quitar
                </button>
              </div>
            )}
          </li>
        ),
      )}
      {canEdit && (
        <li className="sheet-add">
          {adding ? (
            <EntryForm namePlaceholder="Nombre del aumento" descPlaceholder="Efecto / descripción (opcional)" submitLabel="Añadir" busy={busy} onSubmit={add} onCancel={() => setAdding(false)} />
          ) : (
            <button type="button" className="sheet-add__open" onClick={() => setAdding(true)}>+ Añadir aumento</button>
          )}
        </li>
      )}
      {error && <li className="calc-build-error">{error}</li>}
    </ul>
  );
};