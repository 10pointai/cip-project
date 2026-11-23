import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X, Fuel, Wrench, Paperclip, Trash2, AlertTriangle, Receipt } from 'lucide-react';
import { Vehicle, CashBankAccount, VehicleExpenseEntry, Item, isDieselItemName } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { SearchableSelect } from '../orders/SearchableSelect';
import { EntityDocumentsSection, StagedDocument } from '../common/EntityDocumentsSection';
import { useToast } from '../common/Toast';

/** Suggested expense classifications — the same list the single form shows */
const EXPENSE_TYPE_SUGGESTIONS = [
  'PUUNCTURE + FITTING', 'TYRE CHANGE', 'TOLL CHARGES', 'PERMIT / NOC',
  'REPAIR & MAINT', 'SPARES & PARTS', 'WASHING', 'PARKING',
  'DRIVER BATA', 'POLICE CHALLAN', 'BATTERY / ELECTRICALS', 'ROAD TAX',
];

interface BulkExpenseRow {
  id: string;
  entryType: 'expense' | 'diesel';
  date: string;
  vehicleId: string;
  accountId: string;
  /** Diesel: the inventory location the fill issues FROM (required). */
  locationId: string;
  expenseType: string;
  litres: string;
  ratePerLitre: string;
  amount: string;
  notes: string;
  /** Per-row receipts — staged while the row is unsaved; their ids ride the
      create payload (documentIds — the server links them on the minted entry) */
  docs: StagedDocument[];
}

