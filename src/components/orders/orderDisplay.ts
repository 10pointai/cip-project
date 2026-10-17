import {
  FileText,
  ClipboardList,
  Receipt,
  Truck,
  FileCheck,
  Layers,
} from 'lucide-react';
import { Order, OrderItem, SalesStage, PurchaseStage, Sale, Purchase } from '../../types';

// Sales stage document meta (labels + icons for tabs/cards)
export const SALES_STAGE_META: Record<string, { label: string; icon: any; tone: string }> = {
  quotation: { label: 'Quotation', icon: FileText, tone: 'text-[var(--color-secondary)]' },
  sales_order: { label: 'Sales Order', icon: ClipboardList, tone: 'text-[var(--color-success)]' },
  proforma_invoice: { label: 'Proforma Invoice (legacy)', icon: Receipt, tone: 'text-[var(--color-primary)]' },
  delivery_note: { label: 'Delivery Note (legacy)', icon: Truck, tone: 'text-[var(--color-warning)]' },
  sales_invoice: { label: 'GST Tax Invoice', icon: FileCheck, tone: 'text-[var(--color-success)]' },
};

// Purchase stage document meta (labels + icons for detail tabs/cards — mirror
// of the sales detail modal's Stage Documents section)
export const PURCHASE_STAGE_META: Record<string, { label: string; icon: any; tone: string }> = {
  rfq: { label: 'Request Quotation', icon: FileText, tone: 'text-[var(--color-secondary)]' },
  purchase_order: { label: 'Purchase Order', icon: ClipboardList, tone: 'text-[var(--color-primary)]' },
  goods_receipt: { label: 'Goods Receiving', icon: FileCheck, tone: 'text-[var(--color-success)]' },
};

// Purchase stage document as shown in the detail modal (per-stage totals;
// items live on the master so they render from the purchase's own rows)
export interface PurchaseStageDocDisplay {
  stageType: PurchaseStage;
  stageNumber: string;
  date: string;
  notes?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * The master row's primary key, shortened to `<prefix>-<timestamp>` (`sale-…`
 * / `purc-…`): the trailing random suffix is storage noise (user rule) and is
 * stripped for display. Ids with fewer segments pass through unchanged.
 */
export function masterPkShort(orderId?: string): string {
  if (!orderId) return '';
  const parts = orderId.split('-');
  // Drop the trailing random segment (`-37agq5`): ids mint as
  // `sale|purc-<timestamp>-<random>` (and legacy variants carry one too).
  return parts.length >= 3 ? parts.slice(0, -1).join('-') : orderId;
}

export interface StageDocDisplay {
  stageType: SalesStage;
  stageNumber: string;
  date: string;
  notes?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  items: OrderItem[];
}

export interface OrderDisplay extends Order {
  inventoryApplied: boolean;
  cashApplied: boolean;
  // Which payment flow was applied: 'credit' (party ledger, no cash) /
  // 'account' (Cash/Bank); undefined = never applied.
  settlementType?: 'credit' | 'account';
  // Cash & Bank settlement (hydrated sale/purchase master fields)
  settlementAccountId?: string;
  settlementAccountName?: string;
  invoiceVoucherNumber?: string;
  settlementVoucherNumber?: string;
  settledAmount?: number;
  settledDate?: string;
  /** paymentMode: inherited from Order (kept for the settlement record) */
  /** Stage document numbers as issued (chronological) */
  stageNumbers?: Array<{ type: string; number: string; date: string }>;
  /** Purchase per-stage documents (RFQ / PO / GRN with their own totals) */
  purchaseStageDocs?: PurchaseStageDocDisplay[];
  /** Full stage documents with their OWN line values (quotation vs order...) */
  stageDocs?: StageDocDisplay[];
}

/**
 * Adapter: shapes the relational Sale/Purchase models (masters + items +
 * stage-history child tables) into the Order-shaped view used by the card
 * list, the detail panel and the print preview. The LATEST stage drives the
 * displayed document stage; totals fall back to per-line math when a stage
 * has no figures (RFQ).
 */
