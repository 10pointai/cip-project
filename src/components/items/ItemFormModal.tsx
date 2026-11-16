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
import { Item, ItemCategory, ItemUnit, ItemLocation, ItemType } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { EntityDocumentsSection, StagedDocument } from '../common/EntityDocumentsSection';

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
  defaultType,
  currencySymbol = '₹',
  onClose,
  onOpenCategories,
  onOpenUnits,
}) => {
  // 2026-11-16: type is NOT chosen in this form anymore — the tab selector is
  // gone. The type comes from WHERE the form was opened: 'product' from Basic
  // Inventory (default), 'asset' from Serialized Inventory; an EXISTING item
  // keeps its stored type without any way to convert it.
  const type: ItemType = initialItem?.type || defaultType || 'product';
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
      // 2026-11-16: identification-only payload. NO pricing, GST slab,
      // locations, stock aggregates, technical specs or remarks are sent —
      // an EXISTING item keeps every stored value (updateItem merges, and the
      // server recalculates nothing it was not given); a NEW item is born
      // unplaced with zero stock.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
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

          {/* PRICING & GST TAX RATES + ASSIGNED STOCK LOCATIONS + TECHNICAL
              SPECS + REMARKS ALL REMOVED (2026-11-16): nothing per-item-specific
              (price, slab, placement, opening stock, specs, remarks) is captured
              on the CATALOG MASTER anymore — sale/purchase lines carry their own
              rate and slab, and stock placement belongs to the physical
              (serialized) stock, not the catalog row.
              EXISTING items keep their stored values untouched through edits
              (the update omits these fields); NEW items are born unplaced with
              zero stock and grow location data through GRN / the register. */}
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

