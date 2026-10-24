import type { LootRarity, SpawnType } from '../../data/loot';
import { cx } from '../../lib/cx';
import { getSpawnChance } from './loot';
import LootResult from './LootResult';
import MedievalWheel from './MedievalWheel';
import { useLootRoll } from './useLootRoll';
import { useSpawnRoll } from './useSpawnRoll';
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
  const loot = useLootRoll();
  const spawn = useSpawnRoll();

  return (
    <div className="irs-wrap">
      <div className="irs-inner">
        <div className="irs-header">
          <div className="irs-title">Tabla de Botín</div>
        </div>

        <div className="irs-rule">
          <span className="irs-rule-ornament">⚜</span>
        </div>

        <div className="irs-layout">
          <div className="irs-panel">
            {SPAWN_BUTTONS.map(({ type, className, icon, label }) => (
              <button key={type} className={cx('irs-btn', className)} onClick={() => spawn.start(type)}>
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

            <LootResult result={loot.result} rolling={loot.rolling} saveError={loot.saveError} />
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
