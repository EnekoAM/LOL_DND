import { findItem, type Item, ITEMS } from '../../data/items';
import { normalizeName } from '../../lib/text';
import { craftStepCost, recipeLines } from './recipe';
import { itemAvailability } from './stock';

export type CraftStep = {
  item: Item;
  copies: number;
  role: 'final' | 'intermediate';
  difference: number;
  fee: number;
  goldEach: number;
  goldTotal: number;
  ingredients: { name: string; needed: number; fromStock: number; crafted: number; bought: number }[];
};

/** Nodo del árbol visual de crafteo (ramificación). */
export type CraftTreeNode = {
  name: string;
  item: Item | undefined;
  needed: number;
  fromStock: number;
  crafted: number;
  missing: number;
  /** Oro de los crafteos de este nodo (suma de sus pasos). */
  gold: number;
  status: 'owned' | 'craft' | 'missing' | 'mixed' | 'root';
  children: CraftTreeNode[];
};

export type CraftCredit = {
  name: string;
  qty: number;
  unitCost: number;
  totalCost: number;
};

export type CraftPurchase = {
  name: string;
  qty: number;
  unitCost: number;
  totalCost: number;
  /** false si no se puede comprar en la tienda (botas, inicial, sin precio…). */
  purchasable: boolean;
};

export type CraftPlan = {
  ok: boolean;
  reason?: string;
  /** Oro del crafteo sin comprar nada (0 si está bloqueado). */
  gold: number;
  ownedCredit: number;
  credits: CraftCredit[];
  steps: CraftStep[];
  tree: CraftTreeNode | null;
  summary: string;
  /** Piezas básicas que faltan (para comprar). */
  purchases: CraftPurchase[];
  buyGold: number;
  /** Oro de crafteo si se compran las piezas faltantes. */
  craftGoldWithPurchases: number;
  /** buyGold + craftGoldWithPurchases. */
  totalWithPurchases: number;
  canBuyAndCraft: boolean;
  /** Precio de tienda del ítem final. */
  directBuyGold: number;
  /** true si comprar el final sale más barato (o casi) que buy+craft. */
  cheaperDirect: boolean;
};

type Bag = Map<string, number>;

const keyOf = (name: string) => normalizeName(name);

function unitCost(item: Item | undefined): number {
  return typeof item?.coste === 'number' && Number.isFinite(item.coste) && item.coste > 0 ? item.coste : 0;
}

