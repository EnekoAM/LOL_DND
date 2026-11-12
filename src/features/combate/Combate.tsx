import { logCombat } from './combatConsole';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppRole, useMyPlayerName } from '../../data/appRoleContext';
import { canSeeHp, participantHp, participantHpPools, type DamageAmount, type TargetDamage } from './combatHp';
import { CHAMPIONS } from '../../data/champions';
import {
  endCombatRemote,
  loadCombat,
  newId,
  rollInitiative,
  saveCombat,
  saveCombatHp,
  saveCombatResource,
  saveCombatActions,
  saveCombatBonuses,
  sortByInitiative,
  applySourcedEffect,
  setEffectStacks,
  tickEffectsFor,
  tickCombatTrackers,
  type SourcedEffectInput,
  type CombatBonus,
  type CombatEffect,
  type CombatParticipant,
  type CombatState,
} from '../../data/combat';
import { useLiveRevision } from '../../data/live';
import { loadNpcs, type Npc } from '../../data/npcs';
import { needsSheet, snapshotChampion, snapshotNpc, withSheet } from '../../data/combatSheet';
import { PLAYERS, playerPortraitUrl, savePlayerPatch } from '../../data/players';
import { tickActiveEffects, tickCooldowns } from '../../data/stacks';
import { cx } from '../../lib/cx';
import CombatParticipantCard from './CombatParticipantCard';
import { applyDamage } from '../players/HpPanel';
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

/** Quita los marcadores de cargas de combate (al empezar un combate). */
function withoutCharges(participant: CombatParticipant): CombatParticipant {
  if (!participant.bonuses?.some(bonus => bonus.stat === 'charges')) return participant;
  const bonuses = participant.bonuses.filter(bonus => bonus.stat !== 'charges');
  const { bonuses: _old, ...rest } = participant;
  return bonuses.length ? { ...rest, bonuses } : rest;
}

/** Consola: cargas de combate recargadas / cuenta atrás al empezar el turno del portador. */
function logChargeRecharges(before: CombatParticipant | undefined, after: CombatParticipant | undefined): void {
  if (!before || !after) return;
  const lines: string[] = [];
  for (const old of before.bonuses ?? []) {
    if (old.stat !== 'charges') continue;
    const now = after.bonuses?.find(bonus => bonus.source === old.source);
    if (!now) continue;
    const max = now.maxStacks ?? now.amount;
    if (now.amount > old.amount) lines.push(`${now.label ?? 'Cargas'}: recarga 1 carga → ${now.amount}/${max}${now.recharge ? ` · siguiente en ${now.recharge} t.` : ''}`);
    else if (now.recharge !== old.recharge && now.recharge) lines.push(`${now.label ?? 'Cargas'}: ${now.amount}/${max} · recarga en ${now.recharge} t.`);
  }
  if (lines.length) logCombat({ title: 'Cargas de combate', actor: after.name, lines });
}

