import { useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { canDropItem, type ItemDragState } from './itemOrder';

type Props = {
  children: ReactNode;
  name: string;
  index: number;
  items: readonly string[];
  group: string;
  dragged: MutableRefObject<ItemDragState | null>;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
};

/** Separate drag handle/arrows keep inspection and removal clicks independent. */
const ReorderableItem = ({ children, name, index, items, group, dragged, disabled, onMove }: Props) => {
  const root = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const move = (from: number, to: number) => {
    if (disabled || from === to || to < 0 || to >= items.length) return;
    const grid = root.current?.parentElement;
    onMove(from, to);
    // Index-based item keys may remount the moved tile; restore its keyboard handle.
    requestAnimationFrame(() => grid?.querySelectorAll<HTMLButtonElement>('[data-reorder-handle]')[to]?.focus());
  };
  return (
    <div ref={root} className={`sheet-order-item${over ? ' sheet-order-item--over' : ''}`}
      onDragOver={event => {
        if (disabled || !canDropItem(dragged.current, group, items)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={event => {
        setOver(false);
        if (disabled || !canDropItem(dragged.current, group, items)) return;
        event.preventDefault();
        event.stopPropagation();
        const from = dragged.current.index;
        dragged.current = null;
        move(from, index);
      }}>
      {children}
      <div className="sheet-order-controls" role="group" aria-label={`Ordenar ${name}`}>
        <button type="button" disabled={disabled || index === 0} aria-label={`Mover ${name} a la izquierda`}
          title="Mover a la izquierda" onClick={() => move(index, index - 1)}>←</button>
        <button type="button" data-reorder-handle draggable={!disabled} disabled={disabled}
          aria-label={`Arrastrar ${name}, posición ${index + 1} de ${items.length}. Usa las flechas izquierda y derecha para ordenar.`}
          title="Arrastra para ordenar o usa ← y → con el foco aquí"
          onDragStart={event => {
            if (disabled) { event.preventDefault(); return; }
            event.stopPropagation();
            dragged.current = { group, index, items: [...items] };
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
          }}
          onDragEnd={() => { dragged.current = null; setOver(false); }}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            event.stopPropagation();
            move(index, index + (event.key === 'ArrowLeft' ? -1 : 1));
          }}>⠿</button>
        <button type="button" disabled={disabled || index === items.length - 1} aria-label={`Mover ${name} a la derecha`}
          title="Mover a la derecha" onClick={() => move(index, index + 1)}>→</button>
      </div>
    </div>
  );
};

export default ReorderableItem;