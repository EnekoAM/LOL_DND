import type { CSSProperties } from 'react';
import { cx } from '../../lib/cx';
import './HpExtras.css';

/**
 * Vida estilo LoL: la barra se escala a max(vida max., vida + extras) y la vida temporal (verde oscuro) y los escudos
 * van como tramos a continuacion de la vida: escudo generico blanco, fisico naranja, magico morado.
 * Hoy el combate solo lleva un escudo generico (no hay escudos por tipo de dano).
 */
export type HpExtras = { tempHp?: number; shield?: number; physicalShield?: number; magicShield?: number };

type ExtraKey = 'temp' | 'physical' | 'magic' | 'shield';
const ORDER: readonly ExtraKey[] = ['temp', 'physical', 'magic', 'shield'];

const positive = (value: number | undefined): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

const valueOf = (extras: HpExtras, key: ExtraKey): number =>
  positive(key === 'temp' ? extras.tempHp : key === 'shield' ? extras.shield : key === 'physical' ? extras.physicalShield : extras.magicShield);

const LABEL: Record<ExtraKey, (value: number) => string> = {
  temp: value => `+${value} vida temp.`,
  shield: value => `Escudo ${value}`,
  physical: value => `Esc. f\u00edsico ${value}`,
  magic: value => `Esc. m\u00e1gico ${value}`,
};

export function hpSegments(current: number, max: number, extras: HpExtras): { hpPct: number; segments: { key: ExtraKey; left: number; width: number }[] } {
  const hp = Math.max(0, current);
  const parts = ORDER.map(key => ({ key, value: valueOf(extras, key) })).filter(part => part.value > 0);
  const total = Math.max(max, hp + parts.reduce((sum, part) => sum + part.value, 0), 1);
  const hpPct = Math.min(100, (hp / total) * 100);
  let left = hpPct;
  const segments = parts.map(part => {
    const width = (part.value / total) * 100;
    const segment = { key: part.key, left, width };
    left += width;
    return segment;
  });
  return { hpPct, segments };
}

/** Texto para un title: "Vida 40 / 60 + 12 vida temp. + Escudo 8". */
export function hpExtrasText(extras: HpExtras): string {
  return ORDER.filter(key => valueOf(extras, key) > 0).map(key => ` \u00b7 ${LABEL[key](valueOf(extras, key))}`).join('');
}

/** Pista de la barra: vida (con su clase de siempre) + tramos de vida temporal / escudos. */
export function HpTrack({ current, max, extras, className, fillClassName, fillStyle, title }: {
  current: number;
  max: number;
  extras: HpExtras;
  className: string;
  fillClassName: string;
  fillStyle?: CSSProperties;
  title?: string;
}) {
  const { hpPct, segments } = hpSegments(current, max, extras);
  return (
    <span className={cx(className, 'hpx-track')} title={title}>
      <span className={cx(fillClassName, 'hpx-fill')} style={{ ...fillStyle, width: `${hpPct}%` }} />
      {segments.map(segment => (
        <span key={segment.key} className={`hpx-seg hpx-seg--${segment.key}`} style={{ left: `${segment.left}%`, width: `${segment.width}%` }} />
      ))}
    </span>
  );
}

/** Etiquetas legibles: "+N vida temp.", "Escudo N", "Esc. fisico N", "Esc. magico N". */
export function HpExtrasTags({ extras, className }: { extras: HpExtras; className?: string }) {
  const tags = ORDER.map(key => ({ key, value: valueOf(extras, key) })).filter(tag => tag.value > 0);
  if (tags.length === 0) return null;
  return (
    <span className={cx('hpx-tags', className)}>
      {tags.map(tag => <span key={tag.key} className={`hpx-tag hpx-tag--${tag.key}`}>{LABEL[tag.key](tag.value)}</span>)}
    </span>
  );
}