import { useCallback, useEffect, useRef } from 'react';
import { drawWheelScene, WHEEL_HEIGHT, WHEEL_WIDTH, type WheelSegment } from './wheelCanvas';

const SPIN_DURATION_MS = 4000;

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/** Giro total (siempre hacia delante) para que el puntero, fijo arriba (-π/2), acabe dentro de `target`. */
function computeSpinDelta(startAngle: number, target: number, segmentCount: number): number {
  const sliceAngle = (2 * Math.PI) / segmentCount;
  const extraSpins = 5 + Math.floor(Math.random() * 3);
  // Margen para no caer justo en la frontera entre dos segmentos.
  const margin = sliceAngle * 0.12;
  const offset = margin + Math.random() * (sliceAngle - margin * 2);
  let delta = (-Math.PI / 2 - target * sliceAngle - offset - startAngle) % (2 * Math.PI);
  if (delta > 0) delta -= 2 * Math.PI;
  return delta - extraSpins * 2 * Math.PI;
}

type Props<T extends WheelSegment> = {
  segments: T[];
  /** Índice del segmento en el que debe parar; null mientras la rueda está quieta. */
  spinTo: number | null;
  onResult: (segment: T) => void;
};

export default function MedievalWheel<T extends WheelSegment>({ segments, spinTo, onResult }: Props<T>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const draw = useCallback((angle: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawWheelScene(ctx, angle, segments);
  }, [segments]);

  useEffect(() => {
    draw(angleRef.current);
  }, [draw]);

  useEffect(() => {
    if (spinTo === null) return;

    const startAngle = angleRef.current;
    const totalDelta = computeSpinDelta(startAngle, spinTo, segments.length);
    const startTime = performance.now();
    let frameId = 0;

    const frame = (now: number) => {
      const t = Math.min((now - startTime) / SPIN_DURATION_MS, 1);
      angleRef.current = startAngle + totalDelta * easeOutQuart(t);
      draw(angleRef.current);

      if (t < 1) frameId = requestAnimationFrame(frame);
      else onResultRef.current(segments[spinTo]);
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [spinTo, segments, draw]);

  return <canvas ref={canvasRef} className="irs-wheel-canvas" width={WHEEL_WIDTH} height={WHEEL_HEIGHT} />;
}
