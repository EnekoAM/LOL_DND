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

export let CHAMPIONS: Champion[] = [];

export let CHAMPION_REGIONS: string[] = [];

export const CHAMPION_ROLES = ['Luchador', 'Mago', 'Tirador', 'Tanque', 'Asesino', 'Soporte'];

let abilitiesByName = new Map<string, Ability>();

export function hydrateChampions(champions: Champion[]): void {
  CHAMPIONS = champions;
  CHAMPION_REGIONS = [...new Set(champions.map(c => c.region).filter(Boolean))].sort();
  abilitiesByName = new Map();
  for (const champion of champions) {
    for (const ability of Object.values(champion.abilities)) {
      if (ability && !abilitiesByName.has(ability.name)) abilitiesByName.set(ability.name, ability);
    }
  }
}

/** Hay nombres de habilidad repetidos entre campeones: gana el primero del JSON. */
export const findAbility = (name: string | null): Ability | null =>
  name ? abilitiesByName.get(name) ?? null : null;

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
