import type { AbilityDraft } from './abilityDraft';

const ScalingSourceFields = ({ draft, disabled, onChange }: {
  draft: AbilityDraft;
  disabled: boolean;
  onChange: (patch: Partial<AbilityDraft>) => void;
}) => (
  <>
    {(['ad', 'ap'] as const).map(stat => {
      const key = stat === 'ad' ? 'adSource' : 'apSource';
      return (
        <label className="hab-field" key={stat}>
          <span>Origen del escalado de {stat.toUpperCase()}</span>
          <select className="hab-select" value={draft[key]} disabled={disabled}
            onChange={event => onChange({ [key]: event.target.value === 'bonus' ? 'bonus' : 'total' })}>
            <option value="total">Total (base por nivel + equipo + extras)</option>
            <option value="bonus">Bonus (solo equipo + extras, sin base por nivel)</option>
          </select>
        </label>
      );
    })}
    <p className="hab-modal__hint">Bonus excluye la base de la tabla de rol al nivel actual. Total conserva el comportamiento anterior.</p>
  </>
);

export default ScalingSourceFields;