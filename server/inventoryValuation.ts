import { Item } from '../src/types';

/**
 * ACTUAL-COST INVENTORY VALUATION — FIFO lot valuation (rates NEVER change).
 *
 * Every quantity that enters stock keeps the actual rate it entered at,
 * forever. Nothing is ever averaged or re-priced (documentation §3):
 *
 *  - Lots: each INWARD movement (purchase inward at the line rate of the
 *    order document snapshot, production output, +adjustment at the voucher
 *    rate, opening seed) creates a cost lot of {quantity, rate}.
 *  - Consumption: every OUTWARD movement (sale dispatch, production
 *    consumption, decrease adjustments, reversals) consumes quantity from
 *    the OLDEST lots first (FIFO). An outward never changes any lot's rate —
 *    it only consumes quantity; its consumed VALUE is the sum of the lots
 *    actually consumed.
 *  - Opening stock is the first lot of every item (openingStock x
 *    openingStockPrice); 'opening' ledger rows are skipped (no double count).
 *  - Movement rows without a recorded rate fall back to the item's catalog
 *    cost chain so legacy rows never distort lot costs.
 *  - The live item stock (item.currentStock) is the quantity source of truth
 *    for the final valuation; lot rates decide the value.
 *
 * A stock adjustment at a NEW rate therefore never changes the cost of
 * existing quantities — it only adds its own lot at its own rate.
 */

export interface valuationMovementInput {
  type: string;
  quantity: number; // signed
  rate?: number | null;
  date?: string;
}

export interface ItemValuation {
  valuationRate: number; // blended rate of the remaining lots (display only)
  stockValue: number; // live item stock x valuationRate
}

interface CostLot {
  qty: number;
  rate: number;
}

export function getFallbackCostRate(item: Item): number {
  return Number(item.openingStockPrice) || Number(item.purchasePrice) || Number(item.salePrice) || 0;
}

function chronoSort(movements: valuationMovementInput[]): valuationMovementInput[] {
  return [...movements].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/** FIFO replay result: remaining lots + running stats. */
interface FifoReplay {
  lots: CostLot[];
  stock: number;
}

function replayLots(item: Item, movements: valuationMovementInput[]): FifoReplay {
  const fallbackRate = getFallbackCostRate(item);
  const lots: CostLot[] = [];

  // Seed: opening stock is the first lot of the item.
  const openingStock = Number(item.openingStock) || 0;
  if (openingStock > 0 && fallbackRate > 0) {
    lots.push({ qty: openingStock, rate: fallbackRate });
  }

  for (const m of chronoSort(movements)) {
    if (m.type === 'opening') continue; // represented by the seed lot
    const qty = Number(m.quantity) || 0;
    if (qty > 0) {
      const rateIn = Number(m.rate);
      // A new lot at its own actual rate — existing lots are NEVER re-priced.
      lots.push({ qty, rate: rateIn > 0 ? rateIn : fallbackRate });
    } else if (qty < 0) {
      // Consume quantity from the oldest lots first; rates stay intact.
      let need = -qty;
      while (need > 0 && lots.length > 0) {
        const lot = lots[0];
        if (lot.qty <= need) {
          need -= lot.qty;
          lots.shift();
        } else {
          lot.qty -= need;
          need = 0;
        }
      }
      // Consuming more than held: excess has no lot (ledger clamps at 0).
    }
  }
  return { lots, stock: lots.reduce((s, l) => s + l.qty, 0) };
}

export function computeItemValuation(item: Item, movements: valuationMovementInput[]): ItemValuation {
  const currentStock = Number(item.currentStock) || 0;
  const { lots, stock } = replayLots(item, movements);
  const lotsValue = lots.reduce((s, l) => s + l.qty * l.rate, 0);
  if (stock <= 0 || lotsValue <= 0) {
    const fallbackRate = getFallbackCostRate(item);
    return { valuationRate: currentStock > 0 && fallbackRate > 0 ? fallbackRate : 0, stockValue: 0 };
  }
  // Blended rate of the remaining lots (display only — lots keep own rates)
  const valuationRate = lotsValue / stock;
  return { valuationRate, stockValue: (Number(currentStock) || 0) * valuationRate };
}

/**
 * Actual cost CONSUMED by an OUTWARD movement: replays the ledger up to (not
 * including) this movement, consumes -qty from the FIFO lots, and returns the
 * blended rate of the quantity actually consumed (consumed value / qty). Used
 * to record the outward row's rate + value so the ledger stores what the
 * removed quantity actually cost — never a voucher's typed rate.
 */
export function computeOutwardConsumptionRate(
  item: Item,
  movements: valuationMovementInput[], // full ledger for the item, EXCLUDING this movement
  outwardQty: number, // positive magnitude to consume
): number {
  if (!(outwardQty > 0)) return 0;
  const { lots } = replayLots(item, movements);
  let need = outwardQty;
  let consumedValue = 0;
  while (need > 0 && lots.length > 0) {
    const lot = lots[0];
    if (lot.qty <= need) {
      need -= lot.qty;
      consumedValue += lot.qty * lot.rate;
      lots.shift();
    } else {
      consumedValue += need * lot.rate;
      lot.qty -= need;
      need = 0;
    }
  }
  const consumedQty = outwardQty - need; // clamped if not enough held
  return consumedQty > 0 ? consumedValue / consumedQty : 0;
}