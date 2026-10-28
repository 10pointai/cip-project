import React, { useState } from 'react';
import {
  ArrowLeft, Pencil, Truck, Fuel, Route, IndianRupee, Wrench,
  Landmark, CalendarClock, Layers, Paperclip, LayoutDashboard, User,
} from 'lucide-react';
import { Vehicle, Sale, TripSlip } from '../../types';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'trips' | 'documents'>('overview');

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

  const insuranceDaysLeft = vehicle.insuranceExpiry
    ? Math.round((Date.parse(`${vehicle.insuranceExpiry}T00:00:00Z`) - Date.now()) / 86_400_000)
    : undefined;

  const statusTone: Record<string, string> = {
    available: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]',
    on_trip: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]',
    maintenance: 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]',
    out_of_service: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]',
  };

  const TABS: Array<{ id: 'overview' | 'expenses' | 'trips' | 'documents'; label: string; icon: any; count?: string }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
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

      {/* 4b. EXPENSES — the vehicle's full money-spent log */}
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

      {/* 4c. TRIP SLIPS — full log; RST numbers open the linked sales order */}
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
                            {s.orderNumber || '—'}
                          </button>
                        ) : (
                          <span className="font-semibold text-[var(--color-on-surface-variant)]">{s.orderNumber || '—'}</span>
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

      {/* 4d. DOCUMENTS — RC / insurance / any vehicle files (same section as the edit form) */}
      {activeTab === 'documents' && (
        <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4">
          <EntityDocumentsSection feature="vehicle" entityId={vehicle.id} />
        </div>
      )}
    </div>
  );
}