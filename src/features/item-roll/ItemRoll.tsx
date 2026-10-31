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

const ROLL_BUTTONS: (ButtonConfig & { rarity: LootRarity; token: SpawnTokenKind | null })[] = [
  { rarity: 'basico', token: null, className: 'irs-btn--basic', icon: '○', label: 'Roll Básico' },
  { rarity: 'epico', token: null, className: 'irs-btn--epic', icon: '◈', label: 'Roll Épico' },
  { rarity: 'legendario', token: 'legendario', className: 'irs-btn--legendary', icon: '🔥', label: 'Roll Legendario' },
];

const TOKEN_LABEL: Record<SpawnTokenKind, string> = {
  basico: 'Básico',
  epico: 'Épico',
  legendario: 'Legendario',
};

type Selection =
  | { kind: 'spawn'; type: SpawnType; token: SpawnTokenKind }
  | { kind: 'roll'; rarity: LootRarity; token: SpawnTokenKind | null };

const ItemRoll = () => {
  const canEdit = useCanEdit();
  const tokens = useSyncExternalStore(subscribeParty, partySpawnTokens);
  const loot = useLootRoll();
  const spawn = useSpawnRoll();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const chainedSpawn = useRef<string | null>(null);
  const lootRollRef = useRef(loot.roll);
  lootRollRef.current = loot.roll;

  const busy = loot.rolling || spawn.spinning || busyAction;

  const tokenCount = (kind: SpawnTokenKind) => tokens[kind] ?? 0;

  const canUseSelection = (sel: Selection): boolean => {
    if (canEdit) return true;
    if (sel.kind === 'spawn') return tokenCount(sel.token) > 0;
    if (sel.token) return tokenCount(sel.token) > 0;
    return false;
  };

  const canTirar = !busy && selected !== null && canUseSelection(selected);

  const selectSpawn = (type: SpawnType, token: SpawnTokenKind) => {
    if (busy) return;
    if (!canEdit && tokenCount(token) <= 0) return;
    setSelected({ kind: 'spawn', type, token });
    setActionError(null);
    spawn.preview(type);
  };

  const selectRoll = (rarity: LootRarity, token: SpawnTokenKind | null) => {
    if (busy) return;
    if (!canEdit) {
      if (!token || tokenCount(token) <= 0) return;
    }
    setSelected({ kind: 'roll', rarity, token });
    setActionError(null);
  };

  const tirar = () => {
    if (!canTirar || !selected) return;
    setActionError(null);
    const run = async () => {
      setBusyAction(true);
      try {
        if (!canEdit) {
          const kind = selected.kind === 'spawn' ? selected.token : selected.token;
          if (!kind) throw new Error('Necesitas un token para tirar');
          await spendSpawnToken(kind);
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

  // Si el spawn sale bien, abre automáticamente la tirada de esa rareza.
  useEffect(() => {
    if (!spawn.outcome?.success || !spawn.outcome.type) return;
    const key = `${spawn.outcome.type}:${spawn.outcome.message}`;
    if (chainedSpawn.current === key) return;
    chainedSpawn.current = key;
    const rarity: LootRarity = spawn.outcome.type === 'Basico' ? 'basico' : 'epico';
    setSelected({ kind: 'roll', rarity, token: null });
    lootRollRef.current(rarity);
  }, [spawn.outcome]);

  const mode = selected?.kind ?? null;
  const visibleRolls = canEdit
    ? ROLL_BUTTONS
    : ROLL_BUTTONS.filter(btn => btn.token === 'legendario');

  return (
    <div className="irs-wrap">
      <div className="irs-inner">
        <div className="irs-header">
          <div className="irs-title">Tabla de Botín</div>
          <p className="irs-tokens">
            Tokens:{' '}
            <span>Básico ×{tokenCount('basico')}</span>
            {' · '}
            <span>Épico ×{tokenCount('epico')}</span>
            {' · '}
            <span>Legendario ×{tokenCount('legendario')}</span>
          </p>
          {!canEdit && (
            <p className="irs-readonly">
              Gasta un token para tirar (o guárdalo). El admin puede tirar siempre.
            </p>
          )}
          {canEdit && (
            <div className="irs-token-grant" role="group" aria-label="Dar tokens de spawn">
              <span className="irs-token-grant__label">Dar token</span>
              {(Object.keys(TOKEN_LABEL) as SpawnTokenKind[]).map(kind => (
                <button
                  key={kind}
                  type="button"
                  className="irs-token-grant__btn"
                  disabled={busy}
                  onClick={() => grantToken(kind)}
                >
                  + {TOKEN_LABEL[kind]}
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
                  title={allowed ? undefined : 'Sin tokens'}
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

            {visibleRolls.map(({ rarity, token, className, icon, label }) => {
              const isSel = selected?.kind === 'roll' && selected.rarity === rarity;
              const have = token ? tokenCount(token) : null;
              const allowed = canEdit || (token !== null && (have ?? 0) > 0);
              return (
                <button
                  key={rarity}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  className={cx('irs-btn', className, isSel && 'irs-btn--selected')}
                  disabled={!allowed || (busy && !isSel)}
                  onClick={() => selectRoll(rarity, token)}
                  title={allowed ? undefined : 'Sin tokens'}
                >
                  <span className="irs-btn-icon">{icon}</span>
                  <span className="irs-btn-label">{label}</span>
                  {have !== null && <span className="irs-btn-badge">×{have}</span>}
                  {canEdit && token === null && <span className="irs-btn-badge">admin</span>}
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
                  {spawn.outcome.message}
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
