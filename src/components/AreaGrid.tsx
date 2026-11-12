import { useEffect, useRef, useState } from 'react';
import { AREA_SIZES, blankArea, isAreaEmpty, resizeArea, type AreaCell, type AreaPattern } from '../data/areaPattern';
import './AreaGrid.css';

type Tool = 'user' | 'target' | 'tile' | 'erase';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'user', label: 'Usuario' },
  { id: 'target', label: 'Objetivo' },
  { id: 'tile', label: 'Área' },
  { id: 'erase', label: 'Borrar' },
];

const same = (a: AreaCell | null, x: number, y: number) => !!a && a[0] === x && a[1] === y;

function Board({ area, cellPx, onCellDown, onCellEnter }: {
  area: AreaPattern;
  cellPx: number;
  onCellDown?: (x: number, y: number) => void;
  onCellEnter?: (x: number, y: number) => void;
}) {
  const tiles = new Set(area.tiles.map(c => c.join(',')));
  const cells = [];
  for (let y = 0; y < area.size; y++) {
    for (let x = 0; x < area.size; x++) {
      const isUser = same(area.user, x, y);
      const isTarget = same(area.target, x, y);
      const cls = ['area-cell', tiles.has(`${x},${y}`) ? 'is-tile' : '', isUser ? 'is-user' : '', isTarget ? 'is-target' : ''].filter(Boolean).join(' ');
      cells.push(
        <div
          key={`${x},${y}`}
          className={cls}
          onPointerDown={onCellDown ? e => { e.preventDefault(); onCellDown(x, y); } : undefined}
          onPointerEnter={onCellEnter ? () => onCellEnter(x, y) : undefined}
        >
          {isUser || isTarget ? <span className="area-dot" /> : null}
        </div>,
      );
    }
  }
  return (
    <div
      className={`area-board${onCellDown ? ' is-editable' : ''}`}
      style={{ gridTemplateColumns: `repeat(${area.size}, ${cellPx}px)`, gridAutoRows: `${cellPx}px` }}
    >
      {cells}
    </div>
  );
}

/** Tablero solo lectura (detalle de objeto, ficha / combate). No pinta nada si el área está vacía. */
export function AreaGridView({ area, cellPx = 10, caption }: { area: AreaPattern | null | undefined; cellPx?: number; caption?: string }) {
  if (!area || isAreaEmpty(area)) return null;
  return (
    <div className="area-view">
      <Board area={area} cellPx={cellPx} />
      <div className="area-legend">
        {caption ? <span>{caption}</span> : null}
        {area.user ? <span><i className="area-key is-user" />Usuario</span> : null}
        {area.target ? <span><i className="area-key is-target" />Objetivo</span> : null}
        {area.tiles.length ? <span><i className="area-key is-tile" />Área ({area.tiles.length})</span> : null}
      </div>
    </div>
  );
}

/**
 * Editor del tablero: Usuario (punto azul, uno), Objetivo (punto rojo, uno), Área (marca / desmarca casillas,
 * se puede arrastrar), Borrar. value null = sin área; onChange(null) cuando se limpia del todo.
 */
export function AreaGridEditor({ value, onChange, disabled }: { value: AreaPattern | null | undefined; onChange: (next: AreaPattern | null) => void; disabled?: boolean }) {
  const [tool, setTool] = useState<Tool>('tile');
  const area = value ?? blankArea();
  const drag = useRef<{ paint: boolean } | null>(null);
  const latest = useRef(area);
  latest.current = area;

  useEffect(() => {
    const stop = () => { drag.current = null; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const commit = (next: AreaPattern) => {
    latest.current = next;
    onChange(isAreaEmpty(next) ? null : next);
  };

  const setTile = (current: AreaPattern, x: number, y: number, on: boolean): AreaPattern => {
    const has = current.tiles.some(c => c[0] === x && c[1] === y);
    if (has === on) return current;
    return { ...current, tiles: on ? [...current.tiles, [x, y]] : current.tiles.filter(c => !(c[0] === x && c[1] === y)) };
  };

  const down = (x: number, y: number) => {
    if (disabled) return;
    const current = latest.current;
    if (tool === 'user') commit({ ...current, user: same(current.user, x, y) ? null : [x, y] });
    else if (tool === 'target') commit({ ...current, target: same(current.target, x, y) ? null : [x, y] });
    else if (tool === 'tile') {
      const paint = !current.tiles.some(c => c[0] === x && c[1] === y);
      drag.current = { paint };
      commit(setTile(current, x, y, paint));
    } else {
      drag.current = { paint: false };
      commit({ ...setTile(current, x, y, false), user: same(current.user, x, y) ? null : current.user, target: same(current.target, x, y) ? null : current.target });
    }
  };

  const enter = (x: number, y: number) => {
    if (disabled || !drag.current) return;
    const current = latest.current;
    if (tool === 'tile') commit(setTile(current, x, y, drag.current.paint));
    else if (tool === 'erase') commit({ ...setTile(current, x, y, false), user: same(current.user, x, y) ? null : current.user, target: same(current.target, x, y) ? null : current.target });
  };

  return (
    <div className="area-editor">
      <div className="area-toolbar">
        {TOOLS.map(t => (
          <button key={t.id} type="button" className={`area-tool area-tool-${t.id}${tool === t.id ? ' is-active' : ''}`} disabled={disabled} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
        <label className="area-size">
          Tamaño
          <select value={area.size} disabled={disabled} onChange={e => commit(resizeArea(area, Number(e.target.value)))}>
            {AREA_SIZES.map(size => <option key={size} value={size}>{size}×{size}</option>)}
          </select>
        </label>
        <button type="button" className="area-tool" disabled={disabled || isAreaEmpty(value)} onClick={() => onChange(null)}>Limpiar</button>
      </div>
      <Board area={area} cellPx={area.size > 15 ? 16 : 20} onCellDown={down} onCellEnter={enter} />
      <div className="area-legend">
        <span><i className="area-key is-user" />Usuario</span>
        <span><i className="area-key is-target" />Objetivo</span>
        <span><i className="area-key is-tile" />Área ({area.tiles.length})</span>
        <span className="area-hint">Arrastra para pintar varias casillas.</span>
      </div>
    </div>
  );
}
