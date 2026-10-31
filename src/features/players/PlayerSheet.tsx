import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Ability } from '../../data/champions';
import { findItem } from '../../data/items';
import type { RankedSlot } from '../../data/abilityRanks';
import { partyLevel, subscribeParty } from '../../data/party';
import {
  EQUIPMENT_SLOTS,
  playerPortraitUrl,
  type Player,
  type PlayerAbilitySlot,
  type PlayerSheet as PlayerSheetData,
} from '../../data/players';
import { normalizeName } from '../../lib/text';
import BuildPicker from '../calculos/BuildPicker';
import ItemTile, { type ItemTileState } from '../calculos/ItemTile';
import { hpSyncPatch, playerMaxHp, playerTotalLine } from '../calculos/playerTotals';
import {
  STAT_COLUMNS,
  formatStat,
  type StatKey,
} from '../calculos/statLine';
import StatsTable from '../calculos/StatsTable';
import { itemAvailability } from '../items/stock';
import { cx } from '../../lib/cx';
import HpPanel, { type CombatPatch } from './HpPanel';
import InspirationToggle from './InspirationToggle';
import ManaPanel from './ManaPanel';
import RestPanel from './RestPanel';
import PlayerSwitcher from './PlayerSwitcher';
import SheetAbilities from './SheetAbilities';
import SheetEditor from './SheetEditor';
import SheetSkills from './SheetSkills';

type Props = {
  player: Player;
  players: Player[];
  saving: boolean;
  equipError: string | null;
  buildError: string | null;
  combatError: string | null;
  sheetError: string | null;
  abilityError: string | null;
  onBack: () => void;
  onSwitchPlayer: (player: Player) => void;
  onSelectAbility: (ability: Ability, rank?: number) => void;
  onEquipamientoChange: (equipamiento: string[]) => void;
  onBuildChange: (build: string[]) => void;
  onCombatChange: (combat: CombatPatch) => void;
  onSheetChange: (sheet: PlayerSheetData) => Promise<void>;
  onAbilityChange: (slot: PlayerAbilitySlot, name: string | null) => Promise<void>;
  onRankChange: (slot: RankedSlot, rank: number) => Promise<void>;
};

type SheetTab = 'general' | 'habilidades' | 'equipo' | 'build' | 'desglose';
const SHEET_TABS: SheetTab[] = ['general', 'habilidades', 'equipo', 'build', 'desglose'];
const readTab = (key: string): SheetTab => {
  try {
    const v = localStorage.getItem(key) as SheetTab | null;
    return v && SHEET_TABS.includes(v) ? v : 'general';
  } catch {
    return 'general';
  }
};

const TABS: { id: SheetTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'build', label: 'Build' },
  { id: 'desglose', label: 'Desglose' },
];

const DEFENSE_KEYS: { key: StatKey; label: string }[] = [
  { key: 'ac', label: 'CA' },
  { key: 'spe', label: 'Velocidad' },
  { key: 'mr', label: 'MR' },
];

const getBuildItemState = (player: Player, itemName: string): ItemTileState => {
  const key = normalizeName(itemName);
  if (player.equipamiento.some(equipped => normalizeName(equipped) === key)) return 'equipped';
  if ((findItem(itemName)?.cantidad ?? 0) > 0) return 'owned';
  return 'none';
};

const Portrait = ({
  image,
  name,
  failed,
  onFail,
}: {
  image: string | undefined;
  name: string;
  failed: boolean;
  onFail: () => void;
}) => {
  const src = playerPortraitUrl(image);
  if (!src || failed) {
    return <div className="sheet-portrait__placeholder" aria-hidden="true">👤</div>;
  }
  return (
    <img
      key={src}
      className="sheet-portrait__img"
      src={src}
      alt={name}
      onError={onFail}
    />
  );
};

