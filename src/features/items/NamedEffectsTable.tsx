import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import EffectBonusEditor from './EffectBonusEditor';
import { AreaGridEditor, AreaGridView } from '../../components/AreaGrid';
import type { AreaPattern } from '../../data/areaPattern';
import { configTimingText } from '../../data/effectBonus';
import { useAppRole } from '../../data/appRoleContext';
import { ITEMS } from '../../data/items';
import { useLiveRevision } from '../../data/live';
import {
  ALL_NAMED_EFFECTS,
  NAMED_EFFECT_KIND_LABEL,
  baseNamedEffectId,
  findNamedEffect,
  namedEffectName,
  type NamedEffect,
  type NamedEffectKind,
} from '../../data/namedEffects';
import {
  NAMED_EFFECT_DESCRIPTION_MAX,
  namedEffectArea,
  namedEffectBonus,
  namedEffectOnHit,
  saveNamedEffectData,
  saveNamedEffectDescription,
  useNamedEffectDescriptions,
  assignNamedEffect,
  createNamedEffect,
  deleteNamedEffect,
  updateNamedEffect,
  type NamedEffectData,
} from '../../data/namedEffectDescriptions';
import { matchesSearch } from '../../lib/text';
import { cx } from '../../lib/cx';

type Row = {
  id: string;
  name: string;
  en: string;
  kind: NamedEffectKind;
  exclusive: boolean;
  shared: boolean;
  variant: boolean;
  /** Variante: etiqueta corta. */
  short?: string;
  /** Efecto base con variantes: el base tambien se puede elegir. */
  baseSelectable?: boolean;
  hasVariants: boolean;
  /** Resumen de la wiki (solo de ayuda; no se guarda). */
  hint?: string;
};

const rowsOf = (effect: NamedEffect): Row[] => [
  { id: effect.id, name: effect.name, en: effect.en, kind: effect.kind, exclusive: effect.exclusive, shared: effect.shared, variant: false, baseSelectable: effect.baseSelectable === true, hasVariants: (effect.variants?.length ?? 0) > 0, hint: effect.description },
  ...(effect.variants ?? []).map(variant => ({
    id: `${effect.id}:${variant.key}`,
    name: variant.name,
    en: `${effect.en} (${variant.key})`,
    kind: effect.kind,
    exclusive: effect.exclusive,
    shared: effect.shared,
    variant: true,
    short: variant.short,
    hasVariants: false,
    hint: variant.description,
  })),
];

/** Id a partir de un nombre: minusculas sin tildes, numeros y guiones. */
const slugify = (text: string, max: number): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');

const errorText = (caught: unknown): string => caught instanceof Error ? caught.message : 'No se pudo guardar';

