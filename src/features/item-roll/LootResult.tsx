import { findItem } from '../../data/items';
import type { LootRoll } from './loot';
import { RARITY_STYLE } from './rarityStyle';

type Props = {
  result: LootRoll | null;
  spinning: boolean;
  saving: boolean;
  saveError: string | null;
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

const LootResult = ({ result, spinning, saving, saveError }: Props) => (
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
          {spinning ? 'Consultando el oráculo...' : '— Ningún ítem revelado —'}
        </div>
      )}
    </div>

    {result && (
      <div className={saveError ? 'irs-save irs-save--error' : 'irs-save'}>
        {saving ? 'Guardando en el inventario...' : (saveError ?? 'Añadido al inventario')}
      </div>
    )}
  </>
);

export default LootResult;
