import type { Ability } from './champions';
import type { CombatBonus } from './combat';
import type { EffectBonusConfig } from './effectBonus';
import { abilityStackKey } from './stacks';

/**
 * Mecánicas de combate de una habilidad (genéricas, para ir configurando campeones):
 * Regla general: las pasivas de Q/W/E/R (learnedStats, aaOnHit, AA armado, AS pasiva,
 * disparos de sector al AA, AA potenciado, marcas de la R, onAbilityUse, etc.) solo
 * aplican si esa habilidad tiene al menos 1 punto (rango ≥ 1). La P innata no se filtra
 * por esto (salvo si ya usa «aprendida» / rango).
 * - charges: se usa gastando cargas en vez de CD (empieza el combate con start; recarga 1 cada recharge[rango] turnos).
 * - stacks: cargas que posee esta habilidad (p. ej. la pasiva). Se ganan al AA (onAa, por defecto sí) y/o al acertar
 *   una habilidad que dañe (onAbilityHit), duran turns (se refrescan), máx. max. Con required, ESTA habilidad solo
 *   se puede activar con esas cargas (y las gasta). Una habilidad que consume esas cargas no suma en el mismo uso.
 * - requireStacks: exige N cargas de OTRA habilidad (por su nombre) para activarse y, por defecto, las gasta.
 * - permanentStacks: cargas permanentes del portador (ficha del jugador, clave ability:<nombre>, como las de ítems effect:<id>).
 *   Se ganan al acertar campeones con habilidades (onAbilityChampionHit). En campeones/NPC duran solo el combate.
 * - grantPermanent: esta habilidad concede cargas permanentes de otra (máx. por lanzamiento, también al matar súbditos).
 * - stackDamage: daño extra = pct[rango]% × cargas permanentes de `from` (otro pulso si el tipo es distinto; sin robo de vida).
 * - sectorShots: N disparos independientes (p. ej. patas), cada uno con su CD; al acertar un AA se dispara uno si hay alguno listo.
 * - toggle: se puede desactivar usándola otra vez; turns por rango (0 = hasta desactivar).
 *   fixedAttacks: mientras está activo, el número de ataques del turno pasa a ese valor (no se suma al de la ficha).
 * - execute: si el objetivo está a ≤ hpPct % de su vida máx., este uso (o el recast) lo ejecuta. Opcional: miedo a cercanos al lograrlo.
 * - lifeSteal: el daño de la habilidad aplica robo de vida con efficacy % de eficacia (se combina con el omnivampirismo).
 * - selfStatus.stat: mientras dura el estado, bonus de stat (amount plano y/o pct % de la stat actual; puede ser negativo).
 * - buff: al activar, turns turnos de bonus propio: % velocidad de ataque y % AD de los AA (por rango);
 *   aaAppliesPassive = esos AA aplican el estado de la pasiva.
 * - appliesPassive: los objetivos alcanzados reciben el estado de la pasiva (el primer efecto de la P).
 * - aaCritBonus (pasiva): los AA hacen daño extra = daño del AA × pctPerFace % × caras de prob. de crítico.
 * - critNoDamage (pasiva): los críticos del portador no hacen daño extra (no se aplica DAÑO CRÍT; Ashe).
 * - critDoublesPassive (pasiva): en un crítico, el estado de la pasiva se aplica con el valor doble (Ashe: ralentización).
 * - effectRules: reglas como las de los efectos con nombre de los ítems (mismo motor: daño al AA, CD por objetivo…),
 *   activas mientras la tenga aprendida (rango ≥ 1; la pasiva siempre). Cadencia marcial de Jarvan IV.
 * - learnedStats: bonus de stat por tenerla aprendida (rango ≥ 1), valor por rango. Estandarte demaciano: vel. ataque.
 * - empoweredAa: el siguiente AA cura % de vida (tramos o rangos) y entra en CD; usar habilidades o recibir una
 *   habilidad puede reducir ese CD. skipAboveHpPct: no se dispara por encima de ese % de vida máx.
 * - trap: al usarla se coloca un efecto de área retrasado (turns); «Detonar» aplica el daño y los efectos.
 *   applyOnPlace: el primer golpe (daño y efectos) se aplica al colocar; Detonar aplica el segundo (eruptEffect si está).
 * - costHpMaxPct / costHpMinCurrentPct: además del coste de recurso, gasta un % de la vida máx.; no se puede usar por debajo del % mínimo.
 * - castPool.allAllies: la cura/escudo va a todos los aliados (y al portador si target no es ally).
 * - castPool.lowHpBonus: si el objetivo está por debajo de belowHpPct % de vida máx., la cantidad × multiplier.
 * - castPool.requiresChampionHit / selfStatus.requiresChampionHit: solo si alcanza a un campeón o jugador.
 * - reduceEmpoweredAaOnHit: al acertar a un campeón, quita N turnos al CD del AA potenciado del portador.
 * - castPool: escudo / curación al portador al usarla: Σ (valor del rango % × stat) [+ pct % de stat por campeón enemigo
 *   alcanzado] × poder de curación y escudos; dura turns (marcador: al acabar se quita lo que quede; bloquea la habilidad).
 * - castPool.requiresSelfInArea: la cura/escudo solo si el portador marca «Estoy en el área».
 * - isolated: «Objetivo aislado» multiplica el daño y/o sustituye el valor de ralentización.
 * - evolutions: esta habilidad (normalmente la R) da huecos de evolución permanente por rango.
 * - evolve: forma evolucionada permanente (se elige una vez; no es una fase por uso).
 * - recastOnTakedown: al matar/asistir, concede recasts de esta habilidad (turns 0 = hasta usarlo).
 * - armedAa: el siguiente AA a un campeón, si está armado, hace daño extra y puede aplicar un estado; se desarma.
 * - armArmedAa: al usarla, arma todos los AA armados del portador.
 * - learnedStats: bonus de stat por tenerla aprendida (ya existía; p. ej. vel. ataque de la Q).
 * - resistShred: al acertar, reduce un % de CA y RM del objetivo durante turns.
 * - aaOnHit: mientras la habilidad está activa (estado propio / interruptor / buff), los AA hacen % de vida (y opcionalmente +% por 100 AP).
 * - costStacks: cada uso reciente aumenta el coste en amount (máx. max, duración turns, se refresca).
 * - deathBurst: al morir (botón), estado propio y explosión al acabar o con «Explotar».
 * - damageLowHp: el daño de la habilidad × multiplier bajo belowHpPct % de vida máx.; opcional +% según vida faltante.
 * - permanentStacks.onTakedown: +N acumulaciones al derribar (takedownChampion / takedownOther); perStack + stat: bonus de stat por acumulación (tramos si byLevel).
 * - onAbilityUse: al usar cualquier habilidad, el portador gana un buff temporal (p. ej. vel. ataque).
 * - sectorShots.trigger: 'aa' (por defecto, al acertar un AA), 'cast' (al usar la habilidad) o 'both'; gap = t. entre usos; labels = nombres de cada sector.
 * - resetSectorShots: al usarla, reinicia N disparos de otra habilidad (opcionalmente solo si acierta a un campeón).
 * - strikes: la habilidad aplica su daño count veces (+1 por cada perBonusAtkSpe % de vel. ataque bonus).
 * - aaOnHit.always: los AA aplican el daño extra mientras esté aprendida (no hace falta estado / interruptor).
 * - aaOnHit.ad / perTargetStacks: daño extra de AA por AD y acumulaciones por objetivo.
 * - selfStatus.stats / damageReductionValues / cancelable / blocksAbility / durationByStacks: varios bonus, % de reducción de daño, se puede terminar, no bloquea la habilidad, duración según acumulaciones permanentes.
 * - castPool.requiresSelfStatus: la cura/escudo solo si el estado propio de esta habilidad ya está activo.
 * - stacks.onChampionTakedown: gana una carga temporal al derribar a un campeón o jugador.
 * - stacks.stat / perStack / perTarget / requiresDamage: bonus de stat por carga temporal (p. ej. vel. ataque),
 *   +1 por cada enemigo alcanzado, y si las cargas de habilidad exigen daño (por defecto sí).
 * - mark: al usarla aplica una marca; el siguiente AA y/o habilidad contra el marcado la detona (daño de esta
 *   habilidad) y puede devolver maná si la detona una habilidad.
 * - grantPermanent.perConsumedStack: concede tantas cargas permanentes como cargas consumidas en este uso.
 * - stacks.onChampionCc: gana cargas al aplicar un control de masas (aturdimiento, lanzado al aire, empuje…)
 *   a un campeón o jugador.
 * - stacks.consumeAtMax / onMaxHeal / onMaxCooldown: al llegar al máximo, cura (% de vida máx. propia y de
 *   aliados) y puede gastar las cargas; intervalo en el que aún se pueden ganar más.
 * - stacks.armArmedAaAtMax / armArmedAaTurns: al llegar al máximo, arma el AA armado (ventana opcional).
 * - armedAa.endsSelfStatus: al consumir el AA armado, termina el estado propio de esa habilidad.
 * - cleanse: al usarla, quita del portador los estados de control de masas conocidos.
 * - stacks.onNonChampionKill: gana 1 carga al derribar un súbdito, monstruo u otro no campeón.
 * - onMaxHeal.flat / flatByLevel: cura plana al máximo (tramos de nivel si flatByLevel), además de ratios.
 * - takedownHeal: al derribar, cura al portador (plana por tramo y/o ratios); champion = solo campeones/jugadores.
 * - returnStrike: tras el daño de ida, aplica el mismo monto con otro tipo (p. ej. verdadero a la vuelta).
 * - recastOnTakedown.max / champion: tope de recasts almacenados; solo derribos de campeón/jugador.
 * - levelThresholds: al alcanzar un nivel de campeón, bonus de alcance, oleada al AA (tipo/ratios, opcional solo al máximo de cargas) y/o cargas al máximo permanentes.
 * - stacks.onMaxStatus: al estar al máximo de cargas, bonus de stat (plana o %) mientras se mantiene el máximo (p. ej. Exaltada).
 * - aaOnHit.ap / apSource: ratio de AP del daño extra de los AA (además de AD y % de vida).
 * - armedAa.hp / hpSource / apPer100: el AA armado puede hacer % de vida (faltante, etc.) + % por 100 de AP.
 * - armedAa.explodeFromLevel: a partir de ese nivel de campeón, el AA armado también golpea el área (cercanos a mano).
 * - protect: al usarla, reducción de daño (p. ej. 100 % = invulnerable) al portador y/o al aliado durante turns.
 */
