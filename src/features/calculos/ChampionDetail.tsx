import { useMemo, useState } from 'react';
import { ABILITY_KEYS, CHAMPIONS, type Ability, type AbilityKey, type Champion } from '../../data/champions';
import { findItem } from '../../data/items';
import { normalizeName } from '../../lib/text';
import AbilityModal from '../habilidades/AbilityModal';
import '../habilidades/Habilidades.css';
import AbilityCard from './AbilityCard';
import BuildPicker from './BuildPicker';
import ItemTile from './ItemTile';
import SelectionHeader from './SelectionHeader';
import StatsTable from './StatsTable';

type Props = {
  champion: Champion;
  onBack: () => void;
  onSelectAbility: (ability: Ability) => void;
  onChampionChange?: (champion: Champion) => void;
};

const ChampionDetail = ({ champion, onBack, onSelectAbility, onChampionChange }: Props) => {
  const [build, setBuild] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<AbilityKey | null>(null);
  const [tick, setTick] = useState(0);

  const live = useMemo(() => {
    void tick;
    return CHAMPIONS.find(entry => normalizeName(entry.champion) === normalizeName(champion.champion)) ?? champion;
  }, [champion, tick]);

  const removeAt = (items: string[], index: number) => items.filter((_, itemIndex) => itemIndex !== index);

  const addToBuild = (itemName: string) => {
    if (build.some(name => normalizeName(name) === normalizeName(itemName))) return;
    setBuild(current => [...current, itemName]);
  };

  return (
    <>
      <SelectionHeader name={live.champion} backLabel="← Cambiar campeón" onBack={onBack} />

      {/* La build local alimenta la tabla: cada ítem suma a las stats (sin ficha de jugador). */}
      <StatsTable playerName={live.champion} equipment={build} />

      <div className="calc-grid">
        {ABILITY_KEYS.map(key => {
          const ability = live.abilities[key];
          return (
            <AbilityCard
              key={key}
              label={key}
              name={ability?.name || 'Sin nombre'}
              ability={ability ?? null}
              onSelect={onSelectAbility}
            >
              {ability?.learned && <div className="calc-ability-learned">Aprendida</div>}
              <div className="calc-ability-actions">
                <button
                  type="button"
                  className="calc-ability-edit"
                  onClick={() => setEditSlot(key)}
                >
                  Editar
                </button>
              </div>
            </AbilityCard>
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

      {editSlot && (
        <AbilityModal
          champion={live}
          slot={editSlot}
          onClose={() => setEditSlot(null)}
          onSaved={() => {
            setTick(n => n + 1);
            const next = CHAMPIONS.find(entry => normalizeName(entry.champion) === normalizeName(live.champion));
            if (next) onChampionChange?.(next);
          }}
        />
      )}
    </>
  );
};

export default ChampionDetail;
