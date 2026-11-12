import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import EffectBonusEditor from './EffectBonusEditor';
import { AreaGridEditor, AreaGridView } from '../../components/AreaGrid';
import type { AreaPattern } from '../../data/areaPattern';
import { configTimingText } from '../../data/effectBonus';
import { useAppRole } from '../../data/appRoleContext';
import { ITEMS } from '../../data/items';
import { useLiveRevision } from '../../data/live';
import {
  NAMED_EFFECTS,
  NAMED_EFFECT_KIND_LABEL,
  baseNamedEffectId,
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
  /** Resumen de la wiki (solo de ayuda; no se guarda). */
  hint?: string;
};

const rowsOf = (effect: NamedEffect): Row[] => [
  { id: effect.id, name: effect.name, en: effect.en, kind: effect.kind, exclusive: effect.exclusive, shared: effect.shared, variant: false, hint: effect.description },
  ...(effect.variants ?? []).map(variant => ({
    id: `${effect.id}:${variant.key}`,
    name: variant.name,
    en: `${effect.en} (${variant.key})`,
    kind: effect.kind,
    exclusive: effect.exclusive,
    shared: effect.shared,
    variant: true,
    hint: variant.description,
  })),
];

const ALL_ROWS: Row[] = NAMED_EFFECTS.flatMap(rowsOf);

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
  const counts = useMemo(itemCounts, [itemsRevision]);
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

  const rows = useMemo(() => {
    const visible = ALL_ROWS.filter(row =>
      (kind === 'all' || row.kind === kind) &&
      (!onlyUsed || counts.has(row.id)) &&
      (!onlyOnHit || namedEffectOnHit(effectData, row.id)) &&
      (!onlyBonus || (namedEffectBonus(effectData, row.id)?.rules.length ?? 0) > 0) &&
      (!search.trim() || matchesSearch(row.name, search) || matchesSearch(row.en, search) || matchesSearch(descriptions[row.id] ?? '', search)),
    );
    // Si una variante coincide, se enseña también su efecto base (como cabecera).
    const ids = new Set(visible.map(row => row.id));
    for (const row of visible) if (row.variant) ids.add(baseNamedEffectId(row.id));
    return ALL_ROWS.filter(row => ids.has(row.id));
  }, [search, kind, onlyUsed, onlyOnHit, onlyBonus, counts, descriptions, effectData]);

  const kindCounts = useMemo(() => ({
    active: NAMED_EFFECTS.filter(effect => effect.kind === 'active').length,
    passive: NAMED_EFFECTS.filter(effect => effect.kind === 'passive').length,
  }), []);

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
              </tr>
              {open.has(areaKey) && (
                <tr className="effects-table__bonus-row">
                  <td colSpan={9}>
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
                  <td colSpan={9}>
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
