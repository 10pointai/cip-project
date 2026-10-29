import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Building2,
  Calendar,
  Clock,
  Edit2,
  ExternalLink,
  FileText,
  Landmark,
  Mail,
  Phone,
  Wallet,
  History,
  Loader2,
  Plus,
  Truck,
  UserRound,
  ArrowUpCircle,
  ArrowDownCircle,
  X,
} from 'lucide-react';
import { Employee, AppDocument, Vehicle } from '../../types';
import { api } from '../../services/api';
import { useDatabase } from '../../hooks/useDatabase';
import { formatCurrency } from '../../utils/formatters';
import { EmployeeLedgerView, employeeLedgerBalance, LedgerTxnModal } from './EmployeeLedgerView';
import { EmployeeMonthlyTimesheetView } from './EmployeeMonthlyTimesheetModal';

interface EmployeeDetailViewProps {
  employee: Employee | null;
  /** the full roster — the Ledger tab renders the employee-ledger view */
  employees: Employee[];
  currencySymbol: string;
  onBack: () => void;
  onEdit: (emp: Employee) => void;
}

/**
 * Employee Details — a PAGE (like the party detail page), not a modal:
 * navigation header with a back arrow, an identity/payout ribbon, and tabs
 * for the master details, the employee's ledger and his monthly attendance.
 * Rendered in place of the Employees feature content while open.
 */
