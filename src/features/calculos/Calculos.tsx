import { useState } from 'react';
import { useAppRole } from '../../data/appRoleContext';
import type { Ability, Champion } from '../../data/champions';
import { useStoredSet } from '../../hooks/useStoredSet';
import ChampionSheet from './ChampionSheet';
import ChampionPicker, { type ChampionPickerFilter } from './ChampionPicker';
import { DEFAULT_DAMAGE_INPUTS, type DamageInputs } from './damage';
import DamagePanel from './DamagePanel';
import './Calculos.css';

const FAVORITES_STORAGE_KEY = 'calc-champ-favorites';

const baseFilter = (onlyActive: boolean): ChampionPickerFilter => ({
  search: '',
  region: '',
  role: '',
  onlyFavorites: false,
  onlyLearned: false,
  onlyActive,
});

/**
 * Campeones: grid unificado (foto, rol, región, aprendidas) + detalle con daño y edición de habilidades.
 */
const Calculos = () => {
  const { canEdit } = useAppRole();
  const [selectedChampion, setChampion] = useState<Champion | null>(null);
  // Players nunca pueden abrir un campeón inactivo (p. ej. si el admin lo desactiva en vivo).
  const champion = selectedChampion && (canEdit || selectedChampion.active === true) ? selectedChampion : null;
  const [pickerFilter, setPickerFilter] = useState(() => baseFilter(!canEdit));
  const [favorites, toggleFavorite] = useStoredSet(FAVORITES_STORAGE_KEY);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState(DEFAULT_DAMAGE_INPUTS);

  const updatePickerFilter = (patch: Partial<ChampionPickerFilter>) =>
    setPickerFilter(prev => ({ ...prev, ...patch }));
  const updateDamageInputs = (patch: Partial<DamageInputs>) =>
    setDamageInputs(prev => ({ ...prev, ...patch }));

  return (
    <div className={champion && !ability ? 'calc-root calc-root--sheet' : 'calc-root'}>
      {ability ? (
        <DamagePanel
          ability={ability}
          inputs={damageInputs}
          onInputsChange={updateDamageInputs}
          onBack={() => setAbility(null)}
        />
      ) : (
        <>
          <div className="calc-section-title">Campeones</div>
          {champion ? (
            <ChampionSheet
              champion={champion}
              onBack={() => setChampion(null)}
              onSelectAbility={setAbility}
              onChampionChange={setChampion}
            />
          ) : (
            <ChampionPicker
              filter={pickerFilter}
              onFilterChange={updatePickerFilter}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onSelect={setChampion}
            />
          )}
        </>
      )}
    </div>
  );
};

export default Calculos;
