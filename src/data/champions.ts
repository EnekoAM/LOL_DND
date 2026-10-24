import { matchesSearch, normalizeName } from '../lib/text';

export type AbilityKey = 'P' | 'Q' | 'W' | 'E' | 'R';

export type AbilityDamage = {
  type?: string;
  /** Escalado de AP por nivel de habilidad (0.3 = 30%). */
  ap?: number[];
  ad?: number[];
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
};

export type Champion = {
  champion: string;
  abilities: Partial<Record<AbilityKey, Ability>>;
  region: string;
  role: string;
  image: string;
};

export type ChampionFilter = {
  search: string;
  region: string;
  role: string;
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

export const filterChampions = (champions: Champion[], { search, region, role }: ChampionFilter): Champion[] =>
  champions.filter(c =>
    matchesSearch(c.champion, search) &&
    (!region || c.region === region) &&
    (!role || c.role === role),
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
