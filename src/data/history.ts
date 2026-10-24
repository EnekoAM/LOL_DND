import { applyItemQuantities } from './items';
import { setPartyGold } from './party';

export type HistoryKind = 'tirada' | 'crafteo' | 'compra' | 'venta';

export type HistoryIngredient = {
  nombre: string;
  cantidad: number;
};

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  timestamp: string;
  item: string;
  reverted: boolean;
  tirada?: string;
  rareza?: string;
  ingredients?: HistoryIngredient[];
  /** Copias de una compra o una venta. */
  cantidad?: number;
  /** Oro de esa operación. Al revertir una compra se devuelve; al revertir una venta se cobra. */
  oro?: number;
};

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  let response: Response;
  try {
    response = await fetch('/api/history');
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al cargar el historial`));
  if (!Array.isArray(body)) throw new Error('La API no devolvió el historial');
  return body as HistoryEntry[];
}

/** Deshace la entrada, la borra del historial y alinea el stock en memoria. */
export async function revertHistory(id: string, kind: HistoryKind): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, kind }),
    });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} al revertir`));
  if (!body || typeof body !== 'object') throw new Error('La API no devolvió el historial actualizado');

  const saved = body as { items?: { nombre: string; cantidad: number }[]; gold?: unknown };
  if (Array.isArray(saved.items)) applyItemQuantities(saved.items);
  if (typeof saved.gold === 'number') setPartyGold(saved.gold);
}
