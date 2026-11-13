import type { CombatParticipant } from '../../data/combat';
import { participantChampion, participantNpc } from '../../data/combatSheet';
import { PLAYERS } from '../../data/players';
import { championDamageContext } from '../calculos/championDamage';
import { playerBonusLine, playerMaxHp } from '../calculos/playerTotals';
import { numericStat } from './combatAbilityUse';

export type ParticipantHp = { current: number; max: number | undefined; bonus?: number };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Vida actual / máxima: players desde su ficha; el resto desde el combate (campeón: máximo por stats). */
export function participantHp(participant: CombatParticipant): ParticipantHp | null {
  if (participant.kind === 'player') {
    const player = PLAYERS.find(p => p.name === participant.sourceId) ?? null;
    if (!player) return null;
    const max = finite(player.hp) ? player.hp : playerMaxHp(player.sheet, player.equipamiento);
    const current = finite(player.actualHp) ? player.actualHp : max ?? 0;
    const bonusRaw = playerBonusLine(player.sheet, player.equipamiento).hp;
    const bonus = numericStat(bonusRaw);
    return { current, max, ...(finite(bonus) ? { bonus } : {}) };
  }
  let max = finite(participant.maxHp) ? participant.maxHp : undefined;
  if (max === undefined && participant.kind === 'champion') {
    const champion = participantChampion(participant);
    if (champion) max = numericStat(championDamageContext(champion).stats.hp) || undefined;
  }
  if (max === undefined && participant.kind === 'npc') {
    const hp = participantNpc(participant)?.stats?.hp;
    if (finite(hp) && hp > 0) max = hp;
  }
  const current = finite(participant.hp) ? participant.hp : max ?? 0;
  let bonus: number | undefined;
  if (participant.kind === 'champion') {
    const champion = participantChampion(participant);
    if (champion) {
      const value = numericStat(championDamageContext(champion).stats.bonus?.hp);
      if (finite(value)) bonus = value;
    }
  }
  return { current, max, ...(bonus !== undefined ? { bonus } : {}) };
}

/** ¿Puede este usuario ver / editar la vida de este participante? Admin: todos; User: solo su player. */
export function canSeeHp(participant: CombatParticipant, isAdmin: boolean, myPlayer: string | null): boolean {
  if (isAdmin) return true;
  if (participant.kind !== 'player' || !myPlayer) return false;
  return (participant.sourceId ?? participant.name).toLocaleLowerCase('es') === myPlayer.toLocaleLowerCase('es');
}

/** Vida + vida temporal + escudo de un objetivo (players: su ficha; resto: el combate). */
export function participantHpPools(participant: CombatParticipant): { current: number; tempHp: number; shield: number } | null {
  const hp = participantHp(participant);
  if (!hp) return null;
  if (participant.kind === 'player') {
    const player = PLAYERS.find(p => p.name === participant.sourceId);
    return { current: hp.current, tempHp: finite(player?.vidaTemporal) ? player!.vidaTemporal! : 0, shield: finite(player?.escudo) ? player!.escudo! : 0 };
  }
  return { current: hp.current, tempHp: finite(participant.tempHp) ? participant.tempHp : 0, shield: finite(participant.shield) ? participant.shield : 0 };
}

/** Daño aplicado a un objetivo del combate (con su Deshacer exacto). */
export type TargetDamage = { name: string; before: number; after: number; absorbed: number; undo: () => Promise<void> };
/** amount: daño fijo, o función de la vida actual del objetivo (p. ej. 9% de la vida actual). */
export type DamageAmount = number | ((currentHp: number) => number);
export type DamageApplyOpts = {
  fromAutoAttack?: boolean;
  damageType?: 'physical' | 'magic' | 'true';
  critical?: boolean;
  attackerId?: string;
};
export type TargetDamageFn = (targetId: string, amount: DamageAmount, opts?: DamageApplyOpts) => Promise<TargetDamage | null>;

/** " → Objetivo": solo a quién se le hizo el daño (la vida que le queda no se enseña). */
export function targetHpLine(damage: TargetDamage): string {
  return ` → ${damage.name}`;
}

/**
 * Mismo daño a varios objetivos, uno tras otro. Devuelve un solo TargetDamage con todos los nombres
 * y un Deshacer que los restaura todos (en orden inverso). Si uno falla, se queda con los ya aplicados.
 */
export async function damageTargets(
  apply: TargetDamageFn,
  targetIds: string[],
  amount: DamageAmount,
  opts?: DamageApplyOpts,
): Promise<{ damage: TargetDamage | null; error?: string; kills?: string[]; hits?: number }> {
  const done: TargetDamage[] = [];
  /** Objetivos que pasan de vida > 0 a 0 (para «Al matar / asistir»). */
  const kills: string[] = [];
  let error: string | undefined;
  for (const id of targetIds) {
    try {
      const result = await apply(id, amount, opts);
      if (result) {
        done.push(result);
        if (result.before > 0 && result.after <= 0) kills.push(id);
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'No se pudo aplicar el daño';
      break;
    }
  }
  if (done.length === 0) return { damage: null, error };
  return {
    hits: done.length,
    damage: {
      name: done.map(entry => entry.name).join(', '),
      before: 0,
      after: 0,
      absorbed: 0,
      undo: async () => {
        for (const entry of [...done].reverse()) await entry.undo();
      },
    },
    error,
    kills,
  };
}
