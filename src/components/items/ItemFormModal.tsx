import React, { useState } from 'react';
import {
  X,
  Package,
  Wrench,
  Layers,
  Scale,
  Percent,
  Check,
  AlertCircle,
  FileText,
  Warehouse,
  IndianRupee,
  Plus,
  ArrowUpRight,
  Trash2,
  MapPin,
} from 'lucide-react';
import { Item, ItemCategory, ItemUnit, ItemLocation, ItemType, ItemLocationStock } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

interface ItemFormModalProps {
  initialItem?: Item | null;
  categories: ItemCategory[];
  units: ItemUnit[];
  locations?: ItemLocation[];
  currencySymbol?: string;
  onClose: () => void;
  onOpenCategories?: () => void;
  onOpenUnits?: () => void;
  onOpenLocations?: () => void;
}

interface FormLocationEntry {
  locationId?: string;
  locationName: string;
  openingStock: string;
  minStockLevel: string;
  currentStock?: number;
}

const GST_RATES = [0, 5, 12, 18, 28];

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  initialItem,
  categories,
  units,
  locations = [],
  currencySymbol = '₹',
  onClose,
  onOpenCategories,
  onOpenUnits,
  onOpenLocations,
}) => {
  const [type, setType] = useState<ItemType>(initialItem?.type || 'product');
  const [name, setName] = useState(initialItem?.name || '');
  const [code, setCode] = useState(initialItem?.code || '');
  const [categoryId, setCategoryId] = useState(
    initialItem?.categoryId || (categories.length > 0 ? categories[0].id : '')
  );
  const [unit, setUnit] = useState(initialItem?.unit || 'MT');
  const [hsnSacCode, setHsnSacCode] = useState(initialItem?.hsnSacCode || '');
  const [taxRateGst, setTaxRateGst] = useState<number>(initialItem?.taxRateGst ?? 18);
  const [salePrice, setSalePrice] = useState(initialItem ? String(initialItem.salePrice) : '');
  const [technicalSpecs, setTechnicalSpecs] = useState(initialItem?.technicalSpecs || '');
  const [remarks, setRemarks] = useState(initialItem?.remarks || '');
  
  // Multi-location state
  const getInitialLocations = (): FormLocationEntry[] => {
    if (initialItem?.locations && initialItem.locations.length > 0) {
      return initialItem.locations.map((l) => ({
        locationId: l.locationId,
        locationName: l.locationName,
        openingStock: String(l.openingStock !== undefined ? l.openingStock : 0),
        minStockLevel: String(l.minStockLevel !== undefined ? l.minStockLevel : (initialItem.minStockLevel || 0)),
        currentStock: l.currentStock,
      }));
    }
    if (initialItem?.stockLocation) {
      const parts = initialItem.stockLocation.split(',').map((s) => s.trim()).filter(Boolean);
      const uniqueParts = Array.from(new Set(parts.map((p) => p.toLowerCase()))).map(
        (lower) => parts.find((p) => p.toLowerCase() === lower)!
      );
      if (uniqueParts.length > 0) {
        return uniqueParts.map((p, idx) => ({
          locationName: p,
          openingStock: String(idx === 0 && initialItem.openingStock !== undefined ? initialItem.openingStock : 0),
          minStockLevel: String(idx === 0 && initialItem.minStockLevel !== undefined ? initialItem.minStockLevel : 0),
          currentStock: idx === 0 ? initialItem.currentStock : 0,
        }));
      }
    }
    if (locations && locations.length > 0) {
      return [{
        locationId: locations[0].id,
        locationName: locations[0].name,
        openingStock: initialItem?.openingStock !== undefined ? String(initialItem.openingStock) : '0',
        minStockLevel: initialItem?.minStockLevel !== undefined ? String(initialItem.minStockLevel) : '0',
        currentStock: initialItem?.currentStock,
      }];
    }
    return [];
  };

  const [formLocations, setFormLocations] = useState<FormLocationEntry[]>(getInitialLocations);

  React.useEffect(() => {
    if (type === 'product' && formLocations.length === 0 && locations.length > 0) {
      setFormLocations([{
        locationId: locations[0].id,
        locationName: locations[0].name,
        openingStock: initialItem?.openingStock !== undefined ? String(initialItem.openingStock) : '0',
        minStockLevel: initialItem?.minStockLevel !== undefined ? String(initialItem.minStockLevel) : '0',
      }]);
    }
  }, [locations, type, formLocations.length, initialItem]);

  const [openingStockPrice, setOpeningStockPrice] = useState(
    initialItem && initialItem.openingStockPrice !== undefined
      ? String(initialItem.openingStockPrice)
      : (initialItem?.purchasePrice ? String(initialItem.purchasePrice) : '')
  );
  const [openingStockDate, setOpeningStockDate] = useState(
    initialItem?.openingStockDate || new Date().toISOString().split('T')[0]
  );
  
  const [isActive, setIsActive] = useState(initialItem?.isActive ?? true);
  const [error, setError] = useState('');

  // Calculate opening valuation preview
  const totalAllocatedOpeningStock = formLocations.reduce(
    (sum, l) => sum + (parseFloat(l.openingStock) || 0),
    0
  );
  const totalAllocatedMinSafetyStock = formLocations.reduce(
    (sum, l) => sum + (parseFloat(l.minStockLevel) || 0),
    0
  );
  const numOpeningStockPrice = parseFloat(openingStockPrice) || 0;
  const calculatedOpeningValuation = totalAllocatedOpeningStock * numOpeningStockPrice;

  // Add & remove location rows
  const handleAddLocationRow = () => {
    if (locations.length === 0) {
      if (onOpenLocations) onOpenLocations();
      return;
    }
    const usedNames = new Set(formLocations.map((l) => l.locationName.toLowerCase().trim()));
    const nextAvailable = locations.find((l) => !usedNames.has(l.name.toLowerCase().trim()));
    const newLoc = nextAvailable || locations[0];
    setFormLocations([
      ...formLocations,
      {
        locationId: newLoc?.id,
        locationName: newLoc?.name || '',
        openingStock: '0',
        minStockLevel: '0',
      },
    ]);
  };

  const handleRemoveLocationRow = (index: number) => {
    if (formLocations.length <= 1) return;
    setFormLocations(formLocations.filter((_, i) => i !== index));
  };

  const handleLocationChange = (
    index: number,
    field: 'locationName' | 'openingStock' | 'minStockLevel',
    val: string
  ) => {
    const updated = [...formLocations];
    if (field === 'locationName') {
      const matched = locations.find((l) => l.name === val || l.id === val);
      updated[index] = {
        ...updated[index],
        locationName: matched ? matched.name : val,
        locationId: matched ? matched.id : undefined,
      };
    } else {
      updated[index] = { ...updated[index], [field]: val };
    }
    setFormLocations(updated);
  };

  // Filter categories matching current item type
  const matchingCategories = categories.filter(
    (c) => c.type === 'both' || c.type === type
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Item name is required.');
      return;
    }
    if (!code.trim()) {
      setError('Item code / SKU is required.');
      return;
    }
    if (!categoryId) {
      setError('Please select a valid category.');
      return;
    }
    if (!unit) {
      setError('Please select a measurement unit.');
      return;
    }

    // Verify location names are filled
    if (type === 'product') {
      if (locations.length === 0) {
        setError('No storage locations found in system. Please configure locations first using Manage Locations.');
        return;
      }
      if (formLocations.length === 0) {
        setError('Please allocate at least one storage location for this product.');
        return;
      }
      const emptyLoc = formLocations.some((l) => !l.locationName.trim());
      if (emptyLoc) {
        setError('Please select a storage location from the dropdown for each entry.');
        return;
      }
    }

    const sPrice = parseFloat(salePrice) || 0;
    const opPrice = openingStockPrice ? parseFloat(openingStockPrice) || 0 : undefined;

    const selectedCategory = categories.find((c) => c.id === categoryId);

    // Build mapped locations
    const mappedLocations: ItemLocationStock[] = formLocations.map((l) => {
      const locOpening = parseFloat(l.openingStock) || 0;
      const locMinSafety = parseFloat(l.minStockLevel) || 0;
      const matchedMaster = locations.find((loc) => loc.name === l.locationName);
      const locCurrent = initialItem
        ? (l.currentStock !== undefined ? l.currentStock : locOpening)
        : locOpening;
      return {
        locationId: l.locationId || matchedMaster?.id,
        locationName: l.locationName.trim(),
        openingStock: locOpening,
        minStockLevel: locMinSafety,
        currentStock: locCurrent,
      };
    });

    // Deduplicate mapped locations
    const seenNames = new Set<string>();
    const deduplicatedLocations = mappedLocations.filter((l) => {
      const lower = l.locationName.trim().toLowerCase();
      if (!lower || seenNames.has(lower)) return false;
      seenNames.add(lower);
      return true;
    });

    const totalOpeningStock = deduplicatedLocations.reduce((sum, l) => sum + (l.openingStock || 0), 0);
    const totalMinSafetyStock = deduplicatedLocations.reduce((sum, l) => sum + (l.minStockLevel || 0), 0);
    const totalCurrentStock = deduplicatedLocations.reduce((sum, l) => sum + (l.currentStock || 0), 0);
    const locationNames = deduplicatedLocations.map((l) => l.locationName);
    const combinedLocationStr = locationNames.join(', ');

    try {
      if (initialItem) {
        localDb.updateItem(initialItem.id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          type,
          categoryId,
          categoryName: selectedCategory?.name || 'General',
          unit: unit.trim().toUpperCase(),
          hsnSacCode: hsnSacCode.trim(),
          taxRateGst,
          salePrice: sPrice,
          technicalSpecs: technicalSpecs.trim(),
          remarks: remarks.trim(),
          isActive,
          ...(type === 'product' ? {
            openingStock: totalOpeningStock,
            openingStockPrice: opPrice,
            openingStockDate: openingStockDate || new Date().toISOString().split('T')[0],
            purchasePrice: opPrice,
            minStockLevel: totalMinSafetyStock,
            currentStock: totalCurrentStock,
            locations: deduplicatedLocations,
            stockLocations: locationNames,
            stockLocation: combinedLocationStr,
          } : {})
        });
      } else {
        localDb.addItem({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          type,
          categoryId,
          categoryName: selectedCategory?.name || 'General',
          unit: unit.trim().toUpperCase(),
          hsnSacCode: hsnSacCode.trim(),
          taxRateGst,
          salePrice: sPrice,
          technicalSpecs: technicalSpecs.trim(),
          remarks: remarks.trim(),
          isActive,
          ...(type === 'product' ? {
            openingStock: totalOpeningStock,
            openingStockPrice: opPrice,
            openingStockDate: openingStockDate || new Date().toISOString().split('T')[0],
            purchasePrice: opPrice,
            minStockLevel: totalMinSafetyStock,
            currentStock: totalCurrentStock,
            locations: deduplicatedLocations,
            stockLocations: locationNames,
            stockLocation: combinedLocationStr,
          } : {})
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save item.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-3xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
              {type === 'product' ? <Package className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">
                {initialItem ? 'Edit Item Master' : 'Add Item to Master Catalog'}
              </h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">
                Master specifications, GST rates, unit definitions, and pricing parameters
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

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--color-error-container)] border border-[var(--color-error)] text-[var(--color-on-error-container)] text-xs rounded-2xl font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type Selector (Product vs Service) */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface)] uppercase tracking-wider mb-2">
              Item Classification *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setType('product');
                  const prodCats = categories.filter((c) => c.type === 'product' || c.type === 'both');
                  if (prodCats.length > 0 && !prodCats.some((c) => c.id === categoryId)) {
                    setCategoryId(prodCats[0].id);
                  }
                }}
                className={`p-3.5 rounded-2xl border flex items-center gap-3 transition-all ${
                  type === 'product'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-xs ring-1 ring-[var(--color-primary)]'
                    : 'border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                    type === 'product' ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                  }`}
                >
                  <Package className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-[var(--color-on-surface)]">Product / Material</p>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">Physical goods (Stock managed in Inventory)</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('service');
                  const srvCats = categories.filter((c) => c.type === 'service' || c.type === 'both');
                  if (srvCats.length > 0 && !srvCats.some((c) => c.id === categoryId)) {
                    setCategoryId(srvCats[0].id);
                  }
                }}
                className={`p-3.5 rounded-2xl border flex items-center gap-3 transition-all ${
                  type === 'service'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-xs ring-1 ring-[var(--color-primary)]'
                    : 'border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                    type === 'service' ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                  }`}
                >
                  <Wrench className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-[var(--color-on-surface)]">Service / Contract</p>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">Plant hire, tipper freight, QA testing, paving</p>
                </div>
              </button>
            </div>
          </div>

          {/* Basic Item Info */}
          <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
            <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--color-primary)]" />
              Basic Identification
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Item / Service Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dense Bituminous Macadam (DBM Grade 2)"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError('');
                  }}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Item Code / SKU *
                </label>
                <input
                  type="text"
                  placeholder="e.g. DBM-GR2"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError('');
                  }}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono uppercase font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[var(--color-on-surface-variant)]">Category *</label>
                  {onOpenCategories && (
                    <button
                      type="button"
                      onClick={onOpenCategories}
                      className="text-[11px] font-bold text-[var(--color-primary)] hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Manage Categories
                    </button>
                  )}
                </div>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                >
                  <option value="">-- Choose Category --</option>
                  {matchingCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {categories
                    .filter((c) => !matchingCategories.some((mc) => mc.id === c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.type})
                      </option>
                    ))}
                </select>
              </div>

              {/* Unit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[var(--color-on-surface-variant)]">Unit of Measurement *</label>
                  {onOpenUnits && (
                    <button
                      type="button"
                      onClick={onOpenUnits}
                      className="text-[11px] font-bold text-[var(--color-primary)] hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Manage Units
                    </button>
                  )}
                </div>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.code}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Pricing & GST Tax Compliance */}
          <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
            <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-[var(--color-success)]" />
              Pricing & GST Tax Rates
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Selling Rate ({currencySymbol} / {unit || 'Unit'}) *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-outline)] font-bold text-xs">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  {type === 'product' ? 'HSN Code (Goods)' : 'SAC Code (Services)'}
                </label>
                <input
                  type="text"
                  placeholder={type === 'product' ? 'e.g. 27150090' : 'e.g. 997312'}
                  value={hsnSacCode}
                  onChange={(e) => setHsnSacCode(e.target.value.trim())}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono uppercase text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  GST Tax Slab (%)
                </label>
                <select
                  value={taxRateGst}
                  onChange={(e) => setTaxRateGst(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  {GST_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}% {rate === 0 ? '(Exempt / Nil VAT)' : `GST (${rate / 2}% CGST + ${rate / 2}% SGST)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Inventory Tracking, Multi-Location Allocation & Valuation (Products Only) */}
          {type === 'product' && (
            <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-[var(--color-primary)]" />
                    Storage Locations & Opening Stock Allocation
                  </h3>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                    Assign inventory across multiple silos, yards, or stockpoints
                  </p>
                </div>
                {totalAllocatedOpeningStock > 0 && numOpeningStockPrice > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)] border border-[var(--color-outline-variant)] self-start sm:self-auto">
                    Opening Value: {currencySymbol}{calculatedOpeningValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>

              {/* Procured Price & Opening Date */}
              <div className="p-3 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                      Procured Cost Rate ({currencySymbol} / {unit || 'Unit'})
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-outline)] font-bold text-xs">
                        {currencySymbol}
                      </span>
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={openingStockPrice}
                        onChange={(e) => setOpeningStockPrice(e.target.value)}
                        className="w-full pl-8 pr-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                    </div>
                    <p className="text-[9px] text-[var(--color-outline)] mt-1 ml-2">Baseline valuation rate</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                      Opening Balance Audit Date
                    </label>
                    <input
                      type="date"
                      value={openingStockDate}
                      onChange={(e) => setOpeningStockDate(e.target.value)}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                    <p className="text-[9px] text-[var(--color-outline)] mt-1 ml-2">Stock audit baseline date</p>
                  </div>
                </div>
              </div>

              {/* Multi-Location Allocation Rows */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-on-surface)] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    Assigned Stock Locations ({formLocations.length})
                  </span>
                  {onOpenLocations && (
                    <button
                      type="button"
                      onClick={onOpenLocations}
                      className="text-[11px] font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Manage Master Locations
                    </button>
                  )}
                </div>

                {locations.length === 0 ? (
                  <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-dashed border-[var(--color-outline-variant)] text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center mx-auto">
                      <Warehouse className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--color-on-surface)]">No Storage Locations Available</h4>
                      <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                        No storage locations or stockyards are defined yet. Configure locations in master setup to assign stock and safety levels.
                      </p>
                    </div>
                    {onOpenLocations && (
                      <button
                        type="button"
                        onClick={onOpenLocations}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs hover:opacity-90 transition-opacity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Manage & Create Locations</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {formLocations.map((locRow, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] flex flex-col sm:flex-row sm:items-center gap-3 transition-all hover:border-[var(--color-primary)]/40"
                        >
                          {/* Location Dropdown */}
                          <div className="flex-1 space-y-1">
                            <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                              Location #{idx + 1} *
                            </label>
                            <select
                              value={locRow.locationName}
                              onChange={(e) => handleLocationChange(idx, 'locationName', e.target.value)}
                              required
                              className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            >
                              <option value="">-- Choose Storage Location --</option>
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.name}>
                                  {loc.name} {loc.capacity ? `(${loc.capacity})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Opening Stock at this Location */}
                          <div className="w-full sm:w-36 space-y-1">
                            <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                              Opening Stock ({unit || 'Unit'})
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0.00"
                              value={locRow.openingStock}
                              onChange={(e) => handleLocationChange(idx, 'openingStock', e.target.value)}
                              className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            />
                          </div>

                          {/* Min Safety Stock at this Location */}
                          <div className="w-full sm:w-36 space-y-1">
                            <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                              Min Safety Stock ({unit || 'Unit'})
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0.00"
                              value={locRow.minStockLevel}
                              onChange={(e) => handleLocationChange(idx, 'minStockLevel', e.target.value)}
                              className="w-full px-3.5 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            />
                          </div>

                          {/* Current Stock Preview if editing */}
                          {initialItem && locRow.currentStock !== undefined && (
                            <div className="text-right sm:w-28 shrink-0">
                              <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-medium">Current Stock</span>
                              <span className="text-xs font-black text-[var(--color-primary)]">
                                {Number(locRow.currentStock).toLocaleString('en-IN')} {unit}
                              </span>
                            </div>
                          )}

                          {/* Remove Location Button */}
                          <div className="flex sm:items-center sm:self-end pt-1 sm:pt-0">
                            <button
                              type="button"
                              disabled={formLocations.length <= 1}
                              onClick={() => handleRemoveLocationRow(idx)}
                              className="p-2 text-[var(--color-outline)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-full transition-colors disabled:opacity-30 disabled:hover:text-[var(--color-outline)] disabled:hover:bg-transparent"
                              title="Remove this location"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Location Button & Live Totals */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleAddLocationRow}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] text-[var(--color-primary)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold transition-all shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Another Location</span>
                      </button>

                      <div className="flex flex-wrap items-center gap-4 text-right text-xs">
                        <div>
                          <span className="text-[var(--color-on-surface-variant)] font-medium">Total Starting Stock: </span>
                          <strong className="text-[var(--color-on-surface)] font-black text-sm">
                            {totalAllocatedOpeningStock.toLocaleString('en-IN')} {unit || 'Units'}
                          </strong>
                        </div>
                        <div className="border-l border-[var(--color-outline-variant)] pl-4">
                          <span className="text-[var(--color-on-surface-variant)] font-medium">Total Safety Threshold: </span>
                          <strong className="text-[var(--color-on-surface)] font-black text-sm">
                            {totalAllocatedMinSafetyStock.toLocaleString('en-IN')} {unit || 'Units'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Technical Specs & Mix Formulation */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
              Technical Specifications & Quality Compliance
            </label>
            <textarea
              rows={2}
              placeholder="e.g. MoRTH 5th Rev Section 505, VG-30 Bitumen Content 4.5%, 37.5mm max aggregate size, Marshall Stability > 12 kN"
              value={technicalSpecs}
              onChange={(e) => setTechnicalSpecs(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Remarks & Operational Notes */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
              Remarks, Handling Guidelines & Dispatch Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Temperature at dispatch must be strictly maintained at 150°C - 160°C. Batch test certificate compulsory with every delivery challan."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Active Status & Footer Action */}
          <div className="pt-3 border-t border-[var(--color-outline-variant)] flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-[var(--color-primary)] rounded border-[var(--color-outline-variant)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-xs font-medium text-[var(--color-on-surface-variant)]">Active in Catalog & Invoicing</span>
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-6 py-2.5 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-medium text-xs rounded-full shadow-xs transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <Check className="w-4 h-4" />
                {initialItem ? 'Update Item' : 'Save Item to Catalog'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

