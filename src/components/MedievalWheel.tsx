import { useRef, useEffect, useCallback } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const GOLD        = "#c9a84c";
const GOLD_BRIGHT = "#e8c96a";
const GOLD_DIM    = "#7a5f28";
const W           = 300;   // canvas width
const H           = 380;   // canvas height — extra space above for dagger
const CX          = W / 2;
const CY          = H / 2 + 30;   // wheel center pushed down, freeing ~80px above
const R           = W / 2 - 14;
const SPIN_DUR    = 4000;

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
export type WheelSegment = {
  label:       string;
  color:       string;
  textColor:   string;
  borderColor: string;
};

type Props = {
  segments: WheelSegment[];
  spinTo:   number | null;
  onResult: (seg: WheelSegment) => void;
};

// ─── DRAW WHEEL ──────────────────────────────────────────────────────────────
function drawWheel(
  ctx:      CanvasRenderingContext2D,
  angle:    number,
  segments: WheelSegment[]
) {
  const n     = segments.length;
  const slice = (2 * Math.PI) / n;

  ctx.clearRect(0, 0, W, H);

  // Drop shadow behind wheel
  const shadow = ctx.createRadialGradient(CX, CY, R - 6, CX, CY, R + 18);
  shadow.addColorStop(0, "rgba(0,0,0,0)");
  shadow.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.beginPath();
  ctx.arc(CX, CY, R + 18, 0, 2 * Math.PI);
  ctx.fillStyle = shadow;
  ctx.fill();

  // Segments
  segments.forEach((seg, i) => {
    const start = angle + i * slice;
    const end   = start + slice;
    const mid   = start + slice / 2;

    // Base fill
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, R, start, end);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();

    // Depth gradient overlay
    const grad = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
    grad.addColorStop(0,   "rgba(255,255,255,0.05)");
    grad.addColorStop(0.5, "rgba(0,0,0,0)");
    grad.addColorStop(1,   "rgba(0,0,0,0.3)");
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, R, start, end);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Spoke line
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + R * Math.cos(start), CY + R * Math.sin(start));
    ctx.strokeStyle = seg.borderColor;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Label
    const lx = CX + R * 0.65 * Math.cos(mid);
    const ly = CY + R * 0.65 * Math.sin(mid);
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(mid + Math.PI / 2);
    ctx.font           = "bold 12px 'Cinzel', Georgia, serif";
    ctx.fillStyle      = seg.textColor;
    ctx.textAlign      = "center";
    ctx.textBaseline   = "middle";
    ctx.shadowColor    = seg.textColor;
    ctx.shadowBlur     = 7;
    ctx.fillText(seg.label, 0, 0);
    ctx.restore();
  });

  // Gold outer ring (3 layers for depth)
  [
    { r: R + 1, w: 10, color: GOLD_DIM,    alpha: 1   },
    { r: R + 2, w: 6,  color: GOLD,        alpha: 1   },
    { r: R + 3, w: 2,  color: GOLD_BRIGHT, alpha: 0.8 },
  ].forEach(({ r, w, color, alpha }) => {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth   = w;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Decorative notches on outer ring
  const notches = n * 3;
  for (let i = 0; i < notches; i++) {
    const a = (2 * Math.PI * i) / notches;
    ctx.beginPath();
    ctx.moveTo(CX + (R + 4)  * Math.cos(a), CY + (R + 4)  * Math.sin(a));
    ctx.lineTo(CX + (R + 10) * Math.cos(a), CY + (R + 10) * Math.sin(a));
    ctx.strokeStyle = GOLD_DIM;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Center hub
  ctx.beginPath();
  ctx.arc(CX, CY, 22, 0, 2 * Math.PI);
  ctx.fillStyle = "#110d06";
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth   = 3;
  ctx.stroke();

  // Gem on hub
  const gemGrad = ctx.createRadialGradient(CX - 4, CY - 4, 1, CX, CY, 12);
  gemGrad.addColorStop(0,   "#e8c96a");
  gemGrad.addColorStop(0.5, "#c9a84c");
  gemGrad.addColorStop(1,   "#5a3e10");
  ctx.beginPath();
  ctx.arc(CX, CY, 12, 0, 2 * Math.PI);
  ctx.fillStyle = gemGrad;
  ctx.fill();

  // Gem highlight
  ctx.beginPath();
  ctx.arc(CX - 3, CY - 3, 4, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fill();
}

// ─── DRAW DAGGER POINTER ─────────────────────────────────────────────────────
// Fixed at 12 o'clock, pointing DOWN into the wheel
function drawPointer(ctx: CanvasRenderingContext2D) {
  // tipY: just touching the outer ring
  const tipX  = CX;
  const tipY  = CY - R - 6;
  const baseY = tipY - 48;   // top of handle (pommel)

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur  = 10;

  // ── Blade ──
  const bladeGrad = ctx.createLinearGradient(tipX - 5, 0, tipX + 5, 0);
  bladeGrad.addColorStop(0,    "#5a3e10");
  bladeGrad.addColorStop(0.25, GOLD_BRIGHT);
  bladeGrad.addColorStop(0.5,  "#fff8e0");
  bladeGrad.addColorStop(0.75, GOLD);
  bladeGrad.addColorStop(1,    "#5a3e10");

  ctx.beginPath();
  ctx.moveTo(tipX,        tipY);           // tip
  ctx.lineTo(tipX - 4,    baseY + 16);     // left shoulder
  ctx.lineTo(tipX + 4,    baseY + 16);     // right shoulder
  ctx.closePath();
  ctx.fillStyle = bladeGrad;
  ctx.fill();

  // Blood groove (center line)
  ctx.beginPath();
  ctx.moveTo(tipX, tipY + 4);
  ctx.lineTo(tipX, baseY + 18);
  ctx.strokeStyle = "rgba(255,240,180,0.25)";
  ctx.lineWidth   = 1;
  ctx.stroke();

  // ── Crossguard ──
  const guardY    = baseY + 16;
  const guardGrad = ctx.createLinearGradient(tipX - 16, guardY, tipX + 16, guardY);
  guardGrad.addColorStop(0,   GOLD_DIM);
  guardGrad.addColorStop(0.5, GOLD_BRIGHT);
  guardGrad.addColorStop(1,   GOLD_DIM);

  ctx.beginPath();
  ctx.moveTo(tipX - 16, guardY + 1);
  ctx.lineTo(tipX - 13, guardY - 7);
  ctx.lineTo(tipX - 4,  guardY - 2);
  ctx.lineTo(tipX,      guardY - 6);
  ctx.lineTo(tipX + 4,  guardY - 2);
  ctx.lineTo(tipX + 13, guardY - 7);
  ctx.lineTo(tipX + 16, guardY + 1);
  ctx.lineTo(tipX + 12, guardY + 5);
  ctx.lineTo(tipX - 12, guardY + 5);
  ctx.closePath();
  ctx.fillStyle   = guardGrad;
  ctx.fill();
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  // ── Handle / Grip ──
  const handleTop = guardY + 5;
  const handleH   = 22;
  const hGrad     = ctx.createLinearGradient(tipX - 5, 0, tipX + 5, 0);
  hGrad.addColorStop(0,   "#1a0c04");
  hGrad.addColorStop(0.35, "#5a3e20");
  hGrad.addColorStop(0.65, "#3a2510");
  hGrad.addColorStop(1,   "#1a0c04");

  ctx.beginPath();
  (ctx as any).roundRect(tipX - 5, handleTop, 10, handleH, 2);
  ctx.fillStyle = hGrad;
  ctx.fill();

  // Grip wrappings
  for (let j = 0; j < 4; j++) {
    const wy = handleTop + 3 + j * 5;
    ctx.beginPath();
    ctx.moveTo(tipX - 5, wy);
    ctx.lineTo(tipX + 5, wy);
    ctx.strokeStyle = j % 2 === 0 ? GOLD_DIM : "rgba(90,62,16,0.6)";
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // ── Pommel ──
  const pommelY = handleTop + handleH + 6;
  const pGrad   = ctx.createRadialGradient(tipX - 2, pommelY - 2, 1, tipX, pommelY, 7);
  pGrad.addColorStop(0,   GOLD_BRIGHT);
  pGrad.addColorStop(0.6, GOLD);
  pGrad.addColorStop(1,   GOLD_DIM);

  ctx.beginPath();
  ctx.arc(tipX, pommelY, 7, 0, 2 * Math.PI);
  ctx.fillStyle = pGrad;
  ctx.fill();
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth   = 1;
  ctx.stroke();

  // Pommel gem highlight
  ctx.beginPath();
  ctx.arc(tipX - 2, pommelY - 2, 2.5, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fill();

  ctx.restore();
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function MedievalWheel({ segments, spinTo, onResult }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const angleRef    = useRef(0);
  const rafRef      = useRef<number>(0);
  const spinningRef = useRef(false);

  const render = useCallback((angle: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawWheel(ctx, angle, segments);
    drawPointer(ctx);
  }, [segments]);

  // Initial draw + redraw when segments change
  useEffect(() => {
    render(angleRef.current);
  }, [render]);

  // Spin when spinTo changes to a valid index
  useEffect(() => {
    if (spinTo === null || spinningRef.current) return;

    spinningRef.current  = true;
    const n          = segments.length;
    const sliceAngle = (2 * Math.PI) / n;
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const startAngle = angleRef.current;

    // Pointer is at top = angle -π/2
    // Random offset within the segment (10%–90% of slice) for tension
    const margin = sliceAngle * 0.12;   // keep away from exact edge
    const offset = margin + Math.random() * (sliceAngle - margin * 2);
    let delta = (-Math.PI / 2 - spinTo * sliceAngle - offset - startAngle) % (2 * Math.PI);
    if (delta > 0) delta -= 2 * Math.PI;           // always spin forward (CW)
    const totalDelta = delta - extraSpins * 2 * Math.PI;

    const t0 = performance.now();

    function frame(now: number) {
      const t       = Math.min((now - t0) / SPIN_DUR, 1);
      const current = startAngle + totalDelta * easeOut(t);
      angleRef.current = current;
      render(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        spinningRef.current = false;
        onResult(segments[spinTo!]);
      }
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spinTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ display: "block", maxWidth: "100%" }}
    />
  );
}