import { useEffect, useState } from 'react';
import {
  CD_START_MODES,
  DAMAGE_TYPES,
  EFFECT_RULE_KINDS,
  EFFECT_TRIGGERS,
  MAX_EFFECT_RULES,
  SCALING_STATS,
  configSummary,
  type EffectBonusConfig,
  type EffectRule,
} from '../../data/effectBonus';
import { STAT_COLUMNS } from '../calculos/statLine';

type Props = {
  id: string;
  /** Config propia del id (undefined = no tiene). */
  own: EffectBonusConfig | undefined;
  /** Config del efecto base (solo variantes): se usa si la variante no tiene propia. */
  inherited?: EffectBonusConfig;
  canEdit: boolean;
  onSave: (config: EffectBonusConfig | null) => Promise<void>;
};

const numberOrUndefined = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(value) ? undefined : value;
};

const NumberField = ({ label, value, onChange, step = 'any', width = 70 }: {
  label: string; value: number | undefined; onChange: (value: number | undefined) => void; step?: string; width?: number;
}) => (
  <label className="bonus-editor__field">
    <span>{label}</span>
    <input type="number" step={step} style={{ width }} value={value ?? ''} onChange={e => onChange(numberOrUndefined(e.target.value))} />
  </label>
);

const NEEDS_FORMULA = new Set(['stat', 'damage', 'heal', 'shield', 'mana', 'attack-speed', 'move-speed']);

