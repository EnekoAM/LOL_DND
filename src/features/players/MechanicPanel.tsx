import { useEffect, useMemo, useState } from 'react';
import {
  FAMA_REGIONS,
  famaRankTitle,
  humanidadActiveTiers,
  mechanicLabels,
  resolveMechanic,
  resolveRuinaControl,
  RUINA_MAX,
  type PlayerMechanic,
  type RuinaControlResult,
} from './mechanic';

type Props = {
  playerName: string;
  mechanic: PlayerMechanic | null | undefined;
  /** Solo el admin (GM) puede cambiar valores. */
  canEdit: boolean;
  saving: boolean;
  error: string | null;
  onChange: (mechanic: PlayerMechanic) => void | Promise<void>;
};

const Stepper = ({
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  value: number;
  min?: number;
  max?: number;
  disabled: boolean;
  onCommit: (next: number) => void;
}) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitParsed = () => {
    const parsed = Number(draft);
    if (!Number.isInteger(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <div className="sheet-mech__stepper">
      <button
        type="button"
        className="sheet-mech__btn"
        disabled={disabled || (min !== undefined && value <= min)}
        aria-label="Bajar"
        onClick={() => {
          const next = value - 1;
          if (min !== undefined && next < min) return;
          onCommit(next);
        }}
      >
        −
      </button>
      <input
        className="sheet-mech__input"
        type="number"
        inputMode="numeric"
        disabled={disabled}
        value={disabled ? String(value) : draft}
        min={min}
        max={max}
        onChange={event => setDraft(event.target.value)}
        onBlur={commitParsed}
        onKeyDown={event => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        className="sheet-mech__btn"
        disabled={disabled || (max !== undefined && value >= max)}
        aria-label="Subir"
        onClick={() => {
          const next = value + 1;
          if (max !== undefined && next > max) return;
          onCommit(next);
        }}
      >
        +
      </button>
    </div>
  );
};

const MechanicPanel = ({ playerName, mechanic, canEdit, saving, error, onChange }: Props) => {
  const resolved = useMemo(() => resolveMechanic(playerName, mechanic), [playerName, mechanic]);
  const [ruinaResult, setRuinaResult] = useState<RuinaControlResult | null>(null);

  useEffect(() => {
    setRuinaResult(null);
  }, [playerName]);

  if (!resolved) return null;

  const title = mechanicLabels[resolved.type];
  const busy = saving;

  const save = (next: PlayerMechanic) => {
    Promise.resolve(onChange(next)).catch(() => undefined);
  };

  return (
    <div className="sheet-panel sheet-side__mech">
      <div className="sheet-panel__title">{title}</div>

      {resolved.type === 'ruina' && (
        <>
          <div className="sheet-mech__row">
            <span className="sheet-mech__label">Contador</span>
            <Stepper
              value={resolved.value}
              min={1}
              max={RUINA_MAX}
              disabled={!canEdit || busy}
              onCommit={next => save({ type: 'ruina', value: next })}
            />
          </div>
          {resolved.value >= RUINA_MAX && (
            <p className="sheet-mech__warn" role="status">
              Pierde el control permanentemente salvo quest
            </p>
          )}
          <button
            type="button"
            className="sheet-mech__action"
            onClick={() => setRuinaResult(resolveRuinaControl(resolved.value))}
          >
            Tirada de control
          </button>
          {ruinaResult && (
            <div className={`sheet-mech__result ${ruinaResult.kind === 'lose' ? 'sheet-mech__result--bad' : 'sheet-mech__result--ok'}`}>
              <div className="sheet-mech__result-roll">
                1d20 = {ruinaResult.d20} (≤ {ruinaResult.contador} pierde el control)
              </div>
              {ruinaResult.kind === 'control' ? (
                <div className="sheet-mech__result-title">Mantiene el control</div>
              ) : (
                <>
                  <div className="sheet-mech__result-title">Pierde el control parcialmente</div>
                  <div className="sheet-mech__result-sub">
                    1d4 = {ruinaResult.effectRoll} · {ruinaResult.effect.title}
                  </div>
                  <p className="sheet-mech__result-text">{ruinaResult.effect.text}</p>
                </>
              )}
            </div>
          )}
        </>
      )}

      {resolved.type === 'humanidad' && (
        <>
          <div className="sheet-mech__row">
            <span className="sheet-mech__label">Humanidad</span>
            <Stepper
              value={resolved.value}
              min={-10}
              max={10}
              disabled={!canEdit || busy}
              onCommit={next => save({ type: 'humanidad', value: next })}
            />
          </div>
          {resolved.value === 0 ? (
            <p className="sheet-mech__hint">Sin efectos.</p>
          ) : (
            <ul className="sheet-mech__tiers">
              {humanidadActiveTiers(resolved.value).map(tier => (
                <li key={tier.level} className={tier.level > 0 ? 'sheet-mech__tier--pos' : 'sheet-mech__tier--neg'}>
                  <span className="sheet-mech__tier-lvl">{tier.level > 0 ? `+${tier.level}` : tier.level}</span>
                  <span className="sheet-mech__tier-text">{tier.text}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {resolved.type === 'fama' && (
        <ul className="sheet-mech__regions">
          {FAMA_REGIONS.map(region => {
            const score = resolved.regions[region] ?? 0;
            return (
              <li key={region} className="sheet-mech__region">
                <div className="sheet-mech__region-head">
                  <span className="sheet-mech__region-name">{region}</span>
                  <span className={`sheet-mech__region-rank ${score < 0 ? 'is-bad' : score > 0 ? 'is-good' : ''}`}>
                    {famaRankTitle(score)}
                  </span>
                </div>
                <Stepper
                  value={score}
                  disabled={!canEdit || busy}
                  onCommit={next =>
                    save({
                      type: 'fama',
                      regions: { ...resolved.regions, [region]: next },
                    })
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {!canEdit && <p className="sheet-mech__hint">Solo el GM puede editar estos valores.</p>}
      {error && <p className="calc-build-error">{error}</p>}
    </div>
  );
};

export default MechanicPanel;
