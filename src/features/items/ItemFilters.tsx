import { ITEMS, STAT_KEYS } from '../../data/items';
import { NAMED_EFFECTS, NAMED_EFFECT_KIND_LABEL, baseNamedEffectId, findNamedEffect, groupNamedEffects, namedEffectName } from '../../data/namedEffects';
import { namedEffectOnHit, useNamedEffectDescriptions } from '../../data/namedEffectDescriptions';
import { ALL, SORT_RAREZA_COSTE, type ItemFilterState, type StockFilter } from './filters';
import { RARITIES } from './rarity';

type Props = {
  filters: ItemFilterState;
  resultCount: number;
  onChange: (patch: Partial<ItemFilterState>) => void;
};

/** Cuántos ítems tienen cada efecto: por id guardado (variante) y por id base (todas sus variantes). */
const effectCounts = () => {
  const counts = new Map<string, number>();
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const item of ITEMS) {
    const ids = item.namedEffects ?? [];
    for (const id of ids) if (id.includes(':')) bump(id);
    for (const base of new Set(ids.map(baseNamedEffectId))) bump(base);
  }
  return counts;
};

const ItemFilters = ({ filters, resultCount, onChange }: Props) => {
  const counts = effectCounts();
  const effectData = useNamedEffectDescriptions();
  const kindMatches = (effect: (typeof NAMED_EFFECTS)[number]) => {
    if (filters.effectKind === ALL) return true;
    if (filters.effectKind === 'onHit') {
      return [effect.id, ...(effect.variants ?? []).map(variant => `${effect.id}:${variant.key}`)].some(id => namedEffectOnHit(effectData, id));
    }
    return effect.kind === filters.effectKind;
  };
  const present = NAMED_EFFECTS.filter(effect => counts.has(effect.id) && kindMatches(effect));
  const selected = filters.effect !== ALL && !counts.has(filters.effect) ? filters.effect : undefined;
  return (
  <div className="items-filters">
    <div className="filter-group">
      <label className="filter-label">Atributo</label>
      <select className="filter-select" value={filters.stat} onChange={e => onChange({ stat: e.target.value })}>
        <option value={ALL}>Todos</option>
        {STAT_KEYS.map(stat => (
          <option key={stat} value={stat}>{stat}</option>
        ))}
      </select>
    </div>

    <div className="filter-group">
      <label className="filter-label">Stock</label>
      <select
        className="filter-select"
        value={filters.stock}
        onChange={e => onChange({ stock: e.target.value as StockFilter })}
      >
        <option value={ALL}>Todos</option>
        <option value="owned">Tienen</option>
        <option value="in">Disponibles</option>
        <option value="out">No disponibles</option>
      </select>
    </div>

    <div className="filter-group">
      <label className="filter-label">Rareza</label>
      <select className="filter-select" value={filters.rarity} onChange={e => onChange({ rarity: e.target.value })}>
        <option value={ALL}>Todas</option>
        {RARITIES.map(rarity => (
          <option key={rarity} value={rarity}>{rarity}</option>
        ))}
      </select>
    </div>

    <div className="filter-group">
      <label className="filter-label">Tipo de efecto</label>
      <select
        className="filter-select"
        value={filters.effectKind}
        onChange={e => {
          const effectKind = e.target.value as ItemFilterState['effectKind'];
          const keep = filters.effect === ALL || effectKind === ALL
            || (effectKind === 'onHit' ? namedEffectOnHit(effectData, filters.effect) : findNamedEffect(filters.effect)?.kind === effectKind);
          onChange(keep ? { effectKind } : { effectKind, effect: ALL });
        }}
      >
        <option value={ALL}>Activas y pasivas</option>
        <option value="active">{NAMED_EFFECT_KIND_LABEL.active}s</option>
        <option value="passive">{NAMED_EFFECT_KIND_LABEL.passive}s</option>
        <option value="onHit">Al impactar</option>
      </select>
    </div>

    <div className="filter-group">
      <label className="filter-label">Efecto</label>
      <select className="filter-select" value={filters.effect} onChange={e => onChange({ effect: e.target.value })}>
        <option value={ALL}>Todos</option>
        {selected && <option value={selected}>{namedEffectName(selected)} (0)</option>}
        {groupNamedEffects(present).map(group => (
          <optgroup key={group.key} label={group.label}>
            {group.effects.map(effect => [
              <option key={effect.id} value={effect.id}>{effect.name}{effect.exclusive ? ' ★' : ''} ({counts.get(effect.id)}){effect.variants?.length ? ' · todas' : ''}</option>,
              ...(effect.variants ?? [])
                .filter(variant => counts.has(`${effect.id}:${variant.key}`))
                .map(variant => (
                  <option key={`${effect.id}:${variant.key}`} value={`${effect.id}:${variant.key}`}>{'\u00a0\u00a0— '}{variant.name} ({counts.get(`${effect.id}:${variant.key}`)})</option>
                )),
            ])}
          </optgroup>
        ))}
      </select>
    </div>

    <div className="filter-group">
      <label className="filter-label">Ordenar</label>
      <select className="filter-select" value={filters.sort} onChange={e => onChange({ sort: e.target.value })}>
        <option value={SORT_RAREZA_COSTE}>Rareza / Coste</option>
        <option value="coste">Coste</option>
        <option value="rareza">Rareza</option>
        <option value="nombre">Nombre</option>
        {STAT_KEYS.map(stat => (
          <option key={stat} value={stat}>{stat}</option>
        ))}
      </select>
    </div>

    <div className="filter-group filter-group--search">
      <label className="filter-label">Buscar</label>
      <input
        className="filter-input"
        type="text"
        placeholder="Nombre del ítem..."
        value={filters.search}
        onChange={e => onChange({ search: e.target.value })}
      />
      {filters.search && (
        <button type="button" className="filter-search-clear" aria-label="Borrar búsqueda" title="Borrar" onClick={() => onChange({ search: '' })}>×</button>
      )}
    </div>

    <div className="items-count">
      <span className="items-count__num">{resultCount}</span>
      <span className="items-count__label">ítems</span>
    </div>
  </div>
  );
};

export default ItemFilters;
