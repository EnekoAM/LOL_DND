import { useState } from 'react';
import { ABILITY_KEYS, type Ability, type Champion } from '../../data/champions';
import { findItem } from '../../data/items';
import { normalizeName } from '../../lib/text';
import AbilityCard from './AbilityCard';
import BuildPicker from './BuildPicker';
import ItemTile from './ItemTile';
import SelectionHeader from './SelectionHeader';
import StatsTable from './StatsTable';

type Props = {
  champion: Champion;
  onBack: () => void;
  onSelectAbility: (ability: Ability) => void;
};

const ChampionDetail = ({ champion, onBack, onSelectAbility }: Props) => {
  const [build, setBuild] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const removeAt = (items: string[], index: number) => items.filter((_, itemIndex) => itemIndex !== index);

  const addToBuild = (itemName: string) => {
    if (build.some(name => normalizeName(name) === normalizeName(itemName))) return;
    setBuild(current => [...current, itemName]);
  };

  return (
    <>
      <SelectionHeader name={champion.champion} backLabel="← Cambiar campeón" onBack={onBack} />

      {/* La build local alimenta la tabla: cada ítem suma a las stats (sin ficha de jugador). */}
      <StatsTable playerName={champion.champion} equipment={build} />

      <div className="calc-grid">
        {ABILITY_KEYS.map(key => {
          const ability = champion.abilities[key];
          return ability && (
            <AbilityCard
              key={key}
              label={key}
              name={ability.name || 'Sin nombre'}
              ability={ability}
              onSelect={onSelectAbility}
            />
          );
        })}
      </div>

      <div className="calc-section-title calc-section-title--spaced">Build</div>
      {build.length === 0 && (
        <p className="calc-build-empty">Todavía no hay ítems en la build. Añade ítems para ver cómo cambian las estadísticas.</p>
      )}
      <div className="calc-build-grid">
        {build.map((itemName, index) => (
          <ItemTile
            key={`${itemName}-${index}`}
            name={itemName}
            item={findItem(itemName)}
            onRemove={() => setBuild(current => removeAt(current, index))}
          />
        ))}
        <button
          type="button"
          className="calc-item-card calc-item-card--add"
          onClick={() => setPickerOpen(true)}
        >
          <div className="calc-item-card__no-img">+</div>
          <div className="calc-item-card__name">Añadir</div>
        </button>
      </div>

      {pickerOpen && (
        <BuildPicker
          title="Añadir a la build"
          busy={false}
          taken={build}
          takenLabel="En la build"
          onAdd={addToBuild}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
};

export default ChampionDetail;