export type AbilityMechanics = {
  /** reducePerChampionHit: cada campeón enemigo alcanzado (AA / habilidad) quita N turnos a la recarga (Plumas feéricas). */
  charges?: { start: number; max: number; recharge: number[]; reducePerChampionHit?: number };
  stacks?: AbilityStacks;
  /** Exige las cargas de otra habilidad para activarse (y por defecto las gasta). */
  requireStacks?: AbilityRequireStacks;
  /** Este es el dueño de un contador permanente (se guarda en la ficha). */
  permanentStacks?: AbilityPermanentStacks;
  /** Concede cargas permanentes del contador de otra habilidad (o de sí misma). */
  grantPermanent?: AbilityGrantPermanent;
  /** Daño extra = pct[rango]% × cargas permanentes de `from`. */
  stackDamage?: AbilityStackDamage;
  /** Disparos por sector (cada uno con su propio CD); por defecto se disparan al acertar un AA. */
  sectorShots?: AbilitySectorShots;
  /** Se puede desactivar usándola otra vez. turns por rango (0 = hasta desactivar). */
  toggle?: AbilityToggle;
  /** Execute si el objetivo está por debajo de hpPct % de su vida máx. */
  execute?: AbilityExecute;
  /** El daño de esta habilidad aplica robo de vida (eficacia %; 100 = el % de robo de vida al completo). */
  lifeSteal?: AbilityLifeSteal;
  buff?: { turns: number; attackSpeed?: number[]; aaAd?: number[]; aaAppliesPassive?: boolean };
  appliesPassive?: boolean;
  aaCritBonus?: { pctPerFace: number };
  critNoDamage?: boolean;
  critDoublesPassive?: boolean;
  effectRules?: EffectBonusConfig;
  learnedStats?: { stat: string; values: number[] }[];
  castPool?: AbilityCastPool;
  /** Su efecto enemigo va a TODOS los enemigos del combate (no solo a los objetivos elegidos). Paranoia de Nocturne. */
  allEnemies?: boolean;
  /** Al usarla, estado propio (escudo de hechizos) que se puede romper: al romperse, los bonus «por tenerla aprendida» × learnedMultiplier durante breakTurns. */
  spellShield?: AbilitySpellShield;
  /** Se puede volver a lanzar times veces gratis (sin coste ni bloqueo) durante turns turnos tras usarla. Danza de guerra. */
  recast?: { times: number; turns: number };
  /** Al usarla, estado en sí mismo (bloquea la habilidad mientras dura). Puede modificar una stat mientras dura. */
  selfStatus?: AbilitySelfStatus;
  /** Varios estados propios (p. ej. invisibilidad 1 t. y velocidad 2 t.). */
  selfStatuses?: AbilitySelfStatus[];
  /** Muestra el interruptor «Estoy en el área / rastro». */
  selfInArea?: boolean;
  /** Texto del interruptor (por defecto «Estoy en el área»). */
  selfInAreaLabel?: string;
  /** Al usarla, deja un rastro/área durante estos turnos (botón para aplicar los estados de requiresSelfInArea). */
  trailTurns?: number;
  /** Segundo efecto aplicado solo a un subconjunto (p. ej. silencio en el centro; se elige a mano). */
  centerEffect?: { name: string; duration: number; values?: number[] };
  /** No gasta la acción de habilidad del turno (escudo de la pasiva). */
  noAction?: boolean;
  /** Escudo automático: al empezar el combate; al romperse, CD (turnos por rango/tramo, decimales) y vuelve solo. Plumas feéricas. */
  innateShield?: AbilityInnateShield;
  /** AA potenciado periódico: cura % de vida y entra en CD (reducible al usar / recibir habilidades). */
  empoweredAa?: AbilityEmpoweredAa;
  /** Efecto de área retrasado: se coloca al usarla y se detona después (o caduca). */
  trap?: AbilityTrap;
  /** Al acertar a un campeón con esta habilidad, quita N turnos al CD del AA potenciado del portador. */
  reduceEmpoweredAaOnHit?: number;
  /** Además del coste de recurso, gasta este % de la vida máxima (no baja de 1 PV). */
  costHpMaxPct?: number;
  /** No se puede usar si la vida actual está por debajo de este % de la máxima. */
  costHpMinCurrentPct?: number;
  /** Daño / efecto extra si el objetivo está aislado (interruptor «Objetivo aislado»). */
  isolated?: AbilityIsolated;
  /** Huecos de evolución permanente que concede esta habilidad (por rango). */
  evolutions?: AbilityEvolutions;
  /** Forma evolucionada permanente de esta habilidad (no es una fase por uso). */
  evolve?: AbilityEvolve;
  /** Al matar o asistir, concede recasts de esta habilidad. turns 0 = hasta usarlo. */
  recastOnTakedown?: { times: number; turns: number; max?: number; champion?: boolean };
  /** Siguiente AA a un campeón: daño extra y/o estado, si está armado. */
  armedAa?: AbilityArmedAa;
  /** Al usarla, arma todos los AA armados del portador. */
  armArmedAa?: boolean;
  /** Al acertar, reduce un % de CA y RM del objetivo. */
  resistShred?: AbilityResistShred;
  /** Daño extra de los AA mientras esta habilidad está activa. */
  aaOnHit?: AbilityAaOnHit;
  /** Cada uso reciente aumenta el coste (se gana la acumulación después de pagar). */
  costStacks?: AbilityCostStacks;
  /** Al morir: estado propio y explosión al acabar o con «Explotar». */
  deathBurst?: AbilityDeathBurst;
  /** Multiplicadores del daño de la habilidad según la vida del objetivo. */
  damageLowHp?: AbilityDamageLowHp;
  /** Al usar cualquier habilidad, aplica este buff temporal al portador. */
  onAbilityUse?: AbilityOnAbilityUse;
  /** Al usarla, reinicia disparos por sector de otra habilidad. */
  resetSectorShots?: AbilityResetSectorShots;
  /** Número de golpes de esta habilidad (el daño se aplica tantas veces). */
  strikes?: AbilityStrikes;
  /** Marca al usarla; el siguiente AA y/o habilidad contra el marcado la detona. */
  mark?: AbilityMark;
  /** Al usarla, limpia los controles de masas conocidos del portador. */
  cleanse?: boolean;
  /** Tras el daño de ida, aplica el mismo monto con este tipo (vuelta del orbe). */
  returnStrike?: AbilityReturnStrike;
  /** Al derribar, cura al portador. */
  takedownHeal?: AbilityTakedownHeal;
  /** Mejoras por nivel de campeón (alcance, oleada al AA, cargas permanentes al máximo). */
  levelThresholds?: AbilityLevelThreshold[];
  /** Al usarla, reducción de daño al portador y/o a un aliado. */
  protect?: AbilityProtect;
};

/** Contador de cargas que posee esta habilidad. */
export type AbilityStacks = {
  turns: number;
  max: number;
  /** Si está, esta misma habilidad solo se activa con esas cargas (y las gasta). */
  required?: number;
  /** Si es false, no gana cargas al acertar un AA. Por defecto true. */
  onAa?: boolean;
  /** Gana 1 carga al acertar una habilidad que dañe (aunque no aplique efectos de impacto). Por defecto false. */
  onAbilityHit?: boolean;
  /** Gana 1 carga al derribar a un campeón o jugador. Por defecto false. */
  onChampionTakedown?: boolean;
  /** Gana 1 carga al derribar un súbdito, monstruo u otro no campeón. Por defecto false. */
  onNonChampionKill?: boolean;
  /** Stat que concede cada carga temporal (p. ej. atkSpePct), mientras duran. */
  stat?: string;
  /** Valor de esa stat por carga, por rango. */
  perStack?: number[];
  /** Si es true, gana 1 carga por cada enemigo alcanzado, no 1 por uso. */
  perTarget?: boolean;
  /** Si es false, las cargas al acertar una habilidad no exigen que haya hecho daño. Por defecto true. */
  requiresDamage?: boolean;
  /** Gana cargas al aplicar un control de masas a un campeón o jugador. Por defecto false. */
  onChampionCc?: boolean;
  /** Al llegar al máximo, gasta las cargas (p. ej. tras la cura). Por defecto false. */
  consumeAtMax?: boolean;
  /** Un contador de cargas por objetivo (no uno global). */
  countersPerTarget?: boolean;
  /** Al llegar al máximo, aplica el daño de esta habilidad al objetivo que completó las cargas. Ausente = sí si hay daño y consumeAtMax. */
  onMaxDamage?: boolean;
  /** Bonus de stat propio al llegar al máximo. */
  onMaxSelfStats?: { stat: string; values: number[]; turns: number }[];
  /** Turnos de intervalo tras la cura al máximo; durante ellos aún se pueden ganar cargas. */
  onMaxCooldown?: number;
  /** Cura al llegar al máximo (p. ej. % de vida máx. propia y de aliados). */
  onMaxHeal?: AbilityStackHeal;
  /** Al llegar al máximo, arma el AA armado de esta habilidad. */
  armArmedAaAtMax?: boolean;
  /** Duración de ese AA armado (turnos). Ausente = no caduca solo. */
  armArmedAaTurns?: number;
  /** Mientras las cargas están al máximo, bonus de stat (se quita al bajar). */
  onMaxStatus?: AbilityStackMaxStatus;
};

/** Bonus de stat mientras las cargas temporales están al máximo. */
export type AbilityStackMaxStatus = {
  name?: string;
  stat?: string;
  /** Cantidad plana. */
  amount?: number;
  /** % de la stat actual del portador. */
  pct?: number;
};

/** Oleada o pulso extra al AA, desbloqueada por umbral de nivel. */
export type AbilityAaWave = {
  type?: 'magic' | 'true' | 'physical';
  ad?: number[];
  adSource?: 'total' | 'bonus';
  ap?: number[];
  apSource?: 'total' | 'bonus';
  /** Solo si las cargas de esta habilidad están al máximo (o son permanentes). */
  requiresMaxStacks?: boolean;
};

/** Mejora que se activa al alcanzar un nivel de campeón. Los umbrales se acumulan; aaWave se fusiona (el posterior pisa tipo/ratios). */
export type AbilityLevelThreshold = {
  level: number;
  name?: string;
  /** Casillas de alcance de ataque que se suman mientras el umbral está activo. */
  rangeBonus?: number;
  aaWave?: AbilityAaWave;
  /** Las cargas de esta habilidad se tratan como al máximo y no caducan. */
  permanentMaxStacks?: boolean;
};

/** Al usarla, reduce el daño que recibe el portador y/o un aliado. */
export type AbilityProtect = {
  name?: string;
  turns: number;
  /** % de reducción de daño recibido, por rango (100 = invulnerable). */
  damageReductionPct: number[];
  /** ally = el aliado objetivo; allyOrSelf = aliado si hay, si no el portador; ausente = portador. */
  target?: 'self' | 'ally' | 'allyOrSelf';
};

/** Cura al alcanzar el máximo de cargas temporales (% de una stat, p. ej. vida máx., y/o base plana). */
export type AbilityStackHeal = {
  selfRatios?: { stat: string; values: number[] }[];
  allyRatios?: { stat: string; values: number[] }[];
  alliesToo?: boolean;
  flat?: number[];
  flatByLevel?: boolean;
};

/** Cura al portador al derribar (plana por tramo y/o ratios). */
export type AbilityTakedownHeal = {
  flat?: number[];
  flatByLevel?: boolean;
  ratios?: { stat: string; values: number[] }[];
  /** Si es true, solo derribos de campeón o jugador. Por defecto false (cualquier eliminación). */
  champion?: boolean;
};

/** Segunda pasada del mismo daño con otro tipo. */
export type AbilityReturnStrike = {
  type: 'true' | 'magic' | 'physical';
};

