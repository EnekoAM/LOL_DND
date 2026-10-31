import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { LootRarity, SpawnType } from '../../data/loot';
import {
  adjustSpawnTokens,
  partySpawnTokens,
  spendSpawnToken,
  subscribeParty,
  type SpawnTokenKind,
} from '../../data/party';
import { useCanEdit } from '../../data/appRoleContext';
import { cx } from '../../lib/cx';
import { getSpawnChance } from './loot';
import LootReel from './LootCaseReel';
import MedievalWheel from './MedievalWheel';
import { useLootRoll } from './useLootRoll';
import { useSpawnRoll } from './useSpawnRoll';
import './ItemRoll.css';

type ButtonConfig = {
  className: string;
  icon: string;
  label: string;
};

const SPAWN_BUTTONS: (ButtonConfig & { type: SpawnType; token: SpawnTokenKind })[] = [
  { type: 'Basico', token: 'basico', className: 'irs-btn--spawn-basic', icon: '🎁', label: 'Spawn Básico' },
  { type: 'Epico', token: 'epico', className: 'irs-btn--spawn-epic', icon: '✨', label: 'Spawn Épico' },
];

const ROLL_BUTTONS: (ButtonConfig & { rarity: LootRarity; token: SpawnTokenKind })[] = [
  { rarity: 'basico', token: 'rollBasico', className: 'irs-btn--basic', icon: '○', label: 'Roll Básico' },
  { rarity: 'epico', token: 'rollEpico', className: 'irs-btn--epic', icon: '◈', label: 'Roll Épico' },
  { rarity: 'legendario', token: 'legendario', className: 'irs-btn--legendary', icon: '🔥', label: 'Roll Legendario' },
];

/** Tokens que el admin puede dar a mano (spawns + legendario). Los roll básico/épico salen de la ruleta. */
const ADMIN_GRANT: { kind: SpawnTokenKind; label: string }[] = [
  { kind: 'basico', label: 'Spawn Básico' },
  { kind: 'epico', label: 'Spawn Épico' },
  { kind: 'legendario', label: 'Legendario' },
];

type Selection =
  | { kind: 'spawn'; type: SpawnType; token: SpawnTokenKind }
  | { kind: 'roll'; rarity: LootRarity; token: SpawnTokenKind };

const spawnToRollToken = (type: SpawnType): SpawnTokenKind =>
  (type === 'Basico' ? 'rollBasico' : 'rollEpico');

