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
