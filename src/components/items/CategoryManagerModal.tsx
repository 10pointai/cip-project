import React, { useState } from 'react';
import { X, Tag, Plus, Edit2, Trash2, Check, AlertCircle, Layers } from 'lucide-react';
import { ItemCategory, Item } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

interface CategoryManagerModalProps {
  categories: ItemCategory[];
  items: Item[];
  onClose: () => void;
  onSelectCategory?: (categoryId: string) => void;
}

const PRESET_COLORS = [
  '#005ac1', // Deep Blue
  '#386a20', // Forest Green
  '#ba1a1a', // Terracotta Red
  '#7c5800', // Gold/Bronze
  '#5b53a5', // Purple Indigo
  '#006783', // Teal/Cyan
  '#6750a4', // Deep Violet
  '#825500', // Amber
  '#006a6a', // Sea Green
  '#705d00', // Olive
];

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  categories,
  items,
  onClose,
  onSelectCategory,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'product' | 'service' | 'both'>('product');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [error, setError] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);

  const startEdit = (cat: ItemCategory) => {
    setEditingId(cat.id);
    setName(cat.name);
    setType(cat.type);
    setDescription(cat.description || '');
    setColor(cat.color || PRESET_COLORS[0]);
    setIsAddingNew(false);
    setError('');
  };

  const startAdd = () => {
    setEditingId(null);
    setName('');
    setType('product');
    setDescription('');
    setColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    setIsAddingNew(true);
    setError('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }

    try {
      if (isAddingNew) {
        const newCat = localDb.addCategory({
          name: name.trim(),
          type,
          description: description.trim(),
          color,
        });
        if (onSelectCategory) {
          onSelectCategory(newCat.id);
        }
        setIsAddingNew(false);
      } else if (editingId) {
        localDb.updateCategory(editingId, {
          name: name.trim(),
          type,
          description: description.trim(),
          color,
        });
        setEditingId(null);
      }
      setName('');
      setDescription('');
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to save category.');
    }
  };

  const handleDelete = (id: string, catName: string) => {
    const linkedItemsCount = items.filter((i) => i.categoryId === id).length;
    if (linkedItemsCount > 0) {
      setError(`Cannot delete "${catName}" because ${linkedItemsCount} item(s) are currently categorized under it.`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete category "${catName}"?`)) {
      localDb.deleteCategory(id);
      if (editingId === id) {
        setEditingId(null);
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
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">Manage Item Categories</h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">Organize materials, asphalt mixes, aggregate grades, and contracted services</p>
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
                  <Tag className="w-4 h-4 text-[var(--color-primary)]" />
                  {isAddingNew ? 'Create New Category' : 'Edit Category'}
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
                    Category Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bituminous Emulsions & Primers"
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
                    Applicable Type *
                  </label>
                  <select
                    value={type}
                    onChange={(e: any) => setType(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <option value="product">Products (Goods / Raw Materials)</option>
                    <option value="service">Services (Work Contracts / Logistics / Tests)</option>
                    <option value="both">Both Products & Services</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Color Tag
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        color === c ? 'scale-125 ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Category Description / Remarks
                </label>
                <input
                  type="text"
                  placeholder="e.g. Highway tack coats, prime coats, micro-surfacing rapid setting emulsion formulations"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-medium text-xs rounded-full shadow-xs transition-all hover:scale-[1.01]"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isAddingNew ? 'Add Category' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Top Bar with Add Button */}
          {!isAddingNew && !editingId && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Existing Categories ({categories.length})
              </span>
              <button
                type="button"
                onClick={startAdd}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-medium text-xs rounded-full shadow-xs transition-all hover:scale-[1.01]"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New Category
              </button>
            </div>
          )}

          {/* Categories List */}
          <div className="space-y-2.5">
            {categories.map((cat) => {
              const linkedCount = items.filter((i) => i.categoryId === cat.id).length;
              return (
                <div
                  key={cat.id}
                  className="p-3.5 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)]/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3 h-8 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color || '#005ac1' }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-[var(--color-on-surface)] truncate">{cat.name}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] capitalize">
                          {cat.type}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                          {linkedCount} item{linkedCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      {cat.description && (
                        <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5 truncate">{cat.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-container)] rounded-full transition-colors"
                      title="Edit Category"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cat.id, cat.name)}
                      className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)] rounded-full transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