/** Requisito de cargas de otra habilidad (por el nombre de esa habilidad). */
export type AbilityRequireStacks = {
  from: string;
  count: number;
  /** Si es false, no las gasta al activar. Por defecto true. En umbrales de fase suele ser false. */
  consume?: boolean;
};

/** Cargas permanentes en la ficha del jugador (clave ability:<nombre>). Sin tope salvo maxStacks de la habilidad (máx. 999). */
export type AbilityPermanentStacks = {
  /** +1 por cada campeón enemigo único alcanzado por una habilidad que dañe. Por defecto true si el objeto está. */
  onAbilityChampionHit?: boolean;
  /** También (o en su lugar) al derribar. */
  onTakedown?: boolean;
  /** Acumulaciones por derribo de campeón o jugador (por defecto 1). */
  takedownChampion?: number;
  /** Acumulaciones por derribo que no es campeón (p. ej. monstruo grande). Ausente = 0. */
  takedownOther?: number;
  /** Stat que concede cada acumulación (p. ej. atkSpePct). */
  stat?: string;
  /** Valor de esa stat por acumulación, por rango o tramo 1/6/11/16. */
  perStack?: number[];
  /** Si es true, perStack usa tramos de nivel 1/6/11/16. */
  byLevel?: boolean;
};

/** Esta habilidad concede cargas permanentes del contador de `from`. */
export type AbilityGrantPermanent = {
  from: string;
  /** Máximo de cargas que puede conceder este lanzamiento (p. ej. 1). Ausente = 1 por campeón único (y por derribo si onKill). */
  maxPerCast?: number;
  /** También +1 por cada derribo de súbdito/monstruo (no campeón ni jugador) con esta habilidad. */
  onKill?: boolean;
  /** Concede tantas cargas como las que este uso ha consumido (requireStacks). */
  perConsumedStack?: boolean;
};

/** N disparos independientes, cada uno con su CD (p. ej. las 6 patas de Urgot). */
export type AbilitySectorShots = {
  count: number;
  /** Turnos de CD de un disparo tras usarse, por rango o tramo. */
  cooldown: number[];
  /** Si es true, cooldown usa tramos de nivel 1/6/11/16. */
  byLevel?: boolean;
  /** 'aa' = al acertar un AA (por defecto); 'cast' = al usar la habilidad; 'both' = ambos. */
  trigger?: 'aa' | 'cast' | 'both';
  /** Turnos de bloqueo entre usos de cualquier sector, por rango. */
  gap?: number[];
  /** Etiqueta de cada sector (N, S, E, O…). */
  labels?: string[];
};

/** Al usarla, reinicia disparos por sector de `from`. */
export type AbilityResetSectorShots = {
  from: string;
  count: number;
  requiresChampionHit?: boolean;
};

/** Número de veces que se aplica el daño de la habilidad. */
export type AbilityStrikes = {
  count: number[];
  /** +1 golpe por cada este % de vel. ataque bonus. */
  perBonusAtkSpe?: number;
};

/** Marca aplicada al usarla; se detona con el siguiente AA y/o habilidad contra ese objetivo. */
export type AbilityMark = {
  turns: number;
  /** Por defecto 'both'. */
  detonateOn?: 'aa' | 'ability' | 'both';
  /** Si es true (por defecto), el daño de esta habilidad se aplica al detonar, no al lanzarla. */
  damageOnDetonate?: boolean;
  /** Si la detona una habilidad, restaura maná (plano por rango y/o el coste de esa habilidad). */
  refundMana?: { flat?: number[]; refundCost?: boolean };
  /** Las habilidades de daño distintas de esta aplican la marca a los alcanzados. */
  applyOnAbilityHit?: boolean;
  /** Nombre del estado de la marca. Ausente = el de la habilidad. */
  name?: string;
};

/** Buff temporal al usar cualquier habilidad (p. ej. +vel. ataque). */
export type AbilityOnAbilityUse = {
  turns: number;
  attackSpeed?: number[];
};

/** La habilidad se enciende al usarla y se apaga al volver a usarla (o al acabar turns). 0 = hasta desactivar. */
export type AbilityToggle = {
  turns: number[];
  /** Mientras está activo, el número de ataques del turno pasa a este valor (no se suma al de la ficha). */
  fixedAttacks?: number;
};

/** El siguiente AA cura y entra en CD. */
export type AbilityEmpoweredAa = {
  /** % de vida que cura, por tramo 1/6/11/16 o por rango. */
  healHpPct?: number[];
  hpSource?: 'max' | 'current' | 'missing' | 'bonus';
  /** Cura plana / ratios (además o en lugar de healHpPct). */
  heal?: AbilityStackHeal;
  /** Si es true, la cura se aplica por cada enemigo alcanzado (el principal es automático; el resto, a mano o al elegir zona). */
  healPerTarget?: boolean;
  /** Al dispararse, aplica el daño de esta habilidad al objetivo del AA. */
  applyAbilityDamage?: boolean;
  /** Turnos de CD tras dispararse, por tramo o rango. */
  cooldown: number[];
  byLevel?: boolean;
  /** Turnos que quita al CD al usar una habilidad. */
  reduceOnAbility?: number;
  /** Turnos que quita al CD al recibir una habilidad (botón o automático si se puede). */
  reduceOnStruck?: number;
  /** Turnos que quita al CD al acertar un AA (mientras no esté listo). */
  reduceOnAuto?: number;
  /** No se dispara si la vida actual supera este % de la máxima. */
  skipAboveHpPct?: number;
};

/** Se coloca al usarla y se detona después (daño y efectos de la habilidad). */
export type AbilityTrap = {
  turns: number;
  name?: string;
  /** Si es true, al colocar se aplica el daño y los efectos; «Detonar» es el segundo golpe. */
  applyOnPlace?: boolean;
  /** Efectos al detonar (si no está, se reutilizan los de la habilidad). */
  eruptEffect?: { name: string; values?: number[]; duration?: number[] }[];
  eruptEffectName?: string;
  eruptEffectDuration?: number;
  /** Si es false, «Detonar» no vuelve a tirar el daño de la habilidad (solo efectos). Por defecto true. */
  damageOnDetonate?: boolean;
};

/** Si la vida actual del objetivo es ≤ hpPct % de su máxima, este uso lo ejecuta (daño = lo que le queda). */
export type AbilityExecute = {
  hpPct: number;
  /** Al ejecutarlo con éxito, se puede aplicar un estado (miedo) a otros objetivos. */
  fear?: { name: string; turns: number; value?: number };
};

/** Daño extra = pct[rango]% × el número de cargas permanentes de `from`. type distinto = un segundo pulso (sin robo de vida). */
export type AbilityStackDamage = {
  from: string;
  /** Porcentaje por rango (25 = 25 % de las cargas). */
  pct: number[];
  type?: 'physical' | 'magic' | 'true';
  /** Si es true, pct usa tramos de nivel 1/6/11/16 (como la pasiva) en vez del rango de la habilidad. */
  byLevel?: boolean;
};

/** Robo de vida sobre el daño de la habilidad: efficacy 100 = 100 % de eficacia. */
export type AbilityLifeSteal = { efficacy: number };

/** Estado propio al usarla; stat/amount/pct aplican un bonus de combate mientras dura. */
export type AbilitySelfStatus = {
  name: string;
  turns: number;
  value?: number;
  /** Stat de la ficha que se modifica mientras dura el estado. */
  stat?: string;
  /** Cantidad plana (puede ser negativa). */
  amount?: number;
  /** % de la stat actual del portador (puede ser negativa; −30 = −30 %). */
  pct?: number;
  /** Mientras dura, el número de ataques del turno pasa a este valor (no se suma al de la ficha). */
  fixedAttacks?: number;
  /** % por rango (si está, sustituye a pct). */
  pctValues?: number[];
  /** Cantidad plana por rango (si está, sustituye a amount). */
  amountValues?: number[];
  /** Solo se aplica si la habilidad alcanza a un campeón o jugador. */
  requiresChampionHit?: boolean;
  /** Si es true, tampoco se puede recastear mientras el estado está activo. */
  blocksRecast?: boolean;
  /** Bonus adicionales (además de stat/amount/pct) mientras dura el estado. */
  stats?: AbilitySelfStatusStat[];
  /** % de reducción de daño recibido, por rango. */
  damageReductionValues?: number[];
  /** Se puede terminar antes (botón «Terminar»). */
  cancelable?: boolean;
  /** Si es false, no bloquea volver a usar la habilidad mientras dura el estado. Por defecto true. */
  blocksAbility?: boolean;
  /** Solo se aplica si el interruptor «Estoy en el área / rastro» está marcado. */
  requiresSelfInArea?: boolean;
  /** Sustituye turns según las acumulaciones permanentes de `from` (0 = hasta que acabe / muerte). */
  durationByStacks?: { from: string; thresholds: { stacks: number; turns: number }[] };
};

/** Un bonus de stat del estado propio. */
export type AbilitySelfStatusStat = {
  stat: string;
  amount?: number;
  pct?: number;
  amountValues?: number[];
  pctValues?: number[];
  ratios?: { stat: CastPoolStat; values: number[] }[];
};

export type AbilityInnateShield = {
  /** Base plana por rango (tramo en la pasiva). */
  flat?: number[];
  /** % de la stat por rango. */
  ratios: { stat: CastPoolStat; values: number[] }[];
  /** Turnos de CD tras romperse, por rango. */
  cooldown: number[];
  /** Turnos de CD que quita cada enemigo alcanzado por AA o habilidad (0,5…). */
  reducePerHit?: number;
};

export type AbilitySpellShield = { status: string; turns: number; breakTurns: number; learnedMultiplier: number };

/** Stats de escalado de castPool (las de las reglas de ítems). */
export const CAST_POOL_STATS = ['ad', 'bonusAd', 'baseAd', 'ap', 'hp', 'bonusHp', 'missingHp', 'armor', 'bonusArmor', 'mr', 'bonusMr', 'mana', 'bonusMana'] as const;
export type CastPoolStat = (typeof CAST_POOL_STATS)[number];
export type AbilityCastPool = {
  kind: 'shield' | 'heal';
  /** % de la stat por rango (60, 65, 70…). */
  ratios: { stat: CastPoolStat; values: number[] }[];
  /** Turnos que dura el escudo (vacío = hasta que se gaste). */
  turns?: number;
  /** Extra por cada campeón enemigo alcanzado: pct % de la stat del portador. */
  perChampionHit?: { stat: CastPoolStat; pct: number };
  /** ally = a los aliados elegidos como objetivo (no al portador). Ausente = al portador. */
  target?: 'self' | 'ally';
  /** Solo si alcanza a algún enemigo (Pluma resplandeciente). */
  requiresHit?: boolean;
  /** Además del portador, a los aliados que se elijan al usarla (círculo de curación). */
  alliesToo?: boolean;
  /** Base plana por rango (o por tramo de nivel con flatByLevel: 4 valores 1/6/11/16). */
  flat?: number[];
  flatByLevel?: boolean;
  /** Cura retrasada: se aplica al empezar el turno del portador tras N turnos (o con «Curar ahora»). */
  delayTurns?: number;
  /** Solo si alcanza a un campeón o jugador (más estricto que requiresHit). */
  requiresChampionHit?: boolean;
  /** A todos los aliados del bando (global). */
  allAllies?: boolean;
  /** Si el objetivo está por debajo de este % de vida máx., la cantidad se multiplica. */
  lowHpBonus?: { belowHpPct: number; multiplier: number };
  /** Solo si el portador marca que está en el área / la explosión. */
  requiresSelfInArea?: boolean;
  /** Solo si el estado propio de esta misma habilidad ya está activo. */
  requiresSelfStatus?: boolean;
};

