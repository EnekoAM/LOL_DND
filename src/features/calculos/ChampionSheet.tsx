import { useEffect, useState } from 'react';
import {
  ABILITY_KEYS,
  CHAMPIONS,
  type Ability,
  type AbilityKey,
  type Champion,
  saveChampionPatch,
} from '../../data/champions';
import { useCanEdit } from '../../data/appRoleContext';
import { findItem } from '../../data/items';
import { EQUIPMENT_SLOTS } from '../../data/players';
import { cx } from '../../lib/cx';
import { normalizeName } from '../../lib/text';
import AbilityModal from '../habilidades/AbilityModal';
import '../habilidades/Habilidades.css';
import '../players/Players.css';
import AbilityCard from './AbilityCard';
import BuildPicker from './BuildPicker';
import ItemTile from './ItemTile';
import StatsTable from './StatsTable';
import './ChampionSheet.css';

type Props = {
  champion: Champion;
  onBack: () => void;
  onSelectAbility: (ability: Ability) => void;
  onChampionChange: (champion: Champion) => void;
};

type SheetTab = 'habilidades' | 'equipo' | 'desglose';
const TABS: { id: SheetTab; label: string }[] = [
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'desglose', label: 'Desglose' },
];

const clampLevel = (value: number) => Math.min(20, Math.max(1, Math.floor(value)));

const ChampionSheet = ({ champion, onBack, onSelectAbility, onChampionChange }: Props) => {
  const canEdit = useCanEdit();
  const [tab, setTab] = useState<SheetTab>('habilidades');
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [editSlot, setEditSlot] = useState<AbilityKey | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMeta, setEditMeta] = useState(false);
  const [bgDraft, setBgDraft] = useState(champion.background ?? '');
  const [levelDraft, setLevelDraft] = useState(String(champion.level ?? 1));

  useEffect(() => {
    setPortraitFailed(false);
    setBgDraft(champion.background ?? '');
    setLevelDraft(String(champion.level ?? 1));
    setEditMeta(false);
  }, [champion.champion, champion.image, champion.background, champion.level]);

  const equipment = champion.equipamiento ?? [];
  const level = typeof champion.level === 'number' && champion.level >= 1 ? champion.level : 1;
  const background = champion.background?.trim() || '';
  const isActive = champion.active === true;

  const persist = async (patch: Parameters<typeof saveChampionPatch>[1]) => {
    if (!canEdit || saving) return;
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
    const next = clampLevel(Number(levelDraft));
    setLevelDraft(String(next));
    if (next === level) return;
    await persist({ level: next });
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

  return (
    <div
      className={cx('sheet', 'champ-sheet', background && 'champ-sheet--bg')}
      style={background ? { ['--champ-sheet-bg' as string]: `url("${background.replace(/"/g, '\\"')}")` } : undefined}
    >
      <div className="sheet-topbar">
        <button type="button" className="calc-back-btn sheet-back" onClick={onBack}>
          ← Todos los campeones
        </button>
      </div>

      <div className="sheet-body">
        <aside className="sheet-side">
          <div className="sheet-portrait">
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
          </div>

          <div className="sheet-side__identity">
            <h1 className="sheet-side__name">{champion.champion}</h1>
            <div className="sheet-side__meta">
              NVL {level} · {champion.region} · {champion.role}
            </div>
            {isActive && <div className="champ-sheet__active-badge">Activo</div>}
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
              <button
                type="button"
                className={cx('champ-sheet__toggle', editMeta && 'champ-sheet__toggle--on')}
                aria-pressed={editMeta}
                disabled={saving}
                onClick={() => setEditMeta(open => !open)}
              >
                {editMeta ? 'Cerrar edición' : 'Editar nivel / fondo'}
              </button>
            </div>
          )}

          {canEdit && editMeta && (
            <>
              <div className="sheet-panel champ-sheet__level">
                <div className="sheet-panel__title">Nivel</div>
                <div className="champ-sheet__level-row">
                  <input
                    className="champ-sheet__level-input"
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={levelDraft}
                    disabled={saving}
                    aria-label="Nivel del campeón"
                    onChange={e => setLevelDraft(e.target.value)}
                    onBlur={() => { void saveLevel(); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                  <span className="champ-sheet__level-hint">1–20</span>
                </div>
              </div>

              <div className="sheet-panel champ-sheet__bg">
                <div className="sheet-panel__title">Fondo</div>
                <input
                  className="champ-sheet__bg-input"
                  type="url"
                  placeholder="URL de imagen de fondo"
                  value={bgDraft}
                  disabled={saving}
                  aria-label="URL del fondo de la ficha"
                  onChange={e => setBgDraft(e.target.value)}
                  onBlur={() => { void saveBackground(); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
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
                </div>
              </div>
            </>
          )}

          {error && <p className="sheet-hp__error" role="alert">{error}</p>}
        </aside>

        <div className="sheet-content">
          <div className="sheet-tabs" role="tablist" aria-label="Secciones de la ficha">
            {TABS.map(entry => (
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
            <div className="calc-grid">
              {ABILITY_KEYS.map(key => {
                const ability = champion.abilities[key];
                return (
                  <AbilityCard
                    key={key}
                    label={key}
                    name={ability?.name || 'Sin nombre'}
                    ability={ability ?? null}
                    onSelect={onSelectAbility}
                  >
                    {ability?.learned && <div className="calc-ability-learned">Aprendida</div>}
                    <div className="calc-ability-actions">
                      <button
                        type="button"
                        className="calc-ability-edit"
                        onClick={() => setEditSlot(key)}
                      >
                        Editar
                      </button>
                    </div>
                  </AbilityCard>
                );
              })}
            </div>
          )}

          {tab === 'equipo' && (
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
                    onClick={() => setPickerOpen(true)}
                  >
                    <div className="calc-item-card__no-img">+</div>
                    <div className="calc-item-card__name">{saving ? 'Guardando' : 'Añadir'}</div>
                  </button>
                )}
              </div>
            </section>
          )}

          {tab === 'desglose' && (
            <StatsTable playerName={champion.champion} equipment={equipment} defaultOpen />
          )}
        </div>
      </div>

      {pickerOpen && (
        <BuildPicker
          title="Añadir al equipo"
          busy={saving}
          taken={equipment}
          takenLabel="Equipado"
          onAdd={name => { void addEquipment(name); }}
          onClose={() => setPickerOpen(false)}
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
