import React, { useMemo, useState } from 'react';
import {
  Search,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Receipt,
  ClipboardList,
  ChevronRight,
} from 'lucide-react';
import { Party } from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { PartyLedgerEntry, PartyStatement, formatLedgerBalance, entryStageLines, ledgerMoneySplit, registeredAtTs } from './partyStatement';

/**
 * Statement of Account & Ledger — the doc-centric party list. One row per
 * sale, purchase and payment (plus standalone vouchers), each row
 * click-through to its full story; the opening-balance row seeds the Dr/Cr
 * running balance.
 */
interface PartyStatementLedgerProps {
  party: Party;
  statement: PartyStatement;
  currencySymbol: string;
  /** Click-through for a payment / other-voucher row */
  onOpenVoucher: (entry: PartyLedgerEntry) => void;
  /** Click-through for a sale/purchase row (opens the document viewer) */
  onOpenOrder: (entry: PartyLedgerEntry) => void;
  /** Sticky thead offset — 'top-16' pins beneath the app header (page
   *  scrolling); containers that scroll themselves (the dashboard modal)
   *  pass 'top-0' */
  stickyHeaderOffset?: string;
}

type FilterChip = 'all' | 'sales' | 'purchases' | 'payments_in' | 'payments_out';

const FILTER_TABS: Array<{ id: FilterChip; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'sales', label: 'Sales' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'payments_in', label: 'Payments In' },
  { id: 'payments_out', label: 'Payments Out' },
];

/** Row-level icon + tint per document kind/type */
function rowVisual(entry: PartyLedgerEntry): { Icon: any; tone: string } {
  if (entry.kind === 'sale') return { Icon: FileText, tone: 'text-[var(--color-primary)]' };
  if (entry.kind === 'purchase') return { Icon: ClipboardList, tone: 'text-[var(--color-secondary)]' };
  if (entry.kind === 'payment') {
    return entry.transaction?.type === 'payment_in'
      ? { Icon: ArrowDownLeft, tone: 'text-[var(--color-success)]' }
      : { Icon: ArrowUpRight, tone: 'text-[var(--color-error)]' };
  }
  const type = entry.transaction?.type;
  if (type === 'payment_in' || type === 'payment_out') {
    return type === 'payment_in'
      ? { Icon: ArrowDownLeft, tone: 'text-[var(--color-success)]' }
      : { Icon: ArrowUpRight, tone: 'text-[var(--color-error)]' };
  }
  return { Icon: Receipt, tone: 'text-[var(--color-on-surface-variant)]' };
}

// Per-stage-category color coding of the Stages column (user rule):
//   Quotation / RFQ          -> light blue
//   Sales Order / Purchase Order (+ legacy delivery note) -> yellow-orange
//   GST Invoice / Goods Receiving                          -> green
function stagePillTone(stageType: string): string {
  switch (stageType) {
    case 'sales_order':
    case 'purchase_order':
    case 'delivery_note':
      return 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]';
    case 'sales_invoice':
    case 'goods_receipt':
      return 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]';
    default:
      // quotation / rfq / proforma_invoice (legacy)
      return 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]';
  }
}

/** A due is open and NOTHING has been settled against it — the row gets the
 *  "not booked or settled yet" note (partial settlements keep their "Settled" note). */
function unsettledDuesOpen(entry: PartyLedgerEntry): boolean {
  return entry.isPosted && entry.outstanding > 0;
}

