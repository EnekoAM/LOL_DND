import { cx } from '../../lib/cx';
import { blankLevelThreshold, type LevelThresholdDraft, type MechanicsDraft } from './abilityDraft';
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

const SourceSelect = ({ label, value, onChange }: { label: string; value: 'total' | 'bonus'; onChange: (value: 'total' | 'bonus') => void }) => (
  <label className="hab-field">
    <span>{label}</span>
    <select className="hab-field__input" value={value} onChange={e => onChange(e.target.value as 'total' | 'bonus')}>
      <option value="total">Total</option>
      <option value="bonus">Bonus</option>
    </select>
  </label>
);

const HpSourceSelect = ({ label, value, onChange }: { label: string; value: 'max' | 'current' | 'missing' | 'bonus' | ''; onChange: (value: 'max' | 'current' | 'missing' | 'bonus' | '') => void }) => (
  <label className="hab-field">
    <span>{label}</span>
    <select className="hab-field__input" value={value} onChange={e => onChange(e.target.value as 'max' | 'current' | 'missing' | 'bonus' | '')}>
      <option value="">(no usa vida)</option>
      <option value="max">Vida máx.</option>
      <option value="current">Vida actual</option>
      <option value="missing">Vida faltante</option>
      <option value="bonus">Vida bonus</option>
    </select>
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

      <Toggle on={draft.stacks} label="Cargas (este contador)" disabled={disabled} title="Esta habilidad posee un contador de cargas (p. ej. la pasiva). Se ganan al AA y/o al acertar una habilidad que dañe; duran N turnos y se refrescan" onClick={() => onChange({ stacks: !draft.stacks })} />
      {draft.stacks && (
        <>
          <Field label="Duración de las cargas (turnos, se refresca)" value={draft.stacksTurns} placeholder="2" onChange={stacksTurns => onChange({ stacksTurns })} />
          <Field label="Máximo de cargas" value={draft.stacksMax} placeholder="4" onChange={stacksMax => onChange({ stacksMax })} />
          <Toggle on={draft.stacksOnAa} label="Suma 1 al acertar un AA" disabled={disabled} onClick={() => onChange({ stacksOnAa: !draft.stacksOnAa })} />
          <Toggle on={draft.stacksOnAbilityHit} label="Suma 1 al acertar una habilidad que dañe" disabled={disabled} title="Aunque la habilidad no aplique efectos de impacto (no dispara on-hit de ítems)" onClick={() => onChange({ stacksOnAbilityHit: !draft.stacksOnAbilityHit })} />
          <Toggle on={draft.stacksOnChampionTakedown} label="Suma 1 al derribar a un campeón o jugador" disabled={disabled} onClick={() => onChange({ stacksOnChampionTakedown: !draft.stacksOnChampionTakedown })} />
          <Toggle on={draft.stacksOnNonChampionKill} label="Suma 1 al derribar un súbdito, monstruo u otro no campeón" disabled={disabled} onClick={() => onChange({ stacksOnNonChampionKill: !draft.stacksOnNonChampionKill })} />
          <Toggle on={draft.stacksPerTarget} label="Suma 1 por cada enemigo alcanzado (no 1 por uso)" disabled={disabled} onClick={() => onChange({ stacksPerTarget: !draft.stacksPerTarget })} />
          <Toggle on={!draft.stacksRequiresDamage} label="También cuenta si la habilidad no hace daño" disabled={disabled} title="Por defecto solo suma si la habilidad ha infligido daño" onClick={() => onChange({ stacksRequiresDamage: !draft.stacksRequiresDamage })} />
          <Field label="Stat por carga (vacío = sin bonus)" value={draft.stacksStat} placeholder="atkSpePct" onChange={stacksStat => onChange({ stacksStat })} />
          <Field label="Valor de esa stat por carga (por rango)" value={draft.stacksPerStack} placeholder="10" onChange={stacksPerStack => onChange({ stacksPerStack })} />
          <Field label="Cargas de este contador para poder activarla (opcional, las gasta)" value={draft.stacksRequired} placeholder="Sin requisito" onChange={stacksRequired => onChange({ stacksRequired })} />
          <Toggle on={draft.stacksOnChampionCc} label="Suma al aplicar un control de masas a un campeón" disabled={disabled} title="Aturdimiento, lanzado al aire, empuje y otros CC conocidos. +1 por campeón si también está «por cada enemigo alcanzado»" onClick={() => onChange({ stacksOnChampionCc: !draft.stacksOnChampionCc })} />
          <Toggle on={draft.stacksConsumeAtMax} label="Al llegar al máximo, gasta las cargas" disabled={disabled} onClick={() => onChange({ stacksConsumeAtMax: !draft.stacksConsumeAtMax })} />
          <Field label="Tras la cura al máximo, intervalo (turnos; aún se pueden ganar cargas)" value={draft.stacksOnMaxCooldown} placeholder="Sin intervalo" onChange={stacksOnMaxCooldown => onChange({ stacksOnMaxCooldown })} />
          <Field label="Al máximo, cura propia (ratio por rango o único)" value={draft.stacksOnMaxHealSelf} placeholder="5" onChange={stacksOnMaxHealSelf => onChange({ stacksOnMaxHealSelf })} />
          <Field label="Stat de esa cura propia (hp, ap…)" value={draft.stacksOnMaxHealSelfStat} placeholder="hp" onChange={stacksOnMaxHealSelfStat => onChange({ stacksOnMaxHealSelfStat })} />
          <Field label="Al máximo, cura a aliados (ratio por rango o único)" value={draft.stacksOnMaxHealAlly} placeholder="7" onChange={stacksOnMaxHealAlly => onChange({ stacksOnMaxHealAlly })} />
          <Field label="Stat de esa cura a aliados (hp, ap…)" value={draft.stacksOnMaxHealAllyStat} placeholder="hp" onChange={stacksOnMaxHealAllyStat => onChange({ stacksOnMaxHealAllyStat })} />
          <Field label="Al máximo, cura plana (por rango o tramo de nivel)" value={draft.stacksOnMaxHealFlat} placeholder="7, 10.5, 14, 17.6" onChange={stacksOnMaxHealFlat => onChange({ stacksOnMaxHealFlat })} />
          <Toggle on={draft.stacksOnMaxHealFlatByLevel} label="La cura plana al máximo usa tramos de nivel (1/6/11/16)" disabled={disabled} onClick={() => onChange({ stacksOnMaxHealFlatByLevel: !draft.stacksOnMaxHealFlatByLevel })} />
          <Toggle on={draft.stacksOnMaxHealAlliesToo} label="La cura al máximo también va a los aliados" disabled={disabled} onClick={() => onChange({ stacksOnMaxHealAlliesToo: !draft.stacksOnMaxHealAlliesToo })} />
          <Toggle on={draft.stacksOnMaxStatus} label="Al máximo, bonus de stat (Exaltada / similar)" disabled={disabled} title="Mientras las cargas estén al máximo, concede un bonus de stat que se quita al bajar" onClick={() => onChange({ stacksOnMaxStatus: !draft.stacksOnMaxStatus })} />
          {draft.stacksOnMaxStatus && (
            <>
              <Field label="Nombre del estado al máximo" value={draft.stacksOnMaxStatusName} placeholder="Exaltada" onChange={stacksOnMaxStatusName => onChange({ stacksOnMaxStatusName })} />
              <Field label="Stat del bonus (p. ej. spe)" value={draft.stacksOnMaxStatusStat} placeholder="spe" onChange={stacksOnMaxStatusStat => onChange({ stacksOnMaxStatusStat })} />
              <Field label="Cantidad plana (vacío = ninguna)" value={draft.stacksOnMaxStatusAmount} placeholder="" onChange={stacksOnMaxStatusAmount => onChange({ stacksOnMaxStatusAmount })} />
              <Field label="% de esa stat (vacío = ninguno)" value={draft.stacksOnMaxStatusPct} placeholder="10" onChange={stacksOnMaxStatusPct => onChange({ stacksOnMaxStatusPct })} />
            </>
          )}
          <Toggle on={draft.stacksArmArmedAaAtMax} label="Al llegar al máximo, arma el AA armado" disabled={disabled} onClick={() => onChange({ stacksArmArmedAaAtMax: !draft.stacksArmArmedAaAtMax })} />
          <Field label="Duración de ese AA armado (turnos)" value={draft.stacksArmArmedAaTurns} placeholder="No caduca solo" onChange={stacksArmArmedAaTurns => onChange({ stacksArmArmedAaTurns })} />
        </>
      )}

      <Toggle on={draft.levelThresholds} label="Mejoras por nivel de campeón" disabled={disabled} title="Al alcanzar un nivel, suma alcance, desbloquea una oleada al AA o deja las cargas al máximo de forma permanente" onClick={() => onChange({ levelThresholds: !draft.levelThresholds })} />
      {draft.levelThresholds && (
        <>
          {(draft.levelThresholdRows.length ? draft.levelThresholdRows : [blankLevelThreshold()]).map((row, index) => (
            <div key={index} className="hab-mechanic-fields">
              <Field label={`Umbral ${index + 1}: nivel`} value={row.level} placeholder="6" onChange={level => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { level }) })} />
              <Field label="Nombre" value={row.name} placeholder="Alzada" onChange={name => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { name }) })} />
              <Field label="Casillas de alcance (bonus)" value={row.rangeBonus} placeholder="2" onChange={rangeBonus => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { rangeBonus }) })} />
              <Toggle on={row.permanentMaxStacks} label="Cargas permanentes al máximo" disabled={disabled} onClick={() => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { permanentMaxStacks: !row.permanentMaxStacks }) })} />
              <label className="hab-field">
                <span>Oleada al AA: tipo</span>
                <select className="hab-field__input" value={row.waveType} disabled={disabled} onChange={event => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { waveType: event.target.value as LevelThresholdDraft['waveType'] }) })}>
                  <option value="">(sin oleada / hereda)</option>
                  <option value="magic">Mágico</option>
                  <option value="true">Verdadero</option>
                  <option value="physical">Físico</option>
                </select>
              </label>
              <Field label="Oleada: ratio AD" value={row.waveAd} placeholder="0.1" onChange={waveAd => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { waveAd }) })} />
              <SourceSelect label="Oleada: origen AD" value={row.waveAdSource} onChange={waveAdSource => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { waveAdSource }) })} />
              <Field label="Oleada: ratio AP" value={row.waveAp} placeholder="0.25" onChange={waveAp => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { waveAp }) })} />
              <SourceSelect label="Oleada: origen AP" value={row.waveApSource} onChange={waveApSource => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { waveApSource }) })} />
              <Toggle on={row.waveRequiresMaxStacks} label="La oleada exige cargas al máximo" disabled={disabled} onClick={() => onChange({ levelThresholdRows: patchThresholdRow(draft.levelThresholdRows, index, { waveRequiresMaxStacks: !row.waveRequiresMaxStacks }) })} />
            </div>
          ))}
          <button type="button" className="hab-learned" disabled={disabled} onClick={() => onChange({ levelThresholdRows: [...(draft.levelThresholdRows.length ? draft.levelThresholdRows : [blankLevelThreshold()]), blankLevelThreshold()] })}>
            Añadir umbral
          </button>
        </>
      )}

      <Toggle on={draft.mark} label="Marca que detona el siguiente AA o habilidad" disabled={disabled} title="Al usarla aplica una marca; el siguiente AA y/o habilidad contra ese objetivo la detona (el daño de esta habilidad) y puede devolver maná" onClick={() => onChange({ mark: !draft.mark })} />
      {draft.mark && (
        <>
          <Field label="Duración de la marca (turnos)" value={draft.markTurns} placeholder="2" onChange={markTurns => onChange({ markTurns })} />
          <label className="hab-field">
            <span className="hab-field__label">Se detona con</span>
            <select className="hab-field__input" value={draft.markDetonate} disabled={disabled} onChange={event => onChange({ markDetonate: event.target.value as 'aa' | 'ability' | 'both' })}>
              <option value="both">AA o habilidad</option>
              <option value="aa">Solo AA</option>
              <option value="ability">Solo habilidad</option>
            </select>
          </label>
          <Toggle on={draft.markDamageOnDetonate} label="El daño se aplica al detonar (no al lanzarla)" disabled={disabled} onClick={() => onChange({ markDamageOnDetonate: !draft.markDamageOnDetonate })} />
          <Field label="Maná plano al detonar con una habilidad (por rango)" value={draft.markRefundFlat} placeholder="30" onChange={markRefundFlat => onChange({ markRefundFlat })} />
          <Toggle on={draft.markRefundCost} label="También restaura el coste de la habilidad que detona" disabled={disabled} onClick={() => onChange({ markRefundCost: !draft.markRefundCost })} />
        </>
      )}

      <Toggle on={draft.requireStacks} label="Requiere cargas de otra habilidad" disabled={disabled} title="Solo se puede activar con N cargas del contador de otra habilidad (por su nombre) y, por defecto, las gasta" onClick={() => onChange({ requireStacks: !draft.requireStacks })} />
      {draft.requireStacks && (
        <>
          <Field label="Nombre de la habilidad que tiene las cargas" value={draft.requireStacksFrom} placeholder="Daredevil Impulse" onChange={requireStacksFrom => onChange({ requireStacksFrom })} />
          <Field label="Cargas necesarias" value={draft.requireStacksCount} placeholder="6" onChange={requireStacksCount => onChange({ requireStacksCount })} />
          <Toggle on={draft.requireStacksConsume} label="Las gasta al activarla" disabled={disabled} onClick={() => onChange({ requireStacksConsume: !draft.requireStacksConsume })} />
        </>
      )}

      <Toggle on={draft.lifeSteal} label="Aplica robo de vida" disabled={disabled} title="El daño de esta habilidad cura el robo de vida × la eficacia (más el omnivampirismo, en una sola cura)" onClick={() => onChange({ lifeSteal: !draft.lifeSteal })} />
      {draft.lifeSteal && (
        <Field label="% de eficacia" value={draft.lifeStealEfficacy} placeholder="100" onChange={lifeStealEfficacy => onChange({ lifeStealEfficacy })} />
      )}

      <Toggle on={draft.permanentStacks} label="Cargas permanentes (ficha)" disabled={disabled} title="Se guardan en la ficha del jugador (clave ability:<nombre>, como las cargas permanentes de ítems). Sobreviven entre combates. En un campeón o NPC solo duran ese combate." onClick={() => onChange({ permanentStacks: !draft.permanentStacks })} />
      {draft.permanentStacks && (
        <>
        <Toggle on={draft.permanentOnChampionHit} label="Suma 1 por cada campeón enemigo único alcanzado con una habilidad que dañe" disabled={disabled} onClick={() => onChange({ permanentOnChampionHit: !draft.permanentOnChampionHit })} />
        <Toggle on={draft.permanentOnTakedown} label="También al derribar" disabled={disabled} onClick={() => onChange({ permanentOnTakedown: !draft.permanentOnTakedown })} />
        {draft.permanentOnTakedown && (
          <div className="hab-mechanic-fields">
            <Field label="Por derribo de campeón" value={draft.permanentTakedownChampion} placeholder="2" onChange={permanentTakedownChampion => onChange({ permanentTakedownChampion })} />
            <Field label="Por derribo que no es campeón" value={draft.permanentTakedownOther} placeholder="1" onChange={permanentTakedownOther => onChange({ permanentTakedownOther })} />
          </div>
        )}
        <Field label="Stat por acumulación (vacío = solo el contador)" value={draft.permanentStat} placeholder="atkSpePct" onChange={permanentStat => onChange({ permanentStat })} />
        <Field label="Valor por acumulación (por rango o tramo)" value={draft.permanentPerStack} placeholder="0.1, 0.66, 1.22, 1.78" onChange={permanentPerStack => onChange({ permanentPerStack })} />
        <Toggle on={draft.permanentByLevel} label="Escala por tramo de nivel (1/6/11/16)" disabled={disabled} onClick={() => onChange({ permanentByLevel: !draft.permanentByLevel })} />
        </>
      )}

      <Toggle on={draft.grantPermanent} label="Concede cargas permanentes de otra habilidad" disabled={disabled} title="Al usarla y dañar, suma cargas al contador permanente de otra habilidad (por su nombre)" onClick={() => onChange({ grantPermanent: !draft.grantPermanent })} />
      {draft.grantPermanent && (
        <>
          <Field label="Nombre de la habilidad que tiene el contador" value={draft.grantPermanentFrom} placeholder="Dragon Practice" onChange={grantPermanentFrom => onChange({ grantPermanentFrom })} />
          <Field label="Máximo por lanzamiento (vacío = 1 por campeón único)" value={draft.grantPermanentMax} placeholder="Sin tope por lanzamiento" onChange={grantPermanentMax => onChange({ grantPermanentMax })} />
          <Toggle on={draft.grantPermanentOnKill} label="También +1 al derribar súbditos o monstruos" disabled={disabled} onClick={() => onChange({ grantPermanentOnKill: !draft.grantPermanentOnKill })} />
          <Toggle on={draft.grantPermanentPerConsumed} label="Concede tantas como cargas consumidas en este uso" disabled={disabled} onClick={() => onChange({ grantPermanentPerConsumed: !draft.grantPermanentPerConsumed })} />
        </>
      )}

      <Toggle on={draft.stackDamage} label="Daño extra según cargas permanentes" disabled={disabled} title="Al usarla, un pulso extra = % del número de cargas permanentes. Si el tipo es distinto al de la habilidad, no aplica robo de vida (sí omnivampirismo)." onClick={() => onChange({ stackDamage: !draft.stackDamage })} />
      {draft.stackDamage && (
        <>
          <Field label="Nombre de la habilidad que tiene el contador" value={draft.stackDamageFrom} placeholder="Dragon Practice" onChange={stackDamageFrom => onChange({ stackDamageFrom })} />
          <Field label="% de las cargas (por rango o tramo)" value={draft.stackDamagePct} placeholder="25, 37, 48, 60" onChange={stackDamagePct => onChange({ stackDamagePct })} />
          <label className="hab-field">
            <span>Tipo de ese daño</span>
            <select value={draft.stackDamageType} onChange={e => onChange({ stackDamageType: e.target.value as 'physical' | 'magic' | 'true' })}>
              <option value="magic">Mágico</option>
              <option value="physical">Físico</option>
              <option value="true">Verdadero</option>
            </select>
          </label>
          <Toggle on={draft.stackDamageByLevel} label="Escala por tramo de nivel (1/6/11/16)" disabled={disabled} title="En vez del rango de la habilidad, usa los 4 tramos de la pasiva" onClick={() => onChange({ stackDamageByLevel: !draft.stackDamageByLevel })} />
        </>
      )}

      <Toggle on={draft.sectorShots} label="Disparos por sector (cada uno con su CD)" disabled={disabled} title="Varios disparos independientes (p. ej. 6 patas). Al acertar un AA, si hay alguno listo, se dispara y entra en su propio CD. La dirección o el cono van a mano." onClick={() => onChange({ sectorShots: !draft.sectorShots })} />
      {draft.sectorShots && (
        <>
          <Field label="Número de sectores" value={draft.sectorShotsCount} placeholder="6" onChange={sectorShotsCount => onChange({ sectorShotsCount })} />
          <Field label="CD de cada disparo (turnos, por rango o tramo)" value={draft.sectorShotsCooldown} placeholder="15, 10, 5, 3" onChange={sectorShotsCooldown => onChange({ sectorShotsCooldown })} />
          <Toggle on={draft.sectorShotsByLevel} label="Escala por tramo de nivel (1/6/11/16)" disabled={disabled} onClick={() => onChange({ sectorShotsByLevel: !draft.sectorShotsByLevel })} />
          <label className="hab-field"><span>Se gastan</span>
            <select value={draft.sectorShotsTrigger} onChange={e => onChange({ sectorShotsTrigger: e.target.value as 'aa' | 'cast' | 'both' })} disabled={disabled}>
              <option value="aa">Al acertar un AA</option>
              <option value="cast">Al usar la habilidad</option>
              <option value="both">AA o al usar la habilidad</option>
            </select>
          </label>
          <Field label="Turnos entre usos (por rango, opcional)" value={draft.sectorShotsGap} placeholder="2, 2, 2, 1, 1" onChange={sectorShotsGap => onChange({ sectorShotsGap })} />
          <Field label="Etiquetas (N, S, E, O)" value={draft.sectorShotsLabels} placeholder="N, S, E, O" onChange={sectorShotsLabels => onChange({ sectorShotsLabels })} />
        </>
      )}

      <Toggle on={draft.toggle} label="Se puede desactivar (interruptor)" disabled={disabled} title="Al usarla se enciende; al volver a pulsar se apaga (sin coste). 0 turnos = permanece hasta desactivarla." onClick={() => onChange({ toggle: !draft.toggle })} />
      {draft.toggle && (
        <>
          <Field label="Duración por rango (0 = hasta desactivar)" value={draft.toggleTurns} placeholder="2, 2, 2, 2, 0" onChange={toggleTurns => onChange({ toggleTurns })} />
          <Field label="Número de ataques fijo (mientras está activo)" value={draft.toggleFixedAttacks} placeholder="3" onChange={toggleFixedAttacks => onChange({ toggleFixedAttacks })} />
        </>
      )}

      <Toggle on={draft.execute} label="Execute si la vida está por debajo de un %" disabled={disabled} title="Si el objetivo está a ese % o menos de su vida máx., este uso (o el recast) le hace el daño que le queda (incluye escudo y vida temporal) y lo derriba." onClick={() => onChange({ execute: !draft.execute })} />
      {draft.execute && (
        <>
          <Field label="% de vida máx." value={draft.executeHpPct} placeholder="25" onChange={executeHpPct => onChange({ executeHpPct })} />
          <Toggle on={draft.executeFear} label="Al ejecutar, aplica un estado a cercanos (miedo)" disabled={disabled} onClick={() => onChange({ executeFear: !draft.executeFear })} />
          {draft.executeFear && (
            <>
              <Field label="Nombre del estado" value={draft.executeFearName} placeholder="Miedo" onChange={executeFearName => onChange({ executeFearName })} />
              <Field label="Duración (turnos)" value={draft.executeFearTurns} placeholder="1" onChange={executeFearTurns => onChange({ executeFearTurns })} />
              <Field label="Valor (opcional, p. ej. % de ralentización)" value={draft.executeFearValue} placeholder="75" onChange={executeFearValue => onChange({ executeFearValue })} />
            </>
          )}
        </>
      )}

      <Toggle on={draft.empoweredAa} label="AA potenciado periódico (cura y entra en CD)" disabled={disabled} title="El siguiente AA cura un % de vida y entra en CD. Usar habilidades o recibir una puede reducir ese CD." onClick={() => onChange({ empoweredAa: !draft.empoweredAa })} />
      {draft.empoweredAa && (
        <>
          <Field label="% de cura por tramo o rango" value={draft.empoweredHeal} placeholder="4, 6.6, 9.2, 11.8" onChange={empoweredHeal => onChange({ empoweredHeal })} />
          <Field label="CD tras dispararse (turnos, por tramo o rango)" value={draft.empoweredCd} placeholder="15, 14, 13, 11" onChange={empoweredCd => onChange({ empoweredCd })} />
          <Toggle on={draft.empoweredByLevel} label="Escala por tramo de nivel (1/6/11/16)" disabled={disabled} onClick={() => onChange({ empoweredByLevel: !draft.empoweredByLevel })} />
          <Field label="Al usar una habilidad, quita (turnos)" value={draft.empoweredReduceAbility} placeholder="2" onChange={empoweredReduceAbility => onChange({ empoweredReduceAbility })} />
          <Field label="Al recibir una habilidad, quita (turnos)" value={draft.empoweredReduceStruck} placeholder="2" onChange={empoweredReduceStruck => onChange({ empoweredReduceStruck })} />
          <Field label="No se dispara por encima de este % de vida máx." value={draft.empoweredSkipHp} placeholder="95" onChange={empoweredSkipHp => onChange({ empoweredSkipHp })} />
        </>
      )}
      <Toggle on={draft.trap} label="Efecto de área retrasado (se detona después)" disabled={disabled} title="Al usarla se coloca; el botón Detonar aplica el daño y los efectos." onClick={() => onChange({ trap: !draft.trap })} />
      {draft.trap && (
        <>
          <Field label="Nombre (opcional)" value={draft.trapName} placeholder="Esqueje" onChange={trapName => onChange({ trapName })} />
          <Field label="Duración (turnos)" value={draft.trapTurns} placeholder="15" onChange={trapTurns => onChange({ trapTurns })} />
          <Toggle on={draft.trapApplyOnPlace} label="El primer golpe se aplica al colocar (Detonar es el segundo)" disabled={disabled} onClick={() => onChange({ trapApplyOnPlace: !draft.trapApplyOnPlace })} />
          <Field label="Efecto al detonar (nombre)" value={draft.trapEruptName} placeholder="Enraizamiento" onChange={trapEruptName => onChange({ trapEruptName })} />
          <Field label="Efecto al detonar (duración, turnos)" value={draft.trapEruptDuration} placeholder="1" onChange={trapEruptDuration => onChange({ trapEruptDuration })} />
        </>
      )}
      <Field label="Al acertar a un campeón, quita al CD del AA potenciado (turnos)" value={draft.reduceEmpoweredOnHit} placeholder="2" onChange={reduceEmpoweredOnHit => onChange({ reduceEmpoweredOnHit })} />
      <Field label="También cuesta este % de la vida máx." value={draft.costHpMaxPct} placeholder="10" onChange={costHpMaxPct => onChange({ costHpMaxPct })} />
      <Field label="No se puede usar por debajo de este % de vida máx." value={draft.costHpMinCurrentPct} placeholder="5" onChange={costHpMinCurrentPct => onChange({ costHpMinCurrentPct })} />
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
          <PoolStatSelect label="Segundo ratio (opcional)" value={draft.poolStat2} onChange={poolStat2 => onChange({ poolStat2 })} />
          <Field label="Segundo % por rango (vacío = ninguno)" value={draft.poolValues2} placeholder="150, 160, 170" onChange={poolValues2 => onChange({ poolValues2 })} />
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
          <Toggle on={draft.poolRequiresChampionHit} label="Solo si alcanza a un campeón o jugador" disabled={disabled} onClick={() => onChange({ poolRequiresChampionHit: !draft.poolRequiresChampionHit })} />
          <Toggle on={draft.poolRequiresSelfInArea} label="Solo si el portador está en el área" disabled={disabled} title="Hay que marcar «Estoy en el área» al usarla" onClick={() => onChange({ poolRequiresSelfInArea: !draft.poolRequiresSelfInArea })} />
          <Toggle on={draft.poolRequiresSelfStatus} label="Solo si el estado propio ya está activo" disabled={disabled} onClick={() => onChange({ poolRequiresSelfStatus: !draft.poolRequiresSelfStatus })} />
          {draft.poolTarget === 'self' && <Toggle on={draft.poolAlliesToo} label="También a aliados (se eligen al usarla)" disabled={disabled} onClick={() => onChange({ poolAlliesToo: !draft.poolAlliesToo })} />}
          <Toggle on={draft.poolAllAllies} label="A todos los aliados del bando (global)" disabled={disabled} onClick={() => onChange({ poolAllAllies: !draft.poolAllAllies })} />
          <Field label="Si está por debajo de este % de vida máx., multiplicar" value={draft.poolLowHpPct} placeholder="40" onChange={poolLowHpPct => onChange({ poolLowHpPct })} />
          <Field label="Multiplicador por vida baja" value={draft.poolLowHpMult} placeholder="1.5" onChange={poolLowHpMult => onChange({ poolLowHpMult })} />
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
          <Field label="Valor (opcional, del estado)" value={draft.selfStatusValue} placeholder="Nada" onChange={selfStatusValue => onChange({ selfStatusValue })} />
          <label className="hab-field">
            <span>Stat que modifica mientras dura</span>
            <select value={draft.selfStatusStat} onChange={e => onChange({ selfStatusStat: e.target.value })}>
              <option value="">Ninguna</option>
              {STAT_COLUMNS.map(column => <option key={column.key} value={column.key}>{column.title}</option>)}
            </select>
          </label>
          {draft.selfStatusStat && (
            <>
              <Field label="Cantidad plana (puede ser negativa)" value={draft.selfStatusAmount} placeholder="Nada" onChange={selfStatusAmount => onChange({ selfStatusAmount })} />
              <Field label="% de la stat actual (puede ser negativa, p. ej. -30)" value={draft.selfStatusPct} placeholder="Nada" onChange={selfStatusPct => onChange({ selfStatusPct })} />
            </>
          )}
          <Field label="Número de ataques fijo (mientras está activo)" value={draft.selfStatusFixedAttacks} placeholder="3" onChange={selfStatusFixedAttacks => onChange({ selfStatusFixedAttacks })} />
          <Field label="% de la stat por rango (opcional)" value={draft.selfStatusPctValues} placeholder="40, 50, 60" onChange={selfStatusPctValues => onChange({ selfStatusPctValues })} />
          <Field label="Cantidad plana por rango (opcional)" value={draft.selfStatusAmountValues} placeholder="10, 15, 20" onChange={selfStatusAmountValues => onChange({ selfStatusAmountValues })} />
          <Toggle on={draft.selfStatusBlocksRecast} label="No se puede recastear mientras dura el estado" disabled={disabled} onClick={() => onChange({ selfStatusBlocksRecast: !draft.selfStatusBlocksRecast })} />
          <Toggle on={draft.selfStatusCancelable} label="Se puede terminar antes (botón «Terminar»)" disabled={disabled} onClick={() => onChange({ selfStatusCancelable: !draft.selfStatusCancelable })} />
          <Toggle on={draft.selfStatusBlocksAbility} label="Bloquea la habilidad mientras dura el estado" disabled={disabled} onClick={() => onChange({ selfStatusBlocksAbility: !draft.selfStatusBlocksAbility })} />
          <Field label="Reducción de daño % por rango" value={draft.selfStatusDamageReduction} placeholder="20, 30, 40, 50, 60" onChange={selfStatusDamageReduction => onChange({ selfStatusDamageReduction })} />
          <Field label="Duración según cargas de (nombre)" value={draft.selfStatusDurationFrom} placeholder="Death in Lavender" onChange={selfStatusDurationFrom => onChange({ selfStatusDurationFrom })} />
          <Field label="Umbrales cargas:turnos (p. ej. 40:45, 80:0)" value={draft.selfStatusDurationThresholds} placeholder="40:45, 80:0" onChange={selfStatusDurationThresholds => onChange({ selfStatusDurationThresholds })} />
          <Field label="Stats extra (JSON, opcional)" value={draft.selfStatusExtraStats} placeholder='[{"stat":"hp","amountValues":[20,50,80]}]' onChange={selfStatusExtraStats => onChange({ selfStatusExtraStats })} />
          <Toggle on={draft.selfStatusRequiresChampionHit} label="Solo si alcanza a un campeón" disabled={disabled} onClick={() => onChange({ selfStatusRequiresChampionHit: !draft.selfStatusRequiresChampionHit })} />
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

      <Toggle on={draft.isolated} label="Objetivo aislado (daño / ralentización)" disabled={disabled} title="En combate aparece el interruptor «Objetivo aislado»" onClick={() => onChange({ isolated: !draft.isolated })} />
      {draft.isolated && (
        <>
          <Field label="Multiplicador de daño si está aislado" value={draft.isolatedMultiplier} placeholder="2.1" onChange={isolatedMultiplier => onChange({ isolatedMultiplier })} />
          <Field label="Ralentización % si está aislado" value={draft.isolatedSlowPct} placeholder="60" onChange={isolatedSlowPct => onChange({ isolatedSlowPct })} />
        </>
      )}
      <Toggle on={draft.evolutions} label="Concede huecos de evolución permanente" disabled={disabled} title="Normalmente la R: 1, 2, 3 huecos según el rango" onClick={() => onChange({ evolutions: !draft.evolutions })} />
      {draft.evolutions && (
        <Field label="Huecos por rango" value={draft.evolutionsSlots} placeholder="1, 2, 3" onChange={evolutionsSlots => onChange({ evolutionsSlots })} />
      )}
      <Toggle on={draft.evolve} label="Se puede evolucionar (forma permanente)" disabled={disabled} onClick={() => onChange({ evolve: !draft.evolve })} />
      {draft.evolve && (
        <>
          <Field label="Nombre de la evolución" value={draft.evolveName} placeholder="Reaper Claws" onChange={evolveName => onChange({ evolveName })} />
          <Field label="Efecto al evolucionar (nombre)" value={draft.evolveEffectName} placeholder="Ralentización" onChange={evolveEffectName => onChange({ evolveEffectName })} />
          <Field label="Efecto: valores" value={draft.evolveEffectValues} placeholder="40" onChange={evolveEffectValues => onChange({ evolveEffectValues })} />
          <Field label="Efecto: duración (turnos)" value={draft.evolveEffectDuration} placeholder="2" onChange={evolveEffectDuration => onChange({ evolveEffectDuration })} />
          <label className="hab-field">
            <span>Efecto: objetivo</span>
            <select className="hab-field__input" value={draft.evolveEffectTarget} disabled={disabled} onChange={event => onChange({ evolveEffectTarget: event.target.value as 'self' | 'enemy' })}>
              <option value="self">Portador</option>
              <option value="enemy">Enemigo</option>
            </select>
          </label>
          <Field label="Recast al evolucionar: veces" value={draft.evolveRecastTimes} placeholder="2" onChange={evolveRecastTimes => onChange({ evolveRecastTimes })} />
          <Field label="Recast al evolucionar: turnos (0 = hasta usarlo)" value={draft.evolveRecastTurns} placeholder="6" onChange={evolveRecastTurns => onChange({ evolveRecastTurns })} />
          <Field label="Aislado al evolucionar: multiplicador" value={draft.evolveIsolatedMultiplier} placeholder="" onChange={evolveIsolatedMultiplier => onChange({ evolveIsolatedMultiplier })} />
          <Field label="Aislado al evolucionar: ralentización %" value={draft.evolveIsolatedSlowPct} placeholder="60" onChange={evolveIsolatedSlowPct => onChange({ evolveIsolatedSlowPct })} />
          <Field label="Recast al matar (evolución): veces" value={draft.evolveRecastOnTakedownTimes} placeholder="1" onChange={evolveRecastOnTakedownTimes => onChange({ evolveRecastOnTakedownTimes })} />
          <Field label="Recast al matar (evolución): turnos (0 = hasta usarlo)" value={draft.evolveRecastOnTakedownTurns} placeholder="0" onChange={evolveRecastOnTakedownTurns => onChange({ evolveRecastOnTakedownTurns })} />
        </>
      )}
      <Toggle on={draft.recastOnTakedown} label="Recast al matar / asistir" disabled={disabled} onClick={() => onChange({ recastOnTakedown: !draft.recastOnTakedown })} />
      {draft.recastOnTakedown && (
        <>
          <Field label="Recast al matar: veces" value={draft.recastOnTakedownTimes} placeholder="1" onChange={recastOnTakedownTimes => onChange({ recastOnTakedownTimes })} />
          <Field label="Recast al matar: turnos (0 = hasta usarlo)" value={draft.recastOnTakedownTurns} placeholder="0" onChange={recastOnTakedownTurns => onChange({ recastOnTakedownTurns })} />
          <Field label="Máximo de recasts almacenados (vacío = sin tope)" value={draft.recastOnTakedownMax} placeholder="3" onChange={recastOnTakedownMax => onChange({ recastOnTakedownMax })} />
          <Toggle on={draft.recastOnTakedownChampion} label="Solo cuenta derribar a un campeón o jugador" disabled={disabled} onClick={() => onChange({ recastOnTakedownChampion: !draft.recastOnTakedownChampion })} />
        </>
      )}
      <Toggle on={draft.returnStrike} label="Vuelta: el mismo daño de nuevo con otro tipo" disabled={disabled} title="Tras el daño de ida, aplica el mismo monto (p. ej. verdadero al volver el orbe)" onClick={() => onChange({ returnStrike: !draft.returnStrike })} />
      {draft.returnStrike && (
        <label className="hab-field">
          <span className="hab-field__label">Tipo de la vuelta</span>
          <select className="hab-field__input" value={draft.returnStrikeType} disabled={disabled} onChange={event => onChange({ returnStrikeType: event.target.value as 'true' | 'magic' | 'physical' })}>
            <option value="true">Verdadero</option>
            <option value="magic">Mágico</option>
            <option value="physical">Físico</option>
          </select>
        </label>
      )}
      <Toggle on={draft.takedownHeal} label="Al derribar, cura al portador" disabled={disabled} onClick={() => onChange({ takedownHeal: !draft.takedownHeal })} />
      {draft.takedownHeal && (
        <>
          <Field label="Cura al derribar: base plana (por rango o tramo)" value={draft.takedownHealFlat} placeholder="15, 20.3, 25.6, 30.9" onChange={takedownHealFlat => onChange({ takedownHealFlat })} />
          <Toggle on={draft.takedownHealFlatByLevel} label="La base plana usa tramos de nivel (1/6/11/16)" disabled={disabled} onClick={() => onChange({ takedownHealFlatByLevel: !draft.takedownHealFlatByLevel })} />
          <Field label="Cura al derribar: % AP" value={draft.takedownHealAp} placeholder="30" onChange={takedownHealAp => onChange({ takedownHealAp })} />
          <Toggle on={draft.takedownHealChampion} label="Solo al derribar a un campeón o jugador" disabled={disabled} onClick={() => onChange({ takedownHealChampion: !draft.takedownHealChampion })} />
        </>
      )}
      <Toggle on={draft.armedAa} label="AA armado (daño extra al siguiente AA a campeón)" disabled={disabled} onClick={() => onChange({ armedAa: !draft.armedAa })} />
      {draft.armedAa && (
        <>
          <Field label="Tipo de daño" value={draft.armedAaType} placeholder="magic" onChange={armedAaType => onChange({ armedAaType })} />
          <Field label="Duración al armarlo (turnos, vacío = no caduca solo)" value={draft.armedAaTurns} placeholder="3" onChange={armedAaTurns => onChange({ armedAaTurns })} />
          <Field label="% AD por rango o único" value={draft.armedAaAd} placeholder="0.5" onChange={armedAaAd => onChange({ armedAaAd })} />
          <SourceSelect label="Origen del AD" value={draft.armedAaAdSource} onChange={armedAaAdSource => onChange({ armedAaAdSource })} />
          <Field label="% AP" value={draft.armedAaAp} placeholder="" onChange={armedAaAp => onChange({ armedAaAp })} />
          <SourceSelect label="Origen del AP" value={draft.armedAaApSource} onChange={armedAaApSource => onChange({ armedAaApSource })} />
          <Field label="% de vida por rango" value={draft.armedAaHp} placeholder="8, 8.5, 9, 9.5, 10" onChange={armedAaHp => onChange({ armedAaHp })} />
          <HpSourceSelect label="Tipo de vida" value={draft.armedAaHpSource} onChange={armedAaHpSource => onChange({ armedAaHpSource })} />
          <Field label="% adicional de esa vida por cada 100 AP" value={draft.armedAaApPer100} placeholder="1.5" onChange={armedAaApPer100 => onChange({ armedAaApPer100 })} />
          <Field label="Explota en área a partir del nivel" value={draft.armedAaExplodeFromLevel} placeholder="11" onChange={armedAaExplodeFromLevel => onChange({ armedAaExplodeFromLevel })} />
          <Field label="Estado al impactar" value={draft.armedAaEffectName} placeholder="Ralentización" onChange={armedAaEffectName => onChange({ armedAaEffectName })} />
          <Field label="Estado: valor" value={draft.armedAaEffectValues} placeholder="25" onChange={armedAaEffectValues => onChange({ armedAaEffectValues })} />
          <Field label="Estado: duración (turnos)" value={draft.armedAaEffectDuration} placeholder="1" onChange={armedAaEffectDuration => onChange({ armedAaEffectDuration })} />
          <Toggle on={draft.armedAaEndsSelfStatus} label="Al consumir el AA armado, termina el estado propio de esta habilidad" disabled={disabled} onClick={() => onChange({ armedAaEndsSelfStatus: !draft.armedAaEndsSelfStatus })} />
        </>
      )}
      <Toggle on={draft.armArmedAa} label="Al usarla, arma el AA armado del portador" disabled={disabled} onClick={() => onChange({ armArmedAa: !draft.armArmedAa })} />
      <Toggle on={draft.protect} label="Al usarla, reduce el daño recibido (protección / invulnerabilidad)" disabled={disabled} title="Aplica un estado de reducción de daño al portador y/o a un aliado. 100 % = invulnerable" onClick={() => onChange({ protect: !draft.protect })} />
      {draft.protect && (
        <>
          <Field label="Nombre del estado" value={draft.protectName} placeholder="Intervención" onChange={protectName => onChange({ protectName })} />
          <Field label="Duración (turnos)" value={draft.protectTurns} placeholder="2" onChange={protectTurns => onChange({ protectTurns })} />
          <Field label="% de reducción de daño por rango (100 = invulnerable)" value={draft.protectPct} placeholder="100" onChange={protectPct => onChange({ protectPct })} />
          <label className="hab-field">
            <span>Objetivo</span>
            <select className="hab-field__input" value={draft.protectTarget} disabled={disabled} onChange={event => onChange({ protectTarget: event.target.value as 'self' | 'ally' | 'allyOrSelf' })}>
              <option value="self">Portador</option>
              <option value="ally">Aliado</option>
              <option value="allyOrSelf">Aliado si hay, si no el portador</option>
            </select>
          </label>
        </>
      )}
      <Toggle on={draft.cleanse} label="Al usarla, limpia los controles de masas del portador" disabled={disabled} title="Quita aturdimiento, lanzado al aire, enraizamiento, silencio, ralentización y otros CC conocidos" onClick={() => onChange({ cleanse: !draft.cleanse })} />
      <Toggle on={draft.resistShred} label="Al acertar, reduce CA y RM (%)" disabled={disabled} onClick={() => onChange({ resistShred: !draft.resistShred })} />
      {draft.resistShred && (
        <>
          <Field label="% de reducción por rango" value={draft.resistShredPct} placeholder="16, 20, 24, 28, 32" onChange={resistShredPct => onChange({ resistShredPct })} />
          <Field label="Duración (turnos)" value={draft.resistShredTurns} placeholder="2" onChange={resistShredTurns => onChange({ resistShredTurns })} />
        </>
      )}
      <Toggle on={draft.aaOnHit} label="Daño extra de los AA (on-hit)" disabled={disabled} title="Mientras dura el estado propio / interruptor / buff (o siempre, si se marca), los AA hacen daño extra: % de vida, AD y/o AP" onClick={() => onChange({ aaOnHit: !draft.aaOnHit })} />
      {draft.aaOnHit && (
        <>
          <Field label="Tipo de daño" value={draft.aaOnHitType} placeholder="magic" onChange={aaOnHitType => onChange({ aaOnHitType })} />
          <Field label="% de vida por rango" value={draft.aaOnHitHp} placeholder="3, 3.75, 4.5, 5.25, 6" onChange={aaOnHitHp => onChange({ aaOnHitHp })} />
          <HpSourceSelect label="Tipo de vida" value={draft.aaOnHitHpSource} onChange={aaOnHitHpSource => onChange({ aaOnHitHpSource })} />
          <Field label="% adicional de esa vida por cada 100 AP" value={draft.aaOnHitApPer100} placeholder="1.5" onChange={aaOnHitApPer100 => onChange({ aaOnHitApPer100 })} />
          <Field label="Ratio de AD por rango (0.03 = 3 %)" value={draft.aaOnHitAd} placeholder="0.03, 0.03, 0.03" onChange={aaOnHitAd => onChange({ aaOnHitAd })} />
          <SourceSelect label="Origen del AD" value={draft.aaOnHitAdSource} onChange={aaOnHitAdSource => onChange({ aaOnHitAdSource })} />
          <Field label="Ratio de AP por rango (0.20 = 20 %)" value={draft.aaOnHitAp} placeholder="0.1, 0.15, 0.2, 0.25, 0.3" onChange={aaOnHitAp => onChange({ aaOnHitAp })} />
          <SourceSelect label="Origen del AP" value={draft.aaOnHitApSource} onChange={aaOnHitApSource => onChange({ aaOnHitApSource })} />
          <Toggle on={draft.aaOnHitAlways} label="Siempre (con la habilidad aprendida, sin estado)" disabled={disabled} onClick={() => onChange({ aaOnHitAlways: !draft.aaOnHitAlways })} />
          <Field label="Acumulaciones por objetivo: duración (t.)" value={draft.aaOnHitStackTurns} placeholder="3" onChange={aaOnHitStackTurns => onChange({ aaOnHitStackTurns })} />
          <Field label="Tope de acumulaciones (vacío = sin tope)" value={draft.aaOnHitStackMax} placeholder="8" onChange={aaOnHitStackMax => onChange({ aaOnHitStackMax })} />
        </>
      )}
      <Toggle on={draft.costStacks} label="El coste sube con cada uso reciente" disabled={disabled} onClick={() => onChange({ costStacks: !draft.costStacks })} />
      {draft.costStacks && (
        <>
          <Field label="Coste extra por acumulación" value={draft.costStacksAmount} placeholder="20" onChange={costStacksAmount => onChange({ costStacksAmount })} />
          <Field label="Duración de las acumulaciones (turnos)" value={draft.costStacksTurns} placeholder="4" onChange={costStacksTurns => onChange({ costStacksTurns })} />
          <Field label="Máximo de acumulaciones" value={draft.costStacksMax} placeholder="9" onChange={costStacksMax => onChange({ costStacksMax })} />
        </>
      )}
      <Toggle on={draft.deathBurst} label="Al morir: estado y explosión" disabled={disabled} onClick={() => onChange({ deathBurst: !draft.deathBurst })} />
      {draft.deathBurst && (
        <>
          <Field label="Nombre del estado" value={draft.deathBurstName} placeholder="Icathian Surprise" onChange={deathBurstName => onChange({ deathBurstName })} />
          <Field label="Duración (turnos)" value={draft.deathBurstTurns} placeholder="2" onChange={deathBurstTurns => onChange({ deathBurstTurns })} />
          <Field label="% de SPE (opcional)" value={draft.deathBurstPct} placeholder="50" onChange={deathBurstPct => onChange({ deathBurstPct })} />
        </>
      )}
      <Toggle on={draft.damageLowHp} label="Más daño si el objetivo está bajo de vida" disabled={disabled} onClick={() => onChange({ damageLowHp: !draft.damageLowHp })} />
      {draft.damageLowHp && (
        <>
          <Field label="Por debajo de este % de vida máx., multiplicar" value={draft.damageLowHpPct} placeholder="40" onChange={damageLowHpPct => onChange({ damageLowHpPct })} />
          <Field label="Multiplicador" value={draft.damageLowHpMult} placeholder="2" onChange={damageLowHpMult => onChange({ damageLowHpMult })} />
          <Field label="Por encima: +% máx. según vida faltante (opcional)" value={draft.damageMissingMaxBonus} placeholder="50" onChange={damageMissingMaxBonus => onChange({ damageMissingMaxBonus })} />
        </>
      )}
      <Toggle on={draft.onAbilityUse} label="Al usar una habilidad: vel. ataque temporal" disabled={disabled} onClick={() => onChange({ onAbilityUse: !draft.onAbilityUse })} />
        {draft.onAbilityUse && (
          <div className="hab-mechanic-fields">
            <Field label="Turnos" value={draft.onAbilityUseTurns} placeholder="2" onChange={onAbilityUseTurns => onChange({ onAbilityUseTurns })} />
            <Field label="% vel. ataque" value={draft.onAbilityUseAttackSpeed} placeholder="20" onChange={onAbilityUseAttackSpeed => onChange({ onAbilityUseAttackSpeed })} />
          </div>
        )}
        <Toggle on={draft.resetSectorShots} label="Reinicia disparos por sector de otra habilidad" disabled={disabled} onClick={() => onChange({ resetSectorShots: !draft.resetSectorShots })} />
        {draft.resetSectorShots && (
          <div className="hab-mechanic-fields">
            <Field label="Habilidad" value={draft.resetSectorShotsFrom} placeholder="Void Surge" onChange={resetSectorShotsFrom => onChange({ resetSectorShotsFrom })} />
            <Field label="Cuántos dispara" value={draft.resetSectorShotsCount} placeholder="1" onChange={resetSectorShotsCount => onChange({ resetSectorShotsCount })} />
            <Toggle on={draft.resetSectorShotsChampionHit} label="Solo si alcanza a un campeón" disabled={disabled} onClick={() => onChange({ resetSectorShotsChampionHit: !draft.resetSectorShotsChampionHit })} />
          </div>
        )}
        <Toggle on={draft.strikes} label="Varios golpes (el daño se aplica N veces)" disabled={disabled} onClick={() => onChange({ strikes: !draft.strikes })} />
        {draft.strikes && (
          <div className="hab-mechanic-fields">
            <Field label="Golpes por rango" value={draft.strikesCount} placeholder="6, 6, 6, 6, 6" onChange={strikesCount => onChange({ strikesCount })} />
            <Field label="+1 golpe por cada este % de vel. ataque bonus" value={draft.strikesPerBonusAtkSpe} placeholder="40" onChange={strikesPerBonusAtkSpe => onChange({ strikesPerBonusAtkSpe })} />
          </div>
        )}

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

function patchThresholdRow(rows: LevelThresholdDraft[], index: number, patch: Partial<LevelThresholdDraft>): LevelThresholdDraft[] {
  const next = (rows.length ? rows : [blankLevelThreshold()]).map(row => ({ ...row }));
  while (next.length <= index) next.push(blankLevelThreshold());
  next[index] = { ...next[index], ...patch };
  return next;
}
