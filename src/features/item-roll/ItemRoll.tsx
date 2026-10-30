import { useState } from 'react';
import type { LootRarity, SpawnType } from '../../data/loot';
import { cx } from '../../lib/cx';
import { getSpawnChance } from './loot';
import LootReel from './LootCaseReel';
import MedievalWheel from './MedievalWheel';
import { useLootRoll } from './useLootRoll';
import { useSpawnRoll } from './useSpawnRoll';
import { useCanEdit } from '../../data/appRoleContext';
import './ItemRoll.css';

type ButtonConfig = {
  className: string;
  icon: string;
  label: string;
};

const SPAWN_BUTTONS: (ButtonConfig & { type: SpawnType })[] = [
  { type: 'Basico', className: 'irs-btn--spawn-basic', icon: '🎁', label: 'Spawn Básico' },
  { type: 'Epico',  className: 'irs-btn--spawn-epic',  icon: '✨', label: 'Spawn Épico' },
];

const ROLL_BUTTONS: (ButtonConfig & { rarity: LootRarity })[] = [
  { rarity: 'basico',     className: 'irs-btn--basic',     icon: '○',  label: 'Roll Básico' },
  { rarity: 'epico',      className: 'irs-btn--epic',      icon: '◈',  label: 'Roll Épico' },
  { rarity: 'legendario', className: 'irs-btn--legendary', icon: '🔥', label: 'Roll Legendario' },
];

type Selection =
  | { kind: 'spawn'; type: SpawnType }
  | { kind: 'roll'; rarity: LootRarity };

const ItemRoll = () => {
  const canEdit = useCanEdit();
  const loot = useLootRoll();
  const spawn = useSpawnRoll();
  const [selected, setSelected] = useState<Selection | null>(null);

  // Mientras gira algo no se cambia de selección: desmontar la máquina a mitad de giro
  // dejaría la tirada sin terminar.
  const busy = loot.rolling || spawn.spinning;
  const canTirar = !busy && selected !== null && (selected.kind === 'roll' || canEdit);

  const selectSpawn = (type: SpawnType) => {
    if (busy || !canEdit) return;
    setSelected({ kind: 'spawn', type });
    spawn.preview(type);
  };

  const selectRoll = (rarity: LootRarity) => {
    if (busy) return;
    setSelected({ kind: 'roll', rarity });
  };

  const tirar = () => {
    if (!canTirar || !selected) return;
    if (selected.kind === 'spawn') spawn.start(selected.type);
    else loot.roll(selected.rarity);
  };

  const mode = selected?.kind ?? null;

  return (
    <div className="irs-wrap">
      <div className="irs-inner">
        <div className="irs-header">
          <div className="irs-title">Tabla de Botín</div>
          {!canEdit && <p className="irs-readonly">Solo lectura: los spawns los hace el admin.</p>}
        </div>

        <div className="irs-rule">
          <span className="irs-rule-ornament">⚜</span>
        </div>

        <div className="irs-controls">
          <div className="irs-panel" role="radiogroup" aria-label="Tipo de tirada">
            {SPAWN_BUTTONS.map(({ type, className, icon, label }) => {
              const isSel = selected?.kind === 'spawn' && selected.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  className={cx('irs-btn', className, isSel && 'irs-btn--selected')}
                  disabled={!canEdit || (busy && !isSel)}
                  onClick={() => selectSpawn(type)}
                  title={canEdit ? undefined : 'Solo admin'}
                >
                  <span className="irs-btn-icon">{icon}</span>
                  <span className="irs-btn-label">{label}</span>
                  <span className="irs-btn-badge">{getSpawnChance(type)} %</span>
                </button>
              );
            })}

            <div className="irs-sep" />

            {ROLL_BUTTONS.map(({ rarity, className, icon, label }) => {
              const isSel = selected?.kind === 'roll' && selected.rarity === rarity;
              return (
                <button
                  key={rarity}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  className={cx('irs-btn', className, isSel && 'irs-btn--selected')}
                  disabled={busy && !isSel}
                  onClick={() => selectRoll(rarity)}
                >
                  <span className="irs-btn-icon">{icon}</span>
                  <span className="irs-btn-label">{label}</span>
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
