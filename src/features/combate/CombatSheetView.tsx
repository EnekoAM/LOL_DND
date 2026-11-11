import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CombatBonus, CombatParticipant, SourcedEffectInput } from '../../data/combat';
import { bonusValue, firePassives, formatBonus, newBonusId, type PassiveResult } from './combatBonuses';
import { useNamedEffectDescriptions } from '../../data/namedEffectDescriptions';
import { activeNamedEffects, combatExtraLines, fireEffectRules, participantContext, type EffectCallbacks } from './effectRules';
import { cx } from '../../lib/cx';
import { participantChampion, participantNpc } from '../../data/combatSheet';
import { findItem, type Item } from '../../data/items';
import ItemDetailModal from '../items/ItemDetailModal';
import '../items/Items.css';
import { NPC_STATS } from '../../data/npcs';
import { partyLevel, subscribeParty } from '../../data/party';
import { PLAYERS, type PlayerListPatch } from '../../data/players';
import { itemActiveEffectKey, itemCooldownKey, itemStackKey, readActiveEffect, readCooldown, readStack } from '../../data/stacks';
import { championDamageContext } from '../calculos/championDamage';
import ItemTile from '../calculos/ItemTile';
import { playerBonusLine, playerMaxHp, playerTotalLine } from '../calculos/playerTotals';
import { STAT_COLUMNS, formatDefenseStat, formatStat, type StatValue } from '../calculos/statLine';
import HpPanel from '../players/HpPanel';
import ManaPanel from '../players/ManaPanel';
import PlayerSwitcher from '../players/PlayerSwitcher';
import StackCounter from '../players/StackCounter';
import { championPool } from './CombatAbilityUseSection';
import { resolvedSpendKind } from './combatAbilityUse';
import { kindTag } from './combatHelpers';
import { itemActiveDamage, itemIsUsable, itemUseHeadline, rollItemDamage, type ItemDamageRoll } from './combatItemUse';
import { canSeeHp, damageTargets, participantHp, targetHpLine, type TargetDamageFn } from './combatHp';
import CombatTargetPicker from './CombatTargetPicker';
import '../calculos/Calculos.css';
import '../players/Players.css';
import '../players/SheetAbilities.css';
import '../habilidades/Habilidades.css';

type Props = {
  participant: CombatParticipant;
  isAdmin: boolean;
  myPlayer: string | null;
  saving: boolean;
  /** Orden de iniciativa (para el selector). */
  participants: CombatParticipant[];
  onSelect?: (id: string) => void;
  onHpSave: (current: number, max?: number, extra?: { tempHp?: number; shield?: number }) => Promise<void>;
  onResourceSave: (current: number, max?: number) => Promise<void>;
  onPlayerChange: (playerName: string, patch: PlayerListPatch) => Promise<void>;
  /** Iniciativa, estados y acciones de admin (bajo la tarjeta izquierda). */
  strip: ReactNode;
  /** Auto-ataques + habilidades con Usar. */
  abilities: ReactNode;
  /** CD / efectos de objetos (players). */
  trackers: ReactNode;
  /** Cooldowns / efectos propios de un player (su ficha). */
  onPlayerTrackersChange: (playerName: string, patch: { cooldowns?: Record<string, number>; activeEffects?: Record<string, number> }) => Promise<void>;
  /** Cambios en el participante del combate (solo admin). */
  onCombatPatch: (patch: Partial<CombatParticipant>) => void | Promise<void>;
  /** Daño a un objetivo (solo admin). */
  onTargetDamage?: TargetDamageFn;
  /** Bonus temporales: PATCH op bonuses (admin o su propio player). */
  onBonusesSave?: (bonuses: CombatBonus[]) => Promise<void>;
  onTargetBonuses?: EffectCallbacks['onTargetBonuses'];
  onPoolChange?: EffectCallbacks['onSelfPool'];
  onApplySourcedEffect: (targetIds: string | string[], input: SourcedEffectInput) => void | Promise<void>;
};

type ItemUse = { headline: string; detail?: string; undo?: () => void };

type Defense = { label: string; value: StatValue | undefined };

const DefenseCards = ({ stats }: { stats: Defense[] }) => (
  <div className="sheet-defense combat-sheet__defense">
    {stats.map(({ label, value }) => {
      const defense = value !== undefined && label !== 'Velocidad' ? formatDefenseStat(value) : null;
      return (
        <div key={label} className="sheet-defense__card" title={defense?.exactTitle}>
          <div className="sheet-defense__label">{label}</div>
          <div className="sheet-defense__value">{value === undefined ? '—' : defense ? defense.text : formatStat(value)}</div>
        </div>
      );
    })}
  </div>
);