const ItemRoll = () => {
  const canEdit = useCanEdit();
  const tokens = useSyncExternalStore(subscribeParty, partySpawnTokens);
  const loot = useLootRoll();
  const spawn = useSpawnRoll();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rewardNote, setRewardNote] = useState<string | null>(null);
  const awardedSpawn = useRef<string | null>(null);

  const busy = loot.rolling || spawn.spinning || busyAction;

  const tokenCount = (kind: SpawnTokenKind) => tokens[kind] ?? 0;

  const canUseSelection = (sel: Selection): boolean => {
    if (canEdit) return true;
    return tokenCount(sel.token) > 0;
  };

  const canTirar = !busy && selected !== null && canUseSelection(selected);

  const selectSpawn = (type: SpawnType, token: SpawnTokenKind) => {
    if (busy) return;
    if (!canEdit && tokenCount(token) <= 0) return;
    setSelected({ kind: 'spawn', type, token });
    setActionError(null);
    setRewardNote(null);
    spawn.preview(type);
  };

  const selectRoll = (rarity: LootRarity, token: SpawnTokenKind) => {
    if (busy) return;
    if (!canEdit && tokenCount(token) <= 0) return;
    setSelected({ kind: 'roll', rarity, token });
    setActionError(null);
    setRewardNote(null);
  };

  const tirar = () => {
    if (!canTirar || !selected) return;
    setActionError(null);
    setRewardNote(null);
    const run = async () => {
      setBusyAction(true);
      try {
        if (!canEdit) {
          await spendSpawnToken(selected.token);
        }
        if (selected.kind === 'spawn') spawn.start(selected.type);
        else loot.roll(selected.rarity);
      } catch (error: unknown) {
        setActionError(error instanceof Error ? error.message : 'No se pudo tirar');
      } finally {
        setBusyAction(false);
      }
    };
    void run();
  };

  const grantToken = (kind: SpawnTokenKind) => {
    if (!canEdit || busy) return;
    setActionError(null);
    void adjustSpawnTokens(kind, 1).catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : 'No se pudo dar el token');
    });
  };

  // Ruleta en sí → token de roll (no abre la caja sola).
  useEffect(() => {
    if (!spawn.outcome || spawn.outcome.success !== true || !spawn.outcome.type) return;
    const key = String(spawn.outcome.id);
    if (awardedSpawn.current === key) return;
    awardedSpawn.current = key;
    const rollToken = spawnToRollToken(spawn.outcome.type);
    const label = spawn.outcome.type === 'Basico' ? 'roll básico' : 'roll épico';
    void adjustSpawnTokens(rollToken, 1)
      .then(() => setRewardNote(`Token de ${label} ganado. Úsalo en el Roll correspondiente.`))
      .catch((error: unknown) => {
        setActionError(error instanceof Error ? error.message : 'No se pudo dar el token de roll');
      });
  }, [spawn.outcome]);

  const mode = selected?.kind ?? null;

  return (
    <div className="irs-wrap">
      <div className="irs-inner">
        <div className="irs-header">
          <div className="irs-title">Tabla de Botín</div>
          <p className="irs-tokens">
            Spawn Básico ×{tokenCount('basico')}
            {' · '}
            Spawn Épico ×{tokenCount('epico')}
            {' · '}
            Roll Básico ×{tokenCount('rollBasico')}
            {' · '}
            Roll Épico ×{tokenCount('rollEpico')}
            {' · '}
            Legendario ×{tokenCount('legendario')}
          </p>
          {!canEdit && (
            <p className="irs-readonly">
              Spawn gasta token de spawn; si sale sí, ganas un token de roll. El roll gasta ese token. El admin tira siempre.
            </p>
          )}
          {canEdit && (
            <div className="irs-token-grant" role="group" aria-label="Dar tokens">
              <span className="irs-token-grant__label">Dar token</span>
              {ADMIN_GRANT.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  className="irs-token-grant__btn"
                  disabled={busy}
                  onClick={() => grantToken(kind)}
                >
                  + {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="irs-rule">
          <span className="irs-rule-ornament">⚜</span>
        </div>

        <div className="irs-controls">
          <div className="irs-panel" role="radiogroup" aria-label="Tipo de tirada">
            {SPAWN_BUTTONS.map(({ type, token, className, icon, label }) => {
              const isSel = selected?.kind === 'spawn' && selected.type === type;
              const have = tokenCount(token);
              const allowed = canEdit || have > 0;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  className={cx('irs-btn', className, isSel && 'irs-btn--selected')}
                  disabled={!allowed || (busy && !isSel)}
                  onClick={() => selectSpawn(type, token)}
                  title={allowed ? undefined : 'Sin tokens de spawn'}
                >
                  <span className="irs-btn-icon">{icon}</span>
                  <span className="irs-btn-label">{label}</span>
                  <span className="irs-btn-badge">
                    {getSpawnChance(type)} % · ×{have}
                  </span>
                </button>
              );
            })}

            <div className="irs-sep" />

            {ROLL_BUTTONS.map(({ rarity, token, className, icon, label }) => {
              const isSel = selected?.kind === 'roll' && selected.rarity === rarity;
              const have = tokenCount(token);
              const allowed = canEdit || have > 0;
              return (
                <button
                  key={rarity}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  className={cx('irs-btn', className, isSel && 'irs-btn--selected')}
                  disabled={!allowed || (busy && !isSel)}
                  onClick={() => selectRoll(rarity, token)}
                  title={allowed ? undefined : 'Sin tokens de roll'}
                >
                  <span className="irs-btn-icon">{icon}</span>
                  <span className="irs-btn-label">{label}</span>
                  <span className="irs-btn-badge">×{have}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="irs-tirar"
            disabled={!canTirar}
            onClick={tirar}
            title={selected ? undefined : 'Elige primero un tipo de tirada'}
          >
            <span className="irs-tirar-icon" aria-hidden="true">⚄</span>
            <span className="irs-tirar-label">{busy ? 'Tirando…' : 'Tirar'}</span>
          </button>
        </div>

        {actionError && (
          <p className="irs-action-error" role="alert">{actionError}</p>
        )}
        {rewardNote && !actionError && (
          <p className="irs-reward-note" role="status">{rewardNote}</p>
        )}

        <div className="irs-stage">
          {mode === null && (
            <div className="irs-stage-empty">Elige un spawn o un roll y pulsa «Tirar».</div>
          )}

          {mode === 'roll' && (
            <>
              {loot.reel ? (
                <LootReel reel={loot.reel} spinning={loot.spinning} onDone={loot.finish} />
              ) : (
                <div className="irs-stage-empty">Pulsa «Tirar» para abrir la caja.</div>
              )}
              {loot.result && !loot.spinning && (
                <div className={cx('irs-save', 'irs-reel-save', loot.saveError && 'irs-save--error')}>
                  {loot.saving ? 'Guardando en el inventario...' : (loot.saveError ?? 'Añadido al inventario')}
                </div>
              )}
            </>
          )}

          {mode === 'spawn' && (
            <div className="irs-wheel-panel">
              <MedievalWheel segments={spawn.segments} spinTo={spawn.spinTo} onResult={spawn.finish} />
              {spawn.outcome && (
                <div
                  className={cx(
                    'irs-spawn-result',
                    spawn.outcome.success ? 'irs-spawn-result--ok' : 'irs-spawn-result--fail',
                  )}
                >
                  {spawn.outcome.success
                    ? `✦ Sale sí: token de ${spawn.outcome.type === 'Basico' ? 'roll básico' : 'roll épico'}`
                    : spawn.outcome.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemRoll;