/** Formulario (admin) para crear un efecto con nombre nuevo. */
const NewEffectForm = () => {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [kind, setKind] = useState<NamedEffectKind>('passive');
  const [exclusive, setExclusive] = useState(false);
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const finalId = idTouched ? id : slugify(name, 60);

  const submit = async () => {
    setError(null);
    setDone(null);
    const cleanName = name.trim();
    if (!cleanName) { setError('Pon un nombre'); return; }
    if (!/^[a-z0-9-]{1,60}$/.test(finalId)) { setError('Id no v\u00e1lido: solo min\u00fasculas, n\u00fameros y guiones'); return; }
    if (findNamedEffect(finalId)) { setError('Ya existe un efecto con ese id'); return; }
    setSaving(true);
    try {
      await createNamedEffect({ id: finalId, name: cleanName, kind, exclusive, shared });
      setDone(`Creado \u00ab${cleanName}\u00bb`);
      setName('');
      setId('');
      setIdTouched(false);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!show) {
    return (
      <div className="effects-new">
        <button type="button" className="effects-manage__btn effects-manage__btn--add" onClick={() => setShow(true)}>+ Nuevo efecto</button>
        {done && <span className="effects-new__ok">{done}</span>}
      </div>
    );
  }
  return (
    <div className="effects-new effects-new--open">
      <label className="effects-new__field">
        <span>Nombre</span>
        <input className="filter-input" type="text" value={name} maxLength={80} placeholder={'Ej.: Furia arcana'} onChange={e => setName(e.target.value)} />
      </label>
      <label className="effects-new__field">
        <span>{'Id (autom\u00e1tico)'}</span>
        <input className="filter-input" type="text" value={finalId} maxLength={60} onChange={e => { setId(e.target.value); setIdTouched(true); }} />
      </label>
      <label className="effects-new__field">
        <span>Tipo</span>
        <select className="filter-select" value={kind} onChange={e => setKind(e.target.value as NamedEffectKind)}>
          <option value="passive">{NAMED_EFFECT_KIND_LABEL.passive}</option>
          <option value="active">{NAMED_EFFECT_KIND_LABEL.active}</option>
        </select>
      </label>
      <label className="effects-new__check">
        <input type="checkbox" checked={exclusive} onChange={e => setExclusive(e.target.checked)} />
        {'\u00danico (1 por build)'}
      </label>
      <label className="effects-new__check">
        <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
        {'Compartido (varios \u00edtems)'}
      </label>
      <button type="button" className="effects-manage__btn effects-manage__btn--add" disabled={saving} onClick={() => void submit()}>{saving ? 'Creando\u2026' : 'Crear'}</button>
      <button type="button" className="effects-manage__btn" disabled={saving} onClick={() => setShow(false)}>Cerrar</button>
      {error && <span className="effects-table__status effects-table__status--error">{error}</span>}
      {done && <span className="effects-new__ok">{done}</span>}
    </div>
  );
};

/** Formulario (admin) para crear una variante de un efecto (id `base:clave`). */
const NewVariantForm = ({ base, onDone }: { base: Row; onDone: () => void }) => {
  const [short, setShort] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = slugify(short || name, 30);
  const fullName = name.trim() || (short.trim() ? `${base.name} (${short.trim()})` : '');

  const submit = async () => {
    setError(null);
    if (!key || !fullName) { setError('Pon al menos la etiqueta corta'); return; }
    if (findNamedEffect(base.id)?.variants?.some(variant => variant.key === key)) { setError('Ya hay una variante con esa clave'); return; }
    setSaving(true);
    try {
      await createNamedEffect({ id: `${base.id}:${key}`, name: fullName, short: short.trim() || fullName });
      onDone();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="effects-new effects-new--open">
      <strong className="effects-assign__title">{`Nueva variante de \u00ab${base.name}\u00bb`}</strong>
      <label className="effects-new__field">
        <span>Etiqueta corta</span>
        <input className="filter-input" type="text" value={short} maxLength={40} placeholder={'Ej.: MR'} onChange={e => setShort(e.target.value)} />
      </label>
      <label className="effects-new__field">
        <span>Nombre completo</span>
        <input className="filter-input" type="text" value={name} maxLength={80} placeholder={fullName || `${base.name} (\u2026)`} onChange={e => setName(e.target.value)} />
      </label>
      <span className="effects-assign__hint">{key ? `Id: ${base.id}:${key}` : ''}</span>
      <button type="button" className="effects-manage__btn effects-manage__btn--add" disabled={saving} onClick={() => void submit()}>{saving ? 'Creando\u2026' : 'Crear variante'}</button>
      <button type="button" className="effects-manage__btn" disabled={saving} onClick={onDone}>Cancelar</button>
      {error && <span className="effects-table__status effects-table__status--error">{error}</span>}
    </div>
  );
};

/** Formulario (admin) para editar un efecto (nombre, ingles, tipo, unico, compartido, base elegible) o una variante (nombre, etiqueta). */
const EditEffectForm = ({ row, onDone }: { row: Row; onDone: () => void }) => {
  const [name, setName] = useState(row.name);
  const [en, setEn] = useState(row.en);
  const [short, setShort] = useState(row.short ?? '');
  const [kind, setKind] = useState<NamedEffectKind>(row.kind);
  const [exclusive, setExclusive] = useState(row.exclusive);
  const [shared, setShared] = useState(row.shared);
  const [baseSelectable, setBaseSelectable] = useState(row.baseSelectable === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const cleanName = name.trim();
    if (!cleanName) { setError('Pon un nombre'); return; }
    setSaving(true);
    try {
      await updateNamedEffect(row.id, row.variant
        ? { name: cleanName, short: short.trim() || cleanName }
        : { name: cleanName, en: en.trim() || cleanName, kind, exclusive, shared, ...(row.hasVariants ? { baseSelectable } : {}) });
      onDone();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="effects-new effects-new--open">
      <strong className="effects-assign__title">{`Editar \u00ab${row.name}\u00bb (${row.id})`}</strong>
      <label className="effects-new__field">
        <span>Nombre</span>
        <input className="filter-input" type="text" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      </label>
      {row.variant ? (
        <label className="effects-new__field">
          <span>Etiqueta corta</span>
          <input className="filter-input" type="text" value={short} maxLength={40} onChange={e => setShort(e.target.value)} />
        </label>
      ) : (
        <>
          <label className="effects-new__field">
            <span>{'Ingl\u00e9s'}</span>
            <input className="filter-input" type="text" value={en} maxLength={80} onChange={e => setEn(e.target.value)} />
          </label>
          <label className="effects-new__field">
            <span>Tipo</span>
            <select className="filter-select" value={kind} onChange={e => setKind(e.target.value as NamedEffectKind)}>
              <option value="passive">{NAMED_EFFECT_KIND_LABEL.passive}</option>
              <option value="active">{NAMED_EFFECT_KIND_LABEL.active}</option>
            </select>
          </label>
          <label className="effects-new__check">
            <input type="checkbox" checked={exclusive} onChange={e => setExclusive(e.target.checked)} />
            {'\u00danico (1 por build)'}
          </label>
          <label className="effects-new__check">
            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
            {'Compartido (varios \u00edtems)'}
          </label>
          {row.hasVariants && (
            <label className="effects-new__check">
              <input type="checkbox" checked={baseSelectable} onChange={e => setBaseSelectable(e.target.checked)} />
              {'El base tambi\u00e9n se puede elegir'}
            </label>
          )}
        </>
      )}
      <button type="button" className="effects-manage__btn effects-manage__btn--add" disabled={saving} onClick={() => void submit()}>{saving ? 'Guardando\u2026' : 'Guardar'}</button>
      <button type="button" className="effects-manage__btn" disabled={saving} onClick={onDone}>Cancelar</button>
      {error && <span className="effects-table__status effects-table__status--error">{error}</span>}
    </div>
  );
};

/** Botones (admin) de una fila: editar, items, nueva variante, borrar. */
const ManageCell = ({ row, open, toggle }: { row: Row; open: Set<string>; toggle: (id: string) => void }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };
  const remove = () => run(async () => {
    const what = row.variant ? 'la variante' : 'el efecto';
    const extra = row.variant ? '' : ' y sus variantes';
    if (!window.confirm(`\u00bfBorrar ${what} \u00ab${row.name}\u00bb? Se borran tambi\u00e9n su descripci\u00f3n, bonus y \u00e1rea${extra}. Solo se recupera desde la copia de seguridad.`)) return;
    const result = await deleteNamedEffect(row.id);
    if (result && window.confirm(`\u00ab${row.name}\u00bb lo tienen ${result.inUse} \u00edtem(s). \u00bfQuit\u00e1rselo a todos y borrarlo?`)) await deleteNamedEffect(row.id, true);
  });
  // Todos los efectos viven en la BD: cualquiera se edita y se borra igual.
  const itemsKey = `items:${row.id}`;
  const editKey = `edit:${row.id}`;
  const variantKey = `variant:${row.id}`;
  return (
    <div className="effects-table__manage-buttons">
      <button type="button" className={cx('effects-manage__btn', open.has(editKey) && 'effects-manage__btn--on')} aria-expanded={open.has(editKey)} onClick={() => toggle(editKey)}>Editar</button>
      <button type="button" className={cx('effects-manage__btn', open.has(itemsKey) && 'effects-manage__btn--on')} aria-expanded={open.has(itemsKey)} onClick={() => toggle(itemsKey)}>{'\u00cdtems'}</button>
      {!row.variant && (
        <button type="button" className={cx('effects-manage__btn', open.has(variantKey) && 'effects-manage__btn--on')} onClick={() => toggle(variantKey)}>+ Variante</button>
      )}
      <button type="button" className="effects-manage__btn effects-manage__btn--danger" disabled={busy} onClick={() => void remove()}>Borrar</button>
      {error && <span className="effects-table__status effects-table__status--error">{error}</span>}
    </div>
  );
};

/** Panel (admin) de items de un efecto / variante: los que lo tienen (quitar) y buscador para ponerlo. */
const AssignRow = ({ row, onChanged }: { row: Row; onChanged: () => void }) => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = baseNamedEffectId(row.id);
  const effect = findNamedEffect(row.id);
  const holders = ITEMS.filter(item => item.namedEffects?.includes(row.id));
  const variantHolders = row.variant ? 0 : ITEMS.filter(item => item.namedEffects?.some(id => id !== row.id && baseNamedEffectId(id) === base)).length;
  const sameBase = (ids: string[] | undefined) => (ids ?? []).find(id => id !== row.id && baseNamedEffectId(id) === base);
  const matches = query.trim()
    ? ITEMS.filter(item => !item.namedEffects?.includes(row.id) && matchesSearch(item.nombre, query)).slice(0, 15)
    : [];

  const change = async (nombre: string, on: boolean) => {
    setBusy(nombre);
    setError(null);
    try {
      await assignNamedEffect(row.id, nombre, on);
      onChanged();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="effects-assign">
      <div className="effects-assign__col">
        <strong className="effects-assign__title">{`\u00cdtems con \u00ab${row.name}\u00bb (${holders.length})`}</strong>
        {holders.length === 0 && <p className="effects-assign__hint">{'Ning\u00fan \u00edtem lo tiene.'}</p>}
        {variantHolders > 0 && <p className="effects-assign__hint">{`Otros ${variantHolders} \u00edtem(s) tienen una variante: salen en la fila de cada variante.`}</p>}
        {!row.variant && (effect?.variants?.length ?? 0) > 0 && !effect?.baseSelectable && (
          <p className="effects-assign__hint">{'Este efecto tiene variantes: lo normal es asignar una variante.'}</p>
        )}
        <ul className="effects-assign__list">
          {holders.map(item => (
            <li key={item.nombre}>
              <span>{item.nombre}</span>
              <button type="button" className="effects-manage__btn effects-manage__btn--danger" disabled={busy !== null} onClick={() => void change(item.nombre, false)}>
                {busy === item.nombre ? '\u2026' : 'Quitar'}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="effects-assign__col">
        <strong className="effects-assign__title">{'A\u00f1adir a un \u00edtem'}</strong>
        <input className="filter-input" type="text" value={query} placeholder={'Buscar \u00edtem por nombre\u2026'} onChange={e => setQuery(e.target.value)} />
        <ul className="effects-assign__list">
          {matches.map(item => {
            const other = sameBase(item.namedEffects);
            return (
              <li key={item.nombre}>
                <span>
                  {item.nombre}
                  {other && <span className="effects-assign__note">{` (sustituye a ${namedEffectName(other)})`}</span>}
                </span>
                <button type="button" className="effects-manage__btn effects-manage__btn--add" disabled={busy !== null} onClick={() => void change(item.nombre, true)}>
                  {busy === item.nombre ? '\u2026' : 'A\u00f1adir'}
                </button>
              </li>
            );
          })}
          {query.trim() && matches.length === 0 && <li className="effects-assign__hint">Sin resultados</li>}
        </ul>
        {error && <span className="effects-table__status effects-table__status--error">{error}</span>}
      </div>
    </div>
  );
};

/** Ítems por id: el efecto base cuenta todas sus variantes; la variante, solo la suya. */
const itemCounts = (): Map<string, number> => {
  const counts = new Map<string, number>();
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const item of ITEMS) {
    const ids = item.namedEffects ?? [];
    for (const id of ids) if (id.includes(':')) bump(id);
    for (const base of new Set(ids.map(baseNamedEffectId))) bump(base);
  }
  return counts;
};

const DescriptionCell = memo(({ id, value, canEdit, hint }: { id: string; value: string; canEdit: boolean; hint?: string }) => {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Cambios de otra pestaña: solo si no se está editando aquí.
  useEffect(() => {
    if (!dirty) setDraft(value);
  }, [value, dirty]);

  if (!canEdit) {
    return value ? <p className="effects-table__text">{value}</p> : <span className="effects-table__empty">—</span>;
  }

  const save = async () => {
    if (!dirty || status === 'saving') return;
    if (draft.trim() === value.trim()) {
      setDirty(false);
      return;
    }
    setStatus('saving');
    setError(null);
    try {
      const saved = await saveNamedEffectDescription(id, draft);
      setDraft(saved);
      setDirty(false);
      setStatus('saved');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
      setStatus('idle');
    }
  };

  return (
    <div className="effects-table__edit">
      <textarea
        className="effects-table__textarea"
        rows={2}
        maxLength={NAMED_EFFECT_DESCRIPTION_MAX}
        value={draft}
        placeholder={hint ? `Wiki: ${hint}` : 'Sin descripción'}
        disabled={status === 'saving'}
        onChange={e => {
          setDraft(e.target.value);
          setDirty(true);
          setStatus('idle');
        }}
        onBlur={() => void save()}
      />
      <span className={cx('effects-table__status', error && 'effects-table__status--error')}>
        {error ?? (status === 'saving' ? 'Guardando…' : status === 'saved' ? 'Guardado' : dirty ? 'Sin guardar (se guarda al salir)' : '')}
      </span>
    </div>
  );
});

/** «Al impactar»: casilla (admin) o texto. Una variante sin valor propio hereda el del efecto base. */
const OnHitCell = ({ row, data, canEdit }: { row: Row; data: NamedEffectData; canEdit: boolean }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = namedEffectOnHit(data, row.id);
  const own = row.id in data.onHit;
  const inherited = row.variant && !own;

  if (!canEdit) {
    return <span className={value ? 'item-effect-badge' : 'effects-table__empty'}>{value ? 'Efecto de impacto' : '—'}</span>;
  }

  const save = async (onHit: boolean | null) => {
    setSaving(true);
    setError(null);
    try {
      await saveNamedEffectData(row.id, { onHit });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="effects-table__onhit">
      <label title={inherited ? 'Heredado del efecto base' : undefined}>
        <input type="checkbox" checked={value} disabled={saving} onChange={e => void save(e.target.checked)} />
        {inherited && <span className="effects-table__inherited">base</span>}
      </label>
      {row.variant && own && (
        <button type="button" className="effects-table__inherit" disabled={saving} title="Volver a heredar del efecto base" onClick={() => void save(null)}>heredar</button>
      )}
      {error && <span className="effects-table__status effects-table__status--error">{error}</span>}
    </div>
  );
};

/** Tabla de efectos con nombre y variantes con su descripción (la escribe el admin; el resto la lee). */
const NamedEffectsTable = () => {
  const { role } = useAppRole();
  const canEdit = role === 'admin';
  const effectData = useNamedEffectDescriptions();
  const descriptions = effectData.descriptions;
  const itemsRevision = useLiveRevision('items');
  const [itemsBump, setItemsBump] = useState(0);
  const counts = useMemo(itemCounts, [itemsRevision, itemsBump]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | NamedEffectKind>('all');
  const [onlyUsed, setOnlyUsed] = useState(false);
  const [onlyOnHit, setOnlyOnHit] = useState(false);
  const [onlyBonus, setOnlyBonus] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setOpen(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Se recalcula al recargar los datos (la lista de efectos llega de la BD con ellos).
  const allRows = useMemo(() => ALL_NAMED_EFFECTS.flatMap(rowsOf), [effectData]);
  const cols = canEdit ? 10 : 9;

  const rows = useMemo(() => {
    const visible = allRows.filter(row =>
      (kind === 'all' || row.kind === kind) &&
      (!onlyUsed || counts.has(row.id)) &&
      (!onlyOnHit || namedEffectOnHit(effectData, row.id)) &&
      (!onlyBonus || (namedEffectBonus(effectData, row.id)?.rules.length ?? 0) > 0) &&
      (!search.trim() || matchesSearch(row.name, search) || matchesSearch(row.en, search) || matchesSearch(descriptions[row.id] ?? '', search)),
    );
    // Si una variante coincide, se enseña también su efecto base (como cabecera).
    const ids = new Set(visible.map(row => row.id));
    for (const row of visible) if (row.variant) ids.add(baseNamedEffectId(row.id));
    return allRows.filter(row => ids.has(row.id));
  }, [allRows, search, kind, onlyUsed, onlyOnHit, onlyBonus, counts, descriptions, effectData]);

  const kindCounts = useMemo(() => ({
    active: ALL_NAMED_EFFECTS.filter(effect => effect.kind === 'active').length,
    passive: ALL_NAMED_EFFECTS.filter(effect => effect.kind === 'passive').length,
  }), [effectData]);

  return (
    <div className="effects-root">
      <div className="items-filters">
        <div className="filter-group filter-group--search">
          <label className="filter-label">Buscar</label>
          <input
            className="filter-input"
            type="text"
            placeholder="Nombre (ES/EN) o descripción..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="filter-search-clear" aria-label="Borrar búsqueda" title="Borrar" onClick={() => setSearch('')}>×</button>
          )}
        </div>
        <div className="filter-group">
          <label className="filter-label">Tipo</label>
          <select className="filter-select" value={kind} onChange={e => setKind(e.target.value as 'all' | NamedEffectKind)}>
            <option value="all">Activas y pasivas</option>
            <option value="active">{NAMED_EFFECT_KIND_LABEL.active}s ({kindCounts.active})</option>
            <option value="passive">{NAMED_EFFECT_KIND_LABEL.passive}s ({kindCounts.passive})</option>
          </select>
        </div>
        <label className="effects-table__toggle">
          <input type="checkbox" checked={onlyUsed} onChange={e => setOnlyUsed(e.target.checked)} />
          Solo con ítems
        </label>
        <label className="effects-table__toggle">
          <input type="checkbox" checked={onlyOnHit} onChange={e => setOnlyOnHit(e.target.checked)} />
          Efecto de impacto
        </label>
        <label className="effects-table__toggle">
          <input type="checkbox" checked={onlyBonus} onChange={e => setOnlyBonus(e.target.checked)} />
          Con bonus
        </label>
        <div className="items-count">
          <span className="items-count__num">{rows.length}</span>
          <span className="items-count__label">efectos</span>
        </div>
      </div>

      {!canEdit && <p className="item-edit__hint">Solo el admin puede escribir las descripciones.</p>}
      {canEdit && <NewEffectForm />}

      <div className="effects-table__wrap">
        <table className="effects-table">
          <thead>
            <tr>
              <th>Efecto</th>
              <th>Inglés</th>
              <th>Tipo</th>
              <th title="Solo un ítem con este efecto por build">★</th>
              <th>Ítems</th>
              <th title="Es un efecto de impacto (on-hit): lo aplican los AA y las habilidades con «Aplica efectos de impacto». Informativo / filtro; en combate mandan los disparadores de las reglas.">Efecto de impacto</th>
              <th>Descripción</th>
              <th title="Configurador de bonus: reglas en combate, CD y duración">Bonus</th>
              <th title="Tablero: usuario, objetivo y casillas donde hace efecto">Área</th>
              {canEdit && <th>Gestionar</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const config = namedEffectBonus(effectData, row.id);
              const ruleCount = config?.rules.length ?? 0;
              const timing = config ? configTimingText(config) : '';
              const area = namedEffectArea(effectData, row.id);
              const ownArea = effectData.area[row.id];
              const areaKey = `area:${row.id}`;
              return (
              <Fragment key={row.id}>
              <tr className={cx(row.variant && 'effects-table__variant')}>
                <td className="effects-table__name">{row.variant ? '— ' : ''}{row.name}</td>
                <td className="effects-table__en">{row.en}</td>
                <td>{NAMED_EFFECT_KIND_LABEL[row.kind]}</td>
                <td>{row.exclusive ? '★' : ''}</td>
                <td>{counts.get(row.id) ?? 0}</td>
                <td><OnHitCell row={row} data={effectData} canEdit={canEdit} /></td>
                <td className="effects-table__desc">
                  <DescriptionCell id={row.id} value={descriptions[row.id] ?? ''} canEdit={canEdit} hint={row.hint} />
                </td>
                <td className="effects-table__bonus">
                  <button type="button" className="bonus-toggle" onClick={() => toggle(row.id)} aria-expanded={open.has(row.id)}>
                    {open.has(row.id) ? '▾' : '▸'} {ruleCount ? `${ruleCount} regla${ruleCount === 1 ? '' : 's'}` : canEdit ? 'Configurar' : '—'}
                  </button>
                  {timing && <div className="effects-table__inherited">{timing}</div>}
                </td>
                <td className="effects-table__bonus">
                  <button type="button" className="bonus-toggle" onClick={() => toggle(areaKey)} aria-expanded={open.has(areaKey)} disabled={!canEdit && !area}>
                    {open.has(areaKey) ? '▾' : '▸'} {area ? `${area.tiles.length} casilla${area.tiles.length === 1 ? '' : 's'}` : canEdit ? 'Área' : '—'}
                  </button>
                  {area && !ownArea && <div className="effects-table__inherited">Heredada del base</div>}
                </td>
                {canEdit && (
                  <td className="effects-table__manage">
                    <ManageCell row={row} open={open} toggle={toggle} />
                  </td>
                )}
              </tr>
              {open.has(areaKey) && (
                <tr className="effects-table__bonus-row">
                  <td colSpan={cols}>
                    <AreaRow
                      own={ownArea}
                      inherited={row.variant ? effectData.area[baseNamedEffectId(row.id)] : undefined}
                      canEdit={canEdit}
                      onSave={next => saveNamedEffectData(row.id, { area: next })}
                    />
                  </td>
                </tr>
              )}
              {open.has(row.id) && (
                <tr className="effects-table__bonus-row">
                  <td colSpan={cols}>
                    <EffectBonusEditor
                      id={row.id}
                      own={effectData.bonus[row.id]}
                      inherited={row.variant ? effectData.bonus[baseNamedEffectId(row.id)] : undefined}
                      canEdit={canEdit}
                      onSave={bonus => saveNamedEffectData(row.id, { bonus })}
                    />
                  </td>
                </tr>
              )}
              {canEdit && open.has(`edit:${row.id}`) && (
                <tr className="effects-table__bonus-row">
                  <td colSpan={cols}>
                    <EditEffectForm key={`${row.name}|${row.en}|${row.kind}|${row.exclusive}|${row.shared}|${row.short ?? ''}|${row.baseSelectable ? 1 : 0}`} row={row} onDone={() => toggle(`edit:${row.id}`)} />
                  </td>
                </tr>
              )}
              {canEdit && open.has(`items:${row.id}`) && (
                <tr className="effects-table__bonus-row">
                  <td colSpan={cols}>
                    <AssignRow row={row} onChanged={() => setItemsBump(n => n + 1)} />
                  </td>
                </tr>
              )}
              {canEdit && !row.variant && open.has(`variant:${row.id}`) && (
                <tr className="effects-table__bonus-row">
                  <td colSpan={cols}>
                    <NewVariantForm base={row} onDone={() => toggle(`variant:${row.id}`)} />
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Fila desplegable del tablero de área de un efecto / variante (admin edita; el resto solo ve). */
function AreaRow({ own, inherited, canEdit, onSave }: {
  own: AreaPattern | undefined;
  inherited: AreaPattern | undefined;
  canEdit: boolean;
  onSave: (area: AreaPattern | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AreaPattern | null>(own ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(own ?? null); }, [own]);
  const dirty = JSON.stringify(draft ?? null) !== JSON.stringify(own ?? null);
  if (!canEdit) return <AreaGridView area={own ?? inherited} cellPx={14} caption={own ? undefined : 'Heredada del efecto base'} />;
  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(draft);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="bonus-editor">
      {!own && inherited && (
        <div className="bonus-editor__inherited">
          <p className="item-edit__hint">Sin área propia: usa la del efecto base. Dibuja una para sobrescribirla.</p>
          <AreaGridView area={inherited} cellPx={10} />
        </div>
      )}
      <AreaGridEditor value={draft} disabled={saving} onChange={next => { setDraft(next); setSaved(false); }} />
      <div className="bonus-editor__actions">
        <button type="button" className="bonus-toggle" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar área'}</button>
        <button type="button" className="bonus-toggle" disabled={saving || !dirty} onClick={() => setDraft(own ?? null)}>Deshacer cambios</button>
        {own && <button type="button" className="bonus-toggle" disabled={saving} onClick={() => setDraft(null)}>Quitar área</button>}
        {saved && !dirty && <span className="item-edit__hint">Guardado</span>}
        {error && <span className="item-edit__error">{error}</span>}
      </div>
    </div>
  );
}

export default NamedEffectsTable;
