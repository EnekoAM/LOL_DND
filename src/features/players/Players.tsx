import { useEffect, useState } from 'react';
import type { Ability } from '../../data/champions';
import { PLAYERS, PLAYERS_HYDRATED_EVENT, playerPortraitUrl, savePlayerPatch, type Player, type PlayerAbilitySlot } from '../../data/players';
import type { RankedSlot } from '../../data/abilityRanks';
import { useLiveRevision } from '../../data/live';
import { normalizeName } from '../../lib/text';
import { DEFAULT_DAMAGE_INPUTS, type DamageInputs } from '../calculos/damage';
import DamagePanel from '../calculos/DamagePanel';
import PickerCard from '../calculos/PickerCard';
import { hpSyncPatch, playerMaxHp, playerStatsDocument } from '../calculos/playerTotals';
import '../calculos/Calculos.css';
import PlayerSheet from './PlayerSheet';
import './Players.css';

const OPEN_PLAYER_KEY = 'players.openPlayer';

const Players = () => {
  const readSaved = () => {
    try { return localStorage.getItem(OPEN_PLAYER_KEY); } catch { return null; }
  };
  const findSaved = (name: string | null) =>
    name ? PLAYERS.find(p => normalizeName(p.name) === normalizeName(name)) ?? null : null;
  const [player, setPlayer] = useState<Player | null>(() => findSaved(readSaved()));
  // Mientras haya un nombre guardado sin resolver (players aún sin cargar), no se borra la clave.
  const [restoring, setRestoring] = useState(() => !!readSaved() && PLAYERS.length === 0);
  useEffect(() => {
    if (!restoring) return;
    const tryRestore = () => {
      if (PLAYERS.length === 0) return;
      const found = findSaved(readSaved());
      if (found) setPlayer(found);
      setRestoring(false);
    };
    tryRestore();
    window.addEventListener(PLAYERS_HYDRATED_EVENT, tryRestore);
    return () => window.removeEventListener(PLAYERS_HYDRATED_EVENT, tryRestore);
  }, [restoring]);
  const openName = player?.name ?? null;
  useEffect(() => {
    if (restoring) return;
    try {
      if (openName) localStorage.setItem(OPEN_PLAYER_KEY, openName);
      else localStorage.removeItem(OPEN_PLAYER_KEY);
    } catch { /* ignore */ }
  }, [openName, restoring]);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState(DEFAULT_DAMAGE_INPUTS);
  const [saving, setSaving] = useState(false);
  // Otra pestaña guardó un jugador: la ficha abierta toma la versión nueva (salvo si aquí hay un guardado en curso).
  const playersRevision = useLiveRevision('players');
  useEffect(() => {
    if (playersRevision === 0 || saving) return;
    setPlayer(current => (current ? findSaved(current.name) ?? current : current));
  }, [playersRevision]);
  const [equipError, setEquipError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [combatError, setCombatError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [abilityError, setAbilityError] = useState<string | null>(null);

  const updateDamageInputs = (patch: Partial<DamageInputs>) =>
    setDamageInputs(prev => ({ ...prev, ...patch }));

  const leavePlayer = () => {
    setRestoring(false);
    setPlayer(null);
    setEquipError(null);
    setBuildError(null);
    setCombatError(null);
    setSheetError(null);
    setAbilityError(null);
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
    const nextSheet = isSheet ? patch.sheet : player.sheet;
    const nextEquipment = patch.equipamiento ?? player.equipamiento;
    // Los PG máximos salen del mismo total: si cambia, el actual se mueve lo mismo.
    const payload = recalc
      ? {
          ...patch,
          stats: playerStatsDocument(nextSheet, nextEquipment),
          ...hpSyncPatch(player, playerMaxHp(nextSheet, nextEquipment)),
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

  // Solo se manda el hueco cambiado: la API valida cada habilidad que recibe.
  const changeAbility = async (slot: PlayerAbilitySlot, abilityName: string | null) => {
    if (!player || saving) return;
    const name = player.name;
    const previous = player;
    setPlayer({ ...player, abilities: { ...player.abilities, [slot]: abilityName } });
    setSaving(true);
    setAbilityError(null);
    try {
      const saved = await savePlayerPatch(name, { abilities: { [slot]: abilityName } });
      setPlayer(current => (current && normalizeName(current.name) === normalizeName(name) ? saved : current));
    } catch (error) {
      setPlayer(current => (current && normalizeName(current.name) === normalizeName(name) ? previous : current));
      setAbilityError(error instanceof Error ? error.message : 'No se pudo guardar');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Sube o baja un rango; la API recalcula los puntos libres y rechaza si no quedan o la R está bloqueada.
  const changeRank = async (slot: RankedSlot, rank: number) => {
    if (!player || saving) return;
    const name = player.name;
    const previous = player;
    setSaving(true);
    setAbilityError(null);
    try {
      const saved = await savePlayerPatch(name, { abilityRanks: { [slot]: rank } });
      setPlayer(current => (current && normalizeName(current.name) === normalizeName(name) ? saved : current));
    } catch (error) {
      setPlayer(current => (current && normalizeName(current.name) === normalizeName(name) ? previous : current));
      setAbilityError(error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  // Al abrir el cálculo desde la ficha, el nivel de habilidad parte del rango actual.
  const selectAbility = (selected: Ability, rank?: number) => {
    if (rank && rank > 0) setDamageInputs(prev => ({ ...prev, level: rank }));
    setAbility(selected);
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
          abilityError={abilityError}
          onBack={leavePlayer}
          onSelectAbility={selectAbility}
          onEquipamientoChange={equipamiento => { void updatePlayerList({ equipamiento }); }}
          onBuildChange={build => { void updatePlayerList({ build }); }}
          onCombatChange={combat => updatePlayerList(combat)}
          onSheetChange={sheet => updatePlayerList({ sheet })}
          onAbilityChange={changeAbility}
          onRankChange={changeRank}
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
