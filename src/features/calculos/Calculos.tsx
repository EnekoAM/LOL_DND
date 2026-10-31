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
  const { role } = useAppRole();
  const defaultOnlyActive = role !== 'admin';
  const [champion, setChampion] = useState<Champion | null>(null);
  const [pickerFilter, setPickerFilter] = useState(() => baseFilter(defaultOnlyActive));
  const [favorites, toggleFavorite] = useStoredSet(FAVORITES_STORAGE_KEY);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState(DEFAULT_DAMAGE_INPUTS);

  const updatePickerFilter = (patch: Partial<ChampionPickerFilter>) =>
    setPickerFilter(prev => ({ ...prev, ...patch }));
  const updateDamageInputs = (patch: Partial<DamageInputs>) =>
    setDamageInputs(prev => ({ ...prev, ...patch }));

  return (
    <div className="calc-root">
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
