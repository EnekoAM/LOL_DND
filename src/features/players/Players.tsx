import { useEffect, useRef, useState } from 'react';
import type { Ability } from '../../data/champions';
import { useMyPlayerName } from '../../data/appRoleContext';
import { OPEN_PLAYER_EVENT, OPEN_PLAYER_KEY, PLAYERS, PLAYERS_HYDRATED_EVENT, playerPortraitUrl, savePlayerPatch, type Player, type PlayerAbilitySlot, type PlayerMechanic } from '../../data/players';
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

const Players = () => {
  const myName = useMyPlayerName();
  const isMine = (name: string) => !!myName && normalizeName(name) === normalizeName(myName);
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
  // «Mi ficha» desde la cabecera con Players ya abierto.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const found = findSaved((event as CustomEvent<string>).detail ?? null);
      if (!found) return;
      setRestoring(false);
      setAbility(null);
      setPlayer(found);
    };
    window.addEventListener(OPEN_PLAYER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PLAYER_EVENT, onOpen);
  }, []);
  const [ability, setAbility] = useState<Ability | null>(null);
  const [damageInputs, setDamageInputs] = useState(DEFAULT_DAMAGE_INPUTS);
  // Los guardados van en cola: cada clic cambia al momento solo lo pulsado, sin bloquear (ni apagar) el resto de la ficha.
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    pendingRef.current += 1;
    const run = queueRef.current.catch(() => undefined).then(task);
    queueRef.current = run.catch(() => undefined);
    return run.finally(() => { pendingRef.current -= 1; });
  };
  const sameName = (a: Player | null, name: string) => !!a && normalizeName(a.name) === normalizeName(name);
  // Otra pestaña guardó un jugador: la ficha abierta toma la versión nueva (salvo si aquí hay un guardado en curso).
  const playersRevision = useLiveRevision('players');
  useEffect(() => {
    if (playersRevision === 0 || pendingRef.current > 0) return;
    setPlayer(current => (current ? findSaved(current.name) ?? current : current));
  }, [playersRevision]);
  const [equipError, setEquipError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [combatError, setCombatError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [abilityError, setAbilityError] = useState<string | null>(null);
  const [mechanicError, setMechanicError] = useState<string | null>(null);

  const updateDamageInputs = (patch: Partial<DamageInputs>) =>
    setDamageInputs(prev => ({ ...prev, ...patch }));

  const clearErrors = () => {
    setEquipError(null);
    setBuildError(null);
    setCombatError(null);
    setSheetError(null);
    setAbilityError(null);
    setMechanicError(null);
  };

  const leavePlayer = () => {
    setRestoring(false);
    setPlayer(null);
    clearErrors();
  };

  // Cambio rápido desde la propia ficha (sin volver a la lista); bloqueado mientras se guarda.
  const switchPlayer = (next: Player) => {
    setRestoring(false);
    setPlayer(findSaved(next.name) ?? next);
    clearErrors();
  };

  const updatePlayerList = (
    patch: Partial<Pick<Player, 'build' | 'equipamiento' | 'hp' | 'actualHp' | 'escudo' | 'vidaTemporal' | 'mana' | 'actualMana' | 'inspiration' | 'accentColor' | 'shortRestsUsed' | 'sheet' | 'unlocks' | 'quests' | 'aumentos' | 'background' | 'mechanic' | 'stacks' | 'cooldowns' | 'activeEffects'>>,
  ): Promise<void> => {
    if (!player) return Promise.resolve();
    const name = player.name;
    const isCombat =
      'hp' in patch || 'actualHp' in patch || 'escudo' in patch || 'vidaTemporal' in patch
      || 'mana' in patch || 'actualMana' in patch || 'inspiration' in patch || 'accentColor' in patch || 'shortRestsUsed' in patch;
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
    setPlayer(current => (sameName(current, name) && current ? { ...current, ...payload } : current));
    setEquipError(null);
    setBuildError(null);
    setCombatError(null);
    setSheetError(null);
    return enqueue(async () => {
      try {
        const saved = await savePlayerPatch(name, payload);
        // Solo el último guardado pendiente pisa la ficha: así no parpadean los clics que aún esperan.
        if (pendingRef.current === 1) setPlayer(current => (sameName(current, name) ? saved : current));
      } catch (error) {
        const lastSaved = findSaved(name);
        if (lastSaved) setPlayer(current => (sameName(current, name) ? lastSaved : current));
        const message = error instanceof Error ? error.message : 'No se pudo guardar';
        if ('unlocks' in patch || 'quests' in patch || 'aumentos' in patch || 'background' in patch || 'mechanic' in patch) {
          if ('mechanic' in patch) setMechanicError(message);
          /* cada panel muestra su propio error */
        }
        else if ('equipamiento' in patch) setEquipError(message);
        else if (isSheet) setSheetError(message);
        else if (isCombat) setCombatError(message);
        else setBuildError(message);
        throw error;
      }
    });
  };
  // Solo se manda el hueco cambiado: la API valida cada habilidad que recibe.
  const changeAbility = (slot: PlayerAbilitySlot, abilityName: string | null): Promise<void> => {
    if (!player) return Promise.resolve();
    const name = player.name;
    setPlayer(current => (sameName(current, name) && current
      ? { ...current, abilities: { ...current.abilities, [slot]: abilityName } }
      : current));
    setAbilityError(null);
    return enqueue(async () => {
      try {
        const saved = await savePlayerPatch(name, { abilities: { [slot]: abilityName } });
        if (pendingRef.current === 1) setPlayer(current => (sameName(current, name) ? saved : current));
      } catch (error) {
        const lastSaved = findSaved(name);
        if (lastSaved) setPlayer(current => (sameName(current, name) ? lastSaved : current));
        setAbilityError(error instanceof Error ? error.message : 'No se pudo guardar');
        throw error;
      }
    });
  };
  // Sube o baja un rango; la API recalcula los puntos libres y rechaza si no quedan o la R está bloqueada.
  const changeRank = (slot: RankedSlot, rank: number): Promise<void> => {
    if (!player) return Promise.resolve();
    const name = player.name;
    setAbilityError(null);
    return enqueue(async () => {
      try {
        const saved = await savePlayerPatch(name, { abilityRanks: { [slot]: rank } });
        setPlayer(current => (sameName(current, name) ? saved : current));
      } catch (error) {
        setAbilityError(error instanceof Error ? error.message : 'No se pudo guardar');
      }
    });
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
    <div className={player ? 'players-root players-root--sheet' : 'players-root'}>
      {player ? (
        <PlayerSheet
          key={normalizeName(player.name)}
          player={player}
          players={PLAYERS}
          onSwitchPlayer={switchPlayer}
          saving={false}
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
          onUnlocksChange={unlocks => updatePlayerList({ unlocks })}
          onQuestsChange={quests => updatePlayerList({ quests })}
          onAumentosChange={aumentos => updatePlayerList({ aumentos })}
          onBackgroundChange={background => updatePlayerList({ background })}
          onMechanicChange={(mechanic: PlayerMechanic) => {
            setMechanicError(null);
            return updatePlayerList({ mechanic });
          }}
          mechanicError={mechanicError}
          onAbilityChange={changeAbility}
          onRankChange={changeRank}
          onStacksChange={patch => {
            if (!player) return Promise.resolve();
            return updatePlayerList({ stacks: { ...(player.stacks ?? {}), ...patch } });
          }}
          onCooldownsChange={patch => {
            if (!player) return Promise.resolve();
            return updatePlayerList({ cooldowns: { ...(player.cooldowns ?? {}), ...patch } });
          }}
          onActiveEffectsChange={patch => {
            if (!player) return Promise.resolve();
            return updatePlayerList({ activeEffects: { ...(player.activeEffects ?? {}), ...patch } });
          }}
        />
      ) : (
        <>
          <div className="calc-section-title">Fichas de personaje</div>
          <div className="calc-grid">
            {[...PLAYERS].sort((a, b) => Number(isMine(b.name)) - Number(isMine(a.name))).map(entry => {
              const portrait = playerPortraitUrl(entry.image);
              const mine = isMine(entry.name);
              return (
                <PickerCard key={entry.name} name={entry.name} className={mine ? 'players-picker--mine' : undefined} onClick={() => setPlayer(entry)}>
                  {mine && <div className="players-picker__mine">Tu ficha</div>}
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
