import { championRoleId, type Ability, type Champion } from '../../data/champions';
import { findRoleTable } from '../../data/roles';
import { playerBonusLine, playerTotalLine } from './playerTotals';
import type { StatLine } from './statLine';

/** Champion sheets use their own level/role/equipment, never the party or a player. */
export function championDamageContext(champion: Champion, extra: StatLine[] = []) {
  const equipment = champion.equipamiento ?? [];
  const level = typeof champion.level === 'number' && Number.isFinite(champion.level)
    ? Math.min(20, Math.max(1, Math.floor(champion.level))) : 1;
  const roleId = championRoleId(champion);
  const roleTable = findRoleTable(roleId);
  const tableLevel = roleTable ? Math.min(level, roleTable.levels.length) : level;
  const sheet = roleId ? { roleId } : undefined;
  const stats = {
    ...playerTotalLine(sheet, equipment, tableLevel, extra),
    bonus: playerBonusLine(sheet, equipment, extra),
  };
  return { equipment, level, roleId, roleTable, tableLevel, stats };
}

/** Champions have no saved ability ranks: start at 1 and offer their defined ranks. */
export const championAbilityRankCount = (ability: Ability): number =>
  Math.max(1, ability.damage?.ad?.length ?? 0, ability.damage?.ap?.length ?? 0);