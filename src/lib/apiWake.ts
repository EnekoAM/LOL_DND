/**
 * Aviso global de arranque en frio de la API.
 *
 * En produccion /api va (rewrite de Vercel) a Render Free, que se duerme tras
 * ~15 min sin trafico y tarda hasta ~1 min en despertar. Si alguna peticion a
 * /api lleva pendiente mas de SHOW_AFTER_MS, se muestra un spinner con
 * "Despertando Render..." para que no parezca que la web ha petado. Se oculta
 * en cuanto no queda ninguna peticion pendiente. Los errores siguen su curso:
 * solo se observa la promesa, no se modifica.
 */

/** Umbral antes de mostrar el aviso (en localhost las respuestas son instantaneas). */
const SHOW_AFTER_MS = 2500;

let installed = false;
let pending = 0;
let showTimer: number | undefined;
let el: HTMLDivElement | null = null;

function isApiRequest(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

function ensureElement(): HTMLDivElement {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'api-wake';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  el.innerHTML =
    '<div class="api-wake__card">' +
    '<span class="api-wake__spinner" aria-hidden="true"></span>' +
    '<p class="api-wake__title">Despertando Render\u2026</p>' +
    '<p class="api-wake__sub">El servidor estaba dormido; puede tardar hasta un minuto.</p>' +
    '</div>';
  document.body.appendChild(el);
  return el;
}

function show(): void {
  showTimer = undefined;
  if (pending === 0) return;
  const node = ensureElement();
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add('api-wake--visible'));
}

function hide(): void {
  if (showTimer !== undefined) {
    window.clearTimeout(showTimer);
    showTimer = undefined;
  }
  if (!el) return;
  el.classList.remove('api-wake--visible');
  el.hidden = true;
}

function begin(): void {
  pending += 1;
  if (pending === 1 && showTimer === undefined) {
    showTimer = window.setTimeout(show, SHOW_AFTER_MS);
  }
}

function end(): void {
  pending = Math.max(0, pending - 1);
  if (pending === 0) hide();
}

/** Envuelve window.fetch para contar las peticiones a /api en curso. Idempotente. */
export function installApiWakeIndicator(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isApiRequest(input)) return original(input, init);
    begin();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      end();
    };
    const request = original(input, init);
    request.then(done, done);
    return request;
  };
}