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

export function hydrateParty(party: Party): void {
  PARTY = {
    gold: party.gold,
    level: party.level,
    exp: party.exp,
    expToNextLevel: party.expToNextLevel,
  };
}
