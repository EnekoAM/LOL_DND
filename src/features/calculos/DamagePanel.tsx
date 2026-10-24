import type { Ability } from '../../data/champions';
import { cx } from '../../lib/cx';
import { calculateDamage, clampLevel, type DamageInputs } from './damage';

type Props = {
  ability: Ability;
  inputs: DamageInputs;
  onInputsChange: (patch: Partial<DamageInputs>) => void;
  onBack: () => void;
};

type ResultRowProps = {
  label: string;
  value: string;
  isFinal?: boolean;
};

const ResultRow = ({ label, value, isFinal = false }: ResultRowProps) => (
  <div className={cx('calc-result__row', isFinal && 'calc-result__row--final')}>
    <span className="calc-result__label">{label}</span>
    <span className="calc-result__value">{value}</span>
  </div>
);

const DamagePanel = ({ ability, inputs, onInputsChange, onBack }: Props) => {
  const { damage } = ability;
  const levels = damage?.ap ?? [];
  const level = clampLevel(inputs.level, levels.length);
  const result = calculateDamage(damage, { ...inputs, level });

  return (
    <div className="calc-dmg-panel">
      <button className="calc-back-btn" onClick={onBack}>
        ← Volver a habilidades
      </button>

      <div className="calc-dmg-title">{ability.name}</div>

      <div className="calc-field">
        <label>Puntos de Habilidad (AP)</label>
        <input
          className="calc-input"
          type="number"
          value={inputs.ap}
          onChange={e => onInputsChange({ ap: Number(e.target.value) })}
        />
      </div>

      <div className="calc-field">
        <label>Nivel de habilidad</label>
        <select
          className="calc-select-dmg"
          value={level}
          onChange={e => onInputsChange({ level: Number(e.target.value) })}
        >
          {levels.map((_, index) => (
            <option key={index} value={index + 1}>Nivel {index + 1}</option>
          ))}
        </select>
      </div>

      {damage?.damageBonus !== undefined && (
        <label className="calc-checkbox-row">
          <input
            type="checkbox"
            checked={inputs.singleTarget}
            onChange={e => onInputsChange({ singleTarget: e.target.checked })}
          />
          Objetivo único (×{damage.damageBonus})
        </label>
      )}

      <div className="calc-result">
        <ResultRow label="Escalado AP" value={`${(result.scaling * 100).toFixed(0)}%`} />
        <ResultRow label="Daño base" value={result.base.toFixed(1)} />
        <ResultRow label="Daño final" value={result.final.toFixed(1)} isFinal />
      </div>
    </div>
  );
};

export default DamagePanel;
