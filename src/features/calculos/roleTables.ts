import type { StatLine } from './statLine';

export type RoleTable = {
  id: string;
  name: string;
  /** Índice 0 = nivel 1. */
  levels: StatLine[];
};

/**
 * AC 10, MR 0, crítico 0 / 1,5 y el resto de columnas de porcentaje a 0 en todas las tablas.
 * Cambian HP, maná, AD, AP, SPE, ATK_SPE y AB_SPE.
 */
function row(
  hp: number,
  mana: number,
  ad: string,
  ap: string,
  spe: number,
  atkSpe: number,
  abSpe: number,
): StatLine {
  return {
    hp,
    ac: 10,
    mr: 0,
    mana,
    ad,
    ap,
    critChance: 0,
    critDamage: 1.5,
    spe,
    atkSpe,
    atkSpePct: 0,
    abSpe,
    abSpePct: 0,
    lethality: 0,
    magicPen: 0,
  };
}

const mago: StatLine[] = [
  row(8, 25, '1d2', '2d2', 6, 1, 2),
  row(16, 40, '1d2', '2d4', 6, 1, 2),
  row(24, 55, '1d2', '3d4', 6, 1, 2),
  row(32, 70, '1d2', '3d4', 7, 1, 3),
  row(40, 85, '1d2', '4d4', 7, 1, 3),
  row(48, 100, '2d2', '4d6', 7, 1, 3),
  row(56, 115, '2d2', '4d6+1d4', 8, 1, 3),
  row(64, 130, '2d2', '4d6+2d4', 8, 1, 3),
  row(72, 145, '2d2', '5d6+2d4', 8, 1, 3),
  row(80, 160, '2d2', '5d6+2d4', 9, 1, 4),
  row(88, 175, '2d4', '5d6+3d4', 9, 1, 4),
  row(96, 190, '2d4', '6d6+3d4', 9, 1, 4),
  row(104, 205, '2d4', '6d6+4d4', 10, 1, 4),
  row(112, 220, '2d4', '6d6+5d4', 10, 1, 4),
  row(120, 235, '2d4', '6d6+6d4', 10, 1, 4),
  row(128, 250, '4d4', '6d6+6d4', 11, 1, 5),
  row(136, 265, '4d4', '6d6+7d4', 11, 1, 5),
  row(144, 280, '4d4', '6d6+8d4', 11, 1, 5),
];

const asesinoAd: StatLine[] = [
  row(9, 10, '1d4', '1d2', 8, 1, 1),
  row(18, 20, '2d4', '1d2', 8, 1, 1),
  row(27, 30, '2d4+1d2', '1d2', 8, 1, 1),
  row(36, 40, '2d4+2d2', '1d2', 9, 1, 1),
  row(45, 50, '3d4+2d2', '1d2', 9, 1, 1),
  row(54, 60, '3d4+2d2', '2d2', 9, 1, 2),
  row(63, 70, '3d4+3d2', '2d2', 10, 1, 2),
  row(72, 80, '3d4+4d2', '2d2', 10, 1, 2),
  row(81, 90, '4d4+4d2', '2d2', 10, 1, 2),
  row(90, 100, '4d4+5d2', '2d2', 11, 1, 2),
  row(99, 110, '5d4+5d2', '2d4', 11, 1, 2),
  row(108, 120, '5d4+6d2', '2d4', 11, 1, 2),
  row(117, 130, '5d4+7d2', '2d4', 12, 1, 2),
  row(126, 140, '5d4+8d2', '2d4', 12, 1, 2),
  row(135, 150, '5d4+9d2', '2d4', 12, 1, 2),
  row(144, 160, '5d4+9d2', '4d4', 13, 1, 3),
  row(153, 170, '5d4+10d2', '4d4', 13, 1, 3),
  row(162, 180, '5d4+10d2+1', '4d4', 13, 1, 3),
];

