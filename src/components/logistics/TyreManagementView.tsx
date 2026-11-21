import React, { useState, useEffect, useMemo } from 'react';
import {
  Disc,
  Truck,
  X,
  Plus,
  Search,
  Filter,
  TrendingUp,
  Building,
  Archive,
  Undo2,
  Warehouse,
  Layers,
  MoreVertical,
  ArchiveRestore,
  History,
} from 'lucide-react';
import { Vehicle, CompanySettings, Item, ItemAttributeKey, ItemLocation, Party, InventoryUnit, InventoryUnitEvent, InventoryUnitEventType, TYRE_POSITIONS, TYRE_POSITION_LABELS, isTyreItemName } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import UnitRegisterModal from '../items/UnitRegisterModal';

/**
 * TYRE MANAGEMENT (own sidebar feature) — REBUILT ON THE SERIAL REGISTER
 * (2026-11-17): the old standalone Tyre table is retired. Tyres are the
 * serials of asset items whose NAME carries "Tyre/Tyres"; each serial lives
 * in inventory_units (lifecycle: in_stock → deployed on a fleet vehicle at
 * ONE of the 12 dumper positions → maintenance/retread → scrap/sold) and the
 * vehicle profile's Tyre diagram is the other half of this feature.
 */
export const TyreManagementView: React.FC = () => {
  // Database States — read through the serial register + item master
  const [items, setItems] = useState<Item[]>([]);
  const [tyreUnits, setTyreUnits] = useState<InventoryUnit[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [locations, setLocations] = useState<ItemLocation[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  // App Navigation & Filter state
  const [activeSubTab, setActiveSubTab] = useState<'tyres' | 'history'>('tyres');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // MOVEMENT LOG — ONE clubbed table (2026-11-20, user directive): every tyre
  // serial's movements in a single newest-first register; a tyre filter
  // (default All Tyres) slices it to one serial. No per-tyre drill-down. Events
  // are fetched from the append-only unit log (/inventory-units/events) for
  // ALL tyre units at once.
  const [movements, setMovements] = useState<InventoryUnitEvent[] | null>(null);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [historyTyreFilter, setHistoryTyreFilter] = useState('all');

  // Fit / modals
  const [fitForm, setFitForm] = useState<{ unitId: string; vehicleId: string; position: string; odometer: string; notes: string } | null>(null);
  // REGISTER SERIAL — opens the SHARED unit-register modal (same as the
  // serialized-inventory asset profile: supplier, purchase date/cost, and the
  // item's declared per-unit attribute keys), with a tyre-item picker.
  const [unitModalOpen, setUnitModalOpen] = useState(false);

  // Load and subscribe to database changes
  const loadData = () => {
    const allItems = localDb.getItems();
    setItems(allItems);
    setVehicles(localDb.getVehicles());
    setLocations(localDb.getLocations());
    setParties(localDb.getParties());
    setSettings(localDb.getSettings());
    // TYRE UNITS — serials of asset items whose name is Tyre/Tyres
    const tyreItemIdSet = new Set(allItems.filter((i) => i.type === 'asset' && isTyreItemName(i.name)).map((i) => i.id));
    const units = localDb.getInventoryUnits().filter((u) => tyreItemIdSet.has(u.itemId));
    units.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
    setTyreUnits(units);
  };

  useEffect(() => {
    loadData();
    const unsubscribe = localDb.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  // Refresh data on switching sub-features
  useEffect(() => {
    loadData();
  }, [activeSubTab]);

  // MOVEMENT LOG data — one fetch keeps the log a single source slice; a
  // failed fetch degrades to "empty log" rather than a broken pane.
  useEffect(() => {
    if (activeSubTab !== 'history') return;
    let alive = true;
    setMovementsLoading(true);
    localDb.fetchUnitEvents()
      .then((all: InventoryUnitEvent[]) => { if (alive) setMovements(all); })
      .catch(() => { if (alive) setMovements([]); })
      .finally(() => { if (alive) setMovementsLoading(false); });
    return () => { alive = false; };
  }, [activeSubTab]);

  // Tyre movement labels — the full life cycle (fuller wording than the
  // asset-profile timeline: this IS the tyre's story).
  const MOVEMENT_META: Record<InventoryUnitEventType, { label: string; icon: typeof Truck; tone: string }> = {
    entered: { label: 'Registered', icon: Disc, tone: 'text-[var(--color-on-surface)]' },
    deployed: { label: 'Fitted on Vehicle', icon: Truck, tone: 'text-[var(--color-primary)]' },
    returned: { label: 'Returned to Yard', icon: Undo2, tone: 'text-[var(--color-warning)]' },
    maintenance: { label: 'Sent for Retreading', icon: TrendingUp, tone: 'text-[var(--color-info)]' },
    restored: { label: 'Restored from Workshop', icon: ArchiveRestore, tone: 'text-[var(--color-info)]' },
    scrapped: { label: 'Scrapped', icon: Archive, tone: 'text-[var(--color-error)]' },
    unscrapped: { label: 'Unscrapped → Spare Stock', icon: Warehouse, tone: 'text-[var(--color-success)]' },
    sold: { label: 'Sold Out', icon: Layers, tone: 'text-[var(--color-on-surface-variant)]' },
  };

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const locationName = (id?: string) => (id ? locations.find((l) => l.id === id)?.name : undefined);
  const vehicleNo = (id?: string) => (id ? vehicles.find((v) => v.id === id)?.vehicleNo : undefined);

  // REGISTER TABLE COLUMNS — one column per declared attribute key, exactly
  // like the asset profile's serial register (union across all tyre items,
  // key-first so renames stay a single source; capped for table width).
  const tyreAttrColumns = useMemo(() => {
    const byKey = new Map<string, ItemAttributeKey>();
    items.filter((i) => i.type === 'asset' && isTyreItemName(i.name)).forEach((i) => {
      (i.attributes || []).forEach((def) => { if (!byKey.has(def.key)) byKey.set(def.key, def); });
    });
    return Array.from(byKey.values()).slice(0, 5);
  }, [items]);

  // --- MOVEMENT LOG derived data ---
  // One flat list across ALL tyre units (this view's units only), newest
  // first; the tyre filter slices it to a single serial when chosen.
  const unitById = useMemo(() => new Map(tyreUnits.map((u) => [u.id, u])), [tyreUnits]);

  const filteredMovements = useMemo(() => {
    const tyreIds = new Set(tyreUnits.map((u) => u.id));
    return (movements || [])
      .filter((ev) => tyreIds.has(ev.unitId) && (historyTyreFilter === 'all' || ev.unitId === historyTyreFilter))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [movements, tyreUnits, historyTyreFilter]);

  // Register entry points (serial click / ⋮ menu) jump here with the serial
  // preselected in the filter — still the one clubbed table, just sliced.
  const openMovementLog = (unitId: string) => {
    setHistoryTyreFilter(unitId);
    setActiveSubTab('history');
  };

  // Format Helper
  const formatCurrency = (val: number) => {
    const symbol = settings?.currency?.symbol || '₹';
    return `${symbol}${val.toLocaleString('en-IN')}`;
  };

  // ⋮ row-action popover (viewport-fixed so the table's overflow-x-auto
  // can't clip it — same pattern as the fleet/orders lists). Menu contents
  // follow the STATUS: fit/retread/scrap for spares, unload for fitted,
  // restore for workshop, unscrap for scrapped; DONE for sold.
  const [unitMenu, setUnitMenu] = useState<{ unitId: string; top: number; left: number } | null>(null);
  const unitMenuRef = React.useRef<HTMLDivElement | null>(null);
  const closeUnitMenu = () => setUnitMenu(null);
  React.useEffect(() => {
    if (!unitMenu) return;
    const onClickOut = (e: MouseEvent) => {
      if (unitMenuRef.current && !unitMenuRef.current.contains(e.target as Node)) closeUnitMenu();
    };
    const onMove = () => closeUnitMenu();
    document.addEventListener('mousedown', onClickOut);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onClickOut);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [unitMenu]);

  const openUnitMenu = (unitId: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setUnitMenu({
      unitId,
      top: Math.min(r.bottom + 6, window.innerHeight - 190),
      left: Math.max(8, Math.min(r.left - 170, window.innerWidth - 220)),
    });
  };

  // --- ACTIONS — all through the unit lifecycle (server-validated) ---
  const handleSaveFit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fitForm) return;
    localDb.deployInventoryUnit(fitForm.unitId, {
      vehicleId: fitForm.vehicleId,
      position: fitForm.position,
      odometer: fitForm.odometer === '' ? undefined : Number(fitForm.odometer),
      notes: fitForm.notes || undefined,
    });
    setFitForm(null);
  };

  const handleUnload = (u: InventoryUnit) => {
    if (confirm(`Unload tyre ${u.serialNumber} from ${vehicleNo(u.vehicleId) || 'the vehicle'} back to spare stock?`)) {
      localDb.returnInventoryUnit(u.id, {});
    }
  };

  const handleRetread = (u: InventoryUnit) => {
    if (confirm(`Send tyre serial ${u.serialNumber} to the retreading workshop?`)) {
      localDb.maintainInventoryUnit(u.id, { notes: 'Sent for retreading' });
    }
  };

  const handleRestore = (u: InventoryUnit) => {
    if (confirm(`Bring serial ${u.serialNumber} back from the workshop into spare stock?`)) {
      localDb.restoreInventoryUnit(u.id, { notes: 'Restored from retreading' });
    }
  };

  // SCRAP — a fitted tyre can never be scrapped (server refuses too). No
  // reason prompt; the action just retires the serial.
  const handleScrap = (u: InventoryUnit) => {
    if (confirm(`Mark serial ${u.serialNumber} as scrapped? It returns to usable stock when unscrapped later.`)) {
      localDb.scrapInventoryUnit(u.id, { notes: 'Scrapped from Tyre Management' });
    }
  };

  // UN-SCRAP — immediate, no confirmation (a scrapped tyre simply returns to
  // the spare yard; a SOLD tyre can never come back — its menu is disabled).
  const handleUnscrap = (u: InventoryUnit) => {
    localDb.unscrapInventoryUnit(u.id, { notes: 'Unscrapped from Tyre Management' });
  };

  // Filters Calculation
  const filteredUnits = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return tyreUnits.filter((u) => {
      const matchesSearch =
        u.serialNumber.toLowerCase().includes(q) ||
        (itemById.get(u.itemId)?.name || '').toLowerCase().includes(q) ||
        (u.vehicleId ? (vehicleNo(u.vehicleId) || '').toLowerCase().includes(q) : false) ||
        (u.supplierName || '').toLowerCase().includes(q) ||
        (u.condition && u.condition.toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tyreUnits, searchQuery, statusFilter, items, vehicles]);

  const tyreItemCount = tyreUnits.length;

  return (
    <div className="space-y-6">
      {/* Sub Tabs Panel */}
      <div className="border-b border-[var(--color-outline-variant)]">
        <nav className="flex space-x-6 overflow-x-auto">
          <button
            onClick={() => { setActiveSubTab('tyres'); setStatusFilter('all'); setSearchQuery(''); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'tyres'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <Disc className="h-4 w-4" />
            Tyre Management
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {tyreItemCount}
            </span>
          </button>
          <button
            onClick={() => { setActiveSubTab('history'); setSearchQuery(''); setHistoryTyreFilter('all'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'history'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <History className="h-4 w-4" />
            Movement Log
          </button>
        </nav>
      </div>

      {/* SEARCH AND FILTER BAR — Register Serial sits RIGHT of the status filter */}
      {activeSubTab === 'tyres' && (
        <div className="flex flex-col sm:flex-row gap-3 bg-[var(--color-surface-container-lowest)] p-3 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-outline)]" />
            <input
              type="text"
              placeholder="Search tyre serial, item, vehicle, condition..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--color-outline)]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-2 pl-3.5 pr-8 border border-[var(--color-outline-variant)] rounded-full text-xs font-medium bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="all">All Statuses</option>
              <option value="deployed">Fitted on Vehicle</option>
              <option value="in_stock">Available (Yard)</option>
              <option value="maintenance">Retreading</option>
              <option value="scrapped">Scrapped</option>
              <option value="sold">Sold</option>
            </select>
            <button
              onClick={() => setUnitModalOpen(true)}
              disabled={(() => {
                const tyreItemOptions = items.filter((i) => i.type === 'asset' && isTyreItemName(i.name) && i.isActive !== false);
                return tyreItemOptions.length === 0;
              })()}
              title={(() => {
                const tyreItemOptions = items.filter((i) => i.type === 'asset' && isTyreItemName(i.name) && i.isActive !== false);
                return tyreItemOptions.length === 0
                  ? 'Create an asset item named e.g. "Tyre 10.00R20" in the Items module first'
                  : 'Register a new tyre serial';
              })()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs transition whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              Register Tyre
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENTS */}

      {/* 1. TYRE SERIAL REGISTER */}
      {activeSubTab === 'tyres' && (
        <div className="space-y-6">
          {/* Serial stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Tyre Serials</p>
                <h4 className="text-xl font-black text-[var(--color-on-surface)] mt-1">{tyreItemCount} units</h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">Across all tyre items</p>
              </div>
              <div className="p-2.5 bg-[var(--color-surface-container)] rounded-2xl">
                <Disc className="h-5 w-5 text-[var(--color-primary)]" />
              </div>
            </div>

            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Fitted on Vehicles</p>
                <h4 className="text-xl font-black text-[var(--color-primary)] mt-1">
                  {tyreUnits.filter((u) => u.status === 'deployed').length} units
                </h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">One per wheel position</p>
              </div>
              <div className="p-2.5 bg-[var(--color-primary-container)] rounded-2xl">
                <Truck className="h-5 w-5 text-[var(--color-on-primary-container)]" />
              </div>
            </div>

            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Spare Yard Stock</p>
                <h4 className="text-xl font-black text-[var(--color-success)] mt-1">
                  {tyreUnits.filter((u) => u.status === 'in_stock').length} serials
                </h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">Ready for fitment / swap</p>
              </div>
              <div className="p-2.5 bg-[var(--color-success-container)] rounded-2xl">
                <Warehouse className="h-5 w-5 text-[var(--color-on-success-container)]" />
              </div>
            </div>

            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Scrapped Tyres</p>
                <h4 className="text-xl font-black text-[var(--color-error)] mt-1">
                  {tyreUnits.filter((u) => u.status === 'scrapped').length} units
                </h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">
                  {tyreUnits.filter((u) => u.status === 'maintenance').length} at retread · {tyreUnits.filter((u) => u.status === 'sold').length} sold lifetime
                </p>
              </div>
              <div className="p-2.5 bg-[var(--color-error-container)] rounded-2xl">
                <Archive className="h-5 w-5 text-[var(--color-on-error-container)]" />
              </div>
            </div>
          </div>

          {/* Serials List Table */}
          {filteredUnits.length === 0 ? (
            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] p-12 text-center shadow-2xs">
              <Disc className="h-10 w-10 text-[var(--color-outline)] mx-auto mb-3 animate-spin-slow" />
              <p className="text-[var(--color-on-surface-variant)] font-medium text-xs">No tyre serials match the search/filter terms.</p>
              {items.filter((i) => i.type === 'asset' && isTyreItemName(i.name)).length === 0 ? (
                <p className="text-[11px] text-[var(--color-on-surface-variant)] font-semibold max-w-md mx-auto mt-2">
                  A serialised (asset) item named with the word "Tyre" — e.g. "Tyre 10.00R20" — is required first. Create it in the Items module, then register its serials here.
                </p>
              ) : (
                <button
                  onClick={() => setUnitModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-semibold shadow-xs"
                >
                  Register Your First Tyre Serial
                </button>
              )}
            </div>
          ) : (
            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">Serial Number</th>
                      <th className="py-3.5 px-3">Status</th>
                      <th className="py-3.5 px-3">Location / Vehicle</th>
                      <th className="py-3.5 px-3">Supplier</th>
                      <th className="py-3.5 px-3">Purchase</th>
                      <th className="py-3.5 px-3">Cost</th>
                      {/* DONE-BY AUDIT (2026-11-21): acting user resolved from the users master */}
                      <th className="py-3.5 px-3">Added By</th>
                      <th className="py-3.5 px-3">Updated By</th>
                      {tyreAttrColumns.map((def) => (
                        <th key={def.key} className="py-3.5 px-3 whitespace-nowrap">
                          {def.label.toUpperCase()}
                          {def.required && <span className="text-[var(--color-error)]">*</span>}
                        </th>
                      ))}
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]">
                    {filteredUnits.map((u) => {
                      const item = itemById.get(u.itemId);
                      const attrs = u.attributes ? Object.entries(u.attributes).filter(([, v]) => v !== undefined && v !== '') : [];
                      return (
                        <tr key={u.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                          {/* Serial Number — link-styled; click opens this serial's Movement Log */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <button
                                onClick={() => openMovementLog(u.id)}
                                title="Open this serial's movements in the Movement Log (preselected in the filter)"
                                className="font-mono text-xs font-black text-[var(--color-primary)] underline underline-offset-2 decoration-2 hover:decoration-[var(--color-error)] uppercase"
                              >
                                {u.serialNumber}
                              </button>
                              <div className="text-[11px] font-bold text-[var(--color-on-surface)]">{item?.name || '—'}</div>
                            </div>
                          </td>

                          {/* Status — same pills as the serial register */}
                          <td className="py-3.5 px-3">
                            <span className={`text-[9px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap ${
                              u.status === 'deployed'
                                ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                                : u.status === 'in_stock'
                                  ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                  : u.status === 'maintenance'
                                    ? 'bg-[var(--color-info-container)] text-[var(--color-on-info-container)]'
                                    : u.status === 'scrapped'
                                      ? 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                                      : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                            }`}>
                              {u.status === 'deployed' ? 'in use' : u.status === 'in_stock' ? 'in spare' : u.status === 'maintenance' ? 'retreading' : u.status === 'sold' ? 'sold out' : u.status}
                            </span>
                          </td>

                          {/* Location / Vehicle — "VEHICLE · POSITION" when fitted */}
                          <td className="py-3.5 px-3 text-[11px] font-bold text-[var(--color-on-surface)]">
                            {u.status === 'deployed' && u.vehicleId ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1">
                                  <Truck className="h-3 w-3 text-[var(--color-primary)]" />
                                  {vehicleNo(u.vehicleId) || u.vehicleNo || 'Vehicle'}
                                  <span className="text-[var(--color-outline)]">·</span>
                                  {u.position || '—'}
                                </span>
                              </div>
                            ) : u.status === 'maintenance' ? (
                              <span className="text-[var(--color-on-surface-variant)] font-semibold flex items-center gap-1">
                                <TrendingUp className="h-3.5 w-3.5 text-[var(--color-info)]" /> Retread Workshop
                              </span>
                            ) : u.status === 'sold' ? (
                              <span className="text-[var(--color-on-surface-variant)] font-semibold">Sold out · sale {u.saleNumber || '—'}</span>
                            ) : (
                              <span className="text-[var(--color-on-surface-variant)] font-semibold flex items-center gap-1">
                                <Building className="h-3.5 w-3.5 text-[var(--color-outline)]" />
                                {locationName(u.locationId) || u.locationName || 'Yard'}
                              </span>
                            )}
                          </td>

                          {/* Supplier (display copy resolved on read) */}
                          <td className="py-3.5 px-3 text-[11px] font-semibold text-[var(--color-on-surface)]">{u.supplierName || '—'}</td>

                          {/* Purchase date + Cost — numeric snapshots per row */}
                          <td className="py-3.5 px-3 text-[11px] font-medium text-[var(--color-on-surface-variant)]">{u.purchaseDate ? u.purchaseDate.split('T')[0] : '—'}</td>
                          <td className="py-3.5 px-3 text-[11px] font-black text-[var(--color-on-surface)]">{u.purchaseCost ? formatCurrency(u.purchaseCost) : '—'}</td>

                          {/* DONE-BY AUDIT (2026-11-21) */}
                          <td className="py-3.5 px-3 text-[11px] font-medium text-[var(--color-on-surface)]">
                            {u.createdByName || <span className="italic text-[var(--color-outline)]">Unknown</span>}
                          </td>
                          <td className="py-3.5 px-3 text-[11px] font-medium text-[var(--color-on-surface)]">
                            {u.updatedByName || <span className="italic text-[var(--color-outline)]">—</span>}
                          </td>

                          {/* Declared per-unit attribute columns */}
                          {tyreAttrColumns.map((def) => {
                            const raw = u.attributes?.[def.key];
                            const shown = raw === undefined || raw === '' ? '—' : def.type === 'date' ? String(raw).split('T')[0] : String(raw);
                            return (
                              <td key={def.key} className="py-3.5 px-3 text-[11px] text-[var(--color-on-surface-variant)] whitespace-nowrap">
                                {shown}
                              </td>
                            );
                          })}

                          {/* Actions — ONE ⋮ menu per serial; the menu is
                              DISABLED once sold (a sold tyre is final). */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end">
                              <button
                                onClick={(e) => openUnitMenu(u.id, e.currentTarget)}
                                disabled={u.status === 'sold'}
                                className={`p-1.5 rounded-full text-[var(--color-on-surface-variant)] text-left transition-colors ${
                                  u.status === 'sold'
                                    ? 'opacity-30 cursor-not-allowed'
                                    : 'hover:bg-[var(--color-surface-container)] hover:text-[var(--color-on-surface)]'
                                }`}
                                title={u.status === 'sold'
                                  ? 'Sold Out — this serial has left the register and can no longer be changed'
                                  : 'Serial actions (fit / unload / retread / scrap / unscrap)'}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. MOVEMENT LOG — ONE clubbed table (2026-11-20, user directive):
          every tyre serial's movements in a single newest-first register; the
          tyre filter (default All Tyres) slices it to one serial. */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* FILTER BAR — All Tyres by default; pick one serial to slice */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center bg-[var(--color-surface-container-lowest)] p-3 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs">
            <div className="flex items-center gap-2 flex-1">
              <Filter className="h-4 w-4 text-[var(--color-outline)] shrink-0" />
              <select
                value={historyTyreFilter}
                onChange={(e) => setHistoryTyreFilter(e.target.value)}
                className="py-2 pl-3.5 pr-8 border border-[var(--color-outline-variant)] rounded-full text-xs font-medium bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-full sm:max-w-sm"
              >
                <option value="all">All Tyres ({tyreUnits.length})</option>
                {tyreUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.serialNumber} · {itemById.get(u.itemId)?.name || 'Tyre'}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] shrink-0">
              {movementsLoading
                ? 'Loading movements…'
                : `${filteredMovements.length} movement${filteredMovements.length === 1 ? '' : 's'}${historyTyreFilter === 'all' ? ' across all tyres' : ' for this serial'}`}
            </p>
          </div>

          {movementsLoading ? (
            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] p-12 text-center shadow-2xs">
              <p className="text-xs text-[var(--color-outline)] font-medium">Loading movement log…</p>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] p-12 text-center shadow-2xs">
              <History className="h-10 w-10 text-[var(--color-outline)] mx-auto mb-3" />
              <p className="text-[var(--color-on-surface-variant)] font-medium text-xs">
                {historyTyreFilter === 'all'
                  ? 'No movement events recorded for any tyre yet.'
                  : 'No movement events recorded for this serial yet.'}
              </p>
            </div>
          ) : (
            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-clip shadow-2xs">
              {/* STICKY HEADER (matches the orders table): the page scrolls and
                  the header rides sticky beneath the app header (h-16) —
                  overflow-clip keeps the rounded corners while letting the
                  sticky thead anchor to the viewport (an overflow-x-auto /
                  hidden ancestor would turn it into its own scroll
                  container). */}
              <div>
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-16 z-20">
                    <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">Date & Time</th>
                      <th className="py-3.5 px-3">Serial Number</th>
                      <th className="py-3.5 px-3">Movement</th>
                      <th className="py-3.5 px-3">Vehicle</th>
                      <th className="py-3.5 px-3">Position</th>
                      <th className="py-3.5 px-3">Odometer</th>
                      <th className="py-3.5 px-3">Location</th>
                      <th className="py-3.5 px-4">Notes</th>
                      {/* DONE-BY AUDIT (2026-11-21): the operator who performed the movement */}
                      <th className="py-3.5 px-3">Movement By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]">
                    {filteredMovements.map((ev) => {
                      const unit = unitById.get(ev.unitId);
                      const meta = MOVEMENT_META[ev.type] || { label: ev.type, icon: History, tone: 'text-[var(--color-on-surface)]' };
                      const EventIcon = meta.icon;
                      const evVehicle = ev.vehicleId ? vehicleNo(ev.vehicleId) : undefined;
                      const evPosition = ev.position ? TYRE_POSITION_LABELS[ev.position as keyof typeof TYRE_POSITION_LABELS] || ev.position : undefined;
                      const evLocation = ev.locationId ? locationName(ev.locationId) : undefined;
                      return (
                        <tr key={ev.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                          <td className="py-3.5 px-4 text-[11px] font-medium text-[var(--color-on-surface-variant)] whitespace-nowrap">
                            {ev.date ? new Date(ev.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                          </td>
                          {/* Serial — click slices the table to this serial */}
                          <td className="py-3.5 px-3">
                            <button
                              onClick={() => setHistoryTyreFilter(ev.unitId)}
                              title="Filter the log to this serial"
                              className="font-mono text-[11px] font-black uppercase text-[var(--color-primary)] hover:underline underline-offset-2"
                            >
                              {unit?.serialNumber || '—'}
                            </button>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide whitespace-nowrap ${meta.tone}`}>
                              <EventIcon className="h-3.5 w-3.5 shrink-0" />
                              {meta.label}
                              {ev.type === 'sold' && (unit?.saleNumber || ev.saleId) && (
                                <span className="font-bold normal-case text-[var(--color-on-surface-variant)]">· sale {unit?.saleNumber || ev.saleId}</span>
                              )}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-[11px] font-bold text-[var(--color-on-surface)] whitespace-nowrap">
                            {evVehicle ? (
                              <span className="inline-flex items-center gap-1">
                                <Truck className="h-3 w-3 text-[var(--color-primary)]" />
                                {evVehicle}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-3.5 px-3 text-[11px] font-semibold text-[var(--color-on-surface)] whitespace-nowrap">{evPosition || '—'}</td>
                          <td className="py-3.5 px-3 text-[11px] font-medium text-[var(--color-on-surface-variant)] whitespace-nowrap">
                            {ev.odometer !== undefined && ev.odometer !== null ? `${Number(ev.odometer).toLocaleString('en-IN')} km` : '—'}
                          </td>
                          <td className="py-3.5 px-3 text-[11px] font-semibold text-[var(--color-on-surface-variant)] whitespace-nowrap">{evLocation || '—'}</td>
                          <td className="py-3.5 px-4 text-[11px] font-medium text-[var(--color-on-surface-variant)] max-w-[240px] break-words">{ev.notes || '—'}</td>
                          {/* DONE-BY AUDIT (2026-11-21) */}
                          <td className="py-3.5 px-3 text-[11px] font-medium text-[var(--color-on-surface)]">
                            {ev.createdByName || <span className="italic text-[var(--color-outline)]">Unknown</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. ⋮ SERIAL-ACTIONS POPOVER — menu options follow the status */}
      {unitMenu && (() => {
        const menuUnit = tyreUnits.find((x) => x.id === unitMenu.unitId);
        if (!menuUnit) return null;
        const st = menuUnit.status;
        const itemCls = 'w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] rounded-xl text-left transition-colors';
        return (
          <div
            ref={unitMenuRef}
            className="fixed z-[70] w-56 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xl p-1.5"
            style={{ top: unitMenu.top, left: unitMenu.left }}
          >
            <p className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] border-b border-[var(--color-outline-variant)]/60 mb-1 truncate font-mono">
              {menuUnit.serialNumber} · {st === 'sold' ? 'sold out' : st === 'deployed' ? 'fitted' : st}
            </p>
            <button
              className={itemCls}
              onClick={() => { closeUnitMenu(); openMovementLog(menuUnit.id); }}
              title="Open this serial's full movement history in the Movement Log tab"
            >
              <History className="h-3.5 w-3.5 text-[var(--color-primary)] shrink-0" /> View Movement Log
            </button>
            {st === 'in_stock' && (
              <>
                <button
                  className={itemCls}
                  onClick={() => { closeUnitMenu(); setFitForm({ unitId: menuUnit.id, vehicleId: '', position: '', odometer: '', notes: '' }); }}
                  disabled={vehicles.length === 0}
                  title={vehicles.length === 0 ? 'Add a vehicle in Fleet first' : 'Fit on a fleet vehicle at one of the 12 positions'}
                >
                  <Truck className="h-3.5 w-3.5 text-[var(--color-success)] shrink-0" /> Fit to Vehicle
                </button>
                <button
                  className={itemCls}
                  onClick={() => { closeUnitMenu(); handleRetread(menuUnit); }}
                >
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--color-info)] shrink-0" /> Send for Retreading
                </button>
                <button
                  className={itemCls}
                  onClick={() => { closeUnitMenu(); handleScrap(menuUnit); }}
                  title="Retire this serial — an optional reason is recorded"
                >
                  <Archive className="h-3.5 w-3.5 text-[var(--color-error)] shrink-0" /> Mark Scrap
                </button>
              </>
            )}
            {st === 'deployed' && (
              <button className={itemCls} onClick={() => { closeUnitMenu(); handleUnload(menuUnit); }}>
                <Undo2 className="h-3.5 w-3.5 text-[var(--color-warning)] shrink-0" /> Unload to Stock
              </button>
            )}
            {st === 'maintenance' && (
              <button className={itemCls} onClick={() => { closeUnitMenu(); handleRestore(menuUnit); }}>
                <ArchiveRestore className="h-3.5 w-3.5 text-[var(--color-info)] shrink-0" /> Mark Restored
              </button>
            )}
            {st === 'scrapped' && (
              <button className={itemCls} onClick={() => { closeUnitMenu(); handleUnscrap(menuUnit); }}>
                <Warehouse className="h-3.5 w-3.5 text-[var(--color-success)] shrink-0" /> Mark Unscrap
              </button>
            )}
            {st === 'sold' && (
              <p className="px-3 py-2 text-[10px] font-semibold text-[var(--color-on-surface-variant)]">
                This tyre is sold out — the sale is final and nothing can be undone.
              </p>
            )}
          </div>
        );
      })()}

      {/* 4. FIT TYRE MODAL — serial → vehicle + one of the 12 wheel positions */}
      {fitForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-scrim)]/40 backdrop-blur-xs p-4 overflow-y-auto">
          <form onSubmit={handleSaveFit} className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-xl border border-[var(--color-outline-variant)] max-w-lg w-full overflow-hidden my-auto">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div>
                <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm uppercase tracking-tight flex items-center gap-1.5">
                  <Truck className="h-4.5 w-4.5 text-[var(--color-primary)]" />
                  Fit Tyre {fitForm.unitId ? (tyreUnits.find((u) => u.id === fitForm.unitId)?.serialNumber || '') : ''}
                </h3>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                  Choose the vehicle and the 12-tyre dumper wheel position.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFitForm(null)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] rounded-full transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-left">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Select Vehicle *</label>
                  <select
                    required
                    value={fitForm.vehicleId}
                    onChange={(e) => setFitForm({ ...fitForm, vehicleId: e.target.value })}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  >
                    <option value="">-- Choose Vehicle --</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.vehicleNo} [{v.type.toUpperCase()}]
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Wheel Position *</label>
                  <select
                    required
                    value={fitForm.position}
                    onChange={(e) => setFitForm({ ...fitForm, position: e.target.value })}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  >
                    <option value="">-- Select Position --</option>
                    {TYRE_POSITIONS.map((p) => (
                      <option key={p} value={p}>{TYRE_POSITION_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase">Odometer at Fitment (km)</label>
                  <input
                    type="number"
                    placeholder="e.g. 24300"
                    value={fitForm.odometer}
                    onChange={(e) => setFitForm({ ...fitForm, odometer: e.target.value })}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase">Log Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. rotated from L2"
                    value={fitForm.notes}
                    onChange={(e) => setFitForm({ ...fitForm, notes: e.target.value })}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFitForm(null)}
                className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs"
              >
                Fit Tyre
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. REGISTER SERIAL — the SHARED unit-register modal, identical to the
          serialized-inventory asset profile (supplier + purchase facts + the
          tyre item's declared per-unit attribute keys), with an item picker. */}
      {unitModalOpen && (() => {
        const tyreItemOptions = items.filter((i) => i.type === 'asset' && isTyreItemName(i.name) && i.isActive !== false);
        if (tyreItemOptions.length === 0) return null;
        return (
          <UnitRegisterModal
            items={tyreItemOptions}
            parties={parties}
            locations={locations}
            currencySymbol={settings?.currency?.symbol || '₹'}
            onClose={() => setUnitModalOpen(false)}
          />
        );
      })()}
    </div>
  );
};
