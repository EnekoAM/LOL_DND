import { useEffect, useState } from 'react';
import { useAppRole } from '../../data/appRoleContext';
import { CHAMPIONS, type Ability, type Champion } from '../../data/champions';
import { OPEN_RELATED_EVENT, takePendingOpen, type RelationRef } from '../../data/relations';
import { normalizeName } from '../../lib/text';
import { useStoredSet } from '../../hooks/useStoredSet';
import ChampionSheet from './ChampionSheet';
import ChampionPicker, { type ChampionPickerFilter } from './ChampionPicker';
import { DEFAULT_DAMAGE_INPUTS, type DamageInputs } from './damage';
import DamagePanel from './DamagePanel';
import './Calculos.css';

const FAVORITES_STORAGE_KEY = 'calc-champ-favorites';

const findChampion = (name: string | null): Champion | null =>
  name ? CHAMPIONS.find(c => normalizeName(c.champion) === normalizeName(name)) ?? null : null;

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
  // Si se llegó desde «Relaciones» de otra ficha, se abre directamente ese campeón.
  const [selectedChampion, setChampion] = useState<Champion | null>(() => findChampion(takePendingOpen('champion')));
  // Players nunca pueden abrir un campeón inactivo (p. ej. si el admin lo desactiva en vivo).
  const champion = selectedChampion && (canEdit || selectedChampion.active === true) ? selectedChampion : null;
  const [pickerFilter, setPickerFilter] = useState(() => baseFilter(!canEdit));
  const [favorites, toggleFavorite] = useStoredSet(FAVORITES_STORAGE_KEY);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState(DEFAULT_DAMAGE_INPUTS);

  // Relaciones dentro de la misma pantalla: abrir otro campeón.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const ref = (event as CustomEvent<RelationRef>).detail;
      if (ref?.kind !== 'champion') return;
      const next = findChampion(takePendingOpen('champion'));
      if (next) {
        setAbility(null);
        setChampion(next);
      }
    };
    window.addEventListener(OPEN_RELATED_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_RELATED_EVENT, onOpen);
  }, []);

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
