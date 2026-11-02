import { useEffect, useState, type FormEvent } from 'react';
import {
  AUGMENT_LEVEL_COUNT,
  AUGMENT_LEVEL_EFFECT_MAX,
  augmentLevels,
  clampAugmentLevel,
  loadAugments,
  type Augment,
} from '../../data/augments';
import type { PlayerAumento, PlayerQuest } from '../../data/players';
import AugmentLevelList, { AugmentLevelBadge } from '../aumentos/AugmentLevels';

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

type AumentoValues = {
  name: string;
  description: string;
  catalogId: string;
  leveled: boolean;
  levels: string[];
  level: number;
};

const emptyLevels = (): string[] => Array.from({ length: AUGMENT_LEVEL_COUNT }, () => '');

const aumentoValues = (aumento?: PlayerAumento): AumentoValues => ({
  name: aumento?.name ?? '',
  description: aumento?.description ?? '',
  catalogId: aumento?.catalogId ?? '',
  leveled: Boolean(aumento?.levels),
  levels: aumento?.levels ? [...aumento.levels] : emptyLevels(),
  level: clampAugmentLevel(aumento?.level),
});

/** Monta el aumento de la ficha a partir del formulario (sin claves vacías). */
const buildAumento = (base: PlayerAumento, values: AumentoValues): PlayerAumento => {
  const next: PlayerAumento = { ...base, name: values.name };
  delete next.description;
  delete next.catalogId;
  delete next.levels;
  delete next.level;
  if (values.description) next.description = values.description;
  if (values.catalogId) next.catalogId = values.catalogId;
  if (values.leveled) {
    next.levels = values.levels.map(t => t.trim());
    next.level = clampAugmentLevel(values.level);
  }
  return next;
};

type AumentoFormProps = {
  initial?: PlayerAumento;
  /** Al añadir: permite copiar un aumento del catálogo (nombre, efecto y niveles). */
  withCatalog?: boolean;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: AumentoValues) => Promise<void>;
  onCancel: () => void;
};

