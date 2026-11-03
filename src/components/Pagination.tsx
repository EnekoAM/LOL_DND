import { useRef } from 'react';
import { cx } from '../lib/cx';

export const PAGE_SIZE = 50;

/** Número de páginas para `total` elementos (mínimo 1). */
export const pageCount = (total: number, pageSize = PAGE_SIZE) => Math.max(1, Math.ceil(total / pageSize));

/** Página válida (1..n) aunque la lista haya encogido tras filtrar o borrar. */
export const clampPage = (page: number, total: number, pageSize = PAGE_SIZE) =>
  Math.min(Math.max(1, page), pageCount(total, pageSize));

/** Elementos de la página `page` (1-based). */
export const pageSlice = <T,>(items: T[], page: number, pageSize = PAGE_SIZE): T[] => {
  const current = clampPage(page, items.length, pageSize);
  return items.slice((current - 1) * pageSize, current * pageSize);
};

/** Números a mostrar: primera, última y vecinas de la actual; null = «…». */
const pageNumbers = (current: number, total: number): (number | null)[] => {
  const wanted = new Set([1, total, current - 1, current, current + 1].filter(n => n >= 1 && n <= total));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
};

type Props = {
  page: number;
  total: number;
  onChange: (page: number) => void;
  pageSize?: number;
  /** Al cambiar de página desde abajo, sube al principio de la pantalla. */
  scrollOnChange?: boolean;
};

/** Controles de paginación: «Anterior», números, «Siguiente» y «Página X de Y». */
const Pagination = ({ page, total, onChange, pageSize = PAGE_SIZE, scrollOnChange }: Props) => {
  const ref = useRef<HTMLElement>(null);
  const pages = pageCount(total, pageSize);
  if (pages <= 1) return null;
  const current = clampPage(page, total, pageSize);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const go = (next: number) => {
    const target = Math.min(Math.max(1, next), pages);
    if (target === current) return;
    onChange(target);
    if (scrollOnChange) {
      const root = ref.current?.closest('.calc-root') ?? ref.current?.parentElement;
      root?.scrollIntoView({ block: 'start' });
    }
  };

  return (
    <nav ref={ref} className="calc-pagination" aria-label="Paginación">
      <button
        type="button"
        className="calc-learned-toggle"
        disabled={current <= 1}
        onClick={() => go(current - 1)}
      >‹ Anterior</button>
      <span className="calc-pagination__pages">
        {pageNumbers(current, pages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="calc-pagination__gap" aria-hidden="true">…</span>
          ) : (
            <button
              key={n}
              type="button"
              className={cx('calc-learned-toggle', 'calc-pagination__num', n === current && 'calc-learned-toggle--on')}
              aria-current={n === current ? 'page' : undefined}
              onClick={() => go(n)}
            >{n}</button>
          ),
        )}
      </span>
      <button
        type="button"
        className="calc-learned-toggle"
        disabled={current >= pages}
        onClick={() => go(current + 1)}
      >Siguiente ›</button>
      <span className="calc-pagination__info">
        Página {current} de {pages} · {from}–{to} de {total}
      </span>
    </nav>
  );
};

export default Pagination;