const asesinoAp: StatLine[] = [
  row(9, 20, '1d2', '1d2', 8, 1, 2),
  row(18, 30, '1d2', '2d2', 8, 1, 2),
  row(27, 40, '2d2', '2d2', 8, 1, 2),
  row(36, 50, '2d2', '3d2', 9, 1, 2),
  row(45, 60, '2d2', '1d4+3d2', 9, 1, 2),
  row(54, 70, '3d2', '1d4+3d2', 9, 1, 2),
  row(63, 80, '3d2', '1d4+4d2', 10, 1, 2),
  row(72, 90, '3d2', '1d4+4d2', 10, 1, 3),
  row(81, 100, '4d2', '1d4+4d2', 10, 1, 3),
  row(90, 110, '4d2', '2d4+4d2', 11, 1, 3),
  row(99, 120, '1d4+4d2', '2d4+5d2', 11, 1, 3),
  row(108, 130, '1d4+4d2', '2d4+6d2', 11, 1, 3),
  row(117, 140, '1d4+4d2', '2d4+7d2', 12, 1, 3),
  row(126, 150, '1d4+5d2', '2d4+7d2', 12, 1, 3),
  row(135, 160, '1d4+5d2', '2d4+8d2', 12, 1, 3),
  row(144, 170, '2d4+5d2', '2d4+8d2', 13, 1, 4),
  row(153, 180, '2d4+5d2', '2d4+9d2', 13, 1, 4),
  row(162, 190, '2d4+5d2', '2d4+10d2', 13, 1, 4),
];

const tirador: StatLine[] = [
  row(9, 15, '2d2', '1d2', 6, 1, 1),
  row(18, 20, '3d2', '1d2', 6, 1, 1),
  row(27, 25, '3d4', '1d2', 6, 2, 1),
  row(36, 30, '4d4', '1d2', 7, 2, 1),
  row(45, 35, '4d4+1d2', '1d2', 7, 2, 1),
  row(54, 40, '5d4+1d2', '2d2', 7, 2, 1),
  row(63, 45, '5d4+2d2', '2d2', 8, 2, 1),
  row(72, 50, '5d4+3d2', '2d2', 8, 2, 1),
  row(81, 55, '5d4+4d2', '2d2', 8, 2, 1),
  row(90, 60, '6d4+4d2', '2d2', 9, 2, 1),
  row(99, 65, '6d4+5d2', '2d4', 9, 3, 1),
  row(108, 70, '6d4+6d2', '2d4', 9, 3, 1),
  row(117, 75, '7d4+6d2', '2d4', 10, 3, 1),
  row(126, 80, '8d4+6d2', '2d4', 10, 3, 1),
  row(135, 85, '9d4+6d2', '2d4', 10, 3, 1),
  row(144, 90, '1d6+9d4+6d2', '4d4', 11, 3, 1),
  row(153, 95, '1d6+10d4+6d2', '4d4', 11, 3, 1),
  row(162, 100, '1d6+10d4+7d2', '4d4', 11, 3, 1),
];

const support: StatLine[] = [
  row(10, 35, '1d2', '1d2', 6, 1, 3),
  row(20, 50, '1d2', '1d2', 6, 1, 3),
  row(30, 65, '2d2', '2d2', 6, 1, 3),
  row(40, 80, '2d2', '2d2', 7, 1, 4),
  row(50, 95, '2d2', '2d2', 7, 1, 4),
  row(60, 110, '3d2', '3d2', 7, 1, 4),
  row(70, 125, '3d2', '3d2', 8, 1, 4),
  row(80, 140, '3d2', '3d2', 8, 1, 4),
  row(90, 155, '4d2', '4d2', 8, 1, 4),
  row(100, 170, '4d2', '4d2', 9, 1, 5),
  row(110, 185, '1d4+4d2', '1d4+4d2', 9, 1, 5),
  row(120, 200, '1d4+4d2', '1d4+4d2', 9, 1, 5),
  row(130, 215, '1d4+4d2', '1d4+4d2', 10, 1, 5),
  row(140, 230, '1d4+5d2', '1d4+5d2', 10, 1, 5),
  row(150, 245, '1d4+5d2', '1d4+5d2', 10, 1, 5),
  row(160, 260, '2d4+5d2', '2d4+5d2', 11, 1, 6),
  row(170, 275, '2d4+5d2', '2d4+5d2', 11, 1, 6),
  row(180, 290, '2d4+5d2', '2d4+5d2', 11, 1, 6),
];

