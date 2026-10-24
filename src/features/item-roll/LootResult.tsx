import { findItem } from '../../data/items';
import type { LootRarity } from '../../data/loot';
import type { LootRoll } from './loot';

type Props = {
  result: LootRoll | null;
  rolling: boolean;
  saveError: string | null;
};

const RARITY_STYLE: Record<LootRarity, { color: string; glow: string; badge: string }> = {
  basico: {
    color: '#a09070',
    glow: '0 0 12px rgba(150,120,80,0.4),  0 0 36px rgba(150,120,80,0.12)',
    badge: 'COMÚN',
  },
  epico: {
    color: '#8898e8',
    glow: '0 0 16px rgba(100,120,220,0.55), 0 0 48px rgba(80,100,200,0.2)',
    badge: 'ÉPICO',
  },
  legendario: {
    color: '#c9a84c',
    glow: '0 0 20px rgba(201,168,76,0.75),  0 0 60px rgba(201,168,76,0.28)',
    badge: 'LEGENDARIO',
  },
};

const RevealedItem = ({ result }: { result: LootRoll }) => {
  const { color, glow, badge } = RARITY_STYLE[result.rarity];
  const { name } = result.entry;
  const imageUrl = findItem(name)?.imagen;

  return (
    <div className="irs-item-inner">
      <div className="irs-item-obtained">— has obtenido —</div>
      <div className="irs-item-rarity-tag" style={{ color }}>
        [ {badge} ]
      </div>
      <div className="irs-item-name" style={{ color, textShadow: glow }}>
        {name}
      </div>
      {imageUrl && <img className="irs-item-img" src={imageUrl} alt={name} style={{ boxShadow: glow }} />}
    </div>
  );
};

const LootResult = ({ result, rolling, saveError }: Props) => (
  <>
    <div className="irs-item-box">
      <div
        className="irs-item-box__glow"
        style={{
          background: result
            ? `radial-gradient(ellipse at 50% 0%, ${RARITY_STYLE[result.rarity].color}18, transparent 65%)`
            : 'none',
        }}
      />

      {result ? (
        <RevealedItem result={result} />
      ) : (
        <div className="irs-item-empty">
          {rolling ? 'Consultando el oráculo...' : '— Ningún ítem revelado —'}
        </div>
      )}
    </div>

    {result && (
      <div className={saveError ? 'irs-save irs-save--error' : 'irs-save'}>
        {rolling ? 'Guardando en el inventario...' : (saveError ?? 'Añadido al inventario')}
      </div>
    )}
  </>
);

export default LootResult;
