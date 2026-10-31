import { useCallback, useRef, useState } from 'react';
import type { SpawnType } from '../../data/loot';
import { rollPercent } from '../../lib/random';
import { getSpawnChance } from './loot';
import { buildSpawnSegments, pickSpawnTarget } from './spawnWheel';

type SpawnRoll = {
  id: number;
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
  const nextId = useRef(0);

  const start = (type: SpawnType) => {
    if (spawn?.spinning) return;
    const chance = getSpawnChance(type);
    const nextSegments = buildSpawnSegments(chance);
    const success = rollPercent(chance);
    const id = ++nextId.current;
    setSegments(nextSegments);
    setSpawn({ id, type, success, target: pickSpawnTarget(nextSegments, success), spinning: true });
  };

  /** Muestra en la rueda los segmentos de un tipo sin girarla (al seleccionarlo). */
  const preview = (type: SpawnType) => {
    if (spawn?.spinning) return;
    setSegments(buildSpawnSegments(getSpawnChance(type)));
    setSpawn(null);
  };

  const finish = useCallback(() => setSpawn(prev => prev && { ...prev, spinning: false }), []);

  const revealed = spawn && !spawn.spinning ? spawn : null;

  return {
    segments,
    spinTo: spawn?.spinning ? spawn.target : null,
    outcome: revealed && {
      id: revealed.id,
      type: revealed.type,
      success: revealed.success,
      message: describeOutcome(revealed),
    },
    spinning: !!spawn?.spinning,
    start,
    preview,
    finish,
  };
}
