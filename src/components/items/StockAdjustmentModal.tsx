import React, { useState } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Warehouse,
  AlertCircle,
  Calendar,
  Layers,
  FileText,
  IndianRupee,
  Package,
  Scale,
  CheckCircle2,
} from 'lucide-react';
import { Item, ItemLocation, ItemStockAdjustment } from '../../types';

interface StockAdjustmentModalProps {
  items: Item[];
  locations?: ItemLocation[];
  initialItemId?: string;
  currencySymbol?: string;
  onClose: () => void;
  onSubmit: (adj: Omit<ItemStockAdjustment, 'id' | 'createdAt' | 'adjustmentNumber' | 'previousStock' | 'newStock' | 'totalValue'>) => void;
}

const COMMON_REASONS = [
  'Physical Stock Audit Discrepancy',
  'Batch Sampling & Lab QA Loss',
  'Handling Spill / Silo Residue',
  'Evaporation & Moisture Shrinkage',
  'Plant Hopper Inward Reconciliation',
  'Supplier Inward Weight Variance',
  'Damaged / Off-Spec Bitumen Write-off',
  'Opening Balance Reconciliation',
];

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  items,
  locations = [],
  initialItemId,
  currencySymbol = '₹',
  onClose,
  onSubmit,
}) => {
  // Only physical products can have stock adjustments
  const productItems = items.filter((i) => i.type === 'product');

  const [selectedItemId, setSelectedItemId] = useState<string>(
    initialItemId || (productItems.length > 0 ? productItems[0].id : '')
  );
  const [type, setType] = useState<'increase' | 'decrease'>('increase');
  const [quantity, setQuantity] = useState<string>('');
  const [rate, setRate] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');

  const selectedItem = productItems.find((i) => i.id === selectedItemId);

  // Available locations for this item
  const itemConfiguredLocations = React.useMemo(() => {
    if (!selectedItem) return [];
    const rawLocs = selectedItem.locations && selectedItem.locations.length > 0
      ? selectedItem.locations
      : (selectedItem.stockLocation
          ? selectedItem.stockLocation.split(',').map((s) => ({ locationName: s.trim(), currentStock: selectedItem.currentStock || 0 }))
          : []);
    const seen = new Set<string>();
    return rawLocs.filter((l) => {
      const n = l.locationName?.trim();
      if (!n || seen.has(n.toLowerCase())) return false;
      seen.add(n.toLowerCase());
      return true;
    });
  }, [selectedItem]);

  // Sync initial rate & location when item changes
  React.useEffect(() => {
    if (selectedItem) {
      const defaultRate =
        selectedItem.openingStockPrice || selectedItem.purchasePrice || selectedItem.salePrice || 0;
      if (defaultRate > 0) {
        setRate(String(defaultRate));
      }
      // Default to the item's first ASSIGNED location; never pre-select an
      // unassigned master location — adjustments only apply to assigned ones.
      setLocation(itemConfiguredLocations.length > 0 ? itemConfiguredLocations[0].locationName : '');
    }
  }, [selectedItemId]);

  const numQty = parseFloat(quantity) || 0;
  const numRate = parseFloat(rate) || (selectedItem?.openingStockPrice || selectedItem?.purchasePrice || selectedItem?.salePrice || 0);
  const calculatedTotalValue = numQty * numRate;
  const currentStock = selectedItem?.currentStock || 0;
  const resultingStock =
    type === 'increase' ? currentStock + numQty : Math.max(0, currentStock - numQty);

  const selectedLocStockObj = itemConfiguredLocations.find(
    (l) => l.locationName.toLowerCase().trim() === location.toLowerCase().trim()
  );
  const locationStock = selectedLocStockObj ? Number(selectedLocStockObj.currentStock || 0) : undefined;
  const resultingLocationStock = locationStock !== undefined
    ? (type === 'increase' ? locationStock + numQty : Math.max(0, locationStock - numQty))
    : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setError('Please select an item to adjust.');
      return;
    }
    if (!location.trim()) {
      setError('Please select the storage location being adjusted. Only locations assigned to this item are allowed.');
      return;
    }
    if (numQty <= 0) {
      setError('Please enter a valid positive quantity to adjust.');
      return;
    }
    if (type === 'decrease') {
      if (locationStock !== undefined && numQty > locationStock) {
        if (
          !window.confirm(
            `Adjustment quantity (${numQty} ${selectedItem.unit}) exceeds stock at "${location}" (${locationStock} ${selectedItem.unit}). Continue anyway?`
          )
        ) {
          return;
        }
      } else if (numQty > currentStock) {
        if (
          !window.confirm(
            `Adjustment quantity (${numQty} ${selectedItem.unit}) exceeds total stock (${currentStock} ${selectedItem.unit}). Continue anyway?`
          )
        ) {
          return;
        }
      }
    }

    const finalReason = reason === 'Other' ? customReason.trim() || 'Manual Stock Adjustment' : reason;

    onSubmit({
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      itemCode: selectedItem.code,
      unit: selectedItem.unit,
      date,
      type,
      quantity: numQty,
      rate: numRate,
      reason: finalReason,
      location: location.trim(),
      referenceNumber: referenceNumber.trim(),
      notes: notes.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                type === 'increase'
                  ? 'bg-[var(--color-success-container)] text-[var(--color-success)]'
                  : 'bg-[var(--color-error-container)] text-[var(--color-error)]'
              }`}
            >
              {type === 'increase' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">
                Stock Adjustment Voucher
              </h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">
                Record physical count reconciliation, wastage, sampling, or stock corrections
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--color-error-container)] border border-[var(--color-error)] text-[var(--color-on-error-container)] text-xs rounded-2xl font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Item Selector */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
              Select Material / Product *
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => {
                setSelectedItemId(e.target.value);
                setError('');
                const it = productItems.find((i) => i.id === e.target.value);
                if (it) {
                  const defaultRate = it.openingStockPrice || it.purchasePrice || it.salePrice || 0;
                  if (defaultRate > 0) setRate(String(defaultRate));
                  if (it.stockLocation) setLocation(it.stockLocation);
                }
              }}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
              required
            >
              <option value="">-- Choose Physical Item --</option>
              {productItems.map((i) => (
                <option key={i.id} value={i.id}>
                  [{i.code}] {i.name} — Current Stock: {i.currentStock || 0} {i.unit}
                </option>
              ))}
            </select>
          </div>

          {/* Current vs Impact Preview Banner */}
          {selectedItem && (
            <div className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--color-on-surface-variant)] tracking-wider">
                  Current Physical Stock
                </span>
                <p className="text-sm font-black text-[var(--color-on-surface)]">
                  {currentStock.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {selectedItem.unit}
                </p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                  Loc: {selectedItem.stockLocation || 'General Storage'}
                </p>
              </div>

              <div className="text-center px-3 py-1 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)]">
                <span className="text-[10px] font-bold text-[var(--color-outline)]">Adjustment Impact</span>
                <p
                  className={`text-xs font-bold ${
                    type === 'increase' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                  }`}
                >
                  {type === 'increase' ? '+' : '-'} {numQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {selectedItem.unit}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[var(--color-on-surface-variant)] tracking-wider">
                  Resulting Stock
                </span>
                <p className="text-sm font-black text-[var(--color-primary)]">
                  {resultingStock.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {selectedItem.unit}
                </p>
                <p className="text-[10px] text-[var(--color-success)] font-medium">After reconciliation</p>
              </div>
            </div>
          )}

          {/* Adjustment Type Switcher */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
              Adjustment Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('increase')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border text-xs font-bold transition-all ${
                  type === 'increase'
                    ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border-[var(--color-success)] shadow-xs ring-1 ring-[var(--color-success)]'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
                <div className="text-left">
                  <p className="text-xs font-bold text-[var(--color-on-surface)]">+ Increase Stock</p>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">Surplus, inward receipt, audit addition</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('decrease')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border text-xs font-bold transition-all ${
                  type === 'decrease'
                    ? 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)] border-[var(--color-error)] shadow-xs ring-1 ring-[var(--color-error)]'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                <TrendingDown className="w-4 h-4 text-[var(--color-error)]" />
                <div className="text-left">
                  <p className="text-xs font-bold text-[var(--color-on-surface)]">- Reduce Stock</p>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">Wastage, sampling loss, shrinkage</p>
                </div>
              </button>
            </div>
          </div>

          {/* Quantity & Procurement Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Quantity to Adjust ({selectedItem?.unit || 'Units'}) *
              </label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setError('');
                }}
                className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-sm font-bold text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Cost Rate ({currencySymbol} / {selectedItem?.unit || 'Unit'})
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-outline)] font-bold text-xs">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Valuation Summary Badge */}
          {numQty > 0 && (
            <div className="p-3 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] flex items-center justify-between text-xs">
              <span className="text-[var(--color-on-surface-variant)] font-medium">
                Total Adjustment Valuation:
              </span>
              <span className="font-extrabold text-[var(--color-on-surface)] text-sm">
                {currencySymbol} {calculatedTotalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Date & Storage Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Adjustment Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Storage Location / Silo *</span>
                {locationStock !== undefined && (
                  <span className="text-[10px] font-bold text-[var(--color-primary)]">
                    At this location: {locationStock.toLocaleString('en-IN')} {selectedItem?.unit}
                  </span>
                )}
              </label>
              <select
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">-- Choose Location to Adjust --</option>
                {itemConfiguredLocations.map((loc, idx) => (
                  <option key={`cfg-${idx}`} value={loc.locationName}>
                    {loc.locationName} (Available: {Number(loc.currentStock || 0).toLocaleString('en-IN')} {selectedItem?.unit})
                  </option>
                ))}
              </select>
              {itemConfiguredLocations.length === 0 && (
                <p className="text-[10px] text-[var(--color-error)] mt-1 font-medium">
                  This item has no assigned storage locations. Assign locations in the Item Master first.
                </p>
              )}

              {locationStock !== undefined && numQty > 0 && (
                <div className="mt-1.5 px-3 py-1 bg-[var(--color-surface-container-high)] rounded-xl border border-[var(--color-outline-variant)] flex items-center justify-between text-[11px]">
                  <span className="text-[var(--color-on-surface-variant)]">Result at {location}:</span>
                  <span className={`font-bold ${resultingLocationStock !== undefined && resultingLocationStock < 0 ? 'text-[var(--color-error)]' : 'text-[var(--color-on-surface)]'}`}>
                    {resultingLocationStock?.toLocaleString('en-IN')} {selectedItem?.unit}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
              Reason for Adjustment *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
              required
            >
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="Other">Other / Custom Reason...</option>
            </select>

            {reason === 'Other' && (
              <input
                type="text"
                placeholder="Specify reason for stock change..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full mt-2 px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)]"
                required
              />
            )}
          </div>

          {/* Reference & Audit Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Reference / Audit Slip No.
              </label>
              <input
                type="text"
                placeholder="e.g. AUDIT-2026-Q1 or WB-SLIP-891"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono uppercase text-[var(--color-on-surface)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Internal Remarks / Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Verified by QA Engineer after shift count"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)]"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-semibold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all"
            >
              Apply Stock Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
