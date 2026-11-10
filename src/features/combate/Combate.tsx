import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppRole } from '../../data/appRoleContext';
import { CHAMPIONS } from '../../data/champions';
import {
  endCombatRemote,
  loadCombat,
  newId,
  rollInitiative,
  saveCombat,
  sortByInitiative,
  tickEffectsFor,
  type CombatEffect,
  type CombatParticipant,
  type CombatState,
} from '../../data/combat';
import { useLiveRevision } from '../../data/live';
import { loadNpcs, type Npc } from '../../data/npcs';
import { PLAYERS, playerPortraitUrl, savePlayerPatch } from '../../data/players';
import { tickActiveEffects, tickCooldowns } from '../../data/stacks';
import { cx } from '../../lib/cx';
import CombatParticipantCard from './CombatParticipantCard';
import CombatParticipantPanel from './CombatParticipantPanel';
import CombatSearchCombobox from './CombatSearchCombobox';
import {
  championOption,
  effectNeedsValue,
  emptyCombatState,
  npcOption,
  type AddMode,
  type SearchOption,
} from './combatHelpers';
import './Combate.css';

const MODE_LABEL: Record<AddMode, string> = {
  player: 'Player',
  npc: 'NPC',
  champion: 'Campeón',
  custom: 'Custom',
};

