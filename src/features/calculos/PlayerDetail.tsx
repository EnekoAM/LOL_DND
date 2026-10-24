import { useState } from 'react';
import { findAbility, type Ability } from '../../data/champions';
import { findItem } from '../../data/items';
import { EQUIPMENT_SLOTS, PLAYER_ABILITY_SLOTS, type Player } from '../../data/players';
import { itemAvailability } from '../items/stock';
import { formatPercentList } from '../../lib/format';
import { normalizeName } from '../../lib/text';
import AbilityCard from './AbilityCard';
import BuildPicker from './BuildPicker';
import ItemTile, { type ItemTileState } from './ItemTile';
import SelectionHeader from './SelectionHeader';
import StatsTable from './StatsTable';

type Props = {
  player: Player;
  saving: boolean;
  equipError: string | null;
  buildError: string | null;
  onBack: () => void;
  onSelectAbility: (ability: Ability) => void;
  onEquipamientoChange: (equipamiento: string[]) => void;
  onBuildChange: (build: string[]) => void;
};

const getBuildItemState = (player: Player, itemName: string): ItemTileState => {
  const key = normalizeName(itemName);
  if (player.equipamiento.some(equipped => normalizeName(equipped) === key)) return 'equipped';
  if ((findItem(itemName)?.cantidad ?? 0) > 0) return 'owned';
  return 'none';
};

const PlayerDetail = ({
  player,
  saving,
  equipError,
  buildError,
  onBack,
  onSelectAbility,
  onEquipamientoChange,
  onBuildChange,
}: Props) => {
  const [picker, setPicker] = useState<'equipamiento' | 'build' | null>(null);

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

  return (
  <>
    <SelectionHeader name={player.name} backLabel="← Cambiar player" onBack={onBack} />

    {player.basicAttack && (
      <div className="calc-basic-attack">
        <strong>Ataque básico</strong>
        {formatPercentList(player.basicAttack.scaling)} AP
      </div>
    )}

    <StatsTable
      playerName={player.name}
      equipment={player.equipamiento}
    />

    <div className="calc-grid">
      {PLAYER_ABILITY_SLOTS.map(({ slot, label }) => {
        const abilityName = player.abilities[slot];
        return (
          <AbilityCard
            key={slot}
            label={label}
            name={abilityName ?? 'No definida'}
            ability={findAbility(abilityName)}
            onSelect={onSelectAbility}
          />
        );
      })}
    </div>

    <div className="calc-section-title calc-section-title--spaced">Equipamiento actual</div>
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

    <div className="calc-section-title">Build deseada</div>
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
  </>
  );
};

export default PlayerDetail;
