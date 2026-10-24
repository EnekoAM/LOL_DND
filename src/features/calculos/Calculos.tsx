import { useState } from 'react';
import type { Ability, Champion } from '../../data/champions';
import { PLAYERS, savePlayerPatch, type Player } from '../../data/players';
import { normalizeName } from '../../lib/text';
import { useStoredSet } from '../../hooks/useStoredSet';
import ChampionDetail from './ChampionDetail';
import ChampionPicker, { type ChampionPickerFilter } from './ChampionPicker';
import { DEFAULT_DAMAGE_INPUTS, type DamageInputs } from './damage';
import DamagePanel from './DamagePanel';
import PickerCard from './PickerCard';
import PlayerDetail from './PlayerDetail';
import './Calculos.css';

const FAVORITES_STORAGE_KEY = 'calc-champ-favorites';

const INITIAL_PICKER_FILTER: ChampionPickerFilter = {
  search: '',
  region: '',
  role: '',
  onlyFavorites: false,
};

/**
 * El estado vive aquí y no en cada sección porque el panel de daño sustituye a ambas:
 * al volver, el jugador, el campeón, los filtros y los valores de daño deben seguir igual.
 */
const Calculos = () => {
  const [player, setPlayer] = useState<Player | null>(null);
  const [champion, setChampion] = useState<Champion | null>(null);
  const [pickerFilter, setPickerFilter] = useState(INITIAL_PICKER_FILTER);
  const [favorites, toggleFavorite] = useStoredSet(FAVORITES_STORAGE_KEY);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState(DEFAULT_DAMAGE_INPUTS);
  const [saving, setSaving] = useState(false);
  const [equipError, setEquipError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const updatePickerFilter = (patch: Partial<ChampionPickerFilter>) =>
    setPickerFilter(prev => ({ ...prev, ...patch }));
  const updateDamageInputs = (patch: Partial<DamageInputs>) =>
    setDamageInputs(prev => ({ ...prev, ...patch }));

  const leavePlayer = () => {
    setPlayer(null);
    setEquipError(null);
    setBuildError(null);
  };

  const updatePlayerList = async (patch: Partial<Pick<Player, 'build' | 'equipamiento'>>) => {
    if (!player || saving) return;
    const name = player.name;
    const previous = player;
    setPlayer({ ...player, ...patch });
    setSaving(true);
    setEquipError(null);
    setBuildError(null);
    try {
      const saved = await savePlayerPatch(name, patch);
      setPlayer(current => (current && normalizeName(current.name) === normalizeName(name) ? saved : current));
    } catch (error) {
      setPlayer(current => (current && normalizeName(current.name) === normalizeName(name) ? previous : current));
      const message = error instanceof Error ? error.message : 'No se pudo guardar';
      if ('equipamiento' in patch) setEquipError(message);
      else setBuildError(message);
    } finally {
      setSaving(false);
    }
  };

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
          <div className="calc-section-title">Calculadora por Player</div>
          {player ? (
            <PlayerDetail
              player={player}
              saving={saving}
              equipError={equipError}
              buildError={buildError}
              onBack={leavePlayer}
              onSelectAbility={setAbility}
              onEquipamientoChange={equipamiento => { void updatePlayerList({ equipamiento }); }}
              onBuildChange={build => { void updatePlayerList({ build }); }}
            />
          ) : (
            <div className="calc-grid">
              {PLAYERS.map(p => (
                <PickerCard key={p.name} name={p.name} onClick={() => setPlayer(p)} />
              ))}
            </div>
          )}

          <div className="calc-divider" />
          <div className="calc-section-title">Calculadora por Campeón (DM)</div>
          {champion ? (
            <ChampionDetail champion={champion} onBack={() => setChampion(null)} onSelectAbility={setAbility} />
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
