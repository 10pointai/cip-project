import React, { useState } from 'react';
import { ScanBarcode, X, AlertCircle } from 'lucide-react';
import { Item, ItemLocation, Party, InventoryUnit } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

/**
 * SHARED UNIT REGISTER MODAL (2026-11-19) — the canonical "add/edit a
 * serialised unit" form, extracted verbatim from the serialized-inventory
 * asset profile so every entry point shows the SAME modal (the Tyre
 * Management "Register Serial" button opens it too). Fixed facts stay form
 * fields (serial, supplier, purchase date, cost); the owning item's DECLARED
 * attribute keys render one input each (typed + optionally required),
 * coerced and validated on save exactly as the asset profile's register.
 * An item picker renders only when the caller offers several eligible items.
 */
interface UnitRegisterModalProps {
  /** Eligible owning items (asset) — pass a single-item array from an item profile. */
  items: Item[];
  parties: Party[];
  locations: ItemLocation[];
  currencySymbol?: string;
  /** Prefill for the EDIT path (undefined = register a new unit). */
  existing?: InventoryUnit | null;
  onClose: () => void;
}

type UnitFormState = {
  serialNumber: string;
  supplierId: string;
  locationId: string;
  purchaseDate: string;
  purchaseCost: string;
  /** Draft strings for the owning item's declared keys — coerced per key
   *  type on save; the server re-validates. */
  attributes: Record<string, string>;
};

const UnitRegisterModal: React.FC<UnitRegisterModalProps> = ({
  items,
  parties,
  locations,
  currencySymbol,
  existing,
  onClose,
}) => {
  const existingAttrDefs =
    (existing && Array.isArray(items.find((i) => i.id === existing.itemId)?.attributes))
      ? (items.find((i) => i.id === existing.itemId)!.attributes as NonNullable<Item['attributes']>)
      : [];
  const [itemId, setItemId] = useState(items.length === 1 ? items[0].id : (existing?.itemId || ''));
  const selectedItem = items.find((i) => i.id === itemId) || null;
  const attrDefs = Array.isArray(selectedItem?.attributes) ? selectedItem.attributes : [];
  const [form, setForm] = useState<UnitFormState>(() => {
    if (!existing) {
      return { serialNumber: '', supplierId: '', locationId: '', purchaseDate: new Date().toISOString().split('T')[0], purchaseCost: '', attributes: {} };
    }
    return {
      serialNumber: existing.serialNumber,
      supplierId: existing.supplierId || '',
      locationId: existing.locationId || '',
      purchaseDate: existing.purchaseDate || '',
      purchaseCost: existing.purchaseCost !== undefined ? String(existing.purchaseCost) : '',
      // Drafts keyed by the owning item's declared keys (2026-11-16 rules)
      attributes: Object.fromEntries(
        existingAttrDefs.map((def) => [def.key, String(existing.attributes?.[def.key] ?? '')])
      ),
    };
  });
  const [formErr, setFormErr] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setFormErr('Select the item this serial belongs to.');
      return;
    }
    // Same coercion as the asset profile's register (2026-11-16 rules):
    // required flags enforced, numbers checked, select values restricted.
    const payload: Partial<InventoryUnit> & { itemId: string; serialNumber: string } = {
      itemId: selectedItem.id,
      serialNumber: form.serialNumber.trim(),
      supplierId: form.supplierId || undefined,
      locationId: form.locationId || undefined,
      purchaseDate: form.purchaseDate || undefined,
      purchaseCost: form.purchaseCost === '' ? undefined : Number(form.purchaseCost),
    };
    const attributes: Record<string, string | number> = {};
    for (const def of attrDefs) {
      const v = (form.attributes[def.key] || '').trim();
      if (!v) {
        if (def.required) {
          setFormErr(`"${def.label}" is required for every ${selectedItem.name} entry.`);
          return;
        }
        continue;
      }
      if (def.type === 'number') {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          setFormErr(`"${def.label}" must be a number.`);
          return;
        }
        attributes[def.key] = n;
      } else if (def.type === 'select') {
        if (!(def.options || []).includes(v)) {
          setFormErr(`"${def.label}" must be one of: ${(def.options || []).join(', ')}.`);
          return;
        }
        attributes[def.key] = v;
      } else {
        attributes[def.key] = v;
      }
    }
    // A unit with legacy stored attribute values keeps them unless the form
    // explicitly renders the keys — send the (possibly cleared) map when the
    // unit already carries any attribute data.
    const hasStored = Boolean(existing?.attributes && Object.keys(existing.attributes).length > 0);
    if (Object.keys(attributes).length > 0 || (existing && hasStored)) {
      payload.attributes = attributes;
    }
    if (existing) {
      localDb.updateInventoryUnit(existing.id, payload);
    } else {
      localDb.addInventoryUnit(payload);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={handleSave} className="bg-[var(--color-surface-container-lowest)] w-full max-w-2xl rounded-3xl shadow-2xl border border-[var(--color-outline-variant)] flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center">
              <ScanBarcode className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">{existing ? `Edit Unit ${existing.serialNumber}` : `Register a Unit of ${selectedItem?.name || '…'}`}</h3>
              <p className="text-[10px] text-[var(--color-on-surface-variant)]">The serial number makes the unit unique within this item's register</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)]">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {/* ITEM PICKER — only when the caller offers several eligible items
              (the Tyre Management register entry point); a profile passes one. */}
          {items.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Item *</label>
              <select
                required
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Serial Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. MRF-2026-A-0007845"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Supplier</label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
              >
                <option value="">— Not recorded —</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Storage Location</label>
              <select
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
              >
                <option value="">— None —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Purchase Date</label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Purchase Cost ({currencySymbol || '₹'})</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={form.purchaseCost}
                onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
              />
            </div>
          </div>

          {/* DYNAMIC ATTRIBUTE INPUTS: one input per declared key of the
              owning item — text / number / date / pick-list — required keys
              enforced on save */}
          {attrDefs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {attrDefs.map((def) => (
                <div key={def.key}>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    {def.label}{def.required && <span className="text-[var(--color-error)]"> *</span>}
                  </label>
                  {def.type === 'select' ? (
                    <select
                      value={form.attributes[def.key] || ''}
                      onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [def.key]: e.target.value } })}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                    >
                      <option value="">— Not recorded —</option>
                      {(def.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                      step={def.type === 'number' ? 'any' : undefined}
                      value={form.attributes[def.key] || ''}
                      onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [def.key]: e.target.value } })}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {formErr && (
            <p className="text-[10px] font-bold text-[var(--color-error)] flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {formErr}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container)]">Cancel</button>
          <button type="submit" className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95">
            {existing ? 'Save Unit' : 'Add Item'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UnitRegisterModal;
