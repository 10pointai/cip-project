import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  User,
  FileText,
  Plus,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Clock,
  X,
  Check,
  ChevronDown,
  MoreVertical,
  Building,
  Disc,
  Landmark,
  Edit3,
  DollarSign,
  Receipt,
  Fuel,
  Paperclip,
  Layers,
} from 'lucide-react';
import { Vehicle, Employee, TripSlip, Order, CompanySettings, Tyre, VehicleEmiDetails, VehicleEmiEntry, VehicleExpenseEntry, CashBankAccount, Sale, Item, Party } from '../../types';
import { EntityDocumentsSection, StagedDocument } from '../common/EntityDocumentsSection';
import { cloudStore as localDb } from '../../services/cloudStore';
import { SearchableSelect } from '../orders/SearchableSelect';
import { OrderDetailModal } from '../orders/OrderDetailModal';
import { saleToDisplay } from '../orders/orderDisplay';
import { VehicleDetailPage } from './VehicleDetailPage';
import { BulkExpenseCreateModal } from './BulkExpenseCreateModal';

interface LogisticsViewProps {
  /** Provided when the viewer can reach the Employees feature — makes the
   *  Drivers tab names open the full employee profile there */
  onOpenDriverProfile?: (employeeId: string) => void;
  /** Bump (nonce) from App when a driver profile's Back returns here —
   *  jumps to the DRIVERS sub-tab (the tab the visitor came from) */
  openDriversSignal?: number;
}

export const LogisticsView: React.FC<LogisticsViewProps> = ({ onOpenDriverProfile, openDriversSignal }) => {
  // Return-from-driver-profile: the Fleet feature must land back on its
  // DRIVERS tab (App bumps openDriversSignal when returning from Employees)
  React.useEffect(() => {
    if (openDriversSignal) {
      setActiveSubTab('drivers');
      setDetailVehicle(null);
      setViewingOrderSaleId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDriversSignal]);
  // Database States
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [emiEntries, setEmiEntries] = useState<VehicleEmiEntry[]>([]);
  const [expenses, setExpenses] = useState<VehicleExpenseEntry[]>([]);
  const [slips, setSlips] = useState<TripSlip[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  // Sales/parties/items masters — the Trips table's SALE ORDER column opens
  // the linked sale's details modal (OrderDetailModal needs the masters)
  const [sales, setSales] = useState<Sale[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [tyres, setTyres] = useState<Tyre[]>([]);

  // App Navigation & Filter state
  const [activeSubTab, setActiveSubTab] = useState<'trips' | 'fleet' | 'expenses' | 'emi-entries' | 'drivers'>('trips');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Selected Detail Modal State
  // Linked sale whose DETAILS MODAL is open from the Trips table (the display
  // object is derived fresh from the sales list on every sync)
  const [viewingOrderSaleId, setViewingOrderSaleId] = useState<string | null>(null);
  const viewingSaleDisplay = useMemo(() => {
    if (!viewingOrderSaleId) return null;
    const s = sales.find((x) => x.id === viewingOrderSaleId);
    return s ? saleToDisplay(s) : null;
  }, [sales, viewingOrderSaleId]);

  // Fleet Table — per-row "More Actions" popover (EMI + Tyres). The popover
  // renders with VIEWPORT-FIXED coordinates because the table's
  // overflow-x-auto container clips absolutely-positioned children; the anchor
  // rect is captured from the ⋮ button at open time and re-closed on
  // scroll/resize (fixed coords never scroll with the row).
  const [vehicleMoreMenu, setVehicleMoreMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const moreVehicleMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!vehicleMoreMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreVehicleMenuRef.current && !moreVehicleMenuRef.current.contains(e.target as Node)) {
        setVehicleMoreMenu(null);
      }
    };
    const handleViewportChange = () => setVehicleMoreMenu(null);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [vehicleMoreMenu]);

  /** Anchor the ⋮ popover at the button (fixed) — flip up near the viewport bottom. */
  const toggleVehicleMoreMenu = (vehicleId: string, btn: HTMLElement) => {
    if (vehicleMoreMenu?.id === vehicleId) {
      setVehicleMoreMenu(null);
      return;
    }
    const MENU_W = 176;   // w-44
    const MENU_H_EST = 150;
    const GAP = 4;
    const rect = btn.getBoundingClientRect();
    let top = rect.bottom + GAP;
    if (top + MENU_H_EST > window.innerHeight) {
      top = Math.max(8, rect.top - MENU_H_EST - GAP);
    }
    setVehicleMoreMenu({ id: vehicleId, top, left: Math.max(8, rect.right - MENU_W) });
  };

  // Creation Modals
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

  // Form States - Trip Slip
  const [formSlipNo, setFormSlipNo] = useState('');
  const [formSlipDate, setFormSlipDate] = useState('');
  const [formSlipTime, setFormSlipTime] = useState('');
  const [formSlipVehicleId, setFormSlipVehicleId] = useState('');
  const [formSlipDriverId, setFormSlipDriverId] = useState('');
  const [formSlipTripType, setFormSlipTripType] = useState<'outward' | 'inward' | 'internal'>('outward');
  const [formSlipOrderId, setFormSlipOrderId] = useState('');
  const [formSlipMaterial, setFormSlipMaterial] = useState('');
  const [formSlipWeight, setFormSlipWeight] = useState('');
  const [formSlipDestination, setFormSlipDestination] = useState('');
  const [formSlipFuel, setFormSlipFuel] = useState('');
  const [formSlipAdvance, setFormSlipAdvance] = useState('');
  const [formSlipNotes, setFormSlipNotes] = useState('');

  // Form States - Vehicle
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formVehNo, setFormVehNo] = useState('');
  const [formVehType, setFormVehType] = useState<'tipper' | 'tanker' | 'mixer' | 'loader' | 'other'>('tipper');
  const [formVehInsurance, setFormVehInsurance] = useState('');
  const [formVehInsuranceAmount, setFormVehInsuranceAmount] = useState('');
  const [formVehNotes, setFormVehNotes] = useState('');

  // Assigned driver (employee with Operational Role Designation: driver) —
  // searchable pick inside the Vehicle Details accordion
  const [formVehDriverId, setFormVehDriverId] = useState('');
  const [vehDriverPickerOpen, setVehDriverPickerOpen] = useState(false);
  const [vehDriverQuery, setVehDriverQuery] = useState('');
  const vehDriverPickerRef = useRef<HTMLDivElement | null>(null);

  // Vehicle modal accordions
  const [vehDetailsOpen, setVehDetailsOpen] = useState(true);
  const [vehLoanOpen, setVehLoanOpen] = useState(true);

  // Close the driver search list when clicking outside it
  useEffect(() => {
    if (!vehDriverPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (vehDriverPickerRef.current && !vehDriverPickerRef.current.contains(e.target as Node)) {
        setVehDriverPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [vehDriverPickerOpen]);

  // Form States - Vehicle Loan & EMI Financing (full loan capture at register:
  // loan amount, tenure, EMI amount, due day, linked account, dates — the
  // auto-debit cron deducts the monthly EMI from the linked account)
  const [formVehEmiFinancier, setFormVehEmiFinancier] = useState<string>('');
  const [formVehEmiLoanAccNo, setFormVehEmiLoanAccNo] = useState<string>('');
  const [formVehEmiTotalLoan, setFormVehEmiTotalLoan] = useState<string>('');
  const [formVehEmiTenureMonths, setFormVehEmiTenureMonths] = useState<string>('');
  const [formVehEmiAmount, setFormVehEmiAmount] = useState<string>('');
  const [formVehEmiDueDay, setFormVehEmiDueDay] = useState<string>('10');
  const [formVehEmiAccountId, setFormVehEmiAccountId] = useState<string>('');
  const [formVehEmiStartDate, setFormVehEmiStartDate] = useState<string>('');
  const [formVehEmiOpenPaid, setFormVehEmiOpenPaid] = useState<string>('0');
  const [formVehEmiStatus, setFormVehEmiStatus] = useState<'active' | 'closed' | 'defaulted'>('active');
  const [formVehEmiNotes, setFormVehEmiNotes] = useState<string>('');

  // Vehicle documents (S3 upload feature) — staged while registering
  const [stagedVehicleDocs, setStagedVehicleDocs] = useState<StagedDocument[]>([]);

  // Vehicle Tyre Inspection state — the axle-position inspector stays mounted
  // for the tyres feature; the plate click opens the vehicle PROFILE PAGE
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  // the Vehicles tab and STAYS in Fleet; tyre CRUD moved to the Tyre
  // Management feature
  const [selectedVehicleForTyres, setSelectedVehicleForTyres] = useState<Vehicle | null>(null);
  const [mountingPosName, setMountingPosName] = useState<string>('');

  // EMI Entry ledger modal (record manual / edit automated entries)
  const [isEmiEntryModalOpen, setIsEmiEntryModalOpen] = useState(false);
  const [editingEmiEntry, setEditingEmiEntry] = useState<VehicleEmiEntry | null>(null);
  const [formEmiVehicleId, setFormEmiVehicleId] = useState('');
  const [formEmiAccountId, setFormEmiAccountId] = useState('');
  const [formEmiDate, setFormEmiDate] = useState('');
  const [formEmiAmount, setFormEmiAmount] = useState('');
  const [formEmiNotes, setFormEmiNotes] = useState('');

  // --- VEHICLE EXPENSE LOG (generic expense + diesel fuel-fill entries) ---
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  // Bulk entry grid (the expense mirror of the bulk sales grid)
  const [isBulkExpenseOpen, setIsBulkExpenseOpen] = useState(false);
  // which form the modal shows — locked when opened from the Add popover
  const [expenseFormType, setExpenseFormType] = useState<'expense' | 'diesel'>('expense');
  const [editingExpense, setEditingExpense] = useState<VehicleExpenseEntry | null>(null);
  const [formExpenseDate, setFormExpenseDate] = useState('');
  const [formExpenseVehicleId, setFormExpenseVehicleId] = useState('');
  const [formExpenseAccountId, setFormExpenseAccountId] = useState('');
  const [formExpenseTypeFree, setFormExpenseTypeFree] = useState('');
  const [formExpenseLitres, setFormExpenseLitres] = useState('');
  const [formExpenseRate, setFormExpenseRate] = useState('');
  const [formExpenseAmount, setFormExpenseAmount] = useState('');
  const [formExpenseNotes, setFormExpenseNotes] = useState('');
  const [stagedExpenseDocs, setStagedExpenseDocs] = useState<StagedDocument[]>([]);
  // Add Expense choice popover (expense entry vs diesel entry), viewport-fixed
  // (retired 2026-10-28 with the popover — Add Expense opens the bulk grid)
  const expenseChoiceRef = useRef<HTMLDivElement>(null);
  // per-row documents drawer (view / upload receipts against a saved entry)
  const [expenseDocsOpen, setExpenseDocsOpen] = useState<VehicleExpenseEntry | null>(null);
  const EXPENSE_TYPE_SUGGESTIONS = [
    'PAUNCTURE + FITTING', 'TYRE CHANGE', 'TOLL CHARGES', 'PERMIT / NOC',
    'REPAIR & MAINT', 'SPARES & PARTS', 'WASHING', 'PARKING',
    'DRIVER BATA', 'POLICE CHALLAN', 'BATTERY / ELECTRICALS', 'ROAD TAX',
  ];

  // Load and subscribe to database changes
  const loadData = () => {
    setVehicles(localDb.getVehicles());
    setEmployees(localDb.getEmployees());
    setAccounts(localDb.getAccounts());
    setEmiEntries(localDb.getVehicleEmiEntries().sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    setExpenses(localDb.getVehicleExpenses());
    setSlips(localDb.getTripSlips());
    setOrders(localDb.getOrders());
    setSettings(localDb.getSettings());
    setTyres(localDb.getTyres());
    setSales(localDb.getSales());
    setParties(localDb.getParties());
    setItems(localDb.getItems());
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

  // Drivers are employees of role 'driver', managed in the Employees module
  const driverEmployees = useMemo(() => employees.filter(e => e.role === 'driver'), [employees]);

  // EMI alerts follow the shared 2-days-before window (dashboard + fleet row highlight)
  const emiAlertList = useMemo(() => localDb.getVehicleEmiAlerts(), [vehicles, emiEntries]);

  // Format Helper
  const formatCurrency = (val: number) => {
    const symbol = settings?.currency?.symbol || '₹';
    return `${symbol}${val.toLocaleString('en-IN')}`;
  };

  // Plant timezone (IST) calendar date — EMI due dates & alerts run on this
  const istToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // Client display format: YYYY-MM-DD → DD-MM-YYYY (pass-through otherwise)
  const formatDdMmYyyy = (ymd?: string) => {
    if (!ymd) return '—';
    const [y, m, d] = ymd.split('-');
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${d}-${m}-${y}` : ymd;
  };

  // Handle Opening Trip Slip Form with Pre-fills
  const handleOpenSlipModal = () => {
    const today = new Date().toISOString().split('T')[0];
    const timeNow = new Date().toTimeString().split(' ')[0].substring(0, 5);
    
    // Auto incremental serial TS-YYYY-XXXX
    const year = new Date().getFullYear();
    const serial = String(slips.length + 101).padStart(4, '0');
    
    setFormSlipNo(`TS-${year}-${serial}`);
    setFormSlipDate(today);
    setFormSlipTime(timeNow);
    setFormSlipVehicleId('');
    setFormSlipDriverId('');
    setFormSlipTripType('outward');
    setFormSlipOrderId('');
    setFormSlipMaterial('');
    setFormSlipWeight('');
    setFormSlipDestination('');
    setFormSlipFuel('');
    setFormSlipAdvance('');
    setFormSlipNotes('');
    
    setIsSlipModalOpen(true);
  };

  // Handle order selection side effect to prefill material/party details
  const handleOrderChange = (orderId: string) => {
    setFormSlipOrderId(orderId);
    if (!orderId) return;

    const selectedOrder = orders.find(o => o.id === orderId);
    if (selectedOrder) {
      if (selectedOrder.items && selectedOrder.items.length > 0) {
        setFormSlipMaterial(selectedOrder.items[0].itemName);
        setFormSlipWeight(String(selectedOrder.items[0].quantity));
      }
      
      // Attempt to look up delivery destination from notes or set to client name
      const party = localDb.getPartyById(selectedOrder.partyId);
      if (party && party.address) {
        setFormSlipDestination(`${party.name}, ${party.address.city}`);
      } else {
        setFormSlipDestination(selectedOrder.partyName);
      }
    }
  };

  // Handle vehicle selection side effect to auto-assign active driver
  const handleSlipVehicleChange = (vehId: string) => {
    setFormSlipVehicleId(vehId);
    const veh = vehicles.find(v => v.id === vehId);
    if (veh && veh.currentDriverId && driverEmployees.some(e => e.id === veh.currentDriverId)) {
      setFormSlipDriverId(veh.currentDriverId);
    }
  };

  const handleCreateTripSlip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSlipVehicleId || !formSlipDriverId || !formSlipMaterial || !formSlipDestination) {
      alert('Please fill in all mandatory fields.');
      return;
    }

    const selectedVehicle = vehicles.find(v => v.id === formSlipVehicleId);
    const selectedDriver = driverEmployees.find(d => d.id === formSlipDriverId);
    const selectedOrder = orders.find(o => o.id === formSlipOrderId);

    if (!selectedVehicle || !selectedDriver) return;

    const newSlip: Omit<TripSlip, 'id' | 'createdAt'> = {
      slipNumber: formSlipNo,
      date: formSlipDate,
      time: formSlipTime,
      vehicleId: formSlipVehicleId,
      vehicleNo: selectedVehicle.vehicleNo,
      driverId: formSlipDriverId,
      driverName: selectedDriver.name,
      tripType: formSlipTripType,
      orderId: formSlipOrderId || undefined,
      orderNumber: selectedOrder?.orderNumber || undefined,
      partyName: selectedOrder?.partyName || undefined,
      materialName: formSlipMaterial,
      netWeightTonnes: Number(formSlipWeight) || 0,
      destination: formSlipDestination,
      status: 'loading', // Starts as loading at the plant hopper
      fuelIssuedLiters: Number(formSlipFuel) || 0,
      cashAdvanceRupees: Number(formSlipAdvance) || 0,
      notes: formSlipNotes || undefined,
    };

    localDb.addTripSlip(newSlip);

    // Automatically sync logistics vehicle, driver, and advance to a legacy sales order so it populates in the Invoice
    if (selectedOrder) {
      localDb.updateLegacyOrder(selectedOrder.id, {
        vehicleNo: selectedVehicle.vehicleNo,
        driverName: selectedDriver.name,
        transportCharges: selectedOrder.transportCharges || Number(formSlipAdvance) || 0,
      });
    }

    setIsSlipModalOpen(false);
  };

  // Handle Open Vehicle Modal for Create / Edit
  const handleOpenVehicleModal = (veh?: Vehicle | null) => {
    setStagedVehicleDocs([]);
    const emi = veh?.emiDetails;
    const resetEmiFields = (from?: VehicleEmiDetails) => {
      setFormVehEmiFinancier(from?.financierName || '');
      setFormVehEmiLoanAccNo(from?.loanAccountNumber || '');
      setFormVehEmiTotalLoan(from?.totalLoanAmount ? String(from.totalLoanAmount) : '');
      setFormVehEmiTenureMonths(from?.totalTenureMonths ? String(from.totalTenureMonths) : '');
      setFormVehEmiAmount(from?.monthlyEmiAmount ? String(from.monthlyEmiAmount) : '');
      setFormVehEmiDueDay(from?.emiDueDay ? String(from.emiDueDay) : '10');
      setFormVehEmiAccountId(from?.emiAccountId || '');
      setFormVehEmiStartDate(from?.loanStartDate || '');
      setFormVehEmiOpenPaid(from?.paidEmisCount !== undefined ? String(from.paidEmisCount) : '0');
      setFormVehEmiStatus(from?.status || 'active');
      setFormVehEmiNotes(from?.notes || '');
    };
    if (veh) {
      setEditingVehicle(veh);
      setFormVehNo(veh.vehicleNo);
      setFormVehType(veh.type);
      setFormVehInsurance(veh.insuranceExpiry || '');
      setFormVehInsuranceAmount(veh.insuranceMonthlyAmount ? String(veh.insuranceMonthlyAmount) : '');
      setFormVehNotes(veh.notes || '');
      setFormVehDriverId(veh.currentDriverId || '');
      resetEmiFields(veh.emiDetails && veh.emiDetails.hasEmi ? veh.emiDetails : undefined);
    } else {
      setEditingVehicle(null);
      setFormVehNo('');
      setFormVehType('tipper');
      setFormVehInsurance('');
      setFormVehInsuranceAmount('');
      setFormVehNotes('');
      setFormVehDriverId('');
      resetEmiFields();
    }
    setVehDriverPickerOpen(false);
    setVehDriverQuery('');
    setVehDetailsOpen(true);
    setVehLoanOpen(true);
    setIsVehicleModalOpen(true);
  };

  // EMI amount auto-suggest: entering Loan Amount + Tenure prefills the
  // monthly EMI (flat spread) when the operator hasn't typed one yet.
  const handleEmiLoanParamsChange = (loan: string, tenure: string) => {
    const loanNum = Number(loan) || 0;
    const tenureNum = Number(tenure) || 0;
    if (loanNum > 0 && tenureNum > 0 && (!formVehEmiAmount || Number(formVehEmiAmount) === 0)) {
      setFormVehEmiAmount(String(Math.round(loanNum / tenureNum)));
    }
  };

  // Handle Save (Create / Update) Vehicle
  const handleSaveVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVehNo) {
      alert('Please fill in the vehicle number.');
      return;
    }

    // Full loan capture: entering a Monthly EMI Amount attaches the loan.
    // Loan end date derives from start + tenure (day-clamped); a loan with a
    // linked account + due day + EMI amount is auto-deducted by the cron.
    const emiAmountNum = Number(formVehEmiAmount) || 0;
    const hasLoan = emiAmountNum > 0;
    if (hasLoan && !formVehEmiAccountId) {
      // Required field (client directive): a financed vehicle must have the
      // account it auto-debits from selected.
      setVehLoanOpen(true);
      alert('Please select the Linked Bank Account for the EMI auto-debit.');
      return;
    }
    const tenureNum = Number(formVehEmiTenureMonths) || 0;
    const loanEndDate = hasLoan && formVehEmiStartDate && tenureNum > 0
      ? addMonthsIso(formVehEmiStartDate, tenureNum)
      : undefined;
    const emiDetails: VehicleEmiDetails = {
      ...(editingVehicle?.emiDetails || {}),
      hasEmi: hasLoan,
      monthlyEmiAmount: hasLoan ? emiAmountNum : undefined,
      totalLoanAmount: hasLoan || formVehEmiTotalLoan ? (formVehEmiTotalLoan ? Number(formVehEmiTotalLoan) : undefined) : undefined,
      totalTenureMonths: hasLoan ? (tenureNum > 0 ? tenureNum : undefined) : undefined,
      emiDueDay: hasLoan ? Math.min(31, Math.max(1, Number(formVehEmiDueDay) || 10)) : undefined,
      emiAccountId: hasLoan ? (formVehEmiAccountId || undefined) : undefined,
      loanStartDate: formVehEmiStartDate || undefined,
      loanEndDate: loanEndDate || undefined,
      paidEmisCount: hasLoan ? (Number(formVehEmiOpenPaid) || 0) : undefined,
      financierName: formVehEmiFinancier.trim() || undefined,
      loanAccountNumber: formVehEmiLoanAccNo.trim() || undefined,
      // Interest rate is deliberately not collected or saved (client
      // directive) — always null it so legacy values don't linger on edit.
      interestRate: undefined,
      status: hasLoan ? formVehEmiStatus : undefined,
      notes: formVehEmiNotes.trim() || undefined,
    };

    const assignedDriver = driverEmployees.find(d => d.id === formVehDriverId);

    if (editingVehicle) {
      // Driver assignment is editable here; fitness & workshop status remain
      // operational fields managed outside this modal.
      localDb.updateVehicle(editingVehicle.id, {
        vehicleNo: formVehNo.toUpperCase().trim(),
        type: formVehType,
        insuranceExpiry: formVehInsurance || undefined,
        insuranceMonthlyAmount: Number(formVehInsuranceAmount) || undefined,
        currentDriverId: formVehDriverId || undefined,
        currentDriverName: assignedDriver?.name || undefined,
        emiDetails,
        notes: formVehNotes || undefined,
      });
    } else {
      const newVeh: Omit<Vehicle, 'id' | 'createdAt'> = {
        vehicleNo: formVehNo.toUpperCase().trim(),
        type: formVehType,
        capacityTonnes: 0,
        ownership: 'owned',
        status: 'available',
        insuranceExpiry: formVehInsurance || undefined,
        insuranceMonthlyAmount: Number(formVehInsuranceAmount) || undefined,
        currentDriverId: formVehDriverId || undefined,
        currentDriverName: assignedDriver?.name || undefined,
        emiDetails,
        notes: formVehNotes || undefined,
      };
      localDb.addVehicle({
        ...newVeh,
        // Staged documents (new-vehicle flow) — the server links them in the
        // same create flow and moves each S3 object from Pending/ under
        // Vehicle/<id>/
        ...(stagedVehicleDocs.length > 0 ? { documentIds: stagedVehicleDocs.map((d) => d.id) } : {}),
      } as Partial<Vehicle>);
    }

    setIsVehicleModalOpen(false);
    setEditingVehicle(null);
  };

  /** Month-accurate YYYY-MM-DD adder (day-clamped: Jan 31 + 1m → Feb 28). */
  function addMonthsIso(ymd: string, months: number): string {
    const d = new Date(`${ymd}T00:00:00Z`);
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const lastDay = new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
    return d.toISOString().split('T')[0];
  }

  // --- EMI ENTRY LEDGER ----------
  /** Record Manual: open the entry form prefilled against a vehicle (or generic). */
  const handleOpenEmiEntryModal = (vehicle?: Vehicle | null, entry?: VehicleEmiEntry | null) => {
    const emi = vehicle?.emiDetails;
    if (entry) {
      setEditingEmiEntry(entry);
      setFormEmiVehicleId(entry.vehicleId);
      setFormEmiAccountId(entry.accountId);
      setFormEmiDate(entry.date);
      setFormEmiAmount(String(entry.amount));
      setFormEmiNotes(entry.notes || '');
    } else {
      setEditingEmiEntry(null);
      setFormEmiVehicleId(vehicle?.id || '');
      // Prefill the vehicle's configured auto-debit account for convenience
      setFormEmiAccountId(emi?.emiAccountId || '');
      // Prefill this month's due day (or today if it has already passed)
      const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const now = new Date(`${todayIst}T00:00:00Z`);
      const dueDay = Math.min(31, Math.max(1, Number(emi?.emiDueDay) || 1));
      const lastDay = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
      const dueDayClamped = Math.min(dueDay, lastDay);
      const prefillDate = dueDayClamped >= now.getUTCDate()
        ? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(dueDayClamped).padStart(2, '0')}`
        : todayIst;
      setFormEmiDate(prefillDate);
      setFormEmiAmount(emi?.monthlyEmiAmount ? String(emi.monthlyEmiAmount) : '');
      setFormEmiNotes('');
    }
    setIsEmiEntryModalOpen(true);
  };

  const handleSaveEmiEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmiVehicleId || !formEmiAccountId || !formEmiDate || !(Number(formEmiAmount) > 0)) {
      alert('Select the vehicle, account, date and a positive EMI amount.');
      return;
    }
    const entryPayload = {
      vehicleId: formEmiVehicleId,
      accountId: formEmiAccountId,
      date: formEmiDate,
      amount: Number(formEmiAmount),
      notes: formEmiNotes.trim() || undefined,
      source: (editingEmiEntry?.source || 'manual') as 'auto' | 'manual',
    };
    if (editingEmiEntry) {
      // Edit-by-delta: the server rebalances the linked account automatically
      localDb.updateVehicleEmiEntry(editingEmiEntry.id, entryPayload);
    } else {
      localDb.addVehicleEmiEntry(entryPayload);
    }
    setIsEmiEntryModalOpen(false);
    setEditingEmiEntry(null);
  };

  const handleDeleteEmiEntry = (entry: VehicleEmiEntry) => {
    if (confirm(`Delete this EMI entry? The account balance reverses the ₹${Number(entry.amount).toLocaleString('en-IN')} debit automatically.`)) {
      localDb.deleteVehicleEmiEntry(entry.id);
    }
  };

  // --- Vehicle expense log handlers ---
  // (The add-path CHOICE POPOVER was retired 2026-10-28 — the Add Expense
  // button opens the bulk grid directly. handleOpenExpenseModal survives for
  // EDITING an existing row.)

  // Open the expense/diesel form for an existing row (its entryType decides
  // which form branch shows).
  const handleOpenExpenseModal = (type: 'expense' | 'diesel', existing?: VehicleExpenseEntry | null) => {
    setStagedExpenseDocs([]);
    setExpenseFormType(type);
    if (existing) {
      setEditingExpense(existing);
      setFormExpenseVehicleId(existing.vehicleId || '');
      setFormExpenseAccountId(existing.accountId || '');
      setFormExpenseDate(existing.date || new Date().toISOString().split('T')[0]);
      setFormExpenseTypeFree(existing.expenseType || '');
      setFormExpenseLitres(existing.litres !== undefined ? String(existing.litres) : '');
      setFormExpenseRate(existing.ratePerLitre !== undefined ? String(existing.ratePerLitre) : '');
      setFormExpenseAmount(existing.amount ? String(existing.amount) : '');
      setFormExpenseNotes(existing.notes || '');
    } else {
      setEditingExpense(null);
      setFormExpenseVehicleId('');
      setFormExpenseAccountId('');
      setFormExpenseDate(new Date().toISOString().split('T')[0]);
      setFormExpenseTypeFree('');
      setFormExpenseLitres('');
      setFormExpenseRate('');
      setFormExpenseAmount('');
      setFormExpenseNotes('');
    }
    setIsExpenseModalOpen(true);
  };

  // Vehicle change on a diesel fill: prefill the litre rate from that
  // vehicle's latest recorded fill (rate stays editable) — mirrors the daily
  // sheet where one day's rate repeats across trucks.
  const handleExpenseVehicleChange = (vehId: string) => {
    setFormExpenseVehicleId(vehId);
    if (vehId && expenseFormType === 'diesel' && !editingExpense) {
      const lastRate = localDb
        .getVehicleExpenses(vehId)
        .filter((e) => e.entryType === 'diesel' && (e.ratePerLitre || 0) > 0)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.ratePerLitre;
      if (lastRate) {
        setFormExpenseRate(String(lastRate));
        recalcDieselCost(formExpenseLitres, String(lastRate));
      }
    }
  };

  // Diesel cost auto-fill: amount = litres × rate on every litres/rate change
  // (still a plain input, so a rounding difference can be typed over).
  const recalcDieselCost = (litres: string, rate: string) => {
    const cost = (Number(litres) || 0) * (Number(rate) || 0);
    if (cost > 0) setFormExpenseAmount(String(Math.round(cost * 100) / 100));
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formExpenseVehicleId || !formExpenseAccountId || !formExpenseDate || !(Number(formExpenseAmount) > 0)) {
      alert('Select the vehicle, account, date and a positive amount.');
      return;
    }
    if (expenseFormType === 'expense' && !formExpenseTypeFree.trim()) {
      alert('Enter the expense type (e.g. Puncture + Fitting, Tyre Change).');
      return;
    }
    if (expenseFormType === 'diesel' && !((Number(formExpenseLitres) || 0) > 0) && !editingExpense) {
      alert('Enter the diesel litres filled.');
      return;
    }
    const payload: Partial<VehicleExpenseEntry> = {
      entryType: expenseFormType,
      date: formExpenseDate,
      vehicleId: formExpenseVehicleId,
      accountId: formExpenseAccountId,
      ...(expenseFormType === 'expense'
        ? { expenseType: formExpenseTypeFree.trim() }
        : { expenseType: undefined, litres: Number(formExpenseLitres) || 0, ratePerLitre: Number(formExpenseRate) || 0 }),
      amount: Number(formExpenseAmount),
      notes: formExpenseNotes.trim() || undefined,
    };
    if (editingExpense) {
      // Edit-by-delta: the server rebalances the linked account automatically
      localDb.updateVehicleExpenseEntry(editingExpense.id, {
        ...payload,
        ...(stagedExpenseDocs.length > 0 ? { documentIds: stagedExpenseDocs.map((d) => d.id) } : {}),
      });
    } else {
      localDb.addVehicleExpenseEntry({
        ...payload,
        ...(stagedExpenseDocs.length > 0 ? { documentIds: stagedExpenseDocs.map((d) => d.id) } : {}),
      } as Partial<VehicleExpenseEntry>);
    }
    setIsExpenseModalOpen(false);
    setEditingExpense(null);
    setStagedExpenseDocs([]);
  };

  // Expense log filter — vehicle number, free-text type, account name, remarks
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (e.vehicleNo || vehicles.find((v) => v.id === e.vehicleId)?.vehicleNo || '').toLowerCase().includes(q) ||
        (e.expenseType || (e.entryType === 'diesel' ? 'diesel' : '')).toLowerCase().includes(q) ||
        (e.accountName || accounts.find((a) => a.id === e.accountId)?.name || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || e.entryType === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [expenses, vehicles, accounts, searchQuery, statusFilter]);

  // Filters Calculation (driverName/materialName are hydrated view fields and
  // may be undefined on outsourced slips — always guard the .toLowerCase())
  const filteredSlips = useMemo(() => {
    return slips.filter(s => {
      const matchesSearch =
        s.slipNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.driverName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.materialName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.destination.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [slips, searchQuery, statusFilter]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const matchesSearch = 
        v.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.currentDriverName && v.currentDriverName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        v.type.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vehicles, searchQuery, statusFilter]);

  const filteredDriverEmployees = useMemo(() => {
    return driverEmployees.filter(d => {
      const matchesSearch =
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.licenseNo || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.phone.includes(searchQuery);

      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [driverEmployees, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* VEHICLE PROFILE PAGE — like the party/employee profiles: selecting a
          vehicle REPLACES the tab content with its full page (Back returns) */}
      {detailVehicle ? (
        <VehicleDetailPage
          vehicle={detailVehicle}
          sales={sales}
          onBack={() => setDetailVehicle(null)}
          onEdit={(v) => {
            setDetailVehicle(null);
            handleOpenVehicleModal(v);
          }}
          onOpenRst={(saleId) => setViewingOrderSaleId(saleId)}
        />
      ) : (
      <>
      {/* Action Panel — buttons now live INSIDE the per-tab search bar
          (Add Vehicle on the Vehicles tab, Add Tyre on Tyre
          Fleet Management), placed LEFT of the search container */}

      {/* Sub Tabs Panel */}
      <div className="border-b border-[var(--color-outline-variant)]">
        <nav className="flex space-x-6 overflow-x-auto">
          <button
            onClick={() => { setActiveSubTab('trips'); setStatusFilter('all'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'trips'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <FileText className="h-4 w-4" />
            Trips
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {slips.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveSubTab('fleet'); setStatusFilter('all'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'fleet'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <Truck className="h-4 w-4" />
            Vehicles
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {vehicles.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveSubTab('expenses'); setStatusFilter('all'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'expenses'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <Receipt className="h-4 w-4" />
            Expenses
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {expenses.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveSubTab('emi-entries'); setStatusFilter('all'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'emi-entries'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            Vehicle EMI
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {emiEntries.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveSubTab('drivers'); setStatusFilter('all'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'drivers'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <User className="h-4 w-4" />
            Drivers
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {driverEmployees.length}
            </span>
          </button>
        </nav>
      </div>

      {/* SEARCH AND FILTER BAR — per-tab action buttons sit LEFT of the search */}
      {activeSubTab !== 'emi-entries' && (
        <div className="flex flex-col sm:flex-row gap-3 bg-[var(--color-surface-container-lowest)] p-3 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-outline)]" />
            <input
              type="text"
              placeholder={`Search ${activeSubTab === 'trips' ? 'slips, vehicles, destinations...' : activeSubTab === 'fleet' ? 'vehicle number, type...' : activeSubTab === 'expenses' ? 'vehicle, expense type, remarks...' : activeSubTab === 'drivers' ? 'driver name, license...' : 'vehicle number, type...'}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div className="flex items-center gap-2">
            {/* Status filter — hidden on the Vehicles tab (no status filter there) */}
            {activeSubTab !== 'fleet' && activeSubTab !== 'expenses' && (
              <>
                <Filter className="h-4 w-4 text-[var(--color-outline)]" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-2 pl-3.5 pr-8 border border-[var(--color-outline-variant)] rounded-full text-xs font-medium bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="all">All Statuses</option>
                  {activeSubTab === 'trips' && (
                    <>
                      <option value="loading">Loading at Plant</option>
                      <option value="transit">In Transit</option>
                      <option value="delivered">Delivered (Unloaded)</option>
                      <option value="closed">Closed / Returned</option>
                    </>
                  )}
                  {activeSubTab === 'drivers' && (
                    <>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </>
                  )}
                </select>
              </>
            )}
            {/* Per-tab action buttons, RIGHT of the status filter */}
            {activeSubTab === 'fleet' && (
              <button
                onClick={() => handleOpenVehicleModal(null)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs transition whitespace-nowrap"
              >
                <Truck className="h-4 w-4" />
                Add Vehicle
              </button>
            )}
            {activeSubTab === 'expenses' && (
              <div className="relative" ref={expenseChoiceRef}>
                {/* POPOVER REMOVED (2026-10-28, user): the Add Expense button
                    opens the BULK grid directly — expense + diesel rows in one
                    grid, diesel is the default kind (single-entry form now
                    serves only row EDITING). */}
                <button
                  type="button"
                  onClick={() => setIsBulkExpenseOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs transition whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  Add Expense Entries
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENTS */}

      {/* 1. TRIP SLIPS LOG TAB — the dispatch log renders as a TABLE (consistent
          with the rest of the app): a row click opens the slip's thermal
          details; the SALES ORDER cell opens the linked sale's details modal */}
      {activeSubTab === 'trips' && (
        <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                  {/* Slip No column REMOVED (2026-10-28) — details/thermal ticket keep it */}
                  <th className="py-3.5 px-4">Date &amp; Time</th>
                  <th className="py-3.5 px-3">RST Number</th>
                  <th className="py-3.5 px-3 min-w-[150px]">Vehicle</th>
                  <th className="py-3.5 px-3">Party</th>
                  <th className="py-3.5 px-3 text-right">Load (MT)</th>
                  <th className="py-3.5 px-3 text-right">Distance (km)</th>
                  <th className="py-3.5 px-3 text-right">Transport Rate (₹/T-km)</th>
                  <th className="py-3.5 px-3 text-right">Transport Total (₹)</th>
                  <th className="py-3.5 px-3 text-right">GST (%)</th>
                  <th className="py-3.5 px-3 text-right">Total Transportation Cost</th>
                  <th className="py-3.5 px-3">Drop Site</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]">
                {filteredSlips.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                      <FileText className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                      <p className="text-xs font-bold uppercase">No trip slips found matching filters</p>
                    </td>
                  </tr>
                ) : (
                  filteredSlips.map((slip) => {
                    // The linked sale at render time (drives Party + transport
                    // columns); the SO button re-resolves FRESH at click time
                    const linkedSale = (slip.saleId ? sales.find((s) => s.id === slip.saleId) : undefined) ||
                      (slip.orderNumber ? sales.find((s) => s.saleNumber === slip.orderNumber) : undefined);
                    // Sale-derived slips open the FULL sale details
                    // (OrderDetailModal) — resolved at CLICK time from the
                    // store (saleId FK first, order number as fallback), so
                    // even a stale list can't dead-end the link
                    const hasOrderLink = Boolean(slip.saleId || slip.orderNumber);
                    return (
                      <tr
                        key={slip.id}
                        className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]"
                      >
                        {/* Slip No cell REMOVED (2026-10-28) — the slip number
                            still shows on the slip-details modal + ticket */}
                        <td className="py-3.5 px-3 font-semibold text-[var(--color-on-surface-variant)] whitespace-nowrap">
                          {slip.date}
                          <span className="text-[10px] block font-medium">@ {slip.time}</span>
                        </td>
                        <td className="py-3.5 px-3 min-w-[140px]">
                          {hasOrderLink ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Resolve FRESH from the store at click time (not
                                // the render-time list): saleId FK → order number
                                const sale = (slip.saleId ? sales.find((s) => s.id === slip.saleId) : undefined) ||
                                  (slip.orderNumber ? sales.find((s) => s.saleNumber === slip.orderNumber) : undefined);
                                if (sale) {
                                  setViewingOrderSaleId(sale.id);
                                } else {
                                  alert(`RST ${slip.orderNumber || ''} (sales order) isn't loaded yet — try again in a moment.`);
                                }
                              }}
                              className="font-mono text-[11px] font-black text-[var(--color-primary)] underline decoration-dotted underline-offset-2 hover:opacity-80 cursor-pointer whitespace-nowrap"
                              title={`Open RST ${slip.orderNumber || ''} details`}
                            >
                              {slip.orderNumber || '—'}
                            </button>
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] font-semibold">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 min-w-[150px]">
                          <span className="font-mono font-black text-[var(--color-primary)] whitespace-nowrap block">{slip.vehicleNo}</span>
                          <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1 whitespace-nowrap">
                            <User className="h-3 w-3 text-[var(--color-outline)] shrink-0" />
                            {slip.driverName || '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          {(() => {
                            // The party's REGISTERED name (never tradeName) —
                            // resolved by the FK at read time; hydration
                            // fallbacks carry it when the master isn't present
                            const pid = linkedSale?.partyId || slip.partyId;
                            const party = pid ? parties.find((p) => p.id === pid) : undefined;
                            const partyLabel = party
                              ? party.name
                              : (linkedSale?.partyName || slip.partyName || '—');
                            return (
                              <span className="font-semibold text-[var(--color-on-surface)] truncate block max-w-[180px]" title={partyLabel}>
                                {partyLabel}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3.5 px-3 text-right font-bold">
                          {(slip.netWeightTonnes || 0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-bold">
                          {/* The sale's planned distance is authoritative (the
                              slip mirrors it); slip value is the fallback */}
                          {(linkedSale?.distanceKm ?? slip.distanceKm) !== undefined
                            ? (linkedSale?.distanceKm ?? slip.distanceKm)
                            : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-bold">
                          {linkedSale?.freightRatePerTonne !== undefined && linkedSale.freightRatePerTonne !== null
                            ? `₹${linkedSale.freightRatePerTonne}`
                            : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-black text-[var(--color-on-surface)]">
                          {/* The sale's transport cost — shown IRRESPECTIVE of
                              whether it was included: a sale carrying charges
                              shows them; an excluded sale shows its computed
                              w × d × rate; outsourced shows — */}
                          {(() => {
                            if (!linkedSale) return '—';
                            const rate = Number((linkedSale as any).freightRatePerTonne) || 0;
                            const charged = Number(linkedSale.transportCharges) || 0;
                            const computed = Math.round(
                              (Number(linkedSale.weightTonnes) || 0) *
                              (Number(linkedSale.distanceKm) || 0) * rate * 100
                            ) / 100;
                            const total = charged > 0 ? charged : (rate > 0 ? computed : 0);
                            return total > 0 ? `₹${total.toLocaleString('en-IN')}` : '—';
                          })()}
                        </td>
                        <td className="py-3.5 px-3 text-right text-[var(--color-on-surface-variant)]">
                          {/* GST slab ON the transport (freight) row, from the sale */}
                          {linkedSale && (Number(linkedSale.transportCharges) || 0) > 0
                            ? `${Number((linkedSale as any).freightGstRate) || 0}%`
                            : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-black text-[var(--color-primary)]">
                          {/* Total Transportation Cost = transport total + its GST */}
                          {(() => {
                            if (!linkedSale) return '—';
                            const charged = Number(linkedSale.transportCharges) || 0;
                            const computed = Math.round(
                              (Number(linkedSale.weightTonnes) || 0) *
                              (Number(linkedSale.distanceKm) || 0) * (Number((linkedSale as any).freightRatePerTonne) || 0) * 100
                            ) / 100;
                            const transport = charged > 0 ? charged : computed;
                            if (transport <= 0) return '—';
                            const gst = Math.round(transport * (Number((linkedSale as any).freightGstRate) || 0)) / 100;
                            return `₹${(Math.round((transport + gst) * 100) / 100).toLocaleString('en-IN')}`;
                          })()}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="text-[var(--color-on-surface-variant)] font-semibold flex items-center gap-1 truncate max-w-[200px]" title={slip.destination}>
                            <MapPin className="h-3.5 w-3.5 text-[var(--color-outline)] shrink-0" />
                            {slip.destination}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* (LINKED SALE DETAILS moved to the component tail — mounted outside
          the tabs/profile branch so it never hides behind the profile page) */}

      {/* 2. FLEET & MACHINERY LIST VIEW — merged with Vehicle EMI & Loans */}
      {activeSubTab === 'fleet' && (
        <>
          {/* EMI Metrics Summary Cards */}
          {(() => {
          const financedVehicles = vehicles.filter(v => v.emiDetails && v.emiDetails.hasEmi);
          const activeFinanced = financedVehicles.filter(v => v.emiDetails?.status !== 'closed');
          const totalMonthlyOutflow = activeFinanced.reduce((sum, v) => sum + (v.emiDetails?.monthlyEmiAmount || 0), 0);
          const totalPortfolioPrincipal = financedVehicles.reduce((sum, v) => sum + (v.emiDetails?.totalLoanAmount || 0), 0);

          // Find next due vehicle
          const todayDay = new Date().getDate();
          const sortedByDue = [...activeFinanced].sort((a, b) => {
            const dueA = a.emiDetails?.emiDueDay || 10;
            const dueB = b.emiDetails?.emiDueDay || 10;
            const diffA = dueA >= todayDay ? dueA - todayDay : 30 + (dueA - todayDay);
            const diffB = dueB >= todayDay ? dueB - todayDay : 30 + (dueB - todayDay);
            return diffA - diffB;
          });
          const nextDueVehicle = sortedByDue[0];

          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Metric 1 */}
              <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Monthly EMI Commitment</p>
                  <h3 className="text-2xl font-extrabold text-[var(--color-primary)] mt-1">{formatCurrency(totalMonthlyOutflow)}</h3>
                 
                </div>
                <div className="p-2.5 bg-[var(--color-primary-container)] rounded-2xl">
                  <Landmark className="h-5 w-5 text-[var(--color-on-primary-container)]" />
                </div>
              </div>

              {/* Metric 2 */}
              <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Financed Fleet</p>
                  <h3 className="text-2xl font-extrabold text-[var(--color-on-surface)] mt-1">
                    {activeFinanced.length} <span className="text-sm font-semibold text-[var(--color-on-surface-variant)]">/ {vehicles.length} Trucks</span>
                  </h3>
                  
                </div>
                <div className="p-2.5 bg-[var(--color-surface-container)] rounded-2xl">
                  <Truck className="h-5 w-5 text-[var(--color-primary)]" />
                </div>
              </div>

             
            </div>
          );
        })()}


        <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 min-w-[170px]">Vehicle No</th>
                  <th className="py-3.5 px-3">Equipment Type</th>
                  <th className="py-3.5 px-3 min-w-[170px]">Assigned Driver</th>
                  <th className="py-3.5 px-3 min-w-[140px]">Insurance</th>
                  <th className="py-3.5 px-3 text-right">Monthly EMI (₹)</th>
                  <th className="py-3.5 px-3 whitespace-nowrap">Next EMI Date</th>
                  <th className="py-3.5 px-3">Tenure / Repayment</th>
                  <th className="py-3.5 px-3">Auto-Debit Account</th>
                  <th className="py-3.5 px-3">Loan Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]">
                {filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                      <Truck className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                      <p className="text-xs font-bold uppercase">No vehicles registered</p>
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((vehicle) => {
                    // Insurance expiry inside 30 days raises the warning tone
                    const isInsuranceWarning = !!vehicle.insuranceExpiry && new Date(vehicle.insuranceExpiry) < new Date(Date.now() + 30*24*60*60*1000);

                    // --- EMI / loan computations (entries-aware) ---
                    const emi = vehicle.emiDetails;
                    const hasActiveEmi = emi && emi.hasEmi && emi.status !== 'closed';
                    const postedEntries = emiEntries.filter(e => e.vehicleId === vehicle.id);
                    const paid = (emi?.paidEmisCount || 0) + postedEntries.length;
                    const totalTenure = emi?.totalTenureMonths || 0;
                    const emisLeftForVehicle = hasActiveEmi && totalTenure ? Math.max(0, totalTenure - paid) : undefined;
                    const progressPercent = totalTenure > 0 ? Math.min(100, Math.round((paid / totalTenure) * 100)) : 0;
                    const debitAccountName = emi?.emiAccountId ? accounts.find(a => a.id === emi.emiAccountId)?.name || emi.autoDebitAccount : emi?.autoDebitAccount;

                    // 2-DAYS-BEFORE ALERT (client directive) — red reserved for
                    // short-of-funds; amber for due-soon / overdue
                    const t = new Date(`${istToday}T00:00:00Z`);
                    const lastDayThisMonth = new Date(t.getUTCFullYear(), t.getUTCMonth() + 1, 0).getUTCDate();
                    const dueDayThis = Math.min(31, Math.max(1, emi?.emiDueDay || 10), lastDayThisMonth);
                    const dueDateThis = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(dueDayThis).padStart(2, '0')}`;
                    const daysUntil = Math.round((Date.parse(`${dueDateThis}T00:00:00Z`) - Date.parse(`${istToday}T00:00:00Z`)) / 86_400_000);
                    const postedThisMonth = postedEntries.some(e => String(e.date).slice(0, 7) === dueDateThis.slice(0, 7));
                    const isAlertWindow = !postedThisMonth && emi?.status !== 'closed' && daysUntil <= 2;
                    const isOverdue = isAlertWindow && daysUntil < 0;
                    const isDueSoon = isAlertWindow && daysUntil >= 0;
                    const vehicleShortOfFunds = isAlertWindow && emi?.emiAccountId
                      ? (accounts.find(a => a.id === emi.emiAccountId)?.currentBalance ?? 0) < (Number(emi.monthlyEmiAmount) || 0)
                      : false;

                    return (
                      <tr key={vehicle.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                        <td className="py-3.5 px-4 min-w-[170px]">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailVehicle(vehicle)}
                              className="font-mono text-xs font-black text-[var(--color-on-surface)] bg-[var(--color-surface-container-highest)] hover:bg-[var(--color-surface-container)] px-2.5 py-0.5 rounded-full border border-[var(--color-outline-variant)] tracking-wider transition cursor-pointer flex items-center gap-1"
                              title="Click to view the vehicle's full details, spend & KM run"
                            >
                              {vehicle.vehicleNo}
                            </button>
                          </div>
                          
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="text-[var(--color-on-surface)] font-bold capitalize">{vehicle.type}</span>
                        </td>
                        <td className="py-3.5 px-3 min-w-[170px]">
                          {vehicle.currentDriverId ? (
                            (() => {
                              const drv = driverEmployees.find(e => e.id === vehicle.currentDriverId);
                              return (
                                <div className="flex flex-col">
                                  <span className="text-[var(--color-on-surface)] font-bold flex items-center gap-1">
                                    <User className="h-3.5 w-3.5 text-[var(--color-outline)]" />
                                    {vehicle.currentDriverName || drv?.name || '—'}
                                  </span>
                                  <span className="text-[9px] font-semibold text-[var(--color-on-surface-variant)] ml-5">
                                    {drv?.salaryBase ? `${formatCurrency(drv.salaryBase)}/${drv.salaryType === 'daily' ? 'day' : 'mo'}` : '—'}
                                  </span>
                                </div>
                              );
                            })()
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] font-normal">Unassigned</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 min-w-[140px]">
                          {vehicle.insuranceMonthlyAmount || vehicle.insuranceExpiry ? (
                            <div className="flex flex-col">
                              {vehicle.insuranceMonthlyAmount ? (
                                <span className={`font-mono font-bold text-xs flex items-center gap-1 ${isInsuranceWarning ? 'text-[var(--color-warning)]' : 'text-[var(--color-on-surface)]'}`}>
                                  {formatCurrency(vehicle.insuranceMonthlyAmount)}
                                  <span className="text-[9px] font-bold text-[var(--color-on-surface-variant)]">/mo</span>
                                </span>
                              ) : (
                                <span className="text-[var(--color-on-surface)] font-bold">—</span>
                              )}
                              {vehicle.insuranceExpiry && (
                                <span className={`text-[9px] mt-0.5 ${isInsuranceWarning ? 'text-[var(--color-warning)] font-bold' : 'text-[var(--color-on-surface-variant)]'}`}>
                                  Expiry: {formatDdMmYyyy(vehicle.insuranceExpiry)}
                                </span>
                              )}
                              {isInsuranceWarning && (
                                <span className="text-[8px] font-black uppercase w-fit mt-0.5 px-1.5 py-0.2 rounded-full bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]">
                                  ⚠ Due within 30 days
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] font-semibold">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          {emi?.hasEmi ? (
                            <span className="font-mono font-black text-[var(--color-primary)] text-xs">
                              {formatCurrency(emi.monthlyEmiAmount || 0)}
                              
                            </span>
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] font-semibold">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {emi?.hasEmi ? (
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                                vehicleShortOfFunds
                                  ? 'bg-[var(--color-error)] text-[var(--color-on-error)] animate-pulse'
                                  : isDueSoon || isOverdue
                                    ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] font-bold animate-pulse'
                                    : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]'
                              }`}>
                                <Clock className="h-2.5 w-2.5" />
                                {vehicleShortOfFunds
                                  ? 'Account Short of EMI Funds'
                                  : isOverdue
                                    ? `Overdue (due ${dueDateThis})`
                                    : isDueSoon
                                      ? (daysUntil === 1 ? '⚠ Due Tomorrow' : daysUntil === 0 ? '⚠ Due Today' : 'Due in 2 Days')
                                      : `Every ${emi.emiDueDay || 10}th`}
                              </span>
                             
                            </div>
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] font-semibold">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          {emi?.hasEmi && totalTenure > 0 ? (
                            <div className="space-y-1 min-w-[110px]">
                              <div className="flex justify-between text-[10px] font-bold">
                                <span>{paid} of {totalTenure} paid{emisLeftForVehicle !== undefined ? `` : ''}</span>
                                <span>{progressPercent}%</span>
                              </div>
                              <div className="w-full bg-[var(--color-surface-container-high)] h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-[var(--color-primary)] h-full rounded-full transition-all"
                                  style={{ width: `${progressPercent}%` }}
                                ></div>
                              </div>
                            </div>
                          ) : emi?.hasEmi ? (
                            <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">Tenure not set</span>
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] font-semibold">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="text-[11px] font-medium text-[var(--color-on-surface-variant)] truncate max-w-[130px] block">
                            {debitAccountName || '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          {emi?.hasEmi ? (
                            <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                              emi.status === 'active'
                                ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                : emi.status === 'closed'
                                  ? 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]'
                                  : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                            }`}>
                              {emi.status || 'active'}
                            </span>
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] font-semibold">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="relative" ref={vehicleMoreMenu?.id === vehicle.id ? moreVehicleMenuRef : undefined}>
                              <button
                                onClick={(e) => toggleVehicleMoreMenu(vehicle.id, e.currentTarget)}
                                className={`p-1.5 rounded-full transition ${vehicleMoreMenu?.id === vehicle.id ? 'bg-[var(--color-surface-container-highest)] text-[var(--color-primary)]' : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]'}`}
                                title="More Actions"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>

                              {/* More-actions popover: EMI + Tyres live in here.
                                  VIEWPORT-FIXED so the table's overflow-x-auto
                                  container can't clip it. */}
                              {vehicleMoreMenu?.id === vehicle.id && (
                                <div
                                  className="fixed w-44 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xl p-1.5 z-50 animate-scaleUp"
                                  style={{ top: vehicleMoreMenu.top, left: vehicleMoreMenu.left }}
                                >
                                  <button
                                    onClick={() => {
                                      setVehicleMoreMenu(null);
                                      handleOpenVehicleModal(vehicle);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] rounded-xl text-left transition-colors"
                                  >
                                    <Edit3 className="h-3.5 w-3.5 text-[var(--color-on-surface-variant)] shrink-0" />
                                    Edit Vehicle
                                    {hasActiveEmi && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]"></span>}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setVehicleMoreMenu(null);
                                      setSelectedVehicleForTyres(vehicle);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] rounded-xl text-left transition-colors"
                                  >
                                    <Disc className="h-3.5 w-3.5 text-[var(--color-outline)] shrink-0" />
                                    Tyres ({tyres.filter(t => t.vehicleId === vehicle.id && t.status === 'mounted').length})
                                  </button>
                                  <p className="px-3 pt-1.5 pb-1 text-[9px] text-[var(--color-on-surface-variant)] border-t border-[var(--color-outline-variant)] mt-1 truncate">
                                    Loan, tyres & axle details for {vehicle.vehicleNo}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}


      {/* 2.5 EXPENSES LOG TAB — the fleet's expense log renders as a TABLE:
          generic rows (free-text type) and diesel rows (litres × rate) share
          one log; every save DEBITS the chosen cash/bank account */}
      {activeSubTab === 'expenses' && (() => {
        const now = new Date(`${istToday}T00:00:00Z`);
        const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const monthRows = expenses.filter((e) => String(e.date).slice(0, 7) === monthKey);
        const dieselRows = monthRows.filter((e) => e.entryType === 'diesel');
        return (
          <>
            {/* Month metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Spent This Month (₹)</p>
                  <h3 className="text-2xl font-extrabold text-[var(--color-primary)] mt-1">
                    {formatCurrency(monthRows.reduce((s, e) => s + (Number(e.amount) || 0), 0)).replace('₹', '₹')}
                  </h3>
                  <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">{monthRows.length} entr{monthRows.length === 1 ? 'y' : 'ies'}</span>
                </div>
                <div className="p-2.5 bg-[var(--color-primary-container)] rounded-2xl">
                  <Receipt className="h-5 w-5 text-[var(--color-on-primary-container)]" />
                </div>
              </div>
              <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Diesel This Month</p>
                  <h3 className="text-2xl font-extrabold text-[var(--color-on-surface)] mt-1">
                    {dieselRows.reduce((s, e) => s + (Number(e.litres) || 0), 0).toFixed(0)}
                    <span className="text-sm font-semibold text-[var(--color-on-surface-variant)]"> L</span>
                  </h3>
                  <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">
                    {formatCurrency(dieselRows.reduce((s, e) => s + (Number(e.amount) || 0), 0))} across {dieselRows.length} fills
                  </span>
                </div>
                <div className="p-2.5 bg-[var(--color-surface-container)] rounded-2xl">
                  <Fuel className="h-5 w-5 text-[var(--color-primary)]" />
                </div>
              </div>
            </div>

            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-3 min-w-[140px]">Vehicle</th>
                      <th className="py-3.5 px-3 min-w-[170px]">Type</th>
                      <th className="py-3.5 px-3 text-right">Litres</th>
                      <th className="py-3.5 px-3 text-right">Rate (₹/L)</th>
                      <th className="py-3.5 px-3 text-right">Amount (₹)</th>
                      <th className="py-3.5 px-3">From Account</th>
                      <th className="py-3.5 px-3">Remarks</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]">
                    {filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                          <Receipt className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                          <p className="text-xs font-bold uppercase">No expense entries found matching filters</p>
                          <p className="text-[11px] mt-1 text-[var(--color-on-surface-variant)]">
                            Use "Add Expense" to log an expense entry or a diesel fuel fill.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((entry) => {
                        const vehNo = entry.vehicleNo || vehicles.find((v) => v.id === entry.vehicleId)?.vehicleNo || '—';
                        return (
                          <tr key={entry.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                            <td className="py-3.5 px-4 font-semibold text-[var(--color-on-surface-variant)] whitespace-nowrap">
                              {formatDdMmYyyy(entry.date)}
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="font-mono font-black text-[var(--color-primary)] whitespace-nowrap">{vehNo}</span>
                            </td>
                            <td className="py-3.5 px-3 min-w-[170px]">
                              {entry.entryType === 'diesel' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-[var(--color-info-container)] text-[var(--color-on-info-container)]">
                                  <Fuel className="h-2.5 w-2.5" /> Diesel
                                </span>
                              ) : (
                                <span className="font-bold text-[var(--color-on-surface)] capitalize">{entry.expenseType || '—'}</span>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-right font-bold">
                              {entry.entryType === 'diesel' && (entry.litres || 0) > 0 ? entry.litres.toFixed(2) : '—'}
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-bold">
                              {entry.entryType === 'diesel' && (entry.ratePerLitre || 0) > 0 ? `₹${entry.ratePerLitre}` : '—'}
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-black text-[var(--color-on-surface)]">
                              {formatCurrency(entry.amount)}
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="font-semibold text-[var(--color-on-surface)] truncate block max-w-[150px]" title={entry.accountName}>
                                {entry.accountName || accounts.find((a) => a.id === entry.accountId)?.name || '—'}
                              </span>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] truncate block max-w-[200px]" title={entry.notes}>
                                {entry.notes || '—'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setExpenseDocsOpen(entry)}
                                  className="p-1.5 rounded-full text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] transition"
                                  title="Documents (receipts) attached to this entry"
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleOpenExpenseModal(entry.entryType, entry)}
                                  className="px-2.5 py-1 text-[10px] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] font-bold rounded-full transition shadow-2xs"
                                  title="Edit entry — the account balance adjusts by the difference automatically"
                                >
                                  Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}


      {/* 2.6 EMI ENTRIES — DEDUCTIONS LEDGER (its own sub-tab) */}
      {activeSubTab === 'emi-entries' && (
          <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
            <div className="p-4 sm:p-5 border-b border-[var(--color-outline-variant)] flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface-container)]/60">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--color-on-surface)] flex items-center gap-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-[var(--color-success)]" />
                  Vehicle EMI
                </h3>
               
              </div>
              <button
                onClick={() => handleOpenEmiEntryModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs transition"
              >
                <Plus className="h-4 w-4" /> Record EMI Entry
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-3">Vehicle</th>
                    <th className="py-3.5 px-3 text-right">EMI Amount (₹)</th>
                    <th className="py-3.5 px-3">From Account</th>
                    <th className="py-3.5 px-3">Source</th>
                    <th className="py-3.5 px-3">Notes</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]">
                  {emiEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                        <Landmark className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                        <p className="text-xs font-bold uppercase">No EMI entries yet</p>
                        <p className="text-[11px] mt-1 text-[var(--color-on-surface-variant)]">
                          Auto entries post here every EMI date; record early/missed installments manually with "Record EMI Entry".
                        </p>
                      </td>
                    </tr>
                  ) : (
                    emiEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                        <td className="py-3 px-4">
                          <span className="font-bold block">{entry.date}</span>
                          <span className="text-[9px] text-[var(--color-on-surface-variant)]">posted {String(entry.createdAt || '').split('T')[0]}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono font-black text-[var(--color-primary)]">{entry.vehicleNo || '—'}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-[var(--color-on-surface)]">
                          {formatCurrency(entry.amount)}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-[var(--color-on-surface)]">{entry.accountName || '—'}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            entry.source === 'auto'
                              ? 'bg-[var(--color-info-container)] text-[var(--color-on-info-container)]'
                              : 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                          }`}>
                            {entry.source === 'auto' ? '⚙ Auto' : 'Manual'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[10px] text-[var(--color-on-surface-variant)] truncate block max-w-[220px]" title={entry.notes}>
                            {entry.notes || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEmiEntryModal(null, entry)}
                              className="px-2.5 py-1 text-[10px] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] font-bold rounded-full transition shadow-2xs"
                              title="Edit entry — account balance adjusts by the difference automatically"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
      )}

            {/* 3. DRIVERS DIRECTORY (sourced from Employees module, read-only) */}
      {activeSubTab === 'drivers' && (
        <div className="space-y-4">
          <div className="bg-[var(--color-info-container)]/40 border border-[var(--color-info)]/30 rounded-[24px] p-4 flex gap-3 text-left">
            <User className="h-5 w-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">Drivers Come From The Employees Module</h5>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] leading-normal">
                This directory lists every active employee with the <b>driver</b> role. Register, edit, or deactivate drivers in the
                Employees section — they automatically appear here for vehicle assignment and trip slip dispatch.
              </p>
            </div>
          </div>

          <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Driver Details</th>
                    <th className="py-3.5 px-3">Commercial License No</th>
                    <th className="py-3.5 px-3">Contact Phone</th>
                    <th className="py-3.5 px-3 text-right">Salary</th>
                    <th className="py-3.5 px-3">Assigned Vehicles</th>
                    <th className="py-3.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]">
                  {filteredDriverEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                        <User className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                        <p className="text-xs font-bold uppercase">No driver-role employees found</p>
                        <p className="text-[11px] mt-1 text-[var(--color-on-surface-variant)]">
                          Create a driver in the Employees module to see them listed here.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredDriverEmployees.map((driver) => {
                      const assignedVehs = vehicles.filter(v => v.currentDriverId === driver.id);

                      return (
                        <tr key={driver.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)] flex items-center justify-center font-bold text-[var(--color-on-surface)] text-sm">
                                {driver.name.charAt(0)}
                              </div>
                              <div>
                                {onOpenDriverProfile ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenDriverProfile(driver.id)}
                                    className="font-bold text-[var(--color-on-surface)] hover:text-[var(--color-primary)] transition-colors block text-left underline-offset-2 hover:underline"
                                    title="Open the driver's full profile in the Employees feature"
                                  >
                                    {driver.name}
                                  </button>
                                ) : (
                                  <span className="font-bold text-[var(--color-on-surface)] block">{driver.name}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="font-mono text-xs text-[var(--color-on-surface-variant)] font-bold">{driver.licenseNo || '—'}</span>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="text-[var(--color-on-surface)] font-bold">{driver.phone}</span>
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <span className="font-mono font-bold text-[var(--color-on-surface)]">
                              {formatCurrency(driver.salaryBase || 0)}
                            </span>
                            <span className="text-[9px] font-bold uppercase text-[var(--color-on-surface-variant)]">
                              /{driver.salaryType === 'daily' ? 'day' : 'mo'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            {assignedVehs.length === 0 ? (
                              <span className="text-[var(--color-on-surface-variant)] font-semibold">None</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {assignedVehs.map(v => (
                                  <span key={v.id} className="font-mono text-[10px] font-bold bg-[var(--color-surface-container-highest)] px-2 py-0.5 rounded-full border border-[var(--color-outline-variant)]">
                                    {v.vehicleNo}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                              driver.status === 'active'
                                ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20'
                                : 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] border border-[var(--color-warning)]/20'
                            }`}>
                              {driver.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* GLOBAL MODALS */}
      {/* ======================================= */}

      {/* 2. CREATE TRIP SLIP MODAL */}
      {isSlipModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] max-w-2xl w-full overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div>
                <h3 className="font-extrabold text-[var(--color-on-surface)] text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[var(--color-primary)]" /> Create Driver Trip Slip
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">Authorise and log vehicle dispatch with fuel and cash advanced.</p>
              </div>
              <button
                onClick={() => setIsSlipModalOpen(false)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTripSlip}>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[480px] overflow-y-auto">
                {/* Row 1: Slip number & Trip type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Trip Slip Number</label>
                  <input
                    type="text"
                    value={formSlipNo}
                    onChange={(e) => setFormSlipNo(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container)] font-mono font-bold text-[var(--color-on-surface)] focus:outline-none"
                    required
                    readOnly
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Trip Category</label>
                  <select
                    value={formSlipTripType}
                    onChange={(e) => setFormSlipTripType(e.target.value as any)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  >
                    <option value="outward">Outward Dispatch (To Site)</option>
                    <option value="inward">Inward Supply (Refinery Feed)</option>
                    <option value="internal">Internal Yard Shifting</option>
                  </select>
                </div>

                {/* Optional Link to active Orders */}
                {formSlipTripType !== 'internal' && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Link Active PO/RFQ Order (Optional)</label>
                    <select
                      value={formSlipOrderId}
                      onChange={(e) => handleOrderChange(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    >
                      <option value="">-- No Linked Order --</option>
                      {orders
                        .filter(o => o.status === 'pending' || o.status === 'partially_completed')
                        .map(o => (
                          <option key={o.id} value={o.id}>
                            {o.orderNumber} - {o.partyName} ({o.items?.[0]?.itemName || 'Materials'})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Vehicle Choice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Select Vehicle *</label>
                  <select
                    value={formSlipVehicleId}
                    onChange={(e) => handleSlipVehicleChange(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    required
                  >
                    <option value="">-- Choose Tipper/Tanker --</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.vehicleNo} [{v.type.toUpperCase()}] ({v.status === 'on_trip' ? '🚨 Active Trip' : 'Available'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Driver Choice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Assign Driver *</label>
                  <select
                    value={formSlipDriverId}
                    onChange={(e) => setFormSlipDriverId(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    required
                  >
                    <option value="">-- Choose Driver --</option>
                    {driverEmployees.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.status === 'active' ? 'Active' : 'Inactive'})
                      </option>
                    ))}
                  </select>
                  {driverEmployees.length === 0 && (
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1">
                      No drivers yet — add a driver-role employee in the Employees module.
                    </p>
                  )}
                </div>

                {/* Material & Qty */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Material Item Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. VG-40 Dense Bituminous Macadam"
                    value={formSlipMaterial}
                    onChange={(e) => setFormSlipMaterial(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Net Weight Cargo (MT) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 24.50"
                    value={formSlipWeight}
                    onChange={(e) => setFormSlipWeight(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    required
                  />
                </div>

                {/* Destination */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Unloading Site / Destination *</label>
                  <input
                    type="text"
                    placeholder="e.g. NH-48 Expressway Project Site, Chainage Km 42"
                    value={formSlipDestination}
                    onChange={(e) => setFormSlipDestination(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    required
                  />
                </div>

                {/* Advances details */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">HSD Diesel Issued (Liters)</label>
                  <input
                    type="number"
                    placeholder="e.g. 80"
                    value={formSlipFuel}
                    onChange={(e) => setFormSlipFuel(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Toll Cash Advance (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 2500"
                    value={formSlipAdvance}
                    onChange={(e) => setFormSlipAdvance(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Operator Remarks / Notes</label>
                  <textarea
                    placeholder="e.g. Hot mix temperature 165°C, dispatch immediately."
                    value={formSlipNotes}
                    onChange={(e) => setFormSlipNotes(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    rows={2}
                  />
                </div>
              </div>

              <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsSlipModalOpen(false)}
                  className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs"
                >
                  Confirm & Dispatch Slip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADD / EDIT VEHICLE & FINANCING MODAL */}
      {isVehicleModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] max-w-xl w-full overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div>
                <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm flex items-center gap-2">
                  <Truck className="h-4.5 w-4.5 text-[var(--color-primary)]" />
                  {editingVehicle ? `Edit ${editingVehicle.vehicleNo}` : 'Register Fleet Vehicle'}
                </h3>
              </div>
              <button
                onClick={() => setIsVehicleModalOpen(false)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle}>
              <div className="p-6 space-y-4 max-h-[520px] overflow-y-auto text-left">
                {/* VEHICLE DETAILS — collapsible accordion */}
                <div className="rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setVehDetailsOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    <span className="text-[11px] font-extrabold text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" /> Vehicle Details
                    </span>
                    <span className="flex items-center gap-2">
                      {formVehDriverId && !vehDetailsOpen && (
                        <span className="text-[9px] font-bold text-[var(--color-on-primary-container)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full truncate max-w-[140px]">
                          {driverEmployees.find(d => d.id === formVehDriverId)?.name}
                        </span>
                      )}
                      <ChevronDown className={`h-4 w-4 text-[var(--color-on-surface-variant)] transition-transform ${vehDetailsOpen ? '' : '-rotate-90'}`} />
                    </span>
                  </button>

                  {vehDetailsOpen && (
                    <div className="p-4 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Vehicle RTO Number *</label>
                        <input
                          type="text"
                          placeholder="e.g. MH-12-PQ-1234"
                          value={formVehNo}
                          onChange={(e) => setFormVehNo(e.target.value)}
                          className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Equipment Type</label>
                          <select
                            value={formVehType}
                            onChange={(e) => setFormVehType(e.target.value as any)}
                            className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                          >
                            <option value="tipper">Tipper Truck</option>
                            <option value="tanker">Bitumen Tanker</option>
                            <option value="mixer">Transit Mixer</option>
                            <option value="loader">Loader (JCB/CAT)</option>
                            <option value="other">Other Machine</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Insurance Expiry</label>
                          <input
                            type="date"
                            value={formVehInsurance}
                            onChange={(e) => setFormVehInsurance(e.target.value)}
                            className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Monthly Insurance Amount (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="e.g. 4500"
                            value={formVehInsuranceAmount}
                            onChange={(e) => setFormVehInsuranceAmount(e.target.value)}
                            className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Notes / Model</label>
                          <input
                            type="text"
                            placeholder="e.g. Tata Signa 2823, double axle"
                            value={formVehNotes}
                            onChange={(e) => setFormVehNotes(e.target.value)}
                            className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* ASSIGNED DRIVER — searchable select of driver-role employees */}
                      <div className="space-y-1.5 relative" ref={vehDriverPickerRef}>
                        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Assigned Driver</label>

                        {vehDriverPickerOpen ? (
                          <input
                            type="text"
                            autoFocus
                            placeholder="Search drivers by name, phone or license…"
                            value={vehDriverQuery}
                            onChange={(e) => setVehDriverQuery(e.target.value)}
                            className="w-full p-2.5 border border-[var(--color-primary)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setVehDriverPickerOpen(true); setVehDriverQuery(''); }}
                            className={`w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm text-left flex items-center justify-between gap-2 transition-colors ${formVehDriverId ? 'bg-[var(--color-surface-container-lowest)]' : 'bg-[var(--color-surface-container)]'}`}
                          >
                            {formVehDriverId ? (
                              (() => {
                                const sel = driverEmployees.find(d => d.id === formVehDriverId);
                                return sel ? (
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className="w-6 h-6 rounded-full bg-[var(--color-surface-container-high)] flex items-center justify-center text-[10px] font-bold text-[var(--color-on-surface)] shrink-0">
                                      {sel.name.charAt(0)}
                                    </span>
                                    <span className="font-bold text-[var(--color-on-surface)] truncate">{sel.name}</span>
                                    <span className="text-[10px] text-[var(--color-on-surface-variant)] shrink-0">{sel.phone}</span>
                                  </span>
                                ) : null;
                              })()
                            ) : (
                              <span className="text-[var(--color-on-surface-variant)]">Search & assign a driver…</span>
                            )}
                            <span className="flex items-center gap-1 shrink-0">
                              {formVehDriverId && (
                                <X
                                  className="h-3.5 w-3.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormVehDriverId('');
                                  }}
                                />
                              )}
                              <User className="h-3.5 w-3.5 text-[var(--color-outline)]" />
                            </span>
                          </button>
                        )}

                        {vehDriverPickerOpen && (
                          <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] divide-y divide-[var(--color-outline-variant)] shadow-lg">
                            {(() => {
                              const q = vehDriverQuery.trim().toLowerCase();
                              const matches = driverEmployees
                                .filter(d =>
                                  !q ||
                                  d.name.toLowerCase().includes(q) ||
                                  d.phone.includes(q) ||
                                  (d.licenseNo || '').toLowerCase().includes(q))
                                .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
                              if (matches.length === 0) {
                                return (
                                  <div className="p-4 text-center">
                                    <User className="h-6 w-6 text-[var(--color-outline)] mx-auto mb-1.5" />
                                    <p className="text-xs font-bold text-[var(--color-on-surface)]">No driver-role employees found</p>
                                    <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                                      Add one in the Employees module with Operational Role Designation: Driver.
                                    </p>
                                  </div>
                                );
                              }
                              return matches.map(d => {
                                // 1 : 1 mapping — a driver already assigned to
                                // another vehicle stays visible but is NOT
                                // selectable from here (this vehicle's own
                                // current driver remains selectable on edit).
                                const occupant = vehicles.find(v => v.currentDriverId === d.id && v.id !== editingVehicle?.id);
                                const disabled = !!occupant;
                                return (
                                  <button
                                    key={d.id}
                                    type="button"
                                    disabled={disabled}
                                    title={disabled ? `${d.name} is assigned to ${occupant?.vehicleNo} (one driver = one vehicle)` : undefined}
                                    onClick={() => {
                                      if (disabled) return;
                                      setFormVehDriverId(d.id);
                                      setVehDriverPickerOpen(false);
                                      setVehDriverQuery('');
                                    }}
                                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${
                                      disabled
                                        ? 'opacity-50 cursor-not-allowed'
                                        : formVehDriverId === d.id
                                          ? 'bg-[var(--color-primary-container)]/40'
                                          : 'hover:bg-[var(--color-surface-container)]'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2 min-w-0">
                                      <span className="w-6 h-6 rounded-full bg-[var(--color-surface-container-high)] flex items-center justify-center text-[10px] font-bold text-[var(--color-on-surface)] shrink-0">
                                        {d.name.charAt(0)}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="text-xs font-bold text-[var(--color-on-surface)] block truncate">{d.name}</span>
                                        <span className="text-[10px] text-[var(--color-on-surface-variant)] block truncate">
                                          {d.phone}{d.licenseNo ? ` • ${d.licenseNo}` : ''}
                                        </span>
                                      </span>
                                    </span>
                                    <span className="flex items-center gap-1.5 shrink-0">
                                      {disabled && (
                                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-[var(--color-error-container)] text-[var(--color-on-error-container)] font-mono">
                                          On {occupant?.vehicleNo}
                                        </span>
                                      )}
                                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                        d.status === 'active'
                                          ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                          : 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                                      }`}>
                                        {d.status === 'active' ? 'Active' : 'Inactive'}
                                      </span>
                                      {formVehDriverId === d.id && <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
                                    </span>
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* LOAN & EMI — collapsible accordion; full financing capture.
                    The EMI auto-debits from the linked account on the due day
                    (server cron) */}
                <div className="rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setVehLoanOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    <span className="text-[11px] font-extrabold text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5 text-[var(--color-primary)]" /> Loan & EMI
                    </span>
                    <span className="flex items-center gap-2">
                      {Number(formVehEmiAmount) > 0 && !vehLoanOpen && (
                        <span className="text-[9px] font-bold text-[var(--color-on-primary-container)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full">
                          {formatCurrency(Number(formVehEmiAmount))}/mo
                        </span>
                      )}
                      {Number(formVehEmiAmount) > 0 && !vehLoanOpen && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]"></span>}
                      <ChevronDown className={`h-4 w-4 text-[var(--color-on-surface-variant)] transition-transform ${vehLoanOpen ? '' : '-rotate-90'}`} />
                    </span>
                  </button>

                  {vehLoanOpen && (
                  <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Financier / Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank, Tata Capital"
                        value={formVehEmiFinancier}
                        onChange={(e) => setFormVehEmiFinancier(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Loan Account No</label>
                      <input
                        type="text"
                        placeholder="e.g. LN-CV-89210"
                        value={formVehEmiLoanAccNo}
                        onChange={(e) => setFormVehEmiLoanAccNo(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Loan Amount (₹)</label>
                      <input
                        type="number"
                        placeholder="e.g. 2400000"
                        value={formVehEmiTotalLoan}
                        onChange={(e) => {
                          setFormVehEmiTotalLoan(e.target.value);
                          handleEmiLoanParamsChange(e.target.value, formVehEmiTenureMonths);
                        }}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Tenure (Months)</label>
                      <input
                        type="number"
                        placeholder="e.g. 48"
                        value={formVehEmiTenureMonths}
                        onChange={(e) => {
                          setFormVehEmiTenureMonths(e.target.value);
                          handleEmiLoanParamsChange(formVehEmiTotalLoan, e.target.value);
                        }}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Monthly EMI (₹) *</label>
                      <input
                        type="number"
                        placeholder="e.g. 48500"
                        value={formVehEmiAmount}
                        onChange={(e) => setFormVehEmiAmount(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">EMI Date (Day of Month)</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="e.g. 10"
                        value={formVehEmiDueDay}
                        onChange={(e) => setFormVehEmiDueDay(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Linked Bank Account *</label>
                      <select
                        value={formVehEmiAccountId}
                        onChange={(e) => setFormVehEmiAccountId(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      >
                        <option value="">-- Account for Auto-Debit --</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.type === 'bank' ? a.bankName || 'Bank' : 'Cash'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Loan Start Date</label>
                      <input
                        type="date"
                        value={formVehEmiStartDate}
                        onChange={(e) => setFormVehEmiStartDate(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">EMIs Paid Before System</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 6"
                        value={formVehEmiOpenPaid}
                        onChange={(e) => setFormVehEmiOpenPaid(e.target.value)}
                        title="Installments already paid outside this system (opening count) — EMIs left derive from this"
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Loan Status</label>
                      <select
                        value={formVehEmiStatus}
                        onChange={(e) => setFormVehEmiStatus(e.target.value as any)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      >
                        <option value="active">Active (Ongoing EMI)</option>
                        <option value="closed">Closed (Fully Repaid / NOC Received)</option>
                        <option value="defaulted">Defaulted / Action Required</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Financier / Loan Notes</label>
                      <input
                        type="text"
                        placeholder="e.g. Hypothecation in RC book, HDFC branch"
                        value={formVehEmiNotes}
                        onChange={(e) => setFormVehEmiNotes(e.target.value)}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      />
                    </div>
                  </div>

                  {formVehEmiTotalLoan && formVehEmiTenureMonths && Number(formVehEmiTenureMonths) > 0 && (
                    <p className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">
                      EMIs left: {Math.max(0, Number(formVehEmiTenureMonths) - (Number(formVehEmiOpenPaid) || 0))} of {formVehEmiTenureMonths} •
                      auto-deduct {formVehEmiAccountId ? 'posts from the linked account on the EMI date' : 'needs a linked account to post automatically'}
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                    Leaving the EMI amount blank registers the vehicle as unencumbered (no loan attached).
                  </p>
                  </div>
                  )}
                </div>

                {/* DOCUMENTS (S3 upload feature): stage while registering; link
                    immediately when the vehicle already exists */}
                <EntityDocumentsSection
                  feature="vehicle"
                  entityId={editingVehicle?.id}
                  staged={editingVehicle ? undefined : stagedVehicleDocs}
                  onStagedChange={editingVehicle ? undefined : setStagedVehicleDocs}
                />
              </div>

              <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex items-center justify-between">
                <div className="text-[11px] text-[var(--color-on-surface-variant)]">
                  {stagedVehicleDocs.length > 0 && !editingVehicle && (
                    <span>{stagedVehicleDocs.length} document(s) will attach on save</span>
                  )}
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsVehicleModalOpen(false)}
                    className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs"
                  >
                    {editingVehicle ? 'Save Changes' : 'Register Vehicle'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. VEHICLE MOUNTED TYRES DETAILED INSPECTOR */}
      {selectedVehicleForTyres && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-scrim)]/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-xl border border-[var(--color-outline-variant)] max-w-2xl w-full overflow-hidden my-8">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div className="text-left">
                <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm uppercase tracking-tight flex items-center gap-1.5">
                  <Disc className="h-4.5 w-4.5 text-[var(--color-primary)] animate-spin-slow" />
                  Active Axle Configuration: {selectedVehicleForTyres.vehicleNo}
                </h3>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                  View, mount, or swap tyres across different axle positions for this {selectedVehicleForTyres.type}.
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedVehicleForTyres(null);
                  setMountingPosName('');
                }}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] rounded-full transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-6 max-h-[500px] overflow-y-auto">
              {/* Chassis Schematic Info banner */}
              <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] flex items-center justify-between">
                <div className="text-left space-y-0.5">
                  <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase">Selected Vehicle</p>
                  <p className="font-black text-[var(--color-on-surface)] text-xs">{selectedVehicleForTyres.vehicleNo} ({selectedVehicleForTyres.ownership.toUpperCase()})</p>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">{selectedVehicleForTyres.capacityTonnes > 0 ? `Capacity: ${selectedVehicleForTyres.capacityTonnes} MT • ` : ''}Assigned Driver: {selectedVehicleForTyres.currentDriverName || 'None'}</p>
                </div>
                <div className="px-3 py-1.5 bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] rounded-full text-xs font-bold text-right">
                  {tyres.filter(t => t.vehicleId === selectedVehicleForTyres.id && t.status === 'mounted').length} / 6 Tyres Mounted
                </div>
              </div>

              {/* Positions List */}
              <div className="space-y-3.5 text-left">
                <h4 className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Axle Positions Overview</h4>
                
                {[
                  'Front-Left (FL)',
                  'Front-Right (FR)',
                  'Rear-Left-Outer (RLO)',
                  'Rear-Left-Inner (RLI)',
                  'Rear-Right-Outer (RRO)',
                  'Rear-Right-Inner (RRI)',
                  'Spare (Cab Mounted)'
                ].map((pos) => {
                  // Find tyre mounted on this position
                  const mountedTyre = tyres.find(
                    t => t.vehicleId === selectedVehicleForTyres.id && t.position === pos && t.status === 'mounted'
                  );

                  return (
                    <div 
                      key={pos} 
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        mountedTyre 
                          ? 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)] shadow-2xs' 
                          : 'bg-[var(--color-surface-container)]/40 border-dashed border-[var(--color-outline-variant)]'
                      }`}
                    >
                      {/* Left: Position Indicator & Tyre details */}
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl text-xs font-black text-center w-12 shrink-0 ${
                          mountedTyre ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                        }`}>
                          {pos.split(' ').pop()?.replace('(', '').replace(')', '') || 'AX'}
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-[var(--color-on-surface)]">{pos}</p>
                          {mountedTyre ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[10px] font-black bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface)] px-1.5 py-0.2 rounded-full uppercase border border-[var(--color-outline-variant)]">
                                  {mountedTyre.serialNumber}
                                </span>
                                <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">
                                  {mountedTyre.brand} • {mountedTyre.size}
                                </span>
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded-full ${
                                  mountedTyre.lastInspectionCondition === 'excellent'
                                    ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                    : mountedTyre.lastInspectionCondition === 'good'
                                      ? 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]'
                                      : mountedTyre.lastInspectionCondition === 'worn'
                                        ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                                        : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                                }`}>
                                  {mountedTyre.lastInspectionCondition}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-[var(--color-on-surface-variant)]">
                                <span>Mileage: <b className="text-[var(--color-on-surface)]">{(mountedTyre.currentOdometer || 0).toLocaleString()} KM</b></span>
                                {mountedTyre.threadDepthMm !== undefined && (
                                  <span className="flex items-center gap-1">
                                    Tread: <b className={`font-black ${mountedTyre.threadDepthMm <= 4.5 ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>{mountedTyre.threadDepthMm} mm</b>
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-[var(--color-on-surface-variant)] font-medium">No tyre mounted on this position</p>
                          )}
                        </div>
                      </div>

                      {/* Right: Quick mount/unmount trigger */}
                      <div className="flex items-center gap-2 md:self-center">
                        {mountedTyre ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Unmount tyre ${mountedTyre.serialNumber} from ${pos}?`)) {
                                localDb.updateTyre(mountedTyre.id, {
                                  status: 'available',
                                  vehicleId: undefined,
                                  vehicleNo: undefined,
                                  position: undefined
                                });
                              }
                            }}
                            className="px-3 py-1 bg-[var(--color-warning-container)] hover:opacity-90 text-[var(--color-on-warning-container)] rounded-full text-[10px] font-bold transition"
                          >
                            Unmount Tyre
                          </button>
                        ) : (
                          <div className="relative">
                            {mountingPosName === pos ? (
                              <div className="flex items-center gap-1.5 bg-[var(--color-surface-container-lowest)] p-1 border border-[var(--color-outline-variant)] rounded-xl shadow-2xs">
                                <select
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val) {
                                      localDb.updateTyre(val, {
                                        status: 'mounted',
                                        vehicleId: selectedVehicleForTyres.id,
                                        vehicleNo: selectedVehicleForTyres.vehicleNo,
                                        position: pos,
                                        installOdometer: selectedVehicleForTyres.currentOdometer || 0
                                      });
                                      setMountingPosName('');
                                    }
                                  }}
                                  className="text-[10px] p-1 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-lg font-bold text-[var(--color-on-surface)] focus:outline-none"
                                >
                                  <option value="">-- Choose Spare --</option>
                                  {tyres.filter(t => t.status === 'available').map(t => (
                                    <option key={t.id} value={t.id}>
                                      {t.serialNumber} ({t.brand} {t.threadDepthMm}mm)
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setMountingPosName('')}
                                  className="p-1 hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] rounded-full"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  // Verify we have stock first
                                  const spares = tyres.filter(t => t.status === 'available');
                                  if (spares.length === 0) {
                                    alert('No spare tyres currently available in the yard stock. Please register a tyre as available first.');
                                    return;
                                  }
                                  setMountingPosName(pos);
                                }}
                                className="px-3 py-1 bg-[var(--color-success-container)] hover:opacity-90 text-[var(--color-on-success-container)] rounded-full text-[10px] font-bold transition"
                              >
                                + Mount Spare
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedVehicleForTyres(null);
                  setMountingPosName('');
                }}
                className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. VEHICLE EMI ENTRY MODAL — record manual / edit automated entries */}
      {isEmiEntryModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div>
                <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-[var(--color-success)]" />
                  {editingEmiEntry ? 'Edit EMI Entry' : 'Record EMI Entry'}
                </h3>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                  {editingEmiEntry
                    ? 'Editing rebalances the linked account by the difference automatically.'
                    : 'Manual record of a loan installment (early / missed auto debit).'}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsEmiEntryModalOpen(false);
                  setEditingEmiEntry(null);
                }}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmiEntry}>
              <div className="p-5 space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Vehicle *</label>
                  <select
                    value={formEmiVehicleId}
                    onChange={(e) => {
                      const vehId = e.target.value;
                      setFormEmiVehicleId(vehId);
                      const veh = vehicles.find(v => v.id === vehId);
                      if (veh?.emiDetails?.emiAccountId) setFormEmiAccountId(veh.emiDetails.emiAccountId);
                      if (veh?.emiDetails?.monthlyEmiAmount && !(Number(formEmiAmount) > 0)) {
                        setFormEmiAmount(String(veh.emiDetails.monthlyEmiAmount));
                      }
                    }}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                    required
                  >
                    <option value="">-- Choose Financed Vehicle --</option>
                    {vehicles.filter(v => v.emiDetails?.hasEmi).map(v => (
                      <option key={v.id} value={v.id}>{v.vehicleNo} ({v.type.toUpperCase()})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">From Account *</label>
                    <select
                      value={formEmiAccountId}
                      onChange={(e) => setFormEmiAccountId(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      required
                    >
                      <option value="">-- Choose Account --</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.type === 'bank' ? a.bankName || 'Bank' : 'Cash'})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">EMI Date *</label>
                    <input
                      type="date"
                      value={formEmiDate}
                      onChange={(e) => setFormEmiDate(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">EMI Amount (₹) *</label>
                    <input
                      type="number"
                      placeholder="e.g. 48500"
                      value={formEmiAmount}
                      onChange={(e) => setFormEmiAmount(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Actual bank debit landed on 11th"
                      value={formEmiNotes}
                      onChange={(e) => setFormEmiNotes(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 bg-[var(--color-info-container)]/30 border border-[var(--color-info)]/30 rounded-2xl text-[10px] text-[var(--color-on-surface-variant)]">
                  Saving debits the selected account's balance immediately and records the entry in the vehicle's EMI ledger.
                  {editingEmiEntry?.source === 'auto' && ' This is an automated entry — your edit is preserved with the Auto row.'}
                </div>
              </div>

              <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEmiEntryModalOpen(false);
                    setEditingEmiEntry(null);
                  }}
                  className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs"
                >
                  {editingEmiEntry ? 'Save & Rebalance' : 'Record Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. EXPENSE ENTRY MODAL — one form, two branches (expense | diesel).
          Vehicle + account + date are common (vehicle & account COMPULSORY —
          the save debits the account); the branch decides its own fields.
          Receipts upload through the same staged-documents flow as vehicles. */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[var(--color-primary-container)] rounded-xl">
                  {expenseFormType === 'diesel'
                    ? <Fuel className="h-4.5 w-4.5 text-[var(--color-on-primary-container)]" />
                    : <Receipt className="h-4.5 w-4.5 text-[var(--color-on-primary-container)]" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm">
                    {editingExpense ? 'Edit Vehicle Expense' : expenseFormType === 'diesel' ? 'Diesel Entry' : 'Expense Entry'}
                  </h3>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                    {expenseFormType === 'diesel' ? 'Fuel fill — the cost debits the selected account.' : 'Log a vehicle expense — the amount debits the selected account.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsExpenseModalOpen(false);
                  setEditingExpense(null);
                }}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense}>
              <div className="p-5 space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Vehicle *</label>
                  <div className="p-2 border border-[var(--color-outline-variant)] rounded-xl bg-[var(--color-surface-container-lowest)]">
                    <SearchableSelect
                      value={formExpenseVehicleId}
                      onChange={handleExpenseVehicleChange}
                      placeholder="Type vehicle number to search..."
                      closedDisplay={(() => {
                        const veh = vehicles.find((v) => v.id === formExpenseVehicleId);
                        return veh ? `${veh.vehicleNo}` : '';
                      })()}
                      options={vehicles.map((v) => ({
                        value: v.id,
                        label: v.vehicleNo,
                        sub: `Type: ${v.type.toUpperCase()}`,
                      }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">From Account *</label>
                    <div className="p-2 border border-[var(--color-outline-variant)] rounded-xl bg-[var(--color-surface-container-lowest)]">
                      <SearchableSelect
                        value={formExpenseAccountId}
                        onChange={(v) => setFormExpenseAccountId(v)}
                        placeholder="Type account name to search..."
                        closedDisplay={(() => {
                          const acc = accounts.find((a) => a.id === formExpenseAccountId);
                          return acc
                            ? `${acc.name} (${acc.type === 'bank' ? acc.bankName || 'Bank' : 'Cash'})`
                            : '';
                        })()}
                        options={accounts.map((a) => ({
                          value: a.id,
                          label: a.name,
                          sub: a.type === 'bank' ? `Bank${a.bankName ? ` · ${a.bankName}` : ''}` : 'Cash',
                        }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Expense Date *</label>
                    <input
                      type="date"
                      value={formExpenseDate}
                      onChange={(e) => setFormExpenseDate(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {expenseFormType === 'expense' ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Expense Type *</label>
                    <input
                      type="text"
                      list="expense-type-suggestions"
                      placeholder="e.g. Puncture + Fitting, Tyre Change, Toll"
                      value={formExpenseTypeFree}
                      onChange={(e) => setFormExpenseTypeFree(e.target.value)}
                      className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-bold focus:outline-none"
                      required
                    />
                    <datalist id="expense-type-suggestions">
                      {EXPENSE_TYPE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Diesel Litres *</label>
                      <input
                        type="number" step="0.01" min="0"
                        placeholder="e.g. 126.00"
                        value={formExpenseLitres}
                        onChange={(e) => {
                          setFormExpenseLitres(e.target.value);
                          recalcDieselCost(e.target.value, formExpenseRate);
                        }}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Diesel Rate (₹/L)</label>
                      <input
                        type="number" step="0.01" min="0"
                        placeholder="e.g. 99.89"
                        value={formExpenseRate}
                        onChange={(e) => {
                          setFormExpenseRate(e.target.value);
                          recalcDieselCost(formExpenseLitres, e.target.value);
                        }}
                        className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">
                    {expenseFormType === 'diesel' ? 'Diesel Cost (₹) *' : 'Amount (₹) *'}
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    placeholder="e.g. 48500"
                    value={formExpenseAmount}
                    onChange={(e) => setFormExpenseAmount(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-black focus:outline-none"
                    required
                  />
                  {expenseFormType === 'diesel' && (Number(formExpenseLitres) || 0) > 0 && (Number(formExpenseRate) || 0) > 0 && (
                    <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] block">
                      Auto-calculated: {Number(formExpenseLitres).toLocaleString('en-IN')} L × ₹{Number(formExpenseRate).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Paid by driver in cash at pump"
                    value={formExpenseNotes}
                    onChange={(e) => setFormExpenseNotes(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                  />
                </div>

                {/* Receipts / supporting documents — staged on create, linked
                    immediately on edit (same flow as vehicle RC/insurance) */}
                <div className="p-3 bg-[var(--color-surface-container)]/60 border border-[var(--color-outline-variant)] rounded-2xl">
                  <EntityDocumentsSection
                    feature="vehicle-expense"
                    entityId={editingExpense?.id}
                    staged={editingExpense ? undefined : stagedExpenseDocs}
                    onStagedChange={setStagedExpenseDocs}
                  />
                  {stagedExpenseDocs.length > 0 && !editingExpense && (
                    <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] mt-1 block">
                      {stagedExpenseDocs.length} document(s) will attach on save
                    </span>
                  )}
                </div>

                <div className="p-3 bg-[var(--color-info-container)]/30 border border-[var(--color-info)]/30 rounded-2xl text-[10px] text-[var(--color-on-surface-variant)]">
                  Saving debits the selected account's balance immediately and records the entry in the vehicle's expense log.
                </div>
              </div>

              <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsExpenseModalOpen(false);
                    setEditingExpense(null);
                  }}
                  className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs"
                >
                  {editingExpense ? 'Save & Rebalance' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. EXPENSE DOCUMENTS DRAWER — view / upload receipts against a saved
          entry (row paperclip). Uploads link to the entry immediately. */}
      {expenseDocsOpen && (
        <div className="fixed inset-0 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div>
                <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm flex items-center gap-2">
                  <Paperclip className="h-4.5 w-4.5 text-[var(--color-primary)]" />
                  Expense Documents
                </h3>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                  {formatDdMmYyyy(expenseDocsOpen.date)} · {expenseDocsOpen.vehicleNo || vehicles.find((v) => v.id === expenseDocsOpen.vehicleId)?.vehicleNo || '—'} · {formatCurrency(expenseDocsOpen.amount)}
                </p>
              </div>
              <button
                onClick={() => setExpenseDocsOpen(null)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto">
              <EntityDocumentsSection feature="vehicle-expense" entityId={expenseDocsOpen.id} />
            </div>
          </div>
        </div>
      )}
      </>
      )}
      {/* LINKED SALE DETAILS — mounted OUTSIDE the detailVehicle branch: a RST
          opened from the vehicle profile shows ABOVE it, never behind */}
      {viewingSaleDisplay && (
        <OrderDetailModal
          isOpen
          onClose={() => setViewingOrderSaleId(null)}
          order={viewingSaleDisplay}
          parties={parties}
          items={items}
          settings={settings || ({} as CompanySettings)}
        />
      )}
      {/* BULK EXPENSE ENTRIES — one grid, per-row Expense/Diesel type */}
      <BulkExpenseCreateModal
        isOpen={isBulkExpenseOpen}
        onClose={() => setIsBulkExpenseOpen(false)}
      />
    </div>
  );
};
