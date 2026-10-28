import React from 'react';
import { X, Receipt, Layers } from 'lucide-react';
import { SaleInvoice, CompanySettings } from '../../types';

interface SaleInvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SaleInvoice | null;
  settings: CompanySettings;
}

/**
 * CONSOLIDATED SALES INVOICE story modal — the same read-only view the Sales
 * feature's Invoices tab opens: flat line table, member sales-order strip,
 * settlement record (left) + totals (right; Total Transportation Cost is the
 * roll-up of the member orders' transport charges, already inside the total).
 * Mounted by SaleInvoicesView (invoices tab) AND the party statement's ledger
 * (clicking the invoice's journal-voucher row opens THIS, not the generic
 * payment-voucher modal).
 */
export function SaleInvoiceDetailModal({ isOpen, onClose, invoice, settings }: SaleInvoiceDetailModalProps) {
  const detail = invoice;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);

  const settlementChip = (inv: SaleInvoice) => null
    

  if (!isOpen || !detail) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--color-outline-variant)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-[var(--color-on-surface)]">Consolidated Invoice {detail.invoiceNumber}</h2>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                {detail.partyName || '—'} · {detail.date} · {(detail.orders || []).length} sales order(s)
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-[var(--color-surface-container)] transition-colors shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-[var(--color-on-surface-variant)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Member orders strip */}
          <div className="flex flex-wrap gap-2">
            {(detail.orders || []).map((lk) => (
              <span key={lk.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)]">
                {lk.saleNumber || lk.saleId}
                <span className="text-[var(--color-on-surface-variant)] font-medium">{formatCurrency(lk.saleTotalAmount)}</span>
              </span>
            ))}
          </div>

          {/* Line items — ONE flat table, every item in sequence (no
              per-sales-order grouping) */}
          <div className="rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[var(--color-on-surface-variant)] border-b border-[var(--color-outline-variant)]/50 bg-[var(--color-surface-container)]">
                  <th className="py-2 px-3">Material</th>
                  <th className="py-2 px-2">Qty</th>
                  <th className="py-2 px-2">Rate</th>
                  <th className="py-2 px-2">GST %</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]/40">
                {(detail.items || []).map((li) => (
                  <tr key={li.id} className="text-xs">
                    <td className="py-2 px-3 font-semibold text-[var(--color-on-surface)]">
                      {li.itemName || '—'}
                      {li.itemCode && <span className="text-[10px] text-[var(--color-on-surface-variant)] ml-1.5">{li.itemCode}</span>}
                      {li.location && <span className="text-[10px] text-[var(--color-on-surface-variant)] ml-1.5">· {li.location}</span>}
                    </td>
                    <td className="py-2 px-2 text-[var(--color-on-surface)]">{li.quantity} {li.unit || ''}</td>
                    <td className="py-2 px-2 text-[var(--color-on-surface-variant)]">{formatCurrency(li.rate)}</td>
                    <td className="py-2 px-2 text-[var(--color-on-surface-variant)]">{li.gstRate ?? 0}%</td>
                    <td className="py-2 px-2 text-right font-bold text-[var(--color-on-surface)]">{formatCurrency(li.amount ?? li.quantity * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Settlement record (left) + totals (right) */}
          <div className="rounded-2xl border border-[var(--color-outline-variant)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">{settlementChip(detail)}</div>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                Journal voucher: <strong className="text-[var(--color-on-surface)]">{detail.invoiceVoucherNumber || '—'}</strong>
                {detail.settlementVoucherNumber && (
                  <>
                    {' · '}Receipt: <strong className="text-[var(--color-on-surface)]">{detail.settlementVoucherNumber}</strong>
                  </>
                )}
              </p>
              {detail.settlementAccountName && (
                <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                  Account: <strong className="text-[var(--color-on-surface)]">{detail.settlementAccountName}</strong>
                  {detail.settledAmount !== undefined && <> · settled {formatCurrency(detail.settledAmount)}</>}
                  {detail.settledDate && <> on {detail.settledDate}</>}
                </p>
              )}
              {detail.notes && (
                <p className="text-[11px] text-[var(--color-on-surface-variant)] whitespace-pre-wrap border-t border-[var(--color-outline-variant)]/60 pt-2">
                  {detail.notes}
                </p>
              )}
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-[var(--color-on-surface-variant)]">
                <span>Subtotal</span>
                <span className="font-semibold">{formatCurrency(detail.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[var(--color-on-surface-variant)]">
                <span>GST</span>
                <span className="font-semibold">{formatCurrency(detail.taxAmount)}</span>
              </div>
              {(detail.transportCharges ?? 0) > 0 && (
                <div className="flex justify-between text-[var(--color-on-surface-variant)]">
                  <span>Total Transportation Cost <span className="text-[9px]">(from the sales orders)</span></span>
                  <span className="font-semibold">{formatCurrency(detail.transportCharges)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-[var(--color-outline-variant)] pt-2">
                <span className="font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] text-[10px]">Invoice Total</span>
                <span className="font-black text-[var(--color-on-surface)]">{formatCurrency(detail.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — close only (invoices are created from the Create
            Invoice action; no cancel affordance here) */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]/60">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full transition-all shadow-xs active:scale-95"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}