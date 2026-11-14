import { useEffect, useState } from 'react';
import {
  CD_START_MODES,
  DAMAGE_TYPES,
  EFFECT_RULE_KINDS,
  EFFECT_TRIGGERS,
  MAX_EFFECT_RULES,
  SCALING_STATS,
  configSummary,
  RULE_RANGE_CONDITIONS,
  appliesToOptions,
  ruleAppliesTo,
  type RuleAppliesTo,
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

/** Cargas de combate a medio rellenar: se guardan al tener máx. y recarga (el guardado descarta lo incompleto). */
function chargesWith(draft: EffectBonusConfig, patch: { start?: number; max?: number; every?: number; perTurn?: boolean }): EffectBonusConfig['charges'] {
  const next = { ...(draft.charges ?? {}), ...patch } as Partial<NonNullable<EffectBonusConfig['charges']>>;
  if (next.start === undefined && next.max === undefined && next.every === undefined) return undefined;
  return next as NonNullable<EffectBonusConfig['charges']>;
}

const NumberField = ({ label, value, onChange, step = 'any', width = 70 }: {
  label: string; value: number | undefined; onChange: (value: number | undefined) => void; step?: string; width?: number;
}) => (
  <label className="bonus-editor__field">
    <span>{label}</span>
    <input type="number" step={step} style={{ width }} value={value ?? ''} onChange={e => onChange(numberOrUndefined(e.target.value))} />
  </label>
);

const NEEDS_FORMULA = new Set(['stat', 'damage', 'heal', 'shield', 'mana', 'attack-speed', 'move-speed', 'vigor', 'damage-reduction']);

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
        {(rule.kind === 'execute' || rule.kind === 'status' || rule.kind === 'damage') && <NumberField label="Obj. vida < %" value={rule.targetHpBelowPct} onChange={targetHpBelowPct => set({ targetHpBelowPct })} />}
        <label className="bonus-editor__field">
          <span>Qué</span>
          <select value={rule.kind} onChange={e => {
            const kind = e.target.value as EffectRule['kind'];
            // Si «A quién» no vale para el nuevo tipo, vuelve al de por defecto.
            const keep = rule.appliesTo && appliesToOptions(kind).some(option => option.id === rule.appliesTo) && rule.appliesTo !== appliesToOptions(kind)[0].id;
            set({ kind, appliesTo: keep ? rule.appliesTo : undefined, lifeSteal: kind === 'damage' ? rule.lifeSteal : undefined });
          }}>
            {EFFECT_RULE_KINDS.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </select>
        </label>
        {appliesToOptions(rule.kind).length > 1 && (
          <label className="bonus-editor__field">
            <span>A quién</span>
            <select
              value={ruleAppliesTo(rule)}
              onChange={e => {
                const value = e.target.value as RuleAppliesTo;
                const fallback = appliesToOptions(rule.kind)[0].id;
                set({ appliesTo: value === fallback ? undefined : value });
              }}
            >
              {appliesToOptions(rule.kind).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        )}
        {rule.kind === 'damage' && (
          <label className="bonus-editor__field bonus-editor__check" title="Cura al portador el daño hecho × su robo de vida % (Hidra voraz)">
            <span>Robo de vida</span>
            <span><input type="checkbox" checked={!!rule.lifeSteal} onChange={e => set({ lifeSteal: e.target.checked || undefined })} /> aplica</span>
          </label>
        )}
        {rule.kind === 'damage' && <NumberField label="Cura % del daño" value={rule.healFromDealtPct} onChange={healFromDealtPct => set({ healFromDealtPct })} />}
        {(rule.kind === 'mana' || rule.kind === 'heal') && <NumberField label="% daño recibido" value={rule.fromDamagePct} onChange={fromDamagePct => set({ fromDamagePct })} />}
        {rule.kind === 'damage-reduction' && (
          <label className="bonus-editor__field">
            <span>Contra</span>
            <select value={rule.vs ?? 'all'} onChange={e => set({ vs: e.target.value === 'aa' || e.target.value === 'all' ? e.target.value : undefined })}>
              <option value="all">Todo</option>
              <option value="aa">Solo AA</option>
            </select>
          </label>
        )}
        {rule.kind === 'extra-action' && (
          <label className="bonus-editor__field">
            <span>Acción</span>
            <input type="text" maxLength={40} style={{ width: 110 }} value={rule.action ?? ''} onChange={e => set({ action: e.target.value || undefined })} />
          </label>
        )}
        {rule.kind === 'damage' && (
          <label className="bonus-editor__field">
            <span>Dados</span>
            <input type="text" maxLength={40} style={{ width: 90 }} placeholder="4d10+13" value={rule.dice ?? ''} onChange={e => set({ dice: e.target.value || undefined })} />
          </label>
        )}
        {rule.kind === 'damage' && <NumberField label="Hasta +% vida falt." value={rule.missingHpScalePct} onChange={missingHpScalePct => set({ missingHpScalePct })} />}
        {rule.kind === 'damage' && <NumberField label="Crít. % potencia" value={rule.critPotencyPct} onChange={critPotencyPct => set({ critPotencyPct })} />}
        <NumberField label="Cada N" step="1" value={rule.everyN} onChange={everyN => set({ everyN })} />
        <label className="bonus-editor__field bonus-editor__check" title="El contador (cada N / cargas) es por objetivo">
          <span>Por objetivo</span>
          <input type="checkbox" checked={!!rule.perTargetCounter} onChange={e => set({ perTargetCounter: e.target.checked || undefined })} />
        </label>
        <label className="bonus-editor__field bonus-editor__check" title="Solo se aplica al llegar al máximo de stacks">
          <span>Al máximo</span>
          <input type="checkbox" checked={!!rule.triggerAtMax} onChange={e => set({ triggerAtMax: e.target.checked || undefined })} />
        </label>
        <label className="bonus-editor__field bonus-editor__check">
          <span>Requiere stacks máx.</span>
          <input type="checkbox" checked={!!rule.requiresMaxStacks} onChange={e => set({ requiresMaxStacks: e.target.checked || undefined })} />
        </label>
        <NumberField label="Retraso (t.)" step="1" value={rule.delayTurns} onChange={delayTurns => set({ delayTurns })} />
        {rule.kind === 'shield' && <NumberField label="Mitad tras (t.)" step="1" value={rule.halfAfterTurns} onChange={halfAfterTurns => set({ halfAfterTurns })} />}
        {(rule.kind === 'heal' || rule.kind === 'mana') && <NumberField label="% maná gastado" value={rule.fromManaSpentPct} onChange={fromManaSpentPct => set({ fromManaSpentPct })} />}
        {rule.kind === 'damage' && (
          <label className="bonus-editor__field bonus-editor__check">
            <span>Pulso cada turno</span>
            <input type="checkbox" checked={!!rule.pulseEachTurn} onChange={e => set({ pulseEachTurn: e.target.checked || undefined })} />
          </label>
        )}
        {rule.kind === 'status' && (
          <label className="bonus-editor__field bonus-editor__check">
            <span>Escudo de hechizos</span>
            <input type="checkbox" checked={!!rule.spellShield} onChange={e => set({ spellShield: e.target.checked || undefined })} />
          </label>
        )}
        <label className="bonus-editor__field bonus-editor__check" title="El CD del efecto solo empieza cuando esta regla se aplica de verdad">
          <span>CD al proc</span>
          <input type="checkbox" checked={!!rule.cooldownOnProc} onChange={e => set({ cooldownOnProc: e.target.checked || undefined })} />
        </label>
        <NumberField label="Aura (casillas)" step="1" value={rule.auraRange} onChange={auraRange => set({ auraRange })} />
        <NumberField label="+% daño (inmov.)" value={rule.damageAmpPct} onChange={damageAmpPct => set({ damageAmpPct })} />
        <NumberField label="Turnos oculto" step="1" value={rule.unseenTurns} onChange={unseenTurns => set({ unseenTurns })} />
        <NumberField label="Armado tras visto (t.)" step="1" value={rule.armedTurnsAfterSeen} onChange={armedTurnsAfterSeen => set({ armedTurnsAfterSeen })} />
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
        <label className="bonus-editor__field" title="Cuerpo a cuerpo = rango de ataque total ≤ 1 (el 0 cuenta); a distancia = rango > 1">
          <span>Solo si</span>
          <select value={rule.onlyIf ?? 'always'} onChange={e => set({ onlyIf: e.target.value === 'melee' || e.target.value === 'ranged' ? e.target.value : undefined })}>
            <option value="always">Siempre</option>
            {RULE_RANGE_CONDITIONS.map(condition => <option key={condition.id} value={condition.id}>{condition.label}</option>)}
          </select>
        </label>
        <NumberField label="Dura (t.)" step="1" value={rule.duration} onChange={duration => set({ duration })} />
        {(rule.kind === 'stat' || rule.kind === 'attack-speed' || rule.kind === 'move-speed') && (
          <NumberField label="Máx. stacks" step="1" value={rule.maxStacks} onChange={maxStacks => set({ maxStacks })} />
        )}
        {(rule.kind === 'stat' || rule.kind === 'attack-speed' || rule.kind === 'move-speed') && (
          <label className="bonus-editor__field" title="Cargas permanentes: cada disparo suma 1 carga en la ficha del personaje (players.stacks effect:<id>), hasta «Máx. stacks». Siguen entre combates y aunque se quite el ítem; el bonus (valor × cargas) solo suma con el ítem equipado. Ignora «Dura». Campeones / NPCs: solo en ese combate.">
            <span>Cargas permanentes</span>
            <input type="checkbox" checked={!!rule.permanent} onChange={e => set({ permanent: e.target.checked || undefined })} />
          </label>
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
          {!!rule.perLevel?.length && (
            <label className="bonus-editor__field bonus-editor__check" title="Medallón, Redención…: el valor sale del nivel de cada objetivo">
              <span>Nivel</span>
              <span><input type="checkbox" checked={rule.levelFrom === 'target'} onChange={e => set({ levelFrom: e.target.checked ? 'target' : undefined })} /> del objetivo</span>
            </label>
          )}
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
  const [cdLevelText, setCdLevelText] = useState(() => effective?.cooldownByLevel?.join(', ') ?? '');

  useEffect(() => {
    if (!dirty) {
      setDraft(effective ?? { rules: [] });
      setCdLevelText(effective?.cooldownByLevel?.join(', ') ?? '');
    }
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
        <label className="bonus-editor__field" title="Un CD por tramo de nivel del portador (1–5 / 6–10 / 11–15 / 16–20); si está, manda sobre el CD. Vacío = CD fijo">
          <span>CD por nivel (4 tramos)</span>
          <input style={{ width: 110 }} placeholder="3, 3, 2, 2" value={cdLevelText} onChange={e => {
            setCdLevelText(e.target.value);
            const list = e.target.value.split(/[,/\s]+/).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 99).slice(0, 4);
            update({ ...draft, cooldownByLevel: list.length ? list : undefined });
          }} />
        </label>
        <label className="bonus-editor__field">
          <span>CD empieza</span>
          <select value={draft.cdStart ?? 'on-activate'} onChange={e => update({ ...draft, cdStart: e.target.value as EffectBonusConfig['cdStart'] })}>
            {CD_START_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
          </select>
        </label>
        <NumberField label="Duración (turnos)" step="1" value={draft.duration} onChange={duration => update({ ...draft, duration })} />
        <label className="bonus-editor__field bonus-editor__check" title="Vigor: con el Vigor al máximo, usar una habilidad que golpea también lo descarga (Espada ciclovoltaica)">
          <span>Vigor</span>
          <span>
            <input type="checkbox" checked={!!draft.abilityDischarge} onChange={e => update({ ...draft, abilityDischarge: e.target.checked || undefined })} />
            {' '}Las habilidades también descargan Vigor
          </span>
        </label>
        <label className="bonus-editor__field bonus-editor__check" title="Cada objetivo tiene su marca: al golpear a uno marcado se aplican las reglas y el CD se pone en ESE objetivo (los demás siguen marcados). Necesita CD.">
          <span>CD</span>
          <span>
            <input type="checkbox" checked={!!draft.perTargetCooldown} onChange={e => update({ ...draft, perTargetCooldown: e.target.checked || undefined })} />
            {' '}Enfriamiento por objetivo{draft.perTargetCooldown && !draft.cooldown ? ' (pon un CD)' : ''}
          </span>
        </label>
        <NumberField
          label="Cargas de combate: inicio"
          step="1"
          value={draft.charges?.start}
          onChange={value => update({ ...draft, charges: chargesWith(draft, { start: value }) })}
        />
        <NumberField
          label="Cargas: máx."
          step="1"
          value={draft.charges?.max}
          onChange={value => update({ ...draft, charges: chargesWith(draft, { max: value }) })}
        />
        <NumberField
          label="Recarga 1 cada (t.)"
          step="1"
          value={draft.charges?.every}
          onChange={value => update({ ...draft, charges: chargesWith(draft, { every: value }) })}
        />
        <label className="bonus-editor__field bonus-editor__check" title="Como mucho gasta 1 carga por turno del portador aunque golpeen varias habilidades">
          <span>Cargas</span>
          <span>
            <input type="checkbox" checked={!!draft.charges?.perTurn} disabled={!draft.charges} onChange={e => update({ ...draft, charges: chargesWith(draft, { perTurn: e.target.checked || undefined }) })} />
            {' '}Máx. 1 por turno
          </span>
        </label>
        <NumberField
          label="Máx. objetivos (al usar)"
          step="1"
          value={draft.maxTargets}
          onChange={value => update({ ...draft, maxTargets: value && value >= 1 ? Math.min(20, Math.floor(value)) : undefined })}
        />
        <NumberField
          label="Encadena a N objetivos"
          step="1"
          value={draft.chainTargets ?? 1}
          onChange={value => update({ ...draft, chainTargets: value && value > 1 ? Math.min(10, Math.floor(value)) : undefined })}
        />
        <label className="bonus-editor__field bonus-editor__check" title="Tras aplicarse, no vuelve a dispararse en este combate (Medallón, Redención, Sterak, Zhonya…)">
          <span>Uso</span>
          <span>
            <input type="checkbox" checked={!!draft.oncePerCombat} onChange={e => update({ ...draft, oncePerCombat: e.target.checked || undefined })} />
            {' '}1 vez por combate
          </span>
        </label>
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
        {dirty && <button type="button" className="bonus-editor__add" disabled={saving} onClick={() => { setDirty(false); setDraft(effective ?? { rules: [] }); setCdLevelText(effective?.cooldownByLevel?.join(', ') ?? ''); }}>Descartar</button>}
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
