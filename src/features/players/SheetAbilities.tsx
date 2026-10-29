import { useState } from 'react';
import { findAbility, findAbilityRef, type Ability } from '../../data/champions';
import {
  PLAYER_ABILITY_SLOTS,
  basicAttackEntries,
  type Player,
  type PlayerAbilitySlot,
} from '../../data/players';
import { formatPercentList } from '../../lib/format';
import AbilityCard from '../calculos/AbilityCard';
import AbilityAssignModal from '../habilidades/AbilityAssignModal';
import '../habilidades/Habilidades.css';
import './SheetAbilities.css';

type Props = {
  player: Player;
  saving: boolean;
  error: string | null;
  onSelectAbility: (ability: Ability) => void;
  /** Guarda el hueco; rechaza si la API falla (el modal sigue abierto con el error). */
  onAbilityChange: (slot: PlayerAbilitySlot, name: string | null) => Promise<void>;
};

const SheetAbilities = ({ player, saving, error, onSelectAbility, onAbilityChange }: Props) => {
  const [picking, setPicking] = useState<PlayerAbilitySlot | null>(null);
  const basicAttack = basicAttackEntries(player.basicAttack);
  const pickingEntry = PLAYER_ABILITY_SLOTS.find(entry => entry.slot === picking) ?? null;

  const choose = async (name: string | null) => {
    if (!picking || saving) return;
    try {
      await onAbilityChange(picking, name);
      setPicking(null);
    } catch {
      // El error se enseña dentro del modal.
    }
  };

  return (
    <>
      <section className="sheet-panel">
        <div className="sheet-panel__title">Auto-ataques</div>
        <div className="calc-grid">
          {basicAttack.length > 0 ? (
            <div className="calc-card calc-card--ability" title="Ataque básico">
              <div className="calc-card__key">[AA]</div>
              <div className="calc-card__name">Ataque básico</div>
              {basicAttack.map((entry, index) => (
                <div key={`${entry.type}-${index}`} className="calc-card__damage">
                  {entry.type}: {formatPercentList(entry.scaling)}
                </div>
              ))}
            </div>
          ) : (
            <div className="calc-card__name">Sin ataque básico definido</div>
          )}
        </div>
      </section>

      <section className="sheet-panel">
        <div className="sheet-panel__title">Habilidades</div>
        <div className="calc-grid">
          {PLAYER_ABILITY_SLOTS.map(({ slot, label }) => {
            const abilityName = player.abilities[slot];
            const ref = findAbilityRef(abilityName);
            return (
              <div key={slot} className="sheet-ability">
                <AbilityCard
                  label={label}
                  name={abilityName ?? 'No definida'}
                  ability={findAbility(abilityName)}
                  onSelect={onSelectAbility}
                />
                {ref?.champion && <div className="sheet-ability__origin">{ref.champion}</div>}
                <button
                  type="button"
                  className="sheet-ability__change"
                  disabled={saving}
                  onClick={() => setPicking(slot)}
                >
                  {abilityName ? 'Cambiar' : 'Asignar'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {pickingEntry && (
        <AbilityAssignModal
          playerName={player.name}
          rol={player.rol}
          slotLabel={pickingEntry.key}
          kind={pickingEntry.kind}
          currentName={player.abilities[pickingEntry.slot] ?? null}
          takenNames={PLAYER_ABILITY_SLOTS
            .filter(({ slot }) => slot !== pickingEntry.slot)
            .map(({ slot }) => player.abilities[slot])
            .filter((name): name is string => !!name)}
          revision={0}
          saving={saving}
          error={error}
          onChoose={name => { void choose(name); }}
          onClose={() => {
            if (!saving) setPicking(null);
          }}
        />
      )}
    </>
  );
};

export default SheetAbilities;
