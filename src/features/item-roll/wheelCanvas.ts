export type WheelSegment = {
  label: string;
  color: string;
  textColor: string;
  borderColor: string;
};

export const WHEEL_WIDTH = 300;
/** Más alto que ancho para dejar sitio a la daga encima de la rueda. */
export const WHEEL_HEIGHT = 380;

const GOLD        = '#c9a84c';
const GOLD_BRIGHT = '#e8c96a';
const GOLD_DIM    = '#7a5f28';
const CX          = WHEEL_WIDTH / 2;
const CY          = WHEEL_HEIGHT / 2 + 30;
const R           = WHEEL_WIDTH / 2 - 14;

function drawShadow(ctx: CanvasRenderingContext2D) {
  const shadow = ctx.createRadialGradient(CX, CY, R - 6, CX, CY, R + 18);
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.beginPath();
  ctx.arc(CX, CY, R + 18, 0, 2 * Math.PI);
  ctx.fillStyle = shadow;
  ctx.fill();
}

function drawSegment(ctx: CanvasRenderingContext2D, segment: WheelSegment, start: number, slice: number) {
  const end = start + slice;
  const mid = start + slice / 2;

  ctx.beginPath();
  ctx.moveTo(CX, CY);
  ctx.arc(CX, CY, R, start, end);
  ctx.closePath();
  ctx.fillStyle = segment.color;
  ctx.fill();

  const depth = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
  depth.addColorStop(0,   'rgba(255,255,255,0.05)');
  depth.addColorStop(0.5, 'rgba(0,0,0,0)');
  depth.addColorStop(1,   'rgba(0,0,0,0.3)');
  ctx.beginPath();
  ctx.moveTo(CX, CY);
  ctx.arc(CX, CY, R, start, end);
  ctx.closePath();
  ctx.fillStyle = depth;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(CX, CY);
  ctx.lineTo(CX + R * Math.cos(start), CY + R * Math.sin(start));
  ctx.strokeStyle = segment.borderColor;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  const labelX = CX + R * 0.65 * Math.cos(mid);
  const labelY = CY + R * 0.65 * Math.sin(mid);
  ctx.save();
  ctx.translate(labelX, labelY);
  ctx.rotate(mid + Math.PI / 2);
  ctx.font         = "bold 12px 'Cinzel', Georgia, serif";
  ctx.fillStyle    = segment.textColor;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = segment.textColor;
  ctx.shadowBlur   = 7;
  ctx.fillText(segment.label, 0, 0);
  ctx.restore();
}

function drawRim(ctx: CanvasRenderingContext2D, segmentCount: number) {
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

  const notches = segmentCount * 3;
  for (let i = 0; i < notches; i++) {
    const a = (2 * Math.PI * i) / notches;
    ctx.beginPath();
    ctx.moveTo(CX + (R + 4)  * Math.cos(a), CY + (R + 4)  * Math.sin(a));
    ctx.lineTo(CX + (R + 10) * Math.cos(a), CY + (R + 10) * Math.sin(a));
    ctx.strokeStyle = GOLD_DIM;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }
}

function drawHub(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(CX, CY, 22, 0, 2 * Math.PI);
  ctx.fillStyle = '#110d06';
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth   = 3;
  ctx.stroke();

  const gem = ctx.createRadialGradient(CX - 4, CY - 4, 1, CX, CY, 12);
  gem.addColorStop(0,   '#e8c96a');
  gem.addColorStop(0.5, '#c9a84c');
  gem.addColorStop(1,   '#5a3e10');
  ctx.beginPath();
  ctx.arc(CX, CY, 12, 0, 2 * Math.PI);
  ctx.fillStyle = gem;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(CX - 3, CY - 3, 4, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
}

/** Puntero fijo a las 12, apuntando hacia abajo con la punta tocando el aro exterior. */
function drawDagger(ctx: CanvasRenderingContext2D) {
  const tipX  = CX;
  const tipY  = CY - R - 6;
  const baseY = tipY - 48;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur  = 10;

  // Hoja
  const bladeGrad = ctx.createLinearGradient(tipX - 5, 0, tipX + 5, 0);
  bladeGrad.addColorStop(0,    '#5a3e10');
  bladeGrad.addColorStop(0.25, GOLD_BRIGHT);
  bladeGrad.addColorStop(0.5,  '#fff8e0');
  bladeGrad.addColorStop(0.75, GOLD);
  bladeGrad.addColorStop(1,    '#5a3e10');

  ctx.beginPath();
  ctx.moveTo(tipX,     tipY);
  ctx.lineTo(tipX - 4, baseY + 16);
  ctx.lineTo(tipX + 4, baseY + 16);
  ctx.closePath();
  ctx.fillStyle = bladeGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(tipX, tipY + 4);
  ctx.lineTo(tipX, baseY + 18);
  ctx.strokeStyle = 'rgba(255,240,180,0.25)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  // Guarda
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

  // Empuñadura
  const handleTop  = guardY + 5;
  const handleH    = 22;
  const handleGrad = ctx.createLinearGradient(tipX - 5, 0, tipX + 5, 0);
  handleGrad.addColorStop(0,    '#1a0c04');
  handleGrad.addColorStop(0.35, '#5a3e20');
  handleGrad.addColorStop(0.65, '#3a2510');
  handleGrad.addColorStop(1,    '#1a0c04');

  ctx.beginPath();
  ctx.roundRect(tipX - 5, handleTop, 10, handleH, 2);
  ctx.fillStyle = handleGrad;
  ctx.fill();

  for (let j = 0; j < 4; j++) {
    const wrapY = handleTop + 3 + j * 5;
    ctx.beginPath();
    ctx.moveTo(tipX - 5, wrapY);
    ctx.lineTo(tipX + 5, wrapY);
    ctx.strokeStyle = j % 2 === 0 ? GOLD_DIM : 'rgba(90,62,16,0.6)';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Pomo
  const pommelY    = handleTop + handleH + 6;
  const pommelGrad = ctx.createRadialGradient(tipX - 2, pommelY - 2, 1, tipX, pommelY, 7);
  pommelGrad.addColorStop(0,   GOLD_BRIGHT);
  pommelGrad.addColorStop(0.6, GOLD);
  pommelGrad.addColorStop(1,   GOLD_DIM);

  ctx.beginPath();
  ctx.arc(tipX, pommelY, 7, 0, 2 * Math.PI);
  ctx.fillStyle = pommelGrad;
  ctx.fill();
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(tipX - 2, pommelY - 2, 2.5, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();

  ctx.restore();
}

export function drawWheelScene(ctx: CanvasRenderingContext2D, angle: number, segments: WheelSegment[]) {
  const slice = (2 * Math.PI) / segments.length;

  ctx.clearRect(0, 0, WHEEL_WIDTH, WHEEL_HEIGHT);
  drawShadow(ctx);
  segments.forEach((segment, i) => drawSegment(ctx, segment, angle + i * slice, slice));
  drawRim(ctx, segments.length);
  drawHub(ctx);
  drawDagger(ctx);
}
