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
  FileText,
} from 'lucide-react';
import { Vehicle, TripSlip, CompanySettings, Tyre } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

/**
 * TYRE MANAGEMENT (own sidebar feature, split from Fleet 2026-10-23) — the
 * Tyre Fleet tab (tyre assets, inspection & mounting) and the View Transit
 * tab (transit telemetry) both live under the manage_tyres gate. Vehicles
 * are read here only for the mounting pickers; tyre CRUD is guarded by
 * manage_tyres on the API.
 */
export const TyreManagementView: React.FC = () => {
  // Database States
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [slips, setSlips] = useState<TripSlip[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  // App Navigation & Filter state
  const [activeSubTab, setActiveSubTab] = useState<'tyres' | 'transit'>('tyres');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Creation / Editing Modals for Tyres
  const [isTyreModalOpen, setIsTyreModalOpen] = useState(false);
  const [editingTyre, setEditingTyre] = useState<Tyre | null>(null);

  // Form States - Tyre
  const [formTyreSerial, setFormTyreSerial] = useState('');
  const [formTyreBrand, setFormTyreBrand] = useState('MRF');
  const [formTyreSize, setFormTyreSize] = useState('10.00R20');
  const [formTyreType, setFormTyreType] = useState<'radial' | 'tubeless' | 'bias'>('radial');
  const [formTyreStatus, setFormTyreStatus] = useState<'mounted' | 'available' | 'retreading' | 'scrapped'>('available');
  const [formTyreVehicleId, setFormTyreVehicleId] = useState('');
  const [formTyrePosition, setFormTyrePosition] = useState('');
  const [formTyrePurchaseDate, setFormTyrePurchaseDate] = useState('');
  const [formTyrePurchaseCost, setFormTyrePurchaseCost] = useState('');
  const [formTyreOdometer, setFormTyreOdometer] = useState('');
  const [formTyreThreadDepth, setFormTyreThreadDepth] = useState('');
  const [formTyreCondition, setFormTyreCondition] = useState<'excellent' | 'good' | 'worn' | 'damaged'>('excellent');
  const [formTyreNotes, setFormTyreNotes] = useState('');

  // Load and subscribe to database changes
  const loadData = () => {
    setTyres(localDb.getTyres());
    setVehicles(localDb.getVehicles());
    setSlips(localDb.getTripSlips());
    setSettings(localDb.getSettings());
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

  // Format Helper
  const formatCurrency = (val: number) => {
    const symbol = settings?.currency?.symbol || '₹';
    return `${symbol}${val.toLocaleString('en-IN')}`;
  };

  // Tyre Handlers
  const handleOpenTyreModal = (tyre?: Tyre | null) => {
    if (tyre) {
      setEditingTyre(tyre);
      setFormTyreSerial(tyre.serialNumber);
      setFormTyreBrand(tyre.brand);
      setFormTyreSize(tyre.size);
      setFormTyreType(tyre.type);
      setFormTyreStatus(tyre.status);
      setFormTyreVehicleId(tyre.vehicleId || '');
      setFormTyrePosition(tyre.position || '');
      setFormTyrePurchaseDate(tyre.purchaseDate);
      setFormTyrePurchaseCost(String(tyre.purchaseCost));
      setFormTyreOdometer(tyre.currentOdometer ? String(tyre.currentOdometer) : '');
      setFormTyreThreadDepth(tyre.threadDepthMm ? String(tyre.threadDepthMm) : '');
      setFormTyreCondition(tyre.lastInspectionCondition || 'excellent');
      setFormTyreNotes(tyre.notes || '');
    } else {
      setEditingTyre(null);
      setFormTyreSerial('');
      setFormTyreBrand('MRF');
      setFormTyreSize('10.00R20');
      setFormTyreType('radial');
      setFormTyreStatus('available');
      setFormTyreVehicleId('');
      setFormTyrePosition('');
      setFormTyrePurchaseDate(new Date().toISOString().split('T')[0]);
      setFormTyrePurchaseCost('');
      setFormTyreOdometer('');
      setFormTyreThreadDepth('');
      setFormTyreCondition('excellent');
      setFormTyreNotes('');
    }
    setIsTyreModalOpen(true);
  };

  const handleSaveTyre = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTyreSerial || !formTyreBrand || !formTyreSize) {
      alert('Please fill in serial number, brand, and size.');
      return;
    }

    const linkedVehicle = vehicles.find(v => v.id === formTyreVehicleId);

    const tyreData: Omit<Tyre, 'id' | 'createdAt'> = {
      serialNumber: formTyreSerial.toUpperCase().trim(),
      brand: formTyreBrand.trim(),
      size: formTyreSize.trim(),
      type: formTyreType,
      status: formTyreStatus,
      vehicleId: formTyreStatus === 'mounted' ? (formTyreVehicleId || undefined) : undefined,
      vehicleNo: formTyreStatus === 'mounted' ? (linkedVehicle?.vehicleNo || undefined) : undefined,
      position: formTyreStatus === 'mounted' ? (formTyrePosition || undefined) : undefined,
      purchaseDate: formTyrePurchaseDate || new Date().toISOString().split('T')[0],
      purchaseCost: Number(formTyrePurchaseCost) || 0,
      currentOdometer: Number(formTyreOdometer) || 0,
      installOdometer: editingTyre?.installOdometer || (formTyreStatus === 'mounted' ? Number(formTyreOdometer) || 0 : undefined),
      lastInspectionDate: new Date().toISOString().split('T')[0],
      lastInspectionCondition: formTyreCondition,
      threadDepthMm: Number(formTyreThreadDepth) || undefined,
      notes: formTyreNotes.trim() || undefined,
    };

    if (editingTyre) {
      localDb.updateTyre(editingTyre.id, tyreData);
    } else {
      localDb.addTyre(tyreData);
    }

    setIsTyreModalOpen(false);
  };

  const handleDeleteTyre = (id: string) => {
    if (confirm('Are you sure you want to permanently delete this tyre record?')) {
      localDb.deleteTyre(id);
    }
  };

  // Filters Calculation
  const filteredTyres = useMemo(() => {
    return tyres.filter(t => {
      const matchesSearch =
        t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.size.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.vehicleNo && t.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.notes && t.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tyres, searchQuery, statusFilter]);

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
              {tyres.length}
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

      {/* SEARCH AND FILTER BAR — Add Tyre sits RIGHT of the status filter */}
      {activeSubTab === 'tyres' && (
        <div className="flex flex-col sm:flex-row gap-3 bg-[var(--color-surface-container-lowest)] p-3 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-outline)]" />
            <input
              type="text"
              placeholder="Search tyre serial, brand, size..."
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
              <option value="mounted">Mounted</option>
              <option value="available">Available (Yard)</option>
              <option value="retreading">Retreading</option>
              <option value="scrapped">Scrapped</option>
            </select>
            <button
              onClick={() => handleOpenTyreModal(null)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs transition whitespace-nowrap"
            >
              <Disc className="h-4 w-4" />
              Add Tyre
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENTS */}

      {/* 1. TYRE FLEET MANAGEMENT */}
      {activeSubTab === 'tyres' && (
        <div className="space-y-6">
          {/* Tyre Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Tyre Assets</p>
                <h4 className="text-xl font-black text-[var(--color-on-surface)] mt-1">{tyres.length} units</h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">Active & backup inventory</p>
              </div>
              <div className="p-2.5 bg-[var(--color-surface-container)] rounded-2xl">
                <Disc className="h-5 w-5 text-[var(--color-primary)]" />
              </div>
            </div>

            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Currently Mounted</p>
                <h4 className="text-xl font-black text-[var(--color-warning)] mt-1">
                  {tyres.filter(t => t.status === 'mounted').length} units
                </h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">Mounted on active haulers</p>
              </div>
              <div className="p-2.5 bg-[var(--color-warning-container)] rounded-2xl">
                <Truck className="h-5 w-5 text-[var(--color-on-warning-container)]" />
              </div>
            </div>

            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Spare Yard Stock</p>
                <h4 className="text-xl font-black text-[var(--color-success)] mt-1">
                  {tyres.filter(t => t.status === 'available').length} spares
                </h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">Ready for dispatch / swap</p>
              </div>
              <div className="p-2.5 bg-[var(--color-success-container)] rounded-2xl">
                <Building className="h-5 w-5 text-[var(--color-on-success-container)]" />
              </div>
            </div>

            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Wear & Alert Status</p>
                <h4 className="text-xl font-black text-[var(--color-error)] mt-1">
                  {tyres.filter(t => t.lastInspectionCondition === 'worn' || t.lastInspectionCondition === 'damaged' || (t.threadDepthMm && t.threadDepthMm <= 4.5)).length} units
                </h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1.5 font-medium">Tread ≤ 4.5mm or damaged</p>
              </div>
              <div className="p-2.5 bg-[var(--color-error-container)] rounded-2xl">
                <AlertCircle className="h-5 w-5 text-[var(--color-on-error-container)]" />
              </div>
            </div>
          </div>

          {/* Quick Informational Notice banner */}
          <div className="bg-[var(--color-warning-container)] border border-[var(--color-warning)]/30 rounded-[24px] p-4 flex gap-3 text-left">
            <AlertCircle className="h-5 w-5 text-[var(--color-on-warning-container)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-[var(--color-on-warning-container)] uppercase tracking-wider">Tire Inspection Maintenance Mandate</h5>
              <p className="text-[11px] text-[var(--color-on-warning-container)]/90 leading-normal">
                Tread depths for commercial heavy tippers must be inspected bi-weekly. Active tires with tread depths below 4.0mm are legally non-compliant and must be immediately scheduled for cold retreading or scrap replacement to prevent blowouts during asphalt transit.
              </p>
            </div>
          </div>

          {/* Tyres List Table */}
          {filteredTyres.length === 0 ? (
            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] p-12 text-center shadow-2xs">
              <Disc className="h-10 w-10 text-[var(--color-outline)] mx-auto mb-3 animate-spin-slow" />
              <p className="text-[var(--color-on-surface-variant)] font-medium text-xs">No tyres found matching search/filter terms.</p>
              <button
                onClick={() => handleOpenTyreModal(null)}
                className="mt-4 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-semibold shadow-xs"
              >
                Register Your First Tyre
              </button>
            </div>
          ) : (
            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">Serial / Brand / Type</th>
                      <th className="py-3.5 px-3">Size Dimensions</th>
                      <th className="py-3.5 px-3">Current Assignment / Status</th>
                      <th className="py-3.5 px-3">Tread Level & Condition</th>
                      <th className="py-3.5 px-3 text-right">Running KM</th>
                      <th className="py-3.5 px-3 text-right">Purchase Cost</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]">
                    {filteredTyres.map((tyre) => {
                      const isTreadLow = tyre.threadDepthMm !== undefined && tyre.threadDepthMm <= 4.5;
                      const isDamaged = tyre.lastInspectionCondition === 'damaged' || tyre.lastInspectionCondition === 'worn';

                      return (
                        <tr
                          key={tyre.id}
                          className={`hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)] ${
                            isTreadLow || isDamaged ? 'bg-[var(--color-error-container)]/20' : ''
                          }`}
                        >
                          {/* Serial & Brand */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-black bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface)] px-2 py-0.5 rounded-full uppercase border border-[var(--color-outline-variant)]">
                                  {tyre.serialNumber}
                                </span>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  tyre.status === 'mounted'
                                    ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                                    : tyre.status === 'available'
                                      ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                      : tyre.status === 'retreading'
                                        ? 'bg-[var(--color-info-container)] text-[var(--color-on-info-container)]'
                                        : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                                }`}>
                                  {tyre.status}
                                </span>
                              </div>
                              <div className="text-[11px] font-bold text-[var(--color-on-surface)]">
                                {tyre.brand} <span className="text-[var(--color-on-surface-variant)] font-semibold">• {tyre.type.toUpperCase()}</span>
                              </div>
                            </div>
                          </td>

                          {/* Dimensions */}
                          <td className="py-3.5 px-3 font-semibold text-[var(--color-on-surface)]">
                            {tyre.size}
                          </td>

                          {/* Current Assignment / Status details */}
                          <td className="py-3.5 px-3">
                            {tyre.status === 'mounted' ? (
                              <div className="space-y-0.5 text-left">
                                <span className="font-bold text-[var(--color-on-primary-container)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                  <Truck className="h-3 w-3" /> {tyre.vehicleNo}
                                </span>
                                <p className="text-[10px] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider">{tyre.position}</p>
                              </div>
                            ) : (
                              <div className="text-[11px] text-[var(--color-on-surface-variant)] font-semibold flex items-center gap-1">
                                <Building className="h-3.5 w-3.5 text-[var(--color-outline)]" />
                                {tyre.status === 'available' && 'Yard Idle Spare'}
                                {tyre.status === 'retreading' && 'Retread Workshop'}
                                {tyre.status === 'scrapped' && 'Retired / Scrapped'}
                              </div>
                            )}
                          </td>

                          {/* Tread Depth / Wear visual gauge */}
                          <td className="py-3.5 px-3">
                            <div className="space-y-1.5 max-w-[150px]">
                              <div className="flex justify-between items-center text-[10px] font-bold">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.2 rounded-full ${
                                  tyre.lastInspectionCondition === 'excellent'
                                    ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                    : tyre.lastInspectionCondition === 'good'
                                      ? 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]'
                                      : tyre.lastInspectionCondition === 'worn'
                                        ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                                        : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                                }`}>
                                  {tyre.lastInspectionCondition}
                                </span>
                                {tyre.threadDepthMm !== undefined && (
                                  <span className={isTreadLow ? 'text-[var(--color-error)] font-bold' : 'text-[var(--color-on-surface-variant)]'}>
                                    {tyre.threadDepthMm} mm
                                  </span>
                                )}
                              </div>
                              {tyre.threadDepthMm !== undefined && (
                                <div className="h-1.5 bg-[var(--color-surface-container)] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      tyre.threadDepthMm > 8
                                        ? 'bg-[var(--color-success)]'
                                        : tyre.threadDepthMm > 4.5
                                          ? 'bg-[var(--color-warning)]'
                                          : 'bg-[var(--color-error)]'
                                    }`}
                                    style={{ width: `${Math.min(100, (tyre.threadDepthMm / 14) * 100)}%` }}
                                  ></div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Running KM */}
                          <td className="py-3.5 px-3 text-right font-bold text-[var(--color-on-surface)]">
                            {(tyre.currentOdometer || 0).toLocaleString()} KM
                          </td>

                          {/* Purchase Cost */}
                          <td className="py-3.5 px-3 text-right font-bold text-[var(--color-on-surface)]">
                            {formatCurrency(tyre.purchaseCost)}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <button
                                onClick={() => handleOpenTyreModal(tyre)}
                                className="px-2.5 py-1 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] font-bold rounded-full text-[10px] transition shadow-2xs"
                              >
                                Edit
                              </button>

                              {tyre.status === 'mounted' ? (
                                <button
                                  onClick={() => {
                                    if (confirm('Unmount this tyre and return it to spare yard stock?')) {
                                      localDb.updateTyre(tyre.id, {
                                        status: 'available',
                                        vehicleId: undefined,
                                        vehicleNo: undefined,
                                        position: undefined
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-[var(--color-warning-container)] hover:opacity-90 text-[var(--color-on-warning-container)] font-bold rounded-full text-[10px] transition"
                                >
                                  Unmount
                                </button>
                              ) : tyre.status === 'available' ? (
                                <button
                                  onClick={() => {
                                    handleOpenTyreModal({
                                      ...tyre,
                                      status: 'mounted',
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-[var(--color-success-container)] hover:opacity-90 text-[var(--color-on-success-container)] font-bold rounded-full text-[10px] transition"
                                >
                                  Mount
                                </button>
                              ) : null}

                              {tyre.status !== 'retreading' && tyre.status !== 'scrapped' && (
                                <button
                                  onClick={() => {
                                    if (confirm('Send this tyre casing to the external workshop for retreading?')) {
                                      localDb.updateTyre(tyre.id, {
                                        status: 'retreading',
                                        vehicleId: undefined,
                                        vehicleNo: undefined,
                                        position: undefined,
                                        lastInspectionCondition: 'excellent'
                                      });
                                    }
                                  }}
                                  className="p-1 text-[var(--color-on-surface-variant)] hover:text-[var(--color-info)] hover:bg-[var(--color-surface-container)] rounded-full transition"
                                  title="Send to Retread"
                                >
                                  <TrendingUp className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {tyre.status !== 'scrapped' && (
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to Scrap and retire this tyre from active fleet usage?')) {
                                      localDb.updateTyre(tyre.id, {
                                        status: 'scrapped',
                                        vehicleId: undefined,
                                        vehicleNo: undefined,
                                        position: undefined,
                                        lastInspectionCondition: 'damaged',
                                        threadDepthMm: 1.0
                                      });
                                    }
                                  }}
                                  className="p-1 text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-surface-container)] rounded-full transition"
                                  title="Scrap Tyre"
                                >
                                  <X className="h-3.5 w-3.5 text-[var(--color-error)]" />
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteTyre(tyre.id)}
                                className="p-1 text-[var(--color-error)] hover:bg-[var(--color-error-container)] rounded-full transition-all"
                                title="Delete Record"
                              >
                                <X className="h-3.5 w-3.5" />
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
              {slips.filter(s => s.status === 'transit' || s.status === 'loading').length === 0 ? (
                <div className="text-center p-8 text-slate-400 space-y-2">
                  <Navigation2 className="h-8 w-8 text-slate-600 mx-auto animate-bounce" />
                  <p className="text-xs font-bold uppercase text-slate-300">No Vehicles in Transit</p>
                  <p className="text-[10px] text-slate-500 max-w-sm mx-auto">
                    Generate a new outward trip slip from a sales order and dispatch it. It will immediately show up in transit route telemetry here!
                  </p>
                </div>
              ) : (
                slips.filter(s => s.status === 'transit' || s.status === 'loading').map((slip, i) => {
                  const percent = slip.status === 'loading' ? 0 : 45 + (i * 20) % 40;
                  return (
                    <div key={slip.id} className="space-y-2 relative">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span className="font-bold">Trip: {slip.slipNumber} • {slip.materialName || 'Materials'}</span>
                        <span className="font-mono text-amber-400">Target: {slip.destination}</span>
                      </div>

                      {/* Map track line */}
                      <div className="h-1.5 bg-slate-800 rounded-full w-full relative">
                        {/* Progress line */}
                        <div
                          className="h-1.5 bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-1000"
                          style={{ width: `${percent}%` }}
                        ></div>

                        {/* Active Moving Truck Pin */}
                        <div
                          className="absolute -top-3.5 transition-all duration-1000 -ml-3 cursor-pointer group"
                          style={{ left: `${percent}%` }}
                        >
                          <div className="p-1 bg-amber-500 text-slate-950 rounded-full border border-white shadow shadow-amber-500/50 flex items-center gap-1.5">
                            <Truck className="h-3.5 w-3.5 shrink-0 animate-bounce" />
                            <span className="font-mono text-[9px] font-black">{slip.vehicleNo}</span>
                          </div>

                          {/* Hover Telemetry Card */}
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

            {/* Sim Info Banner */}
            <div className="text-center text-[10px] text-slate-500 leading-normal border-t border-slate-800 pt-3 flex flex-wrap justify-between">
              <p>🛈 Hover over any truck on the map to inspect vehicle speed, driver credentials, and payload telemetry.</p>
              <p className="font-mono text-slate-400">AUTO-UPDATE INTERVAL: 5S</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. TYRE REGISTRATION / INSPECTION MODAL */}
      {isTyreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-scrim)]/40 backdrop-blur-xs p-4 overflow-y-auto">
          {/* my-auto (not my-8): centres when short, collapses to 0 on overflow
              so the card never clips its top on a short window */}
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-xl border border-[var(--color-outline-variant)] max-w-lg w-full overflow-hidden my-auto">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div>
                <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm uppercase tracking-tight flex items-center gap-1.5">
                  <Disc className="h-4.5 w-4.5 text-[var(--color-primary)] animate-spin-slow" />
                  {editingTyre ? 'Inspect & Edit Tyre' : 'Register New Tyre'}
                </h3>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                  {editingTyre ? `Serial: ${editingTyre.serialNumber}` : 'Add a brand new tyre record to the tyre fleet.'}
                </p>
              </div>
              <button
                onClick={() => setIsTyreModalOpen(false)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] rounded-full transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTyre}>
              <div className="p-5 space-y-4 text-left max-h-[480px] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  {/* Serial Number */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Serial Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. MRF-90821-X"
                      value={formTyreSerial}
                      onChange={(e) => setFormTyreSerial(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      required
                    />
                  </div>

                  {/* Brand */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Brand *</label>
                    <select
                      value={formTyreBrand}
                      onChange={(e) => setFormTyreBrand(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      required
                    >
                      <option value="MRF">MRF</option>
                      <option value="Apollo">Apollo</option>
                      <option value="Bridgestone">Bridgestone</option>
                      <option value="Michelin">Michelin</option>
                      <option value="JK Tyre">JK Tyre</option>
                      <option value="CEAT">CEAT</option>
                      <option value="Other">Other / Imported</option>
                    </select>
                  </div>

                  {/* Size */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Size *</label>
                    <input
                      type="text"
                      placeholder="e.g. 10.00R20"
                      value={formTyreSize}
                      onChange={(e) => setFormTyreSize(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      required
                    />
                  </div>

                  {/* Type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Type</label>
                    <select
                      value={formTyreType}
                      onChange={(e) => setFormTyreType(e.target.value as any)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    >
                      <option value="radial">Radial (Steel Belted)</option>
                      <option value="tubeless">Tubeless (Premium)</option>
                      <option value="bias">Bias Ply (Nylon)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--color-outline-variant)]">
                  {/* Status */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Status</label>
                    <select
                      value={formTyreStatus}
                      onChange={(e) => {
                        const nextStatus = e.target.value as any;
                        setFormTyreStatus(nextStatus);
                        if (nextStatus !== 'mounted') {
                          setFormTyreVehicleId('');
                          setFormTyrePosition('');
                        }
                      }}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    >
                      <option value="available">Available (Spare Stock)</option>
                      <option value="mounted">Mounted on Vehicle</option>
                      <option value="retreading">In Retreading Yard</option>
                      <option value="scrapped">Scrapped / Retired</option>
                    </select>
                  </div>

                  {/* Last Inspection Condition */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Inspection Condition</label>
                    <select
                      value={formTyreCondition}
                      onChange={(e) => setFormTyreCondition(e.target.value as any)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    >
                      <option value="excellent">Excellent (New/Retreaded)</option>
                      <option value="good">Good (Normal Wear)</option>
                      <option value="worn">Worn (Low Tread)</option>
                      <option value="damaged">Damaged (Sidewall/Cut)</option>
                    </select>
                  </div>
                </div>

                {/* Mounted Options conditionally shown */}
                {formTyreStatus === 'mounted' && (
                  <div className="grid grid-cols-2 gap-4 p-3 bg-[var(--color-primary-container)]/20 rounded-2xl border border-[var(--color-outline-variant)]">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-extrabold text-[var(--color-primary)] uppercase">Select Vehicle *</label>
                      <select
                        value={formTyreVehicleId}
                        onChange={(e) => setFormTyreVehicleId(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                        required={formTyreStatus === 'mounted'}
                      >
                        <option value="">-- Choose Vehicle --</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.vehicleNo} [{v.type.toUpperCase()}]
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-extrabold text-[var(--color-primary)] uppercase">Mount Position *</label>
                      <select
                        value={formTyrePosition}
                        onChange={(e) => setFormTyrePosition(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                        required={formTyreStatus === 'mounted'}
                      >
                        <option value="">-- Select Position --</option>
                        <option value="Front-Left (FL)">Front-Left (FL)</option>
                        <option value="Front-Right (FR)">Front-Right (FR)</option>
                        <option value="Rear-Left-Outer (RLO)">Rear-Left-Outer (RLO)</option>
                        <option value="Rear-Left-Inner (RLI)">Rear-Left-Inner (RLI)</option>
                        <option value="Rear-Right-Outer (RRO)">Rear-Right-Outer (RRO)</option>
                        <option value="Rear-Right-Inner (RRI)">Rear-Right-Inner (RRI)</option>
                        <option value="Spare (Cab Mounted)">Spare (Cab Mounted)</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--color-outline-variant)]">
                  {/* Purchase Date */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Purchase Date</label>
                    <input
                      type="date"
                      value={formTyrePurchaseDate}
                      onChange={(e) => setFormTyrePurchaseDate(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    />
                  </div>

                  {/* Purchase Cost */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Purchase Cost (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 18500"
                      value={formTyrePurchaseCost}
                      onChange={(e) => setFormTyrePurchaseCost(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--color-outline-variant)]">
                  {/* Thread Depth */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Tread Depth (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 12.5"
                      value={formTyreThreadDepth}
                      onChange={(e) => setFormTyreThreadDepth(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    />
                  </div>

                  {/* Current Odometer */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Running Mileage (KM)</label>
                    <input
                      type="number"
                      placeholder="e.g. 24300"
                      value={formTyreOdometer}
                      onChange={(e) => setFormTyreOdometer(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--color-outline-variant)]">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Log Notes & Remarks</label>
                  <textarea
                    rows={2}
                    placeholder="Describe tread wear, alignment checks, puncture history, or casing defects..."
                    value={formTyreNotes}
                    onChange={(e) => setFormTyreNotes(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsTyreModalOpen(false)}
                  className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs"
                >
                  {editingTyre ? 'Update Record' : 'Register Tyre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};