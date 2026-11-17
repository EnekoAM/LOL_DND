import { useEffect, useState, type ReactNode } from 'react';
import {
  CD_START_MODES,
  DAMAGE_TYPES,
  EFFECT_RULE_KINDS,
  EFFECT_TRIGGERS,
  MAX_EFFECT_RULES,
  SCALING_STATS,
  appliesToOptions,
  configSummary,
  configTimingText,
  durationText,
  LOL_SCALE,
  LOL_SCALE_KINDS,
  lolScaled,
  ruleAppliesTo,
  ruleSummary,
  type RuleAppliesTo,
  type EffectBonusConfig,
  type EffectRule,
} from '../../data/effectBonus';
import {
  FORMULA_KINDS,
  RANGE_MODES,
  STACK_KINDS,
  cdStartChoiceOf,
  configWarnings,
  dropUnusedFields,
  hasValue,
  linearLevels,
  lolDiceStatOfRule,
  rangeModeOf,
  ruleFieldVisible,
  ruleWarnings,
  serializeConfig,
  valueModeOf,
  withCdStartChoice,
  withRangeMode,
  withValueMode,
  type CdStartChoice,
  type RangeMode,
  type ValueMode,
} from '../../data/effectEditorModel';
import { STAT_COLUMNS } from '../calculos/statLine';
import { lolDiceNote, lolToDice } from '../../data/lolDiceTable';

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

const kindLabel = (kind: string): string => EFFECT_RULE_KINDS.find(entry => entry.id === kind)?.label ?? kind;

/** \u00ab?\u00bb con la explicaci\u00f3n (tooltip). */
const Help = ({ text }: { text: string }) => (
  <span className="bx-help" title={text} aria-label={text} role="img">?</span>
);

const Field = ({ label, help, children, wide }: { label: string; help?: string; children: ReactNode; wide?: boolean }) => (
  <label className={wide ? 'bx-field bx-field--wide' : 'bx-field'}>
    <span className="bx-field__label">{label}{help && <Help text={help} />}</span>
    {children}
  </label>
);

const NumberField = ({ label, help, value, onChange, step = 'any', placeholder }: {
  label: string; help?: string; value: number | undefined; onChange: (value: number | undefined) => void; step?: string; placeholder?: string;
}) => (
  <Field label={label} help={help}>
    <input type="number" step={step} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(numberOrUndefined(e.target.value))} />
  </Field>
);