/** Multiplicador de daño y/o ralentización si el objetivo está aislado. */
export type AbilityIsolated = {
  /** Multiplicador del daño (p. ej. 2.1). */
  multiplier?: number;
  /** Valor de ralentización (%) que sustituye al del efecto si está aislado. */
  slowPct?: number;
};

/** Huecos de evolución permanente por rango de esta habilidad (normalmente la R). */
export type AbilityEvolutions = { slots: number[] };

/** Forma evolucionada permanente: al evolucionarse, estos campos se fusionan sobre la base. */
export type AbilityEvolve = {
  name: string;
  description?: string;
  effect?: { name: string; values?: number[]; duration?: number[] }[];
  effectName?: string;
  effectDuration?: number;
  effectTarget?: 'self' | 'enemy';
  recast?: { times: number; turns: number };
  isolated?: AbilityIsolated;
  selfStatus?: AbilitySelfStatus;
  recastOnTakedown?: { times: number; turns: number; max?: number; champion?: boolean };
  armArmedAa?: boolean;
};

/** Siguiente AA a un campeón si está armado (se desarma al impactar). */
export type AbilityArmedAa = {
  type?: string;
  ad?: number[];
  ap?: number[];
  adSource?: 'total' | 'bonus';
  apSource?: 'total' | 'bonus';
  effectName?: string;
  effectDuration?: number;
  effect?: { name: string; values?: number[]; duration?: number[] }[];
  /** Al consumir el AA armado, termina el estado propio de esta habilidad. */
  endsSelfStatus?: boolean;
  /** % de la vida (hpSource) por rango. */
  hp?: number[];
  hpSource?: 'max' | 'current' | 'missing' | 'bonus';
  /** % adicional de esa vida por cada 100 de AP. */
  apPer100?: number;
  /** A partir de este nivel de campeón, el AA armado también golpea a enemigos cercanos. */
  explodeFromLevel?: number;
  /** Duración del AA armado al armarlo al usarla (turnos). Ausente = no caduca solo. */
  turns?: number;
  /** Número de AA armados. Ausente = 1. */
  charges?: number;
  /** Si es false, el estado/efecto se aplica en cada carga. Por defecto, solo en la última si hay más de una. */
  effectOnLastCharge?: boolean;
  /** Si es true, al usarla también aplica el daño de la habilidad (además de armar). Por defecto no. */
  applyDamageOnUse?: boolean;
};
/** % de reducción de CA y RM del objetivo al acertar. */
export type AbilityResistShred = {
  pct: number[];
  turns: number;
  /** Ausente = sí. */
  armor?: boolean;
  /** Ausente = sí. */
  mr?: boolean;
};

/** Daño extra de los AA mientras el estado / interruptor / buff de esta habilidad está activo. */
export type AbilityAaOnHit = {
  /** % de la vida (hpSource) por rango. */
  hp?: number[];
  hpSource?: 'max' | 'current' | 'missing' | 'bonus';
  /** % adicional de esa vida por cada 100 de AP (1.5 = 1,5 %). */
  apPer100?: number;
  type?: string;
  /** Ratio de AD por rango (0.03 = 3 % AD). */
  ad?: number[];
  adSource?: 'total' | 'bonus';
  /** Si es true, se aplica con la habilidad aprendida, sin hacer falta estado / interruptor / buff. */
  always?: boolean;
  /** Acumulaciones por objetivo que multiplican el daño (1 + cargas). */
  perTargetStacks?: { turns: number; max?: number };
  /** Ratio de AP por rango (0.20 = 20 % AP). */
  ap?: number[];
  apSource?: 'total' | 'bonus';
};

/** Coste extra = amount × acumulaciones actuales (se ganan al usar, máx. max, duración turns). */
export type AbilityCostStacks = { amount: number; turns: number; max: number };

/** Estado zombi / explosión al morir. */
export type AbilityDeathBurst = {
  turns: number;
  name?: string;
  stat?: string;
  pct?: number;
  amount?: number;
};

/** El daño de esta habilidad se multiplica si el objetivo está bajo de vida. */
export type AbilityDamageLowHp = {
  belowHpPct: number;
  multiplier: number;
  /** Por encima del umbral: +0…maxBonusPct % según la vida faltante. */
  missingMaxBonusPct?: number;
};


/** Valor del rango (1-based); si la lista es más corta, el último. */
export function rankValue(list: number[] | undefined, rank: number): number | undefined {
  if (!list || list.length === 0) return undefined;
  return list[Math.max(0, Math.min(list.length, Math.max(1, Math.floor(rank))) - 1)];
}

const cut = (text: string) => text.slice(0, 80);
export const abilityChargesSource = (name: string): string => cut(`charges:${abilityStackKey(name)}`);
export const abilityStacksSource = (name: string, targetId?: string): string =>
  cut(targetId ? `stacks:${abilityStackKey(name)}@${targetId}` : `stacks:${abilityStackKey(name)}`);