/** Formulario de aumento de la ficha: un solo efecto o niveles propios (1, 2 y 3) con su nivel actual. */
const AumentoForm = ({ initial, withCatalog, submitLabel, busy, onSubmit, onCancel }: AumentoFormProps) => {
  const [values, setValues] = useState<AumentoValues>(() => aumentoValues(initial));
  const [catalog, setCatalog] = useState<Augment[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const set = (patch: Partial<AumentoValues>) => setValues(current => ({ ...current, ...patch }));

  useEffect(() => {
    if (!withCatalog) return;
    let active = true;
    loadAugments()
      .then(list => { if (active) setCatalog([...list].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))); })
      .catch((err: unknown) => { if (active) setCatalogError(errorText(err)); });
    return () => { active = false; };
  }, [withCatalog]);

  const pickCatalog = (id: string) => {
    const augment = catalog?.find(a => a.id === id);
    if (!augment) {
      set({ catalogId: '' });
      return;
    }
    setValues({
      name: augment.name,
      description: augment.description,
      catalogId: augment.id,
      leveled: Boolean(augment.levels),
      levels: augment.levels ? [...augment.levels] : emptyLevels(),
      level: 1,
    });
  };

  const levelsMissing = values.leveled && values.levels.some(t => !t.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!values.name.trim() || levelsMissing || busy) return;
    void onSubmit({ ...values, name: values.name.trim(), description: values.description.trim() });
  };

  return (
    <form className="sheet-add__form" onSubmit={submit}>
      {withCatalog && (
        <select
          className="sheet-add__input"
          value={values.catalogId}
          disabled={!catalog}
          onChange={e => pickCatalog(e.target.value)}
        >
          <option value="">{catalog ? 'Del catálogo… (o escríbelo a mano)' : catalogError ? 'Catálogo no disponible' : 'Cargando catálogo…'}</option>
          {catalog?.map(a => (
            <option key={a.id} value={a.id}>{a.name}{a.levels ? ' (niveles 1–3)' : ''}</option>
          ))}
        </select>
      )}
      <input className="sheet-add__input" placeholder="Nombre del aumento" value={values.name} maxLength={80} autoFocus onChange={e => set({ name: e.target.value })} />
      <textarea
        className="sheet-add__input sheet-add__textarea"
        placeholder={values.leveled ? 'Descripción general (opcional)' : 'Efecto / descripción (opcional)'}
        value={values.description}
        maxLength={500}
        rows={2}
        onChange={e => set({ description: e.target.value })}
      />
      <label className="sheet-add__check" title="Niveles del propio aumento, aparte del nivel del player">
        <input type="checkbox" checked={values.leveled} onChange={e => set({ leveled: e.target.checked })} />
        Con niveles (1, 2 y 3)
      </label>
      {values.leveled && (
        <>
          {values.levels.map((effect, index) => (
            <textarea
              key={index}
              className="sheet-add__input sheet-add__textarea"
              placeholder={`Efecto nivel ${index + 1}`}
              aria-label={`Efecto nivel ${index + 1}`}
              value={effect}
              maxLength={AUGMENT_LEVEL_EFFECT_MAX}
              rows={2}
              onChange={e => set({ levels: values.levels.map((t, i) => (i === index ? e.target.value : t)) })}
            />
          ))}
          <label className="sheet-add__check">
            Nivel actual del aumento
            <select className="sheet-add__input sheet-add__select" value={values.level} onChange={e => set({ level: Number(e.target.value) })}>
              {Array.from({ length: AUGMENT_LEVEL_COUNT }, (_, i) => i + 1).map(n => <option key={n} value={n}>Nivel {n}</option>)}
            </select>
          </label>
        </>
      )}
      <div className="sheet-add__row">
        <button type="submit" className="sheet-quest__btn" disabled={busy || !values.name.trim() || levelsMissing}>
          {busy ? 'Guardando…' : submitLabel}
        </button>
        <button type="button" className="sheet-quest__btn sheet-quest__btn--ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

export const AumentoList = ({ aumentos, canEdit, showHidden = canEdit, onChange }: AumentoProps) => {
  const { busy, error, save } = useListSave(onChange);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const add = async (values: AumentoValues) => {
    if (await save([...aumentos, buildAumento({ id: newId(), name: values.name }, values)])) setAdding(false);
  };
  const edit = async (id: string, values: AumentoValues) => {
    const next = aumentos.map(a => (a.id === id ? buildAumento(a, values) : a));
    if (await save(next)) setEditingId(null);
  };
  /** Sube o baja el nivel del aumento (1-3), aparte del nivel del player. */
  const shiftLevel = (id: string, delta: number) =>
    void save(aumentos.map(a => (a.id === id && a.levels ? { ...a, level: clampAugmentLevel(clampAugmentLevel(a.level) + delta) } : a)));
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
        <li className="sheet-hint">Los aumentos que añadas tendrán Editar y Quitar. Los que tienen niveles empiezan en nivel 1 y se suben desde aquí.</li>
      )}
      {visible.map(aumento => {
        if (editingId === aumento.id) {
          return (
            <li key={aumento.id} className="sheet-add">
              <AumentoForm
                initial={aumento}
                submitLabel="Guardar"
                busy={busy}
                onSubmit={values => edit(aumento.id, values)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          );
        }
        const levels = augmentLevels(aumento.levels);
        const level = clampAugmentLevel(aumento.level);
        return (
          <li key={aumento.id} className={cx('sheet-quest', 'sheet-aumento', aumento.hidden && 'sheet-quest--hidden')}>
            <span className="sheet-quest__mark" aria-hidden="true">✦</span>
            <div className="sheet-quest__body">
              <div className="sheet-quest__name">
                {aumento.name}
                {levels && <AugmentLevelBadge current={level} />}
                {aumento.hidden && <span className="sheet-quest__tag">Oculto para players</span>}
              </div>
              {aumento.description && <div className="sheet-quest__desc">{aumento.description}</div>}
              {levels && <AugmentLevelList levels={levels} current={level} />}
            </div>
            {canEdit && (
              <div className="sheet-quest__actions">
                {levels && (
                  <>
                    <button
                      type="button"
                      className="sheet-quest__btn"
                      disabled={busy || level <= 1}
                      title="Bajar un nivel el aumento"
                      aria-label={`Bajar nivel de ${aumento.name}`}
                      onClick={() => shiftLevel(aumento.id, -1)}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="sheet-quest__btn"
                      disabled={busy || level >= AUGMENT_LEVEL_COUNT}
                      title="Subir un nivel el aumento (no el player)"
                      onClick={() => shiftLevel(aumento.id, 1)}
                    >
                      {level >= AUGMENT_LEVEL_COUNT ? 'Nivel máx.' : `▲ Subir a nivel ${level + 1}`}
                    </button>
                  </>
                )}
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
        );
      })}
      {canEdit && (
        <li className="sheet-add">
          {adding ? (
            <AumentoForm withCatalog submitLabel="Añadir" busy={busy} onSubmit={add} onCancel={() => setAdding(false)} />
          ) : (
            <button type="button" className="sheet-add__open" onClick={() => setAdding(true)}>+ Añadir aumento</button>
          )}
        </li>
      )}
      {error && <li className="calc-build-error">{error}</li>}
    </ul>
  );
};
