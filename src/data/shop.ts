import { applyItemQuantities } from './items';
import { setPartyGold } from './party';

export type ShopMode = 'compra' | 'venta';

export type ShopLine = {
  nombre: string;
  cantidad: number;
};

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

/** Cobra o paga el carrito y deja el stock y el oro alineados en memoria. */
export async function tradeShop(mode: ShopMode, lines: ShopLine[]): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, lines }),
    });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, `Error ${response.status} en la tienda`));
  const saved = body as { items?: { nombre: string; cantidad: number }[]; gold?: unknown };
  if (!saved || !Array.isArray(saved.items)) throw new Error('La API no devolvió el stock actualizado');
  applyItemQuantities(saved.items);
  if (typeof saved.gold === 'number') setPartyGold(saved.gold);
}
