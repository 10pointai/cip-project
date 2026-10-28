import React, { useMemo, useState } from 'react';
import { FileCheck, Receipt, Layers, Search } from 'lucide-react';
import { Sale, SaleInvoice, Party, CompanySettings } from '../../types';
import { SaleInvoiceDetailModal } from './SaleInvoiceDetailModal';

interface SaleInvoicesViewProps {
  invoices: SaleInvoice[];
  /** Member sales orders (fallback number joins live server-side) */
  sales: Sale[];
  parties: Party[];
  settings: CompanySettings;
}

/**
 * CONSOLIDATED SALES INVOICES tab — every invoice folded from several sales
 * orders of one party. Row click opens the invoice detail (flat line table +
 * settlement record). Invoices are read-only here: they are created from the
 * Create Invoice action (Sales page / Party detail).
 */
export function SaleInvoicesView({ invoices, sales, parties, settings }: SaleInvoicesViewProps) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return invoices;
    const nameOf = (i: SaleInvoice) => (parties.find((p) => p.id === i.partyId)?.name || i.partyName || '').toLowerCase();
    return invoices.filter(
      (i) =>
        (i.invoiceNumber || '').toLowerCase().includes(q) ||
        nameOf(i).includes(q) ||
        (i.partyName || '').toLowerCase().includes(q) ||
        (i.orders || []).some((lk) => (sales.find((s) => s.id === lk.saleId)?.saleNumber || lk.saleNumber || '').toLowerCase().includes(q))
    );
  }, [invoices, searchTerm, sales, parties]);

  const detail = detailId ? invoices.find((i) => i.id === detailId) || null : null;

  // Party NAME (not the trade name) — resolved from the parties master; the
  // hydrated partyName field prefers tradeName and only serves as a fallback.
  const partyNameOf = (inv: SaleInvoice) =>
    parties.find((p) => p.id === inv.partyId)?.name || inv.partyName || '—';

  return (
    <div className="space-y-3">
      {/* Invoice table — same single-card shape as the orders table: the
          search rides INSIDE the card (no floating orphan input) and the
          table wraps in a plain div (never overflow-x-auto — a nested scroll
          container breaks the sticky top-16 thead, clipping the header into a
          white band). */}
      <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl overflow-clip shadow-xs">
        <div className="p-3 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]/60">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-outline)]" />
            <input
              type="text"
              placeholder="Search by invoice #, party, or sales order #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface-container)] text-xs font-semibold text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full focus:outline-none focus:bg-[var(--color-surface)] focus:border-[var(--color-primary)] transition-all"
            />
          </div>
        </div>
        <div>
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-16 z-20">
              <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Invoice #</th>
                <th className="py-3.5 px-3">Party</th>
                <th className="py-3.5 px-3">Sales Orders</th>
                <th className="py-3.5 px-4 text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                    <FileCheck className="w-8 h-8 mx-auto text-[var(--color-outline-variant)] mb-2" />
                    <p className="text-xs font-bold">{invoices.length === 0 ? 'No consolidated invoices yet' : 'No invoices match the search'}</p>
                    <p className="text-[10px] mt-0.5">
                      {invoices.length === 0
                        ? 'Create one from the Create Invoice action — several sales orders fold into ONE GST invoice entry.'
                        : 'Try widening the search.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setDetailId(inv.id)}
                    className="hover:bg-[var(--color-surface-container-high)]/40 transition-colors cursor-pointer text-xs"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <Receipt className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                        <span className="font-bold text-[var(--color-on-surface)]">{inv.invoiceNumber}</span>
                      </div>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">{inv.date}</p>
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-[var(--color-on-surface)]">{partyNameOf(inv)}</td>
                    <td className="py-3.5 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)]">
                        <Layers className="w-3 h-3" /> {(inv.orders || []).length}
                      </span>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5 truncate max-w-[220px]">
                        {(inv.orders || []).map((lk) => sales.find((s) => s.id === lk.saleId)?.saleNumber || lk.saleNumber).join(', ')}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-[var(--color-on-surface)]">{formatCurrency(inv.totalAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal — the SHARED invoice story (also mounted by the party
          statement's ledger when the invoice's journal-voucher row is clicked) */}
      <SaleInvoiceDetailModal
        isOpen={Boolean(detail)}
        onClose={() => setDetailId(null)}
        invoice={detail}
        settings={settings}
      />
    </div>
  );
}