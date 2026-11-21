import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  FileText,
  Trash2,
  Calendar,
  Layers,
  X,
  AlertCircle,
  Pencil,
  FlaskConical,
  CheckCircle2,
  Scale,
  Settings,
  ArrowRight,
  Percent,
  PackagePlus,
} from 'lucide-react';
import { ProductionBatchRun, BatchMix, Item, CompanySettings } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { SearchableSelect } from '../orders/SearchableSelect';

interface ProductionViewProps {
  batches: ProductionBatchRun[];
  batchMixes: BatchMix[];
  items: Item[];
  settings: CompanySettings;
  onRefresh?: () => void;
}

type RecipeTab = 'recipes' | 'runs';

const fmtNum = (n: number | undefined, dec = 2): string =>
  n === undefined || n === null || Number.isNaN(n)
    ? '0'
    : n.toLocaleString('en-IN', { maximumFractionDigits: dec });

// ---------------------------------------------------------------------------
// RECIPE (BATCH MIX) EDITOR
// Sizing is PER ROW (2026-11-12 correction): each ingredient independently
// picks quantity (in its own unit) or % of produced output — bitumen in %
// and LDO in MT mix freely on ONE recipe. The one-mix yield anchors the
// quantity-sized rows.
// ---------------------------------------------------------------------------
interface MixFormState {
  id?: string;
  /** 2026-11-16: no user-typed name — the OUTPUT ITEM identifies the recipe
   *  (the server derives the name from it; the card shows the item's name) */
  outputItemId: string;
  referenceOutputQty: string;
  notes: string;
  isActive: boolean;
  ingredients: Array<{ itemId: string; basis: 'quantity' | 'percentage'; quantity: string; percentage: string }>;
}

interface RunFormState {
  batchMixId: string;
  producedQuantity: string;
  date: string;
  plantUnit: string;
  notes: string;
  // Sourcing: per-ingredient stock location the qty leaves (itemId → option
  // value). The option value is the location's id, falling back to its name
  // on legacy breakdown rows without an FK.
  locations: Record<string, string>;
  // Where the produced output lands.
  outputLocation: string;
}

const emptyMixForm = (): MixFormState => ({
  outputItemId: '',
  referenceOutputQty: '',
  notes: '',
  isActive: true,
  ingredients: [{ itemId: '', basis: 'quantity', quantity: '', percentage: '' }],
});

const PLANT_UNITS = [
  'Asphalt Batching Plant #1 (160 TPH)',
  'Aggregate Pugmill Mixer #3',
  'Stone Crusher Screening Unit #2',
  'Bulk Storage Silo Area A',
];

