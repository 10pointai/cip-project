import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Edit3,
  Eye,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  Calendar,
  Layers,
  TrendingUp,
  Boxes,
  Truck,
  Building,
  User,
  Percent,
  Printer,
  Download,
  Check,
  FileCheck,
  FileSpreadsheet,
  Receipt,
  ClipboardList,
  Database,
  Cloud,
  Landmark,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { Order, OrderItem, OrderStatus, OrderType, SalesStage, PurchaseStage, Party, Item, CompanySettings, Vehicle, Driver, PaymentMode, CashBankAccount } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { AddPurchaseModal } from './AddPurchaseModal';

function numberToWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only';
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) : '');
  };
  
  try {
    const whole = Math.floor(num);
    const fraction = Math.round((num - whole) * 100);
    let words = convert(whole) + ' Rupees';
    if (fraction > 0) {
      words += ' and ' + convert(fraction) + ' Paise';
    }
    return words + ' Only';
  } catch {
    return 'Rupees ' + num.toLocaleString('en-IN') + ' Only';
  }
}

interface OrdersViewProps {
  orders: Order[];
  parties: Party[];
  items: Item[];
  settings: CompanySettings;
  onAddOrder: (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) => Order;
  onUpdateOrder: (id: string, updates: Partial<Order>) => Order;
  onDeleteOrder: (id: string) => boolean;
  fixedType?: OrderType;
}