export function saleToDisplay(s: Sale): OrderDisplay {
  const items: OrderItem[] = (s.items || []).map((li) => ({
    itemId: li.itemId,
    itemName: li.itemName || '',
    itemCode: (li as any).itemCode,
    quantity: li.quantity,
    unit: li.unit || '',
    rate: li.rate,
    amount: (li.amount ?? li.quantity * li.rate),
    gstRate: li.gstRate,
    location: li.location,
  }));
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const taxAmount = items.reduce((sum, i) => sum + (i.quantity * i.rate * (i.gstRate || 0)) / 100, 0);
  const transportCharges = s.transportCharges || 0;
  const latestStage = (s.stages || []).length > 0 ? s.stages[s.stages.length - 1] : undefined;
  const stageDocs: StageDocDisplay[] = (s.stages || []).map((st) => ({
    stageType: st.stageType,
    stageNumber: st.stageNumber,
    date: st.date,
    notes: st.notes,
    subtotal: st.subtotal,
    taxAmount: st.taxAmount,
    totalAmount: st.totalAmount,
    items: (st.items || []).map((li) => ({
      itemId: li.itemId,
      itemName: li.itemName || '',
      itemCode: (li as any).itemCode,
      quantity: li.quantity,
      unit: li.unit || '',
      rate: li.rate,
      amount: li.amount ?? li.quantity * li.rate,
      gstRate: li.gstRate,
      location: li.location,
    }) as OrderItem),
  }));
  return {
    id: s.id,
    orderNumber: s.saleNumber,
    type: 'sales',
    partyId: s.partyId,
    partyName: s.partyName,
    date: s.date,
    status: s.status,
    stage: latestStage?.stageType || 'sales_order',
    accountId: '',
    items,
    taxRateGst: subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) / 100 : 0,
    taxAmount: latestStage?.taxAmount ?? taxAmount,
    totalAmount: latestStage?.totalAmount ?? subtotal + taxAmount + transportCharges,
    notes: s.notes,
    vehicleNo: s.vehicleNo,
    driverName: s.driverName,
    transportCharges,
    inventoryApplied: s.inventoryApplied,
    cashApplied: s.cashApplied,
    settlementType: (s as any).settlementType || undefined,
    settlementAccountId: (s as any).settlementAccountId || undefined,
    settlementAccountName: (s as any).settlementAccountName || undefined,
    paymentMode: (s as any).paymentMode,
    invoiceVoucherNumber: (s as any).invoiceVoucherNumber,
    settlementVoucherNumber: (s as any).settlementVoucherNumber,
    settledAmount: (s as any).settledAmount,
    settledDate: (s as any).settledDate,
    stageNumbers: (s.stages || []).map((st) => ({ type: st.stageType, number: st.stageNumber, date: st.date })),
    stageDocs,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  } as OrderDisplay;
}