export const ProductionView: React.FC<ProductionViewProps> = ({
  batches,
  batchMixes,
  items,
  settings,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<RecipeTab>('runs');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingBatch, setViewingBatch] = useState<ProductionBatchRun | null>(null);
  const [viewingMix, setViewingMix] = useState<BatchMix | null>(null);

  // Mix editor state
  const [mixForm, setMixForm] = useState<MixFormState | null>(null);

  // Run form state
  const [runForm, setRunForm] = useState<RunFormState | null>(null);

  const itemById = useMemo(() => {
    const map = new Map<string, Item>();
    items.forEach((i) => map.set(i.id, i));
    return map;
  }, [items]);

  // Items eligible for recipes: selectable ingredients/output (product items)
  const selectableItems = useMemo(() => items.filter((i) => i.isActive && i.type !== 'service'), [items]);

  const itemOptions = useMemo(
    () =>
      selectableItems.map((i) => ({
        value: i.id,
        label: `${i.name} [${i.code}]`,
        sub: `${i.type === 'service' ? 'Service' : 'Product'} — Stock: ${fmtNum(i.currentStock)} ${i.unit}`,
      })),
    [selectableItems]
  );

  // 2026-11-20: one ACTIVE recipe per item is server-enforced (db.ts refuses
  // the POST) — keep the editor honest by hiding the items whose recipe is
  // already active from the OUTPUT ITEM list. Editing re-picks only its own
  // item (the mix being edited is excluded from the "taken" set).
  const mixFormItemOptions = useMemo(() => {
    const taken = new Set(
      batchMixes
        .filter((m) => m.isActive !== false && m.id !== mixForm?.id)
        .map((m) => m.outputItemId)
    );
    return itemOptions.filter((o) => !taken.has(o.value));
  }, [itemOptions, batchMixes, mixForm?.id]);

  const mixOptions = useMemo(
    () =>
      batchMixes
        .filter((m) => m.isActive !== false)
        .map((m) => {
          const out = itemById.get(m.outputItemId);
          const pctRows = (m.ingredients || []).filter((i) => i.basis === 'percentage').length;
          const qtyRows = (m.ingredients || []).length - pctRows;
          return {
            value: m.id,
            label: `${m.name} → ${out?.name || '(missing item)'}`,
            sub: `${m.mixNumber} — ${pctRows ? `${pctRows} %-row${pctRows === 1 ? '' : 's'}` : ''}${pctRows && qtyRows ? ' + ' : ''}${qtyRows ? `yield ${fmtNum(m.referenceOutputQty)} ${out?.unit || ''}` : ''}`,
          };
        }),
    [batchMixes, itemById]
  );

  // Ingredient consumed-quantity preview for a mix at a produced quantity.
  // Sizing is PER ROW: quantity rows scale by the one-mix yield, percentage
  // rows are a direct % of the produced quantity.
  const computeConsumed = (
    mix: BatchMix,
    producedQty: number
  ): Array<{ itemId: string; quantity: number; unit: string; isService: boolean }> => {
    if (!producedQty || producedQty <= 0) return [];
    const refQty = Number(mix.referenceOutputQty) || 0;
    return (mix.ingredients || []).map((ing) => {
      const item = itemById.get(ing.itemId);
      const qty =
        ing.basis === 'percentage'
          ? (Number(ing.percentage) || 0) * (producedQty / 100)
          : refQty > 0
            ? (Number(ing.quantity) || 0) * (producedQty / refQty)
            : 0;
      return {
        itemId: ing.itemId,
        quantity: qty,
        unit: item?.unit || '',
        isService: item?.type === 'service',
      };
    });
  };

  // Auto-generate the run form when opened (used by header action too)
  const handleOpenRun = () => {
    setRunForm({
      batchMixId: '',
      producedQuantity: '',
      date: new Date().toISOString().split('T')[0],
      plantUnit: PLANT_UNITS[0],
      notes: '',
      locations: {},
      outputLocation: '',
    });
  };

  /** Location options for an item, mirroring STOCK ADJUSTMENTS: the item's
   *  assigned breakdown rows (legacy items fall back to the CSV list). */
  const itemLocationOptions = (itemId: string) => {
    const item = itemById.get(itemId);
    if (!item) return [];
    const rawLocs = item.locations && item.locations.length > 0
      ? item.locations.map((l) => ({ locationId: l.locationId, locationName: (l.locationName || '').trim(), stock: Number(l.currentStock) || 0 }))
      : (item.stockLocation || '').split(',').map((s) => s.trim()).filter(Boolean)
        .map((name) => ({ locationId: undefined as string | undefined, locationName: name, stock: item.currentStock || 0 }));
    const seen = new Set<string>();
    const opts = [] as Array<{ value: string; label: string; stock: number; sub: string }>;
    for (const l of rawLocs) {
      if (!l.locationName) continue;
      const key = l.locationName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({
        value: l.locationId || l.locationName,
        label: l.locationName,
        stock: l.stock,
        sub: `Available: ${fmtNum(l.stock)} ${item.unit || ''}`,
      });
    }
    return opts;
  };

  /** No pre-selection: every sourcing line starts empty ("Select location")
   *  — the user must actively pick where each qty leaves / lands. */
  const defaultLocationsForMix = (): Record<string, string> => ({});

  const handleOpenCreateMix = () => {
    setMixForm(emptyMixForm());
  };

  const handleOpenEditMix = (mix: BatchMix) => {
    setMixForm({
      id: mix.id,
      outputItemId: mix.outputItemId,
      referenceOutputQty: mix.referenceOutputQty ? String(mix.referenceOutputQty) : '',
      notes: mix.notes || '',
      isActive: mix.isActive !== false,
      ingredients: (mix.ingredients || []).map((ing) => ({
        itemId: ing.itemId,
        basis: ing.basis || 'quantity',
        quantity: ing.quantity !== undefined ? String(ing.quantity) : '',
        percentage: ing.percentage !== undefined ? String(ing.percentage) : '',
      })),
    });
  };

  useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'log-batch') {
        handleOpenRun();
      }
    };
    window.addEventListener('app-header-action', handleHeaderAction);
    return () => window.removeEventListener('app-header-action', handleHeaderAction);
  }, []);

  // ----- Recipe form helpers -----
  const updateMixForm = (patch: Partial<MixFormState>) => {
    if (!mixForm) return;
    setMixForm({ ...mixForm, ...patch });
  };

  const addIngredientRow = () => {
    if (!mixForm) return;
    setMixForm({
      ...mixForm,
      ingredients: [...mixForm.ingredients, { itemId: '', quantity: '', percentage: '' }],
    });
  };

  const removeIngredientRow = (idx: number) => {
    if (!mixForm || mixForm.ingredients.length === 1) return;
    setMixForm({ ...mixForm, ingredients: mixForm.ingredients.filter((_, i) => i !== idx) });
  };

  const changeIngredientRow = (idx: number, field: 'itemId' | 'quantity' | 'percentage' | 'basis', value: string) => {
    if (!mixForm) return;
    const rows = [...mixForm.ingredients];
    const row = { ...rows[idx], [field]: value };
    // Switching a row's sizing basis clears the other field's value — the row
    // carries exactly one sizing number.
    if (field === 'basis') {
      row.quantity = '';
      row.percentage = '';
    }
    rows[idx] = row;
    setMixForm({ ...mixForm, ingredients: rows });
  };

  const validateMixForm = (form: MixFormState): string | null => {
    if (!form.outputItemId) return 'Select the item this mix produces.';
    const hasQtyRows = form.ingredients.some((r) => r.itemId && r.basis === 'quantity');
    if (hasQtyRows && (!Number(form.referenceOutputQty) || Number(form.referenceOutputQty) <= 0)) {
      return 'A positive batch yield (the output of ONE mix) is required while any ingredient is sized by quantity.';
    }
    const seen = new Set<string>();
    for (const row of form.ingredients) {
      if (!row.itemId) continue;
      if (row.itemId === form.outputItemId) return 'A mix cannot consume its own output item.';
      if (seen.has(row.itemId)) return 'The same item is listed more than once — merge the rows.';
      seen.add(row.itemId);
      const val = row.basis === 'quantity' ? Number(row.quantity) : Number(row.percentage);
      if (!row.itemId || !val || val <= 0) return 'Every ingredient row needs an item and a positive quantity/percentage.';
    }
    if (seen.size === 0) return 'Add at least one ingredient item.';
    return null;
  };

  const handleSubmitMix = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mixForm) return;
    const error = validateMixForm(mixForm);
    if (error) {
      alert(error);
      return;
    }
    const payload = {
      // Name is server-derived from the output item (the item identifies the
      // recipe — nothing user-typed to send)
      outputItemId: mixForm.outputItemId,
      referenceOutputQty: Number(mixForm.referenceOutputQty) > 0 ? Number(mixForm.referenceOutputQty) : undefined,
      notes: mixForm.notes.trim() || undefined,
      isActive: mixForm.isActive,
      ingredients: mixForm.ingredients
        .filter((r) => r.itemId)
        .map((r) =>
          r.basis === 'quantity'
            ? { itemId: r.itemId, basis: 'quantity' as const, quantity: Number(r.quantity) }
            : { itemId: r.itemId, basis: 'percentage' as const, percentage: Number(r.percentage) }
        ),
    };
    try {
      if (mixForm.id) {
        localDb.updateBatchMix(mixForm.id, payload);
      } else {
        localDb.addBatchMix(payload);
      }
      if (onRefresh) onRefresh();
      setMixForm(null);
    } catch (err: any) {
      alert(`Failed to save the mix: ${err.message}`);
    }
  };

  // ----- Run form helpers -----
  const updateRunForm = (patch: Partial<RunFormState>) => {
    if (!runForm) return;
    setRunForm({ ...runForm, ...patch });
  };

  /** Recipe change: swap the ingredient set and CLEAR all sourcing picks —
   *  every line starts unselected under the new recipe. */
  const handleRunMixChange = (mixId: string) => {
    setRunForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        batchMixId: mixId,
        locations: defaultLocationsForMix(),
        outputLocation: '',
      };
    });
  };

  const selectedRunMix = runForm ? batchMixes.find((m) => m.id === runForm.batchMixId) || null : null;
  const runProducedQty = runForm ? Number(runForm.producedQuantity) || 0 : 0;
  const runPreview = selectedRunMix ? computeConsumed(selectedRunMix, runProducedQty) : [];

  const handleSubmitRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!runForm) return;
    const mix = batchMixes.find((m) => m.id === runForm.batchMixId);
    if (!mix) {
      alert('Pick the recipe (batch mix) this run is producing.');
      return;
    }
    const qty = Number(runForm.producedQuantity);
    if (!qty || qty <= 0) {
      alert('Specify a positive produced quantity.');
      return;
    }
    const outputItem = itemById.get(mix.outputItemId);
    const outLocOpts = itemLocationOptions(mix.outputItemId);
    const outLocChosen = runForm.outputLocation ? outLocOpts.find((o) => o.value === runForm.outputLocation) || null : null;
    if (outLocOpts.length > 0 && !outLocChosen) {
      alert('Pick the stock location the produced output lands in.');
      return;
    }
    // Sourcing locations for every material line (services keep none).
    const itemLocations = (mix.ingredients || [])
      .filter((ing) => itemById.get(ing.itemId)?.type !== 'service')
      .map((ing) => {
        const chosen = runForm.locations[ing.itemId] || '';
        const opt = itemLocationOptions(ing.itemId).find((o) => o.value === chosen) || null;
        return opt
          ? { itemId: ing.itemId, locationId: opt.value, locationName: opt.label }
          : { itemId: ing.itemId, locationId: undefined, locationName: chosen.trim() || undefined };
      });
    // A material ingredient WITH assigned locations must carry one — the
    // ledger deducts from the chosen bucket only.
    const missingLoc = (mix.ingredients || []).some((ing) => {
      if (itemById.get(ing.itemId)?.type === 'service') return false;
      return itemLocationOptions(ing.itemId).length > 0 && !runForm.locations[ing.itemId];
    });
    if (missingLoc) {
      alert('Pick the stock location each material is consumed from.');
      return;
    }
    try {
      localDb.addProductionBatch({
        batchMixId: mix.id,
        targetQuantity: qty,
        unit: outputItem?.unit || '',
        targetItemId: mix.outputItemId,
        targetItemName: outputItem?.name || '',
        date: runForm.date,
        plantUnit: runForm.plantUnit,
        notes: runForm.notes.trim(),
        itemLocations,
        outputLocationId: outLocChosen?.value,
        outputLocationName: outLocChosen?.label,
      });
      if (onRefresh) onRefresh();
      setRunForm(null);
      setActiveTab('runs');
    } catch (err: any) {
      alert(`Failed to save the run: ${err.message}`);
    }
  };

  // ----- Filtering + KPIs -----
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (searchQuery.trim() && activeTab === 'runs') {
        const q = searchQuery.toLowerCase().trim();
        const mixName = b.mixName?.toLowerCase() || '';
        const outName = itemById.get(b.targetItemId)?.name?.toLowerCase() || b.targetItemName?.toLowerCase() || '';
        if (!b.batchNumber.toLowerCase().includes(q) && !outName.includes(q) && !mixName.includes(q)) return false;
      }
      return true;
    });
  }, [batches, searchQuery, activeTab, itemById]);

  const filteredMixes = useMemo(() => {
    return batchMixes.filter((m) => {
      if (searchQuery.trim() && activeTab === 'recipes') {
        const q = searchQuery.toLowerCase().trim();
        const outName = itemById.get(m.outputItemId)?.name?.toLowerCase() || '';
        if (!m.name.toLowerCase().includes(q) && !outName.includes(q) && !(m.mixNumber || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [batchMixes, searchQuery, activeTab, itemById]);

  const stats = useMemo(() => {
    const totalRuns = batches.length;
    const totalOutputWeight = batches.reduce((sum, b) => sum + (b.targetQuantity || 0), 0);
    const avgBatchSize = totalRuns > 0 ? (totalOutputWeight / totalRuns).toFixed(1) : '0';
    const activeRecipes = batchMixes.filter((m) => m.isActive !== false).length;
    return {
      totalRuns,
      totalOutputWeight: totalOutputWeight.toLocaleString('en-IN', { maximumFractionDigits: 1 }),
      avgBatchSize,
      activeRecipes,
    };
  }, [batches, batchMixes]);

  const handleDeleteMix = (mix: BatchMix) => {
    const usedByRun = batches.some((b) => b.batchMixId === mix.id);
    if (usedByRun) {
      alert('This mix is used by recorded production runs and cannot be deleted — mark it inactive instead.');
      return;
    }
    if (window.confirm(`Delete recipe "${mix.name}"?`)) {
      localDb.deleteBatchMix(mix.id);
      if (onRefresh) onRefresh();
      setViewingMix(null);
    }
  };

  const mixUsageCount = (mixId: string) => batches.filter((b) => b.batchMixId === mixId).length;

  const resolvedConsumedName = (line: { itemId: string; itemName?: string }): string =>
    itemById.get(line.itemId)?.name || line.itemName || line.itemId;

  const resolvedConsumedUnit = (line: { itemId: string; unit?: string }): string =>
    itemById.get(line.itemId)?.unit || line.unit || '';

  return (
    <div className="space-y-6 animate-in fade-in duration-300" id="production-management-container">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[var(--color-surface-container)] rounded-full border border-[var(--color-outline-variant)]">
          {([
            { id: 'runs', label: 'Production Runs', icon: Layers },
            { id: 'recipes', label: 'Batch Mixes', icon: FlaskConical },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                  : 'text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={activeTab === 'recipes' ? handleOpenCreateMix : handleOpenRun}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-95 transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'recipes' ? 'New Batch Mix' : 'Record Production'}
        </button>
      </div>

      {/* KPI Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Batch Runs</p>
            <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{stats.totalRuns} Batches</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Recorded against recipes</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Output Yield</p>
            <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{stats.totalOutputWeight}</p>
            <p className="text-[10px] text-[var(--color-success)] font-medium mt-0.5">Stockpile additions posted</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-success-container)] text-[var(--color-success)] flex items-center justify-center">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Average Batch Size</p>
            <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{stats.avgBatchSize}</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Average output yield per run</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-warning-container)] text-[var(--color-warning)] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Active Batch Mixes</p>
            <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{stats.activeRecipes} Recipes</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Item ratios available for runs</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] flex items-center justify-center">
            <FlaskConical className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-outline)]" />
          <input
            type="text"
            placeholder={activeTab === 'recipes' ? 'Search by output item or number...' : 'Search by batch number, recipe, or output item...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* ===== RECIPES TAB ===== */}
      {activeTab === 'recipes' && (
        filteredMixes.length === 0 ? (
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] p-12 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] flex items-center justify-center mx-auto border border-[var(--color-outline-variant)]">
              <FlaskConical className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">No batch mixes yet</h3>
              <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto mt-1">
                Create a recipe first: pick the item it produces and list its ingredients by quantity (with a batch yield) or by percentage of the produced output.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCreateMix}
              className="mx-auto flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-95"
            >
              <Plus className="w-4 h-4" /> Create the first batch mix
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMixes.map((mix) => {
              const out = itemById.get(mix.outputItemId);
              const inactive = mix.isActive === false;
              const qtyRows = (mix.ingredients || []).some((i) => i.basis === 'quantity');
              return (
                <div
                  key={mix.id}
                  className="p-5 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] hover:border-[var(--color-outline)] hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between"
                  onClick={() => setViewingMix(mix)}
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] flex items-center justify-center text-[var(--color-primary)] font-bold">
                          <FlaskConical className="w-5 h-5" />
                        </div>
                        <div>
                          {/* 2026-11-16: the OUTPUT ITEM's name IS the recipe's
                              identity — no separate user-typed title */}
                          <h4 className="font-bold text-[var(--color-on-surface)] text-xs line-clamp-1">{out?.name || mix.name || '(missing item)'}</h4>
                          <p className="text-[10px] text-[var(--color-on-surface-variant)] font-mono mt-0.5">{mix.mixNumber}</p>
                        </div>
                      </div>
                      {inactive && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]">INACTIVE</span>
                      )}
                    </div>

                    <div className="p-3 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)] space-y-2 mb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase">Produces</span>
                        <span className="text-xs font-black text-[var(--color-success)] flex items-center gap-1">
                          {qtyRows > 0 ? `${fmtNum(mix.referenceOutputQty)} ${out?.unit || ''}` : 'per run'}
                        </span>
                      </div>
                      {/* The actual ingredient items, by name */}
                      <div className="border-t border-[var(--color-outline-variant)] pt-2">
                        <span className="block text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-1">Ingredients</span>
                        <span className="block text-[10px] font-bold text-[var(--color-on-surface)] leading-relaxed line-clamp-3">
                          {(mix.ingredients || []).map((ing) => itemById.get(ing.itemId)?.name || ing.itemId).join(' · ') || '—'}
                        </span>
                      </div>
                    </div>
                    {/* DONE-BY AUDIT (2026-11-21) */}
                    <div className="text-[10px] text-[var(--color-on-surface-variant)]">
                      Added by <strong className="text-[var(--color-on-surface)]">{mix.createdByName || 'Unknown'}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--color-outline-variant)] mt-1">
                    <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold">
                      Used by {mixUsageCount(mix.id)} run{mixUsageCount(mix.id) === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditMix(mix);
                      }}
                      title="Edit mix"
                      className="p-1.5 text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ===== RUNS TAB ===== */}
      {activeTab === 'runs' && (
        filteredBatches.length === 0 ? (
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] p-12 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] flex items-center justify-center mx-auto border border-[var(--color-outline-variant)]">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">No production runs found</h3>
              <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto mt-1">
                Pick a batch mix and enter how much was produced — ingredient stock is deducted and the output added automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenRun}
              className="mx-auto flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-95"
            >
              <Plus className="w-4 h-4" /> Record a production run
            </button>
          </div>
        ) : (
          // Same single-card table shape as the other features' lists (wrapped
          // in a plain div — never overflow-x-auto, a nested scroll container
          // breaks the sticky top-16 thead).
          <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl overflow-clip shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-16 z-20">
                <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Batch #</th>
                  <th className="py-3.5 px-3">Output Item</th>
                  <th className="py-3.5 px-3">Batch Mix</th>
                  <th className="py-3.5 px-3">Plant Unit</th>
                  <th className="py-3.5 px-4 text-right">Batch Output</th>
                  {/* DONE-BY AUDIT (2026-11-21): acting user resolved from the users master */}
                  <th className="py-3.5 px-3">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
                {filteredBatches.map((batch) => {
                  const mix = batchMixes.find((m) => m.id === batch.batchMixId);
                  return (
                    <tr
                      key={batch.id}
                      onClick={() => setViewingBatch(batch)}
                      className="hover:bg-[var(--color-surface-container-high)]/40 transition-colors cursor-pointer text-xs"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <PackagePlus className="w-3.5 h-3.5 text-[var(--color-success)] shrink-0" />
                          <span className="font-bold text-[var(--color-on-surface)] font-mono">{batch.batchNumber}</span>
                        </div>
                        <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">{batch.date}</p>
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-[var(--color-on-surface)]">
                        {itemById.get(batch.targetItemId)?.name || batch.targetItemName}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center gap-1 max-w-[220px]">
                          <FlaskConical className="w-3 h-3 shrink-0 text-[var(--color-primary)]" />
                          <span className="font-semibold text-[var(--color-on-surface)] truncate">{mix?.name || '—'}</span>
                        </span>
                        <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">{mix?.mixNumber || ''}</p>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] truncate max-w-[200px]">
                          {batch.plantUnit || 'Production floor'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-[var(--color-on-surface)]">
                        {fmtNum(batch.targetQuantity)} {batch.unit}
                      </td>
                      <td className="py-3.5 px-3 text-[11px] font-medium text-[var(--color-on-surface)]">
                        {batch.createdByName || <span className="italic text-[var(--color-outline)]">Unknown</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ===== CREATE / EDIT BATCH MIX MODAL ===== */}
      {mixForm && (
        <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-on-surface)]">{mixForm.id ? 'Edit Batch Mix (Recipe)' : 'New Batch Mix (Recipe)'}</h3>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                    A recipe: the item it produces + ingredient items sized by quantity or by percentage of the produced output.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMixForm(null)}
                className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmitMix} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Identity — 2026-11-16: no separate mix name; the OUTPUT ITEM
                  identifies the recipe (the item's name shows on the card) */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Output Item (What one mix produces — also the recipe's name)</label>
                <div className="px-4 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full">
                  <SearchableSelect
                    options={mixFormItemOptions}
                    value={mixForm.outputItemId}
                    onChange={(v) => updateMixForm({ outputItemId: v })}
                    placeholder="Type to search inventory items..."
                  />
                </div>
              </div>

              {/* One-mix yield — anchors the quantity-sized rows */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase whitespace-nowrap">One mix yields</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 100"
                    value={mixForm.referenceOutputQty}
                    onChange={(e) => updateMixForm({ referenceOutputQty: e.target.value })}
                    className="w-28 px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <span className="text-xs font-bold text-[var(--color-outline)]">
                    {itemById.get(mixForm.outputItemId)?.unit || ''}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                  Needed while any ingredient is sized by quantity — a run of X scales those rows by (X ÷ yield). Percent-sized rows ignore it.
                </p>
              </div>

              {/* Ingredients — sizing toggles PER ROW (bitumen in % and LDO in
                  MT mix freely on one recipe; Live Stock is kept out of this
                  editor — it belongs to the run preview) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">Ingredient Items</h4>
                  <button
                    type="button"
                    onClick={addIngredientRow}
                    className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-primary)] hover:opacity-80"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Ingredient
                  </button>
                </div>

                <div className="border border-[var(--color-outline-variant)] rounded-2xl overflow-hidden bg-[var(--color-surface-container-lowest)] shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase text-[10px] border-b border-[var(--color-outline-variant)]">
                        <th className="py-2.5 px-3">Item</th>
                        <th className="py-2.5 px-3 w-36">Sizing</th>
                        <th className="py-2.5 px-3 w-36">Value</th>
                        <th className="py-2.5 px-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-outline-variant)]">
                      {mixForm.ingredients.map((row, idx) => {
                        const item = itemById.get(row.itemId);
                        const isDup = row.itemId && mixForm.ingredients.filter((r) => r.itemId === row.itemId).length > 1;
                        const isSelf = row.itemId && row.itemId === mixForm.outputItemId;
                        return (
                          <tr key={idx} className="hover:bg-[var(--color-surface-container)]/50">
                            <td className="py-2 px-3 min-w-[200px]">
                              <SearchableSelect
                                options={itemOptions.filter((o) => o.value !== mixForm.outputItemId || o.value === row.itemId)}
                                value={row.itemId}
                                onChange={(v) => changeIngredientRow(idx, 'itemId', v)}
                                placeholder="Choose ingredient..."
                              />
                              {isDup && (
                                <div className="text-[9px] text-[var(--color-warning)] font-bold mt-0.5">Item listed twice</div>
                              )}
                              {isSelf && (
                                <div className="text-[9px] text-[var(--color-error)] font-bold mt-0.5 flex items-center gap-0.5">
                                  <AlertCircle className="w-3 h-3" /> Cannot consume the output item
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-0.5 p-0.5 bg-[var(--color-surface-container)] rounded-full border border-[var(--color-outline-variant)] w-fit">
                                <button
                                  type="button"
                                  onClick={() => changeIngredientRow(idx, 'basis', 'quantity')}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${row.basis === 'quantity' ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]' : 'text-[var(--color-on-surface-variant)]'}`}
                                >
                                  Qty
                                </button>
                                <button
                                  type="button"
                                  onClick={() => changeIngredientRow(idx, 'basis', 'percentage')}
                                  className={`flex items-center gap-0.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${row.basis === 'percentage' ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]' : 'text-[var(--color-on-surface-variant)]'}`}
                                >
                                  <Percent className="w-3 h-3" />%
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="any"
                                  required
                                  placeholder={row.basis === 'quantity' ? '0.00' : 'e.g. 5'}
                                  value={row.basis === 'quantity' ? row.quantity : row.percentage}
                                  onChange={(e) => changeIngredientRow(idx, row.basis === 'quantity' ? 'quantity' : 'percentage', e.target.value)}
                                  className="w-full border-b border-transparent focus:border-[var(--color-primary)] font-bold text-[var(--color-on-surface)] focus:outline-none"
                                />
                                {row.basis === 'quantity' && item && <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">{item.unit}</span>}
                                {row.basis === 'percentage' && <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">%</span>}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                disabled={mixForm.ingredients.length === 1}
                                onClick={() => removeIngredientRow(idx)}
                                className="p-1 text-[var(--color-error)] hover:bg-[var(--color-error-container)] disabled:opacity-30 rounded-full transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                  Total of %-sized rows:{' '}
                  <span className={`font-bold ${Math.abs(mixForm.ingredients.filter((r) => r.basis === 'percentage').reduce((s, r) => s + (Number(r.percentage) || 0), 0) - 100) < 0.01 ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                    {fmtNum(mixForm.ingredients.filter((r) => r.basis === 'percentage').reduce((s, r) => s + (Number(r.percentage) || 0), 0))}%
                  </span>{' '}
                  — percentages need not sum to exactly 100 if the mix yields over/under.
                </p>
              </div>

              {/* Notes + Active */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Remarks / Notes</label>
                  <textarea
                    rows={2}
                    value={mixForm.notes}
                    onChange={(e) => updateMixForm({ notes: e.target.value })}
                    placeholder="e.g. aggregate grading, binder grade, lab trial references..."
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mixForm.isActive}
                      onChange={(e) => updateMixForm({ isActive: e.target.checked })}
                      className="w-4 h-4 accent-[var(--color-primary)]"
                    />
                    <span className="text-xs font-semibold text-[var(--color-on-surface)]">Active (pickable for runs)</span>
                  </label>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => setMixForm(null)}
                  className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95 transition-all shadow-xs"
                >
                  {mixForm.id ? 'Save Mix Changes' : 'Create Batch Mix'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== RECORD PRODUCTION RUN MODAL ===== */}
      {runForm && (
        <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Record Production Run</h3>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                    Locked to the recipe — saving the run deducts every ingredient and adds the output to stock automatically.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRunForm(null)}
                className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmitRun} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Batch Mix (Recipe)</label>
                  <div className="px-4 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full">
                    <SearchableSelect
                      options={mixOptions}
                      value={runForm.batchMixId}
                      onChange={(v) => updateRunForm({ batchMixId: v })}
                      placeholder="Type to search batch mixes..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Production Date</label>
                  <input
                    type="date"
                    required
                    value={runForm.date}
                    onChange={(e) => updateRunForm({ date: e.target.value })}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>

              {/* Recipe summary + produced quantity */}
              {selectedRunMix && (
                <div className="p-4 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-xs font-black text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                      <PackagePlus className="w-4 h-4 text-[var(--color-success)]" /> Output
                    </h4>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase whitespace-nowrap">Produced Quantity</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 100"
                        value={runForm.producedQuantity}
                        onChange={(e) => updateRunForm({ producedQuantity: e.target.value })}
                        className="w-28 px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                      <span className="text-xs font-bold text-[var(--color-outline)]">
                        {itemById.get(selectedRunMix.outputItemId)?.unit || ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-extrabold text-[var(--color-on-surface)]">
                      {itemById.get(selectedRunMix.outputItemId)?.name || '(missing item)'}
                    </span>
                    <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold">
                      Recipe-locked — quantity rows scale by the one-mix yield ({fmtNum(selectedRunMix.referenceOutputQty)}), %-rows consume their % of this run
                    </span>
                  </div>

                  {/* Output landing location — the produced lot's stock bucket */}
                  {itemLocationOptions(selectedRunMix.outputItemId).length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase whitespace-nowrap">Output lands in</label>
                      <div className="flex-1 px-3 py-1 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full">
                        <SearchableSelect
                          options={itemLocationOptions(selectedRunMix.outputItemId)}
                          value={runForm.outputLocation}
                          onChange={(v) => updateRunForm({ outputLocation: v })}
                          placeholder="Select location"
                        />
                      </div>
                    </div>
                  )}

                  {/* Consumed preview — locked to the recipe. Each material
                      line is sourced from a chosen stock location. */}
                  <div className="border border-[var(--color-outline-variant)] rounded-xl overflow-hidden bg-[var(--color-surface-container-lowest)]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase text-[10px] border-b border-[var(--color-outline-variant)]">
                          <th className="py-2 px-3">Item</th>
                          <th className="py-2 px-3">Live Stock</th>
                          <th className="py-2 px-3">Take From Location</th>
                          <th className="py-2 px-3 w-28">Will Consume</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-outline-variant)]">
                        {selectedRunMix.ingredients.map((ing) => {
                          const item = itemById.get(ing.itemId);
                          const line = runPreview.find((l) => l.itemId === ing.itemId);
                          const isService = item?.type === 'service';
                          const locOpts = itemLocationOptions(ing.itemId);
                          const chosenLoc = runForm.locations[ing.itemId] || '';
                          const chosenOpt = locOpts.find((o) => o.value === chosenLoc) || null;
                          // Shortage is judged against the SOURCED location's
                          // stock (that is the bucket the deduction hits).
                          const avail = chosenOpt ? chosenOpt.stock : (item?.currentStock || 0);
                          const isShort = item && !isService && avail < (line?.quantity || 0);
                          return (
                            <tr key={ing.itemId}>
                              <td className="py-2 px-3 font-medium text-[var(--color-on-surface)]">
                                {item?.name || '(missing item)'} {isService && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">Service</span>}
                              </td>
                              <td className="py-2 px-3 font-bold text-[var(--color-on-surface-variant)]">
                                {isService ? 'No stock' : `${fmtNum(item?.currentStock)} ${item?.unit || ''}`}
                              </td>
                              <td className="py-2 px-3">
                                {isService ? (
                                  <span className="text-[10px] italic text-[var(--color-outline)]">Not stocked</span>
                                ) : locOpts.length === 0 ? (
                                  <span className="text-[10px] italic text-[var(--color-on-surface-variant)]">No assigned locations</span>
                                ) : (
                                  <div className="min-w-44">
                                    <div className="px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full">
                                      <SearchableSelect
                                        options={locOpts}
                                        value={chosenLoc}
                                        onChange={(v) => updateRunForm({ locations: { ...runForm.locations, [ing.itemId]: v } })}
                                        placeholder="Select location"
                                      />
                                    </div>
                                    {chosenOpt && (
                                      <p className={`text-[9px] font-bold mt-1 ${isShort ? 'text-[var(--color-error)]' : 'text-[var(--color-on-surface-variant)]'}`}>
                                        At this location: {fmtNum(chosenOpt.stock)} {item?.unit || ''}
                                        {isShort ? ` — short by ${fmtNum((line?.quantity || 0) - chosenOpt.stock, 4)} ${item?.unit || ''}` : ''}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className={`py-2 px-3 font-black ${isShort ? 'text-[var(--color-error)]' : 'text-[var(--color-on-surface)]'}`}>
                                {line ? `−${fmtNum(line.quantity, 4)} ${line.unit}` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {runProducedQty > 0 && runPreview.some((l) => !l.isService) && (
                    <p className="text-[10px] font-bold text-[var(--color-warning)] flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Quantities below scale automatically on save — stock may go negative if not enough is available.
                    </p>
                  )}
                </div>
              )}

              {/* Extra specs — 2026-11-16: the Plant Unit / Location selector
                  left the record-run modal (the plant context lives behind the
                  run's notes when ever needed); rows keep their stored value */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Remarks / Quality Lab Reports</label>
                <textarea
                  rows={2}
                  value={runForm.notes}
                  onChange={(e) => updateRunForm({ notes: e.target.value })}
                  placeholder="e.g. Bitumen binder percentage, aggregate grading check, moisture percentage remarks..."
                  className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              {/* Notice */}
              <div className="p-3.5 bg-[var(--color-success-container)] border border-[var(--color-success)]/20 rounded-2xl text-[11px] text-[var(--color-on-success-container)] flex items-start gap-2.5">
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0 text-[var(--color-success)]" />
                <div>
                  <span className="font-bold">Recipe-locked ledger posting:</span> consumption quantities come from the recipe — inputs leave their FIFO lots at actual cost and the output lot is valued at exactly what this run consumed.
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => setRunForm(null)}
                  className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95 transition-all shadow-xs"
                >
                  Post Run & Move Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== VIEW MIX MODAL ===== */}
      {viewingMix && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-primary-container)] text-[var(--color-primary)]">
                    {viewingMix.mixNumber}
                  </span>
                  {viewingMix.isActive === false && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">INACTIVE</span>
                  )}
                </div>
                {/* 2026-11-16: the recipe's identity IS the output item's name */}
                <h2 className="text-sm font-black text-[var(--color-on-surface)]">
                  {itemById.get(viewingMix.outputItemId)?.name || viewingMix.name || '(missing item)'}
                </h2>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                  Used by {mixUsageCount(viewingMix.id)} production run{mixUsageCount(viewingMix.id) === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={() => setViewingMix(null)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-4 border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-success-container)]/30 space-y-1">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-success)]">Produces</h4>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-mono font-bold text-[var(--color-on-surface-variant)]">
                    {itemById.get(viewingMix.outputItemId)?.code || '—'}
                  </span>
                  <span className="text-sm font-black text-[var(--color-success)]">
                    {viewingMix.ingredients.some((i) => (i.basis || 'quantity') === 'quantity')
                      ? `${fmtNum(viewingMix.referenceOutputQty)} ${itemById.get(viewingMix.outputItemId)?.unit || ''} / mix`
                      : 'per run'}
                  </span>
                </div>
              </div>

              <div className="p-4 border border-[var(--color-outline-variant)] rounded-xl bg-[var(--color-surface-container-lowest)] space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface)]">Ingredients</h4>
                </div>
                {viewingMix.ingredients.length > 0 ? (
                  viewingMix.ingredients.map((ing) => {
                    const item = itemById.get(ing.itemId);
                    return (
                      <div key={ing.id || ing.itemId} className="flex justify-between items-center p-2 hover:bg-[var(--color-surface-container)] rounded-lg text-xs">
                        <div className="flex items-center gap-2 flex-1 pr-2">
                          <span className="font-medium text-[var(--color-on-surface)] line-clamp-1">
                            {item?.name || ing.itemId}
                          </span>
                          {item?.type === 'service' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">
                              Service
                            </span>
                          )}
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${(ing.basis || 'quantity') === 'percentage' ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]'}`}>
                            {(ing.basis || 'quantity') === 'percentage' ? '% of output' : 'per mix'}
                          </span>
                        </div>
                        <span className="font-bold shrink-0 text-[var(--color-error)]">
                          −{(ing.basis || 'quantity') === 'percentage'
                            ? `${fmtNum(ing.percentage, 4)}%`
                            : `${fmtNum(ing.quantity, 4)} ${item?.unit || ''}`}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-[var(--color-outline)] italic py-1 pl-1">No ingredients recorded.</div>
                )}
              </div>

              {viewingMix.notes && (
                <div className="p-3 bg-[var(--color-warning-container)] border border-[var(--color-warning)]/30 rounded-xl">
                  <p className="text-[10px] font-bold text-[var(--color-on-warning-container)] uppercase flex items-center gap-1 mb-1">
                    <FileText className="w-3 h-3" /> Recipe Notes
                  </p>
                  <p className="text-xs text-[var(--color-on-warning-container)] whitespace-pre-line leading-relaxed">{viewingMix.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-between items-center">
              <button
                onClick={() => handleDeleteMix(viewingMix)}
                className="px-4 py-2 text-xs font-bold text-[var(--color-error)] hover:bg-[var(--color-error-container)] rounded-full transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete recipe
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleOpenEditMix(viewingMix);
                    setViewingMix(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-container)] rounded-full transition-colors flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => setViewingMix(null)}
                  className="px-6 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold rounded-full hover:opacity-95 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== VIEW RUN DETAIL MODAL ===== */}
      {viewingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-primary-container)] text-[var(--color-primary)]">
                    {viewingBatch.batchNumber}
                  </span>
                  <span className="text-[11px] text-[var(--color-on-surface-variant)] font-medium flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {viewingBatch.date}
                  </span>
                </div>
                <h2 className="text-sm font-black text-[var(--color-on-surface)]">
                  {itemById.get(viewingBatch.targetItemId)?.name || viewingBatch.targetItemName}
                </h2>
              </div>
              <button
                onClick={() => setViewingBatch(null)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl">
                  <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">Recipe</p>
                  <p className="text-xs font-semibold text-[var(--color-on-surface)]">
                    {batchMixes.find((m) => m.id === viewingBatch.batchMixId)?.name || '—'}
                  </p>
                </div>
              </div>

              {/* Material Produced Output */}
              <div className="p-4 border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-success-container)]/30 space-y-1">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-success)]">Yield Output Stock Addition</h4>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-extrabold text-[var(--color-on-surface)]">
                    {itemById.get(viewingBatch.targetItemId)?.name || viewingBatch.targetItemName}
                  </span>
                  <span className="text-sm font-black text-[var(--color-success)]">
                    +{fmtNum(viewingBatch.targetQuantity)} {viewingBatch.unit}
                  </span>
                </div>
                {viewingBatch.outputRate !== undefined && viewingBatch.outputRate > 0 && (
                  <div className="flex justify-between items-center border-t border-[var(--color-success)]/20 pt-1.5 mt-1">
                    <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Costed at (actual consumed)</span>
                    <span className="text-[11px] font-black text-[var(--color-on-surface)]">
                      ₹{fmtNum(viewingBatch.outputRate)}/{viewingBatch.unit}
                      {viewingBatch.outputValue ? <span className="text-[var(--color-on-surface-variant)] font-medium"> · ₹{fmtNum(viewingBatch.outputValue)} total</span> : null}
                    </span>
                  </div>
                )}
              </div>

              {/* Raw Materials & Services Consumed */}
              <div className="p-4 border border-[var(--color-outline-variant)] rounded-xl bg-[var(--color-surface-container-lowest)] space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface)]">Consumed Materials & Services</h4>
                <div className="space-y-2">
                  {viewingBatch.rawMaterialsConsumed?.length > 0 ? (
                    viewingBatch.rawMaterialsConsumed.map((mat, idx) => {
                      const item = itemById.get(mat.itemId);
                      const isService = item?.type === 'service';
                      // Live-resolve the sourcing location (FK → master
                      // breakdown name); the stored name is the issued snapshot.
                      const locName = mat.locationName || undefined;
                      return (
                        <div key={idx} className="flex justify-between items-center p-2 hover:bg-[var(--color-surface-container)] rounded-lg text-xs">
                          <div className="flex items-center gap-2 flex-1 pr-2">
                            <span className="font-medium text-[var(--color-on-surface)] line-clamp-1">{resolvedConsumedName(mat)}</span>
                            {isService && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">Service / Equipment</span>
                            )}
                            {locName && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]">
                                from {locName}
                              </span>
                            )}
                            {mat.percentage !== undefined && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[var(--color-primary-container)] text-[var(--color-primary)]">
                                {fmtNum(mat.percentage)}% of output
                              </span>
                            )}
                          </div>
                          <span className={`font-bold shrink-0 ${isService ? 'text-[var(--color-primary)]' : 'text-[var(--color-error)]'}`}>
                            {isService ? '' : '−'}{fmtNum(mat.quantity, 4)} {resolvedConsumedUnit(mat)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-[var(--color-outline)] italic py-1 pl-1">No material or service consumptions recorded for this run.</div>
                  )}
                </div>
              </div>

              {viewingBatch.notes && (
                <div className="p-3 bg-[var(--color-warning-container)] border border-[var(--color-warning)]/30 rounded-xl">
                  <p className="text-[10px] font-bold text-[var(--color-on-warning-container)] uppercase flex items-center gap-1 mb-1">
                    <FileText className="w-3 h-3" /> QC Lab Remarks & Notes
                  </p>
                  <p className="text-xs text-[var(--color-on-warning-container)] whitespace-pre-line leading-relaxed">{viewingBatch.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end items-center">
              <button
                onClick={() => setViewingBatch(null)}
                className="px-6 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold rounded-full hover:opacity-95 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
