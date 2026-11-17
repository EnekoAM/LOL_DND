import { useMemo, useState } from 'react';
import type { CombatParticipant } from '../../data/combat';
import type { NamedEffectData } from '../../data/namedEffectDescriptions';
import { packTacticsHitBonus } from '../../data/combatTraits';
import { incomingDamageReductionPct as abilityDamageReductionPct } from '../../data/abilityMechanics';
import { cx } from '../../lib/cx';
import { participantAbilities } from './abilityRules';
import { formatDamageType } from './combatAbilityUse';
import { bonusValue } from './combatBonuses';
import { critNeeded, effectiveResist, hitNeeded } from './combatMitigation';
import { fmt } from './combatResult';
import { combatExtraLines, participantContext } from './effectRules';
import { foldText } from './combatHelpers';
import { ITEM_SPELL_SHIELD_PREFIX, incomingDamageReductionPct as itemDamageReductionPct } from './itemCombatHooks';
import './CombatHitCheck.css';

/**
 * Calculadora de tiradas para el GM (solo lectura, no guarda nada):
 * misma regla que la consola del combate (combatMitigation.hitRollLines):
 *   CA/RM efectiva = max(0, resistencia × (1 − %pen) − pen. plana)
 *   d20 necesario = max(1, ⌈efectiva − bonus al impacto⌉)
 *   Físico: 20 natural = impacto y crítico automático. Daño verdadero: no tira.
 */

type AttackKind = 'aa' | 'ability';
type DamageKind = 'physical' | 'magic' | 'true';

type Props = {
  participants: CombatParticipant[];
  level: number;
  effectData: NamedEffectData;
  onClose?: () => void;
};