const Check = ({ label, help, checked, onChange, disabled }: { label: string; help?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <label className="bx-check">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span>{label}</span>
    {help && <Help text={help} />}
  </label>
);

const shortNum = (value: number): string => String(Math.round(value * 100) / 100).replace('.', ',');

/** \u00abDe X a Y (lineal)\u00bb: rellena los 20 niveles. */
const LinearFill = ({ lol, onFill }: { lol: boolean; onFill: (values: number[]) => void }) => {
  const [from, setFrom] = useState<number | undefined>(undefined);
  const [to, setTo] = useState<number | undefined>(undefined);
  return (
    <div className="bx-linear">
      <NumberField label={lol ? 'De (nivel 1, LoL)' : 'De (nivel 1)'} value={from} onChange={setFrom} />
      <NumberField label={lol ? 'A (nivel 20, LoL)' : 'A (nivel 20)'} value={to} onChange={setTo} />
      <button type="button" className="bx-btn" disabled={from == null || to == null} onClick={() => { if (from != null && to != null) onFill(linearLevels(from, to, lol ? 0 : 2)); }}>
        {'Rellenar los 20 niveles (lineal)'}
      </button>
    </div>
  );
};

const Warnings = ({ list }: { list: string[] }) => list.length ? (
  <ul className="bx-warn">{list.map((text, i) => <li key={i}>{text}</li>)}</ul>
) : null;

/** Bloque plegable; se abre solo si ya tiene algo puesto. */
const Fold = ({ title, used, children }: { title: string; used: number; children: ReactNode }) => (
  <details className="bx-fold" open={used > 0 ? true : undefined}>
    <summary>{title}{used > 0 ? ` (${used} en uso)` : ''}</summary>
    <div className="bx-grid">{children}</div>
  </details>
);

const H = {
  trigger: 'Qu\u00e9 tiene que pasar en combate para que la regla se aplique.',
  range: 'Cuerpo a cuerpo = rango de ataque total 1 o menos (el 0 cuenta); a distancia = m\u00e1s de 1.',
  rangedPct: 'A distancia, el valor de la regla es este % del de cuerpo a cuerpo (p. ej. 75).',
  hpBelow: 'La regla se activa cuando la vida del portador baja de este %.',
  kind: 'Qu\u00e9 hace la regla cuando se aplica.',
  appliesTo: 'A qui\u00e9n le llega el efecto de la regla.',
  valueMode: 'Fijo: un n\u00famero. Por nivel: un valor para cada nivel del 1 al 20. Dados: se tiran al aplicar.',
  perLevel: 'Hasta 20 valores separados por \u00ab/\u00bb, del nivel 1 al 20.',
  levelFrom: 'El valor por nivel sale del nivel de cada objetivo, no del portador (Medall\u00f3n, Redenci\u00f3n).',
  dice: 'Ejemplo: 4d10+13 o 2d8.',
  diceFlat: 'N\u00famero que se suma a la tirada (opcional).',
  ratio: 'Suma un % de una estad\u00edstica (del portador o del objetivo).',
  missingHp: 'El da\u00f1o sube hasta este % seg\u00fan la vida que le falta al objetivo (75 = hasta +75 %).',
  ownDuration: 'Si esta regla dura distinto que el efecto. Vac\u00edo = usa la duraci\u00f3n del efecto.',
  maxStacks: 'Cu\u00e1ntas veces se acumula como mucho (bonus por acumulaci\u00f3n).',
  permanent: 'Cada vez suma 1 carga en la ficha del personaje y se conserva entre combates; el bonus solo cuenta con el \u00edtem equipado.',
  triggerAtMax: 'Solo se aplica al llegar al m\u00e1ximo de acumulaciones; luego se reinicia.',
  perTargetCounter: 'El contador (cada N / acumulaciones) va por separado para cada objetivo.',
  everyN: 'Solo se aplica una de cada N veces que se cumple el \u00abCu\u00e1ndo\u00bb.',
  requiresMax: 'Solo se aplica si otra regla de este efecto est\u00e1 al m\u00e1ximo de acumulaciones (3.er AA de Guinsoo).',
  delay: 'El efecto se aplica dentro de N turnos en vez de al momento.',
  half: 'Pasados N turnos el escudo baja a la mitad.',
  hot: 'La cura total se calcula al dispararse (valor + escalados \u00d7 poder de curaci\u00f3n) y se reparte en N tramos iguales: el 1.\u00ba al momento y uno al empezar cada turno de quien la recibe. Si vuelve a saltar, sustituye lo que quedaba.',
  unseen: 'Turnos sin ser visto para armar el siguiente AA.',
  armed: 'Despu\u00e9s de ser visto, el AA armado dura estos turnos.',
  amp: 'Quien tenga este estado recibe este % m\u00e1s de da\u00f1o.',
  crit: 'Si marcas cr\u00edtico, el da\u00f1o extra del cr\u00edtico va a este % de potencia.',
  note: 'Texto libre que sale en el registro de combate. No cambia ning\u00fan c\u00e1lculo.',
  targetHp: 'Solo se aplica si el objetivo tiene menos de este % de vida.',
  cd: 'Turnos que tarda en poder volver a aplicarse (por portador).',
  cdLevel: 'Un CD distinto para cada tramo de nivel del portador: 1-5, 6-10, 11-15 y 16-20.',
  cdStart: 'Cu\u00e1ndo empieza a contar el enfriamiento.',
  perTarget: 'El CD se pone en el objetivo golpeado: cada objetivo tiene el suyo.',
  duration: 'Turnos que dura el efecto. Las reglas usan esta duraci\u00f3n salvo que tengan una propia.',
  once: 'Tras aplicarse no vuelve a dispararse en este combate (Medall\u00f3n, Sterak, Zhonya...).',
  maxTargets: 'Al usar la activa, a cu\u00e1ntos enemigos como mucho afecta.',
  charges: 'Usos que se gastan y se recargan solos (Flujo de man\u00e1): empieza con \u00abinicio\u00bb, como mucho \u00abm\u00e1ximo\u00bb, recarga 1 cada N turnos.',
  discharge: 'Con el Vigor al m\u00e1ximo, usar una habilidad que golpea tambi\u00e9n lo descarga (Espada ciclovoltaica).',
  forever: 'Guarda -1: dura hasta que termine el combate (o hasta que se gaste, p. ej. un escudo de hechizos que bloquea una habilidad). 0 no es infinito.',
  lol: 'Escribe el n\u00famero del LoL (100, 150...). Fuera del editor y en combate se usa / 10 (la vida aqu\u00ed es la del LoL / 10). Solo el fijo y el por nivel: los escalados (% de armadura, % de vida...) y los dados no cambian. Sin redondeo intermedio: el total se redondea como siempre (curas y escudos, al m\u00e1s cercano).',
  chain: 'El golpe del Vigor al m\u00e1ximo salta a N objetivos.',
  lolDice: 'Escribe el AD / AP que da el LoL (40, 75...) y se rellenan los dados con tu tabla: el valor exacto; si no est\u00e1, el m\u00e1s cercano (empate: el menor); fuera de la tabla, por su pendiente. Si luego cambias los dados a mano, se olvida el valor del LoL.',
};

const RuleCard = ({ rule, index, config, onChange, onRemove }: {
  rule: EffectRule; index: number; config: EffectBonusConfig; onChange: (rule: EffectRule) => void; onRemove: () => void;
}) => {
  const set = (patch: Partial<EffectRule>) => {
    const next: EffectRule = { ...rule, ...patch };
    for (const key of Object.keys(patch) as (keyof EffectRule)[]) if (patch[key] === undefined) delete (next as Record<string, unknown>)[key];
    onChange(next);
  };
  const show = (field: keyof EffectRule) => ruleFieldVisible(field, rule);
  const [valueMode, setValueMode] = useState<ValueMode>(() => valueModeOf(rule));
  const [ownDuration, setOwnDuration] = useState(rule.duration != null);
  const [perLevelText, setPerLevelText] = useState(() => rule.perLevel?.join('/') ?? '');
  const ratios = rule.ratios ?? [];
  const range = rangeModeOf(rule);
  const options = appliesToOptions(rule.kind);
  const formula = FORMULA_KINDS.includes(rule.kind) || show('flat') || show('ratios') || show('perLevel');
  const stacksUsed = [rule.maxStacks, rule.permanent, rule.triggerAtMax, rule.perTargetCounter, rule.everyN, rule.requiresMaxStacks].filter(hasValue).length;
  const advancedUsed = [rule.delayTurns, rule.unseenTurns, rule.armedTurnsAfterSeen, rule.damageAmpPct, rule.critPotencyPct, rule.note].filter(hasValue).length;
  const warnings = ruleWarnings(rule, config, kindLabel(rule.kind));
  // AD / AP del LoL -> dados con la tabla (Bonus de stat AD / AP y da\u00f1o).
  const lolStat = lolDiceStatOfRule(rule);
  const lolDice = lolStat && rule.lolDice != null ? lolToDice(lolStat, rule.lolDice) : null;
  const showLolDice = !!lolStat && valueMode !== 'level' && (valueMode === 'dice' || rule.kind === 'stat' || rule.lolDice != null);
  const applyLolDice = (value: number | undefined) => {
    if (value === undefined || !lolStat) { set({ lolDice: undefined }); return; }
    const result = lolToDice(lolStat, value);
    if (!result) return;
    if (result.dice > 0) {
      setValueMode('dice');
      set({ lolDice: value, dice: result.text, flat: undefined, perLevel: undefined, lolScale: undefined });
    } else {
      setValueMode('flat');
      set({ lolDice: value, flat: result.bonus || undefined, dice: undefined, perLevel: undefined, lolScale: undefined });
    }
  };

  const changeTriggerOrKind = (patch: Partial<EffectRule>) => {
    const merged = { ...rule, ...patch };
    const next = dropUnusedFields(merged);
    // Regla de da\u00f1o / curaci\u00f3n / escudo / vida temporal sin valor todav\u00eda: empieza en escala LoL.
    if (patch.kind && LOL_SCALE_KINDS.includes(patch.kind) && !LOL_SCALE_KINDS.includes(rule.kind) && rule.flat == null && !rule.perLevel?.length && !rule.dice) next.lolScale = true;
    // Si \u00abA qui\u00e9n\u00bb no vale para el nuevo tipo, vuelve al de por defecto.
    if (patch.kind) {
      const list = appliesToOptions(patch.kind);
      if (!(rule.appliesTo && list.some(option => option.id === rule.appliesTo) && rule.appliesTo !== list[0].id)) delete next.appliesTo;
      if (patch.kind === 'damage' && !next.damageType) next.damageType = 'physical';
    }
    setValueMode(valueModeOf(next));
    onChange(next);
  };

  return (
    <div className="bx-rule">
      <div className="bx-rule__head">
        <strong>{`Regla ${index + 1}`}</strong>
        <span className="bx-rule__summary">{ruleSummary(rule)}</span>
        <button type="button" className="bx-remove" onClick={onRemove} title="Quitar esta regla">Quitar</button>
      </div>

      <div className="bx-steps">
        <fieldset className="bx-step">
          <legend>{'1. Cu\u00e1ndo'}</legend>
          <div className="bx-grid">
            <Field label={'Cu\u00e1ndo se aplica'} help={H.trigger} wide>
              <select value={rule.trigger} onChange={e => changeTriggerOrKind({ trigger: e.target.value as EffectRule['trigger'] })}>
                {EFFECT_TRIGGERS.map(trigger => <option key={trigger.id} value={trigger.id}>{trigger.label}</option>)}
              </select>
            </Field>
            {show('hpBelowPct') && <NumberField label={'Vida del portador por debajo de (%)'} help={H.hpBelow} value={rule.hpBelowPct} onChange={hpBelowPct => set({ hpBelowPct })} placeholder="30" />}
            <Field label={'Cuerpo a cuerpo / distancia'} help={H.range}>
              <select value={range} onChange={e => onChange(withRangeMode(rule, e.target.value as RangeMode))}>
                {RANGE_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
              </select>
            </Field>
            {(range === 'ranged-pct' || rule.rangedPct != null) && <NumberField label={'A distancia: % del valor'} help={H.rangedPct} value={rule.rangedPct} onChange={rangedPct => set({ rangedPct: rangedPct ?? 75 })} />}
          </div>
        </fieldset>

        <fieldset className="bx-step">
          <legend>{'2. Qu\u00e9 hace'}</legend>
          <div className="bx-grid">
            <Field label={'Tipo de efecto'} help={H.kind} wide>
              <select value={rule.kind} onChange={e => changeTriggerOrKind({ kind: e.target.value as EffectRule['kind'] })}>
                {EFFECT_RULE_KINDS.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
              </select>
            </Field>
            {show('stat') && (
              <Field label={'Estad\u00edstica que cambia'}>
                <select value={rule.stat ?? ''} onChange={e => set({ stat: e.target.value || undefined })}>
                  <option value="">{'Elige\u2026'}</option>
                  {STAT_COLUMNS.map(column => <option key={column.key} value={column.key}>{column.title}</option>)}
                </select>
              </Field>
            )}
            {show('damageType') && (
              <Field label={'Tipo de da\u00f1o'}>
                <select value={rule.damageType ?? 'physical'} onChange={e => set({ damageType: (e.target.value || undefined) as EffectRule['damageType'] })}>
                  {rule.kind !== 'damage' && <option value="">{'(quitar: no se usa con este tipo)'}</option>}
                  {DAMAGE_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
              </Field>
            )}
            {show('slowPct') && <NumberField label={'Ralentizaci\u00f3n (%)'} value={rule.slowPct} onChange={slowPct => set({ slowPct })} />}
            {show('statusName') && (
              <Field label={'Nombre del estado'}>
                <input type="text" maxLength={40} value={rule.statusName ?? ''} onChange={e => set({ statusName: e.target.value || undefined })} />
              </Field>
            )}
            {show('count') && <NumberField label={'Veces extra'} step="1" value={rule.count} onChange={count => set({ count })} />}
            {show('vs') && (
              <Field label={'Reduce el da\u00f1o de'}>
                <select value={rule.vs ?? 'all'} onChange={e => set({ vs: e.target.value === 'aa' ? 'aa' : 'all' })}>
                  <option value="all">{'Todo'}</option>
                  <option value="aa">{'Solo auto-ataques'}</option>
                </select>
              </Field>
            )}
            {show('action') && (
              <Field label={'Acci\u00f3n extra'}>
                <input type="text" maxLength={40} placeholder="ability" value={rule.action ?? ''} onChange={e => set({ action: e.target.value || undefined })} />
              </Field>
            )}
            {show('fromDamagePct') && <NumberField label={rule.trigger.startsWith('on-deal-') ? '% del da\u00f1o infligido' : '% del da\u00f1o recibido'} value={rule.fromDamagePct} onChange={fromDamagePct => set({ fromDamagePct })} />}
            {show('fromManaSpentPct') && <NumberField label={'% del coste de la habilidad'} value={rule.fromManaSpentPct} onChange={fromManaSpentPct => set({ fromManaSpentPct })} />}
            {show('healFromDealtPct') && <NumberField label={'Cura al portador el % del da\u00f1o hecho'} value={rule.healFromDealtPct} onChange={healFromDealtPct => set({ healFromDealtPct })} />}
            {show('healOverTurns') && (
              <Check
                label={'Repartir en N turnos'}
                help={H.hot}
                checked={rule.healOverTurns != null}
                onChange={checked => {
                  const base = rule.duration ?? config.duration;
                  set({ healOverTurns: checked ? (base && base >= 2 ? Math.min(20, base) : 3) : undefined });
                }}
              />
            )}
            {show('healOverTurns') && rule.healOverTurns != null && (
              <NumberField label={'Tramos (1 ahora + 1 al empezar cada turno)'} help={H.hot} step="1" value={rule.healOverTurns} onChange={healOverTurns => set({ healOverTurns })} />
            )}
            {show('halfAfterTurns') && <NumberField label={'El escudo baja a la mitad tras (turnos)'} help={H.half} step="1" value={rule.halfAfterTurns} onChange={halfAfterTurns => set({ halfAfterTurns })} />}
            {show('targetHpBelowPct') && <NumberField label={'Solo si el objetivo tiene menos de (% vida)'} help={H.targetHp} value={rule.targetHpBelowPct} onChange={targetHpBelowPct => set({ targetHpBelowPct })} />}
            {show('lifeSteal') && <Check label={'Aplica robo de vida'} help={'Cura al portador el da\u00f1o hecho por su robo de vida % (Hidra voraz).'} checked={!!rule.lifeSteal} onChange={checked => set({ lifeSteal: checked || undefined })} />}
            {show('pulseEachTurn') && <Check label={'Se repite cada turno (zona)'} help={'El da\u00f1o se repite cada turno del portador mientras duren las marcas.'} checked={!!rule.pulseEachTurn} onChange={checked => set({ pulseEachTurn: checked || undefined })} />}
            {show('spellShield') && <Check label={'Es un escudo de hechizos'} help={'Bloquea la siguiente habilidad enemiga y se rompe.'} checked={!!rule.spellShield} onChange={checked => set({ spellShield: checked || undefined })} />}
          </div>
        </fieldset>

        <fieldset className="bx-step">
          <legend>{'3. A qui\u00e9n'}</legend>
          <div className="bx-grid">
            {options.length > 1 ? (
              <Field label={'Recibe el efecto'} help={H.appliesTo} wide>
                <select
                  value={ruleAppliesTo(rule)}
                  onChange={e => {
                    const value = e.target.value as RuleAppliesTo;
                    set({ appliesTo: value === options[0].id ? undefined : value });
                  }}
                >
                  {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </Field>
            ) : <span className="bx-fixed">{options[0]?.label ?? 'Portador'}</span>}
          </div>
        </fieldset>

        {formula && (
          <fieldset className="bx-step">
            <legend>{'4. Valor'}</legend>
            <div className="bx-grid">
              <Field label={'C\u00f3mo se calcula'} help={H.valueMode}>
                <select value={valueMode} onChange={e => { const mode = e.target.value as ValueMode; setValueMode(mode); onChange(withValueMode(rule, mode)); }}>
                  <option value="flat">{'Valor fijo'}</option>
                  <option value="level">{'Por nivel (1-20)'}</option>
                  {(rule.kind === 'damage' || !!lolStat || valueMode === 'dice') && <option value="dice">{'Dados'}</option>}
                </select>
              </Field>
              {((LOL_SCALE_KINDS.includes(rule.kind) && valueMode !== 'dice') || rule.lolScale) && (
                <Check label={`Valor del LoL (\u00f7${LOL_SCALE})`} help={H.lol} checked={rule.lolScale === true} onChange={checked => set({ lolScale: checked ? true : undefined })} />
              )}
              {showLolDice && lolStat && (
                <NumberField label={`${lolStat.toUpperCase()} del LoL (tabla de dados)`} help={H.lolDice} placeholder={'p. ej. 40'} value={rule.lolDice} onChange={applyLolDice} />
              )}
              {showLolDice && lolDice && <span className="bx-lol">{`= ${lolDiceNote(lolDice)}`}</span>}
              {valueMode === 'flat' && <NumberField label={lolScaled(rule) ? 'Valor fijo (del LoL)' : 'Valor fijo'} value={rule.flat} onChange={flat => set({ flat, lolDice: undefined })} />}
              {valueMode === 'flat' && lolScaled(rule) && rule.flat != null && <span className="bx-lol">{`= ${shortNum(rule.flat / LOL_SCALE)}`}</span>}
              {valueMode === 'level' && (
                <Field label={'Valor por nivel (1-20, separados por /)'} help={H.perLevel} wide>
                  <input
                    type="text"
                    placeholder="10/12/14/..."
                    value={perLevelText}
                    onChange={e => setPerLevelText(e.target.value)}
                    onBlur={e => {
                      const values = e.target.value.split('/').map(part => numberOrUndefined(part)).filter((n): n is number => n !== undefined).slice(0, 20);
                      set({ perLevel: values.length ? values : undefined });
                    }}
                  />
                </Field>
              )}
              {valueMode === 'level' && <LinearFill lol={lolScaled(rule)} onFill={values => { setPerLevelText(values.join('/')); set({ perLevel: values }); }} />}
              {valueMode === 'level' && lolScaled(rule) && !!rule.perLevel?.length && (
                <span className="bx-lol">{`= ${rule.perLevel.map(value => shortNum(value / LOL_SCALE)).join('/')}`}</span>
              )}
              {valueMode === 'level' && <Check label={'Usa el nivel del objetivo'} help={H.levelFrom} checked={rule.levelFrom === 'target'} onChange={checked => set({ levelFrom: checked ? 'target' : undefined })} />}
              {valueMode === 'dice' && (
                <Field label={'Dados'} help={H.dice}>
                  <input type="text" maxLength={40} placeholder="4d10+13" value={rule.dice ?? ''} onChange={e => set({ dice: e.target.value || undefined, lolDice: undefined })} />
                </Field>
              )}
              {valueMode === 'dice' && <NumberField label={'Suma fija (opcional)'} help={H.diceFlat} value={rule.flat} onChange={flat => set({ flat })} />}
              {show('missingHpScalePct') && <NumberField label={'Hasta +% seg\u00fan la vida que le falta al objetivo'} help={H.missingHp} value={rule.missingHpScalePct} onChange={missingHpScalePct => set({ missingHpScalePct })} />}
            </div>
            <div className="bx-ratios">
              {ratios.map((ratio, i) => (
                <span key={i} className="bx-ratio">
                  <span className="bx-ratio__plus">+</span>
                  <input type="number" step="any" value={ratio.pct} aria-label={'Porcentaje'} onChange={e => set({ ratios: ratios.map((r, j) => (j === i ? { ...r, pct: numberOrUndefined(e.target.value) ?? 0 } : r)) })} />
                  <span>{'% de'}</span>
                  <select value={ratio.stat} onChange={e => set({ ratios: ratios.map((r, j) => (j === i ? { ...r, stat: e.target.value as typeof r.stat } : r)) })}>
                    {SCALING_STATS.map(stat => <option key={stat.id} value={stat.id}>{stat.label}</option>)}
                  </select>
                  <button type="button" className="bx-remove" title="Quitar escalado" onClick={() => set({ ratios: ratios.filter((_, j) => j !== i) })}>Quitar</button>
                </span>
              ))}
              {ratios.length < 6 && <button type="button" className="bx-btn" title={H.ratio} onClick={() => set({ ratios: [...ratios, { stat: 'ap', pct: 0 }] })}>+ escalado</button>}
            </div>
          </fieldset>
        )}
      </div>

      {(!rule.permanent || rule.duration != null) && (
        <div className="bx-grid bx-duration">
          <Check
            label={config.duration ? `Duraci\u00f3n distinta de la del efecto (${durationText(config.duration)})` : 'Duraci\u00f3n propia de esta regla'}
            help={H.ownDuration}
            checked={ownDuration || rule.duration != null}
            onChange={checked => { setOwnDuration(checked); if (!checked) set({ duration: undefined }); }}
          />
          {(ownDuration || rule.duration != null) && <NumberField label={'Dura (turnos; -1 = resto del combate)'} help={H.forever} step="1" value={rule.duration} onChange={duration => set({ duration })} />}
          {(ownDuration || rule.duration != null) && <Check label={'Hasta el final del combate'} help={H.forever} checked={rule.duration === -1} onChange={checked => set({ duration: checked ? -1 : undefined })} />}
        </div>
      )}

      <Fold title={'Acumulaci\u00f3n'} used={stacksUsed}>
        <NumberField label={'M\u00e1ximo de acumulaciones'} help={H.maxStacks} step="1" value={rule.maxStacks} onChange={maxStacks => set({ maxStacks })} />
        {(STACK_KINDS.includes(rule.kind) || rule.permanent) && <Check label={'Cargas permanentes (se guardan en la ficha)'} help={H.permanent} checked={!!rule.permanent} onChange={checked => set({ permanent: checked || undefined })} />}
        <Check label={'Solo al llegar al m\u00e1ximo'} help={H.triggerAtMax} checked={!!rule.triggerAtMax} onChange={checked => set({ triggerAtMax: checked || undefined })} />
        <NumberField label={'Solo 1 de cada N veces'} help={H.everyN} step="1" value={rule.everyN} onChange={everyN => set({ everyN })} />
        <Check label={'Cuenta por objetivo'} help={H.perTargetCounter} checked={!!rule.perTargetCounter} onChange={checked => set({ perTargetCounter: checked || undefined })} />
        {(config.rules.some(other => other !== rule && other.maxStacks) || rule.requiresMaxStacks) && (
          <Check label={'Requiere el m\u00e1ximo de otra regla'} help={H.requiresMax} checked={!!rule.requiresMaxStacks} onChange={checked => set({ requiresMaxStacks: checked || undefined })} />
        )}
      </Fold>

      <Fold title={'Avanzado'} used={advancedUsed}>
        <NumberField label={'Se aplica dentro de (turnos)'} help={H.delay} step="1" value={rule.delayTurns} onChange={delayTurns => set({ delayTurns })} />
        {show('critPotencyPct') && <NumberField label={'Cr\u00edtico al % de potencia'} help={H.crit} value={rule.critPotencyPct} onChange={critPotencyPct => set({ critPotencyPct })} />}
        <NumberField label={'+% de da\u00f1o a quien tenga el estado'} help={H.amp} value={rule.damageAmpPct} onChange={damageAmpPct => set({ damageAmpPct })} />
        <NumberField label={'Turnos sin ser visto para armar el AA'} help={H.unseen} step="1" value={rule.unseenTurns} onChange={unseenTurns => set({ unseenTurns })} />
        <NumberField label={'AA armado tras ser visto (turnos)'} help={H.armed} step="1" value={rule.armedTurnsAfterSeen} onChange={armedTurnsAfterSeen => set({ armedTurnsAfterSeen })} />
        <Field label={'Nota (no afecta al c\u00e1lculo)'} help={H.note} wide>
          <input type="text" maxLength={120} value={rule.note ?? ''} onChange={e => set({ note: e.target.value || undefined })} />
        </Field>
      </Fold>

      <Warnings list={warnings} />
    </div>
  );
};

/** Configurador de bonus de un efecto o variante (reglas en combate, enfriamiento, duraci\u00f3n). */
const EffectBonusEditor = ({ id, own, inherited, canEdit, onSave }: Props) => {
  const effective = own ?? inherited;
  const [draft, setDraft] = useState<EffectBonusConfig>(() => effective ?? { rules: [] });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelOn, setLevelOn] = useState(() => !!effective?.cooldownByLevel?.length);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!dirty) {
      setDraft(effective ?? { rules: [] });
      setLevelOn(!!effective?.cooldownByLevel?.length);
      setVersion(v => v + 1);
    }
  }, [effective, dirty]);

  const summary = configSummary(effective);
  if (!canEdit) {
    return summary.length ? (
      <ul className="bonus-summary">{summary.map((line, i) => <li key={i}>{line}</li>)}{!own && inherited && <li className="bonus-summary__note">(del efecto base)</li>}</ul>
    ) : <span className="effects-table__empty">Sin bonus configurados.</span>;
  }

  const update = (next: EffectBonusConfig) => { setDraft(next); setDirty(true); setError(null); };
  const setConfig = (patch: Partial<EffectBonusConfig>) => {
    const next: EffectBonusConfig = { ...draft, ...patch };
    for (const key of Object.keys(patch) as (keyof EffectBonusConfig)[]) if (patch[key] === undefined) delete (next as Record<string, unknown>)[key];
    update(next);
  };
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
  const discard = () => { setDirty(false); setDraft(effective ?? { rules: [] }); setLevelOn(!!effective?.cooldownByLevel?.length); setVersion(v => v + 1); };

  const levels = draft.cooldownByLevel ?? [];
  const setLevel = (index: number, value: number | undefined) => {
    const list = [0, 1, 2, 3].map(i => (i === index ? value : levels[i]));
    const firstGap = list.findIndex(entry => entry === undefined || entry < 1);
    const clean = (firstGap < 0 ? list : list.slice(0, firstGap)).map(entry => Math.min(99, Math.floor(entry as number)));
    setConfig({ cooldownByLevel: clean.length ? clean : undefined });
  };
  const choice = cdStartChoiceOf(draft);
  const charges = draft.charges;
  const setCharges = (patch: Partial<NonNullable<EffectBonusConfig['charges']>>) => {
    const next = { ...(charges ?? {}), ...patch } as Partial<NonNullable<EffectBonusConfig['charges']>>;
    if (!next.perTurn) delete next.perTurn;
    setConfig({ charges: next.start === undefined && next.max === undefined && next.every === undefined ? undefined : next as NonNullable<EffectBonusConfig['charges']> });
  };
  const allRules = [...draft.rules, ...(!own && inherited ? [] : inherited?.rules ?? [])];
  const showMaxTargets = allRules.some(rule => rule.trigger === 'on-use') || draft.maxTargets != null;
  const advancedUsed = [draft.charges, draft.abilityDischarge, draft.chainTargets].filter(hasValue).length;
  const timing = configTimingText(draft);

  return (
    <div className="bx" data-effect={id} key={version}>
      {!own && inherited && <p className="bx-note">{'Usa la del efecto base; al guardar, esta variante tendr\u00e1 la suya.'}</p>}

      <section className="bx-live">
        <strong>{'Resumen'}</strong>
        {draft.rules.length || timing ? (
          <ul>
            {draft.rules.map((rule, i) => <li key={i}>{`Regla ${i + 1}: ${ruleSummary(rule)}`}</li>)}
            {timing && <li>{timing}</li>}
          </ul>
        ) : <p className="bx-note">{'Sin reglas todav\u00eda: a\u00f1ade una con \u00ab+ Regla\u00bb.'}</p>}
      </section>

      <section className="bx-sec">
        <h4>{'Ajustes del efecto'}</h4>
        <div className="bx-group">
          <h5>{'Enfriamiento'}<Help text={H.cd} /></h5>
          <div className="bx-grid">
            {!levelOn && <NumberField label={'Turnos de enfriamiento (CD)'} help={H.cd} step="1" value={draft.cooldown} onChange={cooldown => setConfig({ cooldown })} />}
            <Check label={'Var\u00eda por nivel'} help={H.cdLevel} checked={levelOn} onChange={checked => { setLevelOn(checked); setConfig(checked ? { cooldown: undefined } : { cooldownByLevel: undefined }); }} />
            {levelOn && ['Niveles 1-5', 'Niveles 6-10', 'Niveles 11-15', 'Niveles 16-20'].map((label, i) => (
              <NumberField key={label} label={`CD ${label}`} step="1" value={levels[i]} onChange={value => setLevel(i, value)} />
            ))}
            <Field label={'Empieza'} help={H.cdStart} wide>
              <select value={choice} onChange={e => update(withCdStartChoice(draft, e.target.value as CdStartChoice))}>
                {CD_START_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
                {draft.rules.map((_, i) => <option key={i} value={`proc:${i + 1}`}>{`cuando se aplica la regla ${i + 1}`}</option>)}
              </select>
            </Field>
            <Check label={'Por objetivo'} help={H.perTarget} checked={!!draft.perTargetCooldown} onChange={checked => setConfig({ perTargetCooldown: checked || undefined })} />
          </div>
        </div>
        <div className="bx-group">
          <h5>{'Duraci\u00f3n por defecto'}</h5>
          <div className="bx-grid">
            <NumberField label={'Duraci\u00f3n del efecto (turnos; -1 = resto del combate)'} help={H.duration} step="1" value={draft.duration} onChange={duration => setConfig({ duration })} />
            <Check label={'Hasta el final del combate'} help={H.forever} checked={draft.duration === -1} onChange={checked => setConfig({ duration: checked ? -1 : undefined })} />
          </div>
        </div>
        <div className="bx-group">
          <h5>{'L\u00edmites'}</h5>
          <div className="bx-grid">
            <Check label={'Solo 1 vez por combate'} help={H.once} checked={!!draft.oncePerCombat} onChange={checked => setConfig({ oncePerCombat: checked || undefined })} />
            {showMaxTargets && (
              <NumberField label={'M\u00e1ximo de objetivos al usar'} help={H.maxTargets} step="1" value={draft.maxTargets} onChange={value => setConfig({ maxTargets: value && value >= 1 ? Math.min(20, Math.floor(value)) : undefined })} />
            )}
          </div>
        </div>
        <Fold title={'Avanzado'} used={advancedUsed}>
          <NumberField label={'Usos recargables: inicio'} help={H.charges} step="1" value={charges?.start} onChange={start => setCharges({ start })} />
          <NumberField label={'Usos recargables: m\u00e1ximo'} step="1" value={charges?.max} onChange={max => setCharges({ max })} />
          <NumberField label={'Recarga 1 cada (turnos)'} step="1" value={charges?.every} onChange={every => setCharges({ every })} />
          <Check label={'Gasta como mucho 1 por turno'} checked={!!charges?.perTurn} disabled={!charges} onChange={checked => setCharges({ perTurn: checked || undefined })} />
          <Check label={'Las habilidades tambi\u00e9n descargan el Vigor'} help={H.discharge} checked={!!draft.abilityDischarge} onChange={checked => setConfig({ abilityDischarge: checked || undefined })} />
          <NumberField label={'Vigor al m\u00e1ximo: encadena a N objetivos'} help={H.chain} step="1" value={draft.chainTargets ?? 1} onChange={value => setConfig({ chainTargets: value && value > 1 ? Math.min(10, Math.floor(value)) : undefined })} />
        </Fold>
        <Warnings list={configWarnings(draft)} />
      </section>

      {draft.rules.map((rule, index) => (
        <RuleCard
          key={index}
          rule={rule}
          index={index}
          config={draft}
          onChange={next => update({ ...draft, rules: draft.rules.map((r, i) => (i === index ? next : r)) })}
          onRemove={() => { update({ ...draft, rules: draft.rules.filter((_, i) => i !== index) }); setVersion(v => v + 1); }}
        />
      ))}

      <div className="bx-actions">
        {draft.rules.length < MAX_EFFECT_RULES && (
          <button type="button" className="bx-btn" onClick={() => update({ ...draft, rules: [...draft.rules, { trigger: 'on-hit', kind: 'damage', damageType: 'physical' }] })}>+ Regla</button>
        )}
        <button type="button" className="bx-btn bx-btn--save" disabled={saving || !dirty} onClick={() => void save(serializeConfig(draft))}>{saving ? 'Guardando\u2026' : 'Guardar'}</button>
        {dirty && <button type="button" className="bx-btn" disabled={saving} onClick={discard}>Descartar</button>}
        {own && (
          <button type="button" className="bx-btn bx-btn--danger" disabled={saving} onClick={() => void save(null)}>{inherited ? 'Usar la del base' : 'Borrar todo'}</button>
        )}
        {error && <span className="bx-error">{error}</span>}
      </div>
    </div>
  );
};

export default EffectBonusEditor;