// The DEFAULT diesel rate comes from the app_defaults table (diesel_rate,
// seeded ₹99.8/litre — Settings-editable); fresh rows prefill it.
const emptyRow = (dieselRateDefault?: string): BulkExpenseRow => ({
  id: `bulkexp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  // Diesel is the DEFAULT entry kind (user directive 2026-10-28)
  entryType: 'diesel',
  date: new Date().toISOString().split('T')[0],
  vehicleId: '',
  accountId: '',
  locationId: '',
  expenseType: '',
  litres: '',
  ratePerLitre: dieselRateDefault && Number(dieselRateDefault) > 0 ? dieselRateDefault : '',
  amount: '',
  notes: '',
  docs: [],
});

interface BulkExpenseCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * BULK EXPENSE ENTRY — the expense/diesel mirror of the bulk sales grid
 * (user-directed 2026-10-28): ONE grid, each row carrying its own TYPE choice
 * (Expense / Diesel), typed quickly with searchable vehicle/account pickers.
 *  - Diesel amounts are STRICT litres × rate (locked — no override in bulk);
 *  - generic expense rows carry a free-text type + a typed amount;
 *  - every row can stage receipts (paperclip ⇢ per-row document section; the
 *    ids ride the create payload and link on the minted entry);
 *  - each saved row debits its chosen Cash/Bank account immediately (the
 *    single-entry server funnel, one call per row).
 * Starts with ONE empty row (user preference); "Add Row" / "+5" grows the grid.
 */
export function BulkExpenseCreateModal({ isOpen, onClose }: BulkExpenseCreateModalProps) {
  const { showToast } = useToast();
  const [docs, setDocs] = useState<BulkExpenseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // which row's receipt/documents drawer is expanded
  const [docsOpenFor, setDocsOpenFor] = useState<string | null>(null);

  // Fresh batch on every open (ONE row — user preference set with bulk sales);
  // rows default to DIESEL with the diesel_rate default prefilled
  useEffect(() => {
    if (!isOpen) return;
    setDocs([emptyRow(localDb.getAppDefault('diesel_rate'))]);
    setError(null);
    setDocsOpenFor(null);
  }, [isOpen]);

  const vehicles = useMemo<Vehicle[]>(() => {
    try { return localDb.getVehicles(); } catch { return []; }
  }, [isOpen]);
  const accounts = useMemo<CashBankAccount[]>(() => {
    try { return localDb.getAccounts(); } catch { return []; }
  }, [isOpen]);
  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  // The DEFAULT diesel rate — app_defaults table (diesel_rate, ₹99.8 seeded;
  // Settings-editable). Fresh rows prefill their Rate/lt from it.
  const dieselRateDefault = useMemo(() => {
    try { return localDb.getAppDefault('diesel_rate'); } catch { return undefined; }
  }, [isOpen]);
  // DIESEL FROM INVENTORY (2026-11-17): diesel rows issue from the diesel
  // item's per-location stock — never a direct fill.
  const dieselStockItem = useMemo<Item | undefined>(() => {
    try {
      return (localDb.getItems() || []).filter((i) => i.type !== 'asset' && i.isActive !== false && isDieselItemName(i.name))[0];
    } catch { return undefined; }
  }, [isOpen]);

  const blankRow = () => emptyRow(dieselRateDefault);

  const patchRow = (rowId: string, patch: Partial<BulkExpenseRow>) =>
    setDocs((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const addRows = (count: number) => setDocs((prev) => [...prev, ...Array.from({ length: count }, blankRow)]);
  const removeRow = (rowId: string) =>
    setDocs((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((r) => r.id !== rowId)));

  const round2 = (n: number) => Math.round(n * 100) / 100;

  /** Diesel: strict litres × rate; generic expense: the typed amount */
  const rowAmount = (r: BulkExpenseRow) =>
    r.entryType === 'diesel'
      ? round2((Number(r.litres) || 0) * (Number(r.ratePerLitre) || 0))
      : Number(r.amount) || 0;

  const totalAll = useMemo(
    () => docs.reduce((sum, r) => sum + rowAmount(r), 0),
    [docs]
  );

  // --- Submit ----------------------------------------------------------------
  const handleSubmitBatch = () => {
    const valid: BulkExpenseRow[] = [];
    for (let i = 0; i < docs.length; i++) {
      const r = docs[i];
      const num = `entry ${i + 1}`;
      if (!r.vehicleId) { setError(`${num}: select the vehicle.`); return; }
      if (r.entryType === 'diesel') {
        // Diesel rows issue from the yard stock — no account debit applies.
        if (!dieselStockItem) {
          setError(`${num}: no diesel item exists in inventory — create a product item named e.g. "Diesel" and receive its stock first.`);
          return;
        }
        if (!r.locationId) {
          setError(`${num}: pick the DIESEL LOCATION the fill is issued from.`);
          return;
        }
        const bucket = dieselStockItem.locations?.find((l) => l.locationId === r.locationId);
        const available = Number(bucket?.currentStock) || 0;
        if ((Number(r.litres) || 0) > available) {
          setError(`${num}: diesel at ${bucket?.locationName || 'that location'} is only ${available.toLocaleString('en-IN')} L — the fill exceeds the stock. Receive diesel inward first.`);
          return;
        }
      }
      if (r.entryType === 'expense' && (!r.accountId || !activeAccounts.some((a) => a.id === r.accountId))) {
        setError(`${num}: select an active Cash/Bank account to debit.`);
        return;
      }
      if (!r.date) { setError(`${num}: pick the date.`); return; }
      if (r.entryType === 'expense' && !r.expenseType.trim()) {
        setError(`${num}: enter the expense type (e.g. Puncture + Fitting).`);
        return;
      }
      if (r.entryType === 'diesel' && !((Number(r.litres) || 0) > 0)) {
        setError(`${num}: enter the litres filled.`);
        return;
      }
      if (!(rowAmount(r) > 0)) {
        setError(r.entryType === 'diesel' ? `${num}: litres × rate/lt is ₹0 — fill both.` : `${num}: enter the amount.`);
        return;
      }
      valid.push(r);
    }
    // One server call per entry (same funnel as the single form; row receipts
    // link via documentIds on the minted entry)
    for (const r of valid) {
      const payload: Partial<VehicleExpenseEntry> = {
        entryType: r.entryType,
        date: r.date,
        vehicleId: r.vehicleId,
        ...(r.entryType === 'expense'
          ? {
              expenseType: r.expenseType.trim(),
              accountId: r.accountId,
              litres: undefined,
              ratePerLitre: undefined,
              amount: Number(r.amount) || 0,
            }
          : {
              // Diesel: issued from the picked stock location; the rate is the
              // STRICT global snapshot and the fill moves no money.
              expenseType: undefined,
              litres: Number(r.litres),
              ratePerLitre: Number(dieselRateDefault) || undefined,
              dieselLocationId: r.locationId,
              accountId: undefined,
              amount: round2((Number(r.litres) || 0) * (Number(dieselRateDefault) || 0)),
            }),
        notes: r.notes.trim() || undefined,
        ...(r.docs.length > 0 ? { documentIds: r.docs.map((d) => d.id) } : {}),
      };
      localDb.addVehicleExpenseEntry(payload);
    }
    showToast(`${valid.length} expense entr${valid.length === 1 ? 'y' : 'ies'} created!`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--color-scrim)]/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] w-full max-w-[94vw] max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-outline-variant)] flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
              <Wrench className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm flex items-center gap-2">
                Add Expense Entries in Bulk
                
              </h3>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                Diesel fills issue FROM the inventory item's stock locations (pick one per row; the global rate ₹{(Number(dieselRateDefault) || 0).toLocaleString('en-IN')}/lt — Settings-editable — snapshots onto each row and NO account is debited).
                Generic expense rows debit their chosen Cash/Bank account.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* The grid */}
        <div className="flex-1 overflow-auto p-4 space-y-2.5">
          <div className="border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-surface-container)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[1720px]">
                <thead>
                  <tr className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-[10px] uppercase border-b border-[var(--color-outline-variant)]">
                    <th className="py-2.5 px-2 w-10 text-center">#</th>
                    <th className="py-2.5 px-2 w-32">Type</th>
                    <th className="py-2.5 px-2 w-40">Date</th>
                    <th className="py-2.5 px-2 min-w-[200px]">Vehicle</th>
                    <th className="py-2.5 px-2 min-w-[220px]">Debit Account / Diesel From</th>
                    <th className="py-2.5 px-2 min-w-[190px]">Expense Type</th>
                    <th className="py-2.5 px-2 w-24 text-right">Litres</th>
                    <th className="py-2.5 px-2 w-28 text-right">Rate/lt</th>
                    <th className="py-2.5 px-2 w-36 text-right">Amount (₹)</th>
                    <th className="py-2.5 px-2 min-w-[220px]">Remarks</th>
                    <th className="py-2.5 px-2 w-12 text-center">Docs</th>
                    <th className="py-2.5 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
                  {docs.map((r, i) => (
                    <React.Fragment key={r.id}>
                      <tr className="hover:bg-[var(--color-surface-container-high)]/40 text-xs">
                        <td className="py-2 px-2 text-center text-[10px] font-black text-[var(--color-on-surface-variant)] align-top">{i + 1}</td>
                        {/* Type — Expense / Diesel (per-row choice) */}
                        <td className="py-2 px-2 align-top">
                          <select
                            value={r.entryType}
                            onChange={(e) => {
                              const t = e.target.value as 'expense' | 'diesel';
                              // switching kind clears the other kind's inputs
                              patchRow(r.id, t === 'diesel'
                                ? { entryType: t, expenseType: '', amount: '', locationId: '', ratePerLitre: dieselRateDefault && Number(dieselRateDefault) > 0 ? dieselRateDefault : '' }
                                : { entryType: t, litres: '', ratePerLitre: '', locationId: '', accountId: r.accountId });
                            }}
                            className="w-full px-2 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          >
                            <option value="expense">Expense</option>
                            <option value="diesel">Diesel</option>
                          </select>
                        </td>
                        <td className="py-2 px-2 align-top">
                          <input
                            type="date"
                            value={r.date}
                            onChange={(e) => patchRow(r.id, { date: e.target.value })}
                            className="w-full px-2 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] font-medium text-[var(--color-on-surface)] focus:outline-none"
                          />
                        </td>
                        {/* Vehicle + Account — searchable pickers like the single form */}
                        <td className="py-2 px-2 align-top min-w-[200px]">
                          <SearchableSelect
                            value={r.vehicleId}
                            onChange={(v) => patchRow(r.id, { vehicleId: v })}
                            placeholder="Type vehicle number..."
                            options={ vehicles.map((v) => ({
                              value: v.id,
                              label: v.vehicleNo,
                              sub: `${v.type} · ${v.status === 'on_trip' ? 'on trip' : v.status}`,
                            }))}
                          />
                        </td>
                        {/* DEBIT ACCOUNT (generic) / DIESEL LOCATION (diesel):
                            a diesel fill draws from the diesel item's stock
                            buckets — the account column becomes that picker. */}
                        <td className="py-2 px-2 align-top min-w-[220px]">
                          {r.entryType === 'expense' ? (
                            <SearchableSelect
                              value={r.accountId}
                              onChange={(v) => patchRow(r.id, { accountId: v })}
                              placeholder="Select account to debit..."
                              options={activeAccounts.map((a) => ({
                                value: a.id,
                                label: a.name,
                                sub: `${a.type === 'bank' ? (a.bankName || 'Bank A/c') : 'Cash'} · bal ₹${(a.currentBalance || 0).toLocaleString('en-IN')}`,
                              }))}
                            />
                          ) : !dieselStockItem ? (
                            <span className="text-[10px] font-bold text-[var(--color-error)] block px-1 py-1.5">No diesel item in inventory</span>
                          ) : (
                            <select
                              value={r.locationId}
                              onChange={(e) => patchRow(r.id, { locationId: e.target.value })}
                              className="w-full px-2 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            >
                              <option value="">-- Diesel stock location --</option>
                              {(dieselStockItem.locations || []).map((l) => (
                                <option key={l.locationName} value={l.locationId || ''}>
                                  {l.locationName} · {Number(l.currentStock) || 0} L
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        {/* Expense type (generic) / — (diesel) */}
                        <td className="py-2 px-2 align-top min-w-[190px]">
                          {r.entryType === 'expense' ? (
                            <input
                              type="text"
                              list="bulk-expense-types"
                              placeholder="e.g. Puncture + Fitting"
                              value={r.expenseType}
                              onChange={(e) => patchRow(r.id, { expenseType: e.target.value.toUpperCase() })}
                              className="w-full px-2 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] font-bold text-[var(--color-on-surface)] focus:outline-none"
                            />
                          ) : (
                            <span className="text-[var(--color-outline)] font-bold text-center block">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 align-top text-right">
                          {r.entryType === 'diesel' ? (
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0"
                              value={r.litres}
                              onChange={(e) => patchRow(r.id, { litres: e.target.value })}
                              className="w-full px-2 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] font-bold text-[var(--color-on-surface)] text-right focus:outline-none"
                            />
                          ) : (
                            <span className="text-[var(--color-outline)] font-bold text-center block">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 align-top text-right">
                          {r.entryType === 'diesel' ? (
                            // STRICT GLOBAL RATE — the app-default snapshot is
                            // the row's price; never typed or edited.
                            <span
                              title="Every diesel row prices at the global diesel_rate (Settings → Defaults)"
                              className="inline-block px-2 py-1.5 rounded-lg bg-[var(--color-surface-container-high)] text-[11px] font-black text-[var(--color-on-surface-variant)] whitespace-nowrap"
                            >
                              ₹{(Number(dieselRateDefault) || 0).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-[var(--color-outline)] font-bold text-center block">—</span>
                          )}
                        </td>
                        {/* Amount — expense row: typed; diesel: STRICT litres × rate (locked) */}
                        <td className="py-2 px-2 align-top text-right whitespace-nowrap">
                          {r.entryType === 'diesel' ? (
                            <span
                              title="Diesel amount is strictly litres × rate/lt"
                              className="inline-block px-2.5 py-1.5 rounded-lg bg-[var(--color-tertiary-container)]/50 text-[11px] font-black text-[var(--color-on-tertiary-container)]"
                            >
                              ₹{rowAmount(r).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0.00"
                              value={r.amount}
                              onChange={(e) => patchRow(r.id, { amount: e.target.value })}
                              className="w-full px-2 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] font-bold text-[var(--color-on-surface)] text-right focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="py-2 px-2 align-top min-w-[220px]">
                          <input
                            type="text"
                            placeholder="e.g. Paid by driver in cash"
                            value={r.notes}
                            onChange={(e) => patchRow(r.id, { notes: e.target.value })}
                            className="w-full px-2 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] font-medium text-[var(--color-on-surface)] focus:outline-none"
                          />
                        </td>
                        {/* Per-row receipts (staged while creating; link on save) */}
                        <td className="py-2 px-2 text-center align-top">
                          <button
                            type="button"
                            onClick={() => setDocsOpenFor(docsOpenFor === r.id ? null : r.id)}
                            className={`relative p-1.5 rounded-full transition-colors ${docsOpenFor === r.id ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'}`}
                            title="Receipts for this entry"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            {r.docs.length > 0 && (
                              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[8px] font-black flex items-center justify-center">
                                {r.docs.length}
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="py-2 px-2 text-center align-top">
                          <button
                            type="button"
                            onClick={() => removeRow(r.id)}
                            className="p-1 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-full transition-colors"
                            title="Remove this row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {/* The row's receipts drawer — staged while creating */}
                      {docsOpenFor === r.id && (
                        <tr key={`${r.id}-docs`} className="bg-[var(--color-surface-container)]/70">
                          <td colSpan={12} className="p-3 border-t border-[var(--color-outline-variant)]/50">
                            <div className="max-w-2xl">
                              <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] mb-1.5">
                                Receipts — entry #{i + 1} (vehicle {vehicles.find((v) => v.id === r.vehicleId)?.vehicleNo || 'not picked yet'})
                              </p>
                              <EntityDocumentsSection
                                feature="vehicle-expense"
                                staged={r.docs}
                                onStagedChange={(d) => patchRow(r.id, { docs: d })}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* suggestions list — one shared datalist for the free-text types */}
          <datalist id="bulk-expense-types">
            {EXPENSE_TYPE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          {/* Row grow controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addRows(1)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
            <button
              type="button"
              onClick={() => addRows(5)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add 5
            </button>
          </div>

          {/* Error banner */}
          {error && (
            <div className="p-3 rounded-xl bg-[var(--color-error-container)]/40 border border-[var(--color-error)]/30 flex items-center gap-2 text-[11px] text-[var(--color-error)] font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="ml-auto p-1 hover:opacity-70">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]/60 flex items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--color-on-surface-variant)]">
            <strong className="text-[var(--color-on-surface)]">{docs.length}</strong> entr{docs.length === 1 ? 'y' : 'ies'} —{' '}
            <strong className="text-[var(--color-on-surface)]">₹{round2(totalAll).toLocaleString('en-IN')}</strong> total debits
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
              onClick={handleSubmitBatch}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full transition-all shadow-xs active:scale-95"
            >
              <Receipt className="w-3.5 h-3.5" />
              Create {docs.length} Entr{docs.length === 1 ? 'y' : 'ies'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}