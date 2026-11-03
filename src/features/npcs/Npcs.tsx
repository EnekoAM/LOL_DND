import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCanEdit } from '../../data/appRoleContext';
import type { Ability } from '../../data/champions';
import { useLiveRevision } from '../../data/live';
import { OPEN_RELATED_EVENT, peekPendingOpen, takePendingOpen, type RelationRef } from '../../data/relations';
import {
  NPC_KINDS,
  createNpc,
  deleteNpc,
  emptyNpc,
  loadNpcs,
  npcKindIcon,
  npcKindLabel,
  npcCircleFrame,
  npcImageStyle,
  sortNpcs,
  type Npc,
  type NpcKind,
} from '../../data/npcs';
import Pagination, { pageSlice } from '../../components/Pagination';
import { cssVars } from '../../lib/cssVars';
import { cx } from '../../lib/cx';
import { matchesSearch } from '../../lib/text';
import { DEFAULT_DAMAGE_INPUTS, type DamageInputs } from '../calculos/damage';
import DamagePanel from '../calculos/DamagePanel';
import PickerCard from '../calculos/PickerCard';
import { regionColor } from '../habilidades/championStyle';
import NpcEditorModal from './NpcEditorModal';
import NpcSheet from './NpcSheet';
import { NPCS_PATH, findNpcBySlug, npcSlugPath, npcUrl } from './npcRoute';
import '../calculos/Calculos.css';
import './Npcs.css';

/** '' = todos; visible / hidden = solo visibles / solo ocultos a los players (filtro de admin). */
type Visibility = '' | 'visible' | 'hidden';

type Filter = { search: string; kind: NpcKind | ''; type: string; region: string; visibility: Visibility };

const BASE_FILTER: Filter = { search: '', kind: '', type: '', region: '', visibility: '' };

