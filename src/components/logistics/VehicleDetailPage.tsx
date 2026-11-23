import React, { useState } from 'react';
import {
  ArrowLeft, Pencil, Truck, Fuel, Route, IndianRupee, Wrench,
  Landmark, CalendarClock, Layers, Paperclip, LayoutDashboard, User, Disc, Plus, Undo2, X,
} from 'lucide-react';
import {
  Vehicle, Sale, TripSlip,
  TYRE_POSITIONS, TYRE_POSITION_LABELS, TyrePosition, InventoryUnit, isTyreItemName,
} from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { EntityDocumentsSection } from '../common/EntityDocumentsSection';

interface VehicleDetailPageProps {
  vehicle: Vehicle;
  /** Sales masters — the trips' RST numbers resolve + open the order story */
  sales: Sale[];
  onBack: () => void;
  /** Open the vehicle's add/edit form (LogisticsView: handleOpenVehicleModal) */
  onEdit: (vehicle: Vehicle) => void;
  /** Open a trip's linked sales order as the story modal (viewingOrderSaleId) */
  onOpenRst: (saleId: string) => void;
}

/**
 * FULL VEHICLE PROFILE PAGE — the Fleet mirror of the party/employee profiles:
 * clicking a plate in the Vehicles table replaces the tab content with this
 * page (Back returns to the list). Everything about the vehicle in ordered
 * sections: the story numbers (spend / diesel / KM run / trips), every master
 * field the edit form carries, the loan/EMI ledger, the FULL expenses log, the
 * FULL trip-slips table (their RST numbers open the linked sales order's
 * story modal, same as the trips tab) and the vehicle's documents.
 * All reads funnel through cloudStore — live with syncs.
 */
