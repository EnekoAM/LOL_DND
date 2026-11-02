/**
 * Particulas del portal yordle, portadas del efecto oficial de map.leagueoflegends.com
 * (initBandleCity + shaders «yordle portal vert» / «yordle frag»): 400 chispas al azar en
 * un cuadrado de 20 unidades, visibles solo donde la mascara del glifo de Bandle es clara,
 * que suben, se mecen y se encogen en bucle con mezcla aditiva.
 */
const COUNT = 400;
const WIDTH = 20;
const Z_SPEED = 0.4;
const WOBBLE_RANGE = 2;
const SIZE = 6;
/** Cuanto suben en pantalla (fraccion del lienzo) al ir de abajo arriba. */
const RISE = 0.12;
const OPACITY = 0.9;

type Particle = { x: number; y: number; z: number; seed: number; mask: number };

function random1d(n: number): number {
  const v = Math.sin(n) * 43758.5453;
  return v - Math.floor(v);
}

function noise1d(p: number): number {
  const fl = Math.floor(p);
  const fc = p - fl;
  return random1d(fl) * (1 - fc) + random1d(fl + 1) * fc;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

/** Anima el lienzo hasta llamar a la funcion devuelta. */
export function startYordlePortalFx(canvas: HTMLCanvasElement, maskUrl: string, particleUrl: string): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let stopped = false;
  let frame = 0;
  const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  void Promise.all([loadImage(maskUrl), loadImage(particleUrl)])
    .then(([mask, sprite]) => {
      if (stopped) return;
      const sampler = document.createElement('canvas');
      sampler.width = mask.naturalWidth;
      sampler.height = mask.naturalHeight;
      const sctx = sampler.getContext('2d', { willReadFrequently: true });
      if (!sctx) return;
      sctx.drawImage(mask, 0, 0);
      const pixels = sctx.getImageData(0, 0, sampler.width, sampler.height).data;
      const maskAt = (u: number, v: number) => {
        const px = Math.min(sampler.width - 1, Math.max(0, Math.floor(u * sampler.width)));
        const py = Math.min(sampler.height - 1, Math.max(0, Math.floor((1 - v) * sampler.height)));
        return pixels[(py * sampler.width + px) * 4] / 255;
      };

      const particles: Particle[] = [];
      for (let i = 0; i < COUNT; i++) {
        const x = WIDTH * Math.random() - WIDTH / 2;
        const y = WIDTH * Math.random() - WIDTH / 2;
        const value = maskAt(x / WIDTH + 0.5, y / WIDTH + 0.5);
        if (value > 0.02) particles.push({ x, y, z: Math.random(), seed: Math.random(), mask: value });
      }

      const draw = (now: number) => {
        if (stopped) return;
        const w = canvas.width;
        const h = canvas.height;
        const time = now / 1000;
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
          const zNorm = (((p.z + time * Z_SPEED) % 1) + 1) % 1;
          const x = p.x + noise1d((zNorm + p.seed) * 5) * WOBBLE_RANGE - WOBBLE_RANGE / 2;
          const y = p.y + noise1d((zNorm + p.seed) * 5 + 100) * WOBBLE_RANGE - WOBBLE_RANGE / 2;
          const size = (SIZE * p.seed + 5) * (1 - zNorm) * (w / 150);
          if (size < 0.5) continue;
          const sx = (x / WIDTH + 0.5) * w;
          const sy = (0.5 - y / WIDTH) * h - zNorm * RISE * h;
          ctx.globalAlpha = p.mask * OPACITY;
          ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (!reduceMotion) frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    })
    .catch(() => {
      /* sin particulas: queda el glifo */
    });

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
