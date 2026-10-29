import React, { useState } from 'react';
import {
  ArrowLeft, Pencil, Package, Wrench, Warehouse, Layers, IndianRupee,
  Calendar, MapPin, Paperclip, LayoutDashboard, Scale,
} from 'lucide-react';
import { Item, ItemCategory, StockMovementLog } from '../../types';
import { EntityDocumentsSection } from '../common/EntityDocumentsSection';
import { formatDateTime } from '../../utils/formatters';

/** Stage chips for movement rows — LADDER TERMS (user rule): dispatches read
 *  "Sales Order", inwards read "Goods Receiving", production rows read their
 *  own terms, adjustments read "Stock Adjustment" (the row's direction shows
 *  in the signed In/Out column). Colours follow the sales table / party
 *  ledger families. */
const MOVEMENT_CHIPS: Record<string, { label: string; cls: string }> = {
  sale_dispatch: { label: 'Sales Order', cls: 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]' },
  purchase_inward: { label: 'Goods Receiving', cls: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]' },
  production_output: { label: 'Production Output', cls: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]' },
  production_consumed: { label: 'Production Consumed', cls: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]' },
  opening: { label: 'Opening', cls: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]' },
  reconciliation_in: { label: 'Audit', cls: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]' },
  reconciliation_out: { label: 'Audit', cls: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]' },
  adjustment_increase: { label: 'Stock Adjustment', cls: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]' },
  adjustment_decrease: { label: 'Stock Adjustment', cls: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]' },
  dispatch_reversal: { label: 'Dispatch Reversal', cls: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)] opacity-55' },
  inward_reversal: { label: 'Inward Reversal', cls: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)] opacity-55' },
};

interface ItemDetailPageProps {
  item: Item;
  category?: ItemCategory;
  currencySymbol: string;
  onBack: () => void;
  /** Open the item's add/edit form (ItemsView: handleEdit) */
  onEdit: (item: Item) => void;
}

const MOVEMENT_LABELS: Record<string, string> = {
  purchase_inward: 'Purchase Inward',
  production_output: 'Production Output',
  production_consumed: 'Production Consumed',
  sale_dispatch: 'Sale Dispatch',
  opening: 'Opening Stock',
  reconciliation_in: 'Audit Reconciliation',
  reconciliation_out: 'Audit Reconciliation',
  adjustment_increase: 'Stock Adjustment',
  adjustment_decrease: 'Stock Adjustment',
  dispatch_reversal: 'Dispatch Reversal',
  inward_reversal: 'Inward Reversal',
};

/** The movement's DOC AND REF primary text — "whatever ref number" the ledger
 *  carries, with the party-ledger's labelling rule on sale dispatches (bare
 *  serial → `RST 0001`). */
const docIdOfMovement = (mov: StockMovementLog): string => {
  const ref = (mov.referenceNumber || '').trim();
  if (!ref) return '—';
  return mov.type === 'sale_dispatch' && /^\d+$/.test(ref) ? `RST ${ref}` : ref;
};

/**
 * FULL ITEM PROFILE PAGE — the Inventory mirror of the party/employee/vehicle
 * profiles: clicking a catalog row replaces the tab content with this page
 * (Back returns to the list). Everything about the item in ordered sections:
 * the story numbers (stock / value / rates), every master field the edit form
 * carries, the per-location stock breakdown, the FULL FIFO movements ledger
 * and the item's documents. LIVE with syncs — the parent re-renders on every
 * cloudStore tick, so a saved movement shows up in place.
 */