export function VehicleDetailPage({ vehicle, sales, onBack, onEdit, onOpenRst }: VehicleDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tyres' | 'expenses' | 'trips' | 'documents'>('overview');
  // TYRE DIAGRAM state — 'fit' selects a spare serial for one empty slot;
  // 'unload' shows a fitted serial with its unload action.
  const [tyreModal, setTyreModal] = useState<
    { mode: 'fit'; position: TyrePosition } | { mode: 'unload'; unitId: string } | null
  >(null);
  const [fitUnitId, setFitUnitId] = useState('');
  const [fitOdometer, setFitOdometer] = useState('');
  const [fitNotes, setFitNotes] = useState('');

  // LIVE reads — recomputed on every render (the parent LogisticsView
  // re-renders on each cloudStore tick). Memoizing on vehicle.id would go
  // stale mid-page: a saved expense/EMI/trip must show up in place.
  const emiEntries = localDb.getVehicleEmiEntries().filter((e) => e.vehicleId === vehicle.id);
  const expenses = localDb
    .getVehicleExpenses()
    .filter((e) => e.vehicleId === vehicle.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const slips = localDb
    .getTripSlips()
    .filter((s) => s.vehicleId === vehicle.id)
    .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`));
  const employees = localDb.getEmployees();
  const accounts = localDb.getAccounts();
  const parties = localDb.getParties();
  const settings = localDb.getSettings();

  // --- TYRE FITMENT data (2026-11-17) — the vehicle's 12-position dumper ---
  const items = localDb.getItems();
  const unitAll = localDb.getInventoryUnits();
  const locations = localDb.getLocations();
  const itemById = new Map(items.map((i) => [i.id, i]));
  // Tyre units = serials of tyre-named asset items ("tyre"/"tyres" word match)
  const isTyreUnit = (u: InventoryUnit) => isTyreItemName(itemById.get(u.itemId)?.name);
  const fittedTyres = unitAll.filter(
    (u) => u.vehicleId === vehicle.id && u.status === 'deployed' && isTyreUnit(u),
  );
  // Position → unit map for the diagram (server guarantees one per position)
  const tyreByPos = new Map<string, InventoryUnit>();
  fittedTyres.forEach((u) => {
    if (u.position) tyreByPos.set(String(u.position).toUpperCase(), u);
  });
  const fittedTyreCount = fittedTyres.length;
  // OTHER trackable units riding this vehicle — no position (client directive)
  const otherFitted = unitAll.filter(
    (u) => u.vehicleId === vehicle.id && u.status === 'deployed' && !isTyreUnit(u),
  );
  // Spare yard stock — every in-stock tyre serial (any tyre item)
  const spareTyres = unitAll
    .filter((u) => u.status === 'in_stock' && isTyreUnit(u))
    .sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
  const tyreConditionRing: Record<string, string> = {
    excellent: 'border-[var(--color-success)]',
    good: 'border-[var(--color-primary)]',
    worn: 'border-[var(--color-warning)]',
    damaged: 'border-[var(--color-error)]',
  };
  const tyreConditionTone: Record<string, string> = {
    excellent: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]',
    good: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]',
    worn: 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]',
    damaged: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]',
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);

  // --- The story numbers (same definitions as prior agreement) ---
  const totalSpend = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const dieselEntries = expenses.filter((e) => e.entryType === 'diesel');
  const litres = dieselEntries.reduce((sum, e) => sum + (Number(e.litres) || 0), 0);
  const kmRun = slips.reduce((sum, s) => sum + (Number(s.distanceKm) || 0), 0);
  const deliveredTrips = slips.filter((s) => s.status === 'delivered' || s.status === 'closed').length;
  const kmPerLitre = litres > 0 && kmRun > 0 ? kmRun / litres : undefined;

  const driver = vehicle.currentDriverId ? employees.find((e) => e.id === vehicle.currentDriverId) : undefined;
  const debitAccount = accounts.find((a) => a.id === vehicle.emiDetails?.emiAccountId);
  const emi = vehicle.emiDetails;
  const hasLoan = Boolean(emi?.hasEmi);
  const paidEmis = (Number(emi?.paidEmisCount) || 0) + emiEntries.length;
  const tenure = Number(emi?.totalTenureMonths) || 0;
  const progress = tenure > 0 ? Math.min(100, Math.round((paidEmis / tenure) * 100)) : 0;

  /** ONE wheel slot of the diagram: a fitted serial (ring coloured by
   *  condition, click → unload card) or an empty dashed slot (click → fit). */
  const renderTyreSlot = (pos: TyrePosition) => {
    const unit = tyreByPos.get(pos);
    if (unit) {
      const cond = unit.condition || 'good';
      const itemName = itemById.get(unit.itemId)?.name || '';
      return (
        <button
          key={`slot-${pos}`}
          type="button"
          onClick={() => setTyreModal({ mode: 'unload', unitId: unit.id })}
          className="group flex flex-col items-center gap-1"
          title={`${unit.serialNumber} · ${itemName} · ${cond}${unit.fitOdometer ? ` · fitted @ ${unit.fitOdometer.toLocaleString('en-IN')} km` : ''}`}
        >
          <span className={`w-16 h-16 rounded-full bg-[var(--color-surface-container-lowest)] border-[3px] ${tyreConditionRing[cond]} flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform`}>
            <span className="font-mono text-[9px] font-black text-[var(--color-on-surface)] text-center leading-tight px-1 truncate max-w-[56px]">{unit.serialNumber}</span>
          </span>
          <span className="text-[9px] font-black uppercase tracking-wider text-[var(--color-primary)]">{pos}</span>
        </button>
      );
    }
    return (
      <button
        key={`slot-${pos}`}
        type="button"
        onClick={() => {
          setFitUnitId('');
          setFitOdometer('');
          setFitNotes('');
          setTyreModal({ mode: 'fit', position: pos });
        }}
        className="group flex flex-col items-center gap-1"
        title={`Fit a spare tyre at ${TYRE_POSITION_LABELS[pos]}`}
      >
        <span className="w-16 h-16 rounded-full border-2 border-dashed border-[var(--color-outline)] bg-transparent flex items-center justify-center text-[var(--color-outline)] group-hover:border-[var(--color-primary)] group-hover:text-[var(--color-primary)] group-hover:scale-105 transition-all">
          <Plus className="w-4.5 h-4.5" />
        </span>
        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] group-hover:text-[var(--color-primary)]">{pos}</span>
      </button>
    );
  };

  // --- TYRE DIAGRAM actions (fit from spare stock / unload to stock) ---
  const handleFitSerial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tyreModal || tyreModal.mode !== 'fit' || !fitUnitId) return;
    localDb.deployInventoryUnit(fitUnitId, {
      vehicleId: vehicle.id,
      position: tyreModal.position,
      odometer: fitOdometer === '' ? undefined : Number(fitOdometer),
      notes: fitNotes.trim() || undefined,
    });
    setTyreModal(null);
    setFitUnitId('');
    setFitOdometer('');
    setFitNotes('');
  };

  const handleUnloadSerial = (unitId: string) => {
    localDb.returnInventoryUnit(unitId, {});
    setTyreModal(null);
  };

  const insuranceDaysLeft = vehicle.insuranceExpiry
    ? Math.round((Date.parse(`${vehicle.insuranceExpiry}T00:00:00Z`) - Date.now()) / 86_400_000)
    : undefined;

  const statusTone: Record<string, string> = {
    available: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]',
    on_trip: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]',
    maintenance: 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]',
    out_of_service: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]',
  };

  const TABS: Array<{ id: 'overview' | 'tyres' | 'expenses' | 'trips' | 'documents'; label: string; icon: any; count?: string }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'tyres', label: 'Tyres', icon: Disc, count: String(fittedTyreCount) },
    { id: 'expenses', label: 'Expenses', icon: Wrench, count: String(expenses.length) },
    { id: 'trips', label: 'Trips', icon: Route, count: String(slips.length) },
    { id: 'documents', label: 'Documents', icon: Paperclip },
  ];

  const DetailCell = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) => (
    <div className={wide ? 'col-span-2 sm:col-span-3' : ''}>
      <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)]">{label}</p>
      <div className="text-xs font-bold text-[var(--color-on-surface)] mt-1">{children}</div>
    </div>
  );

  const KpiCard = ({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub?: string; tone?: string }) => (
    <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone || 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)]">{label}</p>
        <p className="text-base font-black text-[var(--color-on-surface)] truncate">{value}</p>
        {sub && <p className="text-[9px] font-semibold text-[var(--color-on-surface-variant)] truncate">{sub}</p>}
      </div>
    </div>
  );

  /** Resolves a slip's linked sale the way the trips tab does (saleId FK
   *  first, RST number as fallback) */
  const saleOfSlip = (slip: TripSlip) =>
    (slip.saleId ? sales.find((s) => s.id === slip.saleId) : undefined) ||
    (slip.orderNumber ? sales.find((s) => s.saleNumber === slip.orderNumber) : undefined);

  // --- Trip-tab parity helpers (identical definitions to the trips tab) ---

  /** The slip's TRANSPORT TOTAL (₹, excl. GST): a sale carrying charges shows
   *  them; an excluded sale shows its computed w × d × rate; outsourced/no
   *  sale contributes 0. */
  const transportOfSlip = (sale?: Sale): number => {
    if (!sale) return 0;
    const rate = Number((sale as any).freightRatePerTonne) || 0;
    const charged = Number(sale.transportCharges) || 0;
    const computed = Math.round(
      (Number(sale.weightTonnes) || 0) * (Number(sale.distanceKm) || 0) * rate * 100
    ) / 100;
    return charged > 0 ? charged : (rate > 0 ? computed : 0);
  };

  /** The party's REGISTERED name (never tradeName) — resolved by the FK at
   *  read; hydration fallbacks carry it when the master isn't present. */
  const partyOfSlip = (s: TripSlip, sale?: Sale): string => {
    const pid = sale?.partyId || s.partyId;
    const party = pid ? parties.find((p) => p.id === pid) : undefined;
    return party ? party.name : (sale?.partyName || s.partyName || '—');
  };

  return (
    <div className="space-y-6" id="vehicle-profile-page">
      {/* 1. HERO — back to the fleet list, plate, chips, actions */}
      <div className="rounded-3xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full font-medium transition-colors shrink-0"
              title="Back to the Vehicles list"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fleet</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center shrink-0">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="font-mono text-xl font-black text-[var(--color-on-surface)] tracking-wider">{vehicle.vehicleNo}</h1>
                    
                    <span className="text-[10px] font-bold uppercase text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] px-2.5 py-0.5 rounded-full capitalize">
                      {vehicle.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-1">
                    Vehicle profile · {driver ? `driver ${driver.name}` : 'no driver assigned'}
                    {vehicle.ownership ? ` · ${vehicle.ownership}` : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onEdit(vehicle)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all hover:scale-[1.01] active:scale-[0.99] shrink-0"
            title="Edit this vehicle's details / loan / EMI"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Vehicle
          </button>
        </div>
      </div>

      {/* 2. STORY NUMBERS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={IndianRupee}
          label="Total Spent"
          value={formatCurrency(totalSpend)}
          sub={`${expenses.length} expense entr${expenses.length === 1 ? 'y' : 'ies'}`}
          tone="bg-[var(--color-error-container)] text-[var(--color-on-error-container)]"
        />
        <KpiCard
          icon={Fuel}
          label="Diesel"
          value={`${litres.toLocaleString('en-IN')} L`}
          sub={`${dieselEntries.length} fill${dieselEntries.length === 1 ? '' : 's'}${kmPerLitre ? ` · ${kmPerLitre.toFixed(1)} km/L` : ''}`}
          tone="bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]"
        />
        <KpiCard
          icon={Route}
          label="KM Moved"
          value={`${Math.round(kmRun).toLocaleString('en-IN')} km`}
          sub="Σ all trip slips' distance"
          tone="bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]"
        />
        <KpiCard
          icon={Layers}
          label="Trips"
          value={String(slips.length)}
          sub={`${Math.max(0, slips.length - deliveredTrips)} open · ${deliveredTrips} delivered/closed`}
          tone="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]"
        />
      </div>

      {/* 3. SECTION TABS */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map((t) => {
          const TIcon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-bold transition-all border ${
                active
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)] shadow-xs'
                  : 'bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              <TIcon className="w-3.5 h-3.5" />
              {t.label}
              {t.count !== undefined && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-[var(--color-surface-container-high)]'}`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4a. OVERVIEW — every master field + the loan/EMI ledger */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <DetailCell label="Type"><span className="capitalize">{vehicle.type}</span></DetailCell>
            <DetailCell label="Capacity">
              {vehicle.capacityTonnes ? `${vehicle.capacityTonnes.toLocaleString('en-IN')} MT` : '—'}
            </DetailCell>
            <DetailCell label="Ownership">
              {vehicle.ownership ? <span className="capitalize">{vehicle.ownership}</span> : '—'}
            </DetailCell>
            <DetailCell label="Current Driver">
              {driver ? (
                <span>
                  {driver.name}
                  {driver.salaryBase ? (
                    <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] ml-1.5">
                      {formatCurrency(driver.salaryBase)}/{driver.salaryType === 'daily' ? 'day' : 'mo'}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-[var(--color-on-surface-variant)] font-normal">Unassigned</span>
              )}
            </DetailCell>
            <DetailCell label="Insurance">
              {vehicle.insuranceMonthlyAmount || vehicle.insuranceExpiry ? (
                <span className={insuranceDaysLeft !== undefined && insuranceDaysLeft < 30 ? 'text-[var(--color-warning)]' : ''}>
                  {vehicle.insuranceMonthlyAmount ? `${formatCurrency(vehicle.insuranceMonthlyAmount)}/mo` : ''}
                  {vehicle.insuranceExpiry ? `${vehicle.insuranceMonthlyAmount ? ' · ' : ''}exp ${vehicle.insuranceExpiry}` : ''}
                </span>
              ) : '—'}
            </DetailCell>
            <DetailCell label="Fitness Certificate">
              {vehicle.fitnessExpiry ? (
                <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3 text-[var(--color-outline)]" />{vehicle.fitnessExpiry}</span>
              ) : '—'}
            </DetailCell>
            <DetailCell label="Registered On" wide>
              {(vehicle.createdAt || '').split('T')[0] || '—'}
            </DetailCell>
            {vehicle.notes && (
              <DetailCell label="Notes" wide>
                <span className="font-medium text-[var(--color-on-surface-variant)] whitespace-pre-wrap">{vehicle.notes}</span>
              </DetailCell>
            )}
          </div>

          {/* Loan / EMI ledger */}
          <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] overflow-hidden">
            <div className="px-4 py-3 bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" /> Loan / EMI Ledger
              </p>
              {hasLoan && (
                <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${emi?.status === 'closed' ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]' : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'}`}>
                  {emi?.status || 'active'}
                </span>
              )}
            </div>
            {hasLoan ? (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <DetailCell label="Financier">{emi?.financierName || '—'}</DetailCell>
                  <DetailCell label="Loan A/c No."><span className="font-mono">{emi?.loanAccountNumber || '—'}</span></DetailCell>
                  <DetailCell label="Total Loan">{emi?.totalLoanAmount ? formatCurrency(emi.totalLoanAmount) : '—'}</DetailCell>
                  <DetailCell label="Monthly EMI">{emi?.monthlyEmiAmount ? formatCurrency(emi.monthlyEmiAmount) : '—'}</DetailCell>
                  <DetailCell label="Due Day">{emi?.emiDueDay ? `${emi.emiDueDay} of month` : '—'}</DetailCell>
                  <DetailCell label="Loan Start">{emi?.loanStartDate || '—'}</DetailCell>
                  <DetailCell label="Tenure">{tenure ? `${tenure} months` : '—'}</DetailCell>
                  <DetailCell label="Paid">{paidEmis} instalment{paidEmis === 1 ? '' : 's'}{(Number(emi?.paidEmisCount) || 0) > 0 && emiEntries.length > 0 ? ' (master + posted)' : emiEntries.length > 0 ? ' (incl. posted entries)' : ''}</DetailCell>
                  <DetailCell label="Debit Account">{debitAccount ? debitAccount.name : (emi?.autoDebitAccount || '—')}</DetailCell>
                </div>
                {tenure > 0 && (
                  <div>
                    <div className="flex justify-between text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                      <span>EMI Progress</span>
                      <span>{paidEmis}/{tenure} · {progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--color-surface-container-highest)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
                {emi?.notes && (
                  <p className="text-[10px] text-[var(--color-on-surface-variant)] whitespace-pre-wrap border-t border-[var(--color-outline-variant)]/60 pt-2">{emi.notes}</p>
                )}
              </div>
            ) : (
              <p className="px-4 py-4 text-[11px] text-[var(--color-on-surface-variant)]">No loan / EMI is set on this vehicle.</p>
            )}
          </div>
        </div>
      )}

      {/* 4b. TYRES — the top-down 12-tyre dumper diagram (2026-11-17).
          Every slot shows exactly which serial sits on that wheel; empty
          slots fit from spare yard stock, fitted slots unload to stock. */}
      {activeTab === 'tyres' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] flex items-center gap-1.5">
                <Disc className="w-3.5 h-3.5" /> Tyre Fitment Diagram — 12-Tyre Dumper Layout
              </p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-on-surface-variant)]">
                <span className="px-2 py-0.5 rounded-full bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">{fittedTyreCount} / 12 fitted</span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">{spareTyres.length} in spare stock</span>
              </div>
            </div>

            <div className="max-w-xl mx-auto flex flex-col items-center gap-4 py-2">
              {/* FRONT AXLE — steer pair around the cab (view from above) */}
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 w-full">
                {renderTyreSlot('FL')}
                <div className="h-10 rounded-xl bg-[var(--color-surface-container-highest)] flex items-center justify-center gap-2 text-[var(--color-on-surface)]">
                  <Truck className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Cab · Front Axle</span>
                </div>
                {renderTyreSlot('FR')}
              </div>

              <div className="w-1.5 h-5 bg-[var(--color-surface-container-highest)] rounded-full" />

              {/* REAR BODY — five axle pairs (L1..L5 on the left, R1..R5 right) */}
              <div className="w-full rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] p-4 space-y-4">
                <p className="text-center text-[9px] font-black uppercase tracking-widest text-[var(--color-on-surface-variant)]">Dumper Body · Rear Axles 1–5</p>
                {[1, 2, 3, 4, 5].map((axle) => (
                  <div key={axle} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                    {renderTyreSlot(`L${axle}` as TyrePosition)}
                    <div className="h-1.5 rounded-full bg-[var(--color-surface-container-highest)] relative">
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase tracking-widest text-[var(--color-outline)] px-1.5">Axle {axle}</span>
                    </div>
                    {renderTyreSlot(`R${axle}` as TyrePosition)}
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-[var(--color-on-surface-variant)] text-center max-w-sm">
                View from above · front (FL/FR) at the top. Ring colour = last know condition; click a fitted serial to unload it, or an empty slot to fit a spare.
              </p>
            </div>

            {/* Spare serials quick list — direct fit targets */}
            {spareTyres.length === 0 ? (
              <p className="text-center text-[11px] text-[var(--color-on-surface-variant)] mt-2">
                No tyre serials in spare stock — register tyre serials on a tyre item in the Items module.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2 pt-3 border-t border-[var(--color-outline-variant)]/60">
                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] mr-1">Spares:</span>
                {spareTyres.slice(0, 12).map((u) => {
                  const cond = u.condition || 'good';
                  return (
                    <span key={u.id} className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded-full border border-[var(--color-outline-variant)] ${tyreConditionTone[cond]}`}>
                      {u.serialNumber}
                    </span>
                  );
                })}
                {spareTyres.length > 12 && (
                  <span className="text-[9px] font-bold text-[var(--color-on-surface-variant)]">+{spareTyres.length - 12} more</span>
                )}
              </div>
            )}
          </div>

          {/* OTHER trackable units on this vehicle — no position (client rule) */}
          <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] overflow-clip">
            <div className="px-4 py-3 bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Other Equipment on Board
              </p>
              <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)]">{otherFitted.length} unit{otherFitted.length === 1 ? '' : 's'} · no wheel position</span>
            </div>
            {otherFitted.length === 0 ? (
              <p className="px-4 py-5 text-center text-[11px] text-[var(--color-on-surface-variant)]">No other trackable units are assigned to this vehicle.</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wider text-[var(--color-on-surface-variant)] border-b border-[var(--color-outline-variant)]/50">
                    <th className="py-2 px-4">Serial</th>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-3">Condition</th>
                    <th className="py-2 px-3">Storage Location</th>
                    <th className="py-2 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/40">
                  {otherFitted.map((u) => (
                    <tr key={u.id} className="text-[11px]">
                      <td className="py-2.5 px-4 font-mono font-black text-[var(--color-on-surface)]">{u.serialNumber}</td>
                      <td className="py-2.5 px-3 font-semibold text-[var(--color-on-surface)]">{itemById.get(u.itemId)?.name || '—'}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${tyreConditionTone[u.condition || 'good']}`}>{u.condition || 'good'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--color-on-surface-variant)]">
                        {u.locationId ? (locations.find((l) => l.id === u.locationId)?.name || '—') : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleUnloadSerial(u.id)}
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] hover:opacity-90 transition"
                          title="Remove this unit from the vehicle back to stock"
                        >
                          <span className="inline-flex items-center gap-1"><Undo2 className="w-3 h-3" /> Unload</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 4c. EXPENSES — the vehicle's full money-spent log */}
      {activeTab === 'expenses' && (
        <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] overflow-clip">
          <div className="px-4 py-3 bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" /> Expenses — {expenses.length} entr{expenses.length === 1 ? 'y' : 'ies'}
            </p>
            <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">Total {formatCurrency(totalSpend)}</p>
          </div>
          {expenses.length === 0 ? (
            <p className="px-4 py-10 text-center text-[11px] text-[var(--color-on-surface-variant)]">No expenses recorded on this vehicle.</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-[var(--color-on-surface-variant)] border-b border-[var(--color-outline-variant)]/50">
                  <th className="py-2 px-4">Date</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Diesel</th>
                  <th className="py-2 px-3">Remarks</th>
                  <th className="py-2 px-3">Account</th>
                  <th className="py-2 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]/40">
                {expenses.map((e) => {
                  const acc = e.accountId ? accounts.find((a) => a.id === e.accountId) : undefined;
                  return (
                    <tr key={e.id} className="text-[11px]">
                      <td className="py-2.5 px-4 font-semibold text-[var(--color-on-surface-variant)] whitespace-nowrap">{e.date}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${e.entryType === 'diesel' ? 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'}`}>
                          {e.entryType === 'diesel' ? 'Diesel' : (e.expenseType || 'Expense')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--color-on-surface-variant)] whitespace-nowrap">
                        {e.entryType === 'diesel' && Number(e.litres) > 0
                          ? `${Number(e.litres).toLocaleString('en-IN')} L @ ${formatCurrency(e.ratePerLitre || 0)}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--color-on-surface-variant)] max-w-[220px] truncate" title={e.notes}>{e.notes || '—'}</td>
                      <td className="py-2.5 px-3 text-[var(--color-on-surface-variant)]">{acc ? acc.name : '—'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-[var(--color-on-surface)]">{formatCurrency(e.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 4d. TRIP SLIPS — full log; RST numbers open the linked sales order */}
      {activeTab === 'trips' && (
        <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] overflow-clip">
          <div className="px-4 py-3 bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)] flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5" /> Trips — {slips.length} total
            </p>
            <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">{Math.round(kmRun).toLocaleString('en-IN')} km total</p>
          </div>
          {slips.length === 0 ? (
            <p className="px-4 py-10 text-center text-[11px] text-[var(--color-on-surface-variant)]">No trip slips linked to this vehicle.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[1180px] border-collapse">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-[var(--color-on-surface-variant)] border-b border-[var(--color-outline-variant)]/50">
                  {/* Built just like the Trip Slips tab; Slip No REMOVED (2026-10-28) */}
                  <th className="py-2 px-4">Date &amp; Time</th>
                  <th className="py-2 px-3">RST Number</th>
                  <th className="py-2 px-3">Vehicle</th>
                  <th className="py-2 px-3">Party</th>
                  <th className="py-2 px-3 text-right">Load (MT)</th>
                  <th className="py-2 px-3 text-right">Distance (km)</th>
                  <th className="py-2 px-3 text-right">Transport Rate (₹/T-km)</th>
                  <th className="py-2 px-3 text-right">Transport Total (₹)</th>
                  <th className="py-2 px-3 text-right">GST (%)</th>
                  <th className="py-2 px-3 text-right">Total Transportation Cost</th>
                  <th className="py-2 px-4">Drop Site</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]/40">
                {slips.map((s) => {
                  const linked = saleOfSlip(s);
                  const transport = transportOfSlip(linked);
                  const freightGst = Number((linked as any)?.freightGstRate) || 0;
                  const transportInclGst = transport > 0 ? Math.round((transport + transport * freightGst / 100) * 100) / 100 : 0;
                  return (
                    <tr key={s.id} className="text-[11px]">
                      <td className="py-2.5 px-4 text-[var(--color-on-surface-variant)] whitespace-nowrap">
                        {s.date}
                        {s.time && <span className="block text-[10px] font-medium">@ {s.time}</span>}
                      </td>
                      <td className="py-2.5 px-3 min-w-[140px]">
                        {linked ? (
                          // Same as the trips tab: the RST opens the full sales
                          // order story (OrderDetailModal, mounted above)
                          <button
                            type="button"
                            onClick={() => onOpenRst(linked.id)}
                            className="font-mono text-[11px] font-black text-[var(--color-primary)] underline decoration-dotted underline-offset-2 hover:opacity-80 cursor-pointer whitespace-nowrap"
                            title={`Open RST ${s.orderNumber || ''} details`}
                          >
                            {/* RST label only for bare-serial numbers (sales-table rule) */}
                            {s.orderNumber
                              ? (/^\d+$/.test(String(s.orderNumber)) ? `RST ${s.orderNumber}` : s.orderNumber)
                              : '—'}
                          </button>
                        ) : (
                          <span className="font-semibold text-[var(--color-on-surface-variant)]">
                            {s.orderNumber
                              ? (/^\d+$/.test(String(s.orderNumber)) ? `RST ${s.orderNumber}` : s.orderNumber)
                              : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-black text-[var(--color-primary)] whitespace-nowrap block">{vehicle.vehicleNo}</span>
                        <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1 whitespace-nowrap">
                          <User className="h-3 w-3 text-[var(--color-outline)] shrink-0" />
                          {s.driverName || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {/* Party NAME (never tradeName) — same as the trips tab */}
                        <span className="font-semibold text-[var(--color-on-surface)] truncate block max-w-[180px]">
                          {partyOfSlip(s, linked)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold">
                        {(Number(s.netWeightTonnes) || 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold">
                        {/* Sale's planned distance is authoritative; slip mirrors it */}
                        {Number(linked?.distanceKm ?? s.distanceKm) > 0
                          ? Number(linked?.distanceKm ?? s.distanceKm)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {Number((linked as any)?.freightRatePerTonne) > 0
                          ? `₹${(linked as any).freightRatePerTonne}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-[var(--color-on-surface)]">
                        {transport > 0 ? `₹${transport.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--color-on-surface-variant)]">
                        {transport > 0 ? `${freightGst}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-[var(--color-primary)]">
                        {transport > 0 ? `₹${transportInclGst.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-[var(--color-on-surface-variant)] font-semibold flex items-center gap-1 truncate max-w-[200px]" title={s.destination}>
                          {s.destination}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* 4e. DOCUMENTS — RC / insurance / any vehicle files (same section as the edit form) */}
      {activeTab === 'documents' && (
        <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4">
          <EntityDocumentsSection feature="vehicle" entityId={vehicle.id} />
        </div>
      )}

      {/* ===== TYRE MODALS — fit a spare into an empty slot / unload a fitted serial ===== */}
      {tyreModal && tyreModal.mode === 'fit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs" onClick={(e) => { if (e.target === e.currentTarget) setTyreModal(null); }}>
          <form onSubmit={handleFitSerial} className="bg-[var(--color-surface-container-lowest)] w-full max-w-lg rounded-3xl shadow-2xl border border-[var(--color-outline-variant)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
              <h3 className="text-sm font-bold text-[var(--color-on-surface)] flex items-center gap-2">
                <Disc className="w-4 h-4 text-[var(--color-primary)]" />
                Fit Tyre — {TYRE_POSITION_LABELS[tyreModal.position]}
              </h3>
              <button type="button" onClick={() => setTyreModal(null)} className="p-2 text-[var(--color-outline)] rounded-full hover:bg-[var(--color-surface-container-high)]"><X className="w-4.5 h-4.5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container)] rounded-xl px-3 py-2">
                <Truck className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono text-[var(--color-on-surface)]">{vehicle.vehicleNo}</span>
                <span className="text-[var(--color-outline)]">·</span>
                <span>{fittedTyreCount} of 12 positions filled</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Tyre Serial (from spare stock) *</label>
                <select
                  required
                  value={fitUnitId}
                  onChange={(e) => setFitUnitId(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                >
                  <option value="">-- Choose a spare serial --</option>
                  {spareTyres.length === 0 && <option disabled>-- No spare tyre serials in stock — register them in the Items module --</option>}
                  {spareTyres.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.serialNumber}{itemById.get(u.itemId)?.name ? ` · ${itemById.get(u.itemId)?.name}` : ''}{u.locationId ? ` · ${locations.find((l) => l.id === u.locationId)?.name || ''}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Odometer at Fitment (km)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 148230"
                    value={fitOdometer}
                    onChange={(e) => setFitOdometer(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Notes</label>
                  <input
                    type="text"
                    value={fitNotes}
                    onChange={(e) => setFitNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end gap-3">
              <button type="button" onClick={() => setTyreModal(null)} className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container)]">Cancel</button>
              <button type="submit" className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-95">Fit Tyre</button>
            </div>
          </form>
        </div>
      )}

      {tyreModal && tyreModal.mode === 'unload' && (() => {
        const unit = unitAll.find((u) => u.id === tyreModal.unitId);
        if (!unit) return null;
        const cond = unit.condition || 'good';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs" onClick={(e) => { if (e.target === e.currentTarget) setTyreModal(null); }}>
            <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-md rounded-3xl shadow-2xl border border-[var(--color-outline-variant)]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
                <h3 className="text-sm font-bold text-[var(--color-on-surface)] flex items-center gap-2">
                  <Disc className="w-4 h-4 text-[var(--color-warning)]" />
                  Fitted tyre{unit.position ? ` — ${TYRE_POSITION_LABELS[String(unit.position).toUpperCase() as TyrePosition] || unit.position}` : ''}
                </h3>
                <button type="button" onClick={() => setTyreModal(null)} className="p-2 text-[var(--color-outline)] rounded-full hover:bg-[var(--color-surface-container-high)]"><X className="w-4.5 h-4.5" /></button>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-black text-[var(--color-on-surface)] bg-[var(--color-surface-container-high)] px-3 py-1.5 rounded-xl">{unit.serialNumber}</span>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${tyreConditionTone[cond]}`}>{cond}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div><p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)]">Item</p><p className="font-bold text-[var(--color-on-surface)] mt-0.5">{itemById.get(unit.itemId)?.name || '—'}</p></div>
                  <div><p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)]">Wheel Position</p><p className="font-mono font-black text-[var(--color-primary)] mt-0.5">{unit.position}</p></div>
                  <div><p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-on-surface-variant)]">Fitted At (km)</p><p className="font-bold text-[var(--color-on-surface)] mt-0.5">{unit.fitOdometer ? unit.fitOdometer.toLocaleString('en-IN') : '—'}</p></div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex justify-end gap-3">
                <button type="button" onClick={() => setTyreModal(null)} className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container)]">Close</button>
                <button
                  type="button"
                  onClick={() => handleUnloadSerial(unit.id)}
                  className="px-6 py-2.5 bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] rounded-full text-xs font-bold hover:opacity-95 inline-flex items-center gap-1.5"
                  title="Remove this tyre from the vehicle — it returns to spare stock"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Unload to Stock
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}