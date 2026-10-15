import React, { useState } from 'react';
import { X, Warehouse, MapPin, Plus, Edit2, Check, AlertCircle, Lock } from 'lucide-react';
import { ItemLocation, Item } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

interface LocationManagerModalProps {
  locations: ItemLocation[];
  items: Item[];
  onClose: () => void;
  onSelectLocation?: (locationName: string) => void;
}

export const LocationManagerModal: React.FC<LocationManagerModalProps> = ({
  locations,
  items,
  onClose,
  onSelectLocation,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'silo' | 'tank' | 'stockpile' | 'warehouse' | 'bin' | 'yard' | 'other'>('warehouse');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);

  const startEdit = (loc: ItemLocation) => {
    setEditingId(loc.id);
    setName(loc.name);
    setCode(loc.code || '');
    setType(loc.type || 'warehouse');
    setCapacity(loc.capacity || '');
    setDescription(loc.description || '');
    setIsAddingNew(false);
    setError('');
  };

  const startAdd = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setType('warehouse');
    setCapacity('');
    setDescription('');
    setIsAddingNew(true);
    setError('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Location name is required.');
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    // Check code duplication if code provided
    if (cleanCode) {
      const duplicate = locations.find(
        (l) => l.code && l.code.toUpperCase() === cleanCode && (isAddingNew || l.id !== editingId)
      );
      if (duplicate) {
        setError(`Location code "${cleanCode}" already exists.`);
        return;
      }
    }

    try {
      if (isAddingNew) {
        const newLoc = localDb.addLocation({
          name: name.trim(),
          code: cleanCode || undefined,
          type,
          capacity: capacity.trim() || undefined,
          description: description.trim() || undefined,
          isStandard: false,
        });
        if (onSelectLocation) {
          onSelectLocation(newLoc.name);
        }
        setIsAddingNew(false);
      } else if (editingId) {
        localDb.updateLocation(editingId, {
          name: name.trim(),
          code: cleanCode || undefined,
          type,
          capacity: capacity.trim() || undefined,
          description: description.trim() || undefined,
        });
        setEditingId(null);
      }
      setName('');
      setCode('');
      setCapacity('');
      setDescription('');
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to save location.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-2xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
              <Warehouse className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">Manage Stockyard & Plant Locations</h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">Configure silos, liquid bitumen tanks, aggregate stockpiles, and warehouse bays</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--color-error-container)] border border-[var(--color-error)] text-[var(--color-on-error-container)] text-xs rounded-2xl font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form when adding or editing */}
          {(isAddingNew || editingId) && (
            <form onSubmit={handleSave} className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[var(--color-primary)]" />
                  {isAddingNew ? 'Add New Storage Location' : 'Edit Location'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setEditingId(null);
                    setError('');
                  }}
                  className="text-xs text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] font-medium"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Silo Tower C or Yard Bay 3"
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
                    Code / Identifier
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SILO-C"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError('');
                    }}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    Storage Type
                  </label>
                  <select
                    value={type}
                    onChange={(e: any) => setType(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <option value="silo">Silo (Hot Mix / Binder)</option>
                    <option value="tank">Tank (Liquid Bitumen / Fuel)</option>
                    <option value="stockpile">Stockpile (Aggregate / Sand)</option>
                    <option value="warehouse">Warehouse (Spares / Additives)</option>
                    <option value="bin">Feeder Bin</option>
                    <option value="yard">Open Yard</option>
                    <option value="other">Other Facility</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    Capacity Limit (e.g. 250 MT / 50 KL)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 250 MT"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Description & Specifications
                </label>
                <input
                  type="text"
                  placeholder="e.g. Insulated temperature-controlled hot mix discharge silo"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95 transition-colors shadow-sm"
                >
                  {isAddingNew ? 'Save Location' : 'Update Location'}
                </button>
              </div>
            </form>
          )}

          {/* List Header & Add Button */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
              Active Plant Locations ({locations.length})
            </h3>
            {!isAddingNew && !editingId && (
              <button
                type="button"
                onClick={startAdd}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Location
              </button>
            )}
          </div>

          {/* Locations Table/Cards */}
          <div className="space-y-2">
            {locations.map((loc) => {
              const linkedCount = items.filter(
                (i) => i.stockLocation && i.stockLocation.toLowerCase() === loc.name.toLowerCase()
              ).length;

              return (
                <div
                  key={loc.id}
                  className="p-4 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold shrink-0">
                      <Warehouse className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--color-on-surface)]">{loc.name}</span>
                        {loc.code && (
                          <span className="px-2 py-0.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] text-[10px] font-extrabold rounded-md uppercase">
                            {loc.code}
                          </span>
                        )}
                        {loc.isStandard && (
                          <span className="px-2 py-0.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] text-[10px] font-semibold rounded-md">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--color-on-surface-variant)]">
                        {loc.type && <span className="capitalize font-medium">Type: {loc.type}</span>}
                        {loc.capacity && <span className="font-semibold text-[var(--color-primary)]">Capacity: {loc.capacity}</span>}
                        <span>{linkedCount} item(s) mapped</span>
                      </div>
                      {loc.description && <p className="text-[11px] text-[var(--color-outline)] mt-0.5">{loc.description}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(loc)}
                      className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-container)] rounded-xl transition-colors"
                      title="Edit Location"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] rounded-full text-xs font-bold hover:bg-[var(--color-surface-container)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
