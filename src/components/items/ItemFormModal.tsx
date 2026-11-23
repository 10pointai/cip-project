import React, { useState } from 'react';
import {
  X,
  Package,
  Wrench,
  ScanBarcode,
  Check,
  AlertCircle,
  FileText,
  Plus,
  Lock,
} from 'lucide-react';
import { Item, ItemCategory, ItemUnit, ItemLocation, ItemType, isDieselItemName } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { EntityDocumentsSection, StagedDocument } from '../common/EntityDocumentsSection';

/** GST slabs (CGST + SGST halves shown per slab) */
const GST_RATES = [0, 5, 12, 18, 28];

/** One storage-location row of the product form (buckets + opening facts) */
interface FormLocationEntry {
  locationId?: string;
  locationName: string;
  openingStock: string;
  minStockLevel: string;
  /** LIVE per-bucket stock (edit mode) — never edited in this form; stock
      moves belong to the movements ledger / Stock Adjustment modal. */
  liveStock?: number;
}

interface ItemFormModalProps {
  initialItem?: Item | null;
  categories: ItemCategory[];
  units: ItemUnit[];
  locations?: ItemLocation[];
  /** WHAT the new item is, picked by WHERE the form opens from (2026-11-16):
   *  'product' (Basic Inventory, default) or 'asset' (Serialized Inventory —
   *  the catalog header of a trackable unit register). No tabs to choose. */
  defaultType?: ItemType;
  currencySymbol?: string;
  onClose: () => void;
  onOpenCategories?: () => void;
  onOpenUnits?: () => void;
  onOpenLocations?: () => void;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  initialItem,
  categories,
  units,
  locations = [],
  defaultType,
  currencySymbol = '₹',
  onClose,
  onOpenCategories,
  onOpenUnits,
  onOpenLocations,
}) => {
  // 2026-11-16: type is NOT chosen in this form anymore — the tab selector is
  // gone. The type comes from WHERE the form was opened: 'product' from Basic
  // Inventory (default), 'asset' from Serialized Inventory; an EXISTING item
  // keeps its stored type without any way to convert it.
  // 2026-11-17 REPAIR: rows saved during the onClick={handleOpenAdd} bug
  // carry a CLICK-EVENT object as their stored type — only a REAL string
  // ('product'/'service'/'asset') may flow through; anything else falls back
  // to the intended default so every corrupted item still opens as Basic.
  const isStoredTypeValid =
    initialItem?.type === 'product' || initialItem?.type === 'service' || initialItem?.type === 'asset';
  const type: ItemType = initialItem
    ? (isStoredTypeValid ? initialItem.type : (defaultType || 'product'))
    : (defaultType || 'product');
  const [name, setName] = useState(initialItem?.name || '');
  const [code, setCode] = useState(initialItem?.code || '');
  const [categoryId, setCategoryId] = useState(
    initialItem?.categoryId || (categories.length > 0 ? categories[0].id : '')
  );
  // Trackable items are counted per physical unit — pieces, never tonnes
  const [unit, setUnit] = useState(
    initialItem?.unit || (type === 'asset' ? 'NOS' : 'MT')
  );
  const [hsnSacCode, setHsnSacCode] = useState(initialItem?.hsnSacCode || '');
  // 2026-11-16: NO master pricing / GST / locations / specs / remarks inputs in
  // this form — sale lines carry their own rate and slab, stock placement
  // belongs to the physical stock, and the catalog row is identification-only.
  // A legacy item's stored values pass through untouched on edit (fields are
  // OMITTED from the update payload); new items save neutral values.
  const [isActive, setIsActive] = useState(initialItem?.isActive ?? true);
  const [error, setError] = useState('');
  // DOCUMENTS (S3 upload feature): staged while creating a NEW item (the
  // link happens server-side when the authoritative id is minted —
  // documentIds ride the create payload); an existing item links each
  // upload IMMEDIATELY (section runs in entityId mode).
  const [stagedItemDocs, setStagedItemDocs] = useState<StagedDocument[]>([]);

  // ===== BASIC (PRODUCT) ONLY — Pricing & GST + Storage Locations =====
  // RESTORED (2026-11-17, user directive): the 2026-11-16 identification-only
  // form hid these from every item; the user wants them on BASIC inventory
  // items and still hidden on SERIALIZED (asset) items. Trackable items keep
  // their pricing on the SALE LINES and register units instead.
  const [salePrice, setSalePrice] = useState(initialItem ? String(initialItem.salePrice ?? 0) : '0');
  const [purchasePrice, setPurchasePrice] = useState(
    initialItem && initialItem.purchasePrice !== undefined ? String(initialItem.purchasePrice) : ''
  );
  const [taxRateGst, setTaxRateGst] = useState<number>(initialItem?.taxRateGst ?? 18);

  const getInitialLocations = (): FormLocationEntry[] => {
    if (initialItem?.locations && initialItem.locations.length > 0) {
      return initialItem.locations.map((l) => ({
        locationId: l.locationId || undefined,
        locationName: l.locationName,
        openingStock: l.openingStock !== undefined ? String(l.openingStock) : '0',
        minStockLevel: l.minStockLevel !== undefined ? String(l.minStockLevel) : '0',
        liveStock: Number(l.currentStock) || 0,
      }));
    }
    return [];
  };
  const [formLocations, setFormLocations] = useState<FormLocationEntry[]>(getInitialLocations);
  const [openingStockPrice, setOpeningStockPrice] = useState(
    initialItem && initialItem.openingStockPrice !== undefined
      ? String(initialItem.openingStockPrice)
      : (initialItem?.purchasePrice ? String(initialItem.purchasePrice) : '')
  );
  const [openingStockDate, setOpeningStockDate] = useState(
    initialItem?.openingStockDate || new Date().toISOString().split('T')[0]
  );

  const isProduct = type === 'product';

  // The STRICT global diesel rate (app_defaults 'diesel_rate') — the item
  // form reads it for the diesel pricing lock + opening valuation.
  const dieselRateDefault = (() => {
    try { return localDb.getAppDefault('diesel_rate'); } catch { return undefined; }
  })();
  const dieselRateNum = Number(dieselRateDefault) > 0 ? Number(dieselRateDefault) : 0;

  // Add / remove location rows — locations must exist in the master first
  const handleAddLocationRow = () => {
    if (locations.length === 0) {
      if (onOpenLocations) onOpenLocations();
      return;
    }
    const usedIds = new Set(formLocations.map((l) => l.locationId).filter(Boolean));
    const nextAvailable = locations.find((l) => !usedIds.has(l.id)) || locations[0];
    setFormLocations([
      ...formLocations,
      {
        locationId: nextAvailable.id,
        locationName: nextAvailable.name,
        openingStock: '0',
        minStockLevel: '0',
        liveStock: 0,
      },
    ]);
  };

  // Opening valuation preview (create path: opening stock × opening price)
  const totalOpeningStock = formLocations.reduce((sum, l) => sum + (parseFloat(l.openingStock) || 0), 0);
  const totalMinStock = formLocations.reduce((sum, l) => sum + (parseFloat(l.minStockLevel) || 0), 0);
  const openingValuation = totalOpeningStock * (parseFloat(openingStockPrice) || 0);
  // Edit path: the buckets keep their LIVE stock — the item total never
  // changes through this form (stock movements own that).
  const totalLiveStock = formLocations.reduce((sum, l) => sum + (Number(l.liveStock ?? 0)), 0);

  // DIESEL PRICING LOCK (2026-11-17, user directive): the diesel item has NO
  // procured cost of its own — its purchase/opening cost is FIXED at the
  // global diesel_rate (app_defaults, Settings → Defaults). The fields lock
  // as soon as the (new) item's name carries the word "Diesel".
  const isDieselProduct = isProduct && isDieselItemName(name);
  const dieselRateStr = dieselRateNum > 0 ? String(dieselRateNum) : '';

  // CREATE convenience: a product row starts with the first master location
  // (opening stock zero — receive stock via GRN / adjustments afterwards).
  React.useEffect(() => {
    if (isProduct && !initialItem && formLocations.length === 0 && locations.length > 0) {
      setFormLocations([{
        locationId: locations[0].id,
        locationName: locations[0].name,
        openingStock: '0',
        minStockLevel: '0',
        liveStock: 0,
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, isProduct]);

  // DYNAMIC ATTRIBUTE KEYS (serialized inventory, 2026-11-16): a trackable
  // item declares WHICH per-unit fields exist (brand, size, volts...). Draft
  // rows are label + typed input + (select) options + required; the server
  // derives stable keys from the labels. Prefilled on EDIT of a trackable
  // item; existing units keep their saved values when keys change.
  const [attrKeys, setAttrKeys] = useState<Array<{
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    options: string;
    required: boolean;
  }>>(
    initialItem?.type === 'asset' && Array.isArray(initialItem.attributes)
      ? initialItem.attributes.map((def) => ({
          label: def.label,
          type: def.type,
          options: (def.options || []).join(', '),
          required: Boolean(def.required),
        }))
      : []
  );

  // Filter categories matching current item type (asset/trackable items are
  // goods — they pick from every product/both-category, like products do)
  const matchingCategories = type === 'asset'
    ? categories.filter((c) => c.type === 'both' || c.type === 'product')
    : categories.filter((c) => c.type === 'both' || c.type === type);

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

    const selectedCategory = categories.find((c) => c.id === categoryId);

    // DYNAMIC ATTRIBUTE KEYS: validate + shape for trackable items
    if (type === 'asset') {
      for (const row of attrKeys) {
        if (!row.label.trim()) {
          setError('Every attribute key needs a label (or remove the empty row).');
          return;
        }
        if (row.type === 'select' && !row.options.split(',').map((o) => o.trim()).filter(Boolean).length) {
          setError(`Attribute key "${row.label}" is a pick-list — add at least one option (comma separated).`);
          return;
        }
      }
    }

    try {
      // BASIC (PRODUCT) FACTS (2026-11-17 restore — user directive): pricing,
      // GST slab + storage buckets ride the payload for products on BOTH
      // create and edit; serialised items keep their identification-only
      // payload (pricing lives on sale lines, stock lives in unit registers).
      const productFacts = isProduct ? {
        // DIESEL PRICING LOCK: purchase/opening cost is ALWAYS the global
        // diesel rate (snapshot per save) — never user-entered.
        salePrice: Number(salePrice) || 0,
        ...(isDieselProduct
          ? (dieselRateNum > 0 ? { purchasePrice: dieselRateNum } : { purchasePrice: Number(purchasePrice) || 0 })
          : (purchasePrice !== '' ? { purchasePrice: Number(purchasePrice) || 0 } : {})),
        taxRateGst,
        locations: formLocations
          .filter((l) => l.locationName)
          .map((l) => ({
            locationId: l.locationId || undefined,
            locationName: l.locationName,
            // EDIT keeps every bucket's LIVE stock (the form never moves stock);
            // CREATE derives the bucket from its opening allocation.
            currentStock: initialItem ? Number(l.liveStock ?? 0) : (parseFloat(l.openingStock) || 0),
            openingStock: parseFloat(l.openingStock) || 0,
            minStockLevel: parseFloat(l.minStockLevel) || 0,
          })),
        currentStock: initialItem ? totalLiveStock : totalOpeningStock,
        openingStock: totalOpeningStock,
        minStockLevel: totalMinStock,
        stockLocations: formLocations.filter((l) => l.locationName).map((l) => l.locationName),
        stockLocation: formLocations.filter((l) => l.locationName).map((l) => l.locationName).join(', '),
        ...(initialItem
          ? {}
          : {
              openingStockPrice: isDieselProduct && dieselRateNum > 0 ? dieselRateNum : (parseFloat(openingStockPrice) || undefined),
              openingStockDate: openingStockDate || undefined,
              ...(isDieselProduct
                ? (dieselRateNum > 0 ? { purchasePrice: dieselRateNum } : {})
                : (parseFloat(openingStockPrice) > 0 ? { purchasePrice: parseFloat(openingStockPrice) } : {})),
            }),
      } : {};

      if (initialItem) {
        localDb.updateItem(initialItem.id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          type,
          categoryId,
          categoryName: selectedCategory?.name || 'General',
          unit: unit.trim().toUpperCase(),
          hsnSacCode: hsnSacCode.trim(),
          isActive,
          ...productFacts,
          // SERIALISED item: the (possibly edited) per-unit key list — values
          // already stored on units survive under keys that stay declared
          ...(type === 'asset' ? {
            attributes: attrKeys
              .filter((row) => row.label.trim())
              .map((row) => ({
                label: row.label.trim(),
                type: row.type,
                ...(row.type === 'select'
                  ? { options: row.options.split(',').map((o) => o.trim()).filter(Boolean) }
                  : {}),
                ...(row.required ? { required: true } : {}),
              })),
          } : {}),
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
          isActive,
          ...productFacts,
          // SERIALISED item: the per-unit attribute keys it tracks
          ...(type === 'asset' ? {
            attributes: attrKeys
              .filter((row) => row.label.trim())
              .map((row) => ({
                label: row.label.trim(),
                type: row.type,
                ...(row.type === 'select'
                  ? { options: row.options.split(',').map((o) => o.trim()).filter(Boolean) }
                  : {}),
                ...(row.required ? { required: true } : {}),
              })),
          } : {}),
          // Staged documents (new-item flow) — the server links them in the
          // same create flow and moves each S3 object from Pending/ under
          // Inventory/<id>/
          ...(stagedItemDocs.length > 0 ? { documentIds: stagedItemDocs.map((d) => d.id) } : {}),
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save item.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-3xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
              {type === 'product' ? <Package className="w-5 h-5" /> : type === 'asset' ? <ScanBarcode className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">
                {initialItem ? 'Edit Item Master' : 'Add Item to Master Catalog'}
              </h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">
                {type === 'asset'
                  ? 'Serialized item — the catalog header; every physical unit carries its own serial in the register'
                  : 'Master identification — name, code, category, unit & HSN/SAC code'}
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

          {/* Item TYPE tabs REMOVED (2026-11-16, serialized-inventory prep):
              new items are always Stock Items; an EXISTING item keeps its own
              stored type — the form never converts product/service/asset
              (legacy semantics stay stable). */}

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
                  disabled={Boolean(initialItem)}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError('');
                  }}
                  className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono uppercase font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                    initialItem ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                  required
                />
                {initialItem ? (
                  <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 ml-2 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Item code is locked once the item is created.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  {type === 'service' ? 'SAC Code (Services)' : 'HSN Code (Goods)'}
                </label>
                <input
                  type="text"
                  placeholder={type === 'service' ? 'e.g. 997312' : 'e.g. 27150090'}
                  value={hsnSacCode}
                  onChange={(e) => setHsnSacCode(e.target.value.trim())}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono uppercase text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
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
                  disabled={!!initialItem}
                  title={initialItem ? 'Unit of Measurement is fixed after item creation to keep stock figures comparable.' : undefined}
                  className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${initialItem ? 'opacity-50 cursor-not-allowed' : ''}`}
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

          {/* ===== BASIC (PRODUCT) ONLY, restored 2026-11-17 (user directive):
              pricing + GST slab, and the storage locations + opening facts.
              Hidden on SERIALIZED items by design (pricing lives on sale
              lines, stock lives in the unit register). ===== */}
          {isProduct && (
            <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
              <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--color-primary)]" />
                Pricing &amp; GST Tax Rates
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Sale Price ({currencySymbol})</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 99.89"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Purchase Price ({currencySymbol})</label>
                  {isDieselProduct ? (
                    <>
                      <input
                        type="text"
                        readOnly
                        value={dieselRateStr ? `${currencySymbol}${dieselRateNum.toLocaleString('en-IN')} / ${unit || 'L'} (fixed)` : 'Set diesel_rate in Settings'}
                        title={dieselRateStr ? 'Diesel procures at the global diesel rate — edit diesel_rate in Settings → Defaults' : 'No global diesel rate set — set diesel_rate in Settings → Defaults'}
                        className={`w-full px-4 py-2 border rounded-full text-xs font-mono font-bold ${dieselRateStr ? 'bg-[var(--color-surface-container-highest)] border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]' : 'bg-[var(--color-error-container)]/40 border-[var(--color-error)]/40 text-[var(--color-on-surface-variant)]'} cursor-not-allowed focus:outline-none`}
                      />
                      <p className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] mt-1">
                        Diesel has no procured cost — it prices at the global diesel rate.
                      </p>
                    </>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 85 per L (optional)"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">GST Tax Slab (%) *</label>
                  <select
                    value={taxRateGst}
                    onChange={(e) => setTaxRateGst(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
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
          )}

          {isProduct && (
            <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                  Storage Locations &amp; Opening Stock Allocation
                </h3>
                <button
                  type="button"
                  onClick={handleAddLocationRow}
                  className="text-[11px] font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Location
                </button>
              </div>
              {formLocations.length === 0 ? (
                <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                  No storage location assigned yet — add one to place this item's stock.
                </p>
              ) : (
                <div className="space-y-2">
                  {formLocations.map((l, idx) => (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">Location</label>
                        <select
                          value={l.locationId || ''}
                          onChange={(e) => {
                            const loc = locations.find((x) => x.id === e.target.value);
                            const next = [...formLocations];
                            next[idx] = { ...l, locationId: loc?.id, locationName: loc?.name || '' };
                            setFormLocations(next);
                          }}
                          className="w-full px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                        >
                          <option value="">-- Choose location --</option>
                          {locations.map((loc) => (
                            <option
                              key={loc.id}
                              value={loc.id}
                              disabled={formLocations.some((o, oi) => oi !== idx && o.locationId === loc.id)}
                            >
                              {loc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">
                          {initialItem ? `Current (${(l.liveStock ?? 0)} L)` : 'Opening Stock'}
                        </label>
                        {initialItem ? (
                          <input
                            type="number"
                            disabled
                            value={l.liveStock ?? 0}
                            title="Stock moves via GRN / Stock Adjustment — the item form never moves stock"
                            className="w-full px-3 py-1.5 bg-[var(--color-surface-container-highest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface-variant)] opacity-70 cursor-not-allowed"
                          />
                        ) : (
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={l.openingStock}
                            onChange={(e) => {
                              const next = [...formLocations];
                              next[idx] = { ...l, openingStock: e.target.value };
                              setFormLocations(next);
                            }}
                            className="w-full px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface)] focus:outline-none"
                          />
                        )}
                      </div>
                      <div className="w-28">
                        <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">Min / Safety</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={l.minStockLevel}
                          onChange={(e) => {
                            const next = [...formLocations];
                            next[idx] = { ...l, minStockLevel: e.target.value };
                            setFormLocations(next);
                          }}
                          className="w-full px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface)] focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormLocations(formLocations.filter((_, fi) => fi !== idx))}
                        className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/40 rounded-full transition"
                        title="Remove this location row"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Opening facts (create) + stock placement summary (edit) */}
              {initialItem ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-[var(--color-on-surface-variant)]">
                  <span>Item total: <b className="text-[var(--color-on-surface)] font-mono">{totalLiveStock.toLocaleString('en-IN')}</b></span>
                  <span>Opening: <b className="text-[var(--color-on-surface)] font-mono">{totalOpeningStock.toLocaleString('en-IN')}</b></span>
                  <span>Min/Safety: <b className="text-[var(--color-on-surface)] font-mono">{totalMinStock.toLocaleString('en-IN')}</b></span>
                  <span className="text-[10px] text-[var(--color-on-surface-variant)]">Stock changes go through GRN, Stock Adjustment or dispatch — never through this form.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Opening Stock Cost ({currencySymbol})</label>
                    {isDieselProduct ? (
                      <>
                        <input
                          type="text"
                          readOnly
                          value={dieselRateStr ? `${currencySymbol}${dieselRateNum.toLocaleString('en-IN')} / ${unit || 'L'} (fixed)` : 'Set diesel_rate in Settings'}
                          className={`w-full px-4 py-2 border rounded-full text-xs font-mono font-bold ${dieselRateStr ? 'bg-[var(--color-surface-container-highest)] border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]' : 'bg-[var(--color-error-container)]/40 border-[var(--color-error)]/40 text-[var(--color-on-surface-variant)]'} cursor-not-allowed focus:outline-none`}
                        />
                        <p className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] mt-1">
                          Opening stock values diesel at the global diesel rate.
                        </p>
                      </>
                    ) : (
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="e.g. 85 per unit"
                        value={openingStockPrice}
                        onChange={(e) => setOpeningStockPrice(e.target.value)}
                        className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Opening Stock Date</label>
                    <input
                      type="date"
                      value={openingStockDate}
                      onChange={(e) => setOpeningStockDate(e.target.value)}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                    />
                  </div>
                  <p className="sm:col-span-2 text-[11px] font-semibold text-[var(--color-on-surface-variant)]">
                    {totalOpeningStock > 0
                      ? `Opening valuation: ${totalOpeningStock.toLocaleString('en-IN')} × ${currencySymbol}${(isDieselProduct && dieselRateNum > 0 ? dieselRateNum : (parseFloat(openingStockPrice) || 0)).toLocaleString('en-IN')} = ${currencySymbol}${(totalOpeningStock * (isDieselProduct && dieselRateNum > 0 ? dieselRateNum : (parseFloat(openingStockPrice) || 0))).toLocaleString('en-IN')}`
                      : 'Opening stock optional — receive stock later via GRN or Stock Adjustment.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* DYNAMIC ATTRIBUTE KEYS (trackable items; 2026-11-16): the per-unit
              fields EVERY entry of this serialized item will carry (fixed ones
              — serial, supplier, purchase date, cost — stay columns
              automatically). Editing an item keeps its existing keys. */}
          {type === 'asset' && (
            <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                  <ScanBarcode className="w-4 h-4 text-[var(--color-primary)]" />
                  Attribute Keys (fields on every unit entry)
                </h3>
                <button
                  type="button"
                  onClick={() => setAttrKeys((prev) => [...prev, { label: '', type: 'text', options: '', required: false }])}
                  className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-primary)] hover:opacity-80"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Key
                </button>
              </div>
              <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                e.g. for a Tyre: Brand (pick-list), Size (text). Fixed on every unit regardless: Serial Number,
                Supplier, Purchase Date, Purchase Cost.
              </p>
              {attrKeys.length === 0 ? (
                <p className="text-[10px] text-[var(--color-on-surface-variant)] italic px-1">No attribute keys yet — the register will only track the fixed facts.</p>
              ) : (
                <div className="space-y-2">
                  {attrKeys.map((row, idx) => (
                    <div key={idx} className="p-3 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] flex flex-col sm:flex-row sm:items-end gap-2.5">
                      <div className="flex-1 space-y-1">
                        <label className="block text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase">Key label *</label>
                        <input
                          type="text"
                          value={row.label}
                          onChange={(e) => {
                            const next = [...attrKeys];
                            next[idx] = { ...row, label: e.target.value };
                            setAttrKeys(next);
                          }}
                          placeholder="e.g. Brand / Size / Voltage"
                          className="w-full px-3 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        />
                      </div>
                      <div className="w-full sm:w-32 space-y-1">
                        <label className="block text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase">Input type</label>
                        <select
                          value={row.type}
                          onChange={(e) => {
                            const next = [...attrKeys];
                            next[idx] = { ...row, type: e.target.value as typeof row.type };
                            setAttrKeys(next);
                          }}
                          className="w-full px-3 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="select">Pick-list</option>
                        </select>
                      </div>
                      {row.type === 'select' && (
                        <div className="w-full sm:w-40 space-y-1">
                          <label className="block text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase">Options (comma sep.) *</label>
                          <input
                            type="text"
                            value={row.options}
                            onChange={(e) => {
                              const next = [...attrKeys];
                              next[idx] = { ...row, options: e.target.value };
                              setAttrKeys(next);
                            }}
                            placeholder="MRF, CEAT, JK"
                            className="w-full px-3 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          />
                        </div>
                      )}
                      <label className="flex items-center gap-1.5 pb-2 shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.required}
                          onChange={(e) => {
                            const next = [...attrKeys];
                            next[idx] = { ...row, required: e.target.checked };
                            setAttrKeys(next);
                          }}
                          className="w-3.5 h-3.5 text-[var(--color-primary)] rounded border-[var(--color-outline-variant)] focus:ring-[var(--color-primary)]"
                        />
                        <span className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase">Required</span>
                      </label>
                      <div className="pb-1.5">
                        <button
                          type="button"
                          onClick={() => setAttrKeys(attrKeys.filter((_, i) => i !== idx))}
                          className="p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-full transition-colors"
                          title="Remove this key"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <EntityDocumentsSection
            feature="item"
            entityId={initialItem?.id}
            staged={initialItem ? undefined : stagedItemDocs}
            onStagedChange={initialItem ? undefined : setStagedItemDocs}
          />

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

