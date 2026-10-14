import React, { useState } from 'react';
import { X, Scale, Plus, Edit2, Trash2, Check, AlertCircle, Lock } from 'lucide-react';
import { ItemUnit, Item } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

interface UnitManagerModalProps {
  units: ItemUnit[];
  items: Item[];
  onClose: () => void;
  onSelectUnit?: (unitCode: string) => void;
}

export const UnitManagerModal: React.FC<UnitManagerModalProps> = ({
  units,
  items,
  onClose,
  onSelectUnit,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [allowDecimal, setAllowDecimal] = useState(true);
  const [error, setError] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);

  const startEdit = (u: ItemUnit) => {
    setEditingId(u.id);
    setCode(u.code);
    setName(u.name);
    setAllowDecimal(u.allowDecimal);
    setIsAddingNew(false);
    setError('');
  };

  const startAdd = () => {
    setEditingId(null);
    setCode('');
    setName('');
    setAllowDecimal(true);
    setIsAddingNew(true);
    setError('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Unit symbol/code is required (e.g. MT, LTR, CUM).');
      return;
    }
    if (!name.trim()) {
      setError('Unit formal name is required.');
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    // Check code duplication
    const duplicate = units.find(
      (u) => u.code.toUpperCase() === cleanCode && (isAddingNew || u.id !== editingId)
    );
    if (duplicate) {
      setError(`Unit code "${cleanCode}" already exists.`);
      return;
    }

    try {
      if (isAddingNew) {
        const newU = localDb.addUnit({
          code: cleanCode,
          name: name.trim(),
          allowDecimal,
          isStandard: false,
        });
        if (onSelectUnit) {
          onSelectUnit(newU.code);
        }
        setIsAddingNew(false);
      } else if (editingId) {
        localDb.updateUnit(editingId, {
          code: cleanCode,
          name: name.trim(),
          allowDecimal,
        });
        setEditingId(null);
      }
      setCode('');
      setName('');
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to save unit.');
    }
  };

  const handleDelete = (unit: ItemUnit) => {
    if (unit.isStandard) {
      setError(`"${unit.code}" is a standard system unit and cannot be deleted.`);
      return;
    }

    const linkedCount = items.filter(
      (i) => i.unit.toUpperCase() === unit.code.toUpperCase()
    ).length;

    if (linkedCount > 0) {
      setError(`Cannot delete "${unit.code}" because ${linkedCount} item(s) are using this unit.`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete unit "${unit.code} - ${unit.name}"?`)) {
      try {
        localDb.deleteUnit(unit.id);
        if (editingId === unit.id) {
          setEditingId(null);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to delete unit.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-2xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">Manage Units of Measurement (UOM)</h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">Configure standard volumetric, weight, time, and count units</p>
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

          {/* Form for Add/Edit */}
          {(isAddingNew || editingId) && (
            <form onSubmit={handleSave} className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-4 h-4 text-[var(--color-primary)]" />
                  {isAddingNew ? 'Create New Measurement Unit' : 'Edit Unit'}
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
                    Unit Symbol / Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BAG, DRUM, KM, ROLL"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setError('');
                    }}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold uppercase text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    Formal Unit Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 50kg Bags / Cement Packets"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError('');
                    }}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--color-on-surface)]">
                  <input
                    type="checkbox"
                    checked={allowDecimal}
                    onChange={(e) => setAllowDecimal(e.target.checked)}
                    className="w-4 h-4 text-[var(--color-primary)] rounded border-[var(--color-outline-variant)] focus:ring-[var(--color-primary)]"
                  />
                  <span>Allow Decimal Quantities (e.g. 12.45 MT, 450.5 Ltr)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-medium text-xs rounded-full shadow-xs transition-all hover:scale-[1.01]"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isAddingNew ? 'Add Unit' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Top Bar with Add Button */}
          {!isAddingNew && !editingId && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Available Units ({units.length})
              </span>
              <button
                type="button"
                onClick={startAdd}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-medium text-xs rounded-full shadow-xs transition-all hover:scale-[1.01]"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Custom Unit
              </button>
            </div>
          )}

          {/* Units Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {units.map((u) => {
              const linkedCount = items.filter(
                (i) => i.unit.toUpperCase() === u.code.toUpperCase()
              ).length;

              return (
                <div
                  key={u.id}
                  className="p-3 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)]/50 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] flex items-center justify-center font-mono font-black text-xs shrink-0">
                      {u.code}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-[var(--color-on-surface)] truncate">{u.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                          {u.allowDecimal ? 'Decimals allowed' : 'Whole integers only'}
                        </span>
                        {u.isStandard && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--color-primary)] font-semibold bg-[var(--color-primary-container)] px-1.5 py-0.2 rounded-full">
                            <Lock className="w-2.5 h-2.5" /> Standard
                          </span>
                        )}
                        {linkedCount > 0 && (
                          <span className="text-[10px] font-bold text-[var(--color-success)] bg-[var(--color-success-container)] px-1.5 py-0.2 rounded-full">
                            {linkedCount} item{linkedCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(u)}
                      className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-container)] rounded-full transition-colors"
                      title="Edit Unit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {!u.isStandard && (
                      <button
                        type="button"
                        onClick={() => handleDelete(u)}
                        className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)] rounded-full transition-colors"
                        title="Delete Unit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] font-medium text-xs rounded-full transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
