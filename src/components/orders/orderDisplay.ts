import {
  FileText,
  ClipboardList,
  Receipt,
  Truck,
  FileCheck,
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