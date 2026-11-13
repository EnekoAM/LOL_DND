import { newNamedEffectClash } from '../items/namedEffectClash';
import { useEffect, useRef, useState } from 'react';
import {
  ABILITY_KEYS,
  CHAMPIONS,
  type Ability,
  type AbilityKey,
  type Champion,
  championRoleId,
  roleCategoryFor,
  saveChampionPatch,
} from '../../data/champions';
import { ROLE_TABLES, findRoleTable } from '../../data/roles';
import { useCanEdit } from '../../data/appRoleContext';
import { RESOURCE_IDS, RESOURCE_LABELS, championResourceBar, isResourceId, resolveAbilityResource } from '../../data/resources';
import { numericStat } from '../combate/combatAbilityUse';
import ResourceChip from '../../components/ResourceChip';
import { findItem, type Item } from '../../data/items';
import { EQUIPMENT_SLOTS } from '../../data/players';
import { cx } from '../../lib/cx';
import { normalizeName } from '../../lib/text';
import AbilityModal from '../habilidades/AbilityModal';
import RelationsPanel from '../relaciones/RelationsPanel';
import PrivateNotesPanel from '../notas/PrivateNotesPanel';
import BackgroundViewer from '../../components/BackgroundViewer';
import ItemDetailModal from '../items/ItemDetailModal';
import '../habilidades/Habilidades.css';
import '../players/Players.css';
import SpellCard, { SPELL_TYPE_LABEL, type SpellTone } from '../players/SpellCard';
import ReorderableItem from '../players/ReorderableItem';
import { moveItem, type ItemDragState } from '../players/itemOrder';

type ChampAbilityTone = Exclude<SpellTone, 'auto'>;
import '../players/SheetAbilities.css';
import BuildPicker from './BuildPicker';
import ItemTile, { type ItemTileState } from './ItemTile';
import StatsTable from './StatsTable';
import { championDamageContext, championAbilityRankCount } from './championDamage';
import AbilityDamageModal from '../players/AbilityDamageModal';
import { hasDamageScaling, rollAbilityDamage, type AbilityDamageRoll } from '../players/abilityDamage';
import { anyPhaseHasDamage, hasVariants, isChoosePhases, phaseLabels } from '../../data/abilityVariants';
import { createPortal } from 'react-dom';
import { STAT_COLUMNS, formatDefenseStat, formatStat, isDefenseKey, type StatKey } from './statLine';
import './ChampionSheet.css';

type Props = {
  champion: Champion;
  onBack: () => void;
  onSelectAbility: (ability: Ability) => void;
  onChampionChange: (champion: Champion) => void;
};

type SheetTab = 'habilidades' | 'equipo' | 'desglose' | 'relaciones' | 'notas';
const TABS: { id: SheetTab; label: string }[] = [
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'desglose', label: 'Desglose' },
  { id: 'relaciones', label: 'Relaciones' },
];
/** Solo players (y el aviso para invitados): el admin no tiene notas privadas. */
const PLAYER_TABS: { id: SheetTab; label: string }[] = [...TABS, { id: 'notas', label: 'Notas privadas' }];

const DEFENSE_KEYS: { key: StatKey; label: string }[] = [
  { key: 'ac', label: 'CA' },
  { key: 'mr', label: 'MR' },
  { key: 'spe', label: 'Velocidad' },
];
const STAT_TITLES = Object.fromEntries(STAT_COLUMNS.map(column => [column.key, column.title])) as Record<StatKey, string>;

const clampLevel = (value: number) => Math.min(20, Math.max(1, Math.floor(value)));

