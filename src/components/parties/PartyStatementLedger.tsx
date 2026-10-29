import React, { useMemo, useState } from 'react';
import {
  Search,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { Party } from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { PartyLedgerEntry, PartyStatement, formatLedgerBalance, entryStageLines, entryDocId, ledgerMoneySplit, registeredAtTs } from './partyStatement';

/**
 * Statement of Account & Ledger — the doc-centric party list, shaped like the
 * sales list table: Doc Id (number + registration date/time), Stage, the
 * item lines (sales-table format), then Amount / Payment / Running Balance.
 * Each row click-through to its full story; the opening-balance row seeds
 * the Dr/Cr running balance.
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
          Party Ledger
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

          {/* Filter dropdown (was a pill row) */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterChip)}
            className="px-3.5 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] shrink-0 self-start cursor-pointer"
          >
            {FILTER_TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ledger Table — NO container scroll: the page scrolls and the header
          rides sticky beneath the app header (max rows real estate) */}
      <div>
        <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
          <thead className={`sticky ${stickyHeaderOffset} z-20`}>
            <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Doc Id</th>
              <th className="py-3 px-3 w-[170px]">Stage</th>
              <th className="py-3 px-3">Particulars</th>
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
                <td colSpan={7} className="py-10 text-center text-xs text-[var(--color-on-surface-variant)] italic">
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
                    {/* Doc Id — the row's document number (sales-table parity):
                        the current stage's own number for orders (`RST 0001`,
                        `Quotation QUO-…`, purchase stage numbers verbatim) and
                        the receipt/voucher number for payments; the
                        registration timestamp rides beneath it */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-[var(--color-on-surface)] truncate max-w-[220px]">
                        {entryDocId(entry)}
                      </div>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                        {formatDateTime(
                          entry.sale?.createdAt || entry.purchase?.createdAt || entry.transaction?.createdAt,
                          'dash',
                        )}
                      </p>
                    </td>
                    {/* Stage — every issued stage as stacked pills (orders);
                        payments show their own Payment In / Payment Out chip */}
                    <td className="py-3 px-3 align-top w-[170px] max-w-[200px]">
                      {stageLines.length === 0 ? (
                        (() => {
                          const type = entry.transaction?.type;
                          const cls =
                            type === 'payment_in'
                              ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20'
                              : type === 'payment_out'
                              ? 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)] border border-[var(--color-error)]/20'
                              : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]';
                          const label =
                            type === 'payment_in'
                              ? 'Payment In'
                              : type === 'payment_out'
                              ? 'Payment Out'
                              : entry.typeLabel;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${cls}`}
                            >
                              {label}
                            </span>
                          );
                        })()
                      ) : (
                        <div className="space-y-1">
                          {stageLines.map((s, idx) => {
                            const isCurrent = idx === stageLines.length - 1;
                            const label = s.label.replace(/ \(legacy\)/, '');
                            const tonePill = stagePillTone(s.stageType);
                            if (isCurrent) {
                              // The LATEST stage gets the filled highlight pill in
                              // its category tone (blue / orange / green).
                              // Sales Order pills show no number (user rule —
                              // the Doc Id column already carries the RST).
                              const showNumber = s.stageType !== 'sales_order' && !!s.number;
                              return (
                                <span
                                  key={`${s.stageType}-${s.number}-${idx}`}
                                  title={`Current stage — issued ${s.date}`}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border whitespace-nowrap shadow-2xs ${tonePill} border-[var(--color-outline-variant)]/40`}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 animate-pulse"></span>
                                  <span className="text-[10px] font-black tracking-wide truncate max-w-[110px]">
                                    {label}
                                  </span>
                                  {showNumber && (
                                    <>
                                      <span className="opacity-60">·</span>
                                      <span className="font-mono text-[10px] font-black truncate max-w-[62px]">
                                        {s.number}
                                      </span>
                                    </>
                                  )}
                                </span>
                              );
                            }
                            // Earlier stages: same category tone, softened.
                            // Sales Order pills show no number either — the
                            // Doc Id column carries the RST.
                            return (
                              <span
                                key={`${s.stageType}-${s.number}-${idx}`}
                                title={`${s.label} — issued ${s.date}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap overflow-hidden opacity-55 ${tonePill}`}
                              >
                                <span className="text-[9px] font-semibold tracking-wide truncate max-w-[104px]">
                                  {label}
                                </span>
                                {s.stageType !== 'sales_order' && !!s.number && (
                                  <>
                                    <span className="opacity-60">·</span>
                                    <span className="font-mono text-[9px] font-semibold truncate max-w-[60px]">
                                      {s.number}
                                    </span>
                                  </>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    {/* Particulars — order rows list their MATERIALS in the
                        sales-table format: itemName (qty unit) + location chip;
                        payments / vouchers keep their description */}
                    <td className="py-3 px-3 max-w-xs">
                      {isOrder ? (
                        <div className="space-y-0.5 max-w-[240px]">
                          {(entry.sale?.items || entry.purchase?.items || []).map((li, index) => (
                            <div key={index} className="text-[var(--color-on-surface)] font-medium truncate flex items-center gap-1.5">
                              <span>{li.itemName}</span>
                              <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold">
                                ({(Number(li.quantity) || 0).toLocaleString('en-IN')} {li.unit || ''})
                              </span>
                              {li.location && (
                                <span
                                  className="text-[9px] font-semibold px-1.5 py-0.2 rounded-md bg-[var(--color-surface-container-high)] text-[var(--color-secondary)] truncate max-w-[90px]"
                                  title={li.location}
                                >
                                  {li.location}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="font-medium text-[var(--color-on-surface)] truncate">
                          {entry.particulars || '—'}
                        </p>
                      )}
                    </td>
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
              <td className="py-3 px-4">
                <div className="font-bold text-[var(--color-on-surface)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    Opening Balance
                  </span>
                </div>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                  {formatDate(party.createdAt)}
                </p>
              </td>
              <td className="py-3 px-3 text-[var(--color-on-surface-variant)]">—</td>
              <td className="py-3 px-3 text-[var(--color-on-surface-variant)]">
                Initial balance registered ({party.openingBalanceType === 'to_receive' ? 'Receivable from Party' : 'Payable to Party'})
              </td>
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