const luchadorAdHp = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110, 121, 132, 143, 154, 165, 176, 187, 198];
const luchadorAdMana = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];

const luchadorAp: StatLine[] = [
  row(11, 10, '1d2', '1d2', 6, 1, 1),
  row(22, 20, '1d2', '2d2', 6, 1, 1),
  row(33, 30, '2d2', '2d2', 6, 1, 2),
  row(44, 40, '2d2', '3d2', 7, 1, 2),
  row(55, 50, '3d2', '1d4+1d2', 7, 1, 2),
  row(66, 60, '3d2', '1d4+2d2', 7, 1, 2),
  row(77, 70, '3d2', '1d4+3d2', 8, 1, 2),
  row(88, 80, '4d2', '2d4+1d2', 8, 1, 2),
  row(99, 90, '4d2', '2d4+2d2', 8, 1, 2),
  row(110, 100, '4d2', '2d4+2d2', 9, 1, 3),
  row(121, 110, '4d2', '2d4+2d2', 9, 1, 3),
  row(132, 120, '4d2', '2d4+3d2', 9, 1, 3),
  row(143, 130, '4d2', '2d4+4d2', 10, 1, 3),
  row(154, 140, '4d2', '2d4+5d2', 10, 1, 3),
  row(165, 150, '4d2', '2d4+6d2', 10, 1, 3),
  row(176, 160, '4d4', '1d6+2d4+6d2', 11, 1, 3),
  row(187, 170, '4d4', '1d6+2d4+7d2', 11, 1, 3),
  row(198, 180, '4d4', '1d6+2d4+8d2', 11, 1, 3),
];

const tanque: StatLine[] = [
  row(13, 5, '1d2', '1d2', 6, 1, 1),
  row(26, 10, '1d2', '1d2', 6, 1, 1),
  row(39, 15, '1d2', '1d2', 6, 1, 1),
  row(52, 20, '1d2', '1d2', 7, 1, 1),
  row(65, 25, '1d2', '1d2', 7, 1, 1),
  row(88, 30, '2d2', '2d2', 7, 1, 1),
  row(101, 35, '2d2', '2d2', 8, 1, 1),
  row(114, 40, '2d2', '2d2', 8, 1, 1),
  row(127, 45, '2d2', '2d2', 8, 1, 1),
  row(140, 50, '2d2', '2d2', 9, 1, 1),
  row(168, 55, '2d4', '2d4', 9, 1, 1),
  row(181, 60, '2d4', '2d4', 9, 1, 1),
  row(194, 65, '2d4', '2d4', 10, 1, 1),
  row(207, 70, '2d4', '2d4', 10, 1, 1),
  row(220, 75, '2d4', '2d4', 10, 1, 1),
  row(253, 80, '4d4', '4d4', 11, 1, 1),
  row(266, 85, '4d4', '4d4', 11, 1, 1),
  row(279, 90, '4d4', '4d4', 11, 1, 1),
];

export const ROLE_TABLES: RoleTable[] = [
  { id: 'mago', name: 'Mago', levels: mago },
  { id: 'asesino-ad', name: 'Asesino AD', levels: asesinoAd },
  { id: 'asesino-ap', name: 'Asesino AP', levels: asesinoAp },
  { id: 'tirador', name: 'Tirador', levels: tirador },
  { id: 'support', name: 'Support', levels: support },
  {
    id: 'luchador-ad',
    name: 'Luchador AD',
    levels: tirador.map((level, index) => ({
      ...level,
      hp: luchadorAdHp[index],
      mana: luchadorAdMana[index],
    })),
  },
  { id: 'luchador-ap', name: 'Luchador AP', levels: luchadorAp },
  { id: 'tanque', name: 'Tanque', levels: tanque },
];

/** Las fichas leen la fila de este nivel. Por encima no hay estadísticas de rol. */
export const MAX_ROLE_LEVEL = Math.min(...ROLE_TABLES.map(role => role.levels.length));

const rolesById = new Map(ROLE_TABLES.map(role => [role.id, role]));

export function findRoleTable(id: string): RoleTable | undefined {
  return rolesById.get(id);
}
