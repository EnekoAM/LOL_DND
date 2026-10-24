export type Party = {
  gold: number;
  level: number;
  exp: number;
  expToNextLevel: number;
};

/** Valores de partida. Al arrancar la app los sustituye lo que haya en la base de datos. */
export let PARTY: Party = {
  gold: 3906,
  level: 3,
  exp: 124,
  expToNextLevel: 600,
};

const listeners = new Set<() => void>();

function emitParty(): void {
  for (const listener of listeners) listener();
}

export function subscribeParty(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Instantánea estable para que el oro del header se entere de un crafteo. */
export function partyGold(): number {
  return PARTY.gold;
}

export function partyLevel(): number {
  return PARTY.level;
}

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

async function patchParty(patch: { addGold?: number; level?: number }, fallback: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/party', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    throw new Error('No se pudo contactar con la API. Arranca npm run dev:api');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body, fallback));
  if (!body || typeof body !== 'object' || typeof (body as Party).gold !== 'number' || typeof (body as Party).level !== 'number') {
    throw new Error('La API no devolvió el grupo');
  }
  hydrateParty(body as Party);
}

/** Suma o resta oro y deja el saldo de la cabecera alineado con lo guardado. */
export async function adjustPartyGold(amount: number): Promise<void> {
  const fallback = amount < 0
    ? `Error al quitar oro`
    : `Error al dar oro`;
  await patchParty({ addGold: amount }, fallback);
}

/** Guarda el nivel del grupo. */
export async function savePartyLevel(level: number): Promise<void> {
  await patchParty({ level }, `Error al cambiar el nivel`);
}

export function setPartyGold(gold: number): void {
  if (PARTY.gold === gold) return;
  PARTY = { ...PARTY, gold };
  emitParty();
}

export function hydrateParty(party: Party): void {
  PARTY = {
    gold: party.gold,
    level: party.level,
    exp: party.exp,
    expToNextLevel: party.expToNextLevel,
  };
  emitParty();
}
