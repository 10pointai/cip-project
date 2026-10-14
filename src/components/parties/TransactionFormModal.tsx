import React, { useState, useEffect } from 'react';
import { X, FileText, Check, AlertCircle, Sparkles, Package, Calculator } from 'lucide-react';
import { Party, Transaction, VoucherType, Item } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

interface TransactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  defaultPartyId?: string;
  items?: Item[];
  onSave: (txData: {
    voucherNumber: string;
    partyId: string;
    partyName: string;
    partyType: any;
    type: VoucherType;
    amount: number;
    date: string;
    materialOrService: string;
    quantityTonnes?: number;
    location?: string;
    itemId?: string;
    description: string;
    status: 'paid' | 'pending' | 'partially_paid' | 'settled';
    dueDate?: string;
  }) => void;
  currencySymbol?: string;
  prefixes?: {
    salesInvoice: string;
    purchaseBill: string;
  };
}

export function TransactionFormModal({
  isOpen,
  onClose,
  parties,
  defaultPartyId,
  items: propItems,
  onSave,
  currencySymbol = '₹',
  prefixes = { salesInvoice: 'INV-26/', purchaseBill: 'PUR-26/' },
}: TransactionFormModalProps) {
  const [partyId, setPartyId] = useState(defaultPartyId || (parties[0]?.id ?? ''));
  const selectedParty = parties.find((p) => p.id === partyId);

  const catalogItems = propItems || localDb.getItems();

  const initialType: VoucherType = selectedParty?.type === 'vendor' ? 'purchase_bill' : 'sale_invoice';
  const [type, setType] = useState<VoucherType>(initialType);
  const [voucherNumber, setVoucherNumber] = useState(`${type === 'sale_invoice' ? prefixes.salesInvoice : prefixes.purchaseBill}${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [unitRate, setUnitRate] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [materialOrService, setMaterialOrService] = useState('Bituminous Concrete (BC Grade 1)');
  const [quantityTonnes, setQuantityTonnes] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');
  const [error, setError] = useState('');

  const selectedCatalogItem = catalogItems.find((i) => i.id === selectedItemId);

  // Handle item selection from catalog
  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(itemId);
    const itm = catalogItems.find((i) => i.id === itemId);
    if (itm) {
      setMaterialOrService(itm.name);
      const price = type === 'sale_invoice' ? itm.salePrice : (itm.purchasePrice || itm.salePrice);
      setUnitRate(price ? price.toString() : '');
      if (quantityTonnes && parseFloat(quantityTonnes) > 0 && price) {
        const total = parseFloat(quantityTonnes) * price;
        setAmount(total.toFixed(2));
      }
      if (itm.locations && itm.locations.length > 0) {
        setSelectedLocation(itm.locations[0].locationName);
      } else if (itm.stockLocation) {
        setSelectedLocation(itm.stockLocation);
      } else {
        setSelectedLocation('');
      }
    } else {
      setSelectedLocation('');
    }
  };

  const handleQuantityChange = (qtyStr: string) => {
    setQuantityTonnes(qtyStr);
    const qty = parseFloat(qtyStr);
    const rate = parseFloat(unitRate);
    if (!isNaN(qty) && !isNaN(rate) && qty > 0 && rate > 0) {
      setAmount((qty * rate).toFixed(2));
    }
  };

  const handleRateChange = (rateStr: string) => {
    setUnitRate(rateStr);
    const rate = parseFloat(rateStr);
    const qty = parseFloat(quantityTonnes);
    if (!isNaN(qty) && !isNaN(rate) && qty > 0 && rate > 0) {
      setAmount((qty * rate).toFixed(2));
    }
  };

  if (!isOpen) return null;

  const handleTypeChange = (newType: VoucherType) => {
    setType(newType);
    const prefix = newType === 'sale_invoice' ? prefixes.salesInvoice : prefixes.purchaseBill;
    setVoucherNumber(`${prefix}${Math.floor(1000 + Math.random() * 9000)}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!partyId) {
      setError('Please select a Party.');
      return;
    }
    if (!voucherNumber.trim()) {
      setError('Please enter a Voucher / Invoice Number.');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    const currentParty = parties.find((p) => p.id === partyId);
    if (!currentParty) return;

    onSave({
      voucherNumber: voucherNumber.trim(),
      partyId,
      partyName: currentParty.name,
      partyType: currentParty.type,
      type,
      amount: numAmount,
      date,
      materialOrService: materialOrService.trim(),
      quantityTonnes: quantityTonnes ? parseFloat(quantityTonnes) : undefined,
      location: selectedLocation.trim() || undefined,
      itemId: selectedItemId || undefined,
      description: description.trim() || `${materialOrService} supply - Voucher ${voucherNumber}`,
      status,
      dueDate: dueDate || undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-lg rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-on-surface)]">New Commercial Voucher / Bill</h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">Record sales invoice, raw material purchase, or dispatch note</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--color-error-container)] border border-[var(--color-error)]/30 text-[var(--color-on-error-container)] text-xs rounded-2xl font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
              Voucher Nature *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('sale_invoice')}
                className={`py-2.5 px-3 rounded-full border text-xs font-bold transition-all ${
                  type === 'sale_invoice'
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)] shadow-xs'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                Sale Invoice (Material Sold)
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('purchase_bill')}
                className={`py-2.5 px-3 rounded-full border text-xs font-bold transition-all ${
                  type === 'purchase_bill'
                    ? 'bg-[var(--color-secondary)] text-[var(--color-on-secondary)] border-[var(--color-secondary)] shadow-xs'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                Purchase Bill (Material Bought)
              </button>
            </div>
          </div>

          {/* Select Party */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
              Select Party *
            </label>
            <select
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              required
            >
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Voucher # and Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Voucher / Bill No. *
              </label>
              <input
                type="text"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Voucher Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
            </div>
          </div>

          {/* Material & Quantity */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Select from Product/Service Catalog (Optional)</span>
                <span className="text-[10px] text-[var(--color-primary)] font-normal">Auto-fills description & rate</span>
              </label>
              <select
                value={selectedItemId}
                onChange={(e) => handleItemSelect(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">-- Manual entry or select catalog item --</option>
                {catalogItems.map((itm) => (
                  <option key={itm.id} value={itm.id}>
                    [{itm.code}] {itm.name} ({itm.unit}) — Rate: {currencySymbol}{' '}
                    {type === 'sale_invoice' ? itm.salePrice : (itm.purchasePrice || itm.salePrice)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bituminous Concrete (BC)"
                  value={materialOrService}
                  onChange={(e) => setMaterialOrService(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Quantity (MT / Units)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 450"
                  value={quantityTonnes}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Rate / Unit ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 3850"
                  value={unitRate}
                  onChange={(e) => handleRateChange(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>

            {/* Inventory Location Selection (Multi-Location Support) */}
            {selectedCatalogItem && (
              <div className="bg-[var(--color-surface-container)] p-3 rounded-2xl border border-[var(--color-outline-variant)] space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span>{type === 'sale_invoice' ? 'Dispatch From Location' : 'Inward / Receiving Location'}</span>
                  </label>
                  {selectedCatalogItem.locations && selectedCatalogItem.locations.length > 1 && (
                    <span className="text-[10px] text-[var(--color-primary)] font-bold bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full">
                      {selectedCatalogItem.locations.length} Locations Configured
                    </span>
                  )}
                </div>
                {selectedCatalogItem.locations && selectedCatalogItem.locations.length > 0 ? (
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    {selectedCatalogItem.locations.map((loc, idx) => (
                      <option key={idx} value={loc.locationName}>
                        {loc.locationName} — {type === 'sale_invoice' ? `Available Stock: ${loc.currentStock ?? 0} ${selectedCatalogItem.unit}` : `Current Stock: ${loc.currentStock ?? 0} ${selectedCatalogItem.unit}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    placeholder="e.g. Blocks Storage, Sandla Crusher, Main Yard"
                    className="w-full px-3.5 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                )}
                <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                  {type === 'sale_invoice'
                    ? 'Inventory balance will be deducted from this specific location upon saving.'
                    : 'Inventory balance will be added to this specific location upon saving.'}
                </p>
              </div>
            )}
          </div>

          {/* Total Amount & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Total Amount ({currencySymbol}) *
              </label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-sm font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                Payment Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
              Remarks / Site Delivery Location
            </label>
            <input
              type="text"
              placeholder="e.g. Dispatched to NH-48 chainage 45+200 with test cert"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Status */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-semibold text-[var(--color-on-surface-variant)]">Initial Payment Status</span>
            <div className="flex rounded-full overflow-hidden border border-[var(--color-outline-variant)] text-xs font-bold p-0.5 bg-[var(--color-surface-container)]">
              <button
                type="button"
                onClick={() => setStatus('pending')}
                className={`px-3 py-1 rounded-full transition-all ${status === 'pending' ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] shadow-2xs' : 'text-[var(--color-on-surface-variant)]'}`}
              >
                Payment Pending
              </button>
              <button
                type="button"
                onClick={() => setStatus('paid')}
                className={`px-3 py-1 rounded-full transition-all ${status === 'paid' ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] shadow-2xs' : 'text-[var(--color-on-surface-variant)]'}`}
              >
                Paid Immediately
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-6 py-2.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full shadow-xs transition-all hover:scale-[1.01]"
            >
              <Check className="w-4 h-4" />
              Save Voucher
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
