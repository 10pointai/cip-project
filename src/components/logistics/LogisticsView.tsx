import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  User,
  FileText,
  Plus,
  Search,
  Filter,
  Printer,
  Calendar,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Fuel,
  TrendingUp,
  Clock,
  Compass,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Check,
  X,
  CreditCard,
  Building,
  Navigation2,
  Disc,
  Landmark,
  Edit3,
  Percent,
  ShieldAlert,
  DollarSign,
} from 'lucide-react';
import { Vehicle, Driver, TripSlip, Order, CompanySettings, Tyre, VehicleEmiDetails } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

export const LogisticsView: React.FC = () => {
  // Database States
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [slips, setSlips] = useState<TripSlip[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [tyres, setTyres] = useState<Tyre[]>([]);

  // App Navigation & Filter state
  const [activeSubTab, setActiveSubTab] = useState<'trips' | 'fleet' | 'drivers' | 'simulator' | 'tyres' | 'emi'>('trips');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Selected Detail Modal State
  const [viewingSlip, setViewingSlip] = useState<TripSlip | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Creation Modals
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);

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
  const [vehicleModalTab, setVehicleModalTab] = useState<'general' | 'emi'>('general');
  const [formVehNo, setFormVehNo] = useState('');
  const [formVehType, setFormVehType] = useState<'tipper' | 'tanker' | 'mixer' | 'loader' | 'other'>('tipper');
  const [formVehCapacity, setFormVehCapacity] = useState('');
  const [formVehOwner, setFormVehOwner] = useState<'owned' | 'contractor' | 'market'>('owned');
  const [formVehStatus, setFormVehStatus] = useState<'available' | 'on_trip' | 'maintenance'>('available');
  const [formVehDriverId, setFormVehDriverId] = useState('');
  const [formVehInsurance, setFormVehInsurance] = useState('');
  const [formVehFitness, setFormVehFitness] = useState('');
  const [formVehNotes, setFormVehNotes] = useState('');

  // Form States - Vehicle Loan & EMI Financing
  const [formVehHasEmi, setFormVehHasEmi] = useState<boolean>(false);
  const [formVehEmiFinancier, setFormVehEmiFinancier] = useState<string>('');
  const [formVehEmiLoanAccNo, setFormVehEmiLoanAccNo] = useState<string>('');
  const [formVehEmiAmount, setFormVehEmiAmount] = useState<string>('');
  const [formVehEmiDueDay, setFormVehEmiDueDay] = useState<string>('10');
  const [formVehEmiStartDate, setFormVehEmiStartDate] = useState<string>('');
  const [formVehEmiEndDate, setFormVehEmiEndDate] = useState<string>('');
  const [formVehEmiTotalLoan, setFormVehEmiTotalLoan] = useState<string>('');
  const [formVehEmiInterestRate, setFormVehEmiInterestRate] = useState<string>('');
  const [formVehEmiTenureMonths, setFormVehEmiTenureMonths] = useState<string>('');
  const [formVehEmiPaidCount, setFormVehEmiPaidCount] = useState<string>('');
  const [formVehEmiAutoDebitAccount, setFormVehEmiAutoDebitAccount] = useState<string>('');
  const [formVehEmiStatus, setFormVehEmiStatus] = useState<'active' | 'closed' | 'defaulted'>('active');
  const [formVehEmiNotes, setFormVehEmiNotes] = useState<string>('');

  // Form States - Driver
  const [formDrName, setFormDrName] = useState('');
  const [formDrLicense, setFormDrLicense] = useState('');
  const [formDrPhone, setFormDrPhone] = useState('');
  const [formDrStatus, setFormDrStatus] = useState<'available' | 'on_duty' | 'leave'>('available');

  // Creation / Editing Modals for Tyres
  const [isTyreModalOpen, setIsTyreModalOpen] = useState(false);
  const [editingTyre, setEditingTyre] = useState<Tyre | null>(null);

  // Vehicle Tyre Inspection state
  const [selectedVehicleForTyres, setSelectedVehicleForTyres] = useState<Vehicle | null>(null);
  const [mountingPosName, setMountingPosName] = useState<string>('');

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
    setVehicles(localDb.getVehicles());
    setDrivers(localDb.getDrivers());
    setSlips(localDb.getTripSlips());
    setOrders(localDb.getOrders());
    setSettings(localDb.getSettings());
    setTyres(localDb.getTyres());
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

  // Metrics Calculations
  const stats = useMemo(() => {
    const totalVeh = vehicles.length;
    const onTripVeh = vehicles.filter(v => v.status === 'on_trip').length;
    const availableVeh = vehicles.filter(v => v.status === 'available').length;
    const maintVeh = vehicles.filter(v => v.status === 'maintenance').length;

    const totalFuelAdvanced = slips.reduce((sum, s) => sum + (s.fuelIssuedLiters || 0), 0);
    const totalCashAdvanced = slips.reduce((sum, s) => sum + (s.cashAdvanceRupees || 0), 0);

    return {
      totalVeh,
      onTripVeh,
      availableVeh,
      maintVeh,
      totalFuelAdvanced,
      totalCashAdvanced,
    };
  }, [vehicles, slips]);

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

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'logistics-slip') {
        handleOpenSlipModal();
      } else if (customEvent.detail === 'logistics-vehicle') {
        setFormVehNo('');
        setFormVehCapacity('');
        setFormVehDriverId('');
        setFormVehInsurance('');
        setFormVehFitness('');
        setFormVehNotes('');
        setIsVehicleModalOpen(true);
      } else if (customEvent.detail === 'logistics-tyre') {
        handleOpenTyreModal(null);
      }
    };
    window.addEventListener('app-header-action', handleHeaderAction);
    return () => window.removeEventListener('app-header-action', handleHeaderAction);
  }, [slips.length]);

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
    if (veh && veh.currentDriverId) {
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
    const selectedDriver = drivers.find(d => d.id === formSlipDriverId);
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

  const handleUpdateTripStatus = (id: string, newStatus: 'loading' | 'transit' | 'delivered' | 'closed') => {
    localDb.updateTripSlip(id, { status: newStatus });
    
    // Update local modal state if active
    if (viewingSlip && viewingSlip.id === id) {
      setViewingSlip(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const handleDeleteTrip = (id: string) => {
    if (confirm('Are you sure you want to delete this trip slip? This will release the vehicle and driver status.')) {
      // Release vehicle first
      const slip = slips.find(s => s.id === id);
      if (slip) {
        localDb.updateVehicle(slip.vehicleId, { status: 'available' });
        localDb.updateDriver(slip.driverId, { status: 'available' });
      }
      localDb.deleteTripSlip(id);
      setViewingSlip(null);
    }
  };

  // Handle Open Vehicle Modal for Create / Edit
  const handleOpenVehicleModal = (veh?: Vehicle | null, initialTab: 'general' | 'emi' = 'general') => {
    if (veh) {
      setEditingVehicle(veh);
      setFormVehNo(veh.vehicleNo);
      setFormVehType(veh.type);
      setFormVehCapacity(String(veh.capacityTonnes));
      setFormVehOwner(veh.ownership);
      setFormVehStatus(veh.status as any);
      setFormVehDriverId(veh.currentDriverId || '');
      setFormVehInsurance(veh.insuranceExpiry || '');
      setFormVehFitness(veh.fitnessExpiry || '');
      setFormVehNotes(veh.notes || '');

      if (veh.emiDetails && veh.emiDetails.hasEmi) {
        setFormVehHasEmi(true);
        setFormVehEmiFinancier(veh.emiDetails.financierName || '');
        setFormVehEmiLoanAccNo(veh.emiDetails.loanAccountNumber || '');
        setFormVehEmiAmount(veh.emiDetails.monthlyEmiAmount ? String(veh.emiDetails.monthlyEmiAmount) : '');
        setFormVehEmiDueDay(veh.emiDetails.emiDueDay ? String(veh.emiDetails.emiDueDay) : '10');
        setFormVehEmiStartDate(veh.emiDetails.loanStartDate || '');
        setFormVehEmiEndDate(veh.emiDetails.loanEndDate || '');
        setFormVehEmiTotalLoan(veh.emiDetails.totalLoanAmount ? String(veh.emiDetails.totalLoanAmount) : '');
        setFormVehEmiInterestRate(veh.emiDetails.interestRate ? String(veh.emiDetails.interestRate) : '');
        setFormVehEmiTenureMonths(veh.emiDetails.totalTenureMonths ? String(veh.emiDetails.totalTenureMonths) : '');
        setFormVehEmiPaidCount(veh.emiDetails.paidEmisCount !== undefined ? String(veh.emiDetails.paidEmisCount) : '');
        setFormVehEmiAutoDebitAccount(veh.emiDetails.autoDebitAccount || '');
        setFormVehEmiStatus(veh.emiDetails.status || 'active');
        setFormVehEmiNotes(veh.emiDetails.notes || '');
      } else {
        setFormVehHasEmi(false);
        setFormVehEmiFinancier('');
        setFormVehEmiLoanAccNo('');
        setFormVehEmiAmount('');
        setFormVehEmiDueDay('10');
        setFormVehEmiStartDate('');
        setFormVehEmiEndDate('');
        setFormVehEmiTotalLoan('');
        setFormVehEmiInterestRate('');
        setFormVehEmiTenureMonths('');
        setFormVehEmiPaidCount('');
        setFormVehEmiAutoDebitAccount('');
        setFormVehEmiStatus('active');
        setFormVehEmiNotes('');
      }
    } else {
      setEditingVehicle(null);
      setFormVehNo('');
      setFormVehType('tipper');
      setFormVehCapacity('18');
      setFormVehOwner('owned');
      setFormVehStatus('available');
      setFormVehDriverId('');
      setFormVehInsurance('');
      setFormVehFitness('');
      setFormVehNotes('');

      setFormVehHasEmi(false);
      setFormVehEmiFinancier('');
      setFormVehEmiLoanAccNo('');
      setFormVehEmiAmount('');
      setFormVehEmiDueDay('10');
      setFormVehEmiStartDate('');
      setFormVehEmiEndDate('');
      setFormVehEmiTotalLoan('');
      setFormVehEmiInterestRate('');
      setFormVehEmiTenureMonths('');
      setFormVehEmiPaidCount('');
      setFormVehEmiAutoDebitAccount('');
      setFormVehEmiStatus('active');
      setFormVehEmiNotes('');
    }
    setVehicleModalTab(initialTab);
    setIsVehicleModalOpen(true);
  };

  // Handle Save (Create / Update) Vehicle
  const handleSaveVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVehNo || !formVehCapacity) {
      alert('Please fill in vehicle number and capacity.');
      return;
    }

    const assignedDriver = drivers.find(d => d.id === formVehDriverId);

    const emiDetails: VehicleEmiDetails = formVehHasEmi
      ? {
          hasEmi: true,
          financierName: formVehEmiFinancier.trim() || undefined,
          loanAccountNumber: formVehEmiLoanAccNo.trim() || undefined,
          monthlyEmiAmount: Number(formVehEmiAmount) || 0,
          emiDueDay: Math.min(31, Math.max(1, Number(formVehEmiDueDay) || 10)),
          loanStartDate: formVehEmiStartDate || undefined,
          loanEndDate: formVehEmiEndDate || undefined,
          totalLoanAmount: formVehEmiTotalLoan ? Number(formVehEmiTotalLoan) : undefined,
          interestRate: formVehEmiInterestRate ? Number(formVehEmiInterestRate) : undefined,
          totalTenureMonths: formVehEmiTenureMonths ? Number(formVehEmiTenureMonths) : undefined,
          paidEmisCount: formVehEmiPaidCount ? Number(formVehEmiPaidCount) : 0,
          autoDebitAccount: formVehEmiAutoDebitAccount.trim() || undefined,
          status: formVehEmiStatus,
          notes: formVehEmiNotes.trim() || undefined,
        }
      : { hasEmi: false };

    if (editingVehicle) {
      localDb.updateVehicle(editingVehicle.id, {
        vehicleNo: formVehNo.toUpperCase().trim(),
        type: formVehType,
        capacityTonnes: Number(formVehCapacity) || 18,
        ownership: formVehOwner,
        status: formVehStatus,
        currentDriverId: formVehDriverId || undefined,
        currentDriverName: assignedDriver?.name || undefined,
        insuranceExpiry: formVehInsurance || undefined,
        fitnessExpiry: formVehFitness || undefined,
        emiDetails,
        notes: formVehNotes || undefined,
      });
    } else {
      const newVeh: Omit<Vehicle, 'id' | 'createdAt'> = {
        vehicleNo: formVehNo.toUpperCase().trim(),
        type: formVehType,
        capacityTonnes: Number(formVehCapacity) || 18,
        ownership: formVehOwner,
        status: formVehStatus,
        currentDriverId: formVehDriverId || undefined,
        currentDriverName: assignedDriver?.name || undefined,
        insuranceExpiry: formVehInsurance || undefined,
        fitnessExpiry: formVehFitness || undefined,
        emiDetails,
        notes: formVehNotes || undefined,
      };
      localDb.addVehicle(newVeh);
    }

    setIsVehicleModalOpen(false);
    setEditingVehicle(null);
  };

  // Quick mark vehicle EMI paid for current month
  const handleQuickMarkEmiPaid = (vehicle: Vehicle) => {
    if (!vehicle.emiDetails?.hasEmi) return;
    const currentPaid = vehicle.emiDetails.paidEmisCount || 0;
    const nextPaid = currentPaid + 1;
    const totalTenure = vehicle.emiDetails.totalTenureMonths;
    const isClosed = totalTenure && nextPaid >= totalTenure;

    localDb.updateVehicle(vehicle.id, {
      emiDetails: {
        ...vehicle.emiDetails,
        paidEmisCount: nextPaid,
        status: isClosed ? 'closed' : vehicle.emiDetails.status || 'active',
        lastPaymentDate: new Date().toISOString().split('T')[0],
      },
    });
  };

  // Handle Add Driver Form
  const handleCreateDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDrName || !formDrPhone || !formDrLicense) {
      alert('Please fill in all mandatory fields.');
      return;
    }

    const newDriver: Omit<Driver, 'id' | 'createdAt'> = {
      name: formDrName.trim(),
      phone: formDrPhone.trim(),
      licenseNo: formDrLicense.toUpperCase().trim(),
      status: formDrStatus,
    };

    localDb.addDriver(newDriver);
    setIsDriverModalOpen(false);

    // Clear Form
    setFormDrName('');
    setFormDrPhone('');
    setFormDrLicense('');
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
  const filteredSlips = useMemo(() => {
    return slips.filter(s => {
      const matchesSearch = 
        s.slipNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      const matchesSearch = 
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.licenseNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.phone.includes(searchQuery);
      
      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [drivers, searchQuery, statusFilter]);

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
      {/* Action Panel */}
      <div className="flex flex-wrap items-center justify-end gap-2 pb-2">
        <button
          onClick={handleOpenSlipModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-semibold shadow-xs transition"
        >
          <Plus className="h-4 w-4" />
          New Trip Slip
        </button>
        <button
          onClick={() => handleOpenVehicleModal(null, 'general')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold shadow-2xs transition-colors"
        >
          <Truck className="h-4 w-4 text-[var(--color-outline)]" />
          Add Vehicle
        </button>
        <button
          onClick={() => { setActiveSubTab('emi'); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold shadow-2xs transition-colors"
        >
          <Landmark className="h-4 w-4 text-[var(--color-primary)]" />
          Vehicle EMI & Loans
        </button>
        <button
          onClick={() => setIsDriverModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold shadow-2xs transition-colors"
        >
          <User className="h-4 w-4 text-[var(--color-outline)]" />
          Add Driver
        </button>
        <button
          onClick={() => handleOpenTyreModal(null)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold shadow-2xs transition-colors"
        >
          <Disc className="h-4 w-4 text-[var(--color-outline)]" />
          Add Tyre
        </button>
      </div>

      {/* Metrics Dashboard Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Fleet Strength</p>
            <h3 className="text-2xl font-extrabold text-[var(--color-on-surface)] mt-1">{stats.totalVeh}</h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1.5 flex items-center gap-1.5 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-success)]"></span>
              {stats.availableVeh} Yard Idle / Available
            </p>
          </div>
          <div className="p-2.5 bg-[var(--color-surface-container)] rounded-2xl">
            <Truck className="h-5 w-5 text-[var(--color-primary)]" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">In Transit (Active)</p>
            <h3 className="text-2xl font-extrabold text-[var(--color-warning)] mt-1 flex items-center gap-2">
              {stats.onTripVeh}
              {stats.onTripVeh > 0 && (
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-warning)]"></span>
                </span>
              )}
            </h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1.5 font-medium">
              Insulated asphalt hauling active
            </p>
          </div>
          <div className="p-2.5 bg-[var(--color-warning-container)] rounded-2xl">
            <Navigation2 className="h-5 w-5 text-[var(--color-on-warning-container)] animate-pulse" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Fuel Advances</p>
            <h3 className="text-2xl font-extrabold text-[var(--color-on-surface)] mt-1">{stats.totalFuelAdvanced} L</h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1.5 font-medium">
              Issued this month to tankers
            </p>
          </div>
          <div className="p-2.5 bg-[var(--color-info-container)] rounded-2xl">
            <Fuel className="h-5 w-5 text-[var(--color-on-info-container)]" />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Cash Advances</p>
            <h3 className="text-2xl font-extrabold text-[var(--color-success)] mt-1">{formatCurrency(stats.totalCashAdvanced)}</h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1.5 font-medium">
              Toll & driver batta disbursed
            </p>
          </div>
          <div className="p-2.5 bg-[var(--color-success-container)] rounded-2xl">
            <CreditCard className="h-5 w-5 text-[var(--color-on-success-container)]" />
          </div>
        </div>
      </div>

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
            Trip Slips Log
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
            Vehicles & Machinery
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {vehicles.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveSubTab('emi'); setStatusFilter('all'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'emi'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <Landmark className="h-4 w-4" />
            Vehicle EMI & Loans
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
              {vehicles.filter(v => v.emiDetails?.hasEmi).length}
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
            Drivers Directory
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {drivers.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveSubTab('tyres'); setStatusFilter('all'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'tyres'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <Disc className="h-4 w-4" />
            Tyre Fleet Management
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
              {tyres.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveSubTab('simulator'); }}
            className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'simulator'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <Compass className="h-4 w-4" />
            Interactive Transit Simulator
          </button>
        </nav>
      </div>

      {/* SEARCH AND FILTER BAR */}
      {activeSubTab !== 'simulator' && (
        <div className="flex flex-col sm:flex-row gap-3 bg-[var(--color-surface-container-lowest)] p-3 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-outline)]" />
            <input
              type="text"
              placeholder={`Search ${activeSubTab === 'trips' ? 'slips, vehicles, destinations...' : activeSubTab === 'fleet' ? 'vehicle number, type...' : activeSubTab === 'drivers' ? 'driver name, license...' : 'tyre serial, brand, size...'}`}
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
              {activeSubTab === 'trips' && (
                <>
                  <option value="loading">Loading at Plant</option>
                  <option value="transit">In Transit</option>
                  <option value="delivered">Delivered (Unloaded)</option>
                  <option value="closed">Closed / Returned</option>
                </>
              )}
              {activeSubTab === 'fleet' && (
                <>
                  <option value="available">Available / Idle</option>
                  <option value="on_trip">On Trip</option>
                  <option value="maintenance">Maintenance</option>
                </>
              )}
              {activeSubTab === 'drivers' && (
                <>
                  <option value="available">Available</option>
                  <option value="on_duty">On Duty</option>
                  <option value="leave">On Leave</option>
                </>
              )}
              {activeSubTab === 'tyres' && (
                <>
                  <option value="mounted">Mounted</option>
                  <option value="available">Available (Yard)</option>
                  <option value="retreading">Retreading</option>
                  <option value="scrapped">Scrapped</option>
                </>
              )}
            </select>
          </div>
        </div>
      )}

      {/* TAB CONTENTS */}

      {/* 1. TRIP SLIPS LOG TAB */}
      {activeSubTab === 'trips' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          {/* List of Trip Slips */}
          <div className="xl:col-span-2 space-y-3">
            {filteredSlips.length === 0 ? (
              <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] p-12 text-center shadow-2xs">
                <FileText className="h-10 w-10 text-[var(--color-outline)] mx-auto mb-3" />
                <p className="text-[var(--color-on-surface-variant)] font-medium text-xs">No trip slips found matching filters.</p>
                <button
                  onClick={handleOpenSlipModal}
                  className="mt-4 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-semibold shadow-xs"
                >
                  Create Your First Trip Slip
                </button>
              </div>
            ) : (
              filteredSlips.map((slip) => (
                <div
                  key={slip.id}
                  onClick={() => setViewingSlip(slip)}
                  className={`bg-[var(--color-surface-container-lowest)] p-4 rounded-[24px] border transition-all cursor-pointer shadow-2xs hover:shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                    viewingSlip?.id === slip.id ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20' : 'border-[var(--color-outline-variant)]'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black text-[var(--color-on-surface)] bg-[var(--color-surface-container)] px-2.5 py-0.5 rounded-full">
                        {slip.slipNumber}
                      </span>
                      <span className="text-xs text-[var(--color-on-surface-variant)] font-semibold">{slip.date} @ {slip.time}</span>
                      
                      {/* Trip Type badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        slip.tripType === 'outward' 
                          ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]' 
                          : slip.tripType === 'inward' 
                            ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]' 
                            : 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]'
                      }`}>
                        {slip.tripType.toUpperCase()} DISPATCH
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-[var(--color-on-surface)] truncate flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-[var(--color-outline)] shrink-0" />
                      <span className="font-mono text-[var(--color-primary)]">{slip.vehicleNo}</span>
                      <span className="text-[var(--color-outline-variant)] mx-1">|</span>
                      <User className="h-4 w-4 text-[var(--color-outline)] shrink-0" />
                      <span className="text-[var(--color-on-surface)]">{slip.driverName}</span>
                    </h4>

                    <div className="flex items-center gap-2 text-xs text-[var(--color-on-surface-variant)] font-medium">
                      <MapPin className="h-3.5 w-3.5 text-[var(--color-outline)] shrink-0" />
                      <span className="truncate">{slip.destination}</span>
                    </div>

                    {/* Order link block if available */}
                    {slip.orderNumber && (
                      <p className="text-[11px] text-[var(--color-on-surface-variant)] font-mono flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        Linked PO/Ref: <span className="font-bold text-[var(--color-on-surface)]">{slip.orderNumber}</span> ({slip.partyName})
                      </p>
                    )}
                  </div>

                  <div className="flex md:flex-col items-end gap-3 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0 border-[var(--color-outline-variant)] justify-between">
                    {/* Status Badge */}
                    <span className={`text-[11px] font-extrabold uppercase px-3 py-1 rounded-full ${
                      slip.status === 'loading'
                        ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] border border-[var(--color-warning)]/20'
                        : slip.status === 'transit'
                          ? 'bg-[var(--color-info-container)] text-[var(--color-on-info-container)] border border-[var(--color-info)]/20 animate-pulse'
                          : slip.status === 'delivered'
                            ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20'
                            : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]'
                    }`}>
                      {slip.status === 'loading' && '⌛ Loading at Plant'}
                      {slip.status === 'transit' && '🚚 In Transit'}
                      {slip.status === 'delivered' && '✅ Delivered'}
                      {slip.status === 'closed' && '🏁 Closed & Signed'}
                    </span>

                    {/* Weight & Advance Brief */}
                    <div className="text-right">
                      <span className="text-xs font-bold text-[var(--color-on-surface)] block">
                        {slip.netWeightTonnes} MT • {slip.materialName}
                      </span>
                      <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold block mt-0.5">
                        Fuel: {slip.fuelIssuedLiters}L • Adv: {formatCurrency(slip.cashAdvanceRupees)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Interactive Slip Details & Thermal Receipt Printer */}
          <div className="xl:col-span-1">
            {viewingSlip ? (
              <div className="space-y-4">
                {/* Actions Panel */}
                <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs space-y-3">
                  <h3 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Quick Actions</h3>
                  
                  {/* Status update steps */}
                  <div className="grid grid-cols-2 gap-2">
                    {viewingSlip.status === 'loading' && (
                      <button
                        onClick={() => handleUpdateTripStatus(viewingSlip.id, 'transit')}
                        className="col-span-2 w-full py-2.5 bg-[var(--color-warning)] hover:opacity-90 text-white rounded-full text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        <Truck className="h-4 w-4" /> Dispatch to Transit
                      </button>
                    )}
                    {viewingSlip.status === 'transit' && (
                      <button
                        onClick={() => handleUpdateTripStatus(viewingSlip.id, 'delivered')}
                        className="col-span-2 w-full py-2.5 bg-[var(--color-success)] hover:opacity-90 text-white rounded-full text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Confirm Site Unloading
                      </button>
                    )}
                    {viewingSlip.status === 'delivered' && (
                      <button
                        onClick={() => handleUpdateTripStatus(viewingSlip.id, 'closed')}
                        className="col-span-2 w-full py-2.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        <Check className="h-4 w-4" /> Close & Return Driver Slip
                      </button>
                    )}
                    {viewingSlip.status === 'closed' && (
                      <div className="col-span-2 p-2.5 bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] rounded-full text-center text-xs font-bold">
                        🎉 Trip Closed & Reconciled
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-outline-variant)]">
                    <button
                      onClick={() => setShowPrintPreview(true)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold shadow-2xs transition"
                    >
                      <Printer className="h-3.5 w-3.5 text-[var(--color-outline)]" />
                      Print Thermal Slip
                    </button>
                    <button
                      onClick={() => handleDeleteTrip(viewingSlip.id)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--color-error-container)] hover:opacity-90 text-[var(--color-on-error-container)] border border-[var(--color-error)]/20 rounded-full text-xs font-bold transition"
                    >
                      Delete Slip
                    </button>
                  </div>
                </div>

                {/* Thermal Ticket visualization */}
                <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-[24px] border border-dashed border-[var(--color-outline)] shadow-2xs font-mono text-xs text-[var(--color-on-surface)] space-y-4 max-w-sm mx-auto relative overflow-hidden">
                  {/* Receipts Top Edge simulation */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-repeat-x bg-[linear-gradient(45deg,transparent_33.333%,#fff_33.333%,#fff_66.666%,transparent_66.666%)]" style={{ backgroundSize: '12px 12px', backgroundColor: 'var(--color-outline-variant)' }}></div>

                  {/* Header */}
                  <div className="text-center pt-2 space-y-1">
                    <p className="font-extrabold text-[13px] tracking-tight uppercase">{settings?.companyName || 'APEX ROADS & ASPHALT'}</p>
                    <p className="text-[9px] text-[var(--color-on-surface-variant)] uppercase">{settings?.tradeName || 'BATCH PLANT OPERATIONS'}</p>
                    <p className="text-[9px] text-[var(--color-on-surface-variant)] leading-tight">GSTIN: {settings?.gstin || '27AAACA9876C1ZA'}</p>
                    <p className="text-[10px] font-bold border-y border-dashed border-[var(--color-outline-variant)] py-1.5 my-2 uppercase">
                      🚚 DRIVER TRIP SLIP
                    </p>
                  </div>

                  {/* Metadata fields */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>SLIP NO:</span>
                      <span className="font-bold">{viewingSlip.slipNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DATE/TIME:</span>
                      <span>{viewingSlip.date} {viewingSlip.time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>VEHICLE NO:</span>
                      <span className="font-bold text-[var(--color-on-surface)] bg-[var(--color-surface-container)] px-1 rounded">{viewingSlip.vehicleNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DRIVER:</span>
                      <span className="font-bold">{viewingSlip.driverName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>TRIP TYPE:</span>
                      <span className="font-bold uppercase">{viewingSlip.tripType}</span>
                    </div>
                  </div>

                  {/* Delivery details */}
                  <div className="border-t border-dashed border-[var(--color-outline-variant)] pt-2.5 space-y-1 text-left">
                    <p className="font-bold text-[10px] text-[var(--color-on-surface-variant)] uppercase tracking-wide mb-1">UNLOADING SITE DESTINATION:</p>
                    <p className="font-bold text-[11px] leading-tight text-[var(--color-on-surface)]">{viewingSlip.destination}</p>
                    {viewingSlip.orderNumber && (
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1">PO REF: {viewingSlip.orderNumber}</p>
                    )}
                  </div>

                  {/* Material specifics */}
                  <div className="border-t border-dashed border-[var(--color-outline-variant)] pt-2.5 space-y-1.5">
                    <div className="flex justify-between font-bold text-[var(--color-on-surface)]">
                      <span>MATERIAL DESCRIPTION</span>
                      <span>QTY (MT)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="max-w-[180px] leading-tight">{viewingSlip.materialName}</span>
                      <span className="font-bold text-right text-[13px]">{viewingSlip.netWeightTonnes.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Trip Advances */}
                  <div className="border-t border-dashed border-[var(--color-outline-variant)] pt-2.5 space-y-1">
                    <div className="flex justify-between">
                      <span>HSD FUEL ADVANCE:</span>
                      <span className="font-bold">{viewingSlip.fuelIssuedLiters} LTR</span>
                    </div>
                    <div className="flex justify-between">
                      <span>CASH TRIP ADVANCE:</span>
                      <span className="font-bold">{formatCurrency(viewingSlip.cashAdvanceRupees)}</span>
                    </div>
                  </div>

                  {/* Signatures and Footer warnings */}
                  <div className="border-t border-dashed border-[var(--color-outline-variant)] pt-5 space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-center text-[9px] text-[var(--color-on-surface-variant)]">
                      <div className="space-y-4">
                        <div className="h-6"></div>
                        <p className="border-t border-[var(--color-outline-variant)] pt-1 uppercase">DRIVER SIGN</p>
                      </div>
                      <div className="space-y-4">
                        <div className="h-6"></div>
                        <p className="border-t border-[var(--color-outline-variant)] pt-1 uppercase">PLANT EN-CHARGE</p>
                      </div>
                    </div>

                    <div className="text-[9px] text-center text-[var(--color-on-surface-variant)] space-y-1 mt-4">
                      <p>⚠️ NOTE: Drivers must ensure insulated tarpaulin covers are properly buckled during transit.</p>
                      <p>Apex Plant Core Engine © 2026</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-[28px] p-8 text-center text-[var(--color-on-surface-variant)]">
                <Truck className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-on-surface)]">Select a Trip Slip</p>
                <p className="text-[11px] mt-1 text-[var(--color-on-surface-variant)] leading-normal">
                  Click on any trip slip from the log to view live status details, issue trip status updates, or print a thermal driver receipt.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. FLEET & MACHINERY LIST VIEW */}
      {activeSubTab === 'fleet' && (
        <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Vehicle No / Ownership</th>
                  <th className="py-3.5 px-3">Equipment Type</th>
                  <th className="py-3.5 px-3 text-right">Capacity Limit</th>
                  <th className="py-3.5 px-3">Assigned Driver</th>
                  <th className="py-3.5 px-3">Compliance & Expiry</th>
                  <th className="py-3.5 px-3">Financing & EMI</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]">
                {filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                      <Truck className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                      <p className="text-xs font-bold uppercase">No vehicles registered</p>
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((vehicle) => {
                    const isInsuranceWarning = vehicle.insuranceExpiry && new Date(vehicle.insuranceExpiry) < new Date(Date.now() + 30*24*60*60*1000);
                    const isFitnessWarning = vehicle.fitnessExpiry && new Date(vehicle.fitnessExpiry) < new Date(Date.now() + 30*24*60*60*1000);

                    // EMI Due calculations
                    const emi = vehicle.emiDetails;
                    const hasActiveEmi = emi && emi.hasEmi && emi.status !== 'closed';
                    const todayDay = new Date().getDate();
                    const dueDay = emi?.emiDueDay || 10;
                    const diffDays = dueDay >= todayDay ? dueDay - todayDay : 30 - (todayDay - dueDay);
                    const isDueSoon = hasActiveEmi && diffDays <= 7;

                    return (
                      <tr key={vehicle.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedVehicleForTyres(vehicle)}
                              className="font-mono text-xs font-black text-[var(--color-on-surface)] bg-[var(--color-surface-container-highest)] hover:bg-[var(--color-surface-container)] px-2.5 py-0.5 rounded-full border border-[var(--color-outline-variant)] tracking-wider transition cursor-pointer flex items-center gap-1"
                              title="Click to view mounted tyres & positions"
                            >
                              <Disc className="h-3 w-3 text-[var(--color-primary)] animate-spin-slow" />
                              {vehicle.vehicleNo}
                            </button>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              vehicle.ownership === 'owned' 
                               ? 'bg-[var(--color-surface-container)] text-[var(--color-on-surface)]' 
                                : 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                            }`}>
                              {vehicle.ownership}
                            </span>
                          </div>
                          {vehicle.notes && (
                            <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 italic max-w-[200px] truncate">{vehicle.notes}</p>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="text-[var(--color-on-surface)] font-bold capitalize">{vehicle.type}</span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <span className="text-[var(--color-on-surface)] font-bold">{vehicle.capacityTonnes} MT</span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="text-[var(--color-on-surface)] font-bold flex items-center gap-1">
                            <User className="h-3.5 w-3.5 text-[var(--color-outline)]" />
                            {vehicle.currentDriverName || <span className="text-[var(--color-on-surface-variant)] font-normal">Unassigned</span>}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 space-y-1">
                          {vehicle.insuranceExpiry && (
                            <p className={`text-[10px] font-semibold flex items-center gap-1 ${isInsuranceWarning ? 'text-[var(--color-warning)]' : 'text-[var(--color-on-surface-variant)]'}`}>
                              <Calendar className="h-3 w-3 shrink-0" />
                              Ins: <span className="font-bold">{vehicle.insuranceExpiry}</span>
                            </p>
                          )}
                          {vehicle.fitnessExpiry && (
                            <p className={`text-[10px] font-semibold flex items-center gap-1 ${isFitnessWarning ? 'text-[var(--color-warning)]' : 'text-[var(--color-on-surface-variant)]'}`}>
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              Fit: <span className="font-bold">{vehicle.fitnessExpiry}</span>
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          {hasActiveEmi ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-[var(--color-primary)] font-mono text-xs">
                                  {formatCurrency(emi.monthlyEmiAmount || 0)}
                                </span>
                                <span className="text-[10px] text-[var(--color-on-surface-variant)]">/mo</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isDueSoon
                                    ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] animate-pulse'
                                    : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                                }`}>
                                  Due: {dueDay}th
                                </span>
                                <span className="text-[10px] text-[var(--color-on-surface-variant)] truncate max-w-[100px]" title={emi.financierName}>
                                  {emi.financierName || 'Financed'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenVehicleModal(vehicle, 'emi')}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-primary)] hover:underline"
                            >
                              <Plus className="h-3 w-3" /> Add Loan EMI
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                            vehicle.status === 'available'
                              ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20'
                              : vehicle.status === 'on_trip'
                                ? 'bg-[var(--color-info-container)] text-[var(--color-on-info-container)] border border-[var(--color-info)]/20'
                                : 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] border border-[var(--color-warning)]/20'
                          }`}>
                            {vehicle.status === 'available' && 'Yard Idle'}
                            {vehicle.status === 'on_trip' && 'On Duty Trip'}
                            {vehicle.status === 'maintenance' && 'Workshop'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenVehicleModal(vehicle, 'general')}
                              className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] rounded-full transition"
                              title="Edit Vehicle & Specifications"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenVehicleModal(vehicle, 'emi')}
                              className="px-2 py-1 text-[11px] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] text-[var(--color-primary)] border border-[var(--color-outline-variant)] font-bold rounded-full flex items-center gap-1 transition shadow-2xs"
                              title="Manage Vehicle EMI Details"
                            >
                              <Landmark className="h-3 w-3" />
                              EMI
                            </button>
                            <button
                              onClick={() => setSelectedVehicleForTyres(vehicle)}
                              className="px-2 py-1 text-[11px] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] font-bold rounded-full flex items-center gap-1 transition-colors shadow-2xs"
                              title="Inspect mounted tyres & axle positions"
                            >
                              <Disc className="h-3 w-3" />
                              Tyres ({tyres.filter(t => t.vehicleId === vehicle.id && t.status === 'mounted').length})
                            </button>
                            <button
                              onClick={() => {
                                const newStat = vehicle.status === 'available' ? 'maintenance' : 'available';
                                localDb.updateVehicle(vehicle.id, { status: newStat });
                              }}
                              className="px-2 py-1 text-[11px] bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] font-bold rounded-full transition-colors"
                            >
                              {vehicle.status === 'maintenance' ? 'Release' : 'To Workshop'}
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
      )}

      {/* 2.5 VEHICLE EMI & LOAN FINANCING VIEW */}
      {activeSubTab === 'emi' && (
        <div className="space-y-6">
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
                    <p className="text-xs text-[var(--color-on-surface-variant)] mt-1.5 font-medium">
                      Across {activeFinanced.length} active vehicle loans
                    </p>
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
                    <p className="text-xs text-[var(--color-on-surface-variant)] mt-1.5 font-medium">
                      {vehicles.length - activeFinanced.length} Owned outright / Unencumbered
                    </p>
                  </div>
                  <div className="p-2.5 bg-[var(--color-surface-container)] rounded-2xl">
                    <Truck className="h-5 w-5 text-[var(--color-primary)]" />
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Next EMI Debit</p>
                    {nextDueVehicle ? (
                      <div>
                        <h3 className="text-xl font-extrabold text-[var(--color-warning)] mt-1">
                          {formatCurrency(nextDueVehicle.emiDetails?.monthlyEmiAmount || 0)}
                        </h3>
                        <p className="text-xs text-[var(--color-on-surface-variant)] mt-1 font-bold">
                          {nextDueVehicle.vehicleNo} (Due {nextDueVehicle.emiDetails?.emiDueDay}th)
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-xl font-extrabold text-[var(--color-on-surface-variant)] mt-1">None</h3>
                        <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">No upcoming EMIs</p>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 bg-[var(--color-warning-container)] rounded-2xl">
                    <Calendar className="h-5 w-5 text-[var(--color-on-warning-container)]" />
                  </div>
                </div>

                {/* Metric 4 */}
                <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Loan Principal</p>
                    <h3 className="text-2xl font-extrabold text-[var(--color-on-surface)] mt-1">{formatCurrency(totalPortfolioPrincipal)}</h3>
                    <p className="text-xs text-[var(--color-on-surface-variant)] mt-1.5 font-medium">
                      Combined equipment capital financing
                    </p>
                  </div>
                  <div className="p-2.5 bg-[var(--color-surface-container-high)] rounded-2xl">
                    <DollarSign className="h-5 w-5 text-[var(--color-on-surface)]" />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* EMI Master Table */}
          <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
            <div className="p-4 sm:p-5 border-b border-[var(--color-outline-variant)] flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface-container)]/60">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--color-on-surface)] flex items-center gap-2">
                  <Landmark className="h-4.5 w-4.5 text-[var(--color-primary)]" />
                  Vehicle Financing & EMI Ledger
                </h3>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                  Automated repayment calendar, financier accounts, monthly installment reminders & tenure logs
                </p>
              </div>

              <button
                onClick={() => handleOpenVehicleModal(null, 'emi')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs transition"
              >
                <Plus className="h-4 w-4" /> Add Financed Vehicle
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Vehicle / Machinery</th>
                    <th className="py-3.5 px-3">Financier / Bank</th>
                    <th className="py-3.5 px-3">Loan Account No</th>
                    <th className="py-3.5 px-3 text-right">Monthly EMI (₹)</th>
                    <th className="py-3.5 px-3">Due Day & Next Date</th>
                    <th className="py-3.5 px-3">Tenure / Repayment</th>
                    <th className="py-3.5 px-3">Auto-Debit Account</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]">
                  {vehicles.filter(v => v.emiDetails && v.emiDetails.hasEmi).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                        <Landmark className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                        <p className="text-xs font-bold uppercase">No financed vehicles found</p>
                        <p className="text-[11px] mt-1 text-[var(--color-on-surface-variant)]">
                          Attach active loan details to any company-owned vehicle to enable dashboard reminders and tracking.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    vehicles
                      .filter(v => v.emiDetails && v.emiDetails.hasEmi)
                      .map((vehicle) => {
                        const emi = vehicle.emiDetails!;
                        const today = new Date();
                        const todayDay = today.getDate();
                        const dueDay = emi.emiDueDay || 10;
                        const diffDays = dueDay >= todayDay ? dueDay - todayDay : 30 - (todayDay - dueDay);
                        const isDueSoon = emi.status !== 'closed' && diffDays <= 7;
                        const isDueToday = emi.status !== 'closed' && diffDays === 0;

                        const paid = emi.paidEmisCount || 0;
                        const totalTenure = emi.totalTenureMonths || 0;
                        const progressPercent = totalTenure > 0 ? Math.min(100, Math.round((paid / totalTenure) * 100)) : 0;

                        return (
                          <tr key={vehicle.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                            <td className="py-3.5 px-4">
                              <div className="font-mono text-xs font-black text-[var(--color-on-surface)]">
                                {vehicle.vehicleNo}
                              </div>
                              <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] capitalize">
                                {vehicle.type} ({vehicle.capacityTonnes} MT)
                              </span>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="font-bold text-[var(--color-on-surface)] block">
                                {emi.financierName || 'Not Specified'}
                              </span>
                              {emi.interestRate && (
                                <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                                  {emi.interestRate}% p.a.
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="font-mono text-xs text-[var(--color-on-surface-variant)] font-bold">
                                {emi.loanAccountNumber || '—'}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <span className="font-mono text-sm font-black text-[var(--color-primary)] block">
                                {formatCurrency(emi.monthlyEmiAmount || 0)}
                              </span>
                              {emi.totalLoanAmount && (
                                <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                                  Total: {formatCurrency(emi.totalLoanAmount)}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="space-y-1">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                                  isDueToday
                                    ? 'bg-[var(--color-error)] text-[var(--color-on-error)] animate-pulse'
                                    : isDueSoon
                                      ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] font-bold'
                                      : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]'
                                }`}>
                                  <Clock className="h-2.5 w-2.5" />
                                  {isDueToday ? 'Due Today!' : isDueSoon ? `Due in ${diffDays} days` : `Every ${dueDay}th`}
                                </span>
                                {emi.lastPaymentDate && (
                                  <p className="text-[9px] text-[var(--color-on-surface-variant)]">
                                    Last paid: {emi.lastPaymentDate}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="space-y-1 min-w-[110px]">
                                <div className="flex justify-between text-[10px] font-bold">
                                  <span>{paid} of {totalTenure || '?'} paid</span>
                                  <span>{progressPercent}%</span>
                                </div>
                                <div className="w-full bg-[var(--color-surface-container-high)] h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className="bg-[var(--color-primary)] h-full rounded-full transition-all"
                                    style={{ width: `${progressPercent}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="text-[11px] font-medium text-[var(--color-on-surface-variant)] truncate max-w-[130px] block">
                                {emi.autoDebitAccount || 'Company Bank'}
                              </span>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                                emi.status === 'active'
                                  ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                  : emi.status === 'closed'
                                    ? 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]'
                                    : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                              }`}>
                                {emi.status || 'active'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {emi.status !== 'closed' && (
                                  <button
                                    onClick={() => handleQuickMarkEmiPaid(vehicle)}
                                    className="px-2.5 py-1 text-[11px] bg-[var(--color-success-container)] hover:opacity-90 text-[var(--color-on-success-container)] font-bold rounded-full transition shadow-2xs flex items-center gap-1"
                                    title="Record EMI installment paid for this month"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    Mark Paid
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenVehicleModal(vehicle, 'emi')}
                                  className="px-2.5 py-1 text-[11px] bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] font-bold rounded-full transition"
                                  title="Edit Loan & EMI Details"
                                >
                                  Edit Loan
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

          {/* Quick Section for Unfinanced Fleet */}
          {vehicles.filter(v => !v.emiDetails || !v.emiDetails.hasEmi).length > 0 && (
            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs">
              <h4 className="text-xs font-extrabold text-[var(--color-on-surface)] uppercase tracking-wider mb-3">
                Unencumbered Vehicles ({vehicles.filter(v => !v.emiDetails || !v.emiDetails.hasEmi).length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {vehicles
                  .filter(v => !v.emiDetails || !v.emiDetails.hasEmi)
                  .map(v => (
                    <div
                      key={v.id}
                      className="p-3 bg-[var(--color-surface-container)]/50 rounded-2xl border border-[var(--color-outline-variant)] flex items-center justify-between"
                    >
                      <div>
                        <p className="font-mono text-xs font-bold text-[var(--color-on-surface)]">{v.vehicleNo}</p>
                        <p className="text-[10px] text-[var(--color-on-surface-variant)] capitalize">{v.type} • {v.ownership}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenVehicleModal(v, 'emi')}
                        className="text-[10px] font-bold px-2.5 py-1 bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] rounded-full hover:opacity-90 transition"
                      >
                        + Add EMI
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. DRIVERS DIRECTORY LIST VIEW */}
      {activeSubTab === 'drivers' && (
        <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-[28px] overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Driver Details</th>
                  <th className="py-3.5 px-3">Commercial License No</th>
                  <th className="py-3.5 px-3">Contact Phone</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]">
                {filteredDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                      <User className="h-8 w-8 text-[var(--color-outline)] mx-auto mb-2" />
                      <p className="text-xs font-bold uppercase">No drivers registered</p>
                    </td>
                  </tr>
                ) : (
                  filteredDrivers.map((driver) => (
                    <tr key={driver.id} className="hover:bg-[var(--color-surface-container)]/40 transition-colors text-xs text-[var(--color-on-surface)]">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)] flex items-center justify-center font-bold text-[var(--color-on-surface)] text-sm">
                            {driver.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-[var(--color-on-surface)] block">{driver.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-mono text-xs text-[var(--color-on-surface-variant)] font-bold">{driver.licenseNo}</span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="text-[var(--color-on-surface)] font-bold">{driver.phone}</span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                          driver.status === 'available'
                            ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20'
                            : driver.status === 'on_duty'
                              ? 'bg-[var(--color-info-container)] text-[var(--color-on-info-container)] border border-[var(--color-info)]/20'
                              : 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] border border-[var(--color-warning)]/20'
                        }`}>
                          {driver.status === 'available' && 'Available'}
                          {driver.status === 'on_duty' && 'On Duty'}
                          {driver.status === 'leave' && 'On Leave'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`tel:${driver.phone}`}
                            className="px-3 py-1 text-[11px] bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] font-bold rounded-full transition-colors"
                          >
                            Call
                          </a>
                          <button
                            onClick={() => {
                              const isLeave = driver.status === 'leave';
                              localDb.updateDriver(driver.id, { status: isLeave ? 'available' : 'leave' });
                            }}
                            className={`px-3 py-1 text-[11px] font-bold rounded-full transition-colors ${
                              driver.status === 'leave'
                                ? 'bg-[var(--color-success-container)] hover:opacity-90 text-[var(--color-on-success-container)]'
                                : 'bg-[var(--color-warning-container)] hover:opacity-90 text-[var(--color-on-warning-container)]'
                            }`}
                          >
                            {driver.status === 'leave' ? 'Mark Back' : 'Mark Leave'}
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

      {/* 4. TYRE FLEET MANAGEMENT */}
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

      {/* 5. INTERACTIVE TRANSIT MAP SIMULATOR */}
      {activeSubTab === 'simulator' && (
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
                    Generate a new outward trip slip and dispatch it. It will immediately show up in transit route telemetry here!
                  </p>
                </div>
              ) : (
                slips.filter(s => s.status === 'transit' || s.status === 'loading').map((slip, i) => {
                  const percent = slip.status === 'loading' ? 0 : 45 + (i * 20) % 40;
                  return (
                    <div key={slip.id} className="space-y-2 relative">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span className="font-bold">Trip: {slip.slipNumber} • {slip.materialName}</span>
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
                            <p>Driver: <span className="font-bold text-white">{slip.driverName}</span></p>
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

      {/* ======================================= */}
      {/* GLOBAL MODALS */}
      {/* ======================================= */}

      {/* 1. THERMAL PRINT DIALOG MODAL */}
      {showPrintPreview && viewingSlip && (
        <div className="fixed inset-0 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <h3 className="font-black text-[var(--color-on-surface)] text-sm flex items-center gap-2">
                <Printer className="h-4.5 w-4.5 text-[var(--color-primary)]" /> Print Trip Slip
              </h3>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 bg-[var(--color-surface-container)] max-h-[450px] overflow-y-auto">
              {/* Actual paper ticket */}
              <div id="print-slip-area" className="bg-white p-6 shadow-md border border-slate-300 mx-auto font-mono text-xs text-slate-800 space-y-4 max-w-sm rounded-lg">
                <div className="text-center space-y-1">
                  <p className="font-extrabold text-[12px] uppercase">{settings?.companyName || 'APEX ROADS &'}</p>
                  <p className="text-[8px] text-slate-500">MORT ROAD CONSTRUCTIONS</p>
                  <p className="text-[10px] font-bold border-y border-dashed border-slate-300 py-1.5 my-2">
                    🚚 OFFICIAL DISPATCH TRIP TICKET
                  </p>
                </div>

                <div className="space-y-1 text-left">
                  <p>SLIP NO   : {viewingSlip.slipNumber}</p>
                  <p>DATE/TIME : {viewingSlip.date} @ {viewingSlip.time}</p>
                  <p>VEHICLE   : {viewingSlip.vehicleNo}</p>
                  <p>DRIVER    : {viewingSlip.driverName}</p>
                  <p>TRIP TYPE : {viewingSlip.tripType.toUpperCase()}</p>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                  <p className="font-bold">DESTINATION DEST:</p>
                  <p className="font-bold">{viewingSlip.destination}</p>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-2 space-y-1.5">
                  <div className="flex justify-between font-bold">
                    <span>MATERIAL</span>
                    <span>QTY (MT)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{viewingSlip.materialName}</span>
                    <span className="font-bold">{viewingSlip.netWeightTonnes}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                  <p>HSD FUEL ALLOWANCE: {viewingSlip.fuelIssuedLiters} LTR</p>
                  <p>TOLL CASH ADVANCE  : {formatCurrency(viewingSlip.cashAdvanceRupees)}</p>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-4 text-center">
                  <p className="text-[8px] text-slate-400">APEX INFRA BATCH ENGINE SYSTEM</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
              <button
                onClick={() => setShowPrintPreview(false)}
                className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
              >
                Close View
              </button>
              <button
                onClick={() => {
                  alert(`Dispatched print request for ${viewingSlip.slipNumber}. Printing thermal ticket...`);
                  setShowPrintPreview(false);
                }}
                className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="h-3.5 w-3.5" /> Start Simulation Print
              </button>
            </div>
          </div>
        </div>
      )}

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
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.status === 'on_duty' ? 'On Duty' : 'Available'})
                      </option>
                    ))}
                  </select>
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
                  {editingVehicle ? `Edit ${editingVehicle.vehicleNo}` : 'Register Fleet Vehicle & Financing'}
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
                  Configure vehicle specifications, compliance documents, and bank loan EMI schedules.
                </p>
              </div>
              <button
                onClick={() => setIsVehicleModalOpen(false)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Internal Tabs */}
            <div className="flex border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]/50 px-6">
              <button
                type="button"
                onClick={() => setVehicleModalTab('general')}
                className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  vehicleModalTab === 'general'
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                <Truck className="h-3.5 w-3.5" />
                Vehicle Specifications
              </button>
              <button
                type="button"
                onClick={() => setVehicleModalTab('emi')}
                className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  vehicleModalTab === 'emi'
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                <Landmark className="h-3.5 w-3.5" />
                Loan & EMI Details
                {formVehHasEmi && (
                  <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] inline-block"></span>
                )}
              </button>
            </div>

            <form onSubmit={handleSaveVehicle}>
              <div className="p-6 space-y-4 max-h-[460px] overflow-y-auto text-left">
                {/* TAB 1: GENERAL SPECS */}
                {vehicleModalTab === 'general' && (
                  <div className="space-y-4">
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
                        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Capacity (MT) *</label>
                        <input
                          type="number"
                          placeholder="e.g. 18"
                          value={formVehCapacity}
                          onChange={(e) => setFormVehCapacity(e.target.value)}
                          className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Ownership</label>
                        <select
                          value={formVehOwner}
                          onChange={(e) => setFormVehOwner(e.target.value as any)}
                          className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                        >
                          <option value="owned">Company Owned</option>
                          <option value="contractor">Sub-Contractor</option>
                          <option value="market">Market Hired</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Assigned Driver</label>
                        <select
                          value={formVehDriverId}
                          onChange={(e) => setFormVehDriverId(e.target.value)}
                          className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                        >
                          <option value="">-- Unassigned --</option>
                          {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Operational Status</label>
                        <select
                          value={formVehStatus}
                          onChange={(e) => setFormVehStatus(e.target.value as any)}
                          className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                        >
                          <option value="available">Yard Idle (Available)</option>
                          <option value="on_trip">On Active Trip</option>
                          <option value="maintenance">Maintenance / Workshop</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Fitness Expiry</label>
                        <input
                          type="date"
                          value={formVehFitness}
                          onChange={(e) => setFormVehFitness(e.target.value)}
                          className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Insurance Expiry</label>
                        <input
                          type="date"
                          value={formVehInsurance}
                          onChange={(e) => setFormVehInsurance(e.target.value)}
                          className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
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
                  </div>
                )}

                {/* TAB 2: LOAN & EMI DETAILS */}
                {vehicleModalTab === 'emi' && (
                  <div className="space-y-4">
                    {/* EMI Enable Toggle Card */}
                    <div className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] flex items-center justify-between">
                      <div>
                        <p className="text-xs font-extrabold text-[var(--color-on-surface)] flex items-center gap-1.5">
                          <Landmark className="h-4 w-4 text-[var(--color-primary)]" />
                          Vehicle Hypothecation & Loan EMI
                        </p>
                        <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                          Track bank financier, monthly installment deduction dates, and dashboard alert notifications.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formVehHasEmi}
                          onChange={(e) => setFormVehHasEmi(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                      </label>
                    </div>

                    {formVehHasEmi ? (
                      <div className="space-y-3.5 pt-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Financier / Bank Name *</label>
                            <input
                              type="text"
                              placeholder="e.g. HDFC Bank, Tata Finance"
                              value={formVehEmiFinancier}
                              onChange={(e) => setFormVehEmiFinancier(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none font-medium"
                              required={formVehHasEmi}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Loan Account No</label>
                            <input
                              type="text"
                              placeholder="e.g. LN-VHL-98234"
                              value={formVehEmiLoanAccNo}
                              onChange={(e) => setFormVehEmiLoanAccNo(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Monthly EMI Amount (₹) *</label>
                            <input
                              type="number"
                              placeholder="e.g. 48500"
                              value={formVehEmiAmount}
                              onChange={(e) => setFormVehEmiAmount(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                              required={formVehHasEmi}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Monthly Due Day (1 - 31) *</label>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              placeholder="e.g. 10 (10th of every month)"
                              value={formVehEmiDueDay}
                              onChange={(e) => setFormVehEmiDueDay(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] font-mono font-bold focus:outline-none"
                              required={formVehHasEmi}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Total Loan (₹)</label>
                            <input
                              type="number"
                              placeholder="e.g. 2400000"
                              value={formVehEmiTotalLoan}
                              onChange={(e) => setFormVehEmiTotalLoan(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Tenure (Months)</label>
                            <input
                              type="number"
                              placeholder="e.g. 48"
                              value={formVehEmiTenureMonths}
                              onChange={(e) => setFormVehEmiTenureMonths(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">EMIs Paid</label>
                            <input
                              type="number"
                              placeholder="e.g. 14"
                              value={formVehEmiPaidCount}
                              onChange={(e) => setFormVehEmiPaidCount(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Auto-Debit Account</label>
                            <input
                              type="text"
                              placeholder="e.g. State Bank Current A/C"
                              value={formVehEmiAutoDebitAccount}
                              onChange={(e) => setFormVehEmiAutoDebitAccount(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                            />
                          </div>

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
                            <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Maturity / End Date</label>
                            <input
                              type="date"
                              value={formVehEmiEndDate}
                              onChange={(e) => setFormVehEmiEndDate(e.target.value)}
                              className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Financier / Loan Notes</label>
                          <input
                            type="text"
                            placeholder="e.g. Hypothecation endorsement in RC book, branch manager Mr. Verma"
                            value={formVehEmiNotes}
                            onChange={(e) => setFormVehEmiNotes(e.target.value)}
                            className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container)]/30 rounded-2xl border border-dashed border-[var(--color-outline-variant)]">
                        <Landmark className="h-7 w-7 text-[var(--color-outline)] mx-auto mb-2" />
                        <p className="text-xs font-bold uppercase">No Loan Attached</p>
                        <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-1 max-w-xs mx-auto">
                          Toggle the switch above to attach commercial financing, set monthly EMI deduction dates, and activate dashboard reminders.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex items-center justify-between">
                <div className="text-[11px] text-[var(--color-on-surface-variant)]">
                  {vehicleModalTab === 'general' ? (
                    <button
                      type="button"
                      onClick={() => setVehicleModalTab('emi')}
                      className="font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1"
                    >
                      Next: Loan & EMI Details <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setVehicleModalTab('general')}
                      className="font-bold text-[var(--color-on-surface-variant)] hover:underline"
                    >
                      ← Back to Specifications
                    </button>
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

      {/* 4. ADD DRIVER MODAL */}
      {isDriverModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] max-w-sm w-full overflow-hidden">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm flex items-center gap-2">
                <User className="h-4.5 w-4.5 text-[var(--color-primary)]" /> Register Heavy Driver
              </h3>
              <button
                onClick={() => setIsDriverModalOpen(false)}
                className="p-1.5 hover:bg-[var(--color-surface-container-high)] rounded-full text-[var(--color-on-surface-variant)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDriver}>
              <div className="p-5 space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Driver Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Satnam Singh"
                    value={formDrName}
                    onChange={(e) => setFormDrName(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">HGV Driving License (DL) *</label>
                  <input
                    type="text"
                    placeholder="e.g. PB-02-2012-0012345"
                    value={formDrLicense}
                    onChange={(e) => setFormDrLicense(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase">Mobile Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98765 43210"
                    value={formDrPhone}
                    onChange={(e) => setFormDrPhone(e.target.value)}
                    className="w-full p-2.5 border border-[var(--color-outline-variant)] rounded-xl text-sm bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDriverModalOpen(false)}
                  className="px-4 py-2 border border-[var(--color-outline-variant)] rounded-full text-xs font-bold bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold transition shadow-xs"
                >
                  Register Driver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. TYRE REGISTRATION / INSPECTION MODAL */}
      {isTyreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-scrim)]/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] shadow-xl border border-[var(--color-outline-variant)] max-w-lg w-full overflow-hidden my-8">
            <div className="p-5 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div>
                <h3 className="font-extrabold text-[var(--color-on-surface)] text-sm uppercase tracking-tight flex items-center gap-1.5">
                  <Disc className="h-4.5 w-4.5 text-[var(--color-primary)] animate-spin-slow" />
                  {editingTyre ? 'Inspect & Edit Tyre' : 'Register New Tyre'}
                </h3>
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                  {editingTyre ? `Serial: ${editingTyre.serialNumber}` : 'Add a brand new tyre record to the fleet inventory.'}
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
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">Capacity: {selectedVehicleForTyres.capacityTonnes} MT • Assigned Driver: {selectedVehicleForTyres.currentDriverName || 'None'}</p>
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
    </div>
  );
};
