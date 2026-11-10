import { useEffect, useMemo, useState } from 'react';
import {
  FAMA_REGIONS,
  famaRankTitle,
  HUMANIDAD_MAX,
  HUMANIDAD_MIN,
  HUMANIDAD_NEGATIVE,
  HUMANIDAD_POSITIVE,
  mechanicLabels,
  resolveMechanic,
  resolveRuinaControl,
  RUINA_MAX,
  RUINA_MIN,
  type FamaRegion,
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

type RegionMeta = { color: string; glyph: string; short: string; crest: string; remote: string };

const CREST_BASE = '/crests';

const REGION_META: Record<FamaRegion, RegionMeta> = {
  Demacia: {
    color: '#4a6fb5', glyph: '⚜', short: 'D',
    crest: `${CREST_BASE}/demacia.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Demacia_Crest.png?23ab8',
  },
  Noxus: {
    color: '#b03a3a', glyph: '⚔', short: 'N',
    crest: `${CREST_BASE}/noxus.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Noxus_Crest.png?59dce',
  },
  Freljord: {
    color: '#3a8fc0', glyph: '❄', short: 'F',
    crest: `${CREST_BASE}/freljord.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Freljord_Crest.png?e9ee2',
  },
  Jonia: {
    color: '#c45a8a', glyph: '❀', short: 'J',
    crest: `${CREST_BASE}/ionia.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Ionia_Crest.png?e5303',
  },
  Piltover: {
    color: '#c9a84c', glyph: '⚙', short: 'P',
    crest: `${CREST_BASE}/piltover.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Piltover_Crest.png?7f8ef',
  },
  Zaun: {
    color: '#3aaa6a', glyph: '⚗', short: 'Z',
    crest: `${CREST_BASE}/zaun.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Zaun_Crest.png?63994',
  },
  Shurima: {
    color: '#d4922a', glyph: '☀', short: 'S',
    crest: `${CREST_BASE}/shurima.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Shuriman_Crest.png?c1857',
  },
  Targon: {
    color: '#8a7ab8', glyph: '✦', short: 'T',
    crest: `${CREST_BASE}/targon.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Targon_Crest.png?53a45',
  },
  Bilgewater: {
    color: '#2a8a9a', glyph: '⚓', short: 'B',
    crest: `${CREST_BASE}/bilgewater.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Bilgewater_Crest.png?3de05',
  },
  'Islas de la Sombra': {
    color: '#3a9a6a', glyph: '☠', short: 'I',
    crest: `${CREST_BASE}/shadow-isles.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Shadow_Isles_Crest.png?da638',
  },
  Ixtal: {
    color: '#4a9a3a', glyph: '🌿', short: 'X',
    crest: `${CREST_BASE}/ixtal.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Ixtal_Crest.png?62cb6',
  },
  Bandle: {
    color: '#b89a2a', glyph: '✦', short: 'A',
    crest: `${CREST_BASE}/bandle.png?v=2`,
    remote: 'https://wiki.leagueoflegends.com/en-us/images/Bandle_City_Crest.png?c170d',
  },
};

/** Escala visual de fama: mapa suave hacia ±100 para la barra. */
const famaBarPct = (score: number): number => {
  if (score === 0) return 0;
  const abs = Math.abs(score);
  const mapped = abs <= 100 ? abs : 100 + Math.min(50, Math.log10(abs / 100) * 40);
  const pct = Math.min(100, mapped);
  return score < 0 ? -pct : pct;
};

const Stepper = ({
  value,
  min,
  max,
  disabled,
  onCommit,
  size = 'md',
}: {
  value: number;
  min?: number;
  max?: number;
  disabled: boolean;
  onCommit: (next: number) => void;
  size?: 'sm' | 'md' | 'lg';
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
    <div className={`sheet-mech__stepper sheet-mech__stepper--${size}`}>
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
        aria-label="Valor"
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


const RegionCrest = ({
  region,
  size = 'md',
}: {
  region: FamaRegion;
  size?: 'sm' | 'md';
}) => {
  const meta = REGION_META[region];
  const [src, setSrc] = useState(meta.crest);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(meta.crest);
    setFailed(false);
  }, [meta.crest, region]);

  const crestStyle = { ['--region' as string]: meta.color };

  if (failed) {
    return (
      <div
        className={`sheet-mech__region-crest sheet-mech__region-crest--${size}`}
        style={crestStyle}
        aria-hidden="true"
        title={region}
      >
        <span className="sheet-mech__region-glyph">{meta.glyph}</span>
        <span className="sheet-mech__region-initial">{meta.short}</span>
      </div>
    );
  }

  return (
    <div
      className={`sheet-mech__region-crest sheet-mech__region-crest--img sheet-mech__region-crest--${size}`}
      style={crestStyle}
      aria-hidden="true"
      title={region}
    >
      <img
        className="sheet-mech__region-img"
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src !== meta.remote) {
            setSrc(meta.remote);
            return;
          }
          setFailed(true);
        }}
      />
    </div>
  );
};

const FamaBar = ({ score }: { score: number }) => {
  const pct = famaBarPct(score);
  const side = score < 0 ? 'bad' : score > 0 ? 'good' : 'neutral';
  return (
    <div className={`sheet-mech__fama-bar sheet-mech__fama-bar--${side}`} aria-hidden="true">
      <div className="sheet-mech__fama-bar-track">
        <span className="sheet-mech__fama-bar-mid" />
        {pct < 0 && (
          <span
            className="sheet-mech__fama-bar-fill sheet-mech__fama-bar-fill--bad"
            style={{ width: `${Math.abs(pct) / 2}%`, right: '50%' }}
          />
        )}
        {pct > 0 && (
          <span
            className="sheet-mech__fama-bar-fill sheet-mech__fama-bar-fill--good"
            style={{ width: `${pct / 2}%`, left: '50%' }}
          />
        )}
      </div>
      <div className="sheet-mech__fama-bar-labels">
        <span>Infamia</span>
        <span>Renombre</span>
      </div>
    </div>
  );
};

const FamaPanel = ({
  regions,
  canEdit,
  busy,
  onChange,
}: {
  regions: Record<string, number>;
  canEdit: boolean;
  busy: boolean;
  onChange: (regions: Record<string, number>) => void;
}) => {
  const summary = useMemo(() => {
    let renombre = 0;
    let infamia = 0;
    let best: { name: string; score: number } | null = null;
    let worst: { name: string; score: number } | null = null;
    for (const region of FAMA_REGIONS) {
      const score = regions[region] ?? 0;
      if (score > 0) renombre += score;
      if (score < 0) infamia += Math.abs(score);
      if (!best || score > best.score) best = { name: region, score };
      if (!worst || score < worst.score) worst = { name: region, score };
    }
    return { renombre, infamia, best, worst };
  }, [regions]);

  return (
    <div className="sheet-mech__fama">
      <header className="sheet-mech__summary">
        <div className="sheet-mech__summary-card sheet-mech__summary-card--good">
          <div className="sheet-mech__summary-top">
            <div>
              <span className="sheet-mech__summary-label">Renombre total</span>
              <strong className="sheet-mech__summary-value">{summary.renombre === 0 ? '0' : `+${summary.renombre}`}</strong>
            </div>
            {summary.best && summary.best.score > 0 && (
              <RegionCrest region={summary.best.name as FamaRegion} size="sm" />
            )}
          </div>
          {summary.best && summary.best.score > 0 && (
            <span className="sheet-mech__summary-sub">
              Más famoso: {summary.best.name} ({summary.best.score > 0 ? '+' : ''}
              {summary.best.score})
            </span>
          )}
        </div>
        <div className="sheet-mech__summary-card sheet-mech__summary-card--bad">
          <div className="sheet-mech__summary-top">
            <div>
              <span className="sheet-mech__summary-label">Infamia total</span>
              <strong className="sheet-mech__summary-value">{summary.infamia === 0 ? '0' : `−${summary.infamia}`}</strong>
            </div>
            {summary.worst && summary.worst.score < 0 && (
              <RegionCrest region={summary.worst.name as FamaRegion} size="sm" />
            )}
          </div>
          {summary.worst && summary.worst.score < 0 && (
            <span className="sheet-mech__summary-sub">
              Más temido: {summary.worst.name} ({summary.worst.score})
            </span>
          )}
        </div>
      </header>

      <ul className="sheet-mech__regions">
        {FAMA_REGIONS.map(region => {
          const score = regions[region] ?? 0;
          const meta = REGION_META[region];
          const side = score < 0 ? 'bad' : score > 0 ? 'good' : 'neutral';
          return (
            <li
              key={region}
              className={`sheet-mech__region sheet-mech__region--${side}`}
              style={{ ['--region' as string]: meta.color }}
            >
              <RegionCrest region={region} />
              <div className="sheet-mech__region-body">
                <div className="sheet-mech__region-head">
                  <span className="sheet-mech__region-name">{region}</span>
                  <span className={`sheet-mech__region-rank is-${side}`}>{famaRankTitle(score)}</span>
                </div>
                <div className={`sheet-mech__region-score is-${side}`}>
                  {score > 0 ? `+${score}` : score}
                </div>
                <FamaBar score={score} />
                {canEdit && (
                  <Stepper
                    value={score}
                    disabled={busy}
                    size="sm"
                    onCommit={next => onChange({ ...regions, [region]: next })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const HumanidadPanel = ({
  value,
  canEdit,
  busy,
  onChange,
}: {
  value: number;
  canEdit: boolean;
  busy: boolean;
  onChange: (next: number) => void;
}) => {
  const range = HUMANIDAD_MAX - HUMANIDAD_MIN;
  const markerPct = ((value - HUMANIDAD_MIN) / range) * 100;
  const side = value < 0 ? 'bad' : value > 0 ? 'good' : 'neutral';

  return (
    <div className={`sheet-mech__humanidad sheet-mech__humanidad--${side}`}>
      <div className="sheet-mech__hum-hero">
        <div className="sheet-mech__hum-number" aria-live="polite">
          <span className="sheet-mech__hum-number-label">Fragmentos</span>
          <strong className={`sheet-mech__hum-number-value is-${side}`}>
            {value > 0 ? `+${value}` : value}
          </strong>
        </div>
        {canEdit && (
          <Stepper
            value={value}
            min={HUMANIDAD_MIN}
            max={HUMANIDAD_MAX}
            disabled={busy}
            size="lg"
            onCommit={onChange}
          />
        )}
      </div>

      <div
        className="sheet-mech__gauge"
        role="meter"
        aria-valuemin={HUMANIDAD_MIN}
        aria-valuemax={HUMANIDAD_MAX}
        aria-valuenow={value}
        aria-label="Humanidad"
      >
        <div className="sheet-mech__gauge-track">
          <div className="sheet-mech__gauge-gradient" />
          <div className="sheet-mech__gauge-zero" />
          <div className="sheet-mech__gauge-marker" style={{ left: `${markerPct}%` }}>
            <span className="sheet-mech__gauge-marker-dot" />
            <span className="sheet-mech__gauge-marker-tip">{value > 0 ? `+${value}` : value}</span>
          </div>
        </div>
        <div className="sheet-mech__gauge-ticks">
          {[-10, -5, 0, 5, 10].map(tick => (
            <span
              key={tick}
              className={`sheet-mech__gauge-tick ${tick === 0 ? 'is-zero' : ''}`}
              style={{ left: `${((tick - HUMANIDAD_MIN) / range) * 100}%` }}
            >
              {tick > 0 ? `+${tick}` : tick}
            </span>
          ))}
        </div>
        <div className="sheet-mech__gauge-ends">
          <span>Corrupción</span>
          <span>Humanidad</span>
        </div>
      </div>

      <div className="sheet-mech__tier-cols">
        <section className="sheet-mech__tier-col sheet-mech__tier-col--neg">
          <h3 className="sheet-mech__tier-col-title">Corrupción</h3>
          <ul className="sheet-mech__tiers">
            {[...HUMANIDAD_NEGATIVE].sort((a, b) => b.level - a.level).map(tier => {
              const active = value <= tier.level;
              return (
                <li
                  key={tier.level}
                  className={`sheet-mech__tier sheet-mech__tier--neg ${active ? 'is-active' : 'is-dim'}`}
                >
                  <span className="sheet-mech__tier-lvl">{tier.level}</span>
                  <span className="sheet-mech__tier-text">{tier.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="sheet-mech__tier-col sheet-mech__tier-col--pos">
          <h3 className="sheet-mech__tier-col-title">Humanidad</h3>
          <ul className="sheet-mech__tiers">
            {HUMANIDAD_POSITIVE.map(tier => {
              const active = value >= tier.level;
              return (
                <li
                  key={tier.level}
                  className={`sheet-mech__tier sheet-mech__tier--pos ${active ? 'is-active' : 'is-dim'}`}
                >
                  <span className="sheet-mech__tier-lvl">+{tier.level}</span>
                  <span className="sheet-mech__tier-text">{tier.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
};

const RuinaPanel = ({
  value,
  canEdit,
  busy,
  result,
  onChange,
  onRoll,
}: {
  value: number;
  canEdit: boolean;
  busy: boolean;
  result: RuinaControlResult | null;
  onChange: (next: number) => void;
  onRoll: () => void;
}) => {
  const danger = value / RUINA_MAX;
  const atMax = value >= RUINA_MAX;

  return (
    <div className={`sheet-mech__ruina ${atMax ? 'is-max' : danger >= 0.7 ? 'is-high' : ''}`}>
      <div className="sheet-mech__ruina-glow" aria-hidden="true" />

      <div className="sheet-mech__ruina-hero">
        <div
          className="sheet-mech__ruina-ring"
          role="meter"
          aria-valuemin={RUINA_MIN}
          aria-valuemax={RUINA_MAX}
          aria-valuenow={value}
          aria-label="Contador de Ruina"
        >
          <div className="sheet-mech__ruina-segments" aria-hidden="true">
            {Array.from({ length: RUINA_MAX }, (_, i) => {
              const filled = i < value;
              return (
                <span
                  key={i}
                  className={`sheet-mech__ruina-seg ${filled ? 'is-on' : ''}`}
                  style={{ ['--i' as string]: i }}
                />
              );
            })}
          </div>
          <div className="sheet-mech__ruina-core">
            <span className="sheet-mech__ruina-core-label">Ruina</span>
            <strong className="sheet-mech__ruina-core-value">{value}</strong>
            <span className="sheet-mech__ruina-core-max">/ {RUINA_MAX}</span>
          </div>
        </div>

        <div className="sheet-mech__ruina-side">
          <p className="sheet-mech__ruina-rule">
            Tirada de control: <strong>1d20 ≤ {value}</strong> pierde el control parcialmente y se tira{' '}
            <strong>1d4</strong> de efecto. En {RUINA_MAX}, pérdida permanente salvo quest.
          </p>
          {canEdit && (
            <Stepper
              value={value}
              min={RUINA_MIN}
              max={RUINA_MAX}
              disabled={busy}
              size="lg"
              onCommit={onChange}
            />
          )}
          {atMax && (
            <p className="sheet-mech__warn sheet-mech__warn--pulse" role="status">
              Pierde el control permanentemente salvo quest
            </p>
          )}
          <button type="button" className="sheet-mech__ruina-btn" onClick={onRoll}>
            <span className="sheet-mech__ruina-btn-glow" aria-hidden="true" />
            <span className="sheet-mech__ruina-btn-label">Tirada de control</span>
            <span className="sheet-mech__ruina-btn-sub">1d20 vs contador {value}</span>
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`sheet-mech__result sheet-mech__result--${result.kind === 'lose' ? 'bad' : 'ok'}`}
          role="status"
        >
          <div className="sheet-mech__result-dice">
            <span className="sheet-mech__result-die">
              <em>d20</em>
              <strong>{result.d20}</strong>
            </span>
            <span className="sheet-mech__result-vs">
              {result.kind === 'lose' ? '≤' : '>'} {result.contador}
            </span>
            {result.kind === 'lose' && (
              <span className="sheet-mech__result-die sheet-mech__result-die--d4">
                <em>d4</em>
                <strong>{result.effectRoll}</strong>
              </span>
            )}
          </div>
          {result.kind === 'control' ? (
            <div className="sheet-mech__result-title">Mantiene el control</div>
          ) : (
            <>
              <div className="sheet-mech__result-title">Pierde el control parcialmente</div>
              <div className="sheet-mech__result-sub">{result.effect.title}</div>
              <p className="sheet-mech__result-text">{result.effect.text}</p>
            </>
          )}
        </div>
      )}
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
    <div className={`sheet-panel sheet-mech sheet-mech--${resolved.type}`}>
      <div className="sheet-panel__title">{title}</div>

      {resolved.type === 'ruina' && (
        <RuinaPanel
          value={resolved.value}
          canEdit={canEdit}
          busy={busy}
          result={ruinaResult}
          onChange={next => save({ type: 'ruina', value: next })}
          onRoll={() => setRuinaResult(resolveRuinaControl(resolved.value))}
        />
      )}

      {resolved.type === 'humanidad' && (
        <HumanidadPanel
          value={resolved.value}
          canEdit={canEdit}
          busy={busy}
          onChange={next => save({ type: 'humanidad', value: next })}
        />
      )}

      {resolved.type === 'fama' && (
        <FamaPanel
          regions={resolved.regions}
          canEdit={canEdit}
          busy={busy}
          onChange={regions => save({ type: 'fama', regions })}
        />
      )}

      {!canEdit && <p className="sheet-mech__hint">Solo el GM puede editar estos valores.</p>}
      {error && <p className="calc-build-error">{error}</p>}
    </div>
  );
};

export default MechanicPanel;
