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
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PartyLedgerEntry, PartyStatement, formatLedgerBalance, entryStageLines } from './partyStatement';

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
}

type FilterChip = 'all' | 'sales' | 'purchases' | 'payments_in' | 'payments_out' | 'other' | 'pending';

const FILTER_TABS: Array<{ id: FilterChip; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'sales', label: 'Sales' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'payments_in', label: 'Payments In' },
  { id: 'payments_out', label: 'Payments Out' },
  { id: 'other', label: 'Other' },
  { id: 'pending', label: 'Pending Dues' },
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

export function PartyStatementLedger({
  party,
  statement,
  currencySymbol,
  onOpenVoucher,
  onOpenOrder,
}: PartyStatementLedgerProps) {
  const [filterType, setFilterType] = useState<FilterChip>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return statement.rows
      .filter((entry) => {
        if (filterType === 'all') return true;
        if (filterType === 'sales') return entry.kind === 'sale';
        if (filterType === 'purchases') return entry.kind === 'purchase';
        if (filterType === 'other') return entry.kind === 'voucher';
        if (filterType === 'payments_in')
          return entry.kind === 'payment' && entry.transaction?.type === 'payment_in';
        if (filterType === 'payments_out')
          return entry.kind === 'payment' && entry.transaction?.type === 'payment_out';
        if (filterType === 'pending') {
          const statusPending = entry.status === 'pending' || entry.status === 'partially_paid';
          const postedWithOutstanding =
            entry.isPosted && entry.outstanding > 0
            && entry.status !== 'paid' && entry.status !== 'settled' && entry.status !== 'cancelled';
          return statusPending || postedWithOutstanding;
        }
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
    <div className="bg-[var(--color-surface-container-lowest)] rounded-[24px] border border-[var(--color-outline-variant)] shadow-xs overflow-hidden space-y-3">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-[var(--color-outline-variant)] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
            Statement of Account & Ledger
          </h3>
          <p className="text-xs text-[var(--color-on-surface-variant)]">
            Every {party.name} sale, purchase and payment in one chronological story (newest first) — click any row for the full document
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Search inside ledger */}
          <div className="relative min-w-[220px]">
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

      {/* Scrollable Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[1020px]">
          <thead>
            <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Particulars</th>
              <th className="py-3 px-3">Stages</th>
              <th className="py-3 px-3">Reference</th>
              <th className="py-3 px-3 text-right text-[var(--color-error)]">Debit (Dr / Sales / We Paid)</th>
              <th className="py-3 px-3 text-right text-[var(--color-success)]">Credit (Cr / Purchases / Received)</th>
              <th className="py-3 px-3 text-right">Running Balance</th>
              <th className="py-3 px-2 w-6"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-outline-variant)]">
            {/* Document-ledger rows */}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-xs text-[var(--color-on-surface-variant)] italic">
                  {statement.rows.length === 0
                    ? 'No sales, purchases or payments recorded for this party yet.'
                    : 'No documents found matching your search or active filter.'}
                </td>
              </tr>
            ) : (
              [...filtered].reverse().map((entry) => {
                const { Icon, tone } = rowVisual(entry);
                const isOrder = entry.kind === 'sale' || entry.kind === 'purchase';
                const journalChip = entry.journalVoucher && entry.journalVoucher.status !== 'cancelled'
                  ? entry.journalVoucher.voucherNumber
                  : undefined;
                const stageLines = entryStageLines(entry);
                return (
                  <tr
                    key={entry.id}
                    onClick={() => (isOrder ? onOpenOrder(entry) : onOpenVoucher(entry))}
                    className="hover:bg-[var(--color-surface-container)]/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 whitespace-nowrap text-[var(--color-on-surface)] font-medium">
                      {formatDate(entry.date)}
                    </td>
                    {/* Type (icon + label — kept its own column, apart from the
                        particulars text) */}
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wide ${tone}`}>
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {entry.typeLabel}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[var(--color-on-surface)] max-w-xs">
                      {entry.particulars ? (
                        <p className="font-medium text-[var(--color-on-surface)] truncate">
                          {entry.particulars}
                        </p>
                      ) : (
                        <span className="text-[var(--color-on-surface-variant)]">—</span>
                      )}
                      {journalChip && (
                        <p className="text-[9px] font-mono text-[var(--color-outline)] mt-0.5">
                          Vch: {journalChip}
                        </p>
                      )}
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
                            if (isCurrent) {
                              // The LATEST stage gets a filled highlight pill so
                              // it reads instantly within the stacked ladder
                              return (
                                <span
                                  key={`${s.stageType}-${s.number}-${idx}`}
                                  title={`Current stage — issued ${s.date}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-primary-container)] border border-[var(--color-primary)]/30 whitespace-nowrap"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0 animate-pulse"></span>
                                  <span className="text-[10px] font-black text-[var(--color-on-primary-container)] tracking-wide">
                                    {label}
                                  </span>
                                  <span className="text-[var(--color-on-primary-container)]/60">·</span>
                                  <span className="font-mono text-[10px] font-black text-[var(--color-on-primary-container)]">
                                    {s.number}
                                  </span>
                                </span>
                              );
                            }
                            return (
                              <p key={`${s.stageType}-${s.number}-${idx}`} className="leading-tight whitespace-nowrap">
                                <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">
                                  {label}
                                </span>
                                <span className="text-[var(--color-outline)]"> · </span>
                                <span className="font-mono text-[10px] text-[var(--color-on-surface-variant)]">
                                  {s.number}
                                </span>
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--color-on-surface-variant)] max-w-[140px] truncate">
                      {entry.reference || '—'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-mono font-bold text-[var(--color-error)]">
                        {entry.debit ? formatCurrency(entry.debit, currencySymbol) : '—'}
                      </span>
                      {entry.debit && entry.settledAmount ? (
                        <p className="text-[9px] font-semibold text-[var(--color-success)] mt-0.5">
                          Settled {formatCurrency(entry.settledAmount, currencySymbol)}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-mono font-bold text-[var(--color-success)]">
                        {entry.credit ? formatCurrency(entry.credit, currencySymbol) : '—'}
                      </span>
                      {entry.settledAmount && !entry.debit ? (
                        <p className="text-[9px] font-semibold text-[var(--color-primary)] mt-0.5">
                          Settled {formatCurrency(entry.settledAmount, currencySymbol)}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-on-surface)] whitespace-nowrap">
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
              <td className="py-3 px-4 text-[var(--color-on-surface)]">
                {formatDate(party.createdAt)}
              </td>
              <td className="py-3 px-3">
                <span className="inline-flex items-center gap-1 font-bold text-[var(--color-on-surface)]">
                  <Building2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  Opening Balance
                </span>
              </td>
              <td className="py-3 px-3 text-[var(--color-on-surface-variant)]">
                Initial balance registered ({party.openingBalanceType === 'to_receive' ? 'Receivable from Party' : 'Payable to Party'})
              </td>
              <td className="py-3 px-3 text-[var(--color-on-surface-variant)]">—</td>
              <td className="py-3 px-3 font-mono text-[var(--color-outline)]">—</td>
              <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-error)]">
                {party.openingBalanceType === 'to_receive' ? formatCurrency(party.openingBalance, currencySymbol) : '—'}
              </td>
              <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-success)]">
                {party.openingBalanceType === 'to_pay' ? formatCurrency(party.openingBalance, currencySymbol) : '—'}
              </td>
              <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-on-surface)]">
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