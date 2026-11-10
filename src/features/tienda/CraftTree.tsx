import { useLayoutEffect, useRef, useState } from 'react';
import ThumbImg from '../../components/ThumbImg';
import { cx } from '../../lib/cx';
import type { CraftTreeNode } from '../items/craftPlan';

const formatGold = (amount: number): string => amount.toLocaleString('es-ES');

/** Margen horizontal interno (px) a cada lado al escalar, además del padding del panel. */
const FIT_MARGIN = 8;

function nodePrice(node: CraftTreeNode): { text: string; kind: 'paid' | 'owned' | 'buy' | 'free' } {
  if (node.status === 'root') {
    return { text: formatGold(node.gold), kind: node.gold > 0 ? 'paid' : 'free' };
  }
  if (node.status === 'owned' || (node.fromStock >= node.needed && node.needed > 0 && node.missing === 0 && node.crafted === 0)) {
    return { text: '✓', kind: 'owned' };
  }
  if (node.gold > 0) return { text: formatGold(node.gold), kind: 'paid' };
  if (node.missing > 0) {
    const unit = typeof node.item?.coste === 'number' ? node.item.coste : 0;
    const total = unit * node.missing;
    return { text: total > 0 ? formatGold(total) : 'Falta', kind: 'buy' };
  }
  if (typeof node.item?.coste === 'number' && node.item.coste > 0) {
    return { text: formatGold(node.item.coste), kind: 'buy' };
  }
  return { text: '0', kind: 'free' };
}

type SubtreeProps = {
  node: CraftTreeNode;
  onSelect?: (name: string) => void;
  selectedName?: string | null;
  isRoot?: boolean;
};

const Subtree = ({ node, onSelect, selectedName, isRoot }: SubtreeProps) => {
  const price = nodePrice(node);
  const selected = selectedName ? selectedName === node.name : Boolean(isRoot);
  const owned = price.kind === 'owned';
  const clickable = Boolean(node.item && onSelect && !isRoot);
  const qty = node.needed > 1 ? `×${node.needed}` : '';
  const childCount = node.children.length;

  return (
    <div className={cx('lol-tree__subtree', owned && 'lol-tree__subtree--owned', `lol-tree__subtree--${node.status}`)}>
      <div className="lol-tree__head">
        <button
          type="button"
          className={cx('lol-tree__icon', selected && 'lol-tree__icon--selected', owned && 'lol-tree__icon--owned')}
          disabled={!clickable}
          title={node.name}
          onClick={() => {
            if (clickable && node.item) onSelect?.(node.item.nombre);
          }}
        >
          {node.item?.imagen
            ? <ThumbImg src={node.item.imagen} thumbWidth={64} alt="" />
            : <span className="lol-tree__fallback">✦</span>}
          {owned && <span className="lol-tree__check" aria-hidden="true">✓</span>}
          {qty && <span className="lol-tree__qty">{qty}</span>}
        </button>
        <div className={cx('lol-tree__price', `lol-tree__price--${price.kind}`)} title={node.name}>
          {price.kind !== 'owned' && <span className="lol-tree__coin" aria-hidden="true">◈</span>}
          <span>{price.text}</span>
        </div>
      </div>

      {childCount > 0 && (
        <div
          className={cx('lol-tree__kids', childCount === 1 && 'lol-tree__kids--single')}
          aria-label={`Componentes de ${node.name}`}
        >
          {node.children.map((child, index) => (
            <Subtree
              key={`${child.name}-${child.needed}-${child.fromStock}-${child.crafted}-${index}`}
              node={child}
              onSelect={onSelect}
              selectedName={selectedName}
            />
          ))}
        </div>
      )}
    </div>
  );
};

type Props = {
  tree: CraftTreeNode;
  onSelect?: (name: string) => void;
  selectedName?: string | null;
};

type Fit = {
  scale: number;
  naturalW: number;
  naturalH: number;
  offsetX: number;
  padY: number;
};

/**
 * Escala robusta: mide el wrapper sin transformar (offsetWidth/Height),
 * available = clientWidth − padding − margen, origin top-left + translateX para centrar.
 */
const CraftTree = ({ tree, onSelect, selectedName }: Props) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, naturalW: 0, naturalH: 0, offsetX: 0, padY: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return undefined;

    const measure = () => {
      const styles = getComputedStyle(viewport);
      const padL = Number.parseFloat(styles.paddingLeft) || 0;
      const padR = Number.parseFloat(styles.paddingRight) || 0;
      const padT = Number.parseFloat(styles.paddingTop) || 0;
      const padB = Number.parseFloat(styles.paddingBottom) || 0;
      // offset* ignora transform → tamaño natural del width:max-content
      const naturalW = Math.ceil(stage.offsetWidth);
      const naturalH = Math.ceil(stage.offsetHeight);
      const available = Math.max(0, viewport.clientWidth - padL - padR - FIT_MARGIN * 2);
      const scale = naturalW > 0 ? Math.min(1, available / naturalW) : 1;
      const offsetX = padL + FIT_MARGIN + (available - naturalW * scale) / 2;
      setFit(current => {
        if (
          Math.abs(current.scale - scale) < 0.002
          && current.naturalW === naturalW
          && current.naturalH === naturalH
          && Math.abs(current.offsetX - offsetX) < 0.5
        ) {
          return current;
        }
        return { scale, naturalW, naturalH, offsetX, padY: padT + padB };
      });
    };

    measure();
    const ro = new ResizeObserver(() => { measure(); });
    ro.observe(viewport);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [tree, selectedName]);

  const boxH = fit.naturalH > 0
    ? Math.ceil(fit.naturalH * fit.scale + fit.padY)
    : undefined;

  return (
    <div
      className="lol-tree"
      ref={viewportRef}
      style={boxH ? { height: boxH } : undefined}
    >
      <div
        className="lol-tree__stage"
        ref={stageRef}
        style={{
          transform: `translate(${fit.offsetX}px, 0) scale(${fit.scale})`,
          transformOrigin: 'top left',
        }}
      >
        <Subtree
          node={tree}
          onSelect={onSelect}
          selectedName={selectedName ?? tree.name}
          isRoot
        />
      </div>
    </div>
  );
};

export default CraftTree;
