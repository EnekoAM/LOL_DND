import { hydrateChampions, type Champion } from './champions';
import { hydrateItems, type Item } from './items';
import { hydrateLoot, type LootTables } from './loot';
import { hydrateParty, type Party } from './party';
import { hydratePlayers, type Player } from './players';

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `Error ${response.status} en ${path}`;
    throw new Error(message);
  }
  return body as T;
}

export async function loadCatalogs(): Promise<void> {
  const [champions, items, players, loot, party] = await Promise.all([
    getJson<Champion[]>('/api/champions'),
    getJson<Item[]>('/api/items'),
    getJson<Player[]>('/api/players'),
    getJson<LootTables>('/api/loot'),
    getJson<Party>('/api/party'),
  ]);

  hydrateChampions(champions);
  hydrateItems(items);
  hydratePlayers(players);
  hydrateLoot(loot);
  hydrateParty(party);
}