/** Penetraciones (letalidad / pen. mágica planas y % de armadura / MR), bajo CA / Velocidad / MR. */
type Pen = { label: string; title: string; value: StatValue | undefined; pct?: boolean };

const penetrationOf = (stats: Partial<Record<'lethality' | 'magicPen' | 'armorPenPct' | 'magicPenPct', StatValue>>): Pen[] => [
  { label: 'PEN. ARM', title: 'Letalidad (penetración de armadura plana)', value: stats.lethality },
  { label: '% ARM', title: 'Penetración de armadura % (no acumulable: cuenta la más alta)', value: stats.armorPenPct, pct: true },
  { label: 'PEN. MÁG', title: 'Penetración mágica plana', value: stats.magicPen },
  { label: '% MÁG', title: 'Penetración mágica % (no acumulable: cuenta la más alta)', value: stats.magicPenPct, pct: true },
];

/** Stats que solo dan los ítems (curación/escudos, tenacidad, ralentización, robo de vida, omnisucción, rango, regeneración). */
const utilityOf = (stats: Partial<Record<'healShieldPct' | 'tenacityPct' | 'slowResistPct' | 'lifeStealPct' | 'omnivampPct' | 'range' | 'healthRegen' | 'manaRegen', StatValue>>): Pen[] => [
  { label: 'CUR/ESC', title: 'Poder de curación y escudos %', value: stats.healShieldPct, pct: true },
  { label: 'TENAC.', title: 'Tenacidad % (se suma)', value: stats.tenacityPct, pct: true },
  { label: 'RES. RAL.', title: 'Resistencia a ralentizaciones % (se suma)', value: stats.slowResistPct, pct: true },
  { label: 'ROBO V.', title: 'Robo de vida %', value: stats.lifeStealPct, pct: true },
  { label: 'OMNIS.', title: 'Omnisucción %', value: stats.omnivampPct, pct: true },
  { label: 'RANGO', title: 'Rango de ataque', value: stats.range },
  { label: 'REG. VIDA', title: 'Regeneración de vida', value: stats.healthRegen },
  { label: 'REG. MANÁ', title: 'Regeneración de maná', value: stats.manaRegen },
];

const PenetrationCards = ({ stats, className = 'combat-sheet__pen' }: { stats: Pen[]; className?: string }) => (
  <div className={`sheet-defense combat-sheet__defense ${className}`}>
    {stats.map(({ label, title, value, pct }) => (
      <div key={label} className="sheet-defense__card" title={title}>
        <div className="sheet-defense__label">{label}</div>
        <div className="sheet-defense__value">{value === undefined ? '—' : `${formatStat(value)}${pct && typeof value === 'number' ? '%' : ''}`}</div>
      </div>
    ))}
  </div>
);