export const abilityTrailSource = (name: string): string => cut(`trail:${abilityStackKey(name)}`);
export const abilityTrail = (bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined =>
  (bonuses ?? []).find(bonus => bonus.source === abilityTrailSource(name) && (bonus.turns == null || bonus.turns > 0));
export const abilityBuffSource = (name: string): string => cut(`buff:${abilityStackKey(name)}`);
/** Bonus de stats del buff (velocidad de ataque): una stat normal, para que sume al total. */
export const abilityBuffStatSource = (name: string): string => cut(`buffstat:${abilityStackKey(name)}`);
/** Bonus de stat del estado propio (p. ej. −30 % vel. movimiento): una stat normal, para que sume al total. */
export const abilitySelfStatSource = (name: string): string => cut(`selfstat:${abilityStackKey(name)}`);
/** Escudo de castPool: marcador 'buff' con amount = escudo dado; al caducar se quita lo que quede. */
export const abilityShieldSource = (name: string): string => cut(`shield:${abilityStackKey(name)}`);
/** Bonus extra al romperse el escudo de hechizos (una stat normal con turnos). */
export const abilityBreakSource = (name: string): string => cut(`break:${abilityStackKey(name)}`);
/** Recast disponible: marcador 'buff' con amount = recasts que quedan, turns = ventana. */
export const abilityRecastSource = (name: string): string => cut(`recast:${abilityStackKey(name)}`);
export const abilityRecast = (bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined =>
  (bonuses ?? []).find(bonus => bonus.source === abilityRecastSource(name) && bonus.amount > 0);

/** Evolución permanente: marcador 'buff' sin turnos (source evolve:<habilidad>). */
export const abilityEvolveSource = (name: string): string => cut(`evolve:${abilityStackKey(name)}`);
export const isAbilityEvolved = (bonuses: CombatBonus[] | undefined, name: string): boolean =>
  (bonuses ?? []).some(bonus => bonus.source === abilityEvolveSource(name) && bonus.amount > 0);

export const abilityArmedAaSource = (name: string): string => cut(`armedAa:${abilityStackKey(name)}`);
export const abilityArmedAaMarker = (bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined =>
  (bonuses ?? []).find(bonus => bonus.source === abilityArmedAaSource(name) && bonus.amount > 0);

/** Huecos de evolución disponibles según la habilidad que los concede y su rango. */
export function evolutionSlotCount(rows: { ability: Ability; rank: number }[]): number {
  for (const row of rows) {
    const slots = row.ability.mechanics?.evolutions?.slots;
    if (slots?.length) return rankValue(slots, row.rank) ?? 0;
  }
  return 0;
}

export function evolvedAbilityCount(bonuses: CombatBonus[] | undefined, rows: { name: string }[]): number {
  return rows.filter(row => isAbilityEvolved(bonuses, row.name)).length;
}

/** Fusiona la forma evolucionada sobre la habilidad (la base conserva el nombre). */
export function applyEvolve(ability: Ability, evolved: boolean): Ability {
  const ev = ability.mechanics?.evolve;
  if (!evolved || !ev) return ability;
  const mechanics = { ...(ability.mechanics ?? {}) };
  if (ev.recast) mechanics.recast = ev.recast;
  if (ev.isolated) mechanics.isolated = { ...mechanics.isolated, ...ev.isolated };
  if (ev.selfStatus) mechanics.selfStatus = ev.selfStatus;
  if (ev.recastOnTakedown) mechanics.recastOnTakedown = ev.recastOnTakedown;
  if (ev.armArmedAa) mechanics.armArmedAa = true;
  const next: Ability = { ...ability, mechanics };
  if (ev.description) next.description = ev.description;
  if (ev.effect?.length) next.effect = ev.effect;
  if (ev.effectName) next.effectName = ev.effectName;
  if (typeof ev.effectDuration === 'number') next.effectDuration = ev.effectDuration;
  if (ev.effectTarget === 'enemy' || ev.effectTarget === 'self') next.effectTarget = ev.effectTarget;
  return next;
}

export function grantAbilityRecast(
  bonuses: CombatBonus[],
  name: string,
  recast: { times: number; turns: number; max?: number; champion?: boolean },
  newId: () => string,
  label?: string,
): CombatBonus[] {
  const source = abilityRecastSource(name);
  const existing = abilityRecast(bonuses, name);
  const amount = Math.min(recast.max ?? 999, (existing?.amount ?? 0) + recast.times);
  const turns = recast.turns > 0 ? recast.turns : existing?.turns;
  return [
    ...bonuses.filter(bonus => bonus.source !== source),
    { id: newId(), stat: 'buff', amount, ...(turns ? { turns } : {}), source, label: (label ?? name).slice(0, 80) },
  ];
}

export function armAbilityArmedAa(
  bonuses: CombatBonus[],
  name: string,
  newId: () => string,
  label?: string,
  turns?: number,
  charges?: number,
): CombatBonus[] {
  const source = abilityArmedAaSource(name);
  const amount = Math.max(1, Math.floor(charges ?? 1));
  return [
    ...bonuses.filter(bonus => bonus.source !== source),
    { id: newId(), stat: 'armed', amount, ...(turns && turns > 0 ? { turns } : {}), source, label: (label ?? name).slice(0, 80) },
  ];
}

export const abilityCostStackSource = (name: string): string => cut(`costStacks:${abilityStackKey(name)}`);
export function abilityCostStackCount(bonuses: CombatBonus[] | undefined, name: string): number {
  const marker = (bonuses ?? []).find(bonus => bonus.source === abilityCostStackSource(name) && bonus.amount > 0);
  return marker?.amount ?? 0;
}

export function stackedAbilityCost(base: number, bonuses: CombatBonus[] | undefined, name: string, stacks: AbilityCostStacks | undefined): number {
  if (!stacks) return base;
  return base + stacks.amount * abilityCostStackCount(bonuses, name);
}

export function gainAbilityCostStack(
  bonuses: CombatBonus[],
  name: string,
  stacks: AbilityCostStacks,
  newId: () => string,
  label?: string,
): CombatBonus[] {
  const source = abilityCostStackSource(name);
  const next = Math.min(stacks.max, abilityCostStackCount(bonuses, name) + 1);
  return [
    ...bonuses.filter(bonus => bonus.source !== source),
    { id: newId(), stat: 'buff', amount: next, turns: stacks.turns, source, label: (label ?? name).slice(0, 80) },
  ];
}

export const abilityDeathBurstSource = (name: string): string => cut(`deathBurst:${abilityStackKey(name)}`);
export const abilityDeathBurst = (bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined =>
  (bonuses ?? []).find(bonus => bonus.source === abilityDeathBurstSource(name) && bonus.amount > 0);

export const abilityResistShredSource = (name: string): string => cut(`shred:${abilityStackKey(name)}`);

/** ¿El on-hit de AA está activo? Requiere rango ≥ 1. `always` = sin interruptor, no «sin aprender». */
export function abilityAaOnHitActive(bonuses: CombatBonus[] | undefined, name: string, onHit: AbilityAaOnHit | undefined, rank: number): boolean {
  if (rank < 1) return false;
  if (onHit?.always) return true;
  const self = abilitySelfStatSource(name);
  return !!(abilityToggle(bonuses, name) || abilityBuff(bonuses, name) || (bonuses ?? []).some(bonus => bonus.source === self || (bonus.source ?? '').startsWith(`${self}:`)));
}

export const abilityAaOnHitStackSource = (name: string, targetId: string): string =>
  cut(`aahit:${abilityStackKey(name)}:${targetId}`);

export const abilitySelfDrSource = (name: string): string => cut(`selfdr:${abilityStackKey(name)}`);
export const abilityStackMaxStatusSource = (name: string): string => cut(`maxst:${abilityStackKey(name)}`);

export function activeLevelThresholds(thresholds: AbilityLevelThreshold[] | undefined, level: number): AbilityLevelThreshold[] {
  return (thresholds ?? []).filter(entry => level >= entry.level).sort((a, b) => a.level - b.level);
}

export function mergedAaWave(thresholds: AbilityLevelThreshold[] | undefined, level: number): AbilityAaWave | undefined {
  let wave: AbilityAaWave | undefined;
  for (const entry of activeLevelThresholds(thresholds, level)) {
    if (entry.aaWave) wave = { ...(wave ?? {}), ...entry.aaWave };
  }
  return wave;
}

export function totalRangeBonus(thresholds: AbilityLevelThreshold[] | undefined, level: number): number {
  return activeLevelThresholds(thresholds, level).reduce((sum, entry) => sum + (entry.rangeBonus ?? 0), 0);
}

export function hasPermanentMaxStacks(thresholds: AbilityLevelThreshold[] | undefined, level: number): boolean {
  return activeLevelThresholds(thresholds, level).some(entry => entry.permanentMaxStacks === true);
}

export function incomingDamageReductionPct(bonuses: CombatBonus[] | undefined): number {
  const total = (bonuses ?? []).filter(bonus => (bonus.source ?? '').startsWith('selfdr:')).reduce((sum, bonus) => sum + (Number(bonus.amount) || 0), 0);
  return Math.max(0, Math.min(100, total));
}

export function aaOnHitDamage(onHit: AbilityAaOnHit, rank: number, ap: number, hpValue: number, ad = 0): number {
  const basePct = rankValue(onHit.hp, rank) ?? 0;
  const extraPct = onHit.apPer100 ? onHit.apPer100 * ap / 100 : 0;
  const hpAmt = hpValue * (basePct + extraPct) / 100;
  const adAmt = ad * (rankValue(onHit.ad, rank) ?? 0);
  const apAmt = ap * (rankValue(onHit.ap, rank) ?? 0);
  const amount = hpAmt + adAmt + apAmt;
  return amount > 0 ? Math.round(amount) : 0;
}

export function abilityStrikeCount(strikes: AbilityStrikes, rank: number, bonusAtkSpePct: number): number {
  const base = rankValue(strikes.count, rank) ?? 1;
  const extra = strikes.perBonusAtkSpe && strikes.perBonusAtkSpe > 0 ? Math.floor(Math.max(0, bonusAtkSpePct) / strikes.perBonusAtkSpe) : 0;
  return Math.max(1, base + extra);
}

export function resolveSelfStatusTurns(status: AbilitySelfStatus, stacks: number): number {
  let turns = status.turns;
  const thresholds = status.durationByStacks?.thresholds;
  if (thresholds?.length) {
    for (const entry of [...thresholds].sort((a, b) => a.stacks - b.stacks)) {
      if (stacks >= entry.stacks) turns = entry.turns;
    }
  }
  return turns;
}

export function sectorShotTrigger(shots: AbilitySectorShots): 'aa' | 'cast' | 'both' {
  return shots.trigger ?? 'aa';
}

export const sectorGapSource = (name: string): string => cut(`shotgap:${abilityStackKey(name)}`);

/** Multiplicador del daño según la vida actual del objetivo. */
export function damageLowHpMultiplier(config: AbilityDamageLowHp, current: number, max: number): number {
  if (!max) return 1;
  const pct = (current / max) * 100;
  if (pct < config.belowHpPct) return config.multiplier;
  if (!config.missingMaxBonusPct) return 1;
  const missing = Math.max(0, Math.min(100, 100 - pct)) / 100;
  return 1 + (config.missingMaxBonusPct / 100) * missing;
}


/** Quita turns turnos a la recarga de las cargas; si llega a 0 recupera 1 carga. null si no hay recarga en curso. */
export function reduceChargeRecharge(bonuses: CombatBonus[], ability: Ability, name: string, turns: number): { bonuses: CombatBonus[]; before: number; after: number; recharged: boolean } | null {
  const state = abilityCharges(ability, bonuses, name);
  if (!state?.marker || !state.recharge || state.left >= state.max || turns <= 0) return null;
  const left = state.recharge - turns;
  const marker: CombatBonus = { ...state.marker };
  let recharged = false;
  if (left <= 0) {
    recharged = true;
    marker.amount = Math.min(state.max, state.marker.amount + 1);
    if (marker.amount < state.max && marker.rechargeEvery) marker.recharge = marker.rechargeEvery;
    else delete marker.recharge;
  } else marker.recharge = left;
  return { bonuses: bonuses.map(bonus => (bonus === state.marker ? marker : bonus)), before: state.recharge, after: Math.max(0, left), recharged };
}
/** Id / efecto base de las reglas de una habilidad en el motor de efectos (a-z0-9-, como los de ítems: vale para el CD por objetivo). */
export const abilityRuleBase = (name: string): string =>
  `ability-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`.slice(0, 60).replace(/-+$/, '') || 'ability';

export function abilityCharges(ability: Ability, bonuses: CombatBonus[] | undefined, name = ability.name): { left: number; max: number; recharge?: number; marker?: CombatBonus } | null {
  const charges = ability.mechanics?.charges;
  if (!charges) return null;
  const marker = (bonuses ?? []).find(bonus => bonus.source === abilityChargesSource(name));
  return { left: marker ? marker.amount : charges.start, max: charges.max, recharge: marker?.recharge, marker };
}

export function abilityStacks(bonuses: CombatBonus[] | undefined, name: string, targetId?: string): { count: number; turns?: number; marker?: CombatBonus } {
  const marker = (bonuses ?? []).find(bonus => bonus.source === abilityStacksSource(name, targetId));
  return { count: marker ? marker.amount : 0, turns: marker?.turns, marker };
}

export function abilityBuff(bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined {
  return (bonuses ?? []).find(bonus => bonus.source === abilityBuffSource(name));
}

/** Compara nombres de habilidad para el contador compartido (misma clave que el marcador de cargas). */
export const sameAbilityName = (a: string, b: string): boolean => abilityStackKey(a) === abilityStackKey(b);

/** Marcador de combate de las cargas permanentes (campeones/NPC: solo duran el combate; sin turns = no caduca). */
export const permanentAbilityStackSource = (name: string): string => cut(`perm:${abilityStackKey(name)}`);

/** Lee las cargas permanentes: en jugadores, players.stacks[ability:<nombre>]; si no, el marcador de combate. */
export function readPermanentAbilityStacks(options: {
  name: string;
  playerStacks?: Record<string, number>;
  bonuses?: CombatBonus[];
}): number {
  const { name, playerStacks, bonuses } = options;
  if (playerStacks) {
    const value = playerStacks[abilityStackKey(name)];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
    return 0;
  }
  const marker = (bonuses ?? []).find(bonus => bonus.source === permanentAbilityStackSource(name));
  return marker && Number.isFinite(marker.amount) && marker.amount > 0 ? Math.trunc(marker.amount) : 0;
}

/** Daño extra por cargas: pct % × stacks, redondeado al más cercano. 0 si no hay. */
export function stackDamageAmount(pct: number[] | undefined, rank: number, stacks: number): number {
  const value = rankValue(pct, rank);
  if (value == null || !stacks) return 0;
  return Math.round((value / 100) * stacks);
}

export const abilityToggleSource = (name: string): string => cut(`toggle:${abilityStackKey(name)}`);
export const abilityFixedAttacksSource = (name: string): string => cut(`atk:${abilityStackKey(name)}`);
export const sectorShotSource = (name: string, index: number): string => cut(`shot:${abilityStackKey(name)}:${index}`);

export const abilityToggle = (bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined =>
  (bonuses ?? []).find(bonus => bonus.source === abilityToggleSource(name));

/** Valor configurado de «número de ataques fijo» (interruptor o estado propio). */
export function abilityFixedAttacks(mechanics: AbilityMechanics | undefined): number | undefined {
  const value = mechanics?.toggle?.fixedAttacks ?? mechanics?.selfStatus?.fixedAttacks;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

export const empoweredAaSource = (name: string): string => cut(`emp:${abilityStackKey(name)}`);
export const abilityTrapSource = (name: string): string => cut(`trap:${abilityStackKey(name)}`);

export const empoweredAaMarker = (bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined =>
  (bonuses ?? []).find(bonus => bonus.source === empoweredAaSource(name));

export const abilityTrap = (bonuses: CombatBonus[] | undefined, name: string): CombatBonus | undefined =>
  (bonuses ?? []).find(bonus => bonus.source === abilityTrapSource(name));

export function empoweredAaState(bonuses: CombatBonus[] | undefined, name: string): { ready: boolean; turns?: number } {
  const marker = empoweredAaMarker(bonuses, name);
  const left = typeof marker?.turns === 'number' ? marker.turns : 0;
  return left > 0 ? { ready: false, turns: left } : { ready: true };
}

export function startEmpoweredAaCooldown(bonuses: CombatBonus[], name: string, emp: AbilityEmpoweredAa, tier: number, newId: () => string): { bonuses: CombatBonus[]; turns: number } {
  const turns = rankValue(emp.cooldown, tier) ?? 0;
  const source = empoweredAaSource(name);
  const next = bonuses.filter(bonus => bonus.source !== source);
  if (turns > 0) next.push({ id: newId(), stat: 'buff', amount: 1, turns, source, label: name.slice(0, 80) });
  return { bonuses: next, turns };
}

export function reduceEmpoweredAaCooldown(bonuses: CombatBonus[], name: string, turns: number): { bonuses: CombatBonus[]; before: number; after: number; ready: boolean } | null {
  if (turns <= 0) return null;
  const marker = empoweredAaMarker(bonuses, name);
  if (!marker || typeof marker.turns !== 'number' || marker.turns <= 0) return null;
  const after = Math.max(0, marker.turns - turns);
  const next = bonuses.filter(bonus => bonus.source !== marker.source);
  if (after > 0) next.push({ ...marker, turns: after });
  return { bonuses: next, before: marker.turns, after, ready: after === 0 };
}

/** Disparos listos (sin marcador o con carga) y la recarga más cercana. */
export function sectorShotState(bonuses: CombatBonus[] | undefined, name: string, count: number): { ready: number; nextRecharge?: number } {
  const list = bonuses ?? [];
  let ready = 0;
  let next: number | undefined;
  for (let index = 0; index < count; index++) {
    const marker = list.find(bonus => bonus.source === sectorShotSource(name, index));
    const onCd = !!marker && (marker.amount < 1 || !!marker.recharge);
    if (!onCd) ready += 1;
    else if (typeof marker?.recharge === 'number' && (next == null || marker.recharge < next)) next = marker.recharge;
  }
  return { ready, ...(next != null ? { nextRecharge: next } : {}) };
}

/** Gasta el primer disparo listo y le pone su CD. null si no hay ninguno. */
export function spendSectorShot(bonuses: CombatBonus[], name: string, count: number, cooldown: number, newId: () => string, preferred?: number, labels?: string[]): { bonuses: CombatBonus[]; index: number; readyAfter: number; cooldown: number } | null {
  if (count < 1 || cooldown < 1) return null;
  const state = sectorShotState(bonuses, name, count);
  if (state.ready <= 0) return null;
  const isReady = (index: number) => {
    const marker = bonuses.find(bonus => bonus.source === sectorShotSource(name, index));
    return !(marker && (marker.amount < 1 || !!marker.recharge));
  };
  let index = typeof preferred === 'number' && preferred >= 0 && preferred < count && isReady(preferred) ? preferred : -1;
  if (index < 0) {
    for (let i = 0; i < count; i++) {
      if (isReady(i)) { index = i; break; }
    }
  }
  if (index < 0 || index >= count) return null;
  const source = sectorShotSource(name, index);
  const tag = labels?.[index] ? labels[index] : String(index + 1);
  const marker: CombatBonus = {
    id: bonuses.find(bonus => bonus.source === source)?.id ?? newId(),
    stat: 'charges',
    amount: 0,
    maxStacks: 1,
    recharge: cooldown,
    rechargeEvery: cooldown,
    source,
    label: cut(`${name} ${tag}`),
  };
  const next = [...bonuses.filter(bonus => bonus.source !== source), marker];
  return { bonuses: next, index, readyAfter: state.ready - 1, cooldown };
}

/** Quita el CD de hasta `howMany` disparos (los que menos les queda). */
export function resetSectorShots(bonuses: CombatBonus[], name: string, count: number, howMany: number): { bonuses: CombatBonus[]; reset: number; labels: string[] } {
  if (howMany < 1 || count < 1) return { bonuses, reset: 0, labels: [] };
  const onCd: { index: number; recharge: number; source: string; label?: string }[] = [];
  for (let index = 0; index < count; index++) {
    const source = sectorShotSource(name, index);
    const marker = bonuses.find(bonus => bonus.source === source);
    if (marker && (marker.amount < 1 || !!marker.recharge)) {
      onCd.push({ index, recharge: typeof marker.recharge === 'number' ? marker.recharge : 99, source, label: marker.label });
    }
  }
  onCd.sort((a, b) => a.recharge - b.recharge);
  const take = onCd.slice(0, howMany);
  if (!take.length) return { bonuses, reset: 0, labels: [] };
  const drop = new Set(take.map(entry => entry.source));
  return { bonuses: bonuses.filter(bonus => !drop.has(bonus.source ?? '')), reset: take.length, labels: take.map(entry => entry.label || String(entry.index + 1)) };
}

/** ¿La vida actual está en o por debajo de hpPct % de la máxima? */
export function isBelowExecuteThreshold(hp: { current: number; max?: number }, hpPct: number): boolean {
  if (!hpPct || !(hp.max && hp.max > 0)) return false;
  return hp.current <= (hpPct / 100) * hp.max + 1e-9;
}

export const stacksOnAa = (config: AbilityStacks): boolean => config.onAa !== false;
export const stacksOnAbilityHit = (config: AbilityStacks): boolean => config.onAbilityHit === true;

const CROWD_CONTROL_KEYS = new Set([
  'aturdimiento', 'lanzado al aire', 'lanzado por los aires', 'levantado',
  'enraizamiento', 'silencio', 'ralentizacion', 'encantado', 'encanto',
  'miedo', 'ceguera', 'provocacion', 'supresion', 'empuje', 'empujado', 'derribo',
  'knockback', 'knock up', 'knockup', 'stun', 'root', 'silence', 'slow', 'charm',
  'fear', 'taunt', 'suppression', 'blind', 'airborne',
]);

const normalizeEffectKey = (name: string): string =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** True si el nombre del estado es un control de masas conocido (aturdimiento, lanzado al aire, etc.). */
export function isCrowdControlEffectName(name: string): boolean {
  return CROWD_CONTROL_KEYS.has(normalizeEffectKey(name));
}

export const abilityStackHealCdSource = (name: string): string => cut(`stackHealCd:${abilityStackKey(name)}`);

export function abilityStackHealOnCooldown(bonuses: CombatBonus[] | undefined, name: string): boolean {
  return (bonuses ?? []).some(bonus => bonus.source === abilityStackHealCdSource(name) && (bonus.turns ?? 0) > 0);
}

/**
 * Cargas que exige una habilidad para activarse: las suyas (stacks.required) o las de otra (requireStacks).
 * consume = true por defecto.
 */
export function stacksRequirement(mechanics: AbilityMechanics | undefined, ownName: string): { name: string; count: number; consume: boolean } | null {
  if (mechanics?.requireStacks) {
    const from = mechanics.requireStacks.from.trim();
    if (!from) return null;
    return { name: from, count: mechanics.requireStacks.count, consume: mechanics.requireStacks.consume !== false };
  }
  if (mechanics?.stacks?.required) return { name: ownName, count: mechanics.stacks.required, consume: true };
  return null;
}

/**
 * ¿Este impacto debe sumar 1 carga al contador de `ownerName`?
 * usedName / usedRequires: la habilidad que se está usando; si consume este mismo contador, no suma en este uso.
 */
export function shouldGainAbilityStack(options: {
  config: AbilityStacks;
  ownerName: string;
  trigger: 'on-hit' | 'on-ability';
  abilityOnHit: boolean;
  damaged: boolean;
  usedName?: string;
  usedRequires?: { name: string };
}): boolean {
  const { config, ownerName, trigger, abilityOnHit, damaged, usedRequires } = options;
  if (usedRequires && sameAbilityName(usedRequires.name, ownerName)) return false;
  if (trigger === 'on-hit') return stacksOnAa(config);
  // «Aplica efectos de impacto» sigue sumando (compatibilidad: como un impacto).
  if (abilityOnHit) return true;
  if (!stacksOnAbilityHit(config)) return false;
  if (config.requiresDamage === false) return true;
  return damaged;
}

/** Bonus de stat del estado propio: amount plano + pct % de la stat actual, redondeado al más cercano. null si no hay o queda 0. */
export function selfStatusStatBonus(status: AbilitySelfStatus, current: number): { amount: number; text: string } | null {
  if (!status.stat) return null;
  let raw = 0;
  const parts: string[] = [];
  if (status.amount) {
    raw += status.amount;
    parts.push(`${status.amount}`);
  }
  if (status.pct) {
    const add = (status.pct / 100) * current;
    raw += add;
    parts.push(`${status.pct}% de ${Math.round(current * 1000) / 1000} = ${Math.round(add * 1000) / 1000}`);
  }
  const amount = Math.round(raw);
  if (!amount) return null;
  return { amount, text: parts.join(' + ') + (parts.length > 1 || status.pct ? ` → ${amount}` : ` → ${amount}`) };
}

/** Gasta 1 carga: si estaban llenas, empieza la cuenta de recarga del rango. */
export function spendAbilityCharge(bonuses: CombatBonus[], ability: Ability, name: string, rank: number, newId: () => string): { bonuses: CombatBonus[]; before: number; after: number; max: number; recharge?: number } | null {
  const state = abilityCharges(ability, bonuses, name);
  const config = ability.mechanics?.charges;
  if (!state || !config || state.left <= 0) return null;
  const every = rankValue(config.recharge, rank);
  const recharge = state.recharge ?? every;
  const marker: CombatBonus = {
    id: state.marker?.id ?? newId(),
    stat: 'charges',
    amount: state.left - 1,
    maxStacks: config.max,
    ...(recharge ? { recharge } : {}),
    ...(every ? { rechargeEvery: every } : {}),
    source: abilityChargesSource(name),
    label: cut(name),
  };
  return { bonuses: [...bonuses.filter(bonus => bonus.source !== marker.source), marker], before: state.left, after: state.left - 1, max: config.max, recharge };
}

/** +1 carga (refresca la duración). null si no gana (buff activo o sin configurar). */
export function gainAbilityStack(bonuses: CombatBonus[], ability: Ability, name: string, newId: () => string, targetId?: string): { bonuses: CombatBonus[]; before: number; after: number; max: number; turns: number } | null {
  const config = ability.mechanics?.stacks;
  if (!config) return null;
  // Mientras el buff de la propia habilidad está activo no se acumulan cargas.
  if (abilityBuff(bonuses, name)) return null;
  const key = config.countersPerTarget ? targetId : undefined;
  const current = abilityStacks(bonuses, name, key);
  const after = Math.min(config.max, current.count + 1);
  const marker: CombatBonus = {
    id: current.marker?.id ?? newId(),
    stat: 'stacks',
    amount: after,
    maxStacks: config.max,
    turns: config.turns,
    source: abilityStacksSource(name, key),
    label: cut(key ? `${name}` : name),
  };
  return { bonuses: [...bonuses.filter(bonus => bonus.source !== marker.source), marker], before: current.count, after, max: config.max, turns: config.turns };
}

/** Estado aplicable de la pasiva: su primer efecto (nombre, valor del rango como % entero, duración). */
export function passiveStatus(passive: Ability | undefined, rank = 1): { name: string; value?: number; duration: number; source: string } | null {
  const effect = passive?.effect?.find(entry => entry.name?.trim());
  if (!passive || !effect) return null;
  const raw = rankValue(effect.values, rank);
  const pct = typeof raw === 'number' ? Math.round(Math.abs(raw) <= 1 ? raw * 100 : raw) : undefined;
  const duration = Math.max(1, Math.trunc(rankValue(effect.duration, rank) ?? 1));
  return {
    name: effect.name.trim(),
    ...(pct && pct >= 1 && pct <= 99 ? { value: pct } : {}),
    duration,
    source: abilityStackKey(passive.name),
  };
}

/** Resumen corto para la ficha / el modal. */
export function mechanicsSummary(mechanics: AbilityMechanics | undefined): string[] {
  if (!mechanics) return [];
  const list = (values: number[] | undefined) => (values ?? []).join(' / ');
  const out: string[] = [];
  if (mechanics.charges) out.push(`Cargas: empieza con ${mechanics.charges.start} (máx. ${mechanics.charges.max}); recarga 1 cada ${list(mechanics.charges.recharge) || '—'} t.`);
  if (mechanics.stacks) {
    const triggers = [stacksOnAa(mechanics.stacks) ? 'al AA' : '', stacksOnAbilityHit(mechanics.stacks) ? (mechanics.stacks.requiresDamage === false ? 'al acertar una habilidad' : 'al acertar una habilidad que dañe') : '', mechanics.stacks.onChampionTakedown ? 'al derribar un campeón' : '', mechanics.stacks.onNonChampionKill ? 'al derribar un no campeón' : '', mechanics.stacks.onChampionCc ? 'al aplicar control a un campeón' : ''].filter(Boolean).join(' / ') || 'sin disparador';
    const extra = [
      mechanics.stacks.perTarget ? '1 por enemigo alcanzado' : '',
      mechanics.stacks.stat && mechanics.stacks.perStack?.length ? `+${list(mechanics.stacks.perStack)} ${mechanics.stacks.stat} por carga` : '',
      mechanics.stacks.consumeAtMax ? 'al máximo las gasta' : '',
      mechanics.stacks.onMaxHeal ? `al máximo cura${mechanics.stacks.onMaxHeal.flat?.length ? ` ${mechanics.stacks.onMaxHeal.flat.join(' / ')}${mechanics.stacks.onMaxHeal.flatByLevel ? ' (tramo de nivel)' : ''}` : ''}` : '',
      mechanics.stacks.onMaxStatus ? `al máximo «${mechanics.stacks.onMaxStatus.name ?? 'estado'}»` : '',
      mechanics.stacks.onMaxCooldown ? `intervalo de cura ${mechanics.stacks.onMaxCooldown} t.` : '',
      mechanics.stacks.armArmedAaAtMax ? `al máximo arma el AA${mechanics.stacks.armArmedAaTurns ? ` ${mechanics.stacks.armArmedAaTurns} t.` : ''}` : '',
    ].filter(Boolean);
    out.push(`Cargas ${triggers}: duran ${mechanics.stacks.turns} t. (se refrescan), máx. ${mechanics.stacks.max}${extra.length ? `; ${extra.join('; ')}` : ''}${mechanics.stacks.required ? `; se activa con ${mechanics.stacks.required} (las gasta)` : ''}`);
  }
  if (mechanics.requireStacks) out.push(`Requiere ${mechanics.requireStacks.count} cargas de «${mechanics.requireStacks.from}»${mechanics.requireStacks.consume === false ? ' (no las gasta)' : ' (las gasta)'}`);
  if (mechanics.permanentStacks) {
    const perm = mechanics.permanentStacks;
    const bits = [
      perm.onAbilityChampionHit === false ? '' : '+1 por campeón enemigo único alcanzado con una habilidad que dañe',
      perm.onTakedown ? `+${perm.takedownChampion ?? 1} al derribar campeón${perm.takedownOther ? ` / +${perm.takedownOther} si no es campeón` : ''}` : '',
      perm.stat && perm.perStack?.length ? `+${list(perm.perStack)} ${perm.stat} por acumulación${perm.byLevel ? ' (tramos 1/6/11/16)' : ''}` : '',
    ].filter(Boolean);
    out.push(`Cargas permanentes (ficha)${bits.length ? `: ${bits.join('; ')}` : ''}`);
  }
  if (mechanics.grantPermanent) {
    const grant = mechanics.grantPermanent;
    const bits = [grant.maxPerCast ? `máx. ${grant.maxPerCast} por lanzamiento` : (grant.perConsumedStack ? '1 por carga consumida' : '1 por campeón único'), grant.onKill ? 'también al derribar súbditos/monstruos' : '', grant.perConsumedStack ? 'tantas como cargas consumidas' : ''].filter(Boolean);
    out.push(`Concede cargas permanentes de «${grant.from}» (${bits.join('; ')})`);
  }
  if (mechanics.stackDamage) {
    const dmg = mechanics.stackDamage;
    const typ = dmg.type === 'physical' ? 'físico' : dmg.type === 'true' ? 'verdadero' : 'mágico';
    out.push(`Daño extra ${typ}: ${list(dmg.pct)}% de las cargas permanentes de «${dmg.from}»${dmg.byLevel ? ' (tramos 1/6/11/16)' : ''}`);
  }
  if (mechanics.sectorShots) {
    const shots = mechanics.sectorShots;
    const when = shots.trigger === 'cast' ? 'al usar la habilidad' : shots.trigger === 'both' ? 'al acertar un AA o al usar la habilidad' : 'al acertar un AA';
    out.push(`Disparos por sector: ${shots.count}, CD ${list(shots.cooldown) || '—'} t. cada uno${shots.byLevel ? ' (tramos 1/6/11/16)' : ''}${shots.gap?.length ? `; ${list(shots.gap)} t. entre usos` : ''}${shots.labels?.length ? ` (${shots.labels.join(', ')})` : ''}; ${when}`);
  }
  if (mechanics.toggle) {
    const fixed = mechanics.toggle.fixedAttacks ? `; número de ataques fijo ${mechanics.toggle.fixedAttacks}` : '';
    out.push(`Interruptor: duración ${list(mechanics.toggle.turns) || '—'} t. (0 = hasta desactivar)${fixed}`);
  }
  if (mechanics.execute) {
    const exe = mechanics.execute;
    out.push(`Execute si el objetivo está a ≤ ${exe.hpPct}% de su vida máx.${exe.fear ? ` · al lograrlo: «${exe.fear.name}»${exe.fear.value ? ` ${exe.fear.value}` : ''} ${exe.fear.turns} t. a cercanos` : ''}`);
  }
  if (mechanics.lifeSteal) out.push(`Aplica robo de vida (${mechanics.lifeSteal.efficacy}% de eficacia)`);
  if (mechanics.buff) {
    const parts = [
      mechanics.buff.attackSpeed?.length ? `+${list(mechanics.buff.attackSpeed)}% vel. ataque` : '',
      mechanics.buff.aaAd?.length ? `AA al ${list(mechanics.buff.aaAd)}% AD` : '',
      mechanics.buff.aaAppliesPassive ? 'los AA aplican el estado de la pasiva' : '',
    ].filter(Boolean);
    out.push(`Al activar, ${mechanics.buff.turns} t.: ${parts.join(' · ') || 'sin valores'}`);
  }
  if (mechanics.appliesPassive) out.push('Aplica el estado de la pasiva a los objetivos');
  if (mechanics.aaCritBonus) out.push(`AA: +${mechanics.aaCritBonus.pctPerFace || 0}% del daño por cada cara de prob. de crítico${mechanics.aaCritBonus.pctPerFace ? '' : ' (sin valor)'}`);
  if (mechanics.critNoDamage) out.push('Los críticos no hacen daño extra');
  if (mechanics.critDoublesPassive) out.push('Crítico: duplica el valor del estado de la pasiva');
  for (const entry of mechanics.learnedStats ?? []) out.push(`Por tenerla aprendida: +${list(entry.values)} ${entry.stat}`);
  for (const entry of mechanics.levelThresholds ?? []) {
    const bits = [
      entry.rangeBonus ? `+${entry.rangeBonus} alcance` : '',
      entry.aaWave ? `oleada al AA${entry.aaWave.type ? ` ${entry.aaWave.type}` : ''}${entry.aaWave.requiresMaxStacks ? ' (al máximo de cargas)' : ''}` : '',
      entry.permanentMaxStacks ? 'cargas permanentes al máximo' : '',
    ].filter(Boolean);
    out.push(`Desde el nivel ${entry.level}${entry.name ? ` (${entry.name})` : ''}: ${bits.join(', ') || '—'}`);
  }
  if (mechanics.protect) out.push(`Al usarla: reducción de daño ${list(mechanics.protect.damageReductionPct)}% ${mechanics.protect.turns} t.${mechanics.protect.target === 'ally' ? ' al aliado' : mechanics.protect.target === 'allyOrSelf' ? ' al aliado o al portador' : ' al portador'}`);
  if (mechanics.castPool) {
    const pool = mechanics.castPool;
    const parts = [...(pool.flat?.length ? [`${list(pool.flat)}${pool.flatByLevel ? ' (por tramo de nivel)' : ''}`] : []), ...pool.ratios.map(ratio => `${list(ratio.values)}% ${ratio.stat}`)];
    if (pool.perChampionHit) parts.push(`${pool.perChampionHit.pct}% ${pool.perChampionHit.stat} por campeón enemigo alcanzado`);
    const extra = [
      pool.turns ? ` · ${pool.turns} t.` : '',
      pool.requiresChampionHit ? ' · solo si alcanza a un campeón' : pool.requiresHit ? ' · solo si alcanza a un enemigo' : '',
      pool.allAllies ? ' · a todos los aliados' : '',
      pool.lowHpBonus ? ` · ×${pool.lowHpBonus.multiplier} si está por debajo del ${pool.lowHpBonus.belowHpPct}% de vida máx.` : '',
      pool.delayTurns ? ` · se aplica tras ${pool.delayTurns} t. (o «Curar ahora»)` : '',
    ].join('');
    out.push(`Al usarla: ${pool.kind === 'shield' ? 'escudo' : 'cura'}${pool.target === 'ally' ? ' al aliado' : pool.alliesToo || pool.allAllies ? ' propio y a aliados' : ''} = ${parts.join(' + ') || '—'}${extra}`);
  }
  if (mechanics.charges?.reducePerChampionHit) out.push(`Cada campeón enemigo alcanzado (AA o habilidad) quita ${mechanics.charges.reducePerChampionHit} t. a la recarga`);
  if (mechanics.recast) {
    out.push(mechanics.recast.turns
      ? `Recast gratis ×${mechanics.recast.times} durante ${mechanics.recast.turns} t.`
      : `Recast gratis ×${mechanics.recast.times} hasta usarlo`);
  }
  if (mechanics.isolated?.multiplier) out.push(`Si el objetivo está aislado, el daño ×${mechanics.isolated.multiplier}`);
  if (mechanics.isolated?.slowPct) out.push(`Si el objetivo está aislado, ralentización ${mechanics.isolated.slowPct}%`);
  if (mechanics.castPool?.requiresSelfInArea) out.push('La cura/escudo solo si el portador está en el área');
  if (mechanics.evolutions?.slots.length) out.push(`Concede ${mechanics.evolutions.slots.join('/')} evolución(es) permanente(s) según el rango`);
  if (mechanics.evolve) out.push(`Se puede evolucionar a «${mechanics.evolve.name}» (elección permanente)`);
  if (mechanics.returnStrike) out.push(`Vuelta: el mismo daño como ${mechanics.returnStrike.type === 'true' ? 'verdadero' : mechanics.returnStrike.type === 'physical' ? 'físico' : 'mágico'}`);
  if (mechanics.takedownHeal) out.push('Al derribar, cura al portador');
  if (mechanics.recastOnTakedown) {
    const rec = mechanics.recastOnTakedown;
    out.push(rec.turns
      ? `Al matar/asistir: recast ×${rec.times} durante ${rec.turns} t.`
      : `Al matar/asistir: recast ×${rec.times} hasta usarlo`);
  }
  if (mechanics.armedAa) out.push('AA armado: el siguiente AA a un campeón hace daño extra (hay que armarlo)');
  if (mechanics.armArmedAa) out.push('Al usarla, arma el AA armado del portador');
  if (mechanics.resistShred) out.push(`Al acertar: −${list(mechanics.resistShred.pct)}% CA y RM ${mechanics.resistShred.turns} t.`);
  if (mechanics.aaOnHit) {
    const hit = mechanics.aaOnHit;
    const parts = [
      hit.hp?.length ? `${list(hit.hp)}% ${hit.hpSource === 'current' ? 'vida actual' : hit.hpSource === 'missing' ? 'vida faltante' : hit.hpSource === 'bonus' ? 'vida bonus' : 'vida máx.'}` : '',
      hit.apPer100 ? `+${hit.apPer100}% por 100 AP` : '',
      hit.ad?.length ? `${list(hit.ad.map(value => value * 100))}% AD${hit.adSource === 'bonus' ? ' bonus' : ''}` : '',
      hit.perTargetStacks ? `acumulable ${hit.perTargetStacks.turns} t.${hit.perTargetStacks.max ? ` (máx. ${hit.perTargetStacks.max})` : ''}` : '',
    ].filter(Boolean);
    out.push(`AA ${hit.always ? 'mientras esté aprendida' : 'mientras está activa'}: ${parts.join(' ')}${hit.type ? ` (${hit.type})` : ''}`);
  }
  if (mechanics.costStacks) out.push(`Cada uso en ${mechanics.costStacks.turns} t. suma ${mechanics.costStacks.amount} al coste (máx. ${mechanics.costStacks.max} acumulaciones)`);
  if (mechanics.deathBurst) out.push(`Al morir: «${mechanics.deathBurst.name ?? 'Explosión'}» ${mechanics.deathBurst.turns} t.${mechanics.deathBurst.pct ? ` · +${mechanics.deathBurst.pct}% ${mechanics.deathBurst.stat ?? 'spe'}` : ''} y luego explota`);
  if (mechanics.damageLowHp) {
    const low = mechanics.damageLowHp;
    out.push(`Daño ×${low.multiplier} si el objetivo está por debajo del ${low.belowHpPct}% de vida máx.${low.missingMaxBonusPct ? ` · hasta +${low.missingMaxBonusPct}% según vida faltante` : ''}`);
  }
  if (mechanics.selfStatus?.blocksRecast) out.push('No se puede recastear mientras dura el estado propio');
  if (mechanics.selfStatus) {
    const status = mechanics.selfStatus;
    const mod = status.stat ? ` · ${status.stat}${status.pct ? ` ${status.pct}%` : ''}${status.amount ? ` ${status.amount > 0 ? '+' : ''}${status.amount}` : ''}` : '';
    const fixed = status.fixedAttacks ? ` · número de ataques fijo ${status.fixedAttacks}` : '';
    const byRank = status.pctValues ? ` · ${list(status.pctValues)}%` : status.amountValues ? ` · ${list(status.amountValues)}` : '';
    const onlyChamp = status.requiresChampionHit ? ' · solo si alcanza a un campeón' : '';
    const reduce = status.damageReductionValues?.length ? ` · reducción de daño ${list(status.damageReductionValues)}%` : '';
    const more = status.stats?.length ? ` · +${status.stats.map(entry => entry.stat).join(', ')}` : '';
    const flags = `${status.cancelable ? ' · se puede terminar' : ''}${status.blocksAbility === false ? ' · no bloquea la habilidad' : ''}${status.durationByStacks ? ` · duración según cargas de «${status.durationByStacks.from}»` : ''}`;
    out.push(`Al usarla: «${status.name}»${status.value ? ` ${status.value}` : ''}${mod}${byRank}${fixed}${reduce}${more}${onlyChamp}${flags} en sí mismo ${status.turns} t.`);
  }
  if (mechanics.empoweredAa) {
    const emp = mechanics.empoweredAa;
    const bits = [
      emp.healHpPct?.length ? `cura ${list(emp.healHpPct)}% de vida ${emp.hpSource && emp.hpSource !== 'max' ? emp.hpSource : 'máx.'}` : '',
      emp.heal ? 'cura (plana / ratios)' : '',
      emp.healPerTarget ? 'cura por enemigo alcanzado' : '',
      emp.applyAbilityDamage ? 'aplica el daño de la habilidad al AA' : '',
      `CD ${list(emp.cooldown) || '—'} t.${emp.byLevel ? ' (tramos 1/6/11/16)' : ''}`,
      emp.reduceOnAbility ? `usar una habilidad: −${emp.reduceOnAbility} t.` : '',
      emp.reduceOnStruck ? `recibir una habilidad: −${emp.reduceOnStruck} t.` : '',
      emp.reduceOnAuto ? `AA: −${emp.reduceOnAuto} t.` : '',
      emp.skipAboveHpPct ? `no si va por encima del ${emp.skipAboveHpPct}%` : '',
    ].filter(Boolean);
    out.push(`AA potenciado: ${bits.join('; ')}`);
  }
  if (mechanics.trap) {
    const trap = mechanics.trap;
    const erupt = trap.eruptEffectName ?? trap.eruptEffect?.[0]?.name;
    out.push(`Efecto retrasado «${trap.name ?? 'Trampa'}»: ${trap.turns} t.${trap.applyOnPlace ? ' (primer golpe al colocar' : ' (se detona después'}${erupt ? `; Detonar: ${erupt}` : ''}${trap.damageOnDetonate === false ? '; Detonar sin daño' : ''})`);
  }
  if (mechanics.reduceEmpoweredAaOnHit) out.push(`Al acertar a un campeón, quita ${mechanics.reduceEmpoweredAaOnHit} t. al CD del AA potenciado`);
  if (mechanics.costHpMaxPct) out.push(`También cuesta ${mechanics.costHpMaxPct}% de la vida máx.${mechanics.costHpMinCurrentPct ? ` (no se puede usar por debajo del ${mechanics.costHpMinCurrentPct}%)` : ''}`);
  if (mechanics.noAction) out.push('No gasta la acción de habilidad');
  if (mechanics.innateShield) {
    const shield = mechanics.innateShield;
    out.push(`Escudo automático = ${[...(shield.flat?.length ? [list(shield.flat)] : []), ...shield.ratios.map(ratio => `${list(ratio.values)}% ${ratio.stat}`)].join(' + ')} · al romperse CD ${list(shield.cooldown)} t.${shield.reducePerHit ? ` (−${shield.reducePerHit} t. por enemigo alcanzado)` : ''}`);
  }
  if (mechanics.allEnemies) out.push('Su efecto va a todos los enemigos del combate');
  if (mechanics.spellShield) out.push(`Al usarla: «${mechanics.spellShield.status}» en sí mismo ${mechanics.spellShield.turns} t.; si se rompe, los bonus por tenerla aprendida × ${mechanics.spellShield.learnedMultiplier} durante ${mechanics.spellShield.breakTurns} t.`);
  if (mechanics.effectRules?.rules.length) out.push(`Reglas de efecto: ${mechanics.effectRules.rules.length} (como las de los ítems)${mechanics.effectRules.cooldown ? ` · CD ${mechanics.effectRules.cooldown} t.${mechanics.effectRules.perTargetCooldown ? ' por objetivo' : ''}` : ''}`);
  if (mechanics.castPool?.requiresSelfStatus) out.push('La cura/escudo solo si el estado propio ya está activo');
  if (mechanics.onAbilityUse) out.push(`Al usar una habilidad: +${list(mechanics.onAbilityUse.attackSpeed)}% vel. ataque ${mechanics.onAbilityUse.turns} t.`);
  if (mechanics.resetSectorShots) out.push(`Al usarla, reinicia ${mechanics.resetSectorShots.count} disparo(s) de «${mechanics.resetSectorShots.from}»${mechanics.resetSectorShots.requiresChampionHit ? ' si alcanza a un campeón' : ''}`);
  if (mechanics.mark) {
    const mark = mechanics.mark;
    const when = mark.detonateOn === 'aa' ? 'el siguiente AA' : mark.detonateOn === 'ability' ? 'la siguiente habilidad' : 'el siguiente AA o habilidad';
    const refund = mark.refundMana ? `; si la detona una habilidad, restaura maná${mark.refundMana.flat?.length ? ` ${list(mark.refundMana.flat)}` : ''}${mark.refundMana.refundCost ? ' + el coste de esa habilidad' : ''}` : '';
    out.push(`Marca ${mark.turns} t.: ${when} contra el marcado la detona${mark.damageOnDetonate !== false ? ' (el daño va al detonar)' : ''}${mark.applyOnAbilityHit ? '; las habilidades de daño la aplican' : ''}${refund}`);
  }
  if (mechanics.selfStatuses?.length) {
    for (const status of mechanics.selfStatuses) {
      out.push(`Al usarla: «${status.name}» en sí mismo ${status.turns} t.${status.requiresSelfInArea ? ' (si está en el área / rastro)' : ''}`);
    }
  }
  if (mechanics.selfInArea || mechanics.selfStatuses?.some(status => status.requiresSelfInArea) || mechanics.selfStatus?.requiresSelfInArea) {
    out.push(mechanics.selfInAreaLabel ?? 'Estoy en el área');
  }
  if (mechanics.trailTurns) out.push(`Deja un rastro ${mechanics.trailTurns} t. (botón para aplicar los estados del rastro)`);
  if (mechanics.centerEffect) out.push(`En el centro (a mano): «${mechanics.centerEffect.name}» ${mechanics.centerEffect.duration} t.`);
  if (mechanics.armedAa?.charges && mechanics.armedAa.charges > 1) out.push(`Arma ${mechanics.armedAa.charges} AA${mechanics.armedAa.turns ? ` ${mechanics.armedAa.turns} t.` : ''}${mechanics.armedAa.effectOnLastCharge !== false && mechanics.armedAa.effectName ? `; «${mechanics.armedAa.effectName}» en el último` : ''}`);
  if (mechanics.stacks?.countersPerTarget) out.push('Cargas por objetivo');
  if (mechanics.strikes) out.push(`Golpes: ${list(mechanics.strikes.count)}${mechanics.strikes.perBonusAtkSpe ? ` +1 por cada ${mechanics.strikes.perBonusAtkSpe}% vel. ataque bonus` : ''}`);
  if (mechanics.stacks?.onChampionTakedown) out.push('Gana 1 carga al derribar a un campeón');
  if (mechanics.cleanse) out.push('Al usarla, limpia los controles de masas del portador');
  if (mechanics.armedAa?.endsSelfStatus) out.push('El AA armado termina el estado propio de esta habilidad');
  return out;
}
