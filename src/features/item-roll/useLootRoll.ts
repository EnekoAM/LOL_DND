import { useState } from 'react';
import { grantItem } from '../../data/items';
import type { LootRarity } from '../../data/loot';
import { rollLoot, type LootRoll } from './loot';

/** Pausa para mostrar "Consultando el oráculo..." antes de revelar el ítem. */
const REVEAL_DELAY_MS = 500;

export function useLootRoll() {
  const [result, setResult] = useState<LootRoll | null>(null);
  const [rolling, setRolling] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const roll = (base: LootRarity) => {
    if (rolling) return;
    setRolling(true);
    setResult(null);
    setSaveError(null);
    setTimeout(() => {
      const rolled = rollLoot(base);
      setResult(rolled);
      grantItem(rolled.entry.name, { tirada: base, rareza: rolled.rarity })
        .then(() => setSaveError(null))
        .catch((error: unknown) => {
          setSaveError(error instanceof Error ? error.message : 'No se pudo guardar el ítem');
        })
        .finally(() => setRolling(false));
    }, REVEAL_DELAY_MS);
  };

  return { result, rolling, saveError, roll };
}
