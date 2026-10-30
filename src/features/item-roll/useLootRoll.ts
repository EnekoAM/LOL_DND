import { useCallback, useRef, useState } from 'react';
import { grantItem } from '../../data/items';
import type { LootRarity } from '../../data/loot';
import { rollLoot, type LootRoll } from './loot';
import { buildReel, type LootReelData } from './reelStrip';

export function useLootRoll() {
  const [result, setResult] = useState<LootRoll | null>(null);
  const [reel, setReel] = useState<LootReelData | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingRef = useRef<LootRoll | null>(null);

  const rolling = spinning || saving;

  const roll = (base: LootRarity) => {
    if (rolling) return;
    // El ganador se decide primero (mismas probabilidades de siempre) y se guarda ya,
    // así salir a mitad de la animación no permite repetir la tirada.
    const rolled = rollLoot(base);
    pendingRef.current = rolled;
    setResult(null);
    setSaveError(null);
    setReel(buildReel(base, rolled));
    setSpinning(true);
    setSaving(true);
    grantItem(rolled.entry.name, { tirada: base, rareza: rolled.rarity })
      .then(() => setSaveError(null))
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : 'No se pudo guardar el ítem');
      })
      .finally(() => setSaving(false));
  };

  /** La ruleta se ha parado (o se ha saltado): revela el ítem. */
  const finish = useCallback(() => {
    setSpinning(false);
    setResult(pendingRef.current);
  }, []);

  return { result, reel, spinning, saving, rolling, saveError, roll, finish };
}