export default function Combate() {
  const { role } = useAppRole();
  const isAdmin = role === 'admin';
  const myPlayer = useMyPlayerName();
  const combatRev = useLiveRevision('combat');
  const playersRev = useLiveRevision('players');
  const championsRev = useLiveRevision('champions');

  const [state, setState] = useState<CombatState>(emptyCombatState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Último estado / guardado en curso (para encadenar guardados sin closures viejas). */
  const stateRef = useRef<CombatState>(state);
  stateRef.current = state;
  const savingRef = useRef(false);
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
    if (!isAdmin || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveCombat(next);
      stateRef.current = saved;
      setState(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
      await reload();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /**
   * Daño a un objetivo (AA / habilidad / objeto): escudo → vida temporal → vida, como el Daño del HpPanel.
   * Players: su ficha (PATCH op hp); resto: su entrada del combate. Sin armadura/MR (no hay fórmula).
   */
  const damageTarget = async (targetId: string, amountIn: DamageAmount): Promise<TargetDamage | null> => {
    const target = stateRef.current.participants.find(p => p.id === targetId);
    if (!target) return null;
    const prev = participantHpPools(target);
    if (!prev) return null;
    const amount = typeof amountIn === 'function' ? amountIn(prev.current) : amountIn;
    if (!(amount > 0)) return null;
    const next = applyDamage(Math.floor(amount), { actualHp: prev.current, escudo: prev.shield, vidaTemporal: prev.tempHp });
    const save = async (current: number, tempHp: number, shield: number) => {
      const result = await saveCombatHp(targetId, current, undefined, { tempHp, shield });
      stateRef.current = result.combat;
      setState(result.combat);
      setTrackerBump(n => n + 1);
    };
    await save(next.actualHp, next.vidaTemporal, next.escudo);
    return {
      name: target.name,
      before: prev.current,
      after: next.actualHp,
      absorbed: (prev.shield - next.escudo) + (prev.tempHp - next.vidaTemporal),
      undo: () => save(prev.current, prev.tempHp, prev.shield),
    };
  };

  /** Debuffs / bonus de otro participante (reglas de efectos con nombre): guarda y devuelve el Deshacer. */
  const targetBonuses = async (targetId: string, update: (current: CombatBonus[]) => CombatBonus[]): Promise<(() => Promise<void>) | null> => {
    const target = stateRef.current.participants.find(p => p.id === targetId);
    if (!target) return null;
    const prev = target.bonuses ?? [];
    const save = async (bonuses: CombatBonus[]) => {
      const saved = await saveCombatBonuses(targetId, bonuses);
      stateRef.current = saved;
      setState(saved);
    };
    await save(update(prev));
    return () => save(prev);
  };

  /** Cura / escudo / maná al propio participante (reglas de efectos con nombre), con Deshacer. */
  const poolChange = async (participantId: string, kind: 'heal' | 'shield' | 'mana', amount: number): Promise<(() => Promise<void>) | null> => {
    const self = stateRef.current.participants.find(p => p.id === participantId);
    if (!self || !(amount > 0)) return null;
    const bump = () => setTrackerBump(n => n + 1);
    if (kind === 'mana') {
      const player = self.kind === 'player' ? PLAYERS.find(entry => entry.name === self.sourceId) : undefined;
      const max = player ? player.mana : undefined;
      const current = player ? (player.actualMana ?? player.mana ?? 0) : (self.currentResource ?? 0);
      const next = typeof max === 'number' ? Math.min(max, current + amount) : current + amount;
      if (next === current) return null;
      const result = await saveCombatResource(participantId, next, max);
      stateRef.current = result.combat;
      setState(result.combat);
      bump();
      return async () => {
        const back = await saveCombatResource(participantId, current, max);
        stateRef.current = back.combat;
        setState(back.combat);
        bump();
      };
    }
    const pools = participantHpPools(self);
    const hp = participantHp(self);
    if (!pools || !hp) return null;
    const next = kind === 'heal'
      ? { current: typeof hp.max === 'number' ? Math.min(hp.max, pools.current + amount) : pools.current + amount, shield: pools.shield }
      : { current: pools.current, shield: pools.shield + amount };
    if (next.current === pools.current && next.shield === pools.shield) return null;
    const save = async (current: number, shield: number) => {
      const result = await saveCombatHp(participantId, current, undefined, { tempHp: pools.tempHp, shield });
      stateRef.current = result.combat;
      setState(result.combat);
      bump();
    };
    await save(next.current, next.shield);
    return () => save(pools.current, pools.shield);
  };

  const ordered = useMemo(() => sortByInitiative(state.participants), [state.participants]);

  // Combates guardados antes de las copias: el admin las crea una vez (si la base está cargada).
  const sheetFillTried = useRef<string | null>(null);
  useEffect(() => {
    if (!isAdmin || loading || saving || !state.active) return;
    if (!state.participants.some(needsSheet)) return;
    const participants = state.participants.map(p => withSheet(p, npcs));
    if (participants.every((p, i) => p === state.participants[i])) return;
    const attempt = `${state.updatedAt ?? ''}|${npcs.length}|${championsRev}`;
    if (sheetFillTried.current === attempt) return;
    sheetFillTried.current = attempt;
    void persist({ ...state, participants });
    // persist cambia en cada render; el resto basta para no repetir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, loading, saving, state, npcs, championsRev]);

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
    return { ...stateRef.current, participants: sorted, turnIndex };
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
          // Copia propia por participante: dos del mismo NPC no comparten nada.
          sheet: snapshotNpc(npc),
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
          sheet: snapshotChampion(champion),
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

  const updateOne = (id: string, patch: Partial<CombatParticipant>): Promise<void> => {
    const participants = stateRef.current.participants.map(p => (p.id === id ? { ...p, ...patch } : p));
    return persist(syncOrder(participants, current?.id));
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
    // Cargas de combate (Flujo de maná…): cada combate empieza con las de inicio (sin marcador).
    const sorted = sortByInitiative(state.participants).map(p => withSheet(withoutCharges(p), npcs));
    if (sorted.length === 0) return;
    const first = tickCombatTrackers(tickEffectsFor(sorted[0]));
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
        setTrackerBump(n => n + 1);
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
    const participants = state.participants.map(p => (p.id === targetId ? tickCombatTrackers(tickEffectsFor(p)) : p));
    logChargeRecharges(state.participants.find(p => p.id === targetId), participants.find(p => p.id === targetId));
    const sorted = sortByInitiative(participants);
    const idx = sorted.findIndex(p => p.id === targetId);
    if (target) tickPlayerTrackers(target);
    void persist({ ...stateRef.current, active: true, round, turnIndex: idx >= 0 ? idx : 0, participants: sorted });
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

  const panelFor = (p: CombatParticipant, layout: 'drawer' | 'sheet') => (
        <CombatParticipantPanel
          key={layout === 'sheet' ? p.id : undefined}
          layout={layout}
          onSelect={id => setSelectedId(id)}
          participant={p}
          isAdmin={isAdmin}
          myPlayer={myPlayer}
          onHpSave={async (current, max, extra) => {
            const result = await saveCombatHp(p.id, current, max, extra);
            setState(result.combat);
            setTrackerBump(n => n + 1);
          }}
          onResourceSave={async (current, max) => {
            const result = await saveCombatResource(p.id, current, max);
            setState(result.combat);
            setTrackerBump(n => n + 1);
          }}
          onTargetDamage={isAdmin ? damageTarget : undefined}
          onTargetBonuses={isAdmin ? targetBonuses : undefined}
          onPoolChange={isAdmin ? (kind, amount) => poolChange(p.id, kind, amount) : undefined}
          onTargetPool={isAdmin ? (targetId, kind, amount) => poolChange(targetId, kind, amount) : undefined}
          vigorPerMove={state.vigorPerMove}
          onVigorPerMoveChange={isAdmin ? rate => persist({ ...stateRef.current, vigorPerMove: rate }) : undefined}
          onBonusesSave={async bonuses => {
            const saved = await saveCombatBonuses(p.id, bonuses);
            stateRef.current = saved;
            setState(saved);
          }}
          onActionsSave={async (kind, left, extra) => {
            // También en stateRef: lo siguiente que se guarde (CD del ítem, bonus…) parte de aquí y no lo pisa.
            const saved = await saveCombatActions(p.id, kind, left, extra);
            stateRef.current = saved;
            setState(saved);
          }}
          saving={saving}
          trackerRev={playersRev + trackerBump}
          onPlayerTrackersChange={patchPlayerTrackers}
          onPlayerResourceChange={async (playerName, patch) => {
            await savePlayerPatch(playerName, patch);
            setTrackerBump(n => n + 1);
          }}
          onCombatPatch={patch => updateOne(p.id, patch)}
          effectPick={effectPick[p.id] ?? 'Aturdido'}
          effectDur={effectDur[p.id] ?? '2'}
          effectValue={effectValue[p.id] ?? ''}
          customEffect={customEffect[p.id] ?? ''}
          onEffectPick={value => setEffectPick(cur => ({ ...cur, [p.id]: value }))}
          onEffectDur={value => setEffectDur(cur => ({ ...cur, [p.id]: value }))}
          onEffectValue={value => setEffectValue(cur => ({ ...cur, [p.id]: value }))}
          onCustomEffect={value => setCustomEffect(cur => ({ ...cur, [p.id]: value }))}
          onClose={() => setSelectedId(null)}
          onInitiative={value => updateOne(p.id, { initiative: value })}
          onRollInitiative={() => updateOne(p.id, { initiative: rollInitiative(p.initiativeBonus ?? 0) })}
          onToggleDefeated={() => updateOne(p.id, { defeated: !p.defeated })}
          onRemove={() => removeOne(p.id)}
          onAddEffect={() => addEffect(p.id)}
          onRemoveEffect={effectId => {
            updateOne(p.id, { effects: p.effects.filter(e => e.id !== effectId) });
          }}
          participants={state.participants}
          onApplySourcedEffect={(targetIds, input: SourcedEffectInput) => {
            // Uno o varios objetivos (área): todos en un solo guardado, sobre el último estado.
            const ids = new Set(Array.isArray(targetIds) ? targetIds : [targetIds]);
            const base = stateRef.current.participants;
            if (!base.some(entry => ids.has(entry.id))) return;
            const participants = base.map(entry => (ids.has(entry.id) ? applySourcedEffect(entry, input) : entry));
            return persist(syncOrder(participants, current?.id));
          }}
          onEffectStacksChange={(effectId, stacks) => {
            updateOne(p.id, { effects: setEffectStacks(p, effectId, stacks).effects });
          }}
        />
  );

  // Al empezar el combate la ficha central es la del turno; después Siguiente/Anterior no cambian de ficha.
  useEffect(() => {
    if (state.active) setSelectedId(null);
  }, [state.active]);
  // Sin ficha elegida (inicio, o la elegida se quitó): fijar la del turno actual y quedarse en ella.
  useEffect(() => {
    if (state.active && !selected && current) setSelectedId(current.id);
  }, [state.active, selected, current]);

  // En combate la ficha va en el área central: la elegida o, si no, la del turno.
  const viewed = state.active ? (selected ?? current ?? ordered[0] ?? null) : null;

  return (
    <div className={cx('combat-page', state.active && 'combat-page--active')}>
      <header className="combat-page__head">
        {!state.active && (
          <div>
            <p className="combat-page__kicker">Tracker</p>
            <h1 className="combat-page__title">Combate</h1>
          </div>
        )}
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

      {state.active ? (
        <div className="combat-stage">
          <nav className="combat-rail" aria-label="Orden de iniciativa">
            {ordered.map((p, index) => (
              <CombatParticipantCard
                key={p.id}
                compact
                participant={p}
                isTurn={index === state.turnIndex}
                selected={viewed?.id === p.id}
                onOpen={() => setSelectedId(p.id)}
              />
            ))}
          </nav>
          <div className="combat-stage__main">
            {viewed && panelFor(viewed, 'sheet')}
          </div>
        </div>
      ) : (
        <>
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
                    hp={canSeeHp(p, isAdmin, myPlayer) ? participantHp(p) ?? undefined : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {!isAdmin && (
        <p className="combat-page__hint">Vista en vivo. Toca una carta para ver detalle (solo lectura).</p>
      )}

      {!state.active && selected && panelFor(selected, 'drawer')}
    </div>
  );
}