export function PartyStatementLedger({
  party,
  statement,
  currencySymbol,
  onOpenVoucher,
  onOpenOrder,
  stickyHeaderOffset = 'top-16',
}: PartyStatementLedgerProps) {
  const [filterType, setFilterType] = useState<FilterChip>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return statement.rows
      .filter((entry) => {
        if (filterType === 'all') return true;
        if (filterType === 'sales') return entry.kind === 'sale';
        if (filterType === 'purchases') return entry.kind === 'purchase';
        if (filterType === 'payments_in')
          return entry.kind === 'payment' && entry.transaction?.type === 'payment_in';
        if (filterType === 'payments_out')
          return entry.kind === 'payment' && entry.transaction?.type === 'payment_out';
        return true;
      })
      .filter((entry) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          entry.documentNumber.toLowerCase().includes(q) ||
          entry.typeLabel.toLowerCase().includes(q) ||
          (entry.stageChip && entry.stageChip.toLowerCase().includes(q)) ||
          (entry.particulars && entry.particulars.toLowerCase().includes(q)) ||
          (entry.reference && entry.reference.toLowerCase().includes(q)) ||
          entryStageLines(entry).some((s) =>
            s.number.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))
        );
      });
  }, [statement.rows, filterType, searchQuery]);

  return (
    <div className="bg-[var(--color-surface-container-lowest)] rounded-[24px] border border-[var(--color-outline-variant)] shadow-xs overflow-clip space-y-3">
      {/* Table Header Controls — heading, then the search + filter row */}
      <div className="p-4 border-b border-[var(--color-outline-variant)] flex flex-col gap-3">
        <h3 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
          Statement of Account & Ledger
        </h3>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Search inside ledger */}
          <div className="relative flex-1 min-w-[320px] max-w-md">
            <Search className="w-3.5 h-3.5 text-[var(--color-outline)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search document #, item, ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-[var(--color-surface-container)] p-0.5 rounded-full border border-[var(--color-outline-variant)] text-xs overflow-x-auto max-w-full">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1 rounded-full font-semibold transition-colors whitespace-nowrap ${
                  filterType === tab.id
                    ? 'bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] shadow-xs'
                    : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ledger Table — NO container scroll: the page scrolls and the header
          rides sticky beneath the app header (max rows real estate) */}
      <div>
        <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
          <thead className={`sticky ${stickyHeaderOffset} z-20`}>
            <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-3 w-[150px]">Type</th>
              <th className="py-3 px-3">Particulars</th>
              <th className="py-3 px-3">Stages</th>
              <th className="py-3 px-3">Reference</th>
              <th className="py-3 px-3 text-right w-[112px]">Amount</th>
              <th className="py-3 px-3 text-right w-[112px]">Payment</th>
              <th className="py-3 px-3 text-right">Running Balance</th>
              <th className="py-3 px-2 w-6"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-outline-variant)]">
            {/* Document-ledger rows */}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-xs text-[var(--color-on-surface-variant)] italic">
                  {statement.rows.length === 0
                    ? 'No sales, purchases or payments recorded for this party yet.'
                    : 'No documents found matching your search or active filter.'}
                </td>
              </tr>
            ) : (
              [...filtered]
                // Newest registration (createdAt) first — the same order the
                // running balance is sequenced in (partyStatement.ts).
                .sort((a, b) => registeredAtTs(b) - registeredAtTs(a))
                .map((entry) => {
                const { Icon, tone } = rowVisual(entry);
                const isOrder = entry.kind === 'sale' || entry.kind === 'purchase';
                const stageLines = entryStageLines(entry);
                const money = ledgerMoneySplit(entry);
                // Amount coloring (user rule) on sale/purchase rows:
                //   settled into a Cash/Bank a/c  -> grey black
                //   flow never booked (not on credit, not settled) -> grey black
                //   booked on credit              -> GREEN (Dr — to receive) /
                //                                    RED (Cr — to pay)
                // Payment legs and the running balance keep the pure Dr/Cr
                // coloring. Cancelled posts nothing.
                const cashSettled = entry.settledAmount > 0;
                // "Booked on credit" = the master's one-shot flow was applied
                // as settlementType 'credit' (booked on the party ledger); any
                // other row is either settled below or not booked at all.
                const creditBooked =
                  !cashSettled &&
                  (entry.sale?.settlementType === 'credit' ||
                    entry.purchase?.settlementType === 'credit');
                const grey = 'text-[var(--color-on-surface-variant)]';
                const dirTone = (dir: 'dr' | 'cr') =>
                  dir === 'dr' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]';
                // The grey/black rules are order-row rules; payment and manual
                // voucher rows always take the pure Dr/Cr direction color.
                const isOrderRow = entry.kind === 'sale' || entry.kind === 'purchase';
                const toneIf = (val: number, dir: 'dr' | 'cr') =>
                  val && entry.status !== 'cancelled'
                    ? isOrderRow && !creditBooked
                      ? grey
                      : dirTone(dir)
                    : grey;
                // Settlement notes take their row's tone: "Settled in
                // account" = a payment leg posted into a Cash/Bank a/c; "not
                // booked or settled yet" = the flow was never booked at all;
                // "Booked on credit" = the flow was booked on credit. Each
                // matches the color of the amount above it.
                const amountCls = toneIf(money.sale || money.purchase, money.sale ? 'dr' : 'cr');
                const docNote = money.sale || money.purchase
                  ? isOrderRow
                    // Order rows: the ONE-SHOT money flow either settled into
                    // a Cash/Bank a/c ("Settled"), was booked on the party
                    // ledger on credit ("Booked on credit"), or was never
                    // applied at all — including rows still short of their
                    // money stage (quotation / PO) — "not booked or settled
                    // yet". Cancelled orders show no note.
                    ? (entry.status === 'cancelled'
                        ? null
                        : cashSettled
                          ? { text: 'Settled in account', cls: `text-[9px] font-semibold mt-0.5 ${grey}` }
                          : creditBooked
                            ? { text: 'Booked on credit', cls: `text-[9px] font-semibold italic mt-0.5 ${amountCls}` }
                            : { text: 'Not booked or settled yet', cls: `text-[9px] font-semibold italic mt-0.5 ${grey}` })
                    // Manual voucher rows: a still-open pending voucher is
                    // neither settled nor closed — the note applies.
                    : unsettledDuesOpen(entry)
                      ? { text: 'Not booked or settled yet', cls: `text-[9px] font-semibold italic mt-0.5 ${grey}` }
                      : null
                  : null;
                return (
                  <tr
                    key={entry.id}
                    onClick={() => (isOrder ? onOpenOrder(entry) : onOpenVoucher(entry))}
                    className="hover:bg-[var(--color-surface-container)]/50 transition-colors cursor-pointer group"
                  >
                    {/* Type (icon + label — kept its own column, apart from the
                        particulars text) */}
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wide ${tone}`}>
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {entry.typeLabel}
                      </span>
                      {/* The row's creation timestamp (date + time) rides
                          under the type label */}
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                        {formatDateTime(
                          entry.sale?.createdAt || entry.purchase?.createdAt || entry.transaction?.createdAt,
                          'dash',
                        )}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[var(--color-on-surface)] max-w-xs">
                      <p className="font-medium text-[var(--color-on-surface)] truncate">
                        {entry.particulars || '—'}
                      </p>
                    </td>
                    {/* Stages — every issued stage with its document number,
                        stacked; "—" for payments / standalone vouchers */}
                    <td className="py-3 px-3 align-top">
                      {stageLines.length === 0 ? (
                        <span className="text-[var(--color-on-surface-variant)] font-mono">—</span>
                      ) : (
                        <div className="space-y-1">
                          {stageLines.map((s, idx) => {
                            const isCurrent = idx === stageLines.length - 1;
                            const label = s.label.replace(/ \(legacy\)/, '');
                            const tonePill = stagePillTone(s.stageType);
                            if (isCurrent) {
                              // The LATEST stage gets the filled highlight pill in
                              // its category tone (blue / orange / green)
                              return (
                                <span
                                  key={`${s.stageType}-${s.number}-${idx}`}
                                  title={`Current stage — issued ${s.date}`}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border whitespace-nowrap shadow-2xs ${tonePill} border-[var(--color-outline-variant)]/40`}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 animate-pulse"></span>
                                  <span className="text-[10px] font-black tracking-wide truncate max-w-[52px]">
                                    {label}
                                  </span>
                                  <span className="opacity-60">·</span>
                                  <span className="font-mono text-[10px] font-black truncate max-w-[62px]">
                                    {s.number}
                                  </span>
                                </span>
                              );
                            }
                            // Earlier stages: same category tone, softened
                            return (
                              <span
                                key={`${s.stageType}-${s.number}-${idx}`}
                                title={`${s.label} — issued ${s.date}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap overflow-hidden opacity-55 ${tonePill}`}
                              >
                                <span className="text-[9px] font-semibold tracking-wide truncate max-w-[50px]">
                                  {label}
                                </span>
                                <span className="opacity-60">·</span>
                                <span className="font-mono text-[9px] font-semibold truncate max-w-[60px]">
                                  {s.number}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--color-on-surface-variant)] max-w-[140px] truncate">
                      {entry.reference || '—'}
                    </td>
                    {/* Amount — Sales (Dr, green) and Purchases (Cr, red)
                        clubbed into one column; color carries the side */}
                    <td className="py-3 px-2.5 text-right">
                      {(() => {
                        const val = money.sale || money.purchase;
                        return (
                          <>
                            <span className={`font-mono font-bold ${toneIf(val, money.sale ? 'dr' : 'cr')}`}>
                              {val ? formatCurrency(val, currencySymbol) : '—'}
                            </span>
                            {val > 0 && docNote && (
                              <p className={docNote.cls}>{docNote.text}</p>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    {/* Payment — money actually received (Paid In, green) or
                        paid out (Paid Out, red) clubbed into one column */}
                    <td className="py-3 px-2.5 text-right">
                      <span className={`font-mono font-bold ${toneIf(money.paidIn || money.paidOut, money.paidIn ? 'dr' : 'cr')}`}>
                        {money.paidIn || money.paidOut ? formatCurrency(money.paidIn || money.paidOut, currencySymbol) : '—'}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-bold whitespace-nowrap ${
                        entry.runningBalance > 0
                          ? 'text-[var(--color-success)]'
                          : entry.runningBalance < 0
                          ? 'text-[var(--color-error)]'
                          : 'text-[var(--color-on-surface)]'
                      }`}
                    >
                      {formatCurrency(Math.abs(entry.runningBalance), currencySymbol)}{' '}
                      <span className="text-[9px] uppercase font-normal">
                        {entry.runningBalance > 0 ? 'Dr' : entry.runningBalance < 0 ? 'Cr' : ''}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--color-outline)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                  </tr>
                );
              })
            )}
            {/* Opening Balance Row */}
            <tr className="bg-[var(--color-surface-container)]/40 font-semibold">
              <td className="py-3 px-3">
                <span className="inline-flex items-center gap-1 font-bold text-[var(--color-on-surface)]">
                  <Building2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  Opening Balance
                </span>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                  {formatDate(party.createdAt)}
                </p>
              </td>
              <td className="py-3 px-3 text-[var(--color-on-surface-variant)]">
                Initial balance registered ({party.openingBalanceType === 'to_receive' ? 'Receivable from Party' : 'Payable to Party'})
              </td>
              <td className="py-3 px-3 text-[var(--color-on-surface-variant)]">—</td>
              <td className="py-3 px-3 font-mono text-[var(--color-outline)]">—</td>
              <td className="py-3 px-2.5 text-right font-mono text-[var(--color-surface-container-highest)]">—</td>
              <td className="py-3 px-2.5 text-right font-mono text-[var(--color-surface-container-highest)]">—</td>
              <td
                className={`py-3 px-3 text-right font-mono font-bold ${
                  party.openingBalanceType === 'to_receive'
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-error)]'
                }`}
              >
                {formatCurrency(party.openingBalance, currencySymbol)}{' '}
                <span className="text-[9px] uppercase font-normal">
                  {party.openingBalanceType === 'to_receive' ? 'Dr' : 'Cr'}
                </span>
              </td>
              <td className="py-3 px-2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Site Notes & Additional Meta */}
      {party.notes && (
        <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] text-xs text-[var(--color-on-surface-variant)]">
          <span className="font-bold text-[var(--color-on-surface)]">Site Instructions & Plant Notes: </span>
          {party.notes}
        </div>
      )}
    </div>
  );
}