const num = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const round = (value: number) => Math.round(value * 1000) / 1000;
const parseInput = (value: string): number | null => {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

type SourceLine = { label: string; value: number };

/** Total de una stat del participante (como en su ficha de combate) y de dónde sale. */
function statBreakdown(participant: CombatParticipant, level: number, data: NamedEffectData, key: string): { total: number; lines: SourceLine[] } {
  const full = participantContext(participant, level, combatExtraLines(participant, level, data));
  const base = participantContext(participant, level, []);
  const total = num(full?.ctx.stats[key]);
  const baseValue = num(base?.ctx.stats[key]);
  const lines: SourceLine[] = [];
  if (baseValue) lines.push({ label: participant.kind === 'npc' ? 'Ficha del NPC' : 'Ficha + objetos', value: baseValue });
  let combat = 0;
  for (const bonus of participant.bonuses ?? []) {
    if (bonus.stat !== key) continue;
    const value = bonusValue(bonus);
    if (!value) continue;
    combat += value;
    const turns = typeof bonus.turns === 'number' ? ` · ${bonus.turns >= 999 ? '\u221e (resto del combate)' : `${bonus.turns} t.`}` : '';
    lines.push({ label: `${bonus.label ?? bonus.source ?? 'Bonus de combate'}${turns}`, value });
  }
  const rest = round(total - baseValue - combat);
  if (Math.abs(rest) > 1e-6) lines.push({ label: 'Pasivas «siempre» / cargas de efectos', value: rest });
  return { total, lines };
}

const signedText = (value: number): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt(Math.abs(value))}`;

function abilityKind(type?: string): DamageKind | 'mixed' {
  const label = formatDamageType(type);
  if (label === 'daño mágico') return 'magic';
  if (label === 'daño verdadero') return 'true';
  if (label === 'daño mixto') return 'mixed';
  return 'physical';
}

const KIND_LABEL: Record<DamageKind, string> = { physical: 'Físico', magic: 'Mágico', true: 'Verdadero' };

export default function CombatHitCheck({ participants, level, effectData, onClose }: Props) {
  const alive = participants;
  const [attackerId, setAttackerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [attack, setAttack] = useState<AttackKind>('aa');
  const [damage, setDamage] = useState<DamageKind>('physical');
  const [abilityName, setAbilityName] = useState<string>('');
  const [rollText, setRollText] = useState('');
  const [modText, setModText] = useState('');
  const [critText, setCritText] = useState('');
  const [useReducedStates, setUseReducedStates] = useState(true);

  const attacker = alive.find(entry => entry.id === attackerId) ?? null;
  const target = alive.find(entry => entry.id === targetId) ?? null;

  const abilities = useMemo(
    () => (attacker ? participantAbilities(attacker, level).filter(row => row.rank > 0) : []),
    [attacker, level],
  );

  const pickAbility = (name: string) => {
    setAbilityName(name);
    const row = abilities.find(entry => entry.name === name);
    if (!row) return;
    const kind = abilityKind(row.ability.damage?.type);
    if (kind !== 'mixed') setDamage(kind);
  };

  const sideLabel = (entry: CombatParticipant) => (entry.kind === 'player' ? 'player' : entry.kind === 'champion' ? 'campeón' : entry.kind === 'npc' ? 'NPC' : 'custom');

  const result = useMemo(() => {
    if (!attacker || !target) return null;
    const physical = damage === 'physical';
    const notes: string[] = [];
    const warnings: string[] = [];

    // Escudo de hechizos del objetivo: bloquea la siguiente habilidad (no los AA).
    let blockedBy: string | null = null;
    if (attack === 'ability') {
      // Mismo orden que al aplicar la habilidad: primero el escudo de una habilidad, luego el de un objeto (el de menos turnos).
      const abilityUp = participantAbilities(target, level).some(row => row.ability.mechanics?.spellShield
        && (target.effects ?? []).some(effect => effect.source === `ability:${row.name}` && (effect.duration ?? 0) > 0));
      const itemShield = abilityUp ? undefined : (target.effects ?? [])
        .filter(effect => (effect.source ?? '').startsWith(ITEM_SPELL_SHIELD_PREFIX) && (effect.duration ?? 0) > 0)
        .sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0))[0];
      if (itemShield) blockedBy = `«${itemShield.name}» (objeto)`;
      if (!blockedBy) {
        const owned = participantAbilities(target, level).find(row => row.ability.mechanics?.spellShield
          && (target.effects ?? []).some(effect => effect.source === `ability:${row.name}` && (effect.duration ?? 0) > 0));
        if (owned) blockedBy = `«${owned.ability.mechanics!.spellShield!.status}» (${owned.seal} «${owned.name}»)`;
      }
    }

    // Estados del atacante / objetivo que el GM debería mirar.
    const has = (entry: CombatParticipant, key: string) => (entry.effects ?? []).some(effect => (effect.duration ?? 0) > 0 && foldText(effect.name).includes(key));
    if (attack === 'aa' && (has(attacker, 'cegad') || has(attacker, 'ceguera'))) warnings.push(`${attacker.name} está cegado: en LoL los AA fallan (decide tú).`);
    if (has(target, 'invisible')) warnings.push(`${target.name} está invisible.`);
    if (attacker.defeated) warnings.push(`${attacker.name} está derrotado.`);
    if (target.defeated) warnings.push(`${target.name} está derrotado.`);

    const reductionPctItems = itemDamageReductionPct(target, effectData, attack === 'aa' ? 'aa' : 'all');
    const reductionPctAbility = abilityDamageReductionPct(target.bonuses);
    if (reductionPctItems) notes.push(`${target.name}: −${fmt(reductionPctItems)}% de daño recibido${attack === 'aa' ? ' de AA' : ''} por objetos (afecta al daño, no al impacto).`);
    if (reductionPctAbility) notes.push(`${target.name}: −${fmt(reductionPctAbility)}% de daño recibido por habilidades (afecta al daño, no al impacto).`);

    if (damage === 'true') {
      return { kind: damage, trueDamage: true as const, blockedBy, notes, warnings };
    }

    const resistKey = physical ? 'ac' : 'mr';
    const resist = statBreakdown(target, level, effectData, resistKey);
    // Estados manuales «AC reducido» / «MR reducido» (chip con valor): no suman en la ficha, se aplican aquí.
    const reducedName = physical ? 'ac reducido' : 'mr reducido';
    const reducedStates = (target.effects ?? []).filter(effect => (effect.duration ?? 0) > 0 && foldText(effect.name) === reducedName && typeof effect.value === 'number' && effect.value > 0);
    const reducedTotal = reducedStates.reduce((sum, effect) => sum + (effect.value ?? 0) * Math.max(1, effect.stacks ?? 1), 0);
    const appliedReduced = useReducedStates ? reducedTotal : 0;
    const resistTotal = Math.max(0, resist.total - appliedReduced);

    const pct = statBreakdown(attacker, level, effectData, physical ? 'armorPenPct' : 'magicPenPct');
    const flat = statBreakdown(attacker, level, effectData, physical ? 'lethality' : 'magicPen');
    const afterPct = resistTotal * (1 - pct.total / 100);
    const effective = effectiveResist(resistTotal, pct.total, flat.total);
    const hitBonus = packTacticsHitBonus(attacker.bonuses);
    const hitBonusLines: SourceLine[] = (attacker.bonuses ?? []).filter(bonus => bonus.stat === 'hit').map(bonus => ({ label: bonus.label ?? bonus.source ?? 'Bonus al impacto', value: bonusValue(bonus) }));
    const needed = hitNeeded(Math.max(0, effective - (hitBonus || 0)));

    const roll = parseInput(rollText);
    const mod = parseInput(modText) ?? 0;
    const total = roll === null ? null : roll + mod;
    const natural20 = roll === 20;
    let hit: boolean | null = null;
    let why = '';
    if (roll !== null && total !== null) {
      if (blockedBy) { hit = false; why = `Bloqueada por ${blockedBy}`; }
      else if (physical && natural20) { hit = true; why = '20 natural: impacto y crítico automático'; }
      else if (total >= needed && needed <= 20) { hit = true; why = `${fmt(total)} ≥ ${needed}`; }
      else if (total >= needed) { hit = true; why = `${fmt(total)} ≥ ${needed} (con modificador)`; }
      else { hit = false; why = `${fmt(total)} < ${needed}`; }
    }

    // Crítico (solo físico): prob. crít. en caras del d20.
    const critFaces = num(participantContext(attacker, level, combatExtraLines(attacker, level, effectData))?.ctx.stats.critChance);
    const critNeed = physical ? critNeeded(critFaces) : null;
    const critRoll = parseInput(critText);
    let crit: boolean | null = null;
    if (physical && hit) {
      if (natural20) crit = true;
      else if (critNeed === 'auto') crit = true;
      else if (critNeed === null) crit = false;
      else if (critRoll !== null) crit = critRoll >= critNeed;
    }

    return {
      kind: damage,
      trueDamage: false as const,
      blockedBy,
      notes,
      warnings,
      resistKey,
      resist,
      reducedStates,
      reducedTotal,
      appliedReduced,
      resistTotal,
      pct,
      flat,
      afterPct,
      effective,
      hitBonus,
      hitBonusLines,
      needed,
      roll,
      mod,
      total,
      hit,
      why,
      critFaces,
      critNeed,
      crit,
    };
  }, [attacker, target, attack, damage, rollText, modText, critText, useReducedStates, level, effectData]);

  const option = (entry: CombatParticipant) => (
    <option key={entry.id} value={entry.id}>{entry.name} ({sideLabel(entry)}){entry.defeated ? ' · derrotado' : ''}</option>
  );

  const sourceList = (lines: SourceLine[], empty = 'nada') => (
    lines.length
      ? <ul className="combat-hit__sources">{lines.map((line, index) => <li key={index}><span>{line.label}</span><b>{signedText(line.value)}</b></li>)}</ul>
      : <p className="combat-hit__muted">{empty}</p>
  );

  return (
    <section className="combat-card combat-hit">
      <div className="combat-hit__head">
        <h2 className="combat-card__title">Tiradas · ¿entra o no?</h2>
        {onClose && <button type="button" className="combat-btn combat-btn--small" onClick={onClose}>Cerrar</button>}
      </div>
      <p className="combat-hit__muted">Solo para el GM. Calcula con las stats actuales del combate (objetos, pasivas y bonus temporales). No guarda nada.</p>

      <div className="combat-hit__grid">
        <label className="combat-hit__field">
          <span>Atacante</span>
          <select value={attackerId} onChange={event => { setAttackerId(event.target.value); setAbilityName(''); }}>
            <option value="">— Elige —</option>
            {alive.map(option)}
          </select>
        </label>
        <label className="combat-hit__field">
          <span>Objetivo</span>
          <select value={targetId} onChange={event => setTargetId(event.target.value)}>
            <option value="">— Elige —</option>
            {alive.filter(entry => entry.id !== attackerId).map(option)}
          </select>
        </label>
      </div>

      <div className="combat-hit__row">
        <span className="combat-hit__label">Ataque</span>
        <button type="button" className={cx('combat-chip', attack === 'aa' && 'combat-chip--on')} onClick={() => setAttack('aa')}>Auto-ataque</button>
        <button type="button" className={cx('combat-chip', attack === 'ability' && 'combat-chip--on')} onClick={() => setAttack('ability')}>Habilidad</button>
        {attack === 'ability' && abilities.length > 0 && (
          <select className="combat-hit__ability" value={abilityName} onChange={event => pickAbility(event.target.value)}>
            <option value="">— Habilidad (opcional) —</option>
            {abilities.map(row => (
              <option key={`${row.seal}-${row.name}`} value={row.name}>{row.seal} · {row.name} ({formatDamageType(row.ability.damage?.type)})</option>
            ))}
          </select>
        )}
      </div>

      <div className="combat-hit__row">
        <span className="combat-hit__label">Daño</span>
        {(['physical', 'magic', 'true'] as const).map(kind => (
          <button key={kind} type="button" className={cx('combat-chip', damage === kind && 'combat-chip--on')} onClick={() => setDamage(kind)}>{KIND_LABEL[kind]}</button>
        ))}
      </div>

      <div className="combat-hit__grid combat-hit__grid--3">
        <label className="combat-hit__field">
          <span>Tirada d20</span>
          <input value={rollText} inputMode="numeric" placeholder="1–20" onChange={event => setRollText(event.target.value)} />
        </label>
        <label className="combat-hit__field">
          <span>Modificador extra</span>
          <input value={modText} inputMode="numeric" placeholder="0" title="Ajuste manual del GM (situacional)" onChange={event => setModText(event.target.value)} />
        </label>
        {damage === 'physical' && (
          <label className="combat-hit__field">
            <span>2º d20 (crítico)</span>
            <input value={critText} inputMode="numeric" placeholder="opcional" onChange={event => setCritText(event.target.value)} />
          </label>
        )}
      </div>

      {!result && <p className="combat-hit__muted">Elige atacante y objetivo.</p>}

      {result && result.trueDamage && (
        <div className={cx('combat-hit__verdict', result.blockedBy ? 'combat-hit__verdict--miss' : 'combat-hit__verdict--hit')}>
          {result.blockedBy ? `✖ Bloqueada por ${result.blockedBy}` : '✔ Daño verdadero: no necesita tirada (ignora CA / RM)'}
        </div>
      )}

      {result && !result.trueDamage && (
        <>
          <div className={cx('combat-hit__verdict', result.hit === true && 'combat-hit__verdict--hit', result.hit === false && 'combat-hit__verdict--miss')}>
            {result.hit === null
              ? (result.blockedBy ? `✖ Bloqueada por ${result.blockedBy}` : `Necesita d20 ≥ ${result.needed}${result.needed > 20 ? (result.kind === 'physical' ? ' (solo con 20 natural)' : ' (no llega con un d20)') : ''}`)
              : `${result.hit ? '✔ ENTRA' : '✖ NO ENTRA'} · ${result.why}`}
            {result.hit && result.kind === 'physical' && (
              <span className="combat-hit__crit">
                {result.crit === true ? ' · CRÍTICO' : result.crit === false ? ' · sin crítico' : typeof result.critNeed === 'number' ? ` · crítico con 2º d20 ≥ ${result.critNeed}` : ''}
              </span>
            )}
          </div>

          <div className="combat-hit__cols">
            <div className="combat-hit__box">
              <h3>{result.resistKey === 'ac' ? 'CA' : 'RM'} de {target?.name}</h3>
              {sourceList(result.resist.lines, 'sin resistencia')}
              <p className="combat-hit__sum">Total ficha: <b>{fmt(round(result.resist.total))}</b></p>
              {result.reducedStates.length > 0 && (
                <label className="combat-hit__check">
                  <input type="checkbox" checked={useReducedStates} onChange={event => setUseReducedStates(event.target.checked)} />
                  Estados «{result.resistKey === 'ac' ? 'AC' : 'MR'} reducido»: −{fmt(result.reducedTotal)}
                </label>
              )}
              {result.appliedReduced > 0 && <p className="combat-hit__sum">Tras reducciones: <b>{fmt(round(result.resistTotal))}</b></p>}
            </div>

            <div className="combat-hit__box">
              <h3>Penetración de {attacker?.name}</h3>
              <p className="combat-hit__sub">{result.kind === 'physical' ? '% pen. armadura' : '% pen. mágica'}: <b>{fmt(round(result.pct.total))}%</b></p>
              {sourceList(result.pct.lines)}
              <p className="combat-hit__sub">{result.kind === 'physical' ? 'Letalidad' : 'Pen. mágica plana'}: <b>{fmt(round(result.flat.total))}</b></p>
              {sourceList(result.flat.lines)}
              <p className="combat-hit__sub">Bonus al impacto: <b>{signedText(result.hitBonus)}</b></p>
              {sourceList(result.hitBonusLines)}
            </div>
          </div>

          <ol className="combat-hit__steps">
            <li>{result.resistKey === 'ac' ? 'CA' : 'RM'}: {fmt(round(result.resistTotal))}</li>
            {result.pct.total ? <li>× (1 − {fmt(round(result.pct.total))}%) = {fmt(round(result.afterPct))}</li> : null}
            {result.flat.total ? <li>− {fmt(round(result.flat.total))} {result.kind === 'physical' ? 'letalidad' : 'pen. mágica'} = {fmt(round(result.effective))}{result.afterPct - result.flat.total < 0 ? ' (mín. 0)' : ''}</li> : null}
            <li>{result.kind === 'physical' ? 'CA' : 'RM'} efectiva: <b>{fmt(round(result.effective))}</b>{result.hitBonus ? ` − ${fmt(round(result.hitBonus))} al impacto` : ''} → d20 necesario <b>{result.needed}</b> (redondeo ↑, mín. 1)</li>
            {result.total !== null && <li>Tirada: {fmt(result.roll ?? 0)}{result.mod ? ` ${signedText(result.mod)} = ${fmt(result.total)}` : ''}</li>}
            {result.kind === 'physical' && <li>Prob. crítico: {fmt(result.critFaces)} caras{typeof result.critNeed === 'number' ? ` → 2º d20 ≥ ${result.critNeed}` : result.critNeed === 'auto' ? ' → automático' : ' → sin tirada'} · 20 natural = crítico automático</li>}
          </ol>
        </>
      )}

      {result && (result.warnings.length > 0 || result.notes.length > 0 || result.blockedBy) && (
        <ul className="combat-hit__notes">
          {result.blockedBy && <li className="combat-hit__warn">{target?.name} tiene {result.blockedBy} activo: bloquea esta habilidad (al usarla de verdad se rompe).</li>}
          {result.warnings.map((line, index) => <li key={`w${index}`} className="combat-hit__warn">{line}</li>)}
          {result.notes.map((line, index) => <li key={`n${index}`}>{line}</li>)}
        </ul>
      )}
    </section>
  );
}