const RuleEditor = ({ rule, onChange, onRemove }: { rule: EffectRule; onChange: (rule: EffectRule) => void; onRemove: () => void }) => {
  const set = (patch: Partial<EffectRule>) => onChange({ ...rule, ...patch });
  const ratios = rule.ratios ?? [];
  return (
    <div className="bonus-editor__rule">
      <div className="bonus-editor__row">
        <label className="bonus-editor__field">
          <span>Cuándo</span>
          <select value={rule.trigger} onChange={e => set({ trigger: e.target.value as EffectRule['trigger'] })}>
            {EFFECT_TRIGGERS.map(trigger => <option key={trigger.id} value={trigger.id}>{trigger.label}</option>)}
          </select>
        </label>
        {rule.trigger === 'hp-below' && <NumberField label="Vida < %" value={rule.hpBelowPct} onChange={hpBelowPct => set({ hpBelowPct })} />}
        <label className="bonus-editor__field">
          <span>Qué</span>
          <select value={rule.kind} onChange={e => set({ kind: e.target.value as EffectRule['kind'] })}>
            {EFFECT_RULE_KINDS.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </select>
        </label>
        {(rule.kind === 'stat' || rule.kind === 'attack-speed' || rule.kind === 'move-speed') && (
          <label className="bonus-editor__field">
            <span>A quién</span>
            <select value={rule.appliesTo ?? 'self'} onChange={e => set({ appliesTo: e.target.value === 'target' ? 'target' : undefined })}>
              <option value="self">Portador</option>
              <option value="target">Objetivo (debuff)</option>
            </select>
          </label>
        )}
        {rule.kind === 'stat' && (
          <label className="bonus-editor__field">
            <span>Stat</span>
            <select value={rule.stat ?? ''} onChange={e => set({ stat: e.target.value || undefined })}>
              <option value="">Elige…</option>
              {STAT_COLUMNS.map(column => <option key={column.key} value={column.key}>{column.title}</option>)}
            </select>
          </label>
        )}
        {rule.kind === 'damage' && (
          <label className="bonus-editor__field">
            <span>Tipo</span>
            <select value={rule.damageType ?? 'physical'} onChange={e => set({ damageType: e.target.value as EffectRule['damageType'] })}>
              {DAMAGE_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </label>
        )}
        {rule.kind === 'slow' && <NumberField label="Ralent. %" value={rule.slowPct} onChange={slowPct => set({ slowPct })} />}
        {rule.kind === 'status' && (
          <label className="bonus-editor__field">
            <span>Estado</span>
            <input type="text" maxLength={40} style={{ width: 130 }} value={rule.statusName ?? ''} onChange={e => set({ statusName: e.target.value })} />
          </label>
        )}
        {rule.kind === 'extra-on-hit' && <NumberField label="Veces" step="1" value={rule.count} onChange={count => set({ count })} />}
        <NumberField label="Dura (t.)" step="1" value={rule.duration} onChange={duration => set({ duration })} />
        {(rule.kind === 'stat' || rule.kind === 'attack-speed' || rule.kind === 'move-speed') && (
          <NumberField label="Máx. stacks" step="1" value={rule.maxStacks} onChange={maxStacks => set({ maxStacks })} />
        )}
        <button type="button" className="bonus-editor__remove" onClick={onRemove} title="Quitar regla">✕</button>
      </div>
      {NEEDS_FORMULA.has(rule.kind) && (
        <div className="bonus-editor__row">
          <NumberField label="Plano" value={rule.flat} onChange={flat => set({ flat })} />
          {ratios.map((ratio, index) => (
            <span key={index} className="bonus-editor__ratio">
              <span>+</span>
              <input type="number" step="any" style={{ width: 60 }} value={ratio.pct} onChange={e => set({ ratios: ratios.map((r, i) => (i === index ? { ...r, pct: numberOrUndefined(e.target.value) ?? 0 } : r)) })} />
              <span>%</span>
              <select value={ratio.stat} onChange={e => set({ ratios: ratios.map((r, i) => (i === index ? { ...r, stat: e.target.value as typeof r.stat } : r)) })}>
                {SCALING_STATS.map(stat => <option key={stat.id} value={stat.id}>{stat.label}</option>)}
              </select>
              <button type="button" className="bonus-editor__remove" onClick={() => set({ ratios: ratios.filter((_, i) => i !== index) })}>✕</button>
            </span>
          ))}
          {ratios.length < 6 && (
            <button type="button" className="bonus-editor__add" onClick={() => set({ ratios: [...ratios, { stat: 'ap', pct: 0 }] })}>+ escalado</button>
          )}
          <label className="bonus-editor__field">
            <span>Por nivel (1-20, «/»)</span>
            <input
              type="text"
              style={{ width: 150 }}
              placeholder="opcional"
              defaultValue={rule.perLevel?.join('/') ?? ''}
              onBlur={e => {
                const values = e.target.value.split('/').map(part => numberOrUndefined(part)).filter((n): n is number => n !== undefined).slice(0, 20);
                set({ perLevel: values.length ? values : undefined });
              }}
            />
          </label>
        </div>
      )}
      <div className="bonus-editor__row">
        <label className="bonus-editor__field bonus-editor__field--grow">
          <span>Condición / nota</span>
          <input type="text" maxLength={120} value={rule.note ?? ''} onChange={e => set({ note: e.target.value || undefined })} />
        </label>
      </div>
    </div>
  );
};

/** Configurador de bonus de un efecto o variante (reglas en combate, CD, duración). */
const EffectBonusEditor = ({ id, own, inherited, canEdit, onSave }: Props) => {
  const effective = own ?? inherited;
  const [draft, setDraft] = useState<EffectBonusConfig>(() => effective ?? { rules: [] });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) setDraft(effective ?? { rules: [] });
  }, [effective, dirty]);

  const summary = configSummary(effective);
  if (!canEdit) {
    return summary.length ? (
      <ul className="bonus-summary">{summary.map((line, i) => <li key={i}>{line}</li>)}{!own && inherited && <li className="bonus-summary__note">(del efecto base)</li>}</ul>
    ) : <span className="effects-table__empty">Sin bonus configurados.</span>;
  }

  const update = (next: EffectBonusConfig) => { setDraft(next); setDirty(true); setError(null); };
  const save = async (config: EffectBonusConfig | null) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(config);
      setDirty(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };
  const clean = (config: EffectBonusConfig): EffectBonusConfig => ({
    ...config,
    rules: config.rules.map(rule => ({ ...rule, ratios: rule.ratios?.filter(ratio => ratio.pct) })),
  });

  return (
    <div className="bonus-editor" data-effect={id}>
      {!own && inherited && <p className="bonus-summary__note">Usa la del efecto base; al guardar, esta variante tendrá la suya.</p>}
      <div className="bonus-editor__row">
        <NumberField label="CD (turnos)" step="1" value={draft.cooldown} onChange={cooldown => update({ ...draft, cooldown })} />
        <label className="bonus-editor__field">
          <span>CD empieza</span>
          <select value={draft.cdStart ?? 'on-activate'} onChange={e => update({ ...draft, cdStart: e.target.value as EffectBonusConfig['cdStart'] })}>
            {CD_START_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
          </select>
        </label>
        <NumberField label="Duración (turnos)" step="1" value={draft.duration} onChange={duration => update({ ...draft, duration })} />
      </div>
      {draft.rules.map((rule, index) => (
        <RuleEditor
          key={index}
          rule={rule}
          onChange={next => update({ ...draft, rules: draft.rules.map((r, i) => (i === index ? next : r)) })}
          onRemove={() => update({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}
        />
      ))}
      <div className="bonus-editor__row">
        {draft.rules.length < MAX_EFFECT_RULES && (
          <button type="button" className="bonus-editor__add" onClick={() => update({ ...draft, rules: [...draft.rules, { trigger: 'on-hit', kind: 'damage', damageType: 'physical' }] })}>+ Regla</button>
        )}
        <button type="button" className="bonus-editor__save" disabled={saving || !dirty} onClick={() => void save(clean(draft))}>{saving ? 'Guardando…' : 'Guardar'}</button>
        {dirty && <button type="button" className="bonus-editor__add" disabled={saving} onClick={() => { setDirty(false); setDraft(effective ?? { rules: [] }); }}>Descartar</button>}
        {own && (
          <button type="button" className="bonus-editor__add" disabled={saving} onClick={() => void save(null)}>{inherited ? 'Usar la del base' : 'Borrar todo'}</button>
        )}
        {error && <span className="effects-table__status effects-table__status--error">{error}</span>}
      </div>
      {summary.length > 0 && <ul className="bonus-summary">{summary.map((line, i) => <li key={i}>{line}</li>)}</ul>}
    </div>
  );
};

export default EffectBonusEditor;