export default function Combate() {
  const { role } = useAppRole();
  const isAdmin = role === 'admin';
  const combatRev = useLiveRevision('combat');
  const playersRev = useLiveRevision('players');
  const championsRev = useLiveRevision('champions');

  const [state, setState] = useState<CombatState>(emptyCombatState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [npcs, setNpcs] = useState<Npc[]>([]);

  const [addMode, setAddMode] = useState<AddMode>('npc');
  const [playerPick, setPlayerPick] = useState('');
  const [npcPick, setNpcPick] = useState<SearchOption | null>(null);
  const [championPick, setChampionPick] = useState<SearchOption | null>(null);
  const [customName, setCustomName] = useState('');
  const [qty, setQty] = useState('1');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [effectPick, setEffectPick] = useState<Record<string, string>>({});
  const [effectDur, setEffectDur] = useState<Record<string, string>>({});
  const [effectValue, setEffectValue] = useState<Record<string, string>>({});
  const [customEffect, setCustomEffect] = useState<Record<string, string>>({});
  const [trackerBump, setTrackerBump] = useState(0);

  const reload = useCallback(async () => {
    try {
      const next = await loadCombat();
      setState(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el combate');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload, combatRev]);

  useEffect(() => {
    void loadNpcs().then(setNpcs).catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    if (!playerPick && PLAYERS[0]) setPlayerPick(PLAYERS[0].name);
  }, [playersRev, playerPick]);

  const npcOptions = useMemo(() => npcs.map(npcOption), [npcs]);
  const championOptions = useMemo(
    () => CHAMPIONS.map(championOption),
    // CHAMPIONS se hidrata in-place; la revisión fuerza el recálculo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [championsRev, CHAMPIONS.length],
  );

  const persist = async (next: CombatState) => {
    if (!isAdmin || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveCombat(next);
      setState(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const ordered = useMemo(() => sortByInitiative(state.participants), [state.participants]);

  const syncOrder = (participants: CombatParticipant[], turnId?: string): CombatState => {
    const sorted = sortByInitiative(participants);
    let turnIndex = 0;
    if (turnId) {
      const idx = sorted.findIndex(p => p.id === turnId);
      turnIndex = idx >= 0 ? idx : 0;
    } else if (sorted.length > 0) {
      const currentId = ordered[state.turnIndex]?.id;
      const idx = currentId ? sorted.findIndex(p => p.id === currentId) : 0;
      turnIndex = idx >= 0 ? idx : 0;
    }
    return { ...state, participants: sorted, turnIndex };
  };

  const current = ordered[state.turnIndex];
  const selected = selectedId ? state.participants.find(p => p.id === selectedId) ?? null : null;

  const switchMode = (mode: AddMode) => {
    setAddMode(mode);
    setError(null);
    setNpcPick(null);
    setChampionPick(null);
  };

  const addParticipants = () => {
    if (!isAdmin) return;
    const count = Math.max(1, Math.min(12, Number.parseInt(qty, 10) || 1));
    const nextList = [...state.participants];

    if (addMode === 'player') {
      const player = PLAYERS.find(p => p.name === playerPick);
      if (!player) return;
      if (nextList.some(p => p.kind === 'player' && p.sourceId === player.name)) {
        setError(`${player.name} ya está en el combate`);
        return;
      }
      nextList.push({
        id: newId(),
        kind: 'player',
        name: player.name,
        sourceId: player.name,
        initiative: 0,
        defeated: false,
        image: playerPortraitUrl(player.image) || undefined,
        effects: [],
      });
    } else if (addMode === 'npc') {
      if (!npcPick) { setError('Elige un NPC'); return; }
      const npc = npcs.find(n => n.id === npcPick.id);
      if (!npc) return;
      for (let i = 1; i <= count; i += 1) {
        nextList.push({
          id: newId(),
          kind: 'npc',
          name: count > 1 ? `${npc.name} (${i})` : npc.name,
          baseName: npc.name,
          copyIndex: count > 1 ? i : undefined,
          sourceId: npc.id,
          initiative: 0,
          defeated: false,
          image: npc.image || undefined,
          effects: [],
        });
      }
    } else if (addMode === 'champion') {
      if (!championPick) { setError('Elige un campeón'); return; }
      const champion = CHAMPIONS.find(c => c.champion === championPick.id);
      if (!champion) return;
      for (let i = 1; i <= count; i += 1) {
        nextList.push({
          id: newId(),
          kind: 'champion',
          name: count > 1 ? `${champion.champion} (${i})` : champion.champion,
          baseName: champion.champion,
          copyIndex: count > 1 ? i : undefined,
          sourceId: champion.champion,
          initiative: 0,
          defeated: false,
          image: champion.image || undefined,
          effects: [],
        });
      }
    } else {
      const name = customName.trim();
      if (!name) return;
      for (let i = 1; i <= count; i += 1) {
        nextList.push({
          id: newId(),
          kind: 'custom',
          name: count > 1 ? `${name} (${i})` : name,
          baseName: name,
          copyIndex: count > 1 ? i : undefined,
          initiative: 0,
          defeated: false,
          effects: [],
        });
      }
    }

    void persist(syncOrder(nextList));
  };

  const updateOne = (id: string, patch: Partial<CombatParticipant>) => {
    const participants = state.participants.map(p => (p.id === id ? { ...p, ...patch } : p));
    void persist(syncOrder(participants, current?.id));
  };

  const removeOne = (id: string) => {
    setSelectedId(current => (current === id ? null : current));
    void persist(syncOrder(state.participants.filter(p => p.id !== id)));
  };

  const tickPlayerTrackers = (participant: CombatParticipant) => {
    if (participant.kind !== 'player' || !participant.sourceId) return;
    const player = PLAYERS.find(p => p.name === participant.sourceId);
    if (!player) return;
    const patch: { cooldowns?: Record<string, number>; activeEffects?: Record<string, number> } = {};
    if (player.cooldowns && Object.keys(player.cooldowns).length > 0) {
      patch.cooldowns = tickCooldowns(player.cooldowns);
    }
    if (player.activeEffects && Object.keys(player.activeEffects).length > 0) {
      patch.activeEffects = tickActiveEffects(player.activeEffects);
    }
    if (!patch.cooldowns && !patch.activeEffects) return;
    void savePlayerPatch(player.name, patch)
      .then(() => setTrackerBump(n => n + 1))
      .catch(() => {
        /* el combate sigue; se puede ajustar a mano */
      });
  };

  const patchPlayerTrackers = async (
    playerName: string,
    patch: {
      cooldowns?: Record<string, number>;
      activeEffects?: Record<string, number>;
      stacks?: Record<string, number>;
    },
  ) => {
    await savePlayerPatch(playerName, patch);
    setTrackerBump(n => n + 1);
  };

  const startCombat = () => {
    const sorted = sortByInitiative(state.participants);
    if (sorted.length === 0) return;
    const first = tickEffectsFor(sorted[0]);
    const participants = sorted.map((p, i) => (i === 0 ? first : p));
    tickPlayerTrackers(sorted[0]);
    void persist({ active: true, round: 1, turnIndex: 0, participants });
  };

  const endCombat = () => {
    if (!isAdmin || saving) return;
    const ok = window.confirm(
      '¿Terminar el combate? Se vaciará la lista (vuelve a Preparación) y se reiniciarán cooldowns y efectos de los players. Stacks y PG no se tocan.',
    );
    if (!ok) return;
    setSaving(true);
    setError(null);
    void endCombatRemote()
      .then(saved => {
        setState(saved);
        setSelectedId(null);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'No se pudo terminar el combate');
        return reload();
      })
      .finally(() => setSaving(false));
  };

  const nextTurn = () => {
    if (ordered.length === 0) return;
    let turnIndex = state.turnIndex + 1;
    let round = state.round;
    if (turnIndex >= ordered.length) {
      turnIndex = 0;
      round += 1;
    }
    const target = ordered[turnIndex];
    const targetId = target?.id;
    const participants = state.participants.map(p => (p.id === targetId ? tickEffectsFor(p) : p));
    const sorted = sortByInitiative(participants);
    const idx = sorted.findIndex(p => p.id === targetId);
    if (target) tickPlayerTrackers(target);
    void persist({ active: true, round, turnIndex: idx >= 0 ? idx : 0, participants: sorted });
  };

  const prevTurn = () => {
    if (ordered.length === 0) return;
    let turnIndex = state.turnIndex - 1;
    let round = state.round;
    if (turnIndex < 0) {
      turnIndex = ordered.length - 1;
      round = Math.max(1, round - 1);
    }
    void persist({ ...state, active: true, round, turnIndex });
  };

  const addEffect = (participantId: string) => {
    const preset = effectPick[participantId] ?? 'Aturdido';
    const custom = (customEffect[participantId] ?? '').trim();
    const name = custom || preset;
    const duration = Math.max(1, Number.parseInt(effectDur[participantId] ?? '2', 10) || 1);
    const participant = state.participants.find(p => p.id === participantId);
    if (!participant) return;
    const effect: CombatEffect = { id: newId(), name, duration };
    const rawVal = Number.parseInt(effectValue[participantId] ?? '', 10);
    if (effectNeedsValue(name) && Number.isInteger(rawVal) && rawVal >= 1) effect.value = rawVal;
    updateOne(participantId, { effects: [...participant.effects, effect] });
    setCustomEffect(cur => ({ ...cur, [participantId]: '' }));
    setEffectValue(cur => ({ ...cur, [participantId]: '' }));
  };

  return (
    <div className="combat-page">
      <header className="combat-page__head">
        <div>
          <p className="combat-page__kicker">Tracker</p>
          <h1 className="combat-page__title">Combate</h1>
        </div>
        <div className="combat-turnbar">
          <span className="combat-turnbar__round">
            {state.active ? `Ronda ${state.round}` : 'Preparación'}
            {state.active && current ? ` · ${current.name}` : ''}
          </span>
          {isAdmin && !state.active && (
            <button type="button" className="combat-btn combat-btn--gold" disabled={saving || ordered.length === 0} onClick={startCombat}>
              Empezar
            </button>
          )}
          {isAdmin && state.active && (
            <>
              <button type="button" className="combat-btn" disabled={saving} onClick={prevTurn}>Anterior</button>
              <button type="button" className="combat-btn combat-btn--gold" disabled={saving} onClick={nextTurn}>Siguiente</button>
              <button type="button" className="combat-btn combat-btn--danger" disabled={saving} onClick={endCombat}>Terminar combate</button>
            </>
          )}
        </div>
      </header>

      {error && <p className="combat-page__error">{error}</p>}
      {loading && <p className="combat-page__hint">Cargando…</p>}

      {isAdmin && (
        <section className="combat-card combat-add">
          <h2 className="combat-card__title">Añadir participante</h2>
          <div className="combat-add__modes">
            {(['player', 'npc', 'champion', 'custom'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                className={cx('combat-chip', addMode === mode && 'combat-chip--on')}
                onClick={() => switchMode(mode)}
              >
                {MODE_LABEL[mode]}
              </button>
            ))}
          </div>

          {addMode === 'player' && (
            <div className="combat-add__players">
              {PLAYERS.map(player => {
                const portrait = playerPortraitUrl(player.image);
                const on = playerPick === player.name;
                return (
                  <button
                    key={player.name}
                    type="button"
                    className={cx('combat-player-chip', on && 'combat-player-chip--on')}
                    disabled={saving}
                    onClick={() => setPlayerPick(player.name)}
                  >
                    {portrait
                      ? <img src={portrait} alt="" width={28} height={28} />
                      : <span className="combat-player-chip__fallback" aria-hidden>👤</span>}
                    <span>{player.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="combat-add__row">
            {addMode === 'npc' && (
              <CombatSearchCombobox
                placeholder="Buscar NPC…"
                options={npcOptions}
                selected={npcPick}
                onSelect={setNpcPick}
                disabled={saving}
              />
            )}
            {addMode === 'champion' && (
              <CombatSearchCombobox
                placeholder="Buscar campeón…"
                options={championOptions}
                selected={championPick}
                onSelect={setChampionPick}
                disabled={saving}
              />
            )}
            {addMode === 'custom' && (
              <input value={customName} placeholder="Nombre" onChange={e => setCustomName(e.target.value)} />
            )}
            {addMode !== 'player' && (
              <input
                className="combat-add__qty"
                value={qty}
                placeholder="×"
                inputMode="numeric"
                title="Cantidad"
                onChange={e => setQty(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addParticipants();
                  }
                }}
              />
            )}
            <button type="button" className="combat-btn combat-btn--gold" disabled={saving} onClick={addParticipants}>
              Añadir
            </button>
          </div>
        </section>
      )}

      <section className="combat-board">
        {ordered.length === 0 ? (
          <p className="combat-page__hint">No hay participantes.</p>
        ) : (
          <div className="combat-board__grid">
            {ordered.map((p, index) => (
              <CombatParticipantCard
                key={p.id}
                participant={p}
                isTurn={state.active && index === state.turnIndex}
                onOpen={() => setSelectedId(p.id)}
              />
            ))}
          </div>
        )}
      </section>

      {!isAdmin && (
        <p className="combat-page__hint">Vista en vivo. Toca una carta para ver detalle (solo lectura).</p>
      )}

      {selected && (
        <CombatParticipantPanel
          participant={selected}
          isAdmin={isAdmin}
          saving={saving}
          trackerRev={playersRev + trackerBump}
          onPlayerTrackersChange={patchPlayerTrackers}
          effectPick={effectPick[selected.id] ?? 'Aturdido'}
          effectDur={effectDur[selected.id] ?? '2'}
          effectValue={effectValue[selected.id] ?? ''}
          customEffect={customEffect[selected.id] ?? ''}
          onEffectPick={value => setEffectPick(cur => ({ ...cur, [selected.id]: value }))}
          onEffectDur={value => setEffectDur(cur => ({ ...cur, [selected.id]: value }))}
          onEffectValue={value => setEffectValue(cur => ({ ...cur, [selected.id]: value }))}
          onCustomEffect={value => setCustomEffect(cur => ({ ...cur, [selected.id]: value }))}
          onClose={() => setSelectedId(null)}
          onInitiative={value => updateOne(selected.id, { initiative: value })}
          onRollInitiative={() => updateOne(selected.id, { initiative: rollInitiative(selected.initiativeBonus ?? 0) })}
          onToggleDefeated={() => updateOne(selected.id, { defeated: !selected.defeated })}
          onRemove={() => removeOne(selected.id)}
          onAddEffect={() => addEffect(selected.id)}
          onRemoveEffect={effectId => {
            updateOne(selected.id, { effects: selected.effects.filter(e => e.id !== effectId) });
          }}
        />
      )}
    </div>
  );
}
