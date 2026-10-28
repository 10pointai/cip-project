import React, { useEffect, useMemo, useState } from 'react';
import { X, FileCheck, AlertTriangle, Users } from 'lucide-react';
import { Party, Sale, CashBankAccount, CompanySettings, SalesOrderItem, SaleInvoiceItem } from '../../types';
import { SearchableSelect } from './SearchableSelect';

interface CreateSaleInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  parties: Party[];
  sales: Sale[];
  accounts: CashBankAccount[];
  settings: CompanySettings;
  /** Pre-selected (locked) party — the Party-detail entry point */
  presetPartyId?: string;
  /** App-level handler (cloudStore.addSaleInvoice → POST /api/sales-invoices) */
  onSubmit: (payload: any) => any;
}

/**
 * CONSOLIDATED SALES INVOICE — one invoice for N sales orders.
 * Flow: pick a party → check the sale's uninvoiced sales orders → submit.
 * 2026-10-28: no date range (the party's full uninvoiced list is fetched) and
 * NO payment choice — every sales order already booked its flow as CREDIT at
 * creation; the invoice is a pure document that posts nothing of its own.
 * The server folds the selected masters into ONE invoice entry, flattens
 * their current-stage lines, and stamps `is_invoiced` on every member.
 */
export function CreateSaleInvoiceModal({
  open,
  onClose,
  parties,
  sales,
  accounts,
  settings,
  presetPartyId,
  onSubmit,
}: CreateSaleInvoiceModalProps) {
  const [partyId, setPartyId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fresh state per open (party preset from the Party-detail entry point)
  useEffect(() => {
    if (open) {
      setPartyId(presetPartyId || '');
      setSelectedIds(new Set());
      setNotes('');
      setError(null);
    }
  }, [open, presetPartyId]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      maximumFractionDigits: 2,
    }).format(amount || 0);

  // Eligible members: the party's UNinvoiced, confirmed SALES ORDERS — their
  // date range selectors were removed (2026-10-28); every uninvoiced confirmed
  // order of the party lists here. (latest stage must be sales_order —
  // quotations bill after they advance; legacy invoice-stage rows excluded.)
  const eligible = useMemo(() => {
    if (!partyId) return [];
    return sales
      .filter(
        (s) =>
          s.partyId === partyId &&
          !s.isInvoiced &&
          s.status !== 'cancelled' &&
          !((s.stages || []).some((st) => st.stageType === 'sales_invoice')) &&
          (s.stages || []).length > 0 &&
          (s.stages || [])[(s.stages || []).length - 1].stageType === 'sales_order'
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first, like the list
  }, [sales, partyId]);

  // A party change or range change invalidates the checkbox set — drop
  // selections that are no longer eligible.
  useEffect(() => {
    setSelectedIds((prev) => {
      const keep = new Set<string>();
      for (const id of prev) {
        if (eligible.some((s) => s.id === id)) keep.add(id);
      }
      if (keep.size !== prev.size) return keep;
      return prev;
    });
  }, [eligible]);

  const selectedSales = useMemo(() => eligible.filter((s) => selectedIds.has(s.id)), [eligible, selectedIds]);

  // Totals mirror the server: Σ each member's current (latest) stage figures —
  // every stage total already includes its own transport / freight GST.
  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;
    let transportCharges = 0;
    for (const s of selectedSales) {
      const latest = (s.stages || []).length > 0 ? (s.stages || [])[(s.stages || []).length - 1] : undefined;
      subtotal += Number(latest?.subtotal) || 0;
      taxAmount += Number(latest?.taxAmount) || 0;
      totalAmount += Number(latest?.totalAmount) || 0;
      transportCharges += Number(s.transportCharges) || 0;
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return { subtotal: r2(subtotal), taxAmount: r2(taxAmount), totalAmount: r2(totalAmount), transportCharges: r2(transportCharges) };
  }, [selectedSales]);

  const toggleSale = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!partyId) {
      setError('Choose the party whose sales orders this invoice bills.');
      return;
    }
    if (selectedSales.length === 0) {
      setError('Select at least one sales order to invoice.');
      return;
    }
    setError(null);
    // Flattened lines for the instant optimistic view (server re-derives its
    // own authoritative rows from the member masters).
    const optimisticItems: SaleInvoiceItem[] = selectedSales.flatMap((s) => {
      const latest = (s.stages || []).length > 0 ? (s.stages || [])[(s.stages || []).length - 1] : undefined;
      const rows = (latest?.items || s.items || []) as SalesOrderItem[];
      return rows
        .filter((li) => (Number(li.quantity) || 0) !== 0)
        .map((li) => ({
          id: `sli-opt-${s.id}-${li.id}`,
          salesInvoiceId: '',
          saleId: s.id,
          saleNumber: s.saleNumber,
          itemId: li.itemId,
          unitId: li.unitId,
          itemName: li.itemName,
          itemCode: li.itemCode,
          unit: li.unit,
          location: li.location,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.amount ?? li.quantity * li.rate,
          gstRate: li.gstRate,
          locationId: li.locationId,
          itemNotes: li.itemNotes,
        }));
    });
    onSubmit({
      partyId,
      date: new Date().toISOString().split('T')[0],
      saleIds: selectedSales.map((s) => s.id),
      notes: notes.trim() || undefined,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      transportCharges: totals.transportCharges,
      items: optimisticItems,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--color-outline-variant)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-[var(--color-on-surface)]">Create Consolidated Invoice</h2>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                One GST invoice for several sales orders of one party — invoiced orders lock and become Complete.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-[var(--color-surface-container)] transition-colors shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-[var(--color-on-surface-variant)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Party select (date-range selectors removed 2026-10-28) */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
              Party <span className="text-[var(--color-error)] font-bold">*</span>
            </label>
            <div className={`w-full px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl focus-within:ring-2 focus-within:ring-[var(--color-primary)] ${presetPartyId ? 'opacity-70' : ''}`}>
              <SearchableSelect
                // Party NAME is the picker label (tradeName rides the sub-line)
                value={partyId}
                onChange={(v) => setPartyId(v)}
                disabledText={presetPartyId ? (parties.find((p) => p.id === presetPartyId)?.name || '') : undefined}
                placeholder="Select a party..."
                options={parties.map((p) => ({
                  value: p.id,
                  label: p.name,
                  sub: p.tradeName ? p.tradeName : undefined,
                }))}
              />
            </div>
          </div>

          {/* Invoiceable sales orders (checkboxes) */}
          <div className="rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--color-surface-container)] flex items-center justify-between border-b border-[var(--color-outline-variant)]">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)]">
                Sales Orders — {eligible.length} uninvoiced
              </p>
              <button
                type="button"
                onClick={() =>
                  setSelectedIds((prev) =>
                    prev.size === eligible.length ? new Set() : new Set(eligible.map((s) => s.id))
                  )
                }
                disabled={eligible.length === 0}
                className="text-[10px] font-bold text-[var(--color-primary)] hover:underline disabled:opacity-40"
              >
                {selectedIds.size === eligible.length && eligible.length > 0 ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-[var(--color-outline-variant)]/50">
              {eligible.length === 0 ? (
                <div className="py-10 text-center">
                  <Users className="w-6 h-6 mx-auto text-[var(--color-outline-variant)] mb-1.5" />
                  <p className="text-xs font-bold text-[var(--color-on-surface-variant)]">No invoiceable sales orders</p>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5 max-w-xs mx-auto">
                    {partyId
                      ? 'Every confirmed sales order of this party is already invoiced (quotations bill after they advance to Sales Order).'
                      : 'Choose a party to list its sales orders.'}
                  </p>
                </div>
              ) : (
                eligible.map((s) => {
                  const latest = (s.stages || []).length > 0 ? (s.stages || [])[(s.stages || []).length - 1] : undefined;
                  const checked = selectedIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-surface-container)] transition-colors ${checked ? 'bg-[var(--color-surface-container-high)]/50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSale(s.id)}
                        className="w-4 h-4 accent-[var(--color-primary)] rounded"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-[var(--color-on-surface)] truncate">{s.saleNumber}</span>
                        <span className="block text-[10px] text-[var(--color-on-surface-variant)]">
                          {s.date} · {(s.items || []).length} item(s)
                          {!s.inventoryApplied && ' · dispatch pending'}
                        </span>
                      </span>
                      <span className="text-xs font-black text-[var(--color-on-surface)] shrink-0">
                        {formatCurrency(Number(latest?.totalAmount) || 0)}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* NO payment-settlement section (2026-10-28): every sales order
              already booked its flow as CREDIT at creation — the invoice is a
              pure document and posts nothing of its own */}

          {/* Notes */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Invoice notes (optional)"
            rows={2}
            className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />

          {/* Error banner */}
          {error && (
            <div className="p-3 rounded-xl bg-[var(--color-error-container)]/40 border border-[var(--color-error)]/30 flex items-center gap-2 text-[11px] text-[var(--color-error)] font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]/60">
          <div className="text-[11px] text-[var(--color-on-surface-variant)]">
            <strong className="text-[var(--color-on-surface)]">{selectedIds.size}</strong> order(s) selected —{' '}
            <strong className="text-[var(--color-on-surface)]">₹{totals.totalAmount.toLocaleString('en-IN')}</strong> invoice total
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-bold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full transition-all shadow-xs active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              <FileCheck className="w-3.5 h-3.5" />
              Create Invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}