import { useState } from 'react';
import Modal from '../../components/Modal';
import type { Ability } from '../../data/champions';
import type { DamageStats } from './abilityDamage';
import { damageBonusOf } from '../habilidades/abilityDraft';
import { hasDamageScaling, rollAbilityDamage, type AbilityDamageRoll } from './abilityDamage';
import PhaseTabs from '../habilidades/PhaseTabs';
import { parseAbilityCost } from '../combate/combatAbilityUse';
import { abilityPhase, hasVariants, isChoosePhases, phaseLabels } from '../../data/abilityVariants';

type Props = {
  ability: Ability;
  rank: number;
  maxRank?: number;
  statsNote?: string;
  stats: DamageStats;
  initialResult: AbilityDamageRoll | null;
  initialError: string | null;
  onClose: () => void;
  /** Fase con la que se abre (0 = base). */
  initialPhase?: number;
};

const number = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 2 });

const AbilityDamageModal = ({ ability: fullAbility, rank, stats, initialResult, initialError, onClose, maxRank, statsNote, initialPhase = 0 }: Props) => {
  const [selectedRank, setSelectedRank] = useState(rank);
  const [phase, setPhase] = useState(initialPhase);
  const ability = abilityPhase(fullAbility, phase);
  const [result, setResult] = useState(initialResult);
  const [error, setError] = useState(initialError);
  const [singleTarget, setSingleTarget] = useState(false);
  const bonus = damageBonusOf(ability.damage);
  const multiplier = singleTarget ? bonus ?? 1 : 1;
  const reroll = (nextRank = selectedRank, nextPhase = phase) => {
    const target = abilityPhase(fullAbility, nextPhase);
    if (!hasDamageScaling(target.damage)) {
      setResult(null);
      setError('Esta fase no tiene escalado de daño.');
      return;
    }
    try {
      setResult(rollAbilityDamage(target.damage!, stats, nextRank));
      setError(null);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : 'No se pudo tirar el daño');
    }
  };

  return (
    <Modal backdropClassName="hab-modal-backdrop" className="hab-modal" onClose={onClose}>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
      <section className="hab-modal__body" role="dialog" aria-modal="true" aria-labelledby="ability-damage-title">
        <div className="hab-modal__kicker">Tirada de daño · Rango {selectedRank} · {ability.damage?.type ?? 'Daño'}</div>
        {hasVariants(fullAbility) && (
          <div className="phase-tabs__row">
            <PhaseTabs labels={phaseLabels(fullAbility)} active={phase} onSelect={next => { setPhase(next); reroll(selectedRank, next); }} />
            {isChoosePhases(fullAbility) && <span className="phase-tabs__mode-chip">A elegir</span>}
          </div>
        )}
        <h2 id="ability-damage-title" className="hab-modal__title">{ability.name}</h2>
        {hasVariants(fullAbility) && ability.description && <p className="hab-modal__desc">{ability.description}</p>}
        {maxRank !== undefined && maxRank > 1 && (
          <label className="hab-field">
            <span>Rango de habilidad (prueba, no se guarda)</span>
            <select className="hab-select" value={selectedRank} onChange={event => {
              const nextRank = Number(event.target.value);
              setSelectedRank(nextRank);
              reroll(nextRank);
            }}>
              {Array.from({ length: maxRank }, (_, index) => (
                <option key={index + 1} value={index + 1}>Rango {index + 1}</option>
              ))}
            </select>
          </label>
        )}
        {ability.cost?.trim() && (() => {
          const rankCost = parseAbilityCost(ability.cost, selectedRank);
          return (
            <p className="hab-modal__meta">
              <strong>Coste{rankCost !== null && ability.cost.includes('/') ? ` (rango ${selectedRank})` : ''}:</strong>{' '}
              {rankCost !== null ? rankCost : ability.cost.trim()}
              {rankCost !== null && ability.cost.includes('/') ? ` · ${ability.cost.trim()}` : ''}
            </p>
          );
        })()}
        {error && <p className="hab-modal__error" role="alert">{error}</p>}
        {result && (
          <div aria-live="polite">
            {result.contributions.map(entry => (
              <div key={entry.stat} className="hab-modal__block">
                <span className="hab-modal__tag">{entry.stat.toUpperCase()} {entry.source === 'bonus' ? 'bonus' : 'total'} · {String(entry.roll.source)}</span>
                {entry.roll.groups.map((group, index) => (
                  <p key={index}>{group.sign < 0 ? '−' : ''}{group.count}d{group.sides}: [{group.rolls.join(', ')}]</p>
                ))}
                {entry.roll.flat !== 0 && <p>Modificador fijo: {number(entry.roll.flat)}</p>}
                <p>{entry.stat.toUpperCase()}: {number(entry.roll.total)} × {number(entry.scaling * 100)}% = <strong>{number(entry.damage)}</strong></p>
              </div>
            ))}
            <div className="hab-modal__block">
              <span className="hab-modal__tag">Daño total</span>
              <strong className="hab-modal__title">{number(result.total * multiplier)}</strong>
              {singleTarget && <p>{number(result.total)} × {number(multiplier)} (objetivo único)</p>}
            </div>
          </div>
        )}
        {bonus !== undefined && (
          <label className="hab-modal__desc">
            <input type="checkbox" checked={singleTarget} onChange={event => setSingleTarget(event.target.checked)} />
            {' '}Objetivo único (×{number(bonus)})
          </label>
        )}
        <p className="hab-modal__hint">{statsNote ?? 'AD/AP total: base de rol + equipo + extras. Bonus: solo equipo + extras, sin base por nivel. Se aplica el porcentaje del rango.'} No se consume maná ni se aplica daño al objetivo.</p>
        <div className="hab-modal__actions">
          <button type="button" className="hab-modal__btn" onClick={() => reroll()} disabled={selectedRank < 1}>Volver a tirar</button>
          <button type="button" className="hab-modal__btn hab-modal__btn--ghost" onClick={onClose} autoFocus>Cerrar</button>
        </div>
      </section>
      <div className="hab-modal__cap"><div className="hab-modal__rod" /></div>
    </Modal>
  );
};

export default AbilityDamageModal;