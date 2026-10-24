import { useCallback, useState } from 'react';
import type { SpawnType } from '../../data/loot';
import { rollPercent } from '../../lib/random';
import { getSpawnChance } from './loot';
import { buildSpawnSegments, pickSpawnTarget } from './spawnWheel';

type SpawnRoll = {
  type: SpawnType;
  success: boolean;
  target: number;
  spinning: boolean;
};

const describeOutcome = ({ type, success }: SpawnRoll): string => {
  const name = type.toLowerCase();
  return success ? `✦ El ítem ${name} hace su aparición` : `✗ El ítem ${name} no se manifiesta`;
};

export function useSpawnRoll() {
  const [segments, setSegments] = useState(() => buildSpawnSegments(getSpawnChance('Basico')));
  const [spawn, setSpawn] = useState<SpawnRoll | null>(null);

  const start = (type: SpawnType) => {
    if (spawn?.spinning) return;
    const chance = getSpawnChance(type);
    const nextSegments = buildSpawnSegments(chance);
    const success = rollPercent(chance);
    setSegments(nextSegments);
    setSpawn({ type, success, target: pickSpawnTarget(nextSegments, success), spinning: true });
  };

  const finish = useCallback(() => setSpawn(prev => prev && { ...prev, spinning: false }), []);

  const revealed = spawn && !spawn.spinning ? spawn : null;

  return {
    segments,
    spinTo: spawn?.spinning ? spawn.target : null,
    outcome: revealed && { success: revealed.success, message: describeOutcome(revealed) },
    start,
    finish,
  };
}
