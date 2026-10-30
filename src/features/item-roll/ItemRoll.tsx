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

const ItemRoll = () => {
  const canEdit = useCanEdit();
  const loot = useLootRoll();
  const spawn = useSpawnRoll();

  return (
    <div className="irs-wrap">
      <div className="irs-inner">
        <div className="irs-header">
          <div className="irs-title">Tabla de Botín</div>
          {!canEdit && <p className="irs-readonly">Solo lectura: las tiradas las hace el admin.</p>}
        </div>

        <div className="irs-rule">
          <span className="irs-rule-ornament">⚜</span>
        </div>

        <LootReel reel={loot.reel} spinning={loot.spinning} onDone={loot.finish} />
        {loot.result && !loot.spinning && (
          <div className={cx('irs-save', 'irs-reel-save', loot.saveError && 'irs-save--error')}>
            {loot.saving ? 'Guardando en el inventario...' : (loot.saveError ?? 'Añadido al inventario')}
          </div>
        )}

        <div className="irs-layout">
          <div className="irs-panel">
            {SPAWN_BUTTONS.map(({ type, className, icon, label }) => (
              <button key={type} className={cx('irs-btn', className)} disabled={!canEdit} onClick={() => spawn.start(type)} title={canEdit ? undefined : 'Solo admin'}>
                <span className="irs-btn-icon">{icon}</span>
                <span className="irs-btn-label">{label}</span>
                <span className="irs-btn-badge">{getSpawnChance(type)} %</span>
              </button>
            ))}

            <div className="irs-sep" />

            {ROLL_BUTTONS.map(({ rarity, className, icon, label }) => (
              <button
                key={rarity}
                className={cx('irs-btn', className)}
                onClick={() => loot.roll(rarity)}
                disabled={loot.rolling}
              >
                <span className="irs-btn-icon">{icon}</span>
                <span className="irs-btn-label">{label}</span>
              </button>
            ))}

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

          <div className="irs-wheel-panel">
            <MedievalWheel segments={spawn.segments} spinTo={spawn.spinTo} onResult={spawn.finish} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemRoll;
