import { useEffect, useMemo, useState } from 'react';
import { useCanEdit } from '../../data/appRoleContext';
import type { Ability } from '../../data/champions';
import { useLiveRevision } from '../../data/live';
import {
  NPC_KINDS,
  createNpc,
  deleteNpc,
  emptyNpc,
  loadNpcs,
  npcKindIcon,
  npcKindLabel,
  sortNpcs,
  type Npc,
  type NpcKind,
} from '../../data/npcs';
import { cssVars } from '../../lib/cssVars';
import { cx } from '../../lib/cx';
import { matchesSearch } from '../../lib/text';
import { DEFAULT_DAMAGE_INPUTS, type DamageInputs } from '../calculos/damage';
import DamagePanel from '../calculos/DamagePanel';
import PickerCard from '../calculos/PickerCard';
import { regionColor } from '../habilidades/championStyle';
import NpcEditorModal from './NpcEditorModal';
import NpcSheet from './NpcSheet';
import '../calculos/Calculos.css';
import './Npcs.css';

type Filter = { search: string; kind: NpcKind | ''; type: string; region: string; onlyVisible: boolean };

const BASE_FILTER: Filter = { search: '', kind: '', type: '', region: '', onlyVisible: false };

const uniqueSorted = (values: string[]) =>
  [...new Set(values.map(v => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

/**
 * NPCs / Monstruos: grid como Campeones + ficha con habilidades libres (el admin añade las que quiera).
 */
const Npcs = () => {
  const canEdit = useCanEdit();
  const revision = useLiveRevision('npcs');
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(BASE_FILTER);
  const [creating, setCreating] = useState(false);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState<DamageInputs>(DEFAULT_DAMAGE_INPUTS);

  useEffect(() => {
    let active = true;
    loadNpcs()
      .then(next => {
        if (!active) return;
        setNpcs(sortNpcs(next));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los NPCs');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, canEdit]);

  // Players nunca ven un NPC oculto (p. ej. si el admin lo oculta en vivo).
  const visible = useMemo(() => (canEdit ? npcs : npcs.filter(n => n.visible)), [npcs, canEdit]);
  const selected = selectedId ? visible.find(n => n.id === selectedId) ?? null : null;
  const types = useMemo(() => uniqueSorted(visible.map(n => n.type)), [visible]);
  const regions = useMemo(() => uniqueSorted(visible.map(n => n.region)), [visible]);

  const shown = useMemo(
    () => visible.filter(n =>
      matchesSearch(n.name, filter.search) &&
      (!filter.kind || n.kind === filter.kind) &&
      (!filter.type || n.type === filter.type) &&
      (!filter.region || n.region === filter.region) &&
      (!filter.onlyVisible || n.visible)),
    [visible, filter],
  );

  const update = (patch: Partial<Filter>) => setFilter(prev => ({ ...prev, ...patch }));

  const replace = (saved: Npc) =>
    setNpcs(prev => sortNpcs(prev.some(n => n.id === saved.id) ? prev.map(n => (n.id === saved.id ? saved : n)) : [...prev, saved]));

  if (ability) {
    return (
      <div className="calc-root">
        <DamagePanel
          ability={ability}
          inputs={damageInputs}
          onInputsChange={patch => setDamageInputs(prev => ({ ...prev, ...patch }))}
          onBack={() => setAbility(null)}
        />
      </div>
    );
  }

  return (
    <div className={selected ? 'calc-root calc-root--sheet npc-root' : 'calc-root npc-root'}>
      <div className="calc-section-title">NPCs y Monstruos</div>

      {selected ? (
        <NpcSheet
          npc={selected}
          types={types}
          regions={regions}
          onBack={() => setSelectedId(null)}
          onChange={replace}
          onDelete={async npc => {
            await deleteNpc(npc.id);
            setNpcs(prev => prev.filter(n => n.id !== npc.id));
            setSelectedId(null);
          }}
          onSelectAbility={setAbility}
        />
      ) : (
        <>
          <div className="calc-champ-filters">
            <span className="search-clear-wrap">
              <input
                className="calc-input calc-champ-search"
                type="text"
                placeholder="Buscar NPC o monstruo..."
                value={filter.search}
                onChange={e => update({ search: e.target.value })}
              />
              {filter.search && (
                <button type="button" className="search-clear" aria-label="Borrar búsqueda" title="Borrar" onClick={() => update({ search: '' })}>×</button>
              )}
            </span>
            <select className="calc-select-dmg" value={filter.kind} onChange={e => update({ kind: e.target.value as NpcKind | '' })}>
              <option value="">Clase</option>
              {NPC_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.icon} {kind.label}</option>)}
            </select>
            <select className="calc-select-dmg" value={filter.type} onChange={e => update({ type: e.target.value })}>
              <option value="">Tipo</option>
              {types.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
            <select className="calc-select-dmg" value={filter.region} onChange={e => update({ region: e.target.value })}>
              <option value="">Región</option>
              {regions.map(region => <option key={region} value={region}>{region}</option>)}
            </select>
            {canEdit && (
              <button
                type="button"
                className={cx('calc-learned-toggle', filter.onlyVisible && 'calc-learned-toggle--on')}
                aria-pressed={filter.onlyVisible}
                title="Solo los visibles para players"
                onClick={() => update({ onlyVisible: !filter.onlyVisible })}
              >
                Visibles
              </button>
            )}
            {canEdit && (
              <button type="button" className="calc-learned-toggle calc-learned-toggle--on npc-new-btn" onClick={() => setCreating(true)}>
                + Nuevo
              </button>
            )}
          </div>

          {loadError && <p className="sheet-hp__error" role="alert">{loadError}</p>}

          <div className="calc-grid">
            {shown.map(npc => (
              <PickerCard key={npc.id} name={npc.name} className="calc-card--champ" onClick={() => setSelectedId(npc.id)}>
                <div className="calc-champ-card" style={cssVars({ '--champ-color': npc.kind === 'monstruo' ? '#8a1a1a' : regionColor(npc.region) })}>
                  <div className="calc-champ-card__portrait">
                    {npc.image ? <img src={npc.image} alt="" /> : <span aria-hidden="true">{npc.name.charAt(0)}</span>}
                  </div>
                  {canEdit && npc.visible && <div className="calc-champ-card__active">Visible</div>}
                  <div className="calc-champ-card__meta">
                    <span className="calc-champ-card__region">{npc.region || `NVL ${npc.level}`}</span>
                    <span className="calc-champ-card__role">{npcKindIcon(npc.kind)} {npc.type || npcKindLabel(npc.kind)}</span>
                  </div>
                  <div className="npc-card__abilities">
                    {npc.abilities.length === 0
                      ? 'Sin habilidades'
                      : `${npc.abilities.length} habilidad${npc.abilities.length === 1 ? '' : 'es'}`}
                  </div>
                </div>
              </PickerCard>
            ))}
          </div>

          {!loading && shown.length === 0 && (
            <div className="calc-champ-empty">
              <span aria-hidden="true">🐉</span>
              <p>{visible.length === 0 ? (canEdit ? 'Todavía no hay NPCs. Crea el primero con «+ Nuevo».' : 'Todavía no hay NPCs visibles.') : 'Ningún NPC encontrado'}</p>
            </div>
          )}
          {loading && npcs.length === 0 && !loadError && (
            <div className="calc-champ-empty"><p>Cargando NPCs…</p></div>
          )}
        </>
      )}

      {creating && (
        <NpcEditorModal
          title="Nuevo NPC / Monstruo"
          initial={emptyNpc(filter.kind || 'npc')}
          types={types}
          regions={regions}
          submitLabel="Crear"
          onClose={() => setCreating(false)}
          onSubmit={async input => {
            const saved = await createNpc(input);
            replace(saved);
            setCreating(false);
            // Directo a la ficha para añadirle habilidades.
            setSelectedId(saved.id);
          }}
        />
      )}
    </div>
  );
};

export default Npcs;