export function purchaseToDisplay(p: Purchase): OrderDisplay {
  const items: OrderItem[] = (p.items || []).map((li) => ({
    itemId: li.itemId,
    itemName: li.itemName || '',
    itemCode: (li as any).itemCode,
    quantity: li.quantity,
    unit: li.unit || '',
    rate: li.rate,
    amount: li.amount ?? li.quantity * li.rate,
    gstRate: li.gstRate,
    location: li.location,
    receivedQuantity: li.receivedQuantity,
    shortageQuantity: li.shortageQuantity,
    overageQuantity: li.overageQuantity,
  }));
  const isRfqOnly = !(p.stages || []).some((st) => st.stageType !== 'rfq');
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const taxAmount = items.reduce((sum, i) => sum + (i.quantity * i.rate * (i.gstRate || 0)) / 100, 0);
  const latestStage = (p.stages || []).length > 0 ? p.stages[p.stages.length - 1] : undefined;
  const byType = (t: string) => (p.stages || []).find((st) => st.stageType === t);
  return {
    id: p.id,
    orderNumber: p.purchaseNumber,
    type: 'purchase',
    partyId: p.partyId || 'unassigned',
    partyName: p.partyName || (p.partyId ? undefined : 'Unassigned (RFQ Ingestion)'),
    date: p.date,
    status: p.status,
    purchaseStage: latestStage?.stageType,
    rfqDetails: byType('rfq') ? { rfqNumber: byType('rfq')!.stageNumber, ...((byType('rfq') as any).rfqDetails || {}) } as any : undefined,
    poDetails: byType('purchase_order') ? { poNumber: byType('purchase_order')!.stageNumber, ...((byType('purchase_order') as any).poDetails || {}) } as any : undefined,
    receiptDetails: byType('goods_receipt') ? { grnNumber: byType('goods_receipt')!.stageNumber, ...((byType('goods_receipt') as any).receiptDetails || {}) } as any : undefined,
    items,
    taxRateGst: subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) / 100 : 0,
    taxAmount: isRfqOnly ? 0 : (latestStage?.taxAmount ?? taxAmount),
    totalAmount: isRfqOnly ? 0 : (latestStage?.totalAmount ?? subtotal + taxAmount),
    notes: p.notes,
    inventoryApplied: p.inventoryApplied,
    cashApplied: p.cashApplied,
    settlementType: (p as any).settlementType || undefined,
    settlementAccountId: (p as any).settlementAccountId || undefined,
    settlementAccountName: (p as any).settlementAccountName || undefined,
    paymentMode: (p as any).paymentMode,
    invoiceVoucherNumber: (p as any).invoiceVoucherNumber,
    settlementVoucherNumber: (p as any).settlementVoucherNumber,
    settledAmount: (p as any).settledAmount,
    settledDate: (p as any).settledDate,
    stageNumbers: (p.stages || []).map((st) => ({ type: st.stageType, number: st.stageNumber, date: st.date })),
    purchaseStageDocs: (p.stages || []).map((st) => ({
      stageType: st.stageType,
      stageNumber: st.stageNumber,
      date: st.date,
      notes: st.notes,
      subtotal: st.subtotal,
      taxAmount: st.taxAmount,
      totalAmount: st.totalAmount,
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  } as OrderDisplay;
}

// --- Stage ladders & locks (PURE — shared by the orders module and the
// party statement's order details modal) ---

/**
 * Sales stage hierarchy for the ⋮ popover + issue buttons. The current
 * (latest issued) stage gates what can still be issued — the user can NEVER
 * create same-or-lower documents:
 *   quotation     -> Sales Order, Invoice direct
 *   sales_order   -> Invoice; "View Proforma" shows the SO as a proforma doc
 *   sales_invoice -> sale LOCKED: no edit, no further stages, no cancel/delete
 */
export const salesStageActionMenu = (order: OrderDisplay): Array<{ stageType: SalesStage; label: string; icon: any }> => {
  const current = order.stage || 'sales_order';
  const menu: Array<{ stageType: SalesStage; label: string; icon: any }> = [];
  if (current === 'sales_invoice') return menu; // locked
  if (current === 'quotation') {
    menu.push({ stageType: 'sales_order', label: 'Create Sales Order', icon: Layers });
    menu.push({ stageType: 'sales_invoice', label: 'Issue GST Tax Invoice', icon: FileText });
  } else {
    // sales_order (and legacy proforma/delivery_note rows)
    menu.push({ stageType: 'sales_invoice', label: 'Issue GST Tax Invoice', icon: FileText });
  }
  return menu;
};

export const isSaleLocked = (order: OrderDisplay) => (order.stage || 'sales_order') === 'sales_invoice';
export const editLabelFor = (order: OrderDisplay) =>
  (order.stage || 'sales_order') === 'quotation' ? 'Edit Quotation' : 'Edit Sales Order';

// Purchase stage ladder (mirror of the sales rules):
//   rfq            -> Create Purchase Order, Record Goods Receiving
//   purchase_order -> Record Goods Receiving
//   goods_receipt  -> purchase LOCKED: goods received, no edit, no stages
export const purchaseStageActionMenu = (order: OrderDisplay): Array<{ stageType: PurchaseStage; label: string; icon: any }> => {
  const current = order.purchaseStage || 'purchase_order';
  if (current === 'goods_receipt' || order.status === 'cancelled') return []; // locked
  if (current === 'rfq') {
    return [
      { stageType: 'purchase_order', label: 'Create Purchase Order', icon: Layers },
      { stageType: 'goods_receipt', label: 'Record Goods Receiving', icon: FileCheck },
    ];
  }
  return [{ stageType: 'goods_receipt', label: 'Record Goods Receiving', icon: FileCheck }];
};

export const isPurchaseLocked = (order: OrderDisplay) =>
  (order.purchaseStage || 'purchase_order') === 'goods_receipt' || order.status === 'cancelled';
export const purchaseEditLabelFor = (order: OrderDisplay) =>
  (order.purchaseStage || 'purchase_order') === 'rfq' ? 'Edit Request Quotation' : 'Edit Purchase Order';
export const canViewProforma = (order: OrderDisplay) => {
  const c = order.stage || 'sales_order';
  return c === 'sales_order' || c === 'proforma_invoice' || c === 'delivery_note';
};