export function OrdersView({
  orders,
  parties,
  items,
  settings,
  onAddOrder,
  onUpdateOrder,
  onDeleteOrder,
  fixedType,
}: OrdersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | OrderType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  
  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<Order | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formType, setFormType] = useState<OrderType>(fixedType || 'sales');

  // Form states
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPartyId, setFormPartyId] = useState('');
  const [formStatus, setFormStatus] = useState<OrderStatus>('pending');
  const [formItems, setFormItems] = useState<Array<{ itemId: string; quantity: string; rate: string; location: string }>>([
    { itemId: '', quantity: '', rate: '', location: '' },
  ]);
  const [formTaxRate, setFormTaxRate] = useState('18');
  const [formNotes, setFormNotes] = useState('');
  const [formOrderNumber, setFormOrderNumber] = useState('');
  const [formStage, setFormStage] = useState<SalesStage>('sales_order');
  const [formVehicleNo, setFormVehicleNo] = useState('');
  const [formDriverName, setFormDriverName] = useState('');
  const [formTransportCharges, setFormTransportCharges] = useState('0');
  const [formPaymentMode, setFormPaymentMode] = useState<PaymentMode>('bank_transfer');
  const [formAccountId, setFormAccountId] = useState<string>('');
  
  // Optional toggles for payment settlement & transportation
  const [includePayment, setIncludePayment] = useState<boolean>(false);
  const [includeLogistics, setIncludeLogistics] = useState<boolean>(false);

  // Fetch available accounts, vehicles, drivers & storage locations for dropdown selection
  const accounts = useMemo(() => localDb.getAccounts(), [isFormOpen]);
  const registeredVehicles = useMemo(() => localDb.getVehicles(), [isFormOpen]);
  const registeredDrivers = useMemo(() => localDb.getDrivers(), [isFormOpen]);
  const availableLocations = useMemo(() => localDb.getLocations(), [isFormOpen]);

  // Preview modal states
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [previewStage, setPreviewStage] = useState<SalesStage>('sales_order');

  // Currency Formatter
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const currentOrders = useMemo(() => {
    if (fixedType) {
      return orders.filter((o) => o.type === fixedType);
    }
    return orders;
  }, [orders, fixedType]);

  // Filter parties based on order type
  const eligibleParties = useMemo(() => {
    if (formType === 'sales') {
      return parties.filter((p) => p.type === 'customer' || p.type === 'both');
    } else {
      return parties.filter((p) => p.type === 'vendor' || p.type === 'both');
    }
  }, [parties, formType]);

  // Filter physical items (products) for the order dropdown
  const productItems = useMemo(() => {
    return items.filter((i) => i.type === 'product' && i.isActive);
  }, [items]);

  // Calculate Order statistics
  const stats = useMemo(() => {
    let salesTotal = 0;
    let purchaseTotal = 0;
    let pendingCount = 0;
    let completedCount = 0;

    currentOrders.forEach((o) => {
      if (o.status === 'cancelled') return;
      if (o.type === 'sales') {
        salesTotal += o.totalAmount;
      } else if (o.purchaseStage !== 'rfq') {
        purchaseTotal += o.totalAmount;
      }

      if (o.status === 'pending' || o.status === 'partially_delivered') {
        pendingCount++;
      } else if (o.status === 'completed') {
        completedCount++;
      }
    });

    return { salesTotal, purchaseTotal, pendingCount, completedCount };
  }, [currentOrders]);

  // Filter and search orders
  const filteredOrders = useMemo(() => {
    return currentOrders.filter((o) => {
      const matchesSearch =
        o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.items.some((item) => item.itemName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesType = fixedType ? true : (typeFilter === 'all' || o.type === typeFilter);
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [currentOrders, searchTerm, typeFilter, statusFilter, fixedType]);

  // Handle open Form Modal for Create
  const handleOpenCreate = (type: OrderType) => {
    const resolvedType = fixedType || type;
    if (resolvedType === 'purchase') {
      setEditingPurchaseOrder(null);
      setIsPurchaseModalOpen(true);
      return;
    }

    setFormType(resolvedType);
    setEditingOrder(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormPartyId('');
    setFormStatus('pending');
    setFormItems([{ itemId: '', quantity: '', rate: '', location: '' }]);
    // Pre-select default item tax rate if available
    const initialItem = productItems[0];
    const initialTax = initialItem?.taxRateGst !== undefined ? String(initialItem.taxRateGst) : '18';
    setFormTaxRate(initialTax);
    setFormNotes('');
    setFormStage('quotation');
    setFormVehicleNo('');
    setFormDriverName('');
    setFormTransportCharges('0');
    setIncludePayment(false);
    setIncludeLogistics(false);
    
    // Auto-select default active account
    const activeAccs = localDb.getAccounts().filter((a) => a.isActive);
    const defaultAcc = activeAccs.find((a) => a.isDefault) || activeAccs[0];
    setFormPaymentMode('bank_transfer');
    setFormAccountId(defaultAcc ? defaultAcc.id : '');
    
    // Auto-generate realistic order number
    const prefix = resolvedType === 'sales' ? 'SO' : 'PO';
    const typeCount = orders.filter(o => o.type === resolvedType).length;
    const num = String(typeCount + 1).padStart(4, '0');
    const year = new Date().getFullYear();
    setFormOrderNumber(`${prefix}-${year}-${num}`);
    setFormError(null);
    
    setIsFormOpen(true);
  };

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (fixedType === 'sales' && customEvent.detail === 'book-order') {
        handleOpenCreate('sales');
      } else if (
        fixedType === 'purchase' &&
        (customEvent.detail === 'create-po' || customEvent.detail === 'add-purchase')
      ) {
        handleOpenCreate('purchase');
      }
    };
    window.addEventListener('app-header-action', handleHeaderAction);
    return () => window.removeEventListener('app-header-action', handleHeaderAction);
  }, [fixedType, orders.length]);

  // Handle save from AddPurchaseModal
  const handleSavePurchaseOrder = (savedOrder: Order) => {
    const exists = orders.some((o) => o.id === savedOrder.id);
    if (exists) {
      onUpdateOrder(savedOrder.id, savedOrder);
    } else {
      onAddOrder(savedOrder);
    }
    if (selectedOrder && selectedOrder.id === savedOrder.id) {
      setSelectedOrder(savedOrder);
    }
  };

  // Handle cancel from AddPurchaseModal
  const handleCancelPurchaseOrder = (orderId: string) => {
    onUpdateOrder(orderId, { status: 'cancelled' });
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
    }
  };

  // Handle open Form Modal for Edit
  const handleOpenEdit = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (order.type === 'purchase') {
      setEditingPurchaseOrder(order);
      setIsPurchaseModalOpen(true);
      return;
    }
    setEditingOrder(order);
    setFormType(order.type);
    setFormDate(order.date);
    setFormPartyId(order.partyId);
    setFormStatus(order.status);
    setFormTaxRate(String(order.taxRateGst));
    setFormNotes(order.notes || '');
    setFormOrderNumber(order.orderNumber);
    setFormStage(order.stage || 'sales_order');
    setFormVehicleNo(order.vehicleNo || '');
    setFormDriverName(order.driverName || '');
    setFormTransportCharges(String(order.transportCharges || 0));
    setFormPaymentMode(order.paymentMode || 'bank_transfer');
    setFormAccountId(order.accountId || '');
    setIncludePayment(Boolean(order.accountId && (order.paymentStatus === 'paid' || order.status === 'completed')));
    setIncludeLogistics(Boolean(order.vehicleNo || order.driverName || (Number(order.transportCharges) > 0)));
    setFormItems(
      order.items.map((i) => ({
        itemId: i.itemId,
        quantity: String(i.quantity),
        rate: String(i.rate),
        location: i.location || '',
      }))
    );
    setFormError(null);
    setIsFormOpen(true);
  };

  // Handle row addition in items form
  const handleAddFormItemRow = () => {
    setFormItems([...formItems, { itemId: '', quantity: '', rate: '', location: '' }]);
  };

  // Handle row removal in items form
  const handleRemoveFormItemRow = (index: number) => {
    if (formItems.length === 1) return;
    setFormItems(formItems.filter((_, idx) => idx !== index));
  };

  const handlePrint = () => {
    window.print();
  };

  // Handle field change inside items rows
  const handleFormItemChange = (index: number, field: 'itemId' | 'quantity' | 'rate' | 'location', value: string) => {
    const updated = [...formItems];
    updated[index][field] = value;

    // If item changed, auto-fill default rate and location
    if (field === 'itemId') {
      const selectedProduct = productItems.find((p) => p.id === value);
      if (selectedProduct) {
        updated[index].rate = String(
          formType === 'sales'
            ? selectedProduct.salePrice
            : selectedProduct.purchasePrice || selectedProduct.salePrice || 0
        );
        const rawLocs = selectedProduct.locations && selectedProduct.locations.length > 0
          ? selectedProduct.locations
          : selectedProduct.stockLocation
            ? selectedProduct.stockLocation.split(',').map((s) => ({ locationName: s.trim() }))
            : [];
        const seenLocNames = new Set<string>();
        const prodLocs = rawLocs.filter((l) => {
          const name = l.locationName?.trim();
          if (!name || seenLocNames.has(name.toLowerCase())) return false;
          seenLocNames.add(name.toLowerCase());
          return true;
        });
        if (prodLocs.length > 0) {
          updated[index].location = prodLocs[0].locationName;
        } else if (availableLocations.length > 0) {
          updated[index].location = availableLocations[0].name;
        } else {
          updated[index].location = '';
        }
        // Auto-reflect the GST slab configured on this inventory item
        if (selectedProduct.taxRateGst !== undefined) {
          setFormTaxRate(String(selectedProduct.taxRateGst));
        }
      } else {
        updated[index].location = '';
      }
    }
    setFormItems(updated);
  };

  // Calculate dynamic subtotals for form
  const formCalculations = useMemo(() => {
    let subtotal = 0;
    formItems.forEach((row) => {
      const qty = Number(row.quantity) || 0;
      const rate = Number(row.rate) || 0;
      subtotal += qty * rate;
    });

    const transportCharges = includeLogistics ? (Number(formTransportCharges) || 0) : 0;
    const taxRate = Number(formTaxRate) || 0;
    const taxAmount = (subtotal * taxRate) / 100;
    const totalAmount = subtotal + taxAmount + transportCharges;

    return { subtotal, taxAmount, totalAmount, transportCharges };
  }, [formItems, formTaxRate, formTransportCharges, includeLogistics]);

  // Save/Submit order form
  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPartyId) {
      setFormError('Please select a Party.');
      return;
    }

    let selectedAccount = undefined;
    if (includePayment) {
      if (!formPaymentMode) {
        setFormError('Please select a Payment Mode.');
        return;
      }

      if (!formAccountId) {
        setFormError(`Please select a ${formType === 'sales' ? 'Deposit / Settlement Account (where money will be credited)' : 'Disbursement Account (where money will be debited)'}.`);
        return;
      }

      selectedAccount = accounts.find((a) => a.id === formAccountId);
      if (!selectedAccount) {
        setFormError('The selected Cash/Bank account is invalid. Please select an active account from the list.');
        return;
      }
    }
    
    // Validate rows
    const validRows = formItems.filter((row) => row.itemId && Number(row.quantity) > 0 && Number(row.rate) > 0);
    if (validRows.length === 0) {
      setFormError('Please add at least one valid item with a quantity greater than zero.');
      return;
    }

    const party = parties.find((p) => p.id === formPartyId);
    if (!party) return;

    // Map rows to OrderItem format
    const itemsList: OrderItem[] = validRows.map((row) => {
      const product = items.find((i) => i.id === row.itemId)!;
      const qty = Number(row.quantity);
      const rate = Number(row.rate);
      const prodLocs = product.locations && product.locations.length > 0
        ? product.locations
        : product.stockLocation
          ? product.stockLocation.split(',').map((s) => ({ locationName: s.trim() }))
          : [];
      const assignedLoc = row.location?.trim() || prodLocs[0]?.locationName || undefined;
      return {
        itemId: row.itemId,
        itemName: product.name,
        quantity: qty,
        unit: product.unit,
        rate: rate,
        amount: qty * rate,
        location: assignedLoc,
      };
    });

    const { taxAmount, totalAmount } = formCalculations;

    const payload = {
      orderNumber: formOrderNumber.trim(),
      type: formType,
      partyId: formPartyId,
      partyName: party.tradeName || party.name,
      date: formDate,
      status: formStatus,
      stage: formType === 'sales' ? formStage : undefined,
      items: itemsList,
      taxRateGst: Number(formTaxRate) || 0,
      taxAmount: taxAmount,
      totalAmount: totalAmount,
      notes: formNotes.trim(),
      vehicleNo: includeLogistics && formVehicleNo.trim() ? formVehicleNo.trim() : undefined,
      driverName: includeLogistics && formDriverName.trim() ? formDriverName.trim() : undefined,
      transportCharges: includeLogistics ? (Number(formTransportCharges) || 0) : 0,
      paymentMode: includePayment ? formPaymentMode : undefined,
      accountId: includePayment ? formAccountId : undefined,
      accountName: includePayment && selectedAccount ? selectedAccount.name : undefined,
      paymentStatus: includePayment ? ('paid' as const) : ('pending' as const),
    };

    if (editingOrder) {
      onUpdateOrder(editingOrder.id, payload);
    } else {
      onAddOrder(payload);
    }

    setIsFormOpen(false);
  };

  const handleDeleteOrderClick = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrderToDelete(order);
  };

  const handleConfirmDelete = () => {
    if (!orderToDelete) return;
    const targetId = orderToDelete.id;
    onDeleteOrder(targetId);
    if (selectedOrder?.id === targetId) {
      setIsDetailOpen(false);
    }
    setOrderToDelete(null);
  };

  const handleOpenDetail = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  // Dynamic lookup for linked Trip Slip if any
  const linkedTripSlip = useMemo(() => {
    if (!previewOrder) return null;
    return localDb.getTripSlips().find(s => s.orderId === previewOrder.id || s.orderNumber === previewOrder.orderNumber);
  }, [previewOrder, isPreviewOpen]);

  // Explicitly compute calculations to be 100% accurate for printable template
  const previewCalculations = useMemo(() => {
    if (!previewOrder) return { subtotal: 0, taxAmount: 0, transportCharges: 0, grandTotal: 0 };
    const subtotal = previewOrder.items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    const transportCharges = previewOrder.transportCharges || 0;
    const taxAmount = (subtotal * (previewOrder.taxRateGst || 0)) / 100;
    const grandTotal = subtotal + taxAmount + transportCharges;
    return { subtotal, taxAmount, transportCharges, grandTotal };
  }, [previewOrder]);

  return (
    <div className="space-y-6" id="orders-management-container">
      {/* KPI Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {fixedType === 'sales' ? (
          <>
            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Sales Booked</p>
                <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{formatCurrency(stats.salesTotal)}</p>
                <p className="text-[10px] text-[var(--color-success)] font-medium mt-0.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Real-time outward volume
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-success-container)] text-[var(--color-on-success-container)] flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Pending Dispatches</p>
                <p className="text-lg font-black text-[var(--color-warning)] mt-1">{stats.pendingCount} Orders</p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Awaiting outward weighment challan</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Completed Deliveries</p>
                <p className="text-lg font-black text-[var(--color-success)] mt-1">{stats.completedCount} Dispatched</p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Silo inventory cleared out</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-success-container)] text-[var(--color-on-success-container)] flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Active Customers</p>
                <p className="text-lg font-black text-[var(--color-primary)] mt-1">
                  {parties.filter(p => p.type === 'customer' || p.type === 'both').length} Clients
                </p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Registered contract buyers</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
            </div>
          </>
        ) : fixedType === 'purchase' ? (
          <>
            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Purchases Booked</p>
                <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{formatCurrency(stats.purchaseTotal)}</p>
                <p className="text-[10px] text-[var(--color-primary)] font-medium mt-0.5">Aggregate & bitumen materials</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Awaiting Inbound</p>
                <p className="text-lg font-black text-[var(--color-warning)] mt-1">{stats.pendingCount} POs</p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Pending raw feedstock reception</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Completed Receipts</p>
                <p className="text-lg font-black text-[var(--color-success)] mt-1">{stats.completedCount} Completed</p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Yard stocks credited successfully</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-success-container)] text-[var(--color-on-success-container)] flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Active Suppliers</p>
                <p className="text-lg font-black text-[var(--color-primary)] mt-1">
                  {parties.filter(p => p.type === 'vendor' || p.type === 'both').length} Vendors
                </p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Quarries, refineries & transport leads</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Sales Booked</p>
                <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{formatCurrency(stats.salesTotal)}</p>
                <p className="text-[10px] text-[var(--color-success)] font-medium mt-0.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Real-time outward volume
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-success-container)] text-[var(--color-on-success-container)] flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Purchases Booked</p>
                <p className="text-lg font-black text-[var(--color-on-surface)] mt-1">{formatCurrency(stats.purchaseTotal)}</p>
                <p className="text-[10px] text-[var(--color-primary)] font-medium mt-0.5">Procured feedstocks & bitumen</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Pending Fulfillment</p>
                <p className="text-lg font-black text-[var(--color-warning)] mt-1">{stats.pendingCount} Orders</p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Awaiting physical delivery / dispatch</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Fulfilled Orders</p>
                <p className="text-lg font-black text-[var(--color-success)] mt-1">{stats.completedCount} Completed</p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Stock successfully adjusted in silos</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[var(--color-success-container)] text-[var(--color-on-success-container)] flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Search and Filters Layout */}
      <div className="p-4 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-outline)]" />
          <input
            type="text"
            placeholder="Search by order #, party name, or material..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface-container)] text-xs font-semibold text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)] rounded-full focus:outline-none focus:bg-[var(--color-surface)] focus:border-[var(--color-primary)] transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Order Type Filter */}
          {!fixedType && (
            <div className="flex items-center gap-1 bg-[var(--color-surface-container)] p-1 rounded-full border border-[var(--color-outline-variant)]">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                  typeFilter === 'all' ? 'bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] shadow-xs' : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                All Types
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('sales')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                  typeFilter === 'sales' ? 'bg-[var(--color-success)] text-[var(--color-on-success)] shadow-xs' : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                Sales
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('purchase')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                  typeFilter === 'purchase' ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs' : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                Purchase
              </button>
            </div>
          )}

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] flex items-center gap-1">
              <Filter className="w-3 h-3" /> Status:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] px-3 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partially_delivered">Partially Delivered</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Cloud Database indicator */}
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--color-surface-container)] text-[var(--color-primary)] border border-[var(--color-outline-variant)]">
            <Database className="w-3 h-3 text-[var(--color-primary)]" />
            <span>Azure Cloud DB</span>
          </span>

          {/* New Order Button */}
          <button
            type="button"
            onClick={() => handleOpenCreate(fixedType || 'sales')}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full transition-all shadow-xs active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{fixedType === 'sales' ? 'Book Sales Order' : fixedType === 'purchase' ? 'Add Purchase' : 'New Order'}</span>
          </button>
        </div>
      </div>

      {/* Orders Table Display */}
      <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Order Ref / Date</th>
                {!fixedType && <th className="py-3.5 px-3">Type</th>}
                {fixedType === 'sales' && <th className="py-3.5 px-3">Sales Stage</th>}
                {fixedType === 'purchase' && <th className="py-3.5 px-3">Purchase Stage</th>}
                <th className="py-3.5 px-3">Party Name</th>
                <th className="py-3.5 px-3">Materials Ordered</th>
                <th className="py-3.5 px-3 text-right">Total Amount</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={!fixedType || fixedType === 'sales' || fixedType === 'purchase' ? 7 : 6} className="py-12 text-center text-[var(--color-on-surface-variant)]">
                    <FileText className="w-8 h-8 mx-auto text-[var(--color-outline-variant)] mb-2" />
                    <p className="text-xs font-bold">No Orders Found</p>
                    <p className="text-[10px] mt-0.5">Try widening search tags or filters.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isSales = order.type === 'sales';
                  return (
                    <tr
                      key={order.id}
                      onClick={() => handleOpenDetail(order)}
                      className="hover:bg-[var(--color-surface-container-high)]/40 transition-colors cursor-pointer text-xs"
                    >
                      {/* Order Ref & Date */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[var(--color-on-surface)]">{order.orderNumber}</div>
                        <div className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-[var(--color-on-surface-variant)]" /> {order.date}
                        </div>
                      </td>

                      {/* Type Badge */}
                      {!fixedType && (
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isSales
                                ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20'
                                : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border border-[var(--color-primary)]/20'
                            }`}
                          >
                            {isSales ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                            {isSales ? 'Sales' : 'Purchase'}
                          </span>
                        </td>
                      )}

                      {/* Sales Stage Badge */}
                      {fixedType === 'sales' && (
                        <td className="py-3.5 px-3">
                          {(() => {
                            const stageLabels: Record<string, string> = {
                              quotation: 'Quotation',
                              sales_order: 'Sales Order',
                              proforma_invoice: 'Proforma Invoice',
                              delivery_note: 'Delivery Note',
                              sales_invoice: 'Sales Invoice',
                            };
                            const stageColors: Record<string, string> = {
                              quotation: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]',
                              sales_order: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20',
                              proforma_invoice: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border border-[var(--color-primary)]/20',
                              delivery_note: 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)] border border-[var(--color-tertiary)]/20',
                              sales_invoice: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20',
                            };
                            const stage = order.stage || 'sales_order';
                            return (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  stageColors[stage] || stageColors.sales_order
                                }`}
                              >
                                {stageLabels[stage] || 'Sales Order'}
                              </span>
                            );
                          })()}
                        </td>
                      )}

                      {/* Purchase Stage Badge */}
                      {fixedType === 'purchase' && (
                        <td className="py-3.5 px-3">
                          {(() => {
                            const stage = order.purchaseStage || 'purchase_order';
                            const stageLabels: Record<string, string> = {
                              rfq: 'Stage 1: RFQ',
                              purchase_order: 'Stage 2: PO Confirmed',
                              goods_receipt: 'Stage 3: GRN Received',
                            };
                            const stageColors: Record<string, string> = {
                              rfq: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]',
                              purchase_order: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border border-[var(--color-primary)]/20',
                              goods_receipt: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/20',
                            };
                            return (
                              <div className="flex flex-col gap-1 items-start">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    stageColors[stage] || stageColors.purchase_order
                                  }`}
                                >
                                  {stageLabels[stage] || 'Stage 2: PO'}
                                </span>
                                {order.status !== 'cancelled' && stage !== 'goods_receipt' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEdit(order, e);
                                    }}
                                    className="text-[10px] font-bold text-[var(--color-primary)] hover:underline flex items-center gap-0.5"
                                  >
                                    <span>Advance Stage</span>
                                    <span>→</span>
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      )}

                      {/* Party Name & Linked Settlement Account */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-[var(--color-on-surface)] max-w-[180px] truncate">
                          {order.purchaseStage === 'rfq' && (!order.partyName || order.partyName.includes('Unassigned') || order.partyId === 'unassigned') ? (
                            <span className="italic text-[var(--color-on-surface-variant)] font-semibold">Unassigned (RFQ)</span>
                          ) : (
                            order.partyName
                          )}
                        </div>
                        {order.accountId ? (
                          <div className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold mt-1 flex items-center gap-1.5">
                            <Landmark className="w-3 h-3 text-[var(--color-primary)] shrink-0" />
                            <span className="truncate max-w-[110px]">{order.accountName || 'Linked A/c'}</span>
                            <span className="capitalize text-[9px] bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] px-1.5 py-0.5 rounded font-bold shrink-0">
                              {(order.paymentMode || 'bank_transfer').replace('_', ' ')}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-1">
                            {order.purchaseStage === 'rfq' ? 'RFQ Ingestion' : 'Unsettled Credit'}
                          </div>
                        )}
                      </td>

                      {/* Materials Summary */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-0.5 max-w-[240px]">
                          {order.items.map((i, index) => (
                            <div key={index} className="text-[var(--color-on-surface)] font-medium truncate flex items-center gap-1.5">
                              <span>{i.itemName}</span>
                              <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold">
                                ({i.quantity.toLocaleString('en-IN')} {i.unit})
                              </span>
                              {i.location && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-md bg-[var(--color-surface-container-high)] text-[var(--color-secondary)] truncate max-w-[90px]" title={i.location}>
                                  {i.location}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-3 text-right">
                        {order.purchaseStage === 'rfq' ? (
                          <div>
                            <span className="text-[11px] font-bold text-[var(--color-primary)]">Pending Rate & Tax</span>
                            <span className="block text-[9px] text-[var(--color-on-surface-variant)] font-semibold mt-0.5">
                              Stage 1: RFQ
                            </span>
                          </div>
                        ) : (
                          <div className="font-bold text-[var(--color-on-surface)]">
                            {formatCurrency(order.totalAmount)}
                            <span className="block text-[9px] text-[var(--color-on-surface-variant)] font-semibold mt-0.5">
                              GST ({order.taxRateGst}%) Incl.
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            order.status === 'completed'
                              ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                              : order.status === 'pending'
                              ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                              : order.status === 'partially_delivered'
                              ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                              : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                          }`}
                        >
                          {order.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                          {order.status === 'pending' && <Clock className="w-3 h-3" />}
                          {order.status === 'partially_delivered' && <Layers className="w-3 h-3" />}
                          {order.status === 'cancelled' && <Ban className="w-3 h-3" />}
                          {order.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            title="View Details"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDetail(order);
                            }}
                            className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          <button
                            type="button"
                            title="Edit Order"
                            onClick={(e) => handleOpenEdit(order, e)}
                            className="p-1.5 text-[var(--color-primary)] hover:opacity-80 hover:bg-[var(--color-primary-container)]/30 rounded-full transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            title="Delete Order"
                            onClick={(e) => handleDeleteOrderClick(order, e)}
                            className="p-1.5 text-[var(--color-error)] hover:opacity-80 hover:bg-[var(--color-error-container)]/30 rounded-full transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* --- FORM MODAL FOR CREATE & EDIT --- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                    formType === 'sales' ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]' : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                  }`}
                >
                  {formType === 'sales' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
                    {editingOrder ? `Edit Order: ${formOrderNumber}` : `Book New ${formType === 'sales' ? 'Sales (Outward)' : 'Purchase (Inward)'} Order`}
                  </h3>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                    Registered orders automatically adjust live item balances and log transactions in history.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto p-6 space-y-5">
              {formError && (
                <div className="p-3 rounded-2xl bg-[var(--color-error-container)]/40 border border-[var(--color-error)]/40 flex items-center justify-between text-xs text-[var(--color-error)] font-medium">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                  <button type="button" onClick={() => setFormError(null)} className="p-1 hover:opacity-70">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Core Details Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Order Number</label>
                  <input
                    type="text"
                    required
                    value={formOrderNumber}
                    onChange={(e) => setFormOrderNumber(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Order Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Fulfillment Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as OrderStatus)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <option value="pending">Pending</option>
                    <option value="partially_delivered">Partially Delivered</option>
                    <option value="completed">Completed / Fulfilled</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Party Selection Row */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Select {formType === 'sales' ? 'Customer (Client / Dispatch to)' : 'Vendor (Supplier / Procured from)'}
                </label>
                <select
                  required
                  value={formPartyId}
                  onChange={(e) => setFormPartyId(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="">-- Choose Party --</option>
                  {eligibleParties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.tradeName || p.name} ({p.category}) {p.gstin ? `| GSTIN: ${p.gstin}` : ''}
                    </option>
                  ))}
                </select>
                {eligibleParties.length === 0 && (
                  <p className="text-[10px] text-[var(--color-error)] mt-1 ml-2">
                    No parties found matching the requested type. Please add a relevant party under Party Directory.
                  </p>
                )}
              </div>

              {/* Payment Mode & Cash/Bank Settlement Account (Optional Switch) */}
              <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl transition-colors ${includePayment ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'}`}>
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                        {formType === 'sales' ? 'Payment Settlement & Deposit Account' : 'Payment Disbursement & Source Account'}
                      </h4>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                        {includePayment
                          ? (formType === 'sales' ? 'Deposit received funds directly into a Cash or Bank account' : 'Disburse funds directly from a Cash or Bank account')
                          : 'Book on credit / unpaid ledger (Cash & Bank balances will not be debited or credited)'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                    <span className="text-xs font-bold text-[var(--color-on-surface)]">
                      {includePayment ? 'Settle Payment Now' : 'Book on Credit (Unpaid)'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includePayment}
                      onClick={() => setIncludePayment(!includePayment)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        includePayment ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          includePayment ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {includePayment ? (
                  <div className="space-y-3 pt-1 border-t border-[var(--color-outline-variant)]/60 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Payment Mode Selection */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                          Payment Mode <span className="text-[var(--color-error)] font-bold">*</span>
                        </label>
                        <select
                          required={includePayment}
                          value={formPaymentMode}
                          onChange={(e) => setFormPaymentMode(e.target.value as PaymentMode)}
                          className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        >
                          <option value="bank_transfer">Bank Transfer / IMPS</option>
                          <option value="neft_rtgs">NEFT / RTGS</option>
                          <option value="upi">UPI / QR Code</option>
                          <option value="cheque">Cheque / Demand Draft</option>
                          <option value="cash">Cash Counter / Petty Cash</option>
                        </select>
                      </div>

                      {/* Linked Account Selection */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                          {formType === 'sales' ? 'Deposit To (Account Credited)' : 'Deduct From (Account Debited)'} <span className="text-[var(--color-error)] font-bold">*</span>
                        </label>
                        <select
                          required={includePayment}
                          value={formAccountId}
                          onChange={(e) => setFormAccountId(e.target.value)}
                          className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        >
                          <option value="">-- Choose Cash / Bank Account --</option>
                          {accounts
                            .filter((a) => a.isActive)
                            .map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} [{acc.type === 'bank' ? (acc.bankName || 'Bank A/c') : 'Cash'}] — Bal: {formatCurrency(acc.currentBalance || 0)}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {/* Account Linkage Info Note */}
                    {accounts.length === 0 ? (
                      <div className="p-2.5 rounded-xl bg-[var(--color-error-container)]/40 border border-[var(--color-error)]/30 flex items-center gap-2 text-[11px] text-[var(--color-error)] font-medium">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>No Cash/Bank accounts configured. Please create an account under Cash & Bank to book immediate settlement.</span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)]/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${formType === 'sales' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'}`} />
                          <span>
                            <strong className="text-[var(--color-on-surface)]">Cash Flow Impact:</strong> Order amount of{' '}
                            <strong className={formType === 'sales' ? 'text-[var(--color-success)] font-bold' : 'text-[var(--color-primary)] font-bold'}>
                              {formatCurrency(formCalculations.totalAmount)}
                            </strong>{' '}
                            will be {formType === 'sales' ? 'added to' : 'deducted from'} the selected account balance.
                          </span>
                        </div>
                        {(() => {
                          const chosen = accounts.find((a) => a.id === formAccountId);
                          return chosen ? (
                            <span className="font-bold text-[10px] text-[var(--color-on-surface)] uppercase px-2 py-0.5 rounded-md bg-[var(--color-surface-container-high)] shrink-0">
                              {chosen.type.toUpperCase()}: {chosen.name}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)]/60 flex items-center justify-between text-xs text-[var(--color-on-surface-variant)]">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-outline)]" />
                      <span>This order will be booked on credit without modifying bank/cash balances. Payment can be settled later under Party ledger or Cash & Bank.</span>
                    </span>
                    <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase bg-[var(--color-primary-container)]/50 px-2.5 py-0.5 rounded-full shrink-0">
                      Credit {formType === 'sales' ? 'Sale' : 'Purchase'}
                    </span>
                  </div>
                )}
              </div>

              {/* Sales Document Stage Stepper Pipeline */}
              {formType === 'sales' && (
                <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-[var(--color-primary)]" /> Sales Document Stage
                    </h4>
                    <span className="text-[9px] bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Step-by-Step Flow
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                    Where is this sale currently at? Click the correct step below to generate that document.
                  </p>

                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {[
                      { id: 'quotation', label: '1. Quotation', desc: 'Price Quote', badge: 'Draft' },
                      { id: 'sales_order', label: '2. Sales Order', desc: 'Stock Booked', badge: 'Active' },
                      { id: 'proforma_invoice', label: '3. Proforma', desc: 'Payment Demand', badge: 'Billing' },
                      { id: 'delivery_note', label: '4. Delivery', desc: 'Dispatch slip', badge: 'Transit' },
                      { id: 'sales_invoice', label: '5. Invoice', desc: 'Final GST bill', badge: 'Final' }
                    ].map((step) => {
                      const isActive = formStage === step.id;
                      const index = ['quotation', 'sales_order', 'proforma_invoice', 'delivery_note', 'sales_invoice'].indexOf(step.id);
                      const currentIndex = ['quotation', 'sales_order', 'proforma_invoice', 'delivery_note', 'sales_invoice'].indexOf(formStage);
                      const isCompleted = index < currentIndex;

                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setFormStage(step.id as SalesStage)}
                          className={`p-2.5 rounded-xl text-left border flex flex-col justify-between h-20 transition-all ${
                            isActive
                              ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs scale-102 ring-2 ring-[var(--color-primary)]/15'
                              : isCompleted
                              ? 'bg-[var(--color-primary-container)] border-[var(--color-primary)]/20 text-[var(--color-on-primary-container)]'
                              : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
                          }`}
                        >
                          <div>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                              isActive
                                ? 'bg-white/25 text-white'
                                : isCompleted
                                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]'
                            }`}>
                              {step.badge}
                            </span>
                            <p className="text-[11px] font-black mt-1 leading-none">{step.label}</p>
                          </div>
                          <p className={`text-[8px] ${isActive ? 'text-white/80' : 'text-[var(--color-on-surface-variant)]'} font-semibold truncate w-full`}>
                            {step.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Dynamic Help Text Banner */}
                  <div className="p-2.5 rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)]/60 flex items-center gap-2 text-[10px] text-[var(--color-on-surface-variant)]">
                    {formStage === 'quotation' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[var(--color-outline)] animate-pulse" />
                        <p className="font-semibold">
                          ⚠️ <span className="text-[var(--color-on-surface)] font-bold">Quotation Stage selected:</span> Useful for pitching rates. <span className="text-[var(--color-error)] font-black">No material will be subtracted</span> from live stocks.
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
                        <p className="font-semibold">
                          📦 <span className="text-[var(--color-success)] font-bold">{formStage.replace('_', ' ').toUpperCase()} Stage selected:</span> This is a confirmed transaction. The system <span className="text-[var(--color-success)] font-black">will subtract these material quantities</span> from stock.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Items Table Sub-Form */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-[var(--color-primary)]" /> Material Line Items
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddFormItemRow}
                    className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-primary)] hover:opacity-80 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                </div>

                <div className="border border-[var(--color-outline-variant)] rounded-2xl overflow-hidden bg-[var(--color-surface-container)]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-[10px] uppercase border-b border-[var(--color-outline-variant)]">
                        <th className="py-2.5 px-3">Item / Product</th>
                        <th className="py-2.5 px-3 w-44">{formType === 'sales' ? 'Dispatch Location' : 'Receiving Location'}</th>
                        <th className="py-2.5 px-3 w-28">Quantity</th>
                        <th className="py-2.5 px-3 w-32">Rate ({settings.currency?.symbol || '₹'})</th>
                        <th className="py-2.5 px-3 w-32 text-right">Line Total</th>
                        <th className="py-2.5 px-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
                      {formItems.map((row, idx) => {
                        const selectedProd = productItems.find((p) => p.id === row.itemId);
                        const lineTotal = (Number(row.quantity) || 0) * (Number(row.rate) || 0);

                        // Multi-location options for this product
                        const rawItemLocs = selectedProd?.locations && selectedProd.locations.length > 0
                          ? selectedProd.locations
                          : (selectedProd?.stockLocation
                              ? selectedProd.stockLocation.split(',').map((s) => ({ locationName: s.trim(), currentStock: selectedProd.currentStock || 0 }))
                              : []);
                        const seenRowLocs = new Set<string>();
                        const prodLocations = rawItemLocs.filter((l) => {
                          const n = l.locationName?.trim();
                          if (!n || seenRowLocs.has(n.toLowerCase())) return false;
                          seenRowLocs.add(n.toLowerCase());
                          return true;
                        });

                        const matchedLocStock = prodLocations.find(
                          (l) => l.locationName.toLowerCase().trim() === row.location.toLowerCase().trim()
                        );
                        const currentLocStock = matchedLocStock ? Number(matchedLocStock.currentStock || 0) : (selectedProd?.currentStock || 0);
                        const isStockInsufficient = formType === 'sales' && selectedProd && Number(row.quantity) > currentLocStock;

                        return (
                          <tr key={idx} className="bg-[var(--color-surface-container-lowest)]">
                            {/* Material selection */}
                            <td className="py-2 px-3">
                              <select
                                required
                                value={row.itemId}
                                onChange={(e) => handleFormItemChange(idx, 'itemId', e.target.value)}
                                className="w-full bg-transparent text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                              >
                                <option value="">-- Choose Item --</option>
                                {productItems.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} [{p.code}] (Total Stock: {p.currentStock || 0} {p.unit})
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Location selection */}
                            <td className="py-2 px-3">
                              {!selectedProd ? (
                                <select
                                  disabled
                                  value=""
                                  className="w-full bg-transparent text-xs font-medium text-[var(--color-outline)] cursor-not-allowed focus:outline-none"
                                >
                                  <option value="">-- Select Item First --</option>
                                </select>
                              ) : prodLocations.length === 1 ? (
                                <select
                                  value={prodLocations[0].locationName}
                                  onChange={(e) => handleFormItemChange(idx, 'location', e.target.value)}
                                  className="w-full bg-transparent text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                                >
                                  <option value={prodLocations[0].locationName}>
                                    {prodLocations[0].locationName} ({formType === 'sales' ? 'Avail' : 'Stock'}: {prodLocations[0].currentStock ?? 0} {selectedProd.unit})
                                  </option>
                                </select>
                              ) : prodLocations.length > 1 ? (
                                <select
                                  value={row.location || prodLocations[0].locationName}
                                  onChange={(e) => handleFormItemChange(idx, 'location', e.target.value)}
                                  className="w-full bg-transparent text-xs font-semibold text-[var(--color-on-surface)] focus:outline-none"
                                >
                                  {prodLocations.map((loc, lIdx) => (
                                    <option key={lIdx} value={loc.locationName}>
                                      {loc.locationName} ({formType === 'sales' ? 'Avail' : 'Stock'}: {loc.currentStock ?? 0} {selectedProd.unit})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <select
                                  disabled
                                  value=""
                                  className="w-full bg-transparent text-xs font-medium text-[var(--color-outline)] cursor-not-allowed focus:outline-none"
                                >
                                  <option value="">No location added</option>
                                </select>
                              )}
                              {isStockInsufficient && (
                                <p className="text-[10px] text-[var(--color-error)] font-bold mt-0.5">
                                  ⚠️ Stock at {row.location || 'yard'} ({currentLocStock} {selectedProd?.unit}) is less than order qty
                                </p>
                              )}
                            </td>

                            {/* Quantity */}
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  required
                                  placeholder="0"
                                  value={row.quantity}
                                  onChange={(e) => handleFormItemChange(idx, 'quantity', e.target.value)}
                                  className="w-full bg-transparent border-b border-transparent focus:border-[var(--color-primary)] text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                                />
                                {selectedProd && <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">{selectedProd.unit}</span>}
                              </div>
                            </td>

                            {/* Rate */}
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="any"
                                required
                                placeholder="0.00"
                                value={row.rate}
                                onChange={(e) => handleFormItemChange(idx, 'rate', e.target.value)}
                                className="w-full bg-transparent border-b border-transparent focus:border-[var(--color-primary)] text-xs font-bold text-[var(--color-on-surface)] focus:outline-none"
                              />
                            </td>

                            {/* Line Total */}
                            <td className="py-2 px-3 text-right text-xs font-bold text-[var(--color-on-surface)]">
                              {formatCurrency(lineTotal)}
                            </td>

                            {/* Remove Row Button */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                disabled={formItems.length === 1}
                                onClick={() => handleRemoveFormItemRow(idx)}
                                className="p-1 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 disabled:opacity-30 rounded-full transition-colors"
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

              {/* Transport & Logistics Section (Optional Switch for Sales) */}
              {formType === 'sales' && (
                <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl transition-colors ${includeLogistics ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'}`}>
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                          Transportation & Dispatch Logistics
                        </h4>
                        <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                          {includeLogistics
                            ? 'Assign registered driver, fleet vehicle, and freight charges to adjust invoice totals'
                            : 'No logistics assigned (direct yard pickup / contractor transport)'}
                        </p>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                      <span className="text-xs font-bold text-[var(--color-on-surface)]">
                        {includeLogistics ? 'Logistics Added' : 'No Transport'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={includeLogistics}
                        onClick={() => {
                          const next = !includeLogistics;
                          setIncludeLogistics(next);
                          if (!next) {
                            setFormTransportCharges('0');
                            setFormVehicleNo('');
                            setFormDriverName('');
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          includeLogistics ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            includeLogistics ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>
                  </div>

                  {includeLogistics && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-[var(--color-outline-variant)]/60 animate-in fade-in duration-200">
                      {/* Vehicle */}
                      <div className="bg-[var(--color-surface-container-lowest)] p-3 rounded-xl border border-[var(--color-outline-variant)]/60 space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">Select Registered Fleet Vehicle</label>
                          <select
                            value={registeredVehicles.some(v => v.vehicleNo === formVehicleNo) ? formVehicleNo : ''}
                            onChange={(e) => {
                              const selectedPlate = e.target.value;
                              setFormVehicleNo(selectedPlate);
                              const matchedVeh = registeredVehicles.find(v => v.vehicleNo === selectedPlate);
                              if (matchedVeh && matchedVeh.currentDriverName) {
                                setFormDriverName(matchedVeh.currentDriverName);
                              }
                            }}
                            className="w-full px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          >
                            <option value="">-- Choose Fleet Vehicle --</option>
                            {registeredVehicles.map(v => (
                              <option key={v.id} value={v.vehicleNo}>{v.vehicleNo} [{v.type.toUpperCase()}] ({v.status})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">Or Custom / Market Vehicle Plate No</label>
                          <input
                            type="text"
                            placeholder="e.g. MH-12-PQ-9876"
                            value={formVehicleNo}
                            onChange={(e) => setFormVehicleNo(e.target.value.toUpperCase())}
                            className="w-full px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          />
                        </div>
                      </div>

                      {/* Driver & Charges */}
                      <div className="bg-[var(--color-surface-container-lowest)] p-3 rounded-xl border border-[var(--color-outline-variant)]/60 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">Fleet Driver</label>
                            <select
                              value={registeredDrivers.some(d => d.name === formDriverName) ? formDriverName : ''}
                              onChange={(e) => setFormDriverName(e.target.value)}
                              className="w-full px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                            >
                              <option value="">-- Fleet Driver --</option>
                              {registeredDrivers.map(d => (
                                <option key={d.id} value={d.name}>{d.name} ({d.status})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">Custom Driver</label>
                            <input
                              type="text"
                              placeholder="Driver Name"
                              value={formDriverName}
                              onChange={(e) => setFormDriverName(e.target.value)}
                              className="w-full px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-medium text-[var(--color-on-surface)] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">Transport / Freight Charges ({settings.currency?.symbol || '₹'})</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={formTransportCharges}
                            onChange={(e) => setFormTransportCharges(e.target.value)}
                            className="w-full px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Taxation and Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Notes & Transport Details</label>
                  <textarea
                    rows={4}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Tipper driver details, delivery instructions, loading parameters..."
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-2 text-xs">
                  <div className="flex justify-between font-medium text-[var(--color-on-surface-variant)]">
                    <span>Material Subtotal:</span>
                    <span className="font-bold text-[var(--color-on-surface)]">{formatCurrency(formCalculations.subtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-4 font-medium text-[var(--color-on-surface-variant)]">
                    <span className="flex items-center gap-1">
                      <Percent className="w-3 h-3" /> GST Slab Rate:
                    </span>
                    <select
                      value={formTaxRate}
                      onChange={(e) => setFormTaxRate(e.target.value)}
                      className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] px-2 py-0.5 focus:outline-none"
                    >
                      <option value="0">0% (GST Exempt)</option>
                      <option value="5">5% (Transportation / Raw GSB)</option>
                      <option value="12">12% (Machinery / Consumables)</option>
                      <option value="18">18% (Standard Hot Asphalt / Bitumen)</option>
                      <option value="28">28% (Luxury / Spares)</option>
                      {!['0', '5', '12', '18', '28'].includes(String(formTaxRate)) && (
                        <option value={formTaxRate}>{formTaxRate}% (Item Default Slab)</option>
                      )}
                    </select>
                  </div>

                  <div className="flex justify-between font-medium text-[var(--color-on-surface-variant)]">
                    <span>GST Tax Amount ({formTaxRate}%):</span>
                    <span className="font-bold text-[var(--color-on-surface)]">{formatCurrency(formCalculations.taxAmount)}</span>
                  </div>

                  <div className="h-px bg-[var(--color-outline-variant)] my-2" />

                  <div className="flex justify-between items-center text-sm font-black text-[var(--color-on-surface)]">
                    <span>Grand Total:</span>
                    <span className="text-[var(--color-primary)] text-base">{formatCurrency(formCalculations.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Error/Notice */}
              {formType === 'sales' && (
                <div className="p-3.5 bg-[var(--color-warning-container)]/30 border border-[var(--color-warning)]/30 rounded-2xl text-[11px] text-[var(--color-on-warning-container)] flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Stock Deduction Pre-warning:</span> When saved as Pending/Completed state, the system will deduct this sales order's quantities from your live stockpiles immediately.
                  </div>
                </div>
              )}
              {formType === 'purchase' && (
                <div className="p-3.5 bg-[var(--color-success-container)]/30 border border-[var(--color-success)]/30 rounded-2xl text-[11px] text-[var(--color-on-success-container)] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Stock Inward notice:</span> Completing or saving this purchase order will increase the live silo/tank balances of the designated materials instantly.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2.5 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-high)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-90 transition-all shadow-xs"
                >
                  {editingOrder ? 'Save Changes' : 'Confirm Order Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ORDER DETAIL VIEW MODAL --- */}
      {isDetailOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mb-1 ${
                    selectedOrder.type === 'sales'
                      ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                      : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                  }`}
                >
                  {selectedOrder.type === 'sales' ? 'Sales / Dispatch Order' : 'Purchase / Inward Order'}
                </span>
                <h3 className="text-base font-black text-[var(--color-on-surface)]">{selectedOrder.orderNumber}</h3>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Booked on {selectedOrder.date}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Sales Document Stage & Live Printer Control */}
              {selectedOrder.type === 'sales' && (
                <div className="bg-[var(--color-surface-container)] p-4.5 rounded-2xl border border-[var(--color-outline-variant)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-[var(--color-on-surface-variant)] tracking-wider flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-[var(--color-primary)]" /> Sales Document Stage Pipeline
                    </span>
                    <span className="text-[9px] font-extrabold text-[var(--color-on-primary-container)] bg-[var(--color-primary-container)] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Interactive Stepper
                    </span>
                  </div>

                  {/* Micro Stepper Flow */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { id: 'quotation', label: '1. Quote', color: 'bg-[var(--color-outline)]', desc: 'No inventory impact' },
                      { id: 'sales_order', label: '2. Order', color: 'bg-[var(--color-success)]', desc: 'Stock deducted' },
                      { id: 'proforma_invoice', label: '3. Proforma', color: 'bg-[var(--color-primary)]', desc: 'Advance bill' },
                      { id: 'delivery_note', label: '4. Challan', color: 'bg-[var(--color-warning)]', desc: 'Truck gate pass' },
                      { id: 'sales_invoice', label: '5. Invoice', color: 'bg-[var(--color-success)]', desc: 'Final tax invoice' },
                    ].map((step) => {
                      const isCurrent = (selectedOrder.stage || 'sales_order') === step.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => {
                            const updated = onUpdateOrder(selectedOrder.id, { stage: step.id as SalesStage });
                            setSelectedOrder(updated);
                          }}
                          className={`py-2 px-1 rounded-xl text-center border text-[10px] font-bold transition-all ${
                            isCurrent
                              ? 'bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] border-[var(--color-primary)] shadow-xs ring-2 ring-[var(--color-primary)]/15 scale-102 font-extrabold'
                              : 'bg-transparent text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)]'
                          }`}
                          title={`${step.label}: ${step.desc}`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full mx-auto mb-1 ${step.color} ${isCurrent ? 'animate-pulse scale-125' : ''}`} />
                          {step.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Document Generation Action Box */}
                  <div className="bg-[var(--color-surface-container-lowest)] p-3 rounded-xl border border-[var(--color-outline-variant)]/60 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2.5 text-left">
                      <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-container)] flex items-center justify-center text-[var(--color-on-primary-container)] shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-[var(--color-on-surface)]">
                          {(() => {
                            const labels: Record<string, string> = {
                              quotation: 'Sales Quotation Document',
                              sales_order: 'Sales Order Confirmation',
                              proforma_invoice: 'Proforma Commercial Invoice',
                              delivery_note: 'Delivery Challan / Loading Note',
                              sales_invoice: 'Official GST Tax Invoice',
                            };
                            return labels[selectedOrder.stage || 'sales_order'] || 'Sales Order Confirmation';
                          })()}
                        </p>
                        <p className="text-[9px] text-[var(--color-on-surface-variant)]">
                          {selectedOrder.stage === 'quotation'
                            ? 'Draft rate offer pitch. (Note: Stockyard materials are NOT deducted.)'
                            : 'Official order stage document. (Note: Stockyard materials ARE deducted.)'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPreviewOrder(selectedOrder);
                        setPreviewStage(selectedOrder.stage || 'sales_order');
                        setIsPreviewOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-xs shrink-0"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Document
                    </button>
                  </div>
                </div>
              )}

              {/* Purchase 3-Stage Stepper & Document Box */}
              {selectedOrder.type === 'purchase' && (
                <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3 shadow-xs">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-black text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                        <ClipboardList className="w-4 h-4 text-[var(--color-primary)]" />
                        <span>Procurement Workflow & Documentation</span>
                      </h4>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                        RFQ → Purchase Order → Goods Receipt (GRN) with shortage audit
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedOrder.status !== 'cancelled' && selectedOrder.purchaseStage !== 'goods_receipt' && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPurchaseOrder(selectedOrder);
                            setIsPurchaseModalOpen(true);
                            setIsDetailOpen(false);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-xs"
                        >
                          <span>Advance Stage</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setPreviewOrder(selectedOrder);
                          setPreviewStage('sales_order');
                          setIsPreviewOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold hover:bg-[var(--color-surface-container-highest)] transition-all shadow-xs"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Document</span>
                      </button>
                    </div>
                  </div>

                  {/* 3-Stage horizontal badge view */}
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div
                      className={`p-2 rounded-xl border ${
                        selectedOrder.purchaseStage === 'rfq'
                          ? 'bg-[var(--color-surface-container-lowest)] border-[var(--color-primary)] text-[var(--color-primary)] font-black'
                          : 'bg-[var(--color-surface-container-low)] border-[var(--color-outline-variant)]/60 text-[var(--color-on-surface-variant)] font-semibold'
                      }`}
                    >
                      <p className="font-bold">1. RFQ</p>
                      <p className="text-[9px] mt-0.5 opacity-80">{selectedOrder.rfqDetails?.rfqNumber || 'Completed'}</p>
                    </div>

                    <div
                      className={`p-2 rounded-xl border ${
                        selectedOrder.purchaseStage === 'purchase_order'
                          ? 'bg-[var(--color-surface-container-lowest)] border-[var(--color-primary)] text-[var(--color-primary)] font-black'
                          : selectedOrder.purchaseStage === 'goods_receipt'
                          ? 'bg-[var(--color-surface-container-low)] border-[var(--color-outline-variant)]/60 text-[var(--color-on-surface-variant)] font-semibold'
                          : 'bg-[var(--color-surface-container-low)]/50 border-dashed border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]/60'
                      }`}
                    >
                      <p className="font-bold">2. PO Confirmed</p>
                      <p className="text-[9px] mt-0.5 opacity-80">{selectedOrder.poDetails?.poNumber || selectedOrder.orderNumber}</p>
                    </div>

                    <div
                      className={`p-2 rounded-xl border ${
                        selectedOrder.purchaseStage === 'goods_receipt'
                          ? 'bg-[var(--color-success-container)] border-[var(--color-success)] text-[var(--color-on-success-container)] font-black'
                          : 'bg-[var(--color-surface-container-low)]/50 border-dashed border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]/60'
                      }`}
                    >
                      <p className="font-bold">3. Goods Receipt</p>
                      <p className="text-[9px] mt-0.5 opacity-80">{selectedOrder.receiptDetails?.grnNumber || 'Pending Gate Inward'}</p>
                    </div>
                  </div>

                  {/* Stage-specific doc highlights */}
                  {selectedOrder.receiptDetails && selectedOrder.purchaseStage === 'goods_receipt' && (
                    <div className="p-2.5 rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] text-[10px] space-y-1">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--color-on-surface-variant)]">
                        {selectedOrder.receiptDetails.grnNumber && <span>GRN: <strong className="text-[var(--color-on-surface)]">{selectedOrder.receiptDetails.grnNumber}</strong></span>}
                        {selectedOrder.receiptDetails.receiptDate && <span>Inward: <strong className="text-[var(--color-on-surface)]">{selectedOrder.receiptDetails.receiptDate}</strong></span>}
                        {selectedOrder.receiptDetails.challanNumber && <span>Challan: <strong className="text-[var(--color-on-surface)]">{selectedOrder.receiptDetails.challanNumber}</strong></span>}
                        {selectedOrder.receiptDetails.vendorInvoiceNumber && <span>Vendor Inv: <strong className="text-[var(--color-on-surface)]">{selectedOrder.receiptDetails.vendorInvoiceNumber}</strong></span>}
                        {selectedOrder.receiptDetails.receivedBy && <span>Inspector: <strong className="text-[var(--color-on-surface)]">{selectedOrder.receiptDetails.receivedBy}</strong></span>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Party Information & Payment Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface-variant)] flex items-center justify-center border border-[var(--color-outline-variant)] shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Party Details</h4>
                    <p className="text-xs font-bold text-[var(--color-on-surface)] mt-0.5">{selectedOrder.partyName}</p>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Database reference: {selectedOrder.partyId}</p>
                  </div>
                </div>

                <div className="p-4 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] flex items-center justify-center border border-[var(--color-outline-variant)] shrink-0">
                    <Landmark className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                      {selectedOrder.type === 'sales' ? 'Credited Settlement Account' : 'Debited Source Account'}
                    </h4>
                    <p className="text-xs font-bold text-[var(--color-on-surface)] mt-0.5">{selectedOrder.accountName || 'Primary Cash/Bank A/c'}</p>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5 capitalize font-medium">
                      Mode: {(selectedOrder.paymentMode || 'bank_transfer').replace('_', ' ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">Material Details</h4>
                <div className="border border-[var(--color-outline-variant)] rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold border-b border-[var(--color-outline-variant)]">
                        <th className="py-2 px-3">Item Name</th>
                        <th className="py-2 px-3">{selectedOrder.type === 'sales' ? 'Dispatch Location' : 'Inward Location'}</th>
                        <th className="py-2 px-3 text-right">
                          {selectedOrder.type === 'purchase' && selectedOrder.purchaseStage === 'goods_receipt' ? 'Ordered / Received' : 'Qty'}
                        </th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
                      {selectedOrder.items.map((i, index) => (
                        <tr key={index} className="bg-[var(--color-surface-container-lowest)]">
                          <td className="py-2.5 px-3 font-semibold text-[var(--color-on-surface)]">{i.itemName}</td>
                          <td className="py-2.5 px-3">
                            {i.location ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]">
                                {i.location}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--color-on-surface-variant)] italic">Default Yard</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[var(--color-on-surface)]">
                            <div>{i.quantity.toLocaleString('en-IN')} {i.unit}</div>
                            {selectedOrder.type === 'purchase' && i.receivedQuantity !== undefined && (
                              <div className="text-[9px] font-semibold mt-0.5">
                                <span className="text-[var(--color-primary)]">Recv: {i.receivedQuantity} {i.unit}</span>
                                {i.shortageQuantity ? (
                                  <span className="ml-1 text-[var(--color-error)]">(Shortage: -{i.shortageQuantity})</span>
                                ) : i.overageQuantity ? (
                                  <span className="ml-1 text-[var(--color-success)]">(Overage: +{i.overageQuantity})</span>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-[var(--color-on-surface-variant)]">
                            {formatCurrency(i.rate)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[var(--color-on-surface)]">
                            {formatCurrency(i.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial calculations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-xs text-[var(--color-on-surface-variant)]">
                  <div>
                    <strong className="text-[var(--color-on-surface)]">Notes / Instructions:</strong>
                    <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-1 bg-[var(--color-surface-container-lowest)] p-2.5 rounded-xl border border-[var(--color-outline-variant)] italic leading-relaxed">
                      {selectedOrder.notes || 'No custom remarks recorded.'}
                    </p>
                  </div>
                </div>

                <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-2 text-xs">
                  <div className="flex justify-between text-[var(--color-on-surface-variant)]">
                    <span>Taxable Value:</span>
                    <span className="font-bold text-[var(--color-on-surface)]">
                      {formatCurrency(selectedOrder.totalAmount - selectedOrder.taxAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[var(--color-on-surface-variant)]">
                    <span>GST ({selectedOrder.taxRateGst}%):</span>
                    <span className="font-bold text-[var(--color-on-surface)]">{formatCurrency(selectedOrder.taxAmount)}</span>
                  </div>
                  <div className="h-px bg-[var(--color-outline-variant)] my-1" />
                  <div className="flex justify-between text-sm font-black text-[var(--color-on-surface)]">
                    <span>Grand Total:</span>
                    <span className="text-[var(--color-primary)]">{formatCurrency(selectedOrder.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] items-center mt-2 pt-1 border-t border-[var(--color-outline-variant)]/60 text-[var(--color-on-surface-variant)]">
                    <span>Fulfillment Status:</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        selectedOrder.status === 'completed'
                          ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                          : selectedOrder.status === 'pending'
                          ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                          : selectedOrder.status === 'partially_delivered'
                          ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                          : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                      }`}
                    >
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={(e) => handleDeleteOrderClick(selectedOrder, e)}
                  className="flex items-center gap-1 px-4 py-2 border border-[var(--color-error)] text-[var(--color-error)] rounded-full text-xs font-semibold hover:bg-[var(--color-error-container)]/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete Order
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDetailOpen(false)}
                    className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      setIsDetailOpen(false);
                      handleOpenEdit(selectedOrder, e);
                    }}
                    className="flex items-center gap-1 px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-90 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- COMMERCIAL DOCUMENT PREVIEW MODAL --- */}
      {isPreviewOpen && previewOrder && (
        <div id="printable-document-content-parent" className="fixed inset-0 z-50 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--color-surface)] rounded-3xl w-full max-w-4xl shadow-2xl border border-[var(--color-outline-variant)] flex flex-col my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Top Bar (Non-Printable) */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)] print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[var(--color-primary)]" />
                <div className="text-left">
                  <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Commercial Document Viewer</h3>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)]">Review details, export as PDF, or print directly using thermal or laser printers.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Area */}
            <div className="p-8 sm:p-12 bg-white text-[#1a1a1a] overflow-x-auto print:p-0" id="printable-document-content">
              {/* CSS Print Rules embedded inside */}
              <style>{`
                @media print {
                  body > :not(#printable-document-content-parent) {
                    display: none !important;
                  }
                  #printable-document-content {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    padding: 0 !important;
                    margin: 0 !important;
                  }
                }
              `}</style>

              {/* Company Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-double border-[#44474e] pb-6 gap-6">
                <div className="space-y-1 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-[#005ac1] text-white font-black rounded flex items-center justify-center text-sm">A</div>
                    <span className="text-lg font-black tracking-tight text-[#1c1b1f]">{settings.companyName || 'APEX ASPHALT INDUSTRIES'}</span>
                  </div>
                  <p className="text-[10px] text-[#44474e] uppercase tracking-widest font-extrabold">{settings.tagline || 'Highways, Runways & Civil Road Infrastructure'}</p>
                  <p className="text-[10px] text-[#74777f] max-w-sm font-semibold leading-relaxed">
                    {settings.registeredAddress 
                      ? `${settings.registeredAddress.street}, ${settings.registeredAddress.city}, ${settings.registeredAddress.state} - ${settings.registeredAddress.pincode}`
                      : 'Plant Yard A, Gate No. 4, Midc Industrial Area, Pune, MH 411013'}
                  </p>
                  <p className="text-[10px] text-[#74777f] font-semibold">
                    Contact: {settings.phone || '+91 98765 43210'} | Email: {settings.email || 'billing@apexroads.com'}
                  </p>
                  <p className="text-[10px] text-[#1c1b1f] font-extrabold uppercase">
                    GSTIN: <span className="font-mono">{settings.gstin || '27AAACA1234A1Z5'}</span>
                  </p>
                </div>

                {/* Right Document Label block */}
                <div className="text-right space-y-1.5 min-w-[200px]">
                  {(() => {
                    const isPurchase = previewOrder.type === 'purchase';
                    const docTitles: Record<string, string> = {
                      quotation: 'COMMERCIAL QUOTATION',
                      sales_order: 'SALES ORDER CONFIRMATION',
                      proforma_invoice: 'PROFORMA INVOICE',
                      delivery_note: 'DELIVERY CHALLAN / NOTE',
                      sales_invoice: 'TAX INVOICE',
                    };
                    const docColors: Record<string, string> = {
                      quotation: 'bg-[#74777f] text-white',
                      sales_order: 'bg-[#386a20] text-white',
                      proforma_invoice: 'bg-[#005ac1] text-white',
                      delivery_note: 'bg-[#8c5000] text-white',
                      sales_invoice: 'bg-[#2e7d32] text-white',
                    };
                    const title = isPurchase
                      ? previewOrder.purchaseStage === 'rfq'
                        ? 'REQUEST FOR QUOTATION (RFQ)'
                        : previewOrder.purchaseStage === 'goods_receipt'
                        ? 'GOODS RECEIPT NOTE (GRN)'
                        : 'PURCHASE ORDER (PO)'
                      : (docTitles[previewStage] || 'SALES ORDER');
                    const colorClass = isPurchase
                      ? previewOrder.purchaseStage === 'rfq'
                        ? 'bg-[#5c5b62] text-white'
                        : previewOrder.purchaseStage === 'goods_receipt'
                        ? 'bg-[#2e7d32] text-white'
                        : 'bg-[#005ac1] text-white'
                      : (docColors[previewStage] || 'bg-[#386a20] text-white');
                    
                    return (
                      <div className={`px-4 py-2 rounded-xl font-black text-xs uppercase text-center tracking-widest ${colorClass}`}>
                        {title}
                      </div>
                    );
                  })()}
                  <div className="text-[10px] text-right space-y-1 font-semibold text-[#44474e] pt-1">
                    <div>Doc Ref: <span className="font-mono font-bold text-[#1c1b1f]">
                      {(() => {
                        if (previewOrder.type === 'purchase') {
                          if (previewOrder.purchaseStage === 'rfq' && previewOrder.rfqDetails?.rfqNumber) {
                            return previewOrder.rfqDetails.rfqNumber;
                          }
                          if (previewOrder.purchaseStage === 'goods_receipt' && previewOrder.receiptDetails?.grnNumber) {
                            return previewOrder.receiptDetails.grnNumber;
                          }
                          return previewOrder.poDetails?.poNumber || previewOrder.orderNumber;
                        }
                        const prefixes: Record<string, string> = {
                          quotation: 'QT',
                          sales_order: 'SO',
                          proforma_invoice: 'PI',
                          delivery_note: 'DC',
                          sales_invoice: 'INV',
                        };
                        const pre = prefixes[previewStage] || 'SO';
                        const rawNum = previewOrder.orderNumber;
                        return rawNum.replace(/^(SO|PO)/, pre);
                      })()}
                    </span></div>
                    <div>Date: <span className="font-bold text-[#1c1b1f]">{previewOrder.date}</span></div>
                    <div>PO / RFQ Ref: <span className="font-mono font-bold text-[#1c1b1f]">{previewOrder.orderNumber}</span></div>
                    <div>State / Supply: <span className="font-bold text-[#1c1b1f]">{settings.registeredAddress?.state || 'Maharashtra (MH)'}</span></div>
                  </div>
                </div>
              </div>

              {/* Party Information (Billing/Shipping) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-6 text-xs text-left">
                <div className="space-y-1.5 border-r border-[#e1e2ec] pr-4">
                  <h4 className="font-black text-[#44474e] uppercase tracking-wider text-[10px]">Recipient (Buyer Details)</h4>
                  <div>
                    <p className="font-black text-sm text-[#1c1b1f]">{previewOrder.partyName}</p>
                    {(() => {
                      const party = parties.find(p => p.id === previewOrder.partyId);
                      return party ? (
                        <div className="text-[10px] text-[#44474e] space-y-0.5 mt-1 font-medium text-left">
                          {party.tradeName && <p className="font-bold text-[#1c1b1f]">T/A: {party.tradeName}</p>}
                          <p className="leading-relaxed text-left">
                            {party.address 
                              ? `${party.address.street}, ${party.address.city}, ${party.address.state} - ${party.address.pincode}`
                              : 'No billing address provided in directory.'}
                          </p>
                          {party.gstin && <p className="font-bold text-[#1c1b1f] mt-1">GSTIN: <span className="font-mono">{party.gstin}</span></p>}
                          {party.phone && <p>Phone: {party.phone}</p>}
                          {party.email && <p>Email: {party.email}</p>}
                        </div>
                      ) : (
                        <p className="text-[10px] text-[#74777f]">Registered customer database index: {previewOrder.partyId}</p>
                      );
                    })()}
                  </div>
                </div>

                <div className="space-y-1.5 pl-0 sm:pl-4 text-left">
                  <h4 className="font-black text-[#44474e] uppercase tracking-wider text-[10px]">Logistics & Delivery Site</h4>
                  <div className="text-[10px] text-[#44474e] space-y-1 font-medium text-left">
                    <div className="text-left">
                      <span className="font-bold text-[#1c1b1f]">Unloading Site / Destination:</span>
                      <p className="mt-0.5 leading-relaxed text-[#1c1b1f] text-left">
                        {linkedTripSlip?.destination || (previewOrder.notes?.toLowerCase().includes('site') 
                          ? previewOrder.notes 
                          : 'As per approved designated highway job-site.')}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-[#e1e2ec]/40 mt-1 text-left">
                      <span className="font-bold text-[#1c1b1f]">Dispatch Transport Fleet:</span>
                      <div className="mt-1 space-y-0.5 text-[#1c1b1f] font-semibold text-left">
                        <p className="text-left">Vehicle No: <span className="font-mono text-xs font-black bg-[var(--color-surface-container)] px-1.5 py-0.5 rounded border border-[var(--color-outline-variant)] text-[var(--color-on-surface)]">{previewOrder.vehicleNo || linkedTripSlip?.vehicleNo || 'Multi-axle Tipper / Yard Fleet'}</span></p>
                        <p className="text-left">Driver Assigned: <span className="font-bold">{previewOrder.driverName || linkedTripSlip?.driverName || 'Regular Operations Carrier'}</span></p>
                        {linkedTripSlip && (
                          <p className="text-[9px] text-[#2e7d32] font-black flex items-center gap-1 mt-1 text-left">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                            Linked Active Trip Slip: {linkedTripSlip.slipNumber} ({linkedTripSlip.status.toUpperCase()})
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-[#e1e2ec]/40 mt-1 text-left">
                      <span className="font-bold text-[#1c1b1f]">Settlement Account & Payment:</span>
                      <div className="mt-1 space-y-0.5 text-[#1c1b1f] font-semibold text-left">
                        <p className="text-left">Account: <span className="font-bold">{previewOrder.accountName || 'Primary Cash/Bank A/c'}</span></p>
                        <p className="text-left">Payment Mode: <span className="capitalize font-bold">{(previewOrder.paymentMode || 'bank_transfer').replace('_', ' ')}</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Materials Table Grid */}
              <div className="border border-[#1c1b1f] rounded-lg overflow-hidden mt-2">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#f3f3fa] text-[#1c1b1f] font-black border-b border-[#1c1b1f] text-[10px] uppercase">
                      <th className="py-2.5 px-3 border-r border-[#e1e2ec] w-12 text-center">S.No</th>
                      <th className="py-2.5 px-3 border-r border-[#e1e2ec]">Item Description & HSN Code</th>
                      <th className="py-2.5 px-3 border-r border-[#e1e2ec] text-right w-24">Qty (MT/Nos)</th>
                      <th className="py-2.5 px-3 border-r border-[#e1e2ec] text-right w-28">Rate ({settings.currency?.symbol || '₹'})</th>
                      <th className="py-2.5 px-3 text-right w-32">Line Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e1e2ec]">
                    {previewOrder.items.map((item, idx) => (
                      <tr key={idx} className="bg-white font-medium text-[11px] text-[#1c1b1f]">
                        <td className="py-3 px-3 border-r border-[#e1e2ec] text-center">{idx + 1}</td>
                        <td className="py-3 px-3 border-r border-[#e1e2ec]">
                          <p className="font-bold text-[#1c1b1f]">{item.itemName}</p>
                          {item.location && (
                            <p className="text-[10px] font-semibold text-[#006a6a] mt-0.5">
                              {previewOrder.type === 'sales' ? 'Dispatch Location:' : 'Inward Location:'} {item.location}
                            </p>
                          )}
                          {(() => {
                            const originalItem = items.find(it => it.id === item.itemId);
                            return originalItem?.hsnSacCode ? (
                              <p className="text-[9px] text-[#74777f] mt-0.5">HSN Code: <span className="font-mono font-bold">{originalItem.hsnSacCode}</span></p>
                            ) : (
                              <p className="text-[9px] text-[#74777f] mt-0.5">HSN Code: <span className="font-mono font-bold">38241000</span></p>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-3 border-r border-[#e1e2ec] text-right font-bold">
                          {item.quantity.toLocaleString('en-IN')} {item.unit}
                        </td>
                        <td className="py-3 px-3 border-r border-[#e1e2ec] text-right font-bold text-[#44474e]">
                          {formatCurrency(item.rate)}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#1c1b1f]">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Calculations Block */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-6">
                {/* Terms and words */}
                <div className="text-left space-y-4">
                  <div className="bg-[#f3f3fa]/50 p-3 rounded-xl border border-[#e1e2ec] text-[10px] space-y-1 text-[#44474e]">
                    <span className="font-black text-[#1c1b1f] uppercase tracking-wider text-[9px] block mb-1">Standard Terms & Declarations</span>
                    {previewOrder.type === 'purchase' ? (
                      <ul className="list-disc pl-3 space-y-1 font-semibold leading-relaxed text-left">
                        <li>Materials must strictly conform to approved Marshall Mix Design JMF standards.</li>
                        <li>Aggregates should be washed, graded, and stored under safe dry conditions.</li>
                        <li>Payments processed within standard credit framework terms of agreement.</li>
                      </ul>
                    ) : (
                      <>
                        {previewStage === 'quotation' && (
                          <ul className="list-disc pl-3 space-y-1 font-semibold leading-relaxed text-left">
                            <li>Rates are valid for exactly 30 calendar days from document date.</li>
                            <li>Material loading is subject to raw bitumen supply index allocations.</li>
                            <li>Payment terms: 50% advance along with confirmed schedule dispatch request.</li>
                          </ul>
                        )}
                        {previewStage === 'sales_order' && (
                          <ul className="list-disc pl-3 space-y-1 font-semibold leading-relaxed text-left">
                            <li>Approved Sales Order reservation. Stockyards have committed designated silos.</li>
                            <li>Site inspection team must verify grade criteria prior to tipper dispatches.</li>
                            <li>Transit weight losses up to 0.5% accepted under normal loading tolerances.</li>
                          </ul>
                        )}
                        {previewStage === 'proforma_invoice' && (
                          <ul className="list-disc pl-3 space-y-1 font-semibold leading-relaxed text-left">
                            <li>This is a Proforma Advance Demand Note only, not a legal Tax Invoice.</li>
                            <li>Deliveries will commence immediately after receipt of banking credits.</li>
                            <li>Please quote this PI number on bank transaction remarks for rapid tracking.</li>
                          </ul>
                        )}
                        {previewStage === 'delivery_note' && (
                          <ul className="list-disc pl-3 space-y-1 font-semibold leading-relaxed text-left">
                            <li>Material received in sound condition. Subject to site weighbridge tolerances.</li>
                            <li>Tipper truck driver must return signed copy of this gate challan on slip.</li>
                            <li>Maintain mix layout temperature above 135°C for standard asphalt laying.</li>
                          </ul>
                        )}
                        {previewStage === 'sales_invoice' && (
                          <ul className="list-disc pl-3 space-y-1 font-semibold leading-relaxed text-left">
                            <li>Goods once dispatched/sold from yard will not be returned or credited.</li>
                            <li>Interest @18% p.a. will be levied for delayed payments exceeding 15 days.</li>
                            <li>All disputes are subject strictly to Pune, Maharashtra jurisdiction.</li>
                          </ul>
                        )}
                      </>
                    )}
                  </div>

                  <div className="text-left text-[10px] text-[#44474e]">
                    <span className="font-bold text-[#1c1b1f] block uppercase tracking-wider text-[9px] mb-1">Amount in Words:</span>
                    <p className="font-black text-[var(--color-primary)] bg-[var(--color-primary-container)]/40 p-2.5 rounded-xl border border-[var(--color-primary)]/20 text-center uppercase tracking-wide">
                      {numberToWords(previewCalculations.grandTotal)}
                    </p>
                  </div>
                </div>

                {/* Subtotals & Taxes */}
                <div className="bg-[#f3f3fa] p-4.5 rounded-2xl border border-[#e1e2ec] space-y-2.5 text-xs text-right h-fit">
                  <div className="flex justify-between text-[#44474e] font-bold">
                    <span>Taxable Material Subtotal:</span>
                    <span className="text-[#1c1b1f]">{formatCurrency(previewCalculations.subtotal)}</span>
                  </div>

                  {previewCalculations.transportCharges > 0 && (
                    <div className="flex justify-between text-[#44474e] font-bold">
                      <span>Transport / Freight Charges:</span>
                      <span className="text-[#1c1b1f]">{formatCurrency(previewCalculations.transportCharges)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-[#44474e] font-bold">
                    <span>Central GST (CGST) ({previewOrder.taxRateGst / 2}%):</span>
                    <span className="text-[#1c1b1f]">{formatCurrency(previewCalculations.taxAmount / 2)}</span>
                  </div>

                  <div className="flex justify-between text-[#44474e] font-bold">
                    <span>State GST (SGST) ({previewOrder.taxRateGst / 2}%):</span>
                    <span className="text-[#1c1b1f]">{formatCurrency(previewCalculations.taxAmount / 2)}</span>
                  </div>

                  <div className="h-px bg-[#e1e2ec]" />

                  <div className="flex justify-between items-center font-black text-sm text-[#1c1b1f]">
                    <span>Grand Total:</span>
                    <span className="text-base text-[#005ac1]">{formatCurrency(previewCalculations.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Signature Blocks */}
              <div className="grid grid-cols-2 gap-12 pt-16 text-[10px] text-center">
                <div className="space-y-1">
                  <div className="h-10 border-b border-dashed border-[#74777f] w-3/4 mx-auto" />
                  <p className="font-black text-[#1c1b1f] uppercase tracking-wider">Receiver's Seal & Signature</p>
                  <p className="text-[9px] text-[#74777f]">Materials received in good quantity & grade</p>
                </div>

                <div className="space-y-1">
                  <div className="h-10 flex items-end justify-center w-3/4 mx-auto">
                    <span className="text-[9px] font-mono italic text-[#74777f]/40 uppercase tracking-widest font-black">[APEX HOTMIX STAMP]</span>
                  </div>
                  <div className="border-b border-dashed border-[#74777f] w-3/4 mx-auto" />
                  <p className="font-black text-[#1c1b1f] uppercase tracking-wider">For {settings.companyName || 'APEX ASPHALT INDUSTRIES'}</p>
                  <p className="text-[9px] text-[#74777f]">Authorized Representative Signatory</p>
                </div>
              </div>

              {/* Page footer */}
              <div className="text-center pt-10 text-[8px] text-[#74777f] font-mono border-t border-[#e1e2ec] mt-12">
                This is a computer-generated document under the Indian GST Act. Physical signature is optional but legally recognized. Page 1 of 1
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] flex justify-end gap-3 bg-[var(--color-surface-container)] print:hidden">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-high)] transition-colors"
              >
                Close Viewer
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-6 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-md"
              >
                <Printer className="w-4 h-4" />
                Print / Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Material Design 3 Delete Order Confirmation Dialog */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-[var(--color-surface-container-lowest)] rounded-3xl border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden animate-scaleUp">
            {/* Header */}
            <div className="p-5 pb-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container-low)]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-[var(--color-error-container)]/70 text-[var(--color-error)]">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                    Delete {orderToDelete.type === 'purchase' ? 'Purchase Order' : 'Sales Order'}
                  </h3>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">
                    {orderToDelete.orderNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="p-1.5 rounded-full text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-highest)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-[var(--color-on-surface)] leading-relaxed">
                Are you sure you want to permanently delete order{' '}
                <strong className="text-[var(--color-primary)] font-bold">{orderToDelete.orderNumber}</strong> for{' '}
                <strong className="text-[var(--color-on-surface)] font-bold">{orderToDelete.partyName}</strong>?
              </p>

              <div className="p-3.5 rounded-2xl bg-[var(--color-error-container)]/20 border border-[var(--color-error)]/30 text-xs text-[var(--color-on-surface)] space-y-1.5">
                <div className="flex items-center gap-2 text-[var(--color-error)] font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Cloud Database & Inventory Reversal</span>
                </div>
                <p className="text-[var(--color-on-surface-variant)] leading-normal">
                  This action will permanently delete this order record from the Azure Cloud Database. Any allocated or received material quantities will be restored back to inventory.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-xs flex justify-between items-center">
                <span className="text-[var(--color-on-surface-variant)]">Total Order Value</span>
                <span className="font-black text-[var(--color-on-surface)] text-sm">{formatCurrency(orderToDelete.totalAmount)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 bg-[var(--color-surface-container-low)] border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="px-5 py-2.5 rounded-full text-xs font-bold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold bg-[var(--color-error)] text-[var(--color-on-error)] hover:opacity-90 active:scale-95 transition-all shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirm & Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Purchase 3-Stage Workflow Modal */}
      {isPurchaseModalOpen && (
        <AddPurchaseModal
          isOpen={isPurchaseModalOpen}
          onClose={() => {
            setIsPurchaseModalOpen(false);
            setEditingPurchaseOrder(null);
          }}
          existingOrder={editingPurchaseOrder}
          parties={parties}
          items={items}
          settings={settings}
          onSaveOrder={handleSavePurchaseOrder}
          onCancelOrder={handleCancelPurchaseOrder}
        />
      )}
    </div>
  );
}
