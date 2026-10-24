import { pickRandom } from '../../lib/random';
import type { WheelSegment } from './wheelCanvas';

export type SpawnSegment = WheelSegment & { success: boolean };

const YES_SEGMENT: SpawnSegment = {
  label: '✅ Sí',
  color: '#0d2010',
  textColor: '#7ec85a',
  borderColor: '#3a6b28',
  success: true,
};

const NO_SEGMENT: SpawnSegment = {
  label: '✗ No',
  color: '#200a0a',
  textColor: '#c07060',
  borderColor: '#6b2a20',
  success: false,
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Reduce la proporción Sí/No a unos 20 segmentos como máximo para que las etiquetas quepan en la rueda. */
export function buildSpawnSegments(chance: number): SpawnSegment[] {
  const yesPercent = Math.round(chance);
  const noPercent = 100 - yesPercent;
  const divisor = gcd(yesPercent, noPercent);
  const scale = Math.ceil((yesPercent / divisor + noPercent / divisor) / 20);
  const yesCount = Math.round(yesPercent / divisor / scale);
  const noCount = Math.round(noPercent / divisor / scale);

  return [
    ...Array<SpawnSegment>(yesCount).fill(YES_SEGMENT),
    ...Array<SpawnSegment>(noCount).fill(NO_SEGMENT),
  ];
}

export const pickSpawnTarget = (segments: SpawnSegment[], success: boolean): number =>
  pickRandom(segments.flatMap((segment, index) => (segment.success === success ? [index] : [])));
