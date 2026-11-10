import { matchesSearch, normalizeName } from '../lib/text';
import { ROLE_TABLES, findRoleTable } from './roles';

export type AbilityKey = 'P' | 'Q' | 'W' | 'E' | 'R';

export type DamageScalingSource = 'total' | 'bonus';

export type AbilityDamage = {
  type?: string;
  /** Escalado de AP por nivel de habilidad (0.3 = 30%). */
  ap?: number[];
  ad?: number[];
  /** Ausente = total, para conservar las habilidades existentes. */
  adSource?: DamageScalingSource;
  apSource?: DamageScalingSource;
  /** Multiplicador opcional que el DM puede activar (p. ej. objetivo único). */
  damageBonus?: number;
};

export type AbilityEffect = {
  name: string;
  values?: number[];
  duration?: number[];
};

export type Ability = {
  name: string;
  description?: string;
  learned?: boolean;
  damage?: AbilityDamage;
  effect?: AbilityEffect[];
  cost?: string;
  hasStacks?: boolean;
  maxStacks?: number;
  /** Cooldown en turnos propios. */
  cooldown?: number;
};

export type Champion = {
  champion: string;
  abilities: Partial<Record<AbilityKey, Ability>>;
  region: string;
  role: string;
  image: string;
  /** Nivel propio de la ficha DM (1–20). */
  level?: number;
  /** Tabla de rol asignada (colección roles). Sin ella se deduce de `role`. */
  roleId?: string;
  /** URL de imagen de fondo de la ficha. */
  background?: string;
  /** Equipo de prueba en la ficha del campeón. */
  equipamiento?: string[];
  /** Visible para players cuando el filtro Activos está on. */
  active?: boolean;
};

export type ChampionFieldsPatch = {
  level?: number;
  roleId?: string;
  role?: string;
  image?: string;
  background?: string | null;
  equipamiento?: string[];
  active?: boolean;
};

export type ChampionFilter = {
  search: string;
  region: string;
  role: string;
  onlyLearned?: boolean;
  onlyActive?: boolean;
};

export const ABILITY_KEYS: AbilityKey[] = ['P', 'Q', 'W', 'E', 'R'];

/** La pasiva es P, las básicas son Q/W/E y la definitiva es R. */
export type AbilityKind = 'pasiva' | 'basica' | 'definitiva';

export type AbilityRef = {
  name: string;
  champion: string;
  image: string;
  role: string;
  slot: AbilityKey;
  ability: Ability;
};

const KIND_BY_SLOT: Record<AbilityKey, AbilityKind> = {
  P: 'pasiva',
  Q: 'basica',
  W: 'basica',
  E: 'basica',
  R: 'definitiva',
};

export let CHAMPIONS: Champion[] = [];

export let CHAMPION_REGIONS: string[] = [];

export const CHAMPION_ROLES = ['Luchador', 'Mago', 'Tirador', 'Tanque', 'Asesino', 'Soporte'];

/** Tabla por defecto de cada categoría cuando el campeón aún no tiene roleId. */
const DEFAULT_ROLE_ID: Record<string, string> = {
  luchador: 'luchador-ad',
  mago: 'mago',
  tirador: 'tirador',
  tanque: 'tanque',
  asesino: 'asesino-ad',
  soporte: 'support',
  support: 'support',
};

/** Categoría (Luchador, Mago...) que corresponde a una tabla de rol. */
const ROLE_CATEGORY_BY_PREFIX: [string, string][] = [
  ['luchador', 'Luchador'],
  ['mago', 'Mago'],
  ['tirador', 'Tirador'],
  ['tanque', 'Tanque'],
  ['asesino', 'Asesino'],
  ['support', 'Soporte'],
  ['soporte', 'Soporte'],
];

export function roleCategoryFor(roleId: string, fallback = ''): string {
  const id = roleId.trim().toLowerCase();
  return ROLE_CATEGORY_BY_PREFIX.find(([prefix]) => id.startsWith(prefix))?.[1] ?? fallback;
}

