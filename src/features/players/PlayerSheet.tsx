import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Ability } from '../../data/champions';
import { findItem } from '../../data/items';
import type { RankedSlot } from '../../data/abilityRanks';
import { useAppRole } from '../../data/appRoleContext';
import { partyLevel, subscribeParty } from '../../data/party';
import {
  EQUIPMENT_SLOTS,
  playerPortraitUrl,
  type Player,
  type PlayerAbilitySlot,
  type PlayerSheet as PlayerSheetData,
  type PlayerAumento,
  type PlayerQuest,
  type PlayerUnlockKey,
  type PlayerUnlocks,
} from '../../data/players';
import { AumentoList, QuestList } from './SheetExtras';
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
  /** Solo admin: desbloquea pestañas o marca la quest de top (se manda el objeto completo). */
  onUnlocksChange: (unlocks: PlayerUnlocks) => Promise<void>;
  /** Solo admin: lista completa de quests añadidas (sin la de top). */
  onQuestsChange: (quests: PlayerQuest[]) => Promise<void>;
  /** Solo admin: lista completa de aumentos. */
  onAumentosChange: (aumentos: PlayerAumento[]) => Promise<void>;
};

type SheetTab = 'general' | 'habilidades' | 'equipo' | 'build' | 'desglose' | 'quest' | 'aumentos';
const SHEET_TABS: SheetTab[] = ['general', 'habilidades', 'equipo', 'build', 'desglose', 'quest', 'aumentos'];
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
  { id: 'quest', label: 'Quest' },
  { id: 'aumentos', label: 'Aumentos' },
];

/** Pestañas con candado hasta que el admin las desbloquea (players.unlocks). */
const LOCKED_TABS: Partial<Record<SheetTab, PlayerUnlockKey>> = {
  quest: 'quest',
  aumentos: 'aumentos',
};

const ADMIN_UNLOCKS: { key: PlayerUnlockKey; label: string; hint: string }[] = [
  { key: 'quest', label: 'Pestaña Quest', hint: 'Desbloquea la pestaña Quest' },
  { key: 'aumentos', label: 'Pestaña Aumentos', hint: 'Desbloquea la pestaña Aumentos' },
  { key: 'questVisible', label: 'Quests visibles para players', hint: 'Si está apagado, los players no ven las quests aunque la pestaña esté desbloqueada' },
  { key: 'aumentosVisible', label: 'Aumentos visibles para players', hint: 'Si está apagado, los players no ven los aumentos aunque la pestaña esté desbloqueada' },
];

/** questVisible es visible por defecto; el resto de desbloqueos empiezan apagados. */
const unlockOn = (unlocks: PlayerUnlocks, key: PlayerUnlockKey): boolean =>
  key === 'questVisible' || key === 'aumentosVisible' ? unlocks[key] !== false : unlocks[key] === true;

/** Aviso para el admin: ve el contenido aunque los players no puedan. */
const AdminNotice = ({ locked, hidden, label, busy, onUnlock, onShow }: {
  locked: boolean;
  hidden: boolean;
  label: string;
  busy: boolean;
  onUnlock: () => void;
  onShow?: () => void;
}) => {
  if (!locked && !hidden) return null;
  return (
    <div className="sheet-admin-notice">
      <TabLock className="sheet-admin-notice__icon" />
      <span className="sheet-admin-notice__text">
        Vista de admin · {locked && hidden ? `${label} bloqueado y oculto para players` : locked ? `${label} bloqueado para players` : `${label} oculto para players`}
      </span>
      {locked && (
        <button type="button" className="sheet-quest__btn" disabled={busy} onClick={onUnlock}>
          {busy ? 'Guardando…' : `Desbloquear ${label}`}
        </button>
      )}
      {hidden && onShow && (
        <button type="button" className="sheet-quest__btn" disabled={busy} onClick={onShow}>
          {busy ? 'Guardando…' : 'Hacer visible'}
        </button>
      )}
    </div>
  );
};

const TabLock = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm3 3.5a1.75 1.75 0 0 1 1 3.19V19h-2v-2.31a1.75 1.75 0 0 1 1-3.19Z"
    />
  </svg>
);

