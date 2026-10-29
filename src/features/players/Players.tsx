import { useState } from 'react';
import type { Ability } from '../../data/champions';
import { PLAYERS, playerPortraitUrl, savePlayerPatch, type Player } from '../../data/players';
import { normalizeName } from '../../lib/text';
import { DEFAULT_DAMAGE_INPUTS, type DamageInputs } from '../calculos/damage';
import DamagePanel from '../calculos/DamagePanel';
import PickerCard from '../calculos/PickerCard';
import { playerStatsDocument } from '../calculos/playerTotals';
import '../calculos/Calculos.css';
import PlayerSheet from './PlayerSheet';
import './Players.css';

const Players = () => {
  const [player, setPlayer] = useState<Player | null>(null);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState(DEFAULT_DAMAGE_INPUTS);
  const [saving, setSaving] = useState(false);
  const [equipError, setEquipError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [combatError, setCombatError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const updateDamageInputs = (patch: Partial<DamageInputs>) =>
    setDamageInputs(prev => ({ ...prev, ...patch }));

  const leavePlayer = () => {
    setPlayer(null);
    setEquipError(null);
    setBuildError(null);
    setCombatError(null);
    setSheetError(null);
  };

  const updatePlayerList = async (
    patch: Partial<Pick<Player, 'build' | 'equipamiento' | 'hp' | 'actualHp' | 'escudo' | 'vidaTemporal' | 'mana' | 'actualMana' | 'sheet'>>,
  ) => {
    if (!player || saving) return;
    const name = player.name;
    const previous = player;
    const isCombat =
      'hp' in patch || 'actualHp' in patch || 'escudo' in patch || 'vidaTemporal' in patch
      || 'mana' in patch || 'actualMana' in patch;
    const isSheet = 'sheet' in patch;
    // El total guardado en `stats` depende de la ficha y del equipamiento: se recalcula si cambia cualquiera.
    const recalc = isSheet || ('equipamiento' in patch && patch.equipamiento !== undefined);
    const payload = recalc
      ? {
          ...patch,
          stats: playerStatsDocument(
            isSheet ? patch.sheet : player.sheet,
            patch.equipamiento ?? player.equipamiento,
          ),
        }
      : patch;
    setPlayer({ ...player, ...payload });
    setSaving(true);
    setEquipError(null);
    setBuildError(null);
    setCombatError(null);
    setSheetError(null);
    try {
      const saved = await savePlayerPatch(name, payload);
      setPlayer(current => (current && normalizeName(current.name) === normalizeName(name) ? saved : current));
    } catch (error) {
      setPlayer(current => (current && normalizeName(current.name) === normalizeName(name) ? previous : current));
      const message = error instanceof Error ? error.message : 'No se pudo guardar';
      if ('equipamiento' in patch) setEquipError(message);
      else if (isSheet) setSheetError(message);
      else if (isCombat) setCombatError(message);
      else setBuildError(message);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (ability) {
    return (
      <div className="players-root">
        <DamagePanel
          ability={ability}
          inputs={damageInputs}
          onInputsChange={updateDamageInputs}
          onBack={() => setAbility(null)}
        />
      </div>
    );
  }

  return (
    <div className="players-root">
      {player ? (
        <PlayerSheet
          player={player}
          saving={saving}
          equipError={equipError}
          buildError={buildError}
          combatError={combatError}
          sheetError={sheetError}
          onBack={leavePlayer}
          onSelectAbility={setAbility}
          onEquipamientoChange={equipamiento => { void updatePlayerList({ equipamiento }); }}
          onBuildChange={build => { void updatePlayerList({ build }); }}
          onCombatChange={combat => updatePlayerList(combat)}
          onSheetChange={sheet => updatePlayerList({ sheet })}
        />
      ) : (
        <>
          <div className="calc-section-title">Fichas de personaje</div>
          <div className="calc-grid">
            {PLAYERS.map(entry => {
              const portrait = playerPortraitUrl(entry.image);
              return (
                <PickerCard key={entry.name} name={entry.name} onClick={() => setPlayer(entry)}>
                  <div className="players-picker__portrait">
                    {portrait
                      ? <img src={portrait} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />
                      : <span aria-hidden="true">👤</span>}
                  </div>
                  {entry.rol && <div className="players-picker__rol">{entry.rol}</div>}
                </PickerCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Players;
