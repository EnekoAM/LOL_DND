import { findItem, type Item } from '../../data/items';

/** Huecos principales del equipamiento (el 7º es el hueco especial de botas). */
export const MAIN_EQUIPMENT_SLOTS = 6;

const plain = (text: string): string => text.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** Botas = ítems de rareza Botas (solo van en su hueco). */
export const isBootsItem = (item: Pick<Item, 'rareza'> | undefined): boolean => !!item && plain(item.rareza) === 'botas';
export const isBootsName = (name: string): boolean => isBootsItem(findItem(name));

/**
 * Reparte el equipamiento (lista plana en la BD) en 6 huecos principales + 1 de botas.
 * main / boots = posiciones dentro de la lista original.
 */
/** El 6º hueco principal se desbloquea al completar una quest cuyo nombre contenga «bot». */
export const botQuestDone = (quests: readonly { name: string; done?: boolean }[] | undefined): boolean =>
  (quests ?? []).some(quest => quest.done === true && /\bbot\b/i.test(plain(quest.name)));

export function equipmentLayout(items: readonly string[], mainCap: number = MAIN_EQUIPMENT_SLOTS) {
  const main: number[] = [];
  const boots: number[] = [];
  items.forEach((name, index) => (isBootsName(name) ? boots : main).push(index));
  return {
    main,
    boots,
    mainCap,
    mainLeft: Math.max(0, mainCap - main.length),
    /** Principales por encima del límite actual (p. ej. el 6º sin misión de bot): se conservan. */
    mainOver: main.length > mainCap,
    bootsFree: boots.length === 0,
    /** Datos antiguos con más de 6 principales o más de unas botas: se conservan y se pueden quitar. */
    overflow: main.length > MAIN_EQUIPMENT_SLOTS || boots.length > 1,
  };
}