const PlayerSheet = ({
  player,
  players,
  saving,
  equipError,
  buildError,
  combatError,
  sheetError,
  abilityError,
  onBack,
  onSwitchPlayer,
  onSelectAbility,
  onEquipamientoChange,
  onBuildChange,
  onCombatChange,
  onSheetChange,
  onAbilityChange,
  onRankChange,
}: Props) => {
  const [picker, setPicker] = useState<'equipamiento' | 'build' | null>(null);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const tabKey = `playerSheetTab:${player.name}`;
  const [tab, setTabState] = useState<SheetTab>(() => readTab(tabKey));
  useEffect(() => {
    setTabState(readTab(tabKey));
  }, [tabKey]);
  const setTab = (next: SheetTab) => {
    setTabState(next);
    try {
      localStorage.setItem(tabKey, next);
    } catch {
      /* ignore */
    }
  };
  // Al cambiar de jugador se conserva la pestaña abierta: se guarda como la de la ficha destino.
  const switchTo = (next: Player) => {
    try {
      localStorage.setItem(`playerSheetTab:${next.name}`, tab);
    } catch {
      /* ignore */
    }
    setPicker(null);
    onSwitchPlayer(next);
  };
  const level = useSyncExternalStore(subscribeParty, partyLevel);
  useEffect(() => {
    setPortraitFailed(false);
  }, [player.image, player.name]);
  const total = playerTotalLine(player.sheet, player.equipamiento);
  const columnsByKey = Object.fromEntries(STAT_COLUMNS.map(column => [column.key, column]));

  const removeAt = (items: string[], index: number) => items.filter((_, itemIndex) => itemIndex !== index);
  const slotsLeft = EQUIPMENT_SLOTS - player.equipamiento.length;

  const addToEquipamiento = (itemName: string) => {
    if (slotsLeft <= 0) return;
    const item = findItem(itemName);
    if (!item || itemAvailability(item).available <= 0) return;
    onEquipamientoChange([...player.equipamiento, itemName]);
    if (slotsLeft === 1) setPicker(null);
  };

  const addToBuild = (itemName: string) => {
    if (player.build.some(name => normalizeName(name) === normalizeName(itemName))) return;
    onBuildChange([...player.build, itemName]);
  };

  const suggestedMax = typeof total.hp === 'number' && Number.isFinite(total.hp) ? total.hp : 0;
  // PG máximos vinculados al HP TOTAL de la tabla (undefined si la ficha no tiene rol).
  const tableMaxHp = playerMaxHp(player.sheet, player.equipamiento);
  const hpSyncTried = useRef<string | null>(null);
  useEffect(() => {
    if (saving) return;
    const patch = hpSyncPatch(player, tableMaxHp);
    if (!patch) return;
    // Un intento por combinación: si la API falla no se reintenta en bucle.
    const key = `${player.name}:${player.hp}:${player.actualHp}:${patch.hp}`;
    if (hpSyncTried.current === key) return;
    hpSyncTried.current = key;
    Promise.resolve(onCombatChange(patch)).catch(() => undefined);
  }, [player, tableMaxHp, level, saving, onCombatChange]);
  const suggestedMana = typeof total.mana === 'number' && Number.isFinite(total.mana) ? total.mana : 0;

  return (
    <div className="sheet">
      <div className="sheet-topbar">
        <button type="button" className="calc-back-btn sheet-back" onClick={onBack}>
          ← Todas las fichas
        </button>
        <PlayerSwitcher
          players={players}
          current={player}
          disabled={saving}
          onSelect={switchTo}
        />
      </div>

      <div className="sheet-body">
        <aside className="sheet-side">
          <div className="sheet-portrait">
            <Portrait
              image={player.image}
              name={player.name}
              failed={portraitFailed}
              onFail={() => setPortraitFailed(true)}
            />
          </div>
          <div className="sheet-side__identity">
            <h1 className="sheet-side__name">{player.name}</h1>
            <div className="sheet-side__meta">
              NVL {level} · {player.rol?.trim() || 'Sin rol'}
            </div>
            <InspirationToggle
              active={player.inspiration === true}
              saving={saving}
              onToggle={next => onCombatChange({ inspiration: next })}
            />
          </div>

          <div className="sheet-panel sheet-side__hp">

          <HpPanel
            player={player}
            suggestedMax={suggestedMax}
            linkedMax={tableMaxHp}
            saving={saving}
            error={combatError}
            onChange={onCombatChange}
          /></div>
          <div className="sheet-panel sheet-side__mana">
            <ManaPanel
              player={player}
              suggestedMax={suggestedMana}
              saving={saving}
              error={combatError}
              onChange={onCombatChange}
            />
          </div>
          <div className="sheet-panel sheet-side__rest">
            <RestPanel
              player={player}
              maxHp={tableMaxHp ?? Math.max(0, Math.floor(suggestedMax))}
              maxMana={typeof player.mana === 'number' && Number.isFinite(player.mana) ? player.mana : Math.max(0, Math.floor(suggestedMana))}
              saving={saving}
              error={combatError}
              onChange={onCombatChange}
            />
          </div>
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

          {tab === 'general' && (
            <div className="sheet-general">
              <SheetSkills
                sheet={player.sheet}
                level={level}
                saving={saving}
                error={sheetError}
                onSave={onSheetChange}
              />

              <div className="sheet-general__sheet">
                <SheetEditor
                  sheet={player.sheet}
                  saving={saving}
                  error={sheetError}
                  onSave={onSheetChange}
                />
              </div>

              <section className="sheet-panel sheet-general__defense">
                <div className="sheet-panel__title">Defensa y movimiento</div>
                <div className="sheet-defense">
                  {DEFENSE_KEYS.map(({ key, label }) => (
                    <div key={key} className="sheet-defense__card" title={columnsByKey[key].title}>
                      <div className="sheet-defense__label">{label}</div>
                      <div className="sheet-defense__value">{formatStat(total[key])}</div>
                    </div>
                  ))}
                </div>
              </section>

            </div>
          )}

          {tab === 'habilidades' && (
            <SheetAbilities
              player={player}
              saving={saving}
              error={abilityError}
              onSelectAbility={onSelectAbility}
              onAbilityChange={onAbilityChange}
              level={level}
              onRankChange={onRankChange}
            />
          )}

          {tab === 'equipo' && (
            <section className="sheet-panel">
              <div className="sheet-panel__title">
                Equipamiento
                <span className="sheet-panel__meta">{player.equipamiento.length}/{EQUIPMENT_SLOTS}</span>
              </div>
              {player.equipamiento.length === 0 && (
                <p className="calc-build-empty">Todavía no lleva ítems equipados.</p>
              )}
              <div className="calc-equip-grid">
                {player.equipamiento.map((itemName, index) => (
                  <ItemTile
                    key={`${itemName}-${index}`}
                    name={itemName}
                    item={findItem(itemName)}
                    onRemove={() => onEquipamientoChange(removeAt(player.equipamiento, index))}
                    removeDisabled={saving}
                  />
                ))}
                {slotsLeft > 0 && (
                  <button
                    type="button"
                    className="calc-item-card calc-item-card--add"
                    onClick={() => setPicker('equipamiento')}
                    disabled={saving}
                  >
                    <div className="calc-item-card__no-img">+</div>
                    <div className="calc-item-card__name">{saving ? 'Guardando' : 'Añadir'}</div>
                  </button>
                )}
              </div>
              {equipError && <p className="calc-build-error">{equipError}</p>}
            </section>
          )}

          {tab === 'build' && (
            <section className="sheet-panel">
              <div className="sheet-panel__title">Build deseada</div>
              {player.build.length === 0 && (
                <p className="calc-build-empty">Todavía no hay ítems en la build.</p>
              )}
              <div className="calc-build-grid">
                {player.build.map((itemName, index) => (
                  <ItemTile
                    key={`${itemName}-${index}`}
                    name={itemName}
                    item={findItem(itemName)}
                    state={getBuildItemState(player, itemName)}
                    onRemove={() => onBuildChange(removeAt(player.build, index))}
                    removeDisabled={saving}
                  />
                ))}
                <button
                  type="button"
                  className="calc-item-card calc-item-card--add"
                  onClick={() => setPicker('build')}
                  disabled={saving}
                >
                  <div className="calc-item-card__no-img">+</div>
                  <div className="calc-item-card__name">{saving ? 'Guardando' : 'Añadir'}</div>
                </button>
              </div>
              {buildError && <p className="calc-build-error">{buildError}</p>}
            </section>
          )}

          {tab === 'desglose' && (
            <section className="sheet-panel">
              <StatsTable
                playerName={player.name}
                sheet={player.sheet}
                equipment={player.equipamiento}
                defaultOpen
              />
            </section>
          )}
        </div>
      </div>

      {picker === 'equipamiento' && (
        <BuildPicker
          title="Añadir al equipamiento"
          busy={saving}
          onlyAvailable
          onAdd={addToEquipamiento}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'build' && (
        <BuildPicker
          title="Añadir a la build"
          busy={saving}
          taken={player.build}
          takenLabel="En la build"
          onAdd={addToBuild}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
};

export default PlayerSheet;