const LockedTab = ({
  label,
  canUnlock,
  busy,
  onUnlock,
}: {
  label: string;
  canUnlock: boolean;
  busy: boolean;
  onUnlock: () => void;
}) => (
  <section className="sheet-panel sheet-locked">
    <TabLock className="sheet-locked__icon" />
    <div className="sheet-locked__title">{label} bloqueado</div>
    <p className="sheet-locked__sub">Completar quests para desbloquear</p>
    {canUnlock && (
      <button type="button" className="sheet-locked__btn" disabled={busy} onClick={onUnlock}>
        {busy ? 'Guardando…' : `Desbloquear ${label}`}
      </button>
    )}
  </section>
);

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
  onUnlocksChange,
  onQuestsChange,
  onAumentosChange,
}: Props) => {
  const { role, canEdit, playerName: myName } = useAppRole();
  const isMine = !!myName && normalizeName(myName) === normalizeName(player.name);
  const isAdmin = role === 'admin';
  const canManageExtras = isAdmin || canEdit;
  const unlocks = player.unlocks ?? {};
  /** 19–20 se desbloquean al completar una quest cuyo nombre contenga «top» (p. ej. «Quest de top»). */
  const topUnlocked = unlocks.questTop === true || (player.quests ?? []).some(q => q.done && /\btop\b/i.test(q.name));
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const setUnlock = async (key: PlayerUnlockKey, value: boolean) => {
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      await onUnlocksChange({ ...unlocks, [key]: value });
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      setUnlockBusy(false);
    }
  };
  const tabLocked = (id: SheetTab): boolean => {
    const key = LOCKED_TABS[id];
    return key !== undefined && unlocks[key] !== true;
  };
  /** Toggle de visualización: si está apagado, los players no ven la pestaña Quest. */
  const questsVisible = unlocks.questVisible !== false;
  const aumentosVisible = unlocks.aumentosVisible !== false;
  const tabHidden = (id: SheetTab): boolean =>
    !isAdmin && ((id === 'quest' && !questsVisible) || (id === 'aumentos' && !aumentosVisible));
  const [picker, setPicker] = useState<'equipamiento' | 'build' | null>(null);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const tabKey = `playerSheetTab:${player.name}`;
  const [storedTab, setTabState] = useState<SheetTab>(() => readTab(tabKey));
  const tab: SheetTab = tabHidden(storedTab) ? 'general' : storedTab;
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
            {isMine && <div className="sheet-side__mine">Tu ficha</div>}
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
          {isAdmin && (
            <div className="sheet-panel sheet-side__admin">
              <div className="sheet-panel__title">Admin · Desbloqueos</div>
              <div className="sheet-admin">
                {ADMIN_UNLOCKS.map(({ key, label, hint }) => (
                  <label key={key} className="sheet-admin__row" title={hint}>
                    <input
                      type="checkbox"
                      checked={unlockOn(unlocks, key)}
                      disabled={unlockBusy}
                      onChange={event => void setUnlock(key, event.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {unlockError && <p className="calc-build-error">{unlockError}</p>}
            </div>
          )}
        </aside>

        <div className="sheet-content">
          <div className="sheet-tabs" role="tablist" aria-label="Secciones de la ficha">
            {TABS.filter(entry => !tabHidden(entry.id)).map(entry => {
              const locked = tabLocked(entry.id);
              const hiddenForPlayers = isAdmin && ((entry.id === 'quest' && !questsVisible) || (entry.id === 'aumentos' && !aumentosVisible));
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.id}
                  className={cx('sheet-tab', tab === entry.id && 'sheet-tab--active', locked && 'sheet-tab--locked')}
                  title={locked ? 'Bloqueado · Completar quests para desbloquear' : hiddenForPlayers ? 'Oculto para players' : undefined}
                  onClick={() => setTab(entry.id)}
                >
                  {locked && <TabLock className="sheet-tab__lock" />}
                  {entry.label}
                  {hiddenForPlayers && <span className="sheet-tab__hidden" aria-label="Oculto para players">🚫</span>}
                </button>
              );
            })}
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
                lockFutureLevels={!topUnlocked}
              />
            </section>
          )}

          {(tab === 'quest' || tab === 'aumentos') && tabLocked(tab) && !isAdmin && (
            <LockedTab
              label={tab === 'quest' ? 'Quest' : 'Aumentos'}
              canUnlock={false}
              busy={unlockBusy}
              onUnlock={() => void setUnlock(tab, true)}
            />
          )}

          {tab === 'quest' && (!tabLocked('quest') || isAdmin) && (
            <section className="sheet-panel">
              <div className="sheet-panel__title">Quests</div>
              {isAdmin && (
                <AdminNotice
                  locked={tabLocked('quest')}
                  hidden={!questsVisible}
                  label="Quest"
                  busy={unlockBusy}
                  onUnlock={() => void setUnlock('quest', true)}
                  onShow={() => void setUnlock('questVisible', true)}
                />
              )}
              <ul className="sheet-quests">
                <QuestList quests={player.quests ?? []} canEdit={canManageExtras} showHidden={canManageExtras} onChange={onQuestsChange} />
              </ul>
              {unlockError && <p className="calc-build-error">{unlockError}</p>}
            </section>
          )}

          {tab === 'aumentos' && (!tabLocked('aumentos') || isAdmin) && (
            <section className="sheet-panel">
              <div className="sheet-panel__title">Aumentos</div>
              {isAdmin && (
                <AdminNotice
                  locked={tabLocked('aumentos')}
                  hidden={!aumentosVisible}
                  label="Aumentos"
                  busy={unlockBusy}
                  onUnlock={() => void setUnlock('aumentos', true)}
                  onShow={() => void setUnlock('aumentosVisible', true)}
                />
              )}
              <AumentoList aumentos={player.aumentos ?? []} canEdit={canManageExtras} showHidden={canManageExtras} onChange={onAumentosChange} />
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