const ChampionSheet = ({ champion, onBack, onSelectAbility, onChampionChange }: Props) => {
  const canEdit = useCanEdit();
  const [tab, setTab] = useState<SheetTab>('habilidades');
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [editSlot, setEditSlot] = useState<AbilityKey | null>(null);
  const [damageRoll, setDamageRoll] = useState<{
    ability: Ability;
    result: AbilityDamageRoll | null;
    error: string | null;
  } | null>(null);
  const [equipmentPickerOpen, setEquipmentPickerOpen] = useState(false);
  const [buildPickerOpen, setBuildPickerOpen] = useState(false);
  const [inspectedItem, setInspectedItem] = useState<Item | null>(null);
  const itemTrigger = useRef<HTMLElement | null>(null);
  const draggedItem = useRef<ItemDragState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMedia, setEditMedia] = useState(false);
  const [editLevel, setEditLevel] = useState(false);
  const [imageDraft, setImageDraft] = useState(champion.image ?? '');
  const [bgDraft, setBgDraft] = useState(champion.background ?? '');
  const [levelDraft, setLevelDraft] = useState(String(champion.level ?? 1));
  const [roleDraft, setRoleDraft] = useState(() => championRoleId(champion));
  const [resourceDraft, setResourceDraft] = useState(champion.resource ?? '');

  useEffect(() => {
    setPortraitFailed(false);
    setImageDraft(champion.image ?? '');
    setBgDraft(champion.background ?? '');
    setLevelDraft(String(champion.level ?? 1));
    setRoleDraft(championRoleId(champion));
    setResourceDraft(champion.resource ?? '');
  }, [champion.champion, champion.image, champion.background, champion.level, champion.roleId, champion.role, champion.resource]);

  // Si pasa a admin con la pestaña de notas abierta, se vuelve a Habilidades.
  useEffect(() => {
    if (canEdit) setTab(current => (current === 'notas' ? 'habilidades' : current));
  }, [canEdit]);

  // Al cambiar de campeon se cierran los editores abiertos.
  useEffect(() => {
    setEditMedia(false);
    setEditLevel(false);
    setDamageRoll(null);
    setEditSlot(null);
    setEquipmentPickerOpen(false);
    setBuildPickerOpen(false);
    setInspectedItem(null);
  }, [champion.champion]);

  const { equipment, level, roleId, roleTable, tableLevel, stats } = championDamageContext(champion);
  const desiredBuild = champion.build ?? [];
  const background = champion.background?.trim() || '';
  const isActive = champion.active === true;
  const roleName = roleTable?.name ?? champion.role;
  const total = stats;

  const openAbility = (ability: Ability) => {
    if (!anyPhaseHasDamage(ability)) {
      onSelectAbility(ability);
      return;
    }
    if (!hasDamageScaling(ability.damage)) {
      setDamageRoll({ ability, result: null, error: 'Esta fase no tiene escalado de daño.' });
      return;
    }
    try {
      setDamageRoll({ ability, result: rollAbilityDamage(ability.damage!, stats, 1), error: null });
    } catch (caught) {
      setDamageRoll({ ability, result: null, error: caught instanceof Error ? caught.message : 'No se pudo tirar el daño' });
    }
  };

  const persist = async (patch: Parameters<typeof saveChampionPatch>[1]) => {
    if (!canEdit || saving) return;
    // Efectos con nombre exclusivos (Salvavidas…): no dos ítems con el mismo en el equipamiento.
    // En la build deseada sí pueden coexistir.
    if (patch.equipamiento) {
      const clash = newNamedEffectClash(champion.equipamiento ?? [], patch.equipamiento);
      if (clash) {
        setError(clash);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveChampionPatch(champion.champion, patch);
      onChampionChange(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
      throw caught;
    } finally {
      setSaving(false);
    }
  };

  const saveLevel = async () => {
    const parsed = Number(levelDraft);
    const next = Number.isFinite(parsed) ? clampLevel(parsed) : level;
    setLevelDraft(String(next));
    setEditLevel(false);
    const patch: Parameters<typeof saveChampionPatch>[1] = {};
    if (next !== level) patch.level = next;
    if (roleDraft && (roleDraft !== roleId || champion.roleId !== roleDraft)) {
      patch.roleId = roleDraft;
      const category = roleCategoryFor(roleDraft, champion.role);
      if (category && category !== champion.role) patch.role = category;
    }
    const currentResource = champion.resource ?? '';
    if (resourceDraft !== currentResource) {
      patch.resource = resourceDraft && isResourceId(resourceDraft) ? resourceDraft : null;
    }
    if (Object.keys(patch).length === 0) return;
    await persist(patch).catch(() => undefined);
  };

  const cancelLevel = () => {
    setLevelDraft(String(level));
    setRoleDraft(roleId);
    setResourceDraft(champion.resource ?? '');
    setEditLevel(false);
  };

  const saveImage = async () => {
    const next = imageDraft.trim();
    if (!next) {
      // La foto es obligatoria: si se vacia, se restaura la actual.
      setImageDraft(champion.image ?? '');
      return;
    }
    if (next === (champion.image ?? '')) return;
    setPortraitFailed(false);
    await persist({ image: next });
  };

  const saveBackground = async () => {
    const next = bgDraft.trim();
    if (next === (champion.background ?? '')) return;
    await persist({ background: next || null });
  };

  const removeAt = (items: string[], index: number) => items.filter((_, i) => i !== index);

  const addEquipment = async (itemName: string) => {
    if (equipment.some(name => normalizeName(name) === normalizeName(itemName))) return;
    if (equipment.length >= EQUIPMENT_SLOTS) {
      setError(`Máximo ${EQUIPMENT_SLOTS} ítems`);
      return;
    }
    await persist({ equipamiento: [...equipment, itemName] });
  };

  const addToBuild = async (itemName: string) => {
    if (desiredBuild.some(name => normalizeName(name) === normalizeName(itemName))) return;
    await persist({ build: [...desiredBuild, itemName] });
  };

  const openEquipmentPicker = () => {
    setBuildPickerOpen(false);
    setEquipmentPickerOpen(true);
  };

  const openBuildPicker = () => {
    setEquipmentPickerOpen(false);
    setBuildPickerOpen(true);
  };

  const alreadyEquipped = (itemName: string) =>
    equipment.some(name => normalizeName(name) === normalizeName(itemName));

  const equipmentFull = equipment.length >= EQUIPMENT_SLOTS;

  const equipFromBuild = (itemName: string) => {
    if (alreadyEquipped(itemName) || equipmentFull) return;
    void addEquipment(itemName);
  };

  const equipTitleFor = (itemName: string) => {
    if (alreadyEquipped(itemName)) return 'Ya está en el equipamiento';
    if (equipmentFull) return `Equipamiento lleno (${EQUIPMENT_SLOTS}/${EQUIPMENT_SLOTS})`;
    return 'Añadir al equipamiento';
  };

  const reorderBuild = (from: number, to: number) => {
    if (!canEdit || saving) return;
    const next = moveItem(desiredBuild, from, to);
    if (next === desiredBuild) return;
    void persist({ build: next });
  };

  const buildItemState = (itemName: string): ItemTileState => {
    const key = normalizeName(itemName);
    if (equipment.some(equipped => normalizeName(equipped) === key)) return 'equipped';
    if ((findItem(itemName)?.cantidad ?? 0) > 0) return 'owned';
    return 'none';
  };

  const inspectItem = (name: string) => {
    const item = findItem(name);
    if (!item) return;
    itemTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInspectedItem(item);
  };

  const closeItemInfo = () => {
    setInspectedItem(null);
    itemTrigger.current?.focus();
  };

  return (
    <div
      className={cx('sheet', 'champ-sheet', background && 'champ-sheet--bg')}
      style={background ? { ['--champ-sheet-bg' as string]: `url("${background.replace(/"/g, '\\"')}")` } : undefined}
    >
      <div className="sheet-topbar">
        <button type="button" className="calc-back-btn sheet-back" onClick={onBack}>
          ← Todos los campeones
        </button>
        {background && <BackgroundViewer src={background} name={champion.champion} />}
      </div>

      <div className="sheet-body">
        <aside className="sheet-side">
          <div className="sheet-portrait champ-sheet__portrait">
            {champion.image && !portraitFailed ? (
              <img
                className="sheet-portrait__img"
                src={champion.image}
                alt={champion.champion}
                onError={() => setPortraitFailed(true)}
              />
            ) : (
              <div className="sheet-portrait__placeholder" aria-hidden="true">
                {champion.champion.charAt(0)}
              </div>
            )}
            {canEdit && (
              <button
                type="button"
                className={cx('sheet-hp__icon-btn', 'champ-sheet__portrait-edit', editMedia && 'champ-sheet__portrait-edit--on')}
                aria-label="Editar foto de perfil y fondo"
                aria-pressed={editMedia}
                title="Editar foto de perfil y fondo"
                disabled={saving}
                onClick={() => setEditMedia(open => !open)}
              >
                {'\u270E'}
              </button>
            )}
          </div>

          {canEdit && editMedia && (
            <div className="sheet-panel champ-sheet__media">
              <label className="champ-sheet__field">
                <span className="champ-sheet__field-label">Foto de perfil</span>
                <input
                  className="champ-sheet__bg-input"
                  type="url"
                  placeholder="URL de la foto"
                  value={imageDraft}
                  disabled={saving}
                  onChange={e => setImageDraft(e.target.value)}
                  onBlur={() => { void saveImage(); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
              <label className="champ-sheet__field">
                <span className="champ-sheet__field-label">Fondo</span>
                <input
                  className="champ-sheet__bg-input"
                  type="url"
                  placeholder="URL de imagen de fondo"
                  value={bgDraft}
                  disabled={saving}
                  onChange={e => setBgDraft(e.target.value)}
                  onBlur={() => { void saveBackground(); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
              <div className="champ-sheet__bg-actions">
                <button
                  type="button"
                  className="calc-ability-edit"
                  disabled={saving || !bgDraft.trim()}
                  onClick={() => {
                    setBgDraft('');
                    void persist({ background: null });
                  }}
                >
                  Quitar fondo
                </button>
                <button
                  type="button"
                  className="calc-ability-edit"
                  onClick={() => setEditMedia(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          <div className="sheet-side__identity">
            <h1 className="sheet-side__name">{champion.champion}</h1>
            <div className="sheet-side__meta">
              <span className="champ-sheet__level">
                NVL {level}
                {canEdit && (
                  <button
                    type="button"
                    className={cx('sheet-hp__icon-btn', 'champ-sheet__level-btn', editLevel && 'champ-sheet__portrait-edit--on')}
                    aria-label="Editar nivel, rol y recurso"
                    aria-pressed={editLevel}
                    title="Editar nivel, rol y recurso"
                    disabled={saving}
                    onClick={() => {
                      if (editLevel) {
                        cancelLevel();
                        return;
                      }
                      setLevelDraft(String(level));
                      setRoleDraft(roleId);
                      setResourceDraft(champion.resource ?? '');
                      setEditLevel(true);
                    }}
                  >
                    {'\u270E'}
                  </button>
                )}
              </span>
              {' \u00B7 '}{champion.region}{' \u00B7 '}{roleName}
              {champion.resource && (
                <span className="champ-sheet__meta-resource">
                  <ResourceChip resource={champion.resource} />
                </span>
              )}
            </div>
            {canEdit && editLevel && (
              <form
                className="sheet-panel champ-sheet__media champ-sheet__level-panel"
                onSubmit={e => {
                  e.preventDefault();
                  void saveLevel();
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') cancelLevel();
                }}
              >
                <label className="champ-sheet__field">
                  <span className="champ-sheet__field-label">Nivel (1-20)</span>
                  <input
                    className="champ-sheet__bg-input"
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={levelDraft}
                    disabled={saving}
                    autoFocus
                    aria-label="Nivel del campeón (1-20)"
                    onChange={e => setLevelDraft(e.target.value)}
                  />
                </label>
                <label className="champ-sheet__field">
                  <span className="champ-sheet__field-label">Rol (tabla de rol)</span>
                  <select
                    className="champ-sheet__bg-input"
                    value={roleDraft}
                    disabled={saving}
                    aria-label="Rol del campeón"
                    onChange={e => setRoleDraft(e.target.value)}
                  >
                    {!findRoleTable(roleDraft) && roleDraft && <option value={roleDraft}>{roleDraft}</option>}
                    {ROLE_TABLES.map(option => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </label>
                <label className="champ-sheet__field">
                  <span className="champ-sheet__field-label">Recurso</span>
                  <select
                    className="champ-sheet__bg-input"
                    value={resourceDraft}
                    disabled={saving}
                    aria-label="Recurso del campeón"
                    onChange={e => setResourceDraft(e.target.value)}
                  >
                    <option value="">Sin definir</option>
                    {RESOURCE_IDS.map(id => (
                      <option key={id} value={id}>{RESOURCE_LABELS[id]}</option>
                    ))}
                  </select>
                </label>
                <div className="champ-sheet__bg-actions">
                  <button type="button" className="calc-ability-edit" onClick={cancelLevel}>
                    Cancelar
                  </button>
                  <button type="submit" className="calc-ability-edit" disabled={saving}>
                    {saving ? 'Guardando' : 'Guardar'}
                  </button>
                </div>
              </form>
            )}
            {isActive && <div className="champ-sheet__active-badge">Activo</div>}
          </div>

          <div className="sheet-panel champ-sheet__stats" aria-label="Estadísticas">
            <div className="champ-sheet__res" title={STAT_TITLES.hp}>
              <div className="sheet-resource__top">
                <span className="sheet-resource__label">Vida</span>
                <span className="champ-sheet__res-value">{formatStat(total.hp)}</span>
              </div>
              <div className="sheet-resource__track" aria-hidden="true">
                <div className="sheet-resource__fill champ-sheet__fill--hp" style={{ width: '100%' }} />
              </div>
            </div>
            {(() => {
              const bar = championResourceBar(champion.resource, numericStat(total.mana));
              if (!bar) return null;
              const isMana = bar.id === 'mana';
              return (
                <div className="champ-sheet__res" title={isMana ? STAT_TITLES.mana : `${bar.label}: máximo ${bar.max}${bar.start === 'empty' ? ', empieza a 0 en combate' : ''}`}>
                  <div className="sheet-resource__top">
                    <span className="sheet-resource__label">{bar.label}</span>
                    <span className="champ-sheet__res-value">{isMana ? formatStat(total.mana) : bar.start === 'empty' ? `0 / ${bar.max}` : bar.max}</span>
                  </div>
                  <div className="sheet-resource__track" aria-hidden="true">
                    <div className={`sheet-resource__fill ${bar.fillClass}`} style={{ width: bar.start === 'empty' ? '0%' : '100%' }} />
                  </div>
                </div>
              );
            })()}
            <div className="sheet-defense champ-sheet__defense">
              {DEFENSE_KEYS.map(({ key, label }) => {
                const defense = isDefenseKey(key) ? formatDefenseStat(total[key]) : null;
                return (
                  <div
                    key={key}
                    className="sheet-defense__card"
                    title={defense?.exactTitle ?? STAT_TITLES[key]}
                  >
                    <div className="sheet-defense__label">{label}</div>
                    <div className="sheet-defense__value">{defense ? defense.text : formatStat(total[key])}</div>
                  </div>
                );
              })}
            </div>
            {!roleTable && (
              <p className="champ-sheet__stats-note">Sin tabla de rol: solo suma el equipo.</p>
            )}
          </div>

          {canEdit && (
            <div className="champ-sheet__toggles">
              <button
                type="button"
                className={cx('champ-sheet__toggle', isActive && 'champ-sheet__toggle--on')}
                aria-pressed={isActive}
                disabled={saving}
                title={isActive ? 'Ocultar a los players' : 'Mostrar a los players'}
                onClick={() => { void persist({ active: !isActive }); }}
              >
                {isActive ? 'Activo para players' : 'Inactivo'}
              </button>
            </div>
          )}

          {error && <p className="sheet-hp__error" role="alert">{error}</p>}
        </aside>

        <div className="sheet-content">
          <div className="sheet-tabs" role="tablist" aria-label="Secciones de la ficha">
            {(canEdit ? TABS : PLAYER_TABS).map(entry => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={cx('sheet-tab', tab === entry.id && 'sheet-tab--active')}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === 'habilidades' && (
            <div className="spell-grid">
              {ABILITY_KEYS.map(key => {
                const ability = champion.abilities[key];
                const tone: ChampAbilityTone = key === 'P' ? 'pasiva' : key === 'R' ? 'definitiva' : 'basica';
                const empty = !ability?.name;
                return (
                  <SpellCard
                    key={key}
                    tone={tone}
                    seal={key}
                    type={SPELL_TYPE_LABEL[tone]}
                    name={ability?.name || 'Sin nombre'}
                    empty={empty}
                    area={empty ? undefined : ability?.area}
                    onHit={!empty && ability?.appliesOnHit === true}
                    note={empty ? (!ability ? 'No implementada' : undefined) : (ability?.learned ? 'Aprendida' : undefined)}
                    badge={(() => {
                      const resolved = resolveAbilityResource(ability, champion);
                      return resolved ? <ResourceChip resource={resolved.id} inherited={resolved.inherited} /> : undefined;
                    })()}
                    sealAsIcon
                    footerAction
                    onOpen={ability && (ability.damage || hasVariants(ability)) ? () => openAbility(ability) : undefined}
                    phases={ability && hasVariants(ability) ? phaseLabels(ability) : undefined}
                    phasesChoose={isChoosePhases(ability)}
                    action={(
                      <button
                        type="button"
                        className="spell__btn"
                        onClick={() => setEditSlot(key)}
                      >
                        {canEdit ? 'Ver / Editar' : 'Ver detalles'}
                      </button>
                    )}
                  />
                );
              })}
            </div>
          )}

          {tab === 'equipo' && (
            <>
            <section className="sheet-panel">
              <div className="sheet-panel__title">
                Equipamiento
                <span className="sheet-panel__meta">{equipment.length}/{EQUIPMENT_SLOTS}</span>
              </div>
              {equipment.length === 0 && (
                <p className="calc-build-empty">Todavía no lleva ítems equipados.</p>
              )}
              <div className="calc-equip-grid">
                {equipment.map((itemName, index) => (
                  <ItemTile
                    key={`${itemName}-${index}`}
                    name={itemName}
                    item={findItem(itemName)}
                    onRemove={
                      canEdit
                        ? () => { void persist({ equipamiento: removeAt(equipment, index) }); }
                        : undefined
                    }
                    removeDisabled={saving}
                  />
                ))}
                {canEdit && equipment.length < EQUIPMENT_SLOTS && (
                  <button
                    type="button"
                    className="calc-item-card calc-item-card--add"
                    disabled={saving}
                    aria-label="Añadir al equipamiento"
                    onClick={openEquipmentPicker}
                  >
                    <div className="calc-item-card__no-img">+</div>
                    <div className="calc-item-card__name">{saving ? 'Guardando' : 'Añadir'}</div>
                  </button>
                )}
              </div>
            </section>
            <section className="sheet-panel">
              <div className="sheet-panel__title">Build deseada</div>
              {desiredBuild.length === 0 && (
                <p className="calc-build-empty">Todavía no hay ítems en la build.</p>
              )}
              <div className="calc-build-grid">
                {desiredBuild.map((itemName, index) => (
                  canEdit ? (
                    <ReorderableItem
                      key={`${itemName}-${index}`}
                      name={itemName}
                      index={index}
                      items={desiredBuild}
                      group={`${champion.champion}:build`}
                      dragged={draggedItem}
                      disabled={saving}
                      onMove={reorderBuild}
                    >
                      <ItemTile
                        name={itemName}
                        item={findItem(itemName)}
                        state={buildItemState(itemName)}
                        onInspect={() => inspectItem(itemName)}
                        onRemove={() => { void persist({ build: removeAt(desiredBuild, index) }); }}
                        onEquip={() => equipFromBuild(itemName)}
                        equipDisabled={alreadyEquipped(itemName) || equipmentFull}
                        equipTitle={equipTitleFor(itemName)}
                        removeDisabled={saving}
                      />
                    </ReorderableItem>
                  ) : (
                    <ItemTile
                      key={`${itemName}-${index}`}
                      name={itemName}
                      item={findItem(itemName)}
                      state={buildItemState(itemName)}
                      onInspect={() => inspectItem(itemName)}
                    />
                  )
                ))}
                {canEdit && (
                  <button
                    type="button"
                    className="calc-item-card calc-item-card--add"
                    disabled={saving}
                    aria-label="Añadir a la build deseada"
                    onClick={openBuildPicker}
                  >
                    <div className="calc-item-card__no-img">+</div>
                    <div className="calc-item-card__name">{saving ? 'Guardando' : 'Añadir'}</div>
                  </button>
                )}
              </div>
            </section>
            </>
          )}

          {tab === 'relaciones' && (
            <RelationsPanel self={{ kind: 'champion', id: champion.champion }} selfName={champion.champion} />
          )}

          {tab === 'notas' && !canEdit && (
            <PrivateNotesPanel kind="champion" id={champion.champion} name={champion.champion} />
          )}

          {tab === 'desglose' && (
            <StatsTable
              playerName={champion.champion}
              sheet={roleId ? { roleId } : undefined}
              level={tableLevel}
              equipment={equipment}
              defaultOpen
              roleTableOpen
            />
          )}
        </div>
      </div>

      {damageRoll && createPortal(
        <AbilityDamageModal
          ability={damageRoll.ability}
          rank={1}
          maxRank={championAbilityRankCount(damageRoll.ability)}
          stats={stats}
          initialResult={damageRoll.result}
          initialError={damageRoll.error}
          statsNote={`${champion.champion} · Nivel ${level} · ${roleName}. Total = base de rol al nivel del campeón + equipo; Bonus = solo equipo. Sin rangos guardados: se empieza en rango 1 y puedes elegirlo aquí.`}
          onClose={() => setDamageRoll(null)}
        />,
        document.body,
      )}

      {inspectedItem && createPortal(
        <ItemDetailModal item={inspectedItem} readOnly onClose={closeItemInfo} />,
        document.body,
      )}

      {equipmentPickerOpen && (
        <BuildPicker
          key="champion-equipment-picker"
          title="Añadir al equipo"
          busy={saving}
          taken={equipment}
          takenLabel="Equipado"
          onAdd={name => { void addEquipment(name); }}
          onClose={() => setEquipmentPickerOpen(false)}
        />
      )}

      {buildPickerOpen && (
        <BuildPicker
          key="champion-build-picker"
          title="Añadir a la build deseada"
          busy={saving}
          taken={desiredBuild}
          takenLabel="En la build"
          onAdd={name => { void addToBuild(name); }}
          onClose={() => setBuildPickerOpen(false)}
        />
      )}

      {editSlot && (
        <AbilityModal
          champion={champion}
          slot={editSlot}
          onClose={() => setEditSlot(null)}
          onSaved={() => {
            const next = CHAMPIONS.find(entry => normalizeName(entry.champion) === normalizeName(champion.champion));
            if (next) onChampionChange(next);
          }}
        />
      )}
    </div>
  );
};

export default ChampionSheet;
