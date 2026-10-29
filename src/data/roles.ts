import type { StatLine } from '../features/calculos/statLine';

/** Tabla de rol × nivel guardada en la colección roles (Mongo). */
export type RoleTable = {
  id: string;
  name: string;
  /** Índice 0 = nivel 1. HP ya viene calculado por nivel. */
  levels: StatLine[];
};

export let ROLE_TABLES: RoleTable[] = [];

/** Las fichas leen la fila de este nivel. Por encima no hay estadísticas de rol. */
export let MAX_ROLE_LEVEL = 0;

let rolesById = new Map<string, RoleTable>();

export function hydrateRoles(roles: RoleTable[]): void {
  ROLE_TABLES = roles;
  MAX_ROLE_LEVEL = roles.length ? Math.min(...roles.map(role => role.levels.length)) : 0;
  rolesById = new Map(roles.map(role => [role.id, role]));
}

export function findRoleTable(id: string): RoleTable | undefined {
  return rolesById.get(id);
}