export function EmployeeDetailView({
  employee,
  employees,
  currencySymbol,
  onBack,
  onEdit,
}: EmployeeDetailViewProps) {
  const {
    employeeLedgerTransactions,
    employeePayments,
    accounts,
    vehicles,
    db,
  } = useDatabase();

  // Assign / change vehicle state (drivers only).
  // 2026-10-28 SIMPLIFIED UX: assigning is ONE interaction — pick a vehicle in
  // the searchable picker and it assigns IMMEDIATELY. Only a vehicle whose
  // slot is held by ANOTHER driver asks first (inline bar, no window.confirm);
  // removing is the ✕ on the held-vehicle chips.
  const [pendingOccupied, setPendingOccupied] = useState<Vehicle | null>(null);
  // The FLEET'S dropdown pattern (same as the vehicle form's driver picker):
  // a closed picker button opens a searchable vehicle list under it.
  const [vehPickerOpen, setVehPickerOpen] = useState(false);
  const [vehPickerQuery, setVehPickerQuery] = useState('');
  const vehPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPendingOccupied(null);
    setVehPickerOpen(false);
    setVehPickerQuery('');
  }, [employee?.id]);

  useEffect(() => {
    if (!vehPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (vehPickerRef.current && !vehPickerRef.current.contains(e.target as Node)) {
        setVehPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [vehPickerOpen]);

  /** Vehicle-status chip tones inside the picker (fleet parity) */
  const vehStatusTone: Record<string, string> = {
    available: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]',
    on_trip: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]',
    maintenance: 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]',
    out_of_service: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]',
  };

  /** The vehicles this driver currently holds (FK lives on the vehicle —
   *  currentDriverId — so the assignment resolves from the fleet master). */
  const heldVehicles = useMemo(
    () => (employee?.role === 'driver' ? vehicles.filter((v) => v.currentDriverId === employee.id) : []),
    [vehicles, employee?.id, employee?.role]
  );

  const employeeNameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  /** The assignable choices: every vehicle NOT already held by this driver
   *  (held ones show as chips above — assigning them again is a no-op). */
  const assignableVehicles = useMemo(
    () => vehicles.filter((v) => v.currentDriverId !== employee?.id),
    [vehicles, employee?.id]
  );

  /** Pick-to-assign: free vehicles move instantly; occupied ones pause for
   *  an inline confirmation (the move reassigns that vehicle). */
  const handlePickVehicle = (vehicleId: string) => {
    setPendingOccupied(null);
    if (!employee || !vehicleId) return;
    const veh = vehicles.find((v) => v.id === vehicleId);
    if (!veh) return;
    if (veh.currentDriverId && veh.currentDriverId !== employee.id) {
      setPendingOccupied(veh);
      return;
    }
    db.assignEmployeeVehicle(employee.id, { vehicleId });
  };

  const releaseAssignedVehicle = (vehicleId: string) => {
    if (employee) {
      setPendingOccupied(null);
      db.assignEmployeeVehicle(employee.id, { releaseVehicleId: vehicleId });
    }
  };

  // Details master card (default) | Ledger | Attendance
  const [activeTab, setActiveTab] = useState<'details' | 'ledger' | 'attendance'>('details');
  const [docs, setDocs] = useState<AppDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  // Record Transaction lives on THIS page's header: the popover (3 choices)
  // + the ledger-transaction modal, pre-targeting the open employee
  const [isRecordPopoverOpen, setIsRecordPopoverOpen] = useState(false);
  const [recordType, setRecordType] = useState<'adjust' | 'paid' | 'received'>('adjust');
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);

  // Reset to the details tab whenever another employee is opened
  useEffect(() => {
    setActiveTab('details');
  }, [employee?.id]);

  // Linked verification documents (Aadhaar / PAN scans from S3)
  useEffect(() => {
    if (!employee?.id) {
      setDocs([]);
      return;
    }
    let active = true;
    setIsLoadingDocs(true);
    api
      .getEmployeeDocuments(employee.id)
      .then((res) => {
        if (active && res.success) setDocs(res.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoadingDocs(false);
      });
    return () => {
      active = false;
    };
  }, [employee?.id]);

  if (!employee) return null;

  /** Employee-facing dates read dd-mm-yyyy */
  const formatDateDMY = (d?: string): string => {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  };

  const openDocument = async (docId: string) => {
    try {
      const res = await api.getDocumentDownloadUrl(docId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener');
      }
    } catch {
      // the list link below still carries the fallback doc record
    }
  };

  const infoRow = (label: string, value?: string | number | null, Icon?: any) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--color-outline-variant)]/40 last:border-0">
      <span className="text-[10px] font-black text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5 shrink-0 pt-0.5">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </span>
      <span className="text-xs font-bold text-[var(--color-on-surface)] text-right">
        {value === undefined || value === null || value === '' ? '—' : String(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200" id="employee-detail-page">
      {/* 1. NAVIGATION & IDENTITY HEADER */}
      <div className="bg-[var(--color-surface-container-lowest)] rounded-[24px] border border-[var(--color-outline-variant)] p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 p-2.5 rounded-full bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] transition-all flex items-center justify-center border border-[var(--color-outline-variant)] shadow-2xs hover:scale-105 active:scale-95 shrink-0"
            title="Back to Staff Directory"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] font-black flex items-center justify-center text-sm border border-[var(--color-outline-variant)] shrink-0">
              {employee.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-black text-[var(--color-on-surface)] tracking-tight">
                  {employee.name}
                </h1>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] capitalize">
                  {employee.role}
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 capitalize ${
                    employee.status === 'active'
                      ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                      : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${employee.status === 'active' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
                  {employee.status}
                </span>
              </div>
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-1 font-medium flex items-center gap-1">
                <UserRound className="w-3.5 h-3.5 text-[var(--color-outline)]" />
                <span>Employee ID: <strong className="font-mono">{employee.id}</strong></span>
              </p>
            </div>
          </div>
        </div>

        {/* Actions — the employee's ledger balance + the Record Transaction
            action live on this main header (the ledger tab renders only the
            register table); Edit Details stays alongside */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="px-3.5 py-1.5 rounded-xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-right">
            <p className="text-[9px] font-black text-[var(--color-on-surface-variant)] uppercase tracking-wider">
              {employee.name.split(' ')[0]}'s Balance
            </p>
            {(() => {
              const bal = employeeLedgerBalance(employee, employeeLedgerTransactions, employeePayments);
              return (
                <>
                  <p className={`text-sm font-black ${bal < 0 ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
                    {formatCurrency(bal, currencySymbol)}
                  </p>
                  <p className="text-[9px] font-bold text-[var(--color-on-surface-variant)]">
                    {bal > 0 ? 'Company owes employee' : bal < 0 ? 'Employee owes company' : 'Settled'}
                  </p>
                </>
              );
            })()}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRecordPopoverOpen((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-2xs transition-all hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Transaction</span>
            </button>
            {isRecordPopoverOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsRecordPopoverOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden text-left">
                  <p className="px-3 pt-2.5 pb-1 text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                    What are you recording?
                  </p>
                  <button
                    type="button"
                    onClick={() => { setIsRecordPopoverOpen(false); setRecordType('adjust'); setIsTxnModalOpen(true); }}
                    className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container)] transition-colors border-b border-[var(--color-outline-variant)]/50"
                  >
                    <ArrowUpCircle size={18} className="shrink-0 text-[var(--color-success)]" />
                    <span>
                      <span className="block text-[11px] font-black text-[var(--color-on-surface)]">Adjust Ledger</span>
                      <span className="block text-[10px] font-semibold text-[var(--color-on-surface-variant)]">Increase or reduce the employee's ledger balance (tabs inside).</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsRecordPopoverOpen(false); setRecordType('paid'); setIsTxnModalOpen(true); }}
                    className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container)] transition-colors border-b border-[var(--color-outline-variant)]/50"
                  >
                    <ArrowDownCircle size={18} className="shrink-0 text-[var(--color-error)]" />
                    <span>
                      <span className="block text-[11px] font-black text-[var(--color-on-surface)]">Paid To Employee</span>
                      <span className="block text-[10px] font-semibold text-[var(--color-on-surface-variant)]">Dues goes DOWN — advance handed out, salary disbursed.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsRecordPopoverOpen(false); setRecordType('received'); setIsTxnModalOpen(true); }}
                    className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container)] transition-colors"
                  >
                    <Banknote size={18} className="shrink-0 text-[var(--color-success)]" />
                    <span>
                      <span className="block text-[11px] font-black text-[var(--color-on-surface)]">Received From Employee</span>
                      <span className="block text-[10px] font-semibold text-[var(--color-on-surface-variant)]">Money received into the company — dues go UP, bank must be chosen.</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onEdit(employee)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary-container)] hover:opacity-90 text-[var(--color-on-primary-container)] border border-[var(--color-primary)]/20 rounded-full text-xs font-bold shadow-2xs transition-all"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit Details</span>
          </button>
        </div>
      </div>

      {/* 2. CONTACT & COMPENSATION RIBBON */}
      <div className="bg-[var(--color-surface-container-lowest)] rounded-[24px] border border-[var(--color-outline-variant)] p-4 shadow-xs flex flex-col gap-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <a
              href={`tel:${employee.phone}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full font-semibold transition-colors shadow-2xs"
            >
              <Phone className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>{employee.phone}</span>
            </a>
            {employee.email && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full font-semibold shadow-2xs truncate max-w-[260px]">
                <Mail className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
                <span className="truncate">{employee.email}</span>
              </span>
            )}
            {employee.licenseNo && employee.role === 'driver' && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full font-semibold shadow-2xs">
                <BadgeCheck className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>DL {employee.licenseNo}</span>
              </span>
            )}
            {/* Assigned fleet vehicles ride the contact ribbon for drivers */}
            {employee.role === 'driver' &&
              heldVehicles.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-secondary-container)]/60 text-[var(--color-on-secondary-container)] border border-[var(--color-secondary)]/20 rounded-full font-semibold shadow-2xs"
                >
                  <Truck className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
                  <span className="font-mono">{v.vehicleNo}</span>
                </span>
              ))}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-success-container)]/60 text-[var(--color-on-success-container)] border border-[var(--color-success)]/20 rounded-full font-black shadow-2xs">
              <Wallet className="w-3.5 h-3.5" />
              {formatCurrency(employee.salaryBase, currencySymbol)} / {employee.salaryType === 'daily' ? 'day' : 'month'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full font-semibold shadow-2xs">
              <Calendar className="w-3.5 h-3.5" />
              <span>Joined <strong className="text-[var(--color-on-surface)]">{formatDateDMY(employee.joiningDate)}</strong></span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. TABS: Details | Ledger | Attendance */}
      <div className="border-b border-[var(--color-outline-variant)] flex flex-wrap gap-2">
        {([
          { id: 'details' as const, label: 'Details', icon: UserRound },
          { id: 'ledger' as const, label: 'Ledger', icon: Wallet },
          { id: 'attendance' as const, label: 'Attendance', icon: History },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-bold text-xs transition-all relative border-b-2 ${
              activeTab === tab.id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Details master card */}
      {activeTab === 'details' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
              <h4 className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-wider mb-2">Personal &amp; Identity</h4>
              {infoRow('Phone', employee.phone, Phone)}
              {infoRow('Email', employee.email, Mail)}
              {infoRow('Aadhaar No', employee.aadhaarNo)}
              {infoRow('PAN No', employee.panNo)}
              {employee.role === 'driver' && infoRow('Driving License (HCV)', employee.licenseNo, BadgeCheck)}
              {infoRow('Shift In Time', employee.defaultInTime, Clock)}
              {infoRow('Shift Out Time', employee.defaultOutTime, Clock)}
            </div>

            <div className="p-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
              <h4 className="text-[10px] font-black text-[var(--color-success)] uppercase tracking-wider mb-2">Payout Structure &amp; Bank Details</h4>
              {infoRow(
                'Base Payout',
                `${formatCurrency(employee.salaryBase, currencySymbol)} per ${employee.salaryType === 'daily' ? 'day' : 'month'}`,
                Wallet
              )}
              {infoRow('Bank Account No', employee.bankAccountNo, Landmark)}
              {infoRow('IFSC Code', employee.bankIFSC, Landmark)}
              {infoRow('Name on Account', employee.nameOnAccount)}
              {infoRow('UPI Address', employee.upiAddress)}
              {infoRow('Own Opening Balance (Ledger)', employee.openingBalance ? formatCurrency(employee.openingBalance, currencySymbol) : '', Building2)}
            </div>
          </div>

          {/* Assigned fleet vehicle(s) — drivers only. SIMPLIFIED (2026-10-28):
              held vehicles as chips with an explicit Remove; assigning is ONE
              interaction (pick in the searchable picker — free trucks assign
              instantly; one held by another driver asks inline before moving). */}
          {employee.role === 'driver' && (
            <div className="p-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
              <h4 className="text-[10px] font-black text-[var(--color-secondary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Assigned Fleet Vehicle{heldVehicles.length === 1 ? '' : 's'}
              </h4>

              {/* One-interaction assign — the FLEET'S dropdown pattern (same as
                  the vehicle form's driver picker): the closed button shows the
                  driver's assigned vehicle as the FILLED VALUE; opening offers
                  an UNASSIGN row per held vehicle on top, then the searchable
                  assign list below (occupied ones ask inline). */}
              <div className="max-w-xs" ref={vehPickerRef}>
                {vehPickerOpen ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search vehicles by number, type or driver…"
                      value={vehPickerQuery}
                      onChange={(e) => setVehPickerQuery(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-primary)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    />
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] divide-y divide-[var(--color-outline-variant)] shadow-lg">
                      {(() => {
                        const q = vehPickerQuery.trim().toLowerCase();
                        const matchFn = (v: Vehicle) => {
                          if (!q) return true;
                          const holder = v.currentDriverId ? employeeNameById.get(v.currentDriverId) || '' : '';
                          return (
                            v.vehicleNo.toLowerCase().includes(q) ||
                            (v.type || '').toLowerCase().includes(q) ||
                            holder.toLowerCase().includes(q)
                          );
                        };
                        const heldMatches = heldVehicles.filter(matchFn);
                        // Rows above the divider: the driver's HELD vehicles —
                        // clicking releases the vehicle (the unassign option)
                        const unassignRows = heldMatches.map((v) => (
                          <button
                            key={`un-${v.id}`}
                            type="button"
                            onClick={() => {
                              setVehPickerOpen(false);
                              setVehPickerQuery('');
                              releaseAssignedVehicle(v.id);
                            }}
                            title={`Unassign ${v.vehicleNo} from ${employee.name}`}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-error-container)]/30"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="w-6 h-6 rounded-full bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)] flex items-center justify-center shrink-0">
                                <Truck className="w-3.5 h-3.5" />
                              </span>
                              <span className="min-w-0">
                                <span className="font-mono text-xs font-black text-[var(--color-on-surface)] block truncate">{v.vehicleNo}</span>
                                <span className="text-[10px] text-[var(--color-on-surface-variant)] block truncate capitalize">{v.type || 'vehicle'}</span>
                              </span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">
                                Assigned ✓
                              </span>
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-error-container)] text-[var(--color-error)] flex items-center gap-1">
                                <X className="w-2.5 h-2.5" /> Unassign
                              </span>
                            </span>
                          </button>
                        ));
                        const matches = assignableVehicles
                          .filter(matchFn)
                          .sort((a, b) => a.vehicleNo.localeCompare(b.vehicleNo));
                        if (matches.length === 0 && heldMatches.length === 0) {
                          return (
                            <div className="p-4 text-center">
                              <Truck className="h-6 w-6 text-[var(--color-outline)] mx-auto mb-1.5" />
                              <p className="text-xs font-bold text-[var(--color-on-surface)]">No vehicles match</p>
                              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                                Nothing matches "{vehPickerQuery.trim()}".
                              </p>
                            </div>
                          );
                        }
                        return (
                          <>
                            {heldMatches.length > 0 && heldMatches.length < heldVehicles.length && (
                              <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--color-outline)] bg-[var(--color-surface-container)]/70">
                                Show only matches — clear the search to unassign
                              </div>
                            )}
                            {[...heldMatches].sort((a, b) => a.vehicleNo.localeCompare(b.vehicleNo)).length > 0 &&
                              unassignRows}
                            {matches.length > 0 && (
                              <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--color-outline)] bg-[var(--color-surface-container)]/70">
                                Assign a vehicle
                              </div>
                            )}
                            {matches.map((v) => {
                          const holder = v.currentDriverId ? employeeNameById.get(v.currentDriverId) : undefined;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                setVehPickerOpen(false);
                                setVehPickerQuery('');
                                handlePickVehicle(v.id);
                              }}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-container)]"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="w-6 h-6 rounded-full bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)] flex items-center justify-center shrink-0">
                                  <Truck className="w-3.5 h-3.5" />
                                </span>
                                <span className="min-w-0">
                                  <span className="font-mono text-xs font-black text-[var(--color-on-surface)] block truncate">{v.vehicleNo}</span>
                                  <span className="text-[10px] text-[var(--color-on-surface-variant)] block truncate capitalize">{v.type || 'vehicle'}</span>
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                {holder && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] whitespace-nowrap">
                                    With {holder}
                                  </span>
                                )}
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${vehStatusTone[v.status] || vehStatusTone.available}`}>
                                  {v.status === 'on_trip' ? 'On Trip' : (v.status || 'available')}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setVehPickerOpen(true); setVehPickerQuery(''); }}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm text-left flex items-center justify-between gap-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    {heldVehicles.length > 0 ? (
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-black text-[var(--color-on-surface)] truncate">
                          {heldVehicles[0].vehicleNo}
                        </span>
                        {heldVehicles.length > 1 && (
                          <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] shrink-0">
                            +{heldVehicles.length - 1} more
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[var(--color-on-surface-variant)]">Search &amp; assign a vehicle…</span>
                    )}
                    <Truck className="w-3.5 h-3.5 text-[var(--color-outline)] shrink-0" />
                  </button>
                )}
              </div>

              {/* Inline confirmation — only when the picked truck is held by
                  someone else; nothing moved until the user decides */}
              {pendingOccupied && (
                <div className="mt-2.5 p-3 rounded-xl bg-[var(--color-warning-container)]/40 border border-[var(--color-warning)]/30 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--color-on-surface-variant)]">
                    <strong className="font-mono text-[var(--color-on-surface)]">{pendingOccupied.vehicleNo}</strong> is currently with{' '}
                    <strong className="text-[var(--color-on-surface)]">{employeeNameById.get(pendingOccupied.currentDriverId || '') || 'another driver'}</strong> — moving it reassigns to {employee.name}.
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        db.assignEmployeeVehicle(employee.id, { vehicleId: pendingOccupied.id });
                        setPendingOccupied(null);
                      }}
                      className="px-3.5 py-1.5 rounded-full text-[10px] font-bold bg-[var(--color-secondary)] text-[var(--color-on-secondary)] hover:opacity-90 transition-all"
                    >
                      Move to {employee.name.split(' ')[0]}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingOccupied(null)}
                      className="px-3 py-1.5 rounded-full text-[10px] font-bold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                    >
                      Cancel
                    </button>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Verification documents */}
          <div className="p-4 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
            <h4 className="text-[10px] font-black text-[var(--color-tertiary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Linked Verification Documents
              {isLoadingDocs && <Loader2 className="w-3 h-3 animate-spin" />}
            </h4>
            {docs.length === 0 ? (
              <p className="text-xs text-[var(--color-on-surface-variant)] py-1">
                {isLoadingDocs ? 'Loading documents…' : 'No documents linked to this employee yet.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {docs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => openDocument(d.id)}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] hover:border-[var(--color-primary)]/40 text-left transition"
                    title="Open document"
                  >
                    <FileText className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold text-[var(--color-on-surface)] truncate">{d.name}</span>
                      <span className="block text-[9px] font-semibold text-[var(--color-on-surface-variant)]">{d.type || 'document'}</span>
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-[var(--color-on-surface-variant)] shrink-0 ml-auto" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Ledger — the employee-ledger register (the balance + Record
          Transaction action on the header above; no bar card here) */}
      {activeTab === 'ledger' && (
        <EmployeeLedgerView
          employees={employees}
          focusedEmpId={employee.id}
        />
      )}

      {/* TAB: Attendance — the monthly timesheet register */}
      {activeTab === 'attendance' && (
        <div className="rounded-[24px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-4 shadow-xs">
          <EmployeeMonthlyTimesheetView
            employee={employee}
            initialMonth={new Date().toISOString().split('T')[0].substring(0, 7)}
          />
        </div>
      )}

      {/* MODAL: Record ledger transaction (from the header's popover) —
          pre-targeted to the open employee */}
      {isTxnModalOpen && (
        <LedgerTxnModal
          editingTxn={null}
          variant={recordType}
          accounts={accounts}
          employees={employees}
          preselectedEmployeeId={employee.id}
          currencySymbol={currencySymbol}
          onClose={() => setIsTxnModalOpen(false)}
          onSave={(payload) => {
            db.addEmployeeLedgerTransaction(payload);
            setIsTxnModalOpen(false);
          }}
        />
      )}
    </div>
  );
}