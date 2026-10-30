import { useEffect, useLayoutEffect, useRef } from 'react';
import { findItem } from '../../data/items';
import { cx } from '../../lib/cx';
import type { LootReelData } from './reelStrip';
import { RARITY_STYLE } from './rarityStyle';

type Props = {
  reel: LootReelData | null;
  spinning: boolean;
  onDone: () => void;
};

const REDUCED_SPIN_MS = 700;
// Avance casi constante al principio (se leen las opciones) y frenada larga al final.
const EASING = 'cubic-bezier(0.3, 0.35, 0.12, 1)';

/** Desplazamiento X que deja el centro de la carta (más el desfase) bajo la marca central. */
const centerOn = (viewport: HTMLElement, card: HTMLElement, jitter: number) =>
  viewport.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2 + jitter);

const LootReel = ({ reel, spinning, onDone }: Props) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const finalXRef = useRef(0);
  const jitterRef = useRef(0);
  const doneRef = useRef(true);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const complete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  const skip = () => {
    const track = trackRef.current;
    if (!track || doneRef.current) return;
    track.style.transition = 'none';
    track.style.transform = `translate3d(${finalXRef.current}px,0,0)`;
    complete();
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!reel || !viewport || !track) return;
    const card = track.children[reel.winnerIndex] as HTMLElement | undefined;
    const startCard = track.children[reel.startIndex] as HTMLElement | undefined;
    if (!card || !startCard) return;

    doneRef.current = false;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? REDUCED_SPIN_MS : reel.durationMs;
    // Desfase aleatorio dentro de la carta para que no pare siempre en el centro exacto.
    jitterRef.current = (Math.random() - 0.5) * card.offsetWidth * 0.7;
    const finalX = centerOn(viewport, card, jitterRef.current);
    finalXRef.current = finalX;

    track.style.transition = 'none';
    // Arranca con la primera opción del pool bajo la marca.
    track.style.transform = `translate3d(${centerOn(viewport, startCard, 0)}px,0,0)`;
    void track.offsetWidth; // fuerza reflow para que arranque desde ahí
    rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const raf = requestAnimationFrame(() => {
      track.style.transition = `transform ${duration}ms ${EASING}`;
      track.style.transform = `translate3d(${finalX}px,0,0)`;
    });
    // Respaldo por si no llega transitionend (pestaña oculta, etc.).
    const timer = window.setTimeout(complete, duration + 250);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel?.id]);

  // Si cambia el ancho (rotar móvil, redimensionar), recoloca la tira sobre el ganador.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!reel || !viewport || typeof ResizeObserver === 'undefined') return;
    let lastWidth = viewport.clientWidth;
    const ro = new ResizeObserver(() => {
      const track = trackRef.current;
      const card = track?.children[reel.winnerIndex] as HTMLElement | undefined;
      if (!track || !card || viewport.clientWidth === lastWidth) return;
      lastWidth = viewport.clientWidth;
      const finalX = centerOn(viewport, card, jitterRef.current);
      finalXRef.current = finalX;
      if (doneRef.current) {
        track.style.transition = 'none';
        track.style.transform = `translate3d(${finalX}px,0,0)`;
      }
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [reel]);

  if (!reel) return null;

  const winner = reel.items[reel.winnerIndex];

  return (
    <div ref={rootRef} className={cx('irs-reel', !spinning && 'irs-reel--done')}>
      <div
        ref={viewportRef}
        className="irs-reel-viewport"
        onClick={spinning ? skip : undefined}
        title={spinning ? 'Clic para saltar' : undefined}
      >
        <div
          ref={trackRef}
          className="irs-reel-track"
          onTransitionEnd={e => {
            if (e.target === e.currentTarget) complete();
          }}
        >
          {reel.items.map((item, i) => {
            const { color } = RARITY_STYLE[item.rarity];
            const name = item.entry.name;
            const img = findItem(name)?.imagen;
            const isWinner = i === reel.winnerIndex;
            return (
              <div
                key={i}
                className={cx(
                  'irs-reel-card',
                  `irs-reel-card--${item.rarity}`,
                  isWinner && 'irs-reel-card--winner',
                )}
                style={{ ['--rarity' as string]: color }}
              >
                <div className="irs-reel-card__img">
                  {img ? <img src={img} alt="" draggable={false} /> : <span>{name.charAt(0)}</span>}
                </div>
                <div className="irs-reel-card__name">{name}</div>
              </div>
            );
          })}
        </div>
        <div className="irs-reel-marker" aria-hidden="true" />
        <div className="irs-reel-fade irs-reel-fade--left" aria-hidden="true" />
        <div className="irs-reel-fade irs-reel-fade--right" aria-hidden="true" />
      </div>
      <div className="irs-reel-footer" aria-live="polite">
        {spinning ? (
          <button type="button" className="irs-reel-skip" onClick={skip}>
            Saltar ⏭
          </button>
        ) : (
          <span style={{ color: RARITY_STYLE[winner.rarity].color }}>
            ¡{winner.entry.name}! <em>· {RARITY_STYLE[winner.rarity].badge}</em>
          </span>
        )}
      </div>
    </div>
  );
};

export default LootReel;
