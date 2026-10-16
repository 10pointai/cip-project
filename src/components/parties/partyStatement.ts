import { Party, Purchase, Sale, Transaction } from '../../types';

/**
 * PARTY STATEMENT ROW MODEL — the document-centric party ledger.
 *
 * One row per Sale master, one row per Purchase master, one row per recorded
 * payment — mirroring the Sales/Purchases module's readability, per party.
 *
 * ARITHMETIC CONTRACT (mirrors server recalculatePartyBalance, server/db.ts
 * §407-434 — the server counts ONLY vouchers): each order row FOLDS the
 * active vouchers the server posts for it (sale_invoice journal
 * `txn-<saleId>-inv`, purchase_bill `txn-<purchaseId>-bill`, settlement
 * receipt/payout `txn-<masterId>-pay`) into its own balanceEffect, so the
 * running balance ties exactly to party.currentBalance while the mirroring
 * vouchers stay hidden as rows (they surface inside the order's detail).
 * Sign rules (positive balance = we RECEIVE, Dr):
 *   sale_invoice | debit_note  -> +
 *   purchase_bill | credit_note -> -
 *   payment_in (we received)    -> -
 *   payment_out (we paid)       -> +
 * Cancelled vouchers / cancelled masters contribute 0 (cancellation already
 * un-books the vouchers server-side).
 */

export type PartyLedgerRowKind = 'sale' | 'purchase' | 'payment' | 'voucher';

export type PartyLedgerStatus =
  | 'pending' | 'paid' | 'partially_paid' | 'settled'
  | 'cancelled' | 'partially_delivered' | 'completed' | 'not_posted';

export interface PartyLedgerEntry {
  id: string;              // 'sale:<id>' | 'purchase:<id>' | 'txn:<voucherId>'
  kind: PartyLedgerRowKind;
  date: string;            // effective balance date (YYYY-MM-DD)
  documentNumber: string;
  stageChip?: string;      // newest stage label (orders) / type chip
  typeLabel: string;
  direction: 'debit' | 'credit';
  documentAmount: number;
  debit: number;           // money column that INCREASES the running balance
  credit: number;          // money column that DECREASES it
  settledAmount: number;   // account-flow settled portion (order rows)
  journalVoucher?: Transaction;  // order rows: invoice/bill journal
  settlementVoucher?: Transaction; // order rows: receipt/payout
  transaction?: Transaction;     // payment / voucher rows
  sale?: Sale; purchase?: Purchase;
  isPosted: boolean;       // an active journal exists on the ledger
  balanceEffect: number;   // signed delta added to the running balance
  outstanding: number;     // posted journal minus settled (>= 0)
  status: PartyLedgerStatus;
  runningBalance: number;  // filled during sequencing (ascending)
  particulars: string;     // item summary / description for display + CSV
  reference?: string;      // payment mode / UTR / account hint
}

/** Voucher-type -> statement direction. Debit increases the party balance. */
const VOUCHER_DIRECTION: Record<string, 'debit' | 'credit'> = {
  sale_invoice: 'debit',
  debit_note: 'debit',
  purchase_bill: 'credit',
  credit_note: 'credit',
  payment_in: 'credit',
  payment_out: 'debit',
};