/** Valor del filtro Tipo/Región para «Sin tipo» / «Sin región» (NPCs con ese campo vacío). */
const NONE = '__none__';
const matchesTag = (value: string, wanted: string) =>
  !wanted || (wanted === NONE ? !value.trim() : value === wanted);

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
  const navigate = useNavigate();
  // Ruta de la ficha abierta: /npcs/<región>/<tipo>/<nombre> (ver npcRoute.ts).
  const splat = useParams()['*'] ?? '';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Si se llegó desde «Relaciones» de otra ficha: id del NPC a abrir en cuanto esté cargada la lista.
  const [pendingId, setPendingId] = useState<string | null>(() => peekPendingOpen('npc'));
  // Se consume ya montada la pantalla (no en el inicializador, que StrictMode ejecuta dos veces).
  useEffect(() => {
    const id = takePendingOpen('npc');
    if (id) setPendingId(id);
  }, []);
  const [filter, setFilter] = useState<Filter>(BASE_FILTER);
  // Página del grid (50 por página); vuelve a 1 al cambiar filtros.
  const [page, setPage] = useState(1);
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

  // Relaciones dentro de la misma pantalla: abrir otro NPC.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const ref = (event as CustomEvent<RelationRef>).detail;
      if (ref?.kind !== 'npc') return;
      const id = takePendingOpen('npc');
      if (id) {
        setAbility(null);
        setPendingId(id);
      }
    };
    window.addEventListener(OPEN_RELATED_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_RELATED_EVENT, onOpen);
  }, []);

  // Players nunca ven un NPC oculto (p. ej. si el admin lo oculta en vivo).
  const visible = useMemo(() => (canEdit ? npcs : npcs.filter(n => n.visible)), [npcs, canEdit]);
  const selected = splat && selectedId ? visible.find(n => n.id === selectedId) ?? null : null;

  // URL -> ficha abierta. También corrige la URL si el NPC cambió de nombre, región o tipo.
  useEffect(() => {
    if (!splat) {
      setSelectedId(null);
      return;
    }
    if (loading) return;
    const current = selectedId ? visible.find(n => n.id === selectedId) : undefined;
    if (current && npcSlugPath(current, visible) === splat) return;
    const found = findNpcBySlug(visible, splat);
    if (found) {
      setSelectedId(found.id);
      if (npcSlugPath(found, visible) !== splat) navigate(npcUrl(found, visible), { replace: true });
      return;
    }
    if (current) {
      navigate(npcUrl(current, visible), { replace: true });
      return;
    }
    // No existe (o un player no puede verlo): a la lista.
    navigate(NPCS_PATH, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splat, visible, loading]);

  // Ficha pendiente desde «Relaciones»: se abre su URL cuando ya está la lista.
  useEffect(() => {
    if (!pendingId || loading) return;
    const npc = visible.find(n => n.id === pendingId);
    setPendingId(null);
    if (npc) navigate(npcUrl(npc, visible), { replace: true });
  }, [pendingId, visible, loading, navigate]);

  const openNpc = (npc: Npc, list: Npc[] = visible) => {
    setSelectedId(npc.id);
    navigate(npcUrl(npc, list));
  };
  const types = useMemo(() => uniqueSorted(visible.map(n => n.type)), [visible]);
  const regions = useMemo(() => uniqueSorted(visible.map(n => n.region)), [visible]);

  const shown = useMemo(
    () => visible.filter(n =>
      matchesSearch(n.name, filter.search) &&
      (!filter.kind || n.kind === filter.kind) &&
      matchesTag(n.type, filter.type) &&
      matchesTag(n.region, filter.region) &&
      (!filter.visibility || n.visible === (filter.visibility === 'visible'))),
    [visible, filter],
  );

  const pageItems = useMemo(() => pageSlice(shown, page), [shown, page]);

  const update = (patch: Partial<Filter>) => {
    setFilter(prev => ({ ...prev, ...patch }));
    setPage(1);
  };

  const replace = (saved: Npc) =>
    setNpcs(prev => sortNpcs(prev.some(n => n.id === saved.id) ? prev.map(n => (n.id === saved.id ? saved : n)) : [...prev, saved]));

  if (ability && canEdit) {
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
          onBack={() => navigate(NPCS_PATH)}
          onChange={replace}
          onDelete={async npc => {
            await deleteNpc(npc.id);
            setNpcs(prev => prev.filter(n => n.id !== npc.id));
            setSelectedId(null);
            navigate(NPCS_PATH, { replace: true });
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
            {canEdit && (
            <>
            <select className="calc-select-dmg" value={filter.kind} onChange={e => update({ kind: e.target.value as NpcKind | '' })}>
              <option value="">Clase</option>
              {NPC_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.icon} {kind.label}</option>)}
            </select>
            <select className="calc-select-dmg" value={filter.type} onChange={e => update({ type: e.target.value })}>
              <option value="">Tipo</option>
              <option value={NONE}>Sin tipo</option>
              {types.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
            <select className="calc-select-dmg" value={filter.region} onChange={e => update({ region: e.target.value })}>
              <option value="">Región</option>
              <option value={NONE}>Sin región</option>
              {regions.map(region => <option key={region} value={region}>{region}</option>)}
            </select>
            </>
            )}
            {canEdit && (
              <>
                <button
                  type="button"
                  className={cx('calc-learned-toggle', filter.visibility === 'visible' && 'calc-learned-toggle--on')}
                  aria-pressed={filter.visibility === 'visible'}
                  title="Solo los visibles para players"
                  onClick={() => update({ visibility: filter.visibility === 'visible' ? '' : 'visible' })}
                >
                  Visibles
                </button>
                <button
                  type="button"
                  className={cx('calc-learned-toggle', filter.visibility === 'hidden' && 'calc-learned-toggle--on')}
                  aria-pressed={filter.visibility === 'hidden'}
                  title="Solo los ocultos a los players"
                  onClick={() => update({ visibility: filter.visibility === 'hidden' ? '' : 'hidden' })}
                >
                  No visibles
                </button>
              </>
            )}
            {canEdit && (
              <button type="button" className="calc-learned-toggle calc-learned-toggle--on npc-new-btn" onClick={() => setCreating(true)}>
                + Nuevo
              </button>
            )}
          </div>

          {loadError && <p className="sheet-hp__error" role="alert">{loadError}</p>}

          <Pagination page={page} total={shown.length} onChange={setPage} />

          <div className="calc-grid">
            {pageItems.map(npc => (
              <PickerCard key={npc.id} name={npc.name} className="calc-card--champ" onClick={() => openNpc(npc)}>
                <div className="calc-champ-card" style={cssVars({ '--champ-color': npc.kind === 'monstruo' ? '#8a1a1a' : regionColor(npc.region) })}>
                  <div className="calc-champ-card__portrait">
                    {npc.image ? <img src={npc.image} alt="" style={npcImageStyle(npcCircleFrame(npc))} /> : <span aria-hidden="true">{npc.name.charAt(0)}</span>}
                  </div>
                  {canEdit && npc.visible && <div className="calc-champ-card__active">Visible</div>}
                  {/* Players: solo nombre y foto en la tarjeta; tipo, región, nivel y habilidades quedan ocultos. */}
                  {canEdit && (
                    <>
                      <div className="calc-champ-card__meta">
                        <span className="calc-champ-card__region">{npc.region || `NVL ${npc.level}`}</span>
                        <span className="calc-champ-card__role">{npcKindIcon(npc.kind)} {npc.type || npcKindLabel(npc.kind)}</span>
                      </div>
                      <div className="npc-card__abilities">
                        {npc.abilities.length === 0
                          ? 'Sin habilidades'
                          : `${npc.abilities.length} habilidad${npc.abilities.length === 1 ? '' : 'es'}`}
                      </div>
                    </>
                  )}
                </div>
              </PickerCard>
            ))}
          </div>

          <Pagination page={page} total={shown.length} onChange={setPage} scrollOnChange />

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
            openNpc(saved, [...visible.filter(n => n.id !== saved.id), saved]);
          }}
        />
      )}
    </div>
  );
};

export default Npcs;