export function ItemDetailPage({ item, category, currencySymbol, onBack, onEdit }: ItemDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'movements' | 'documents'>('overview');

  const isProduct = item.type === 'product';
  const costPrice = item.openingStockPrice || item.purchasePrice || 0;

  const fmtVal = (v: number) =>
    `${currencySymbol} ${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // --- The story numbers (FIFO valuation from the ledger — facts, not catalog) ---
  const stockValue = isProduct
    ? (item.stockValue !== undefined && item.stockValue !== null
        ? Number(item.stockValue)
        : (Number(item.currentStock) || 0) * (Number(item.valuationRate) || 0))
    : 0;
  const stockValue2 = Math.round(stockValue * 100) / 100;
  const valuationRate = Number(item.valuationRate) || 0;

  const movements = item.movements || [];

  // Multi-location breakdown — the same derivation the catalog table uses
  const rawLocs = isProduct
    ? (item.locations && item.locations.length > 0
        ? item.locations
        : item.stockLocation
          ? item.stockLocation.split(',').map((s, idx) => ({
              locationName: s.trim(),
              currentStock: idx === 0 ? Number(item.currentStock) || 0 : 0,
              openingStock: idx === 0 ? Number(item.openingStock) || 0 : 0,
            }))
          : [])
    : [];
  const seenLocs = new Set<string>();
  const itemLocations = rawLocs.filter((l) => {
    const n = l.locationName?.trim();
    if (!n || seenLocs.has(n.toLowerCase())) return false;
    seenLocs.add(n.toLowerCase());
    return true;
  });

  const TABS: Array<{ id: 'overview' | 'movements' | 'documents'; label: string; icon: any; count?: string }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'movements', label: 'Movements', icon: Warehouse, count: String(movements.length) },
    { id: 'documents', label: 'Documents', icon: Paperclip },
  ];

  const DetailCell = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) => (
    <div className={wide ? 'col-span-2 sm:col-span-3' : ''}>
      <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)]">{label}</p>
      <div className="text-xs font-bold text-[var(--color-on-surface)] mt-1">{children}</div>
    </div>
  );

  const KpiCard = ({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub?: string; tone?: string }) => (
    <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone || 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)]">{label}</p>
        <p className="text-base font-black text-[var(--color-on-surface)] truncate">{value}</p>
        {sub && <p className="text-[9px] font-semibold text-[var(--color-on-surface-variant)] truncate">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6" id="item-profile-page">
      {/* 1. HERO — back to the catalog, name + code + chips, actions */}
      <div className="rounded-3xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full font-medium transition-colors shrink-0"
              title="Back to the Master Catalog"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Inventory</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${category?.color || '#005ac1'}15`, color: category?.color || '#005ac1' }}
                >
                  {isProduct ? <Package className="w-6 h-6" /> : <Wrench className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-black text-[var(--color-on-surface)] tracking-tight">{item.name}</h1>
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]">
                      {item.code}
                    </span>
                    {!item.isActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-error-container)] text-[var(--color-error)]">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-1">
                    Item profile · {item.categoryName || category?.name || 'General'} · <span className="capitalize">{item.type}</span>
                    {isProduct ? ` · tracked in ${item.unit}` : ' · service'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all hover:scale-[1.01] active:scale-[0.99] shrink-0"
            title="Edit this item's details / rates / stock"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Item
          </button>
        </div>
      </div>

      {/* 2. STORY NUMBERS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Warehouse}
          label="Current Stock"
          value={isProduct ? `${(Number(item.currentStock) || 0).toLocaleString('en-IN')} ${item.unit}` : '—'}
          sub={isProduct && item.openingStock ? `opening ${(item.openingStock || 0).toLocaleString('en-IN')} ${item.unit}` : isProduct ? 'no opening stock' : 'not stock-tracked'}
          tone="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]"
        />
        <KpiCard
          icon={Layers}
          label="Stock Value"
          value={isProduct ? fmtVal(stockValue2) : '—'}
          sub={isProduct && valuationRate > 0 ? `FIFO rate ${fmtVal(valuationRate)}/unit` : isProduct ? 'no FIFO lots valued' : '—'}
          tone="bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]"
        />
        <KpiCard
          icon={IndianRupee}
          label="Selling Rate"
          value={fmtVal(item.salePrice)}
          sub={`per ${item.unit} · GST ${item.taxRateGst}%`}
          tone="bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]"
        />
        <KpiCard
          icon={Scale}
          label="Cost Rate"
          value={costPrice > 0 ? fmtVal(costPrice) : '—'}
          sub={costPrice > 0 ? `per ${item.unit} (opening/procurement)` : 'Cost not configured'}
          tone="bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]"
        />
      </div>

      {/* 3. SECTION TABS */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map((t) => {
          const TIcon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-bold transition-all border ${
                active
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)] shadow-xs'
                  : 'bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              <TIcon className="w-3.5 h-3.5" />
              {t.label}
              {t.count !== undefined && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-[var(--color-surface-container-high)]'}`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4a. OVERVIEW — every master field the edit form carries */}
      {activeTab === 'overview' && (
        <div className="space-y-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailCell label="Type"><span className="capitalize">{item.type}</span></DetailCell>
          <DetailCell label="Category">{item.categoryName || category?.name || 'General'}</DetailCell>
          <DetailCell label="Unit">{item.unit}</DetailCell>
          <DetailCell label={item.type === 'product' ? 'HSN Code' : 'SAC Code'}>
            {item.hsnSacCode ? <span className="font-mono">{item.hsnSacCode}</span> : '—'}
          </DetailCell>
          <DetailCell label="GST Slab">{item.taxRateGst}%</DetailCell>
          <DetailCell label="Selling Rate">{fmtVal(item.salePrice)} <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">per {item.unit}</span></DetailCell>
          <DetailCell label="Opening / Cost Rate">
            {costPrice > 0 ? `${fmtVal(costPrice)} per ${item.unit}` : '—'}
          </DetailCell>
          {isProduct && (
            <>
              <DetailCell label="Current Stock">
                {(Number(item.currentStock) || 0).toLocaleString('en-IN')} {item.unit}
                {Number(item.currentStock) > 0 && Number(item.valuationRate) > 0 && (
                  <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] ml-1.5">
                    ≈ {fmtVal(stockValue2)}
                  </span>
                )}
              </DetailCell>
              <DetailCell label="Min Alert Level">
                {(Number(item.minStockLevel) || 0).toLocaleString('en-IN')} {item.unit}
              </DetailCell>
              {item.maxCapacity ? (
                <DetailCell label="Max Capacity">{Number(item.maxCapacity).toLocaleString('en-IN')} {item.unit}</DetailCell>
              ) : null}
              {item.openingStock !== undefined && item.openingStock > 0 && (
                <DetailCell label="Opening Stock">
                  {Number(item.openingStock).toLocaleString('en-IN')} {item.unit}
                  {(Number(item.openingStockPrice) || 0) > 0 && (
                    <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] ml-1.5">
                      @ {fmtVal(item.openingStockPrice || 0)}
                    </span>
                  )}
                </DetailCell>
              )}
              {item.openingStockDate && (
                <DetailCell label="Opening / Audit Date">
                  <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3 text-[var(--color-outline)]" />{new Date(item.openingStockDate).toLocaleDateString('en-IN')}</span>
                </DetailCell>
              )}
              {itemLocations.length > 0 && (
                <DetailCell label="Storage Locations" wide>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {itemLocations.map((loc, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]"
                        title={`${loc.locationName}: ${(loc.currentStock || 0).toLocaleString('en-IN')} ${item.unit}`}
                      >
                        <MapPin className="w-2.5 h-2.5 text-[var(--color-primary)]" />
                        {loc.locationName}: <span className="font-bold text-[var(--color-primary)]">{(loc.currentStock || 0).toLocaleString('en-IN')} {item.unit}</span>
                      </span>
                    ))}
                  </div>
                </DetailCell>
              )}
            </>
          )}
          <DetailCell label="Created On" wide>
            {(item.createdAt || '').split('T')[0] || '—'}
          </DetailCell>
          {item.technicalSpecs && (
            <DetailCell label="Technical Specifications & Mix Compliance" wide>
              <span className="font-medium text-[var(--color-on-surface-variant)] whitespace-pre-wrap">{item.technicalSpecs}</span>
            </DetailCell>
          )}
          {item.remarks && (
            <DetailCell label="Remarks, Delivery & Operational Notes" wide>
              <span className="font-medium text-[var(--color-on-surface-variant)] whitespace-pre-wrap">{item.remarks}</span>
            </DetailCell>
          )}
        </div>
      )}

      {/* 4b. MOVEMENTS — the item's full FIFO stock-movements ledger */}
      {activeTab === 'movements' && (
        <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] overflow-clip">
          <div className="px-4 py-3 bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5" /> Stock Movements — {movements.length} entr{movements.length === 1 ? 'y' : 'ies'}
            </p>
            <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">
              {isProduct ? `${(Number(item.currentStock) || 0).toLocaleString('en-IN')} ${item.unit} on hand` : '—'}
            </p>
          </div>
          {movements.length === 0 ? (
            <p className="px-4 py-10 text-center text-[11px] text-[var(--color-on-surface-variant)]">
              No stock movements recorded for this item yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[980px] border-collapse">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wider text-[var(--color-on-surface-variant)] border-b border-[var(--color-outline-variant)]/50 bg-[var(--color-surface-container)]">
                    <th className="py-2 px-4">Doc &amp; Ref</th>
                    <th className="py-2 px-3">Stage</th>
                    <th className="py-2 px-3">Party / Source</th>
                    <th className="py-2 px-3 text-right">In / Out</th>
                    <th className="py-2 px-3 text-right">Rate ({currencySymbol})</th>
                    <th className="py-2 px-3 text-right">Value ({currencySymbol})</th>
                    <th className="py-2 px-4 text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/40">
                  {[...movements]
                    .sort((a, b) => `${b.date || ''}${b.id}`.localeCompare(`${a.date || ''}${a.id}`))
                    .map((mov) => {
                      const isAddition = mov.quantity > 0;
                      const chip = MOVEMENT_CHIPS[mov.type] || {
                        label: MOVEMENT_LABELS[mov.type] || mov.type.replace(/_/g, ' '),
                        cls: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]',
                      };
                      return (
                        <tr key={mov.id} className="text-[11px] hover:bg-[var(--color-surface-container)]/60">
                          {/* Doc & Ref — the ref number as the primary text
                              (RST 0001 / quotation no. / voucher no.), the
                              date+time as the secondary subtext */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-[var(--color-on-surface)] truncate max-w-[220px]">
                              {docIdOfMovement(mov)}
                            </div>
                            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                              {formatDateTime(mov.date, 'dash')}
                            </p>
                          </td>
                          {/* Stage — the ladder-term chip (sales table parity) */}
                          <td className="py-2.5 px-3 align-top w-[170px]">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${chip.cls}`}
                            >
                              {chip.label}
                            </span>
                          </td>
                          {/* Party / Source — the party name; production
                              batches and other sources carry theirs here */}
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-[var(--color-on-surface)] block max-w-[180px] truncate" title={mov.sourcePartyOrBatch}>
                              {mov.sourcePartyOrBatch || '—'}
                            </span>
                            {mov.notes && (
                              <span className="text-[10px] text-[var(--color-on-surface-variant)] block max-w-[180px] truncate" title={mov.notes}>
                                {mov.notes}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            <span className={isAddition ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                              {isAddition ? '+' : ''}{Number(mov.quantity).toLocaleString('en-IN')} {item.unit}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--color-on-surface-variant)]">
                            {mov.rate ? Number(mov.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--color-on-surface-variant)]">
                            {mov.movementValue ? Number(mov.movementValue).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-[var(--color-on-surface)] whitespace-nowrap">
                            {Number(mov.balanceAfter).toLocaleString('en-IN')} {item.unit}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4c. DOCUMENTS (S3 upload feature) — uploads link to the item immediately */}
      {activeTab === 'documents' && (
        <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4">
          <EntityDocumentsSection feature="item" entityId={item.id} />
        </div>
      )}
    </div>
  );
}