// Lightweight label chips (kept in sync with the orders module's stage meta
// labels in src/components/orders/orderDisplay.ts, without its icon deps)
const SALES_STAGE_LABELS: Record<string, string> = {
  quotation: 'Quotation',
  sales_order: 'Sales Order',
  proforma_invoice: 'Proforma Invoice (legacy)',
  delivery_note: 'Delivery Note (legacy)',
  sales_invoice: 'GST Tax Invoice',
};
const PURCHASE_STAGE_LABELS: Record<string, string> = {
  rfq: 'Request Quotation',
  purchase_order: 'Purchase Order',
  goods_receipt: 'Goods Receiving',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Voucher ids the server deterministically posts for a sale/purchase,
 *  matched by the master's FKs first with the `txn-<masterId>-*` id-pattern
 *  fallback (masters use sale-/purchase- ids, so the prefix is unambiguous). */
function resolveOrderVouchers(
  masterId: string,
  journalVoucherId?: string,
  settlementVoucherId?: string,
  journalSuffix: 'inv' | 'bill' = 'inv',
  transactions: Transaction[] = [],
): { journal?: Transaction; settlement?: Transaction } {
  const journal = transactions.find(
    (t) => t.id === (journalVoucherId || `txn-${masterId}-${journalSuffix}`),
  );
  const settlement = transactions.find((t) => t.id === (settlementVoucherId || `txn-${masterId}-pay`));
  return { journal, settlement };
}

const isActive = (t?: Transaction) => !!t && t.status !== 'cancelled';

function itemSummary(items?: Array<{ quantity: number; unit?: string; itemName?: string; rate?: number }>): string {
  if (!items || items.length === 0) return '';
  const MAX = 3;
  const parts = items.slice(0, MAX).map((li) => {
    const name = li.itemName || 'Item';
    return `${li.quantity.toLocaleString('en-IN')}${li.unit ? ` ${li.unit}` : ''} ${name}`;
  });
  if (items.length > MAX) parts.push(`+${items.length - MAX} more`);
  return parts.join(', ');
}

export interface PartyStatement {
  party: Party;
  openingBalance: number;   // signed seed (positive = receivable / Dr)
  rows: PartyLedgerEntry[]; // chronological ascending, runningBalance filled
}

export function buildPartyStatement(input: {
  party: Party;
  sales?: Sale[];
  purchases?: Purchase[];
  transactions?: Transaction[];
}): PartyStatement {
  const { party } = input;
  const sales = (input.sales || []).filter((s) => s.partyId === party.id);
  const purchases = (input.purchases || []).filter((p) => p.partyId === party.id);
  const transactions = input.transactions || [];

  const entries: PartyLedgerEntry[] = [];

  // --- Order rows (the document-centric list) -----------------------------
  for (const sale of sales) {
    const { journal, settlement } = resolveOrderVouchers(
      sale.id, sale.invoiceVoucherId, sale.settlementVoucherId, 'inv', transactions,
    );
    const journalActive = isActive(journal);
    const settlementActive = isActive(settlement);
    const cancelled = sale.status === 'cancelled';
    const moneyStages = (sale.stages || []).filter((st) => st.stageType !== 'quotation');
    const latestStage = moneyStages.length > 0 ? moneyStages[moneyStages.length - 1] : undefined;
    const documentAmount = journalActive
      ? round2(journal!.amount)
      : round2(latestStage?.totalAmount ?? 0);
    const balanceEffect = cancelled
      ? 0
      : (journalActive ? journal!.amount : 0) - (settlementActive ? settlement!.amount : 0);
    const status: PartyLedgerStatus = cancelled
      ? 'cancelled'
      : !journalActive
        ? 'not_posted'
        : ((journal!.status as PartyLedgerStatus) || 'pending');
    entries.push({
      id: `sale:${sale.id}`,
      kind: 'sale',
      date: journal?.date || sale.date,
      documentNumber: sale.saleNumber,
      stageChip: latestStage ? SALES_STAGE_LABELS[latestStage.stageType] : undefined,
      typeLabel: 'Sale',
      direction: 'debit',
      documentAmount,
      debit: cancelled ? 0 : documentAmount,
      credit: 0,
      settledAmount: settlementActive ? round2(settlement!.amount) : 0,
      journalVoucher: journal, settlementVoucher: settlement,
      sale,
      isPosted: journalActive,
      balanceEffect: round2(balanceEffect),
      outstanding: journalActive
        ? Math.max(0, round2(journal!.amount - (settlementActive ? settlement!.amount : 0)))
        : 0,
      status,
      runningBalance: 0,
      particulars: itemSummary(sale.items) || sale.notes || '',
      reference: sale.vehicleNo || undefined,
    });
  }

  for (const purchase of purchases) {
    const { journal, settlement } = resolveOrderVouchers(
      purchase.id, purchase.invoiceVoucherId, purchase.settlementVoucherId, 'bill', transactions,
    );
    const journalActive = isActive(journal);
    const settlementActive = isActive(settlement);
    const cancelled = purchase.status === 'cancelled';
    const moneyStages = (purchase.stages || []).filter((st) => st.stageType !== 'rfq');
    const latestStage = moneyStages.length > 0 ? moneyStages[moneyStages.length - 1] : undefined;
    const rfqOnly = moneyStages.length === 0;
    const documentAmount = journalActive
      ? round2(journal!.amount)
      : round2(latestStage?.totalAmount ?? 0);
    const balanceEffect = cancelled
      ? 0
      : -(journalActive ? journal!.amount : 0) + (settlementActive ? settlement!.amount : 0);
    const status: PartyLedgerStatus = cancelled
      ? 'cancelled'
      : rfqOnly
        ? 'not_posted'
        : !journalActive
          ? 'not_posted'
          : ((journal!.status as PartyLedgerStatus) || 'pending');
    entries.push({
      id: `purchase:${purchase.id}`,
      kind: 'purchase',
      date: journal?.date || purchase.date,
      documentNumber: purchase.purchaseNumber,
      stageChip: rfqOnly
        ? PURCHASE_STAGE_LABELS.rfq
        : latestStage ? PURCHASE_STAGE_LABELS[latestStage.stageType] : undefined,
      typeLabel: 'Purchase',
      direction: 'credit',
      documentAmount,
      debit: 0,
      credit: cancelled ? 0 : documentAmount,
      settledAmount: settlementActive ? round2(settlement!.amount) : 0,
      journalVoucher: journal, settlementVoucher: settlement,
      purchase,
      // An RFQ-only purchase is a pure inquiry: nothing billed yet.
      isPosted: journalActive,
      balanceEffect: round2(balanceEffect),
      outstanding: journalActive
        ? Math.max(0, round2(journal!.amount - (settlementActive ? settlement!.amount : 0)))
        : 0,
      status,
      runningBalance: 0,
      particulars: itemSummary(purchase.items) || purchase.notes || '',
      reference: undefined,
    });
  }

  // --- Voucher rows that are NOT the system's mirroring of an order --------
  // Internal = FK-matched or `txn-<masterId>-inv|bill|pay` for THIS party's
  // orders. Everything else (recorded payments, manual vouchers, notes)
  // stays visible so the statement explains the full balance.
  const internalVoucherIds = new Set<string>();
  for (const s of sales) {
    if (s.invoiceVoucherId) internalVoucherIds.add(s.invoiceVoucherId);
    if (s.settlementVoucherId) internalVoucherIds.add(s.settlementVoucherId);
    internalVoucherIds.add(`txn-${s.id}-inv`);
    internalVoucherIds.add(`txn-${s.id}-pay`);
  }
  for (const p of purchases) {
    if (p.invoiceVoucherId) internalVoucherIds.add(p.invoiceVoucherId);
    if (p.settlementVoucherId) internalVoucherIds.add(p.settlementVoucherId);
    internalVoucherIds.add(`txn-${p.id}-bill`);
    internalVoucherIds.add(`txn-${p.id}-pay`);
  }
  const otherTxns = transactions.filter(
    (t) => t.partyId === party.id && !internalVoucherIds.has(t.id),
  );

  for (const t of otherTxns) {
    const type = t.type;
    const payment = type === 'payment_in' || type === 'payment_out';
    const docDirection = VOUCHER_DIRECTION[type];
    if (!docDirection) continue; // unknown type — skip rather than corrupt the balance
    const amount = round2(t.amount);
    const cancelled = t.status === 'cancelled';
    const effect = cancelled ? 0 : (docDirection === 'debit' ? amount : -amount);
    const typeLabel = payment
      ? (type === 'payment_in' ? 'Payment Received' : 'Payment Made')
      : (type === 'sale_invoice' ? 'Sale Invoice'
        : type === 'purchase_bill' ? 'Purchase Bill'
        : type === 'debit_note' ? 'Debit Note' : 'Credit Note');
    const stageChip = payment
      ? (type === 'payment_in' ? 'Received' : 'Paid')
      : undefined;
    entries.push({
      id: `txn:${t.id}`,
      kind: payment ? 'payment' : 'voucher',
      date: t.date,
      documentNumber: t.voucherNumber,
      stageChip,
      typeLabel,
      direction: docDirection,
      documentAmount: amount,
      debit: cancelled ? 0 : (docDirection === 'debit' ? amount : 0),
      credit: cancelled ? 0 : (docDirection === 'credit' ? amount : 0),
      settledAmount: 0,
      transaction: t,
      isPosted: !cancelled,
      balanceEffect: effect,
      outstanding: (!cancelled && t.status === 'pending') ? amount : 0,
      status: (t.status as PartyLedgerStatus) || 'pending',
      runningBalance: 0,
      particulars: t.description || t.materialOrService || '',
      reference: [t.paymentMode, t.referenceNumber].filter(Boolean).join(' · ') || undefined,
    });
  }

  // --- Sequence: chronological with a running balance ----------------------
  const opening = Number(party.openingBalance) || 0;
  const openingSeed = party.openingBalanceType === 'to_receive' ? opening : -opening;
  const sorted = entries.sort((a, b) => {
    const d = (a.date || '').localeCompare(b.date || '');
    if (d !== 0) return d;
    const ca = (asEpoch(a)) - (asEpoch(b));
    if (ca !== 0) return ca;
    return a.id.localeCompare(b.id);
  });
  let running = openingSeed;
  for (const entry of sorted) {
    running = round2(running + entry.balanceEffect);
    entry.runningBalance = running;
  }

  return { party, openingBalance: openingSeed, rows: sorted };
}

function asEpoch(entry: PartyLedgerEntry): number {
  const t = entry.transaction;
  const sale = entry.sale;
  const purchase = entry.purchase;
  const createdAt = sale?.createdAt || purchase?.createdAt || t?.createdAt || '';
  return Date.parse(createdAt) || 0;
}

/** Expands the statement rows back into their underlying ACTIVE vouchers —
 *  the ingestion shape PrintStatementModal already understands (its balance
 *  math is voucher-based and identical to the server's). Order documents
 *  contribute their journal + settlement vouchers; payments, manual vouchers
 *  contribute themselves. */
export function statementToVoucherTransactions(stmt: PartyStatement): Transaction[] {
  const out: Transaction[] = [];
  for (const row of stmt.rows) {
    if (row.kind === 'sale' || row.kind === 'purchase') {
      if (row.journalVoucher && row.journalVoucher.status !== 'cancelled') {
        out.push(row.journalVoucher);
      }
      if (row.settlementVoucher && row.settlementVoucher.status !== 'cancelled') {
        out.push(row.settlementVoucher);
      }
    } else if (row.transaction) {
      out.push(row.transaction);
    }
  }
  return out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/** "12.5 Dr" / "3,400 Cr" — the statement column suffix for a signed balance. */
export function formatLedgerBalance(balance: number): string {
  const abs = Math.abs(balance);
  const side = balance >= 0 ? 'Dr' : 'Cr';
  return `${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${side}`;
}

/** One line of the ledger's STACKED Stages column: every stage the
 *  sale/purchase has issued, in ladder order, with its document number.
 *  Payment / standalone-voucher rows have no stages (empty array). */
export interface LedgerStageLine {
  stageType: string;
  label: string;
  number: string;
  date: string;
  totalAmount: number;
}

export function entryStageLines(entry: PartyLedgerEntry): LedgerStageLine[] {
  if (entry.kind === 'sale') {
    return (entry.sale?.stages || []).map((st) => ({
      stageType: st.stageType,
      label: SALES_STAGE_LABELS[st.stageType] || st.stageType.replace(/_/g, ' '),
      number: st.stageNumber,
      date: st.date,
      totalAmount: st.totalAmount,
    }));
  }
  if (entry.kind === 'purchase') {
    return (entry.purchase?.stages || []).map((st) => ({
      stageType: st.stageType,
      label: PURCHASE_STAGE_LABELS[st.stageType] || st.stageType.replace(/_/g, ' '),
      number: st.stageNumber,
      date: st.date,
      totalAmount: st.totalAmount,
    }));
  }
  return [];
}