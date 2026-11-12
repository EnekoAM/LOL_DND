import { cx } from '../../lib/cx';
import type { MechanicsDraft } from './abilityDraft';
import { CAST_POOL_STATS, type CastPoolStat } from '../../data/abilityMechanics';
import { STAT_COLUMNS } from '../calculos/statLine';
import EffectBonusEditor from '../items/EffectBonusEditor';

type Props = {
  draft: MechanicsDraft;
  slot: string;
  disabled: boolean;
  onChange: (patch: Partial<MechanicsDraft>) => void;
};

const Toggle = ({ on, label, title, disabled, onClick }: { on: boolean; label: string; title?: string; disabled: boolean; onClick: () => void }) => (
  <button type="button" className={cx('hab-learned', on && 'hab-learned--on')} aria-pressed={on} disabled={disabled} title={title} onClick={onClick}>
    <span>{label}</span>
    <span className="hab-learned__switch" aria-hidden="true" />
  </button>
);

const POOL_STAT_LABEL: Record<CastPoolStat, string> = { ad: 'AD total', bonusAd: 'AD bonus', baseAd: 'AD base', ap: 'AP', hp: 'Vida máx.', bonusHp: 'Vida bonus', missingHp: 'Vida faltante', armor: 'CA', bonusArmor: 'CA bonus', mr: 'RM', bonusMr: 'RM bonus', mana: 'Maná máx.', bonusMana: 'Maná bonus' };

const PoolStatSelect = ({ label, value, onChange }: { label: string; value: CastPoolStat; onChange: (value: CastPoolStat) => void }) => (
  <label className="hab-field">
    <span>{label}</span>
    <select value={value} onChange={e => onChange(e.target.value as CastPoolStat)}>
      {CAST_POOL_STATS.map(stat => <option key={stat} value={stat}>{POOL_STAT_LABEL[stat]}</option>)}
    </select>
  </label>
);

const Field = ({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) => (
  <label className="hab-field">
    <span>{label}</span>
    <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  </label>
);

/** Mecánicas de combate de la habilidad (genéricas): cargas de uso, cargas por impacto, buff al activar, estado de la pasiva. */
export default function MechanicsFields({ draft, slot, disabled, onChange }: Props) {
  return (
    <div className="hab-modal__block">
      <span className="hab-modal__tag">Mecánicas de combate</span>

      <Toggle on={draft.charges} label="Cargas de uso (en vez de CD)" disabled={disabled} title="Empieza el combate con N cargas; usar gasta 1; recarga 1 cada X turnos según el rango" onClick={() => onChange({ charges: !draft.charges })} />
      {draft.charges && (
        <>
          <Field label="Cargas al empezar el combate" value={draft.chargesStart} placeholder="= máximo" onChange={chargesStart => onChange({ chargesStart })} />
          <Field label="Máximo de cargas" value={draft.chargesMax} placeholder="2" onChange={chargesMax => onChange({ chargesMax })} />
          <Field label="Recarga 1 carga cada (turnos, por rango)" value={draft.chargesRecharge} placeholder="45, 40, 35, 30, 25" onChange={chargesRecharge => onChange({ chargesRecharge })} />
          <Field label="Cada campeón enemigo alcanzado quita (turnos de recarga)" value={draft.chargesReduce} placeholder="Nada" onChange={chargesReduce => onChange({ chargesReduce })} />
        </>
      )}

      <Toggle on={draft.stacks} label="Cargas por efecto de impacto" disabled={disabled} title="Cada AA que golpea (o habilidad con «Aplica efectos de impacto») da 1 carga; duran N turnos y se refrescan" onClick={() => onChange({ stacks: !draft.stacks })} />
      {draft.stacks && (
        <>
          <Field label="Duración de las cargas (turnos, se refresca)" value={draft.stacksTurns} placeholder="2" onChange={stacksTurns => onChange({ stacksTurns })} />
          <Field label="Máximo de cargas" value={draft.stacksMax} placeholder="4" onChange={stacksMax => onChange({ stacksMax })} />
          <Field label="Cargas para poder activarla (opcional, las gasta)" value={draft.stacksRequired} placeholder="Sin requisito" onChange={stacksRequired => onChange({ stacksRequired })} />
        </>
      )}

      <Toggle on={draft.buff} label="Buff propio al activar" disabled={disabled} title="Durante N turnos: % velocidad de ataque y % AD de los AA (por rango)" onClick={() => onChange({ buff: !draft.buff })} />
      {draft.buff && (
        <>
          <Field label="Duración (turnos)" value={draft.buffTurns} placeholder="3" onChange={buffTurns => onChange({ buffTurns })} />
          <Field label="Velocidad de ataque (%, por rango)" value={draft.buffAttackSpeed} placeholder="20, 30, 40, 50, 60" onChange={buffAttackSpeed => onChange({ buffAttackSpeed })} />
          <Field label="Daño de los AA (% AD, por rango)" value={draft.buffAaAd} placeholder="110, 115, 120, 125, 130" onChange={buffAaAd => onChange({ buffAaAd })} />
          <Toggle on={draft.buffAaPassive} label="Los AA aplican el estado de la pasiva" disabled={disabled} onClick={() => onChange({ buffAaPassive: !draft.buffAaPassive })} />
        </>
      )}

      {slot !== 'P' && (
        <Toggle on={draft.appliesPassive} label="Aplica el estado de la pasiva" disabled={disabled} title="Los objetivos alcanzados reciben el primer efecto de la pasiva (nombre, valor y duración)" onClick={() => onChange({ appliesPassive: !draft.appliesPassive })} />
      )}

      <Toggle on={draft.learned} label="Pasiva por tenerla aprendida" disabled={disabled} title="Bonus de stat siempre activo mientras la tenga aprendida (rango ≥ 1), valor por rango" onClick={() => onChange({ learned: !draft.learned })} />
      {draft.learned && (
        <>
          <label className="hab-field">
            <span>Stat</span>
            <select value={draft.learnedStat} onChange={e => onChange({ learnedStat: e.target.value })}>
              {STAT_COLUMNS.map(column => <option key={column.key} value={column.key}>{column.title}</option>)}
            </select>
          </label>
          <Field label="Valor por rango" value={draft.learnedValues} placeholder="20, 22, 25, 27, 30" onChange={learnedValues => onChange({ learnedValues })} />
        </>
      )}

      {(
        <Toggle on={draft.pool} label="Escudo / curación al usarla" disabled={disabled} title="Al usarla, escudo o cura al portador: % de una stat por rango (+ % por campeón enemigo alcanzado) × poder de curación y escudos" onClick={() => onChange({ pool: !draft.pool })} />
      )}
      {draft.pool && (
        <>
          <label className="hab-field">
            <span>Tipo</span>
            <select value={draft.poolKind} onChange={e => onChange({ poolKind: e.target.value as 'shield' | 'heal' })}>
              <option value="shield">Escudo</option>
              <option value="heal">Curación</option>
            </select>
          </label>
          <PoolStatSelect label="Escala con" value={draft.poolStat} onChange={poolStat => onChange({ poolStat })} />
          <Field label="% por rango" value={draft.poolValues} placeholder="60, 65, 70, 75, 80" onChange={poolValues => onChange({ poolValues })} />
          <Field label="Base plana (por rango)" value={draft.poolFlat} placeholder="Nada" onChange={poolFlat => onChange({ poolFlat })} />
          <Toggle on={draft.poolFlatByLevel} label="Base por tramo de nivel (1/6/11/16)" disabled={disabled} onClick={() => onChange({ poolFlatByLevel: !draft.poolFlatByLevel })} />
          {draft.poolKind === 'heal' && <Field label="Cura retrasada (turnos; o «Curar ahora»)" value={draft.poolDelay} placeholder="Al momento" onChange={poolDelay => onChange({ poolDelay })} />}
          {draft.poolKind === 'shield' && <Field label="Dura (turnos; al acabar se quita lo que quede)" value={draft.poolTurns} placeholder="Hasta que se gaste" onChange={poolTurns => onChange({ poolTurns })} />}
          <PoolStatSelect label="Extra por campeón enemigo alcanzado: stat" value={draft.poolHitStat} onChange={poolHitStat => onChange({ poolHitStat })} />
          <Field label="Extra por campeón enemigo alcanzado (%)" value={draft.poolHitPct} placeholder="Nada" onChange={poolHitPct => onChange({ poolHitPct })} />
          <label className="hab-field">
            <span>A quién</span>
            <select value={draft.poolTarget} onChange={e => onChange({ poolTarget: e.target.value as 'self' | 'ally' })}>
              <option value="self">Al portador</option>
              <option value="ally">Al aliado elegido</option>
            </select>
          </label>
          <Toggle on={draft.poolRequiresHit} label="Solo si alcanza a un enemigo" disabled={disabled} onClick={() => onChange({ poolRequiresHit: !draft.poolRequiresHit })} />
          {draft.poolTarget === 'self' && <Toggle on={draft.poolAlliesToo} label="También a aliados (se eligen al usarla)" disabled={disabled} onClick={() => onChange({ poolAlliesToo: !draft.poolAlliesToo })} />}
        </>
      )}

      {slot !== 'P' && (
        <Toggle on={draft.allEnemies} label="Efecto a todos los enemigos" disabled={disabled} title="Su efecto enemigo se aplica a todos los enemigos del combate (el daño, a los objetivos elegidos)" onClick={() => onChange({ allEnemies: !draft.allEnemies })} />
      )}
      {slot !== 'P' && (
        <Toggle on={draft.shield} label="Escudo de hechizos rompible" disabled={disabled} title="Al usarla se pone un estado en sí mismo; con «Romper» en combate, sus bonus «por tenerla aprendida» se multiplican durante unos turnos" onClick={() => onChange({ shield: !draft.shield })} />
      )}
      {slot !== 'P' && draft.shield && (
        <>
          <Field label="Estado" value={draft.shieldStatus} placeholder="Escudo de hechizos" onChange={shieldStatus => onChange({ shieldStatus })} />
          <Field label="Dura (turnos)" value={draft.shieldTurns} placeholder="1" onChange={shieldTurns => onChange({ shieldTurns })} />
          <Field label="Al romperse: bonus aprendida × (multiplicador)" value={draft.shieldMultiplier} placeholder="2" onChange={shieldMultiplier => onChange({ shieldMultiplier })} />
          <Field label="Al romperse: durante (turnos)" value={draft.shieldBreakTurns} placeholder="3" onChange={shieldBreakTurns => onChange({ shieldBreakTurns })} />
        </>
      )}

      {slot !== 'P' && (
        <Toggle on={draft.recast} label="Recast gratis" disabled={disabled} title="Tras usarla se puede volver a lanzar N veces sin coste durante unos turnos" onClick={() => onChange({ recast: !draft.recast })} />
      )}
      {slot !== 'P' && draft.recast && (
        <>
          <Field label="Recast: veces" value={draft.recastTimes} placeholder="1" onChange={recastTimes => onChange({ recastTimes })} />
          <Field label="Recast: durante (turnos)" value={draft.recastTurns} placeholder="3" onChange={recastTurns => onChange({ recastTurns })} />
        </>
      )}
      <Toggle on={draft.selfStatus} label="Estado propio al usarla" disabled={disabled} title="Al usarla se pone un estado en sí mismo (bloquea la habilidad mientras dura)" onClick={() => onChange({ selfStatus: !draft.selfStatus })} />
      {draft.selfStatus && (
        <>
          <Field label="Estado" value={draft.selfStatusName} placeholder="Fantasmal" onChange={selfStatusName => onChange({ selfStatusName })} />
          <Field label="Dura (turnos)" value={draft.selfStatusTurns} placeholder="1" onChange={selfStatusTurns => onChange({ selfStatusTurns })} />
          <Field label="Valor (opcional)" value={draft.selfStatusValue} placeholder="Nada" onChange={selfStatusValue => onChange({ selfStatusValue })} />
        </>
      )}
      <Toggle on={draft.innate} label="Escudo automático (CD al romperse)" disabled={disabled} title="Empieza el combate con el escudo; al romperse, CD; al acabar el CD vuelve solo" onClick={() => onChange({ innate: !draft.innate })} />
      {draft.innate && (
        <>
          <Field label="Base plana (por rango / tramo)" value={draft.innateFlat} placeholder="6, 15.6, 28.8, 45" onChange={innateFlat => onChange({ innateFlat })} />
          <PoolStatSelect label="Escala con" value={draft.innateStat} onChange={innateStat => onChange({ innateStat })} />
          <Field label="% por rango / tramo" value={draft.innateValues} placeholder="85, 90, 95, 100" onChange={innateValues => onChange({ innateValues })} />
          <Field label="CD al romperse (turnos, por rango / tramo)" value={draft.innateCd} placeholder="20, 16, 13, 9" onChange={innateCd => onChange({ innateCd })} />
          <Field label="CD menos por enemigo alcanzado (turnos)" value={draft.innateReduce} placeholder="0.5" onChange={innateReduce => onChange({ innateReduce })} />
        </>
      )}
      <Toggle on={draft.noAction} label="No gasta la acción de habilidad" disabled={disabled} onClick={() => onChange({ noAction: !draft.noAction })} />

      <div className="hab-modal__rules">
        <span className="hab-modal__hint">Reglas de efecto (el mismo configurador que los efectos de ítems: daño al AA, CD por objetivo…). Activas mientras la tenga aprendida. «Guardar» de las reglas y luego guarda la habilidad.</span>
        <EffectBonusEditor id={`ability-${slot}`} own={draft.effectRules ?? undefined} canEdit={!disabled} onSave={async config => onChange({ effectRules: config && config.rules.length ? config : null })} />
      </div>

      {slot === 'P' && (
        <>
          <Toggle on={draft.critBonus} label="AA: daño extra por prob. de crítico" disabled={disabled} title="Daño extra = daño del AA × (% por cara × caras de prob. de crítico)" onClick={() => onChange({ critBonus: !draft.critBonus })} />
          {draft.critBonus && (
            <Field label="% de daño extra por cara de prob. de crítico" value={draft.critPctPerFace} placeholder="0 = sin valor" onChange={critPctPerFace => onChange({ critPctPerFace })} />
          )}
          <Toggle on={draft.critNoDamage} label="Los críticos no hacen daño extra" disabled={disabled} title="Con «Crít.» marcado, el daño no se multiplica por DAÑO CRÍT (AA y habilidades del portador)" onClick={() => onChange({ critNoDamage: !draft.critNoDamage })} />
          <Toggle on={draft.critDoublesPassive} label="Crítico duplica la ralentización de la pasiva" disabled={disabled} title="Con «Crít.» marcado, el estado de la pasiva se aplica con el valor doble (máx. 99 %)" onClick={() => onChange({ critDoublesPassive: !draft.critDoublesPassive })} />
          <p className="hab-modal__hint">El estado que aplican otras habilidades es el primer efecto de esta pasiva (nombre, valor y duración).</p>
        </>
      )}
    </div>
  );
}
