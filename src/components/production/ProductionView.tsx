import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Filter,
  FileText,
  Trash2,
  Calendar,
  Layers,
  X,
  AlertCircle,
  Thermometer,
  User,
  PlusCircle,
  Database,
  CheckCircle2,
  Scale,
  Settings,
} from 'lucide-react';
import { ProductionBatchRun, Item, CompanySettings, StockMovementLog } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

interface ProductionViewProps {
  batches: ProductionBatchRun[];
  items: Item[];
  settings: CompanySettings;
  onRefresh?: () => void;
}

export const ProductionView: React.FC<ProductionViewProps> = ({
  batches,
  items,
  settings,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingBatch, setViewingBatch] = useState<ProductionBatchRun | null>(null);
  
  // Create Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Form State
  const [formBatchNumber, setFormBatchNumber] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPlantUnit, setFormPlantUnit] = useState('Asphalt Batching Plant #1 (160 TPH)');
  const [formTargetItemId, setFormTargetItemId] = useState('');
  const [formTargetQuantity, setFormTargetQuantity] = useState('');
  const [formSupervisor, setFormSupervisor] = useState('');
  const [formMixTemp, setFormMixTemp] = useState('');
  const [formNotes, setFormNotes] = useState('');
  
  // Consumed ingredients form state: array of { itemId, quantity }
  const [formIngredients, setFormIngredients] = useState<Array<{ itemId: string; quantity: string }>>([
    { itemId: '', quantity: '' },
  ]);

  // List of active items (products & services) for production dropdowns
  const availableItems = useMemo(() => {
    return items.filter((i) => i.isActive);
  }, [items]);

  // Auto-generate realistic batch number when form opens
  const handleOpenCreate = () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = String(batches.length + 1).padStart(3, '0');
    setFormBatchNumber(`BTN-${today}-${rand}`);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormPlantUnit('Asphalt Batching Plant #1 (160 TPH)');
    setFormTargetItemId('');
    setFormTargetQuantity('');
    setFormSupervisor('');
    setFormMixTemp('');
    setFormNotes('');
    setFormIngredients([{ itemId: '', quantity: '' }]);
    setIsFormOpen(true);
  };

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'log-batch') {
        handleOpenCreate();
      }
    };
    window.addEventListener('app-header-action', handleHeaderAction);
    return () => window.removeEventListener('app-header-action', handleHeaderAction);
  }, [batches.length]);

  // Add a raw material consumption row
  const handleAddIngredientRow = () => {
    setFormIngredients([...formIngredients, { itemId: '', quantity: '' }]);
  };

  // Remove a raw material row
  const handleRemoveIngredientRow = (idx: number) => {
    if (formIngredients.length === 1) return;
    setFormIngredients(formIngredients.filter((_, i) => i !== idx));
  };

  // Handle single row selection/quantity change for raw materials
  const handleIngredientChange = (idx: number, field: 'itemId' | 'quantity', value: string) => {
    const updated = [...formIngredients];
    updated[idx][field] = value;
    setFormIngredients(updated);
  };

  // Save the production run
  const handleSubmitBatch = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formTargetItemId) {
      alert('Please select a product to produce.');
      return;
    }

    const targetQty = Number(formTargetQuantity);
    if (!targetQty || targetQty <= 0) {
      alert('Please specify a positive production quantity.');
      return;
    }

    // Filter and map raw materials
    const validIngredients = formIngredients.filter((ing) => ing.itemId && Number(ing.quantity) > 0);
    
    // Warn but allow if no raw materials specified (e.g. crusher running from bulk raw quarries)
    const proceed = validIngredients.length > 0 || window.confirm('No raw material consumptions have been specified. Proceed anyway?');
    if (!proceed) return;

    const targetItem = availableItems.find((p) => p.id === formTargetItemId)!;

    const payloadRawMaterials = validIngredients.map((ing) => {
      const prod = availableItems.find((p) => p.id === ing.itemId)!;
      return {
        itemId: ing.itemId,
        itemName: prod.name,
        quantity: Number(ing.quantity),
        unit: prod.unit,
      };
    });

    const payload = {
      batchNumber: formBatchNumber.trim(),
      date: formDate,
      plantUnit: formPlantUnit,
      targetItemId: formTargetItemId,
      targetItemName: targetItem.name,
      targetQuantity: targetQty,
      unit: targetItem.unit,
      rawMaterialsConsumed: payloadRawMaterials,
      supervisorName: formSupervisor.trim() || 'Operations Duty Lead',
      mixTemperatureCelsius: formMixTemp ? Number(formMixTemp) : undefined,
      notes: formNotes.trim(),
    };

    try {
      localDb.addProductionBatch(payload);
      if (onRefresh) onRefresh();
      setIsFormOpen(false);
    } catch (err: any) {
      alert(`Failed to save batch run: ${err.message}`);
    }
  };

  // Filter batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = b.targetItemName.toLowerCase().includes(q);
        const matchBatch = b.batchNumber.toLowerCase().includes(q);
        const matchPlant = b.plantUnit.toLowerCase().includes(q);
        if (!matchName && !matchBatch && !matchPlant) return false;
      }
      return true;
    });
  }, [batches, searchQuery]);

  // Calculations for KPI Banner
  const stats = useMemo(() => {
    const totalRuns = batches.length;
    let totalOutputWeight = 0;
    const plantUnitsSet = new Set<string>();

    batches.forEach((b) => {
      totalOutputWeight += b.targetQuantity;
      plantUnitsSet.add(b.plantUnit);
    });

    const avgBatchSize = totalRuns > 0 ? (totalOutputWeight / totalRuns).toFixed(1) : '0';

    return {
      totalRuns,
      totalOutputWeight: totalOutputWeight.toLocaleString('en-IN', { maximumFractionDigits: 1 }),
      avgBatchSize,
      activePlantsCount: plantUnitsSet.size,
    };
  }, [batches]);

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this production batch run? Note: Stock levels will NOT be reversed automatically when deleting historical logs.')) {
      localDb.deleteProductionBatch(id);
      if (onRefresh) onRefresh();
      setViewingBatch(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300" id="production-management-container">
      {/* Top Action Bar */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          id="btn-record-production"
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-95 transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Record Production Batch
        </button>
      </div>

      {/* KPI Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Batch Runs</p>
            <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{stats.totalRuns} Batches</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Physical mix cycles registered</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Output Yield</p>
            <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{stats.totalOutputWeight} MT</p>
            <p className="text-[10px] text-[var(--color-success)] font-medium mt-0.5">Stockpile additions posted</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-success-container)] text-[var(--color-success)] flex items-center justify-center">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Average Batch Size</p>
            <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{stats.avgBatchSize} MT</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Average output yield per run</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-warning-container)] text-[var(--color-warning)] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Active Plant Units</p>
            <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{stats.activePlantsCount} Sites</p>
            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Designated production centers</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-outline)]" />
          <input
            type="text"
            placeholder="Search by batch number, mix name, or plant unit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div className="text-xs text-[var(--color-success)] font-bold bg-[var(--color-success-container)] border border-[var(--color-success)]/20 px-4 py-1.5 rounded-full flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Live stock levels automatically decrement & increment on confirm.
        </div>
      </div>

      {/* Grid List */}
      {filteredBatches.length === 0 ? (
        <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] flex items-center justify-center mx-auto border border-[var(--color-outline-variant)]">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">No production batch logs found</h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto mt-1">
              Click the "Record Production Batch" button to declare a plant yield and deduct raw ingredients instantly.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBatches.map((batch) => (
            <div
              key={batch.id}
              className="p-5 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] hover:border-[var(--color-outline)] hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between"
              onClick={() => setViewingBatch(batch)}
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] flex items-center justify-center text-[var(--color-primary)] font-bold">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-[var(--color-on-surface)] text-xs line-clamp-1">{batch.targetItemName}</h4>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] font-mono mt-0.5">{batch.batchNumber}</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)] space-y-2 mb-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase">Batch Output</span>
                    <span className="text-xs font-black text-[var(--color-on-surface)]">
                      {batch.targetQuantity.toLocaleString('en-IN')} {batch.unit}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-[var(--color-outline-variant)] pt-2">
                    <span className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase">Production Date</span>
                    <span className="text-[10px] font-bold text-[var(--color-on-surface)]">{batch.date}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-[var(--color-outline-variant)] mt-1">
                <span className="px-2.5 py-0.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded text-[10px] font-bold truncate max-w-[120px]">
                  {batch.plantUnit}
                </span>
                {batch.mixTemperatureCelsius && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-[var(--color-error)]">
                    <Thermometer className="w-3.5 h-3.5" />
                    {batch.mixTemperatureCelsius}°C
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- CREATE PRODUCTION BATCH RUN MODAL --- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Declare Production Batch run</h3>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                    Specifying yields generates automated additions to your silo stockpiles and deductions from consumed ingredients.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmitBatch} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Plant Meta Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Batch Run Ref #</label>
                  <input
                    type="text"
                    required
                    value={formBatchNumber}
                    onChange={(e) => setFormBatchNumber(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Production Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Plant Unit / Location</label>
                  <select
                    value={formPlantUnit}
                    onChange={(e) => setFormPlantUnit(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <option value="Asphalt Batching Plant #1 (160 TPH)">Asphalt Batching Plant #1 (160 TPH)</option>
                    <option value="Aggregate Pugmill Mixer #3">Aggregate Pugmill Mixer #3</option>
                    <option value="Stone Crusher Screening Unit #2">Stone Crusher Screening Unit #2</option>
                    <option value="Bulk Storage Silo Area A">Bulk Storage Silo Area A</option>
                  </select>
                </div>
              </div>

              {/* What is to be Produced */}
              <div className="p-4 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl space-y-3">
                <h4 className="text-xs font-black text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-[var(--color-primary)]" /> Output Item (What is to be produced)
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Target Product / Mix</label>
                    <select
                      required
                      value={formTargetItemId}
                      onChange={(e) => setFormTargetItemId(e.target.value)}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    >
                      <option value="">-- Choose Target Output (Product or Service) --</option>
                      {availableItems.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} [{p.code}] ({p.type === 'service' ? 'Service' : 'Product'}) — Stock: {p.currentStock || 0} {p.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Produced Quantity Yield</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 150"
                        value={formTargetQuantity}
                        onChange={(e) => setFormTargetQuantity(e.target.value)}
                        className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] pr-12"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-outline)]">
                        {availableItems.find((p) => p.id === formTargetItemId)?.unit || 'MT'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* What is to be Consumed */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" /> Consumed Raw Materials & Services (What is used)
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddIngredientRow}
                    className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-primary)] hover:opacity-80"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Add Consumed Row
                  </button>
                </div>

                <div className="border border-[var(--color-outline-variant)] rounded-2xl overflow-hidden bg-[var(--color-surface-container-lowest)] shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase text-[10px] border-b border-[var(--color-outline-variant)]">
                        <th className="py-2.5 px-3">Input Item (Product or Service)</th>
                        <th className="py-2.5 px-3">Live Stock / Balance</th>
                        <th className="py-2.5 px-3 w-40">Consumed Qty</th>
                        <th className="py-2.5 px-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-outline-variant)]">
                      {formIngredients.map((row, idx) => {
                        const selectedIng = availableItems.find((p) => p.id === row.itemId);
                        const isUnderStock = selectedIng && selectedIng.type === 'product' && (selectedIng.currentStock || 0) < (Number(row.quantity) || 0);

                        return (
                          <tr key={idx} className="hover:bg-[var(--color-surface-container)]/50">
                            {/* Raw Item Selector */}
                            <td className="py-2 px-3">
                              <select
                                required
                                value={row.itemId}
                                onChange={(e) => handleIngredientChange(idx, 'itemId', e.target.value)}
                                className="w-full bg-transparent focus:outline-none font-medium text-[var(--color-on-surface)]"
                              >
                                <option value="">-- Choose Input Raw Material or Service --</option>
                                {availableItems.map((p) => (
                                  <option key={p.id} value={p.id} disabled={p.id === formTargetItemId}>
                                    {p.name} [{p.code}] ({p.type === 'service' ? 'Service' : 'Product'}) {p.id === formTargetItemId ? '(Cannot consume itself)' : ''}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Live stockpile levels */}
                            <td className="py-2 px-3">
                              {selectedIng ? (
                                <span className={`font-bold ${isUnderStock ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
                                  {selectedIng.type === 'service' ? 'Service (No Stock)' : `${(selectedIng.currentStock || 0).toLocaleString('en-IN')} ${selectedIng.unit}`}
                                </span>
                              ) : (
                                <span className="text-[var(--color-outline)] font-mono">—</span>
                              )}
                            </td>

                            {/* Quantity Consumed */}
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="any"
                                  required
                                  placeholder="0.00"
                                  value={row.quantity}
                                  onChange={(e) => handleIngredientChange(idx, 'quantity', e.target.value)}
                                  className="w-full border-b border-transparent focus:border-[var(--color-primary)] font-bold text-[var(--color-on-surface)] focus:outline-none"
                                />
                                {selectedIng && <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">{selectedIng.unit}</span>}
                              </div>
                              {isUnderStock && (
                                <div className="text-[9px] text-[var(--color-error)] font-bold flex items-center gap-0.5 mt-0.5">
                                  <AlertCircle className="w-3 h-3 shrink-0" /> Low stockpile level
                                </div>
                              )}
                            </td>

                            {/* Delete row */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                disabled={formIngredients.length === 1}
                                onClick={() => handleRemoveIngredientRow(idx)}
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
              </div>

              {/* Extra specs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Supervisor on Duty</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-outline)]" />
                    <input
                      type="text"
                      placeholder="e.g. Inspector Shinde"
                      value={formSupervisor}
                      onChange={(e) => setFormSupervisor(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Mix Temperature (°C) — if hot mix</label>
                  <div className="relative">
                    <Thermometer className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-outline)]" />
                    <input
                      type="number"
                      placeholder="e.g. 165"
                      value={formMixTemp}
                      onChange={(e) => setFormMixTemp(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Remarks / Quality Lab Reports</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Bitumen binder percentage, aggregate grading check, moisture percentage remarks..."
                  className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              {/* Notice */}
              <div className="p-3.5 bg-[var(--color-success-container)] border border-[var(--color-success)]/20 rounded-2xl text-[11px] text-[var(--color-on-success-container)] flex items-start gap-2.5">
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0 text-[var(--color-success)]" />
                <div>
                  <span className="font-bold">Automated Ledger Adjustments:</span> Saving this batch run increases target product stock by {formTargetQuantity || '0'} MT and reduces the physical silos of any chosen input material rows immediately.
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95 transition-all shadow-xs"
                >
                  Post Batch Yield & Deduct Ingredients
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- VIEW DETAILED BATCH MODAL --- */}
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
                <h2 className="text-sm font-black text-[var(--color-on-surface)]">{viewingBatch.targetItemName}</h2>
              </div>
              <button
                onClick={() => setViewingBatch(null)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl">
                  <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">Plant / Unit</p>
                  <p className="text-xs font-semibold text-[var(--color-on-surface)]">{viewingBatch.plantUnit}</p>
                </div>
                <div className="p-3 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-xl">
                  <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase mb-0.5">Supervisor</p>
                  <p className="text-xs font-semibold text-[var(--color-on-surface)]">{viewingBatch.supervisorName || '—'}</p>
                </div>
              </div>

              {/* Material Produced Output */}
              <div className="p-4 border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-success-container)]/30 space-y-1">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-success)]">Yield Output Material Addition</h4>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-extrabold text-[var(--color-on-surface)]">{viewingBatch.targetItemName}</span>
                  <span className="text-sm font-black text-[var(--color-success)]">+{viewingBatch.targetQuantity.toLocaleString('en-IN')} {viewingBatch.unit}</span>
                </div>
              </div>

              {/* Raw Materials & Services Consumed */}
              <div className="p-4 border border-[var(--color-outline-variant)] rounded-xl bg-[var(--color-surface-container-lowest)] space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface)]">Consumed Materials & Services</h4>
                </div>
                <div className="space-y-2">
                  {viewingBatch.rawMaterialsConsumed && viewingBatch.rawMaterialsConsumed.length > 0 ? (
                    viewingBatch.rawMaterialsConsumed.map((mat, idx) => {
                      const matchedItem = availableItems.find((p) => p.id === mat.itemId);
                      const isService = matchedItem?.type === 'service';

                      return (
                        <div key={idx} className="flex justify-between items-center p-2 hover:bg-[var(--color-surface-container)] rounded-lg text-xs">
                          <div className="flex items-center gap-2 flex-1 pr-2">
                            <span className="font-medium text-[var(--color-on-surface)] line-clamp-1">{mat.itemName}</span>
                            {isService && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">
                                Service / Equipment
                              </span>
                            )}
                          </div>
                          <span className={`font-bold shrink-0 ${isService ? 'text-[var(--color-primary)]' : 'text-[var(--color-error)]'}`}>
                            {isService ? '' : '-'}{mat.quantity.toLocaleString('en-IN')} {mat.unit}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-[var(--color-outline)] italic py-1 pl-1">No material or service consumptions declared for this batch.</div>
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
            <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-between items-center">
              <button
                onClick={() => handleDelete(viewingBatch.id)}
                className="px-4 py-2 text-xs font-bold text-[var(--color-error)] hover:bg-[var(--color-error-container)] rounded-full transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete historical batch log
              </button>
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
