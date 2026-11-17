import React, { useState, useEffect, useMemo } from 'react';
import {
  Disc,
  Truck,
  AlertCircle,
  X,
  Plus,
  Search,
  Filter,
  TrendingUp,
  Compass,
  Navigation2,
  Building,
  Archive,
  Undo2,
  Warehouse,
  Layers,
  MoreVertical,
  ArchiveRestore,
} from 'lucide-react';
import { Vehicle, TripSlip, CompanySettings, Item, ItemLocation, InventoryUnit, TYRE_POSITIONS, TYRE_POSITION_LABELS, isTyreItemName } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

/**
 * TYRE MANAGEMENT (own sidebar feature) — REBUILT ON THE SERIAL REGISTER
 * (2026-11-17): the old standalone Tyre table is retired. Tyres are the
 * serials of asset items whose NAME carries "Tyre/Tyres"; each serial lives
 * in inventory_units (lifecycle: in_stock → deployed on a fleet vehicle at
 * ONE of the 12 dumper positions → maintenance/retread → scrap/sold) and the
 * vehicle profile's Tyre diagram is the other half of this feature.
 * The View Transit tab (transit telemetry) keeps living under this gate.
 */
export const TyreManagementView: React.FC = () => {
  // Database States — read through the serial register + item master
  const [items, setItems] = useState<Item[]>([]);
  const [tyreUnits, setTyreUnits] = useState<InventoryUnit[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [locations, setLocations] = useState<ItemLocation[]>([]);
  const [slips, setSlips] = useState<TripSlip[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  // App Navigation & Filter state
  const [activeSubTab, setActiveSubTab] = useState<'tyres' | 'transit'>('tyres');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Fit / modals
  const [fitForm, setFitForm] = useState<{ unitId: string; vehicleId: string; position: string; odometer: string; notes: string } | null>(null);
  const [addSerialOpen, setAddSerialOpen] = useState(false);
  const [addSerialItem, setAddSerialItem] = useState('');
  const [addSerialText, setAddSerialText] = useState('');
  const [addSerialLocation, setAddSerialLocation] = useState('');

  // Load and subscribe to database changes
  const loadData = () => {
    const allItems = localDb.getItems();
    setItems(allItems);
    setVehicles(localDb.getVehicles());
    setLocations(localDb.getLocations());
    setSlips(localDb.getTripSlips());
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

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const locationName = (id?: string) => (id ? locations.find((l) => l.id === id)?.name : undefined);
  const vehicleNo = (id?: string) => (id ? vehicles.find((v) => v.id === id)?.vehicleNo : undefined);

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

  const handleAddSerial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSerialItem || !addSerialText.trim()) return;
    localDb.addInventoryUnit({
      itemId: addSerialItem,
      serialNumber: addSerialText.toUpperCase().trim(),
      locationId: addSerialLocation || undefined,
    });
    setAddSerialOpen(false);
    setAddSerialItem('');
    setAddSerialText('');
    setAddSerialLocation('');
  };

  // Filters Calculation
  const filteredUnits = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return tyreUnits.filter((u) => {
      const matchesSearch =
        u.serialNumber.toLowerCase().includes(q) ||
        (itemById.get(u.itemId)?.name || '').toLowerCase().includes(q) ||
        (u.vehicleId ? (vehicleNo(u.vehicleId) || '').toLowerCase().includes(q) : false) ||
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
            onClick={() => { setActiveSubTab('transit'); setSearchQuery(''); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'transit'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <Compass className="h-4 w-4" />
            View Transit
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
              onClick={() => setAddSerialOpen(true)}
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
              Register Serial
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
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Workshop &amp; Exits</p>
                <h4 className="text-xl font-black text-[var(--color-warning)] mt-1">
                  {tyreUnits.filter((u) => u.status === 'maintenance').length} at retread
                </h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">
                  {tyreUnits.filter((u) => u.status === 'scrapped' || u.status === 'sold').length} scrapped/sold lifetime
                </p>
              </div>
              <div className="p-2.5 bg-[var(--color-warning-container)] rounded-2xl">
                <TrendingUp className="h-5 w-5 text-[var(--color-on-warning-container)]" />
              </div>
            </div>
          </div>

          {/* Quick Informational Notice banner */}
          <div className="bg-[var(--color-warning-container)] border border-[var(--color-warning)]/30 rounded-[24px] p-4 flex gap-3 text-left">
            <AlertCircle className="h-5 w-5 text-[var(--color-on-warning-container)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-[var(--color-on-warning-container)] uppercase tracking-wider">Tyre Fitment Protocol</h5>
              <p className="text-[11px] text-[var(--color-on-warning-container)]/90 leading-normal">
                Every fitted tyre carries its 12-tyre dumper position (FL · FR · L1–L5 · R1–R5) — one serial per wheel, enforced by the server. The vehicle profile's Tyre diagram shows exactly which serial sits on which wheel; a swapped or damaged tyre must be unloaded to spare stock (or sent to retreading) before a fresh serial is fitted.
              </p>
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
                  onClick={() => setAddSerialOpen(true)}
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
                      <th className="py-3.5 px-4">Serial / Item</th>
                      <th className="py-3.5 px-3">Status</th>
                      <th className="py-3.5 px-3">Assignment / Location</th>
                      <th className="py-3.5 px-3">Condition</th>
                      <th className="py-3.5 px-3">Procurement</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]">
                    {filteredUnits.map((u) => {
                      const item = itemById.get(u.itemId);
                      const attrs = u.attributes ? Object.entries(u.attributes).filter(([, v]) => v !== undefined && v !== '') : [];
                      return (
                        <tr key={u.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                          {/* Serial & Item */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-black bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface)] px-2 py-0.5 rounded-full uppercase border border-[var(--color-outline-variant)]">
                                  {u.serialNumber}
                                </span>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
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
                                  {u.status === 'deployed' ? 'fitted' : u.status === 'sold' ? 'sold out' : u.status}
                                </span>
                              </div>
                              <div className="text-[11px] font-bold text-[var(--color-on-surface)]">
                                {item?.name || '—'}
                              </div>
                              {attrs.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {attrs.slice(0, 3).map(([k, v]) => (
                                    <span key={k} className="text-[9px] font-semibold text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container)] px-1.5 py-0.2 rounded-full">{k}: {String(v)}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase">
                              {u.status === 'deployed' && <Truck className="h-3 w-3 text-[var(--color-primary)]" />}
                              {u.status === 'in_stock' && <Warehouse className="h-3 w-3 text-[var(--color-success)]" />}
                              {u.status === 'maintenance' && <TrendingUp className="h-3 w-3 text-[var(--color-info)]" />}
                              {u.status === 'scrapped' && <Archive className="h-3 w-3 text-[var(--color-error)]" />}
                              {u.status === 'sold' && <Layers className="h-3 w-3 text-[var(--color-on-surface-variant)]" />}
                            </div>
                          </td>

                          {/* Assignment / Location */}
                          <td className="py-3.5 px-3">
                            {u.status === 'deployed' && u.vehicleId ? (
                              <div className="space-y-0.5">
                                <span className="font-bold text-[var(--color-on-primary-container)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                  <Truck className="h-3 w-3" /> {vehicleNo(u.vehicleId) || u.vehicleNo || 'Vehicle'}
                                </span>
                                <p className="text-[10px] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider">
                                  @ {u.position ? TYRE_POSITION_LABELS[u.position as keyof typeof TYRE_POSITION_LABELS] || u.position : 'no position'}
                                </p>
                              </div>
                            ) : u.status === 'maintenance' ? (
                              <div className="text-[11px] text-[var(--color-on-surface-variant)] font-semibold flex items-center gap-1">
                                <TrendingUp className="h-3.5 w-3.5 text-[var(--color-info)]" /> Retread Workshop
                              </div>
                            ) : u.status === 'scrapped' ? (
                              <div className="text-[11px] text-[var(--color-on-surface-variant)] font-semibold flex items-center gap-1">
                                <Archive className="h-3.5 w-3.5 text-[var(--color-error)]" /> Retired / Scrapped
                              </div>
                            ) : u.status === 'sold' ? (
                              <div className="text-[11px] text-[var(--color-on-surface-variant)] font-semibold">Sold out · sale {u.saleNumber || '—'}</div>
                            ) : (
                              <div className="text-[11px] text-[var(--color-on-surface-variant)] font-semibold flex items-center gap-1">
                                <Building className="h-3.5 w-3.5 text-[var(--color-outline)]" />
                                {locationName(u.locationId) || u.locationName || 'Yard'}
                              </div>
                            )}
                          </td>

                          {/* Condition + purchase facts */}
                          <td className="py-3.5 px-3">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                              u.condition === 'excellent'
                                ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                : u.condition === 'good'
                                  ? 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]'
                                  : u.condition === 'worn'
                                    ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                                    : u.condition === 'damaged'
                                      ? 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                                      : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                            }`}>
                              {u.condition || 'unknown'}
                            </span>
                          </td>

                          {/* Procurement */}
                          <td className="py-3.5 px-3 text-[11px] font-semibold text-[var(--color-on-surface-variant)]">
                            {u.purchaseDate ? <div>{u.purchaseDate.split('T')[0]}</div> : null}
                            {u.purchaseCost ? <div className="font-bold text-[var(--color-on-surface)]">{formatCurrency(u.purchaseCost)}</div> : null}
                            {!u.purchaseDate && !u.purchaseCost && '—'}
                          </td>

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

      {/* 2. VIEW TRANSIT — moved here with the Tyre feature split */}
      {activeSubTab === 'transit' && (
        <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-[var(--color-on-surface)] text-lg">Interactive Transit Simulation</h3>
            <p className="text-xs text-[var(--color-on-surface-variant)]">
              Live location estimation of dispatched hot-mix tippers and Bitumen tankers en route.
            </p>
          </div>

          <div className="border border-[var(--color-outline-variant)] rounded-[24px] overflow-hidden bg-[#121316] p-6 text-white min-h-[400px] flex flex-col justify-between relative">
            {/* Compass background grid effect */}
            <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)]" style={{ backgroundSize: '16px 16px' }}></div>

            {/* Sim Plant Base Indicator */}
            <div className="flex justify-between items-start">
              <div className="bg-amber-600/20 border border-amber-500/60 p-3 rounded-2xl text-left max-w-xs space-y-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block">Core Hub</span>
                <p className="font-bold text-xs text-white">APEX BATCH PLANT BASE</p>
                <p className="text-[9px] text-slate-300">Shirwal Bypass, Pune-Satara Road (NH-48)</p>
              </div>

              <div className="text-right space-y-1">
                <p className="text-xs font-bold text-slate-400">STATUS TELEMETRY</p>
                <p className="font-mono text-[10px] text-emerald-400">GPS Link Active • Signal 100%</p>
              </div>
            </div>

            {/* Simulated Live Vehicles on Route Map */}
            <div className="space-y-6 my-10 relative">
              {slips.filter((s) => s.status === 'transit' || s.status === 'loading').length === 0 ? (
                <div className="text-center p-8 text-slate-400 space-y-2">
                  <Navigation2 className="h-8 w-8 text-slate-600 mx-auto animate-bounce" />
                  <p className="text-xs font-bold uppercase text-slate-300">No Vehicles in Transit</p>
                  <p className="text-[10px] text-slate-500 max-w-sm mx-auto">
                    Generate a new outward trip slip from a sales order and dispatch it. It will immediately show up in transit route telemetry here!
                  </p>
                </div>
              ) : (
                slips.filter((s) => s.status === 'transit' || s.status === 'loading').map((slip, i) => {
                  const percent = slip.status === 'loading' ? 0 : 45 + ((i * 20) % 40);
                  return (
                    <div key={slip.id} className="space-y-2 relative">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span className="font-bold">Trip: {slip.slipNumber} • {slip.materialName || 'Materials'}</span>
                        <span className="font-mono text-amber-400">Target: {slip.destination}</span>
                      </div>

                      {/* Map track line */}
                      <div className="h-1.5 bg-slate-800 rounded-full w-full relative">
                        <div
                          className="h-1.5 bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-1000"
                          style={{ width: `${percent}%` }}
                        ></div>

                        <div
                          className="absolute -top-3.5 transition-all duration-1000 -ml-3 cursor-pointer group"
                          style={{ left: `${percent}%` }}
                        >
                          <div className="p-1 bg-amber-500 text-slate-950 rounded-full border border-white shadow shadow-amber-500/50 flex items-center gap-1.5">
                            <Truck className="h-3.5 w-3.5 shrink-0 animate-bounce" />
                            <span className="font-mono text-[9px] font-black">{slip.vehicleNo}</span>
                          </div>

                          <div className="absolute left-1/2 -translate-x-1/2 bottom-8 bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-lg text-left text-[10px] w-48 hidden group-hover:block z-20 space-y-1 leading-normal font-sans text-slate-100">
                            <p className="font-black text-amber-400 text-[11px]">{slip.vehicleNo}</p>
                            <p>Driver: <span className="font-bold text-white">{slip.driverName || '—'}</span></p>
                            <p>Speed: <span className="font-bold font-mono">48 Km/h</span></p>
                            <p>Cargo: <span className="font-bold text-white">{slip.netWeightTonnes} MT</span></p>
                            <p>Status: <span className="font-bold text-emerald-400 uppercase">{slip.status}</span></p>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Plant Base (Loaded)</span>
                        <span className="font-mono text-emerald-400">{percent}% Traveled ({slip.status === 'loading' ? 'In Loading Bay' : 'Active Road'})</span>
                        <span>Site Destination (Unload)</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="text-center text-[10px] text-slate-500 leading-normal border-t border-slate-800 pt-3 flex flex-wrap justify-between">
              <p>🛈 Hover over any truck on the map to inspect vehicle speed, driver credentials, and payload telemetry.</p>
              <p className="font-mono text-slate-400">AUTO-UPDATE INTERVAL: 5S</p>
            </div>
          </div>
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

      {/* 5. REGISTER SERIAL MODAL — a new serial on an existing tyre item */}
      {addSerialOpen && (() => {
        const tyreItemOptions = items.filter((i) => i.type === 'asset' && isTyreItemName(i.name) && i.isActive !== false);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-scrim)]/40 backdrop-blur-xs p-4 overflow-y-auto">
            <form onSubmit={handleAddSerial} className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-xl border border-[var(--color-outline-variant)] max-w-md w-full overflow-hidden my-auto">
              <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
                <div>
                  <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm uppercase tracking-tight flex items-center gap-1.5">
                    <Disc className="h-4.5 w-4.5 text-[var(--color-primary)] animate-spin-slow" />
                    Register Tyre Serial
                  </h3>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                    New serial on a tyre item's unit register.
                  </p>
                </div>
                <button type="button" onClick={() => setAddSerialOpen(false)} className="p-1.5 hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] rounded-full transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Tyre Item *</label>
                  <select
                    required
                    value={addSerialItem}
                    onChange={(e) => setAddSerialItem(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  >
                    <option value="">-- Choose tyre item --</option>
                    {tyreItemOptions.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Serial Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. MRF-90821-X"
                      value={addSerialText}
                      onChange={(e) => setAddSerialText(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none uppercase"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Storage Location</label>
                    <select
                      value={addSerialLocation}
                      onChange={(e) => setAddSerialLocation(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    >
                      <option value="">-- None --</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button type="button" onClick={() => setAddSerialOpen(false)} className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs">
                  Register Serial
                </button>
              </div>
            </form>
          </div>
        );
      })()}
    </div>
  );
};