/** Ficha del participante en el área central durante el combate (como la ficha de Players). */
export default function CombatSheetView({
  participant,
  isAdmin,
  myPlayer,
  saving,
  participants,
  onSelect,
  onHpSave,
  onResourceSave,
  onPlayerChange,
  strip,
  abilities,
  trackers,
  onPlayerTrackersChange,
  onCombatPatch,
  onTargetDamage,
  onBonusesSave,
  onTargetBonuses,
  onPoolChange,
  onApplySourcedEffect,
}: Props) {
  const level = useSyncExternalStore(subscribeParty, partyLevel);
  const effectData = useNamedEffectDescriptions();
  /** Bonus temporales del combate (manuales / pasivas / debuffs) + reglas «Siempre» de sus efectos con nombre. */
  const extra = combatExtraLines(participant, level, effectData);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [hpError, setHpError] = useState<string | null>(null);
  /** Ficha del ítem en solo lectura (como en Players); al cerrar vuelve el foco al ítem. */
  const [inspectedItem, setInspectedItem] = useState<Item | null>(null);
  const itemTrigger = useRef<HTMLElement | null>(null);
  const [itemUse, setItemUse] = useState<ItemUse | null>(null);
  const [itemTarget, setItemTarget] = useState<{ name: string; item: Item; damage?: number } | null>(null);
  const [itemBusy, setItemBusy] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [bonusForm, setBonusForm] = useState<{ stat: string; amount: string; turns: string; stacks: string } | null>(null);
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);
  useEffect(() => {
    setPortraitFailed(false);
    setHpError(null);
    setInspectedItem(null);
    setItemUse(null);
    setItemTarget(null);
    setItemError(null);
    setBonusForm(null);
    setBonusError(null);
  }, [participant.id]);
  const inspectItem = (item: Item | undefined | null) => {
    if (!item) return;
    itemTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInspectedItem(item);
  };
  const closeItemInfo = () => {
    setInspectedItem(null);
    itemTrigger.current?.focus();
  };

  const canSee = canSeeHp(participant, isAdmin, myPlayer);
  const player = participant.kind === 'player' && participant.sourceId
    ? PLAYERS.find(entry => entry.name === participant.sourceId) ?? null
    : null;
  const champion = participantChampion(participant);
  const npc = participantNpc(participant);

  // Usar ítems: admin con cualquiera; un User solo con su player.
  const canUseItems = participant.kind === 'player' ? !!player && (isAdmin || canSee) : isAdmin;
  const itemCd = (name: string): number => readCooldown(player ? player.cooldowns : participant.cooldowns, itemCooldownKey(name));
  const withItemPassive = (use: ItemUse, passive: PassiveResult): ItemUse => {
    const previous = use.undo;
    const undoPassive = passive.undo;
    return {
      ...use,
      headline: `${use.headline}${passive.note}`,
      undo: undoPassive
        ? () => {
            setItemBusy(true);
            void undoPassive()
              .then(() => (previous ? previous() : setItemUse(null)))
              .catch(caught => setItemError(caught instanceof Error ? caught.message : 'No se pudo deshacer la pasiva'))
              .finally(() => setItemBusy(false));
          }
        : previous,
    };
  };

  // Bonus temporales («+ Bonus»): admin con cualquiera; un User solo con su player.
  const canEditBonuses = !!onBonusesSave && (isAdmin || (participant.kind === 'player' && canSee));
  const bonuses = participant.bonuses ?? [];
  const saveBonuses = (next: CombatBonus[]) => {
    if (!onBonusesSave || bonusBusy) return;
    setBonusBusy(true);
    setBonusError(null);
    void onBonusesSave(next)
      .then(() => setBonusForm(null))
      .catch(caught => setBonusError(caught instanceof Error ? caught.message : 'No se pudieron guardar los bonus'))
      .finally(() => setBonusBusy(false));
  };
  const addBonus = () => {
    if (!bonusForm) return;
    const amount = Number(bonusForm.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 9999) {
      setBonusError('La cantidad tiene que ser un número distinto de 0');
      return;
    }
    const count = (text: string, label: string): number | undefined | null => {
      if (!text.trim()) return undefined;
      const n = Number(text.trim());
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        setBonusError(`${label} tiene que ser un entero entre 1 y 99`);
        return null;
      }
      return n;
    };
    const turns = count(bonusForm.turns, 'Turnos');
    if (turns === null) return;
    const stacks = count(bonusForm.stacks, 'Stacks');
    if (stacks === null) return;
    saveBonuses([...bonuses, {
      id: newBonusId(),
      stat: bonusForm.stat,
      amount,
      ...(stacks ? { stacks } : {}),
      ...(turns ? { turns } : {}),
      source: 'manual',
    }]);
  };

  /** Clic: si hace daño o pone un efecto enemigo, primero los objetivos (nada se gasta hasta Atacar). */
  const useItem = (name: string, item: Item | undefined) => {
    if (!item || !canUseItems || saving || itemBusy || itemCd(name) > 0 || !itemIsUsable(item)) return;
    const enemy = typeof item.effectDuration === 'number' && item.effectDuration > 0 && item.effectTarget === 'enemy';
    const damaging = !!itemActiveDamage(item) && !!onTargetDamage;
    if (enemy || damaging) {
      setItemError(null);
      setItemTarget({ name, item });
      return;
    }
    return runItem(name, item, []);
  };
  const runItem = async (name: string, item: Item, targetIds: string[]) => {
    setItemTarget(null);
    if (!canUseItems || saving || itemBusy || itemCd(name) > 0 || !itemIsUsable(item)) return;
    setItemError(null);
    let roll: ItemDamageRoll | null = null;
    const damage = itemActiveDamage(item);
    if (damage) {
      const stats = player
        ? { ...playerTotalLine(player.sheet, player.equipamiento, level, extra), bonus: playerBonusLine(player.sheet, player.equipamiento, extra) }
        : champion ? championDamageContext(champion, extra).stats : null;
      const statLevel = player ? level : champion ? championDamageContext(champion, extra).level : 1;
      if (stats) {
        try {
          roll = rollItemDamage(damage, stats, statLevel);
        } catch (caught) {
          setItemError(caught instanceof Error ? caught.message : 'No se pudo tirar el daño');
          return;
        }
      }
    }
    const cdKey = itemCooldownKey(name);
    const effectKey = itemActiveEffectKey(name);
    const cd = typeof item.cooldown === 'number' && item.cooldown > 0 ? item.cooldown : 0;
    const duration = typeof item.effectDuration === 'number' && item.effectDuration > 0 ? item.effectDuration : 0;
    const enemy = duration > 0 && item.effectTarget === 'enemy';
    const self = duration > 0 && !enemy;
    setItemBusy(true);
    try {
      let undo: (() => void) | undefined;
      if (player) {
        const prevCd = readCooldown(player.cooldowns, cdKey);
        const prevEffect = readActiveEffect(player.activeEffects, effectKey);
        const patch: { cooldowns?: Record<string, number>; activeEffects?: Record<string, number> } = {};
        if (cd) patch.cooldowns = { [cdKey]: cd };
        if (self) patch.activeEffects = { [effectKey]: duration };
        if (patch.cooldowns || patch.activeEffects) {
          await onPlayerTrackersChange(player.name, patch);
          undo = () => {
            const back: typeof patch = {};
            if (patch.cooldowns) back.cooldowns = { [cdKey]: prevCd };
            if (patch.activeEffects) back.activeEffects = { [effectKey]: prevEffect };
            void onPlayerTrackersChange(player.name, back).finally(() => setItemUse(null));
          };
        }
      } else {
        const prev = { cooldowns: participant.cooldowns, activeEffects: participant.activeEffects };
        const patch: Partial<CombatParticipant> = {};
        if (cd) patch.cooldowns = { ...participant.cooldowns, [cdKey]: cd };
        if (self) patch.activeEffects = { ...participant.activeEffects, [effectKey]: duration };
        if (patch.cooldowns || patch.activeEffects) {
          await onCombatPatch(patch);
          undo = () => {
            onCombatPatch({
              ...(patch.cooldowns ? { cooldowns: prev.cooldowns ?? {} } : {}),
              ...(patch.activeEffects ? { activeEffects: prev.activeEffects ?? {} } : {}),
            });
            setItemUse(null);
          };
        }
      }
      const notes = [cd ? `CD ${cd}` : '', self ? `efecto ${duration} t.` : ''].filter(Boolean).join(' · ');
      setItemUse({ headline: `${itemUseHeadline(name, roll)}${notes ? ` · ${notes}` : ''}`, detail: roll?.detail, undo });
      if (targetIds.length > 0) await confirmItemTarget({ name, item, damage: roll && roll.total > 0 ? roll.total : undefined }, targetIds);
      // Pasiva «al usar el objeto» (solo la de este ítem).
      // Reglas «Al usar» de los efectos con nombre de este ítem (respetan su CD por efecto base).
      const prevBonuses = participant.bonuses ?? [];
      let bonusesNow = prevBonuses;
      const ruleNotes: string[] = [];
      const ruleUndos: (() => Promise<void>)[] = [];
      const base = participantContext(participant, level, extra);
      if (base) {
        const callbacks: EffectCallbacks = {
          onTargetDamage,
          onTargetBonuses,
          onApplySourcedEffect: (ids, input) => onApplySourcedEffect(ids, input),
          onSelfPool: onPoolChange,
        };
        const result = await fireEffectRules({
          trigger: 'on-use',
          effects: activeNamedEffects([item], effectData),
          ctx: base.ctx,
          bonuses: prevBonuses,
          targetIds,
          participants,
          level,
          callbacks,
        });
        ruleNotes.push(...result.notes, ...result.manual.map(text => `a mano: ${text}`));
        ruleUndos.push(...result.undos);
        if (result.changed && onBonusesSave) {
          await onBonusesSave(result.bonuses);
          ruleUndos.unshift(() => onBonusesSave(prevBonuses));
          bonusesNow = result.bonuses;
        }
      }
      const passive = await firePassives({ bonuses: bonusesNow, items: [item], trigger: 'on-use', targetIds, onBonusesSave, onTargetDamage });
      if (passive.undo) ruleUndos.push(passive.undo);
      const combined: PassiveResult = {
        note: `${ruleNotes.length ? ` · ${ruleNotes.join(' · ')}` : ''}${passive.note}`,
        undo: ruleUndos.length ? async () => { for (const undo of [...ruleUndos].reverse()) await undo(); } : undefined,
      };
      if (combined.note || combined.undo) setItemUse(current => (current ? withItemPassive(current, combined) : current));
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : 'No se pudo usar el objeto');
    } finally {
      setItemBusy(false);
    }
  };
  const confirmItemTarget = async (target: { name: string; item: Item; damage?: number }, targetIds: string[]) => {
    if (targetIds.length === 0) return;
    let damaged = false;
    if (target.damage && onTargetDamage) {
      setItemBusy(true);
      try {
        const { damage, error: failed } = await damageTargets(onTargetDamage, targetIds, target.damage);
        if (failed) setItemError(failed);
        if (damage) {
          damaged = true;
          setItemUse(current => {
            if (!current) return current;
            const previous = current.undo;
            return {
              ...current,
              headline: `${current.headline}${targetHpLine(damage)}`,
              undo: () => {
                setItemBusy(true);
                void damage.undo()
                  .then(() => (previous ? previous() : setItemUse(null)))
                  .catch(caught => setItemError(caught instanceof Error ? caught.message : 'No se pudo deshacer el daño'))
                  .finally(() => setItemBusy(false));
              },
            };
          });
        }
      } catch (caught) {
        setItemError(caught instanceof Error ? caught.message : 'No se pudo aplicar el daño');
      } finally {
        setItemBusy(false);
      }
    }
    if (!damaged) {
      const names = participants.filter(entry => targetIds.includes(entry.id)).map(entry => entry.name).join(', ');
      if (names) setItemUse(current => (current ? { ...current, headline: `${current.headline} → ${names}` } : current));
    }
    if (typeof target.item.effectDuration !== 'number' || !(target.item.effectDuration > 0) || target.item.effectTarget !== 'enemy') return;
    await onApplySourcedEffect(targetIds, {
      source: itemCooldownKey(target.name),
      name: (target.item.effectName ?? '').trim() || target.name,
      duration: target.item.effectDuration,
      hasStacks: target.item.hasStacks,
      maxStacks: target.item.maxStacks,
    });
  };

  /** Mismo editor de vida que los players (Curar/Daño, máximo, vida temporal, escudo) sobre el combate. */
  const participantHpPanel = (current: number, max: number) => (
    <HpPanel
      player={{ hp: max, actualHp: current, escudo: participant.shield, vidaTemporal: participant.tempHp }}
      suggestedMax={max}
      saving={saving || !isAdmin}
      error={hpError}
      onChange={patch => {
        setHpError(null);
        return onHpSave(patch.actualHp ?? current, patch.hp, { tempHp: patch.vidaTemporal, shield: patch.escudo })
          .catch(err => { setHpError(err instanceof Error ? err.message : 'No se pudo guardar'); throw err; });
      }}
    />
  );

  let meta = kindTag(participant.kind);
  let defense: Defense[] | null = null;
  let penetration: Pen[] | null = null;
  let utility: Pen[] | null = null;
  let bars: ReactNode = null;
  let equipment: string[] = [];

  if (player) {
    const total = playerTotalLine(player.sheet, player.equipamiento, undefined, extra);
    meta = `NVL ${level} · ${player.rol?.trim() || 'Sin rol'}`;
    defense = [
      { label: 'CA', value: total.ac },
      { label: 'Velocidad', value: total.spe },
      { label: 'MR', value: total.mr },
    ];
    penetration = penetrationOf(total);
    utility = utilityOf(total);
    equipment = player.equipamiento ?? [];
    const suggestedMax = typeof total.hp === 'number' && Number.isFinite(total.hp) ? total.hp : 0;
    const suggestedMana = typeof total.mana === 'number' && Number.isFinite(total.mana) ? total.mana : 0;
    const change = (patch: PlayerListPatch) => {
      setHpError(null);
      return onPlayerChange(player.name, patch).catch(err => {
        setHpError(err instanceof Error ? err.message : 'No se pudo guardar');
        throw err;
      });
    };
    bars = canSee ? (
      <>
        <div className="sheet-panel sheet-side__hp">
          <HpPanel
            player={player}
            suggestedMax={suggestedMax}
            linkedMax={playerMaxHp(player.sheet, player.equipamiento)}
            saving={saving}
            error={hpError}
            onChange={change}
          />
        </div>
        <div className="sheet-panel sheet-side__mana">
          <ManaPanel player={player} suggestedMax={suggestedMana} saving={saving} error={hpError} onChange={change} />
        </div>
      </>
    ) : (
      <p className="combat-page__hint">Vida y maná ocultos: solo los ve su player y el admin.</p>
    );
  } else if (champion) {
    const { stats, level: champLevel } = championDamageContext(champion, extra);
    meta = `NVL ${champLevel} · ${champion.role || 'Campeón'}`;
    defense = [
      { label: 'CA', value: stats.ac },
      { label: 'Velocidad', value: stats.spe },
      { label: 'MR', value: stats.mr },
    ];
    penetration = penetrationOf(stats);
    utility = utilityOf(stats);
    equipment = champion.equipamiento ?? [];
    const hp = championPool(champion, participant, 'hp');
    const spend = resolvedSpendKind(undefined, champion.resource ? { resource: champion.resource } : undefined);
    const pool = spend.kind === 'pool' ? championPool(champion, participant, 'pool') : null;
    bars = (
      <>
        <div className="sheet-panel sheet-side__hp">
          {canSee ? participantHpPanel(hp.current, hp.max) : (
            <p className="combat-page__hint">Vida oculta: solo la ve el admin.</p>
          )}
        </div>
        {pool && (
          <div className="sheet-panel sheet-side__mana">
            <ManaPanel
              player={{ mana: pool.max, actualMana: pool.current }}
              suggestedMax={pool.max}
              label={pool.label}
              resourceId={pool.resourceId ?? 'mana'}
              readOnly={!isAdmin}
              saving={saving}
              error={hpError}
              onChange={patch => {
                setHpError(null);
                const nextMax = typeof patch.mana === 'number' && patch.mana !== pool.max ? patch.mana : undefined;
                return onResourceSave(patch.actualMana ?? pool.current, nextMax)
                  .catch(err => { setHpError(err instanceof Error ? err.message : 'No se pudo guardar'); throw err; });
              }}
            />
          </div>
        )}
      </>
    );
  } else if (participant.kind === 'npc' || participant.kind === 'custom') {
    if (npc && isAdmin) {
      meta = `NVL ${npc.level ?? 0} · ${npc.type || 'NPC'}`;
      defense = NPC_STATS.filter(stat => stat.key === 'ac' || stat.key === 'spe' || stat.key === 'mr')
        .map(stat => {
          // Debuffs / bonus del combate (p. ej. Cuchilla negra −armadura) sobre la stat del NPC.
          const delta = (participant.bonuses ?? []).filter(bonus => bonus.stat === stat.key).reduce((sum, bonus) => sum + bonusValue(bonus), 0);
          const value = npc.stats?.[stat.key];
          return { label: stat.key === 'ac' ? 'CA' : stat.label, value: typeof value === 'number' && delta ? Math.round((value + delta) * 100) / 100 : value };
        });
    }
    const hp = participantHp(participant);
    bars = (
      <div className="sheet-panel sheet-side__hp">
        {!canSee ? (
          <p className="combat-page__hint">Vida oculta: solo la ve el admin.</p>
        ) : hp && hp.max !== undefined ? participantHpPanel(hp.current, hp.max) : (
          <p className="combat-page__hint">Sin vida definida.</p>
        )}
      </div>
    );
  }

  const canTrack = (isAdmin || canSee) && !saving;
  const entries = participants.map(p => ({ id: p.id, name: p.name, image: p.image, rol: kindTag(p.kind) }));
  const currentEntry = entries.find(entry => entry.id === participant.id) ?? { id: participant.id, name: participant.name, image: participant.image };

  return (
    <div className="sheet combat-sheet">
      <div className="sheet-topbar combat-sheet__topbar">
        <span className="combat-sheet__kicker">Combatiente</span>
        {onSelect && (
          <PlayerSwitcher
            players={entries}
            current={currentEntry}
            listLabel="Participantes del combate"
            onSelect={entry => onSelect(entry.id)}
          />
        )}
      </div>

      <div className="sheet-body">
        <aside className="sheet-side">
          <div className="sheet-portrait">
            {participant.image && !portraitFailed
              ? <img className="sheet-portrait__img" src={participant.image} alt={participant.name} onError={() => setPortraitFailed(true)} />
              : <div className="sheet-portrait__placeholder" aria-hidden="true">⚔</div>}
          </div>
          <div className="sheet-side__identity">
            <h1 className="sheet-side__name">{participant.name}</h1>
            {player && myPlayer && player.name.toLocaleLowerCase('es') === myPlayer.toLocaleLowerCase('es') && (
              <div className="sheet-side__mine">Tu ficha</div>
            )}
            <div className="sheet-side__meta">{meta}</div>
            {participant.defeated && <div className="combat-sheet__down">Derrotado</div>}
          </div>
          {bars}
          {defense && <DefenseCards stats={defense} />}
          {penetration && <PenetrationCards stats={penetration} />}
          {utility && <PenetrationCards stats={utility} className="combat-sheet__pen combat-sheet__utility" />}
          {(bonuses.length > 0 || canEditBonuses) && (
            <div className="combat-bonuses">
              <div className="combat-bonuses__chips">
                {bonuses.map(bonus => (
                  <span key={bonus.id} className="combat-bonus" title={bonus.source?.startsWith('item:') ? `Pasiva de ${bonus.source.slice(5)}` : 'Bonus manual'}>
                    {bonus.label && <span className="combat-bonus__src">{bonus.label}</span>}
                    <span>{formatBonus(bonus)}</span>
                    {canEditBonuses && typeof bonus.stacks === 'number' && (
                      <>
                        <button type="button" className="combat-bonus__btn" disabled={bonusBusy || bonus.stacks <= 1} aria-label="Quitar un stack" onClick={() => saveBonuses(bonuses.map(entry => (entry.id === bonus.id ? { ...entry, stacks: Math.max(1, (entry.stacks ?? 1) - 1) } : entry)))}>−</button>
                        <button type="button" className="combat-bonus__btn" disabled={bonusBusy || bonus.stacks >= (bonus.maxStacks ?? 99)} aria-label="Añadir un stack" onClick={() => saveBonuses(bonuses.map(entry => (entry.id === bonus.id ? { ...entry, stacks: Math.min(entry.maxStacks ?? 99, (entry.stacks ?? 1) + 1) } : entry)))}>+</button>
                      </>
                    )}
                    {canEditBonuses && (
                      <button type="button" className="combat-bonus__btn" disabled={bonusBusy} aria-label="Quitar bonus" onClick={() => saveBonuses(bonuses.filter(entry => entry.id !== bonus.id))}>✕</button>
                    )}
                  </span>
                ))}
                {canEditBonuses && !bonusForm && (
                  <button type="button" className="combat-actions__extra" disabled={bonusBusy} onClick={() => { setBonusError(null); setBonusForm({ stat: 'lethality', amount: '', turns: '', stacks: '' }); }}>+ Bonus</button>
                )}
              </div>
              {bonusForm && (
                <div className="combat-bonus-form">
                  <select value={bonusForm.stat} disabled={bonusBusy} onChange={e => setBonusForm({ ...bonusForm, stat: e.target.value })} aria-label="Stat">
                    {STAT_COLUMNS.map(column => <option key={column.key} value={column.key}>{column.title}</option>)}
                  </select>
                  <input inputMode="decimal" placeholder="Cantidad" value={bonusForm.amount} disabled={bonusBusy} onChange={e => setBonusForm({ ...bonusForm, amount: e.target.value })} aria-label="Cantidad" />
                  <input inputMode="numeric" placeholder="Turnos (vacío = hasta quitarlo)" value={bonusForm.turns} disabled={bonusBusy} onChange={e => setBonusForm({ ...bonusForm, turns: e.target.value })} aria-label="Turnos" />
                  <input inputMode="numeric" placeholder="Stacks (opcional)" value={bonusForm.stacks} disabled={bonusBusy} onChange={e => setBonusForm({ ...bonusForm, stacks: e.target.value })} aria-label="Stacks" />
                  <div className="combat-panel__picker-actions">
                    <button type="button" className="combat-btn combat-btn--small combat-btn--gold" disabled={bonusBusy} onClick={addBonus}>Añadir</button>
                    <button type="button" className="combat-btn combat-btn--small" disabled={bonusBusy} onClick={() => setBonusForm(null)}>Cancelar</button>
                  </div>
                </div>
              )}
              {bonusError && <p className="combat-page__error">{bonusError}</p>}
            </div>
          )}
          <div className="combat-sheet__strip">{strip}</div>
        </aside>

        <div className="sheet-content">
          {abilities}
          {participant.kind === 'npc' && isAdmin && npc && npc.abilities?.length > 0 && (
            <section className="sheet-panel">
              <div className="sheet-panel__title">Habilidades</div>
              <ul className="combat-sheet__abilities">
                {npc.abilities.map(ability => (
                  <li key={ability.id}>
                    <span className="combat-sheet__ability-name">{ability.label ? `${ability.label} · ` : ''}{ability.name}</span>
                    {ability.cost && <span className="combat-panel__badge" title="Coste">{ability.cost}</span>}
                    {ability.description && <p className="combat-sheet__ability-desc">{ability.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {equipment.length > 0 && (
            <section className="sheet-panel">
              <div className="sheet-panel__title">Objetos</div>
              <div className="calc-equip-grid">
                {equipment.map((itemName, index) => {
                  const item = findItem(itemName);
                  const usable = itemIsUsable(item);
                  const cdLeft = usable ? itemCd(itemName) : 0;
                  const ready = usable && canUseItems && cdLeft === 0 && !saving && !itemBusy;
                  const hint = !usable
                    ? 'Sin activa ni daño · Clic derecho: info'
                    : cdLeft > 0
                      ? `En enfriamiento (CD ${cdLeft}) · Clic derecho: info`
                      : canUseItems ? 'Clic: usar · Clic derecho: info' : 'Clic derecho: info';
                  return (
                    <div key={`${itemName}-${index}`} className="combat-sheet__item">
                      <div
                        className={cx('combat-sheet__tile', usable && 'combat-sheet__tile--usable', ready && 'combat-sheet__tile--ready', cdLeft > 0 && 'combat-sheet__tile--cd')}
                        role="button"
                        tabIndex={0}
                        title={hint}
                        aria-label={`${itemName}: ${hint}`}
                        aria-disabled={!ready}
                        onClick={() => { if (ready) void useItem(itemName, item); }}
                        onContextMenu={event => { event.preventDefault(); inspectItem(item); }}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (ready) void useItem(itemName, item);
                          } else if (event.key === 'i' || event.key === 'I') {
                            inspectItem(item);
                          }
                        }}
                      >
                        <ItemTile name={itemName} item={item} />
                        {cdLeft > 0 && <span className="combat-sheet__tile-cd">CD {cdLeft}</span>}
                      </div>
                      {player && item?.hasStacks && (
                        <StackCounter
                          value={readStack(player.stacks, itemStackKey(itemName))}
                          max={typeof item.maxStacks === 'number' ? item.maxStacks : undefined}
                          disabled={!canTrack}
                          label={`Stacks · ${itemName}`}
                          onChange={next => { void onPlayerChange(player.name, { stacks: { ...player.stacks, [itemStackKey(itemName)]: next } }); }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {(itemUse || itemError || itemTarget) && (
            <section className="sheet-panel">
              {itemUse && (
                <div className="combat-panel__use-result" aria-live="polite">
                  <p className="combat-panel__use-headline">{itemUse.headline}</p>
                  {itemUse.detail && <p className="combat-panel__use-detail">{itemUse.detail}</p>}
                  {itemUse.undo && (
                    <button type="button" className="combat-btn combat-btn--small" disabled={saving || itemBusy} onClick={itemUse.undo}>Deshacer</button>
                  )}
                </div>
              )}
              {itemError && <p className="combat-page__error">{itemError}</p>}
              {itemTarget && (
                <CombatTargetPicker
                  key={itemTarget.name}
                  title={`Objetivos de ${itemTarget.item.effectName || itemTarget.name}`}
                  targets={participants.filter(entry => entry.id !== participant.id)}
                  disabled={saving || itemBusy}
                  onConfirm={ids => void runItem(itemTarget.name, itemTarget.item, ids)}
                  onSkip={() => void runItem(itemTarget.name, itemTarget.item, [])}
                  onCancel={() => setItemTarget(null)}
                />
              )}
            </section>
          )}
          {trackers && <section className="sheet-panel combat-sheet__trackers">{trackers}</section>}
        </div>
      </div>

      {inspectedItem && createPortal(
        <ItemDetailModal item={inspectedItem} readOnly onClose={closeItemInfo} />,
        document.body,
      )}
    </div>
  );
}