/** Tabla de rol del campeón: la guardada, o la de su categoría, o la primera. */
export function championRoleId(champion: Pick<Champion, 'roleId' | 'role'>): string {
  if (champion.roleId && findRoleTable(champion.roleId)) return champion.roleId;
  const byRole = DEFAULT_ROLE_ID[(champion.role ?? '').trim().toLowerCase()];
  if (byRole && findRoleTable(byRole)) return byRole;
  return champion.roleId || byRole || ROLE_TABLES[0]?.id || '';
}

const foldName = (name: string): string =>
  name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

let abilitiesByName = new Map<string, AbilityRef>();
let abilitiesByFold = new Map<string, AbilityRef>();

export function hydrateChampions(champions: Champion[]): void {
  CHAMPIONS = champions;
  CHAMPION_REGIONS = [...new Set(champions.map(c => c.region).filter(Boolean))].sort();
  abilitiesByName = new Map();
  abilitiesByFold = new Map();
  for (const champion of champions) {
    for (const slot of ABILITY_KEYS) {
      const ability = champion.abilities[slot];
      if (!ability?.name || abilitiesByName.has(ability.name)) continue;
      const ref: AbilityRef = {
        name: ability.name,
        champion: champion.champion,
        image: champion.image,
        role: champion.role,
        slot,
        ability,
      };
      abilitiesByName.set(ability.name, ref);
      const folded = foldName(ability.name);
      if (!abilitiesByFold.has(folded)) abilitiesByFold.set(folded, ref);
    }
  }
}

/** Hay nombres de habilidad repetidos entre campeones: gana el primero del JSON. */
export const findAbilityRef = (name: string | null): AbilityRef | null => {
  if (!name) return null;
  return abilitiesByName.get(name) ?? abilitiesByFold.get(foldName(name)) ?? null;
};

export const sameAbilityName = (left: string | null, right: string | null): boolean =>
  !!left && !!right && foldName(left) === foldName(right);

export const findAbility = (name: string | null): Ability | null =>
  findAbilityRef(name)?.ability ?? null;

export const learnedAbilities = (kind: AbilityKind, role?: string): AbilityRef[] => {
  const wanted = role?.trim().toLowerCase();
  return [...abilitiesByName.values()].filter(ref =>
    ref.ability.learned === true &&
    KIND_BY_SLOT[ref.slot] === kind &&
    (!wanted || ref.role.trim().toLowerCase() === wanted),
  );
};

const hasLearnedAbility = (champion: Champion): boolean =>
  ABILITY_KEYS.some(key => champion.abilities[key]?.learned === true);

export const filterChampions = (champions: Champion[], { search, region, role, onlyLearned, onlyActive }: ChampionFilter): Champion[] =>
  champions.filter(c =>
    matchesSearch(c.champion, search) &&
    (!region || c.region === region) &&
    (!role || c.role === role) &&
    (!onlyLearned || hasLearnedAbility(c)) &&
    (!onlyActive || c.active === true),
  );

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

/** Sustituye una habilidad del campeón y deja la copia en memoria alineada con lo guardado. */
export async function saveChampionAbility(championName: string, slot: AbilityKey, ability: Ability): Promise<Champion> {
  let response: Response;
  try {
    response = await fetch(`/api/champions?champion=${encodeURIComponent(championName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, ability }),
    });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar la habilidad`));

  const saved = body as Champion;
  const key = normalizeName(championName);
  const next = CHAMPIONS.map(champion => (normalizeName(champion.champion) === key ? saved : champion));
  hydrateChampions(next.some(champion => normalizeName(champion.champion) === key) ? next : [...next, saved]);
  return saved;
}

function replaceChampion(saved: Champion, championName: string): Champion {
  const key = normalizeName(championName);
  const next = CHAMPIONS.map(champion => (normalizeName(champion.champion) === key ? saved : champion));
  hydrateChampions(next.some(champion => normalizeName(champion.champion) === key) ? next : [...next, saved]);
  return saved;
}

/** Guarda nivel, fondo o equipo de la ficha del campeón. */
export async function saveChampionPatch(championName: string, patch: ChampionFieldsPatch): Promise<Champion> {
  let response: Response;
  try {
    response = await fetch(`/api/champions?champion=${encodeURIComponent(championName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al guardar el campeón`));
  return replaceChampion(body as Champion, championName);
}

