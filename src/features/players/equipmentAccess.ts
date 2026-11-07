import { EQUIPMENT_SLOTS, type Player } from '../../data/players';

/** Like the top quest: completion + a standalone lane name, not a global quest ID. */
export function equipmentAccess(player: Pick<Player, 'quests' | 'equipamiento'>) {
  const unlocked = (player.quests ?? []).some(quest => quest.done === true && /\bbot\b/i.test(quest.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  const limit = unlocked ? EQUIPMENT_SLOTS : EQUIPMENT_SLOTS - 1;
  return {
    unlocked,
    limit,
    slotsLeft: Math.max(0, limit - player.equipamiento.length),
    // Existing items are never removed or silently deactivated by this UI gate.
    grandfathered: player.equipamiento.length > limit,
  };
}