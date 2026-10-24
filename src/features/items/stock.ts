import type { Item } from '../../data/items';
import { PLAYERS } from '../../data/players';
import { normalizeName } from '../../lib/text';

export type ItemAvailability = {
  /** Copias que tiene el grupo, tal como está en la base. */
  owned: number;
  /** Copias que ahora mismo lleva alguien equipadas. */
  equipped: number;
  /** Copias que nadie lleva puestas. */
  available: number;
};

/** El stock real es la cantidad de la base menos lo que ya está equipado. */
export function itemAvailability(item: Item): ItemAvailability {
  const key = normalizeName(item.nombre);
  let equipped = 0;
  for (const player of PLAYERS) {
    for (const name of player.equipamiento) {
      if (normalizeName(name) === key) equipped += 1;
    }
  }
  return {
    owned: item.cantidad,
    equipped,
    available: Math.max(0, item.cantidad - equipped),
  };
}