function rarityKey(rareza: string): string {
  return rareza.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Misma regla de compra que la tienda / server tradeShop. */
export function isShopPurchasable(item: Item | undefined): boolean {
  if (!item) return false;
  if (unitCost(item) <= 0) return false;
  const key = rarityKey(item.rareza);
  if (key === 'prismatico' || key === 'inicial' || key === 'botas') return false;
  return true;
}

export function stockBagFromCatalog(items: Item[] = ITEMS): Bag {
  const bag: Bag = new Map();
  for (const item of items) {
    const avail = itemAvailability(item).available;
    if (avail > 0) bag.set(keyOf(item.nombre), avail);
  }
  return bag;
}

function statusOf(fromStock: number, crafted: number, missing: number): CraftTreeNode['status'] {
  if (missing > 0 && crafted === 0 && fromStock === 0) return 'missing';
  if (missing > 0) return 'mixed';
  if (crafted > 0 && fromStock > 0) return 'mixed';
  if (crafted > 0) return 'craft';
  return 'owned';
}

function nodeHasMissing(node: CraftTreeNode): boolean {
  if (node.missing > 0) return true;
  return node.children.some(nodeHasMissing);
}

function mergeSteps(steps: CraftStep[]): CraftStep[] {
  const merged: CraftStep[] = [];
  for (const step of steps) {
    const last = merged[merged.length - 1];
    if (
      last
      && keyOf(last.item.nombre) === keyOf(step.item.nombre)
      && last.goldEach === step.goldEach
      && last.role === step.role
    ) {
      last.copies += 1;
      last.goldTotal += step.goldEach;
      for (const ing of step.ingredients) {
        const prev = last.ingredients.find(entry => keyOf(entry.name) === keyOf(ing.name));
        if (prev) {
          prev.needed += ing.needed;
          prev.fromStock += ing.fromStock;
          prev.crafted += ing.crafted;
          prev.bought += ing.bought;
        } else {
          last.ingredients.push({ ...ing });
        }
      }
    } else {
      merged.push({
        ...step,
        ingredients: step.ingredients.map(entry => ({ ...entry })),
      });
    }
  }
  return merged;
}

function formatStep(step: CraftStep): string {
  const parts: string[] = [];
  if (step.difference > 0) parts.push(`diferencia ${step.difference.toLocaleString('es-ES')}`);
  if (step.fee > 0) parts.push(`10% ${step.fee.toLocaleString('es-ES')}`);
  const detail = parts.length > 0 ? ` (${parts.join(' + ')})` : '';
  return `${step.copies}× ${step.item.nombre}: ${step.goldTotal.toLocaleString('es-ES')} oro${detail}`;
}

function collectPurchasesFromTree(node: CraftTreeNode | null): CraftPurchase[] {
  const map = new Map<string, CraftPurchase>();
  const walk = (n: CraftTreeNode) => {
    const isBasic = !n.item || n.item.craftsFrom.length === 0;
    if (n.missing > 0 && isBasic) {
      const key = keyOf(n.name);
      const unit = unitCost(n.item);
      const purchasable = isShopPurchasable(n.item);
      const prev = map.get(key);
      if (prev) {
        prev.qty += n.missing;
        prev.totalCost += unit * n.missing;
      } else {
        map.set(key, {
          name: n.item?.nombre ?? n.name,
          qty: n.missing,
          unitCost: unit,
          totalCost: unit * n.missing,
          purchasable,
        });
      }
    }
    for (const child of n.children) walk(child);
  };
  if (node) walk(node);
  return [...map.values()];
}

type InternalPlan = {
  ok: boolean;
  reason?: string;
  gold: number;
  ownedCredit: number;
  credits: CraftCredit[];
  steps: CraftStep[];
  tree: CraftTreeNode | null;
  summary: string;
};

/**
 * Motor interno del plan. Si `virtualBuys` trae piezas, se añaden al almacén virtual
 * antes de planificar (simula comprar lo que falta).
 */
function planCraftInternal(item: Item, stock: Bag, copies: number, virtualBuys?: Bag): InternalPlan {
  const bag = new Map(stock);
  if (virtualBuys) {
    for (const [key, qty] of virtualBuys) {
      if (qty > 0) bag.set(key, (bag.get(key) ?? 0) + qty);
    }
  }
  const steps: CraftStep[] = [];
  const creditMap = new Map<string, CraftCredit>();
  let gold = 0;

  const addCredit = (name: string, it: Item | undefined, qty: number) => {
    if (qty <= 0) return;
    const key = keyOf(name);
    const unit = unitCost(it);
    const prev = creditMap.get(key);
    if (prev) {
      prev.qty += qty;
      prev.totalCost += unit * qty;
    } else {
      creditMap.set(key, {
        name: it?.nombre ?? name,
        qty,
        unitCost: unit,
        totalCost: unit * qty,
      });
    }
  };

  type NeedResult =
    | { ok: true; node: CraftTreeNode }
    | { ok: false; reason: string };

  const craftOne = (target: Item, depth: number, seen: Set<string>, role: 'final' | 'intermediate'): NeedResult => {
    if (depth > 8) return { ok: false, reason: 'Receta demasiado profunda' };
    const self = keyOf(target.nombre);
    if (seen.has(self)) return { ok: false, reason: `Ciclo en receta: ${target.nombre}` };
    const nextSeen = new Set(seen);
    nextSeen.add(self);

    const lines = recipeLines(target.craftsFrom);
    if (lines.length === 0) return { ok: false, reason: `${target.nombre} no se craftea` };

    const ingredientReport: CraftStep['ingredients'] = [];
    const children: CraftTreeNode[] = [];

    for (const line of lines) {
      let fromStock = 0;
      let crafted = 0;
      let bought = 0;
      for (let unit = 0; unit < line.needed; unit += 1) {
        const nested = satisfy(line.name, line.item ?? findItem(line.name), 1, depth + 1, nextSeen);
        if (!nested.ok) return nested;
        children.push(nested.node);
        fromStock += nested.node.fromStock;
        crafted += nested.node.crafted;
        // Las piezas "virtual purchased" cuentan como fromStock en el bag, no como bought aquí;
        // bought se atribuye en el plan externo vía purchases.
      }
      ingredientReport.push({
        name: line.name,
        needed: line.needed,
        fromStock,
        crafted,
        bought,
      });
    }

    const cost = craftStepCost(target, lines, role);
    const blocked = children.some(nodeHasMissing);
    if (blocked) {
      return {
        ok: true,
        node: {
          name: target.nombre,
          item: target,
          needed: 1,
          fromStock: 0,
          crafted: 0,
          missing: 1,
          gold: cost.gold,
          status: 'missing',
          children,
        },
      };
    }

    gold += cost.gold;
    steps.push({
      item: target,
      copies: 1,
      role,
      difference: cost.difference,
      fee: cost.fee,
      goldEach: cost.gold,
      goldTotal: cost.gold,
      ingredients: ingredientReport,
    });
    bag.set(self, (bag.get(self) ?? 0) + 1);

    return {
      ok: true,
      node: {
        name: target.nombre,
        item: target,
        needed: 1,
        fromStock: 0,
        crafted: 1,
        missing: 0,
        gold: cost.gold,
        status: 'craft',
        children,
      },
    };
  };

  const satisfy = (
    targetName: string,
    targetItem: Item | undefined,
    needed: number,
    depth: number,
    seen: Set<string>,
  ): NeedResult => {
    if (needed <= 0) {
      return {
        ok: true,
        node: {
          name: targetName,
          item: targetItem,
          needed: 0,
          fromStock: 0,
          crafted: 0,
          missing: 0,
          gold: 0,
          status: 'owned',
          children: [],
        },
      };
    }

    const self = keyOf(targetName);
    const have = bag.get(self) ?? 0;
    const fromStock = Math.min(have, needed);
    if (fromStock > 0) {
      bag.set(self, have - fromStock);
      addCredit(targetName, targetItem, fromStock);
    }

    let remain = needed - fromStock;
    let crafted = 0;
    let missing = 0;
    let nodeGold = 0;
    const craftChildGroups: CraftTreeNode[][] = [];

    while (remain > 0) {
      if (!targetItem || targetItem.craftsFrom.length === 0) {
        missing += remain;
        remain = 0;
        break;
      }
      const craftedOne = craftOne(targetItem, depth, seen, 'intermediate');
      if (!craftedOne.ok) return craftedOne;
      if (craftedOne.node.missing > 0) {
        missing += remain;
        nodeGold += craftedOne.node.gold;
        craftChildGroups.push(craftedOne.node.children);
        remain = 0;
        break;
      }
      const after = bag.get(self) ?? 0;
      if (after < 1) return { ok: false, reason: `No se pudo preparar ${targetName}` };
      bag.set(self, after - 1);
      crafted += 1;
      nodeGold += craftedOne.node.gold;
      craftChildGroups.push(craftedOne.node.children);
      remain -= 1;
    }

    return {
      ok: true,
      node: {
        name: targetItem?.nombre ?? targetName,
        item: targetItem,
        needed,
        fromStock,
        crafted,
        missing,
        gold: nodeGold,
        status: statusOf(fromStock, crafted, missing),
        children: craftChildGroups.length > 0 ? (craftChildGroups[0] ?? []) : [],
      },
    };
  };

  if (item.craftsFrom.length === 0) {
    return {
      ok: false,
      reason: `${item.nombre} no se craftea`,
      gold: 0,
      ownedCredit: 0,
      credits: [],
      steps: [],
      tree: null,
      summary: `${item.nombre} no se craftea`,
    };
  }

  const rootChildren: CraftTreeNode[] = [];
  let rootBlocked = false;
  let rootPotentialGold = 0;
  for (let i = 0; i < copies; i += 1) {
    const craftedRoot = craftOne(item, 0, new Set(), 'final');
    if (!craftedRoot.ok) {
      return {
        ok: false,
        reason: craftedRoot.reason,
        gold: 0,
        ownedCredit: 0,
        credits: [],
        steps: [],
        tree: null,
        summary: craftedRoot.reason,
      };
    }
    if (craftedRoot.node.missing > 0 || nodeHasMissing(craftedRoot.node)) rootBlocked = true;
    rootPotentialGold += craftedRoot.node.gold;
    if (i === 0) rootChildren.push(...craftedRoot.node.children);
  }

  const merged = mergeSteps(steps);
  const credits = [...creditMap.values()];
  const ownedCredit = credits.reduce((sum, entry) => sum + entry.totalCost, 0);
  const planGold = rootBlocked ? 0 : gold;

  const tree: CraftTreeNode = {
    name: item.nombre,
    item,
    needed: copies,
    fromStock: 0,
    crafted: rootBlocked ? 0 : copies,
    missing: rootBlocked ? 1 : 0,
    gold: rootBlocked ? rootPotentialGold : planGold,
    status: 'root',
    children: rootChildren,
  };

  const reason = rootBlocked
    ? 'Faltan componentes en el almacén (o no se pueden craftear)'
    : undefined;

  return {
    ok: !rootBlocked,
    reason,
    gold: planGold,
    ownedCredit,
    credits,
    steps: rootBlocked ? [] : merged,
    tree,
    summary: rootBlocked
      ? (reason as string)
      : merged.map(formatStep).join(' · ')
        + (merged.length ? ` · total ${planGold.toLocaleString('es-ES')} oro` : '0 oro'),
  };
}

/**
 * Plan de crafteo recursivo.
 * Oro = (precio_final − crédito de piezas del almacén) + Σ 10% de cada ítem crafteado
 * (equiv. por paso: diferencia + 10% del precio; diferencias negativas → 0).
 * Si faltan piezas básicas comprables, rellena purchases / totalWithPurchases.
 */
export function planCraft(item: Item, stock: Bag = stockBagFromCatalog(), copies = 1): CraftPlan {
  const base = planCraftInternal(item, stock, copies);
  const purchases = collectPurchasesFromTree(base.tree);
  const buyGold = purchases.reduce((sum, p) => sum + (p.purchasable ? p.totalCost : 0), 0);
  const allPurchasable = purchases.length > 0 && purchases.every(p => p.purchasable);
  const directBuyGold = isShopPurchasable(item) ? unitCost(item) : 0;

  let craftGoldWithPurchases = 0;
  let stepsWithBuy: CraftStep[] = base.steps;
  let canBuyAndCraft = false;

  if (allPurchasable) {
    const virtual = new Map<string, number>();
    for (const p of purchases) virtual.set(keyOf(p.name), p.qty);
    const withBuy = planCraftInternal(item, stock, copies, virtual);
    if (withBuy.ok) {
      canBuyAndCraft = true;
      craftGoldWithPurchases = withBuy.gold;
      stepsWithBuy = withBuy.steps;
    }
  } else if (purchases.length === 0 && base.ok) {
    craftGoldWithPurchases = base.gold;
    stepsWithBuy = base.steps;
  }

  const totalWithPurchases = buyGold + craftGoldWithPurchases;
  const cheaperDirect = directBuyGold > 0 && totalWithPurchases > directBuyGold;

  // Si el plan base está bloqueado pero hay compra+craft viable, exponer esos pasos en `steps`
  // para el desglose del botón (el craft normal sigue usando ok/gold).
  const stepsForUi = base.ok ? base.steps : (canBuyAndCraft ? stepsWithBuy : []);

  return {
    ok: base.ok,
    reason: base.reason,
    gold: base.gold,
    ownedCredit: base.ownedCredit,
    credits: base.credits,
    steps: stepsForUi,
    tree: base.tree,
    summary: base.summary,
    purchases,
    buyGold,
    craftGoldWithPurchases,
    totalWithPurchases,
    canBuyAndCraft,
    directBuyGold,
    cheaperDirect,
  };
}
