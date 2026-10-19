import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Lock,
  MoreVertical,
  FileText,
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Edit3,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  Layers,
  TrendingUp,
  Boxes,
  Truck,
  Building,
  User,
  Printer,
  Download,
  Check,
  ChevronRight,
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
import { Order, OrderItem, OrderType, SalesStage, PurchaseStage, Party, Item, CompanySettings, Sale, Purchase, PaymentMode } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { AddPurchaseModal } from './AddPurchaseModal';
import { OrderDocumentsSection, StagedDocument } from './OrderDocumentsSection';
import { SearchableSelect } from './SearchableSelect';
import {
  OrderDisplay,
  saleToDisplay,
  purchaseToDisplay,
  salesStageActionMenu,
  purchaseStageActionMenu,
  isSaleLocked,
  isPurchaseLocked,
  editLabelFor,
  purchaseEditLabelFor,
  canViewProforma,
  masterPkShort,
} from './orderDisplay';
import { OrderDetailModal } from './OrderDetailModal';
import { OrderDocumentPreviewModal } from './OrderDocumentPreviewModal';
import { formatDateTime } from '../../utils/formatters';

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
  sales: Sale[];
  /** @deprecated legacy `orders` rows — shown alongside for continuity */
  purchaseOrders: Purchase[];
  parties: Party[];
  items: Item[];
  settings: CompanySettings;
  onAddSale: (payload: any) => any;
  onUpdateSale: (id: string, updates: any) => any;
  onAddSaleStage: (id: string, stageInput: any) => any;
  onDeleteSale: (id: string) => boolean;
  onAddPurchase: (payload: any) => any;
  onUpdatePurchase: (id: string, updates: any) => any;
  onAddPurchaseStage: (id: string, stageInput: any) => any;
  onDeletePurchase: (id: string) => boolean;
  fixedType?: OrderType;
  /** Deep link from another module (party statement): open this order's
   *  edit form or issue-stage flow on arrival (nonce re-triggers it) */
  deepLink?: { orderId: string; action: string; nonce: number } | null;
  onDeepLinkHandled?: () => void;
}

export function OrdersView({
  sales,
  purchaseOrders,
  parties,
  items,
  settings,
  onAddSale,
  onUpdateSale,
  onAddSaleStage,
  onDeleteSale,
  onAddPurchase,
  onUpdatePurchase,
  onAddPurchaseStage,
  onDeletePurchase,
  fixedType,
  deepLink,
  onDeepLinkHandled,
}: OrdersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | OrderType>('all');
  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isStageMenuOpen, setIsStageMenuOpen] = useState(false);
  const stageMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderDisplay | null>(null);
  // Documents staged while CREATING a brand-new sale (S3-uploaded + registered;
  // carried as documentIds on the create payload — the server links them)
  const [stagedSaleDocs, setStagedSaleDocs] = useState<StagedDocument[]>([]);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<OrderDisplay | null>(null);
  // Purchase mirror of the sales stage machinery: the stage the Add-Purchase
  // popover picked (new purchase) and the successive stage the row ⋮ menu is
  // advancing an existing purchase to (RFQ → PO → GRN, never backwards).
  const [purchaseCreateStage, setPurchaseCreateStage] = useState<PurchaseStage | undefined>('rfq');
  const [purchaseOpenStage, setPurchaseOpenStage] = useState<PurchaseStage | undefined>(undefined);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderDisplay | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formType, setFormType] = useState<OrderType>(fixedType || 'sales');

  // Form states
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPartyId, setFormPartyId] = useState('');
  const [formItems, setFormItems] = useState<Array<{ itemId: string; quantity: string; rate: string; location: string; gstRate: string }>>([
    { itemId: '', quantity: '', rate: '', location: '', gstRate: '' },
  ]);
  const [formNotes, setFormNotes] = useState('');
  const [formOrderNumber, setFormOrderNumber] = useState('');
  const [formStage, setFormStage] = useState<SalesStage>('sales_order');
  const [formVehicleNo, setFormVehicleNo] = useState('');
  const [formDriverName, setFormDriverName] = useState('');
  const [formTransportCharges, setFormTransportCharges] = useState('0');
  const [formPaymentMode, setFormPaymentMode] = useState<any>('bank_transfer');
  const [formAccountId, setFormAccountId] = useState<string>('');

  // Per-stage save toggle: apply the one-shot stockyard inventory update.
  // Inventory/cash post ONCE per order — the server guards on the master flags.
  const [updateInventory, setUpdateInventory] = useState<boolean>(false);
  const [updateCash, setUpdateCash] = useState<boolean>(false);

  // Payment-flow toggle: 'none' = Don't touch payment settlement (nothing
  // posts — no voucher, no party ledger move, no cash move); 'credit' = book
  // on credit (party ledger only, no cash); 'account' = full flow (journal +
  // payment voucher into formAccountId). Once applied the section locks ON.
  const [formSettlementType, setFormSettlementType] = useState<'none' | 'credit' | 'account'>('none');
  const [includeLogistics, setIncludeLogistics] = useState<boolean>(false);

  // Fetch available accounts, vehicles, drivers & storage locations for dropdown selection
  const accounts = useMemo(() => localDb.getAccounts(), [isFormOpen]);
  const registeredVehicles = useMemo(() => localDb.getVehicles(), [isFormOpen]);
  const registeredDrivers = useMemo(() => localDb.getDrivers(), [isFormOpen]);
  const availableLocations = useMemo(() => localDb.getLocations(), [isFormOpen]);

  // Preview modal states
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<OrderDisplay | null>(null);
  const [previewStage, setPreviewStage] = useState<SalesStage>('sales_order');

  // Add-Stage modal (issue a new stage document against an existing sale)
  // Sales detail stage tabs: which issued stage document to display
  // (null = show the CURRENT/latest stage on open)
  const [detailStageTab, setDetailStageTab] = useState<string | null>(null);

  // Stage-issue mode: the ⋮ popover's "Create Sales Order"/"Issue GST Tax
  // Invoice" opens the SAME full form modal (edit-dialog style), pre-seeded
  // with the sale's current-stage lines; submitting issues that stage doc.
  const [stageIssueCtx, setStageIssueCtx] = useState<{
    saleId: string;
    saleNumber: string;
    stageType: SalesStage;
    inventoryApplied: boolean;
    cashApplied: boolean;
    transportCharges: number;
    // Cash & Bank settlement already recorded on the sale (invoice stage)
    settlementAccountId?: string;
    settledAmount?: number;
    settledDate?: string;
    // Which payment flow was applied (echoed verbatim on locked saves)
    settlementType?: 'credit' | 'account';
  } | null>(null);

  // Payment-flow section locks: once a flow was applied it shows disabled ON
  // (every save echoes the stored flow); an EDIT whose sale never applied the
  // flow keeps the toggle ENABLED so the user can book the flow right from the
  // edit save (the server applies it at the current stage, one-shot).
  const settleSectionLocked = Boolean(stageIssueCtx?.cashApplied || (editingOrder as any)?.cashApplied);
  // A payment flow is COMPULSORY at the invoice stage (final document) —
  // the switch locks ON there and Don't-touch is not offered. 'credit'
  // applies the flow at applying stage; user can still pick an account.
  const settleFinalStage = (stageIssueCtx?.stageType || formStage) === 'sales_invoice';

  // Row-level ⋮ action popover (sales list). Rendered via PORTAL (fixed
  // position above the page) so the list container's overflow-x-auto /
  // overflow-hidden can never clip it.
  const [rowActionMenuFor, setRowActionMenuFor] = useState<string | null>(null);
  const [rowActionMenuPos, setRowActionMenuPos] = useState<{ top: number; right: number; flip: boolean } | null>(null);
  const rowActionRef = React.useRef<HTMLDivElement | null>(null);
  const rowMenuRef = React.useRef<HTMLDivElement | null>(null);

  const closeRowActionMenu = () => {
    setRowActionMenuFor(null);
    setRowActionMenuPos(null);
  };

  React.useEffect(() => {
    if (!rowActionMenuFor) return;
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rowActionRef.current && !rowActionRef.current.contains(t) &&
          rowMenuRef.current && !rowMenuRef.current.contains(t)) {
        closeRowActionMenu();
      }
    };
    const handleMove = () => closeRowActionMenu();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleMove, true);
    window.addEventListener('resize', handleMove);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleMove, true);
      window.removeEventListener('resize', handleMove);
    };
  }, [rowActionMenuFor]);


  /**
   * Opens the full sales form modal in STAGE-ISSUE mode: lines are seeded as
   * an editable copy of the sale's current-stage items; submit issues the
   * stage document (server stores these rows against the new stage).
   */
  const openIssueStageForm = (order: OrderDisplay, stageType: SalesStage) => {
    // The stage-issue form modal opens on top — close the detail view so the
    // user never has to dismiss it manually afterwards.
    setIsDetailOpen(false);
    const sale = sales.find((s) => s.id === order.id);
    const display = sale ? saleToDisplay(sale) : order;
    setStageIssueCtx({
      saleId: order.id,
      saleNumber: order.orderNumber,
      stageType,
      inventoryApplied: order.inventoryApplied,
      cashApplied: order.cashApplied,
      transportCharges: Number(order.transportCharges) || 0,
      settlementAccountId: order.settlementAccountId,
      settledAmount: order.settledAmount,
      settledDate: order.settledDate,
      settlementType: order.cashApplied ? (order.settlementType || 'account') : undefined,
    });
    setEditingOrder(null);
    setFormType('sales');
    setFormStage(stageType);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormPartyId(order.partyId === 'unassigned' ? '' : (order.partyId || ''));
    setFormOrderNumber(suggestStageNumber('sales', stageType));
    setFormNotes('');
    setFormVehicleNo(order.vehicleNo || '');
    setFormDriverName(order.driverName || '');
    setFormTransportCharges(String(order.transportCharges || 0));
    setIncludeLogistics(Number(order.transportCharges) > 0 || Boolean(order.vehicleNo || order.driverName));
    // Payment flow: once applied, the section locks ON and every later save
    // echoes the stored flow verbatim (never 'none' — the final-stage journal
    // voucher must keep upserting). A payment flow is COMPULSORY at the
    // invoice stage, so issuing one defaults to Book on credit.
    setFormSettlementType(order.cashApplied
      ? (order.settlementType || 'account')
      : (stageType === 'sales_invoice' ? 'credit' : 'none'));
    setFormAccountId(order.settlementAccountId || '');
    setFormPaymentMode((order.paymentMode as any) || 'bank_transfer');
    setUpdateInventory(!order.inventoryApplied);
    setUpdateCash(false);
    setFormItems(
      display.items.map((i) => {
        const prod = items.find((it) => it.id === i.itemId);
        return {
          itemId: i.itemId,
          quantity: String(i.quantity),
          rate: String(i.rate),
          location: i.location || '',
          gstRate: String(i.gstRate ?? prod?.taxRateGst ?? 0),
        };
      })
    );
    setFormError(null);
    setStagedSaleDocs([]); // fresh document staging per create/edit dialog
    setIsFormOpen(true);
  };

  // Currency Formatter
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Amounts are approximated to 2 decimal places (paise) across the modal:
  // math keeps floats, but every figure displayed / saved is rounded to 2dp.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const formatCurrency2 = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(round2(amount));
  };

  const currentOrders = useMemo(() => {
    const saleDisplays = sales.map(saleToDisplay);
    const purchaseDisplays = purchaseOrders.map(purchaseToDisplay);
    if (fixedType) {
      return (fixedType === 'sales' ? saleDisplays : purchaseDisplays).filter((o) => o.type === fixedType);
    }
    return [...saleDisplays, ...purchaseDisplays];
  }, [sales, purchaseOrders, fixedType]);

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
      const st = o.status ?? 'pending';
      if (st === 'cancelled') return;
      if (o.type === 'sales') {
        salesTotal += o.totalAmount;
      } else if (o.purchaseStage !== 'rfq') {
        purchaseTotal += o.totalAmount;
      }

      if (st === 'pending' || st === 'partially_delivered') {
        pendingCount++;
      } else if (st === 'completed') {
        completedCount++;
      }
    });

    return { salesTotal, purchaseTotal, pendingCount, completedCount };
  }, [currentOrders]);

  // Filter and search orders
  const filteredOrders = useMemo(() => {
    const matches = currentOrders.filter((o) => {
      const matchesSearch =
        (o.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.partyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.items.some((item) => (item.itemName || '').toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesType = fixedType ? true : (typeFilter === 'all' || o.type === typeFilter);

      return matchesSearch && matchesType;
    });
    // Newest registration first — createdAt is the row's master-creation
    // timestamp (legacy rows without it fall to the bottom).
    return matches.sort((a, b) => {
      const ta = Date.parse(a.createdAt || '') || 0;
      const tb = Date.parse(b.createdAt || '') || 0;
      return tb - ta;
    });
  }, [currentOrders, searchTerm, typeFilter, fixedType]);

  // Next document number suggestion per stage type (client-side hint only;
  // server enforces uniqueness on the issued number).
  const suggestStageNumber = (kind: 'sales' | 'purchase', stageType?: string): string => {
    const year = new Date().getFullYear();
    const prefixMap: Record<string, string> = {
      quotation: 'QUO',
      sales_order: 'SO',
      proforma_invoice: 'PROF',
      delivery_note: 'DC',
      sales_invoice: 'INV',
      rfq: 'RFQ',
      purchase_order: 'PO',
      goods_receipt: 'GRN',
    };
    const prefix = prefixMap[stageType || ''] || (kind === 'sales' ? 'SO' : 'PO');
    const known = new Set<string>([
      ...sales.map((s) => s.saleNumber),
      ...purchaseOrders.map((p) => p.purchaseNumber),
      ...sales.flatMap((s) => (s.stages || []).map((st) => st.stageNumber)),
      ...purchaseOrders.flatMap((p) => (p.stages || []).map((st) => st.stageNumber)),
    ]);
    let num = 1;
    while (num < 9999) {
      const candidate = `${prefix}-${year}-${String(num).padStart(4, '0')}`;
      if (!known.has(candidate)) return candidate;
      num++;
    }
    return `${prefix}-${year}-${Date.now().toString().slice(-4)}`;
  };

  // Handle open Form Modal for Create
  const handleOpenCreate = (type: OrderType, stage?: SalesStage | PurchaseStage) => {
    const resolvedType = fixedType || type;
    if (resolvedType === 'purchase') {
      setPurchaseCreateStage((stage as PurchaseStage) || 'rfq');
      setPurchaseOpenStage(undefined);
      setEditingPurchaseOrder(null);
      setIsPurchaseModalOpen(true);
      return;
    }

    setFormType(resolvedType);
    setEditingOrder(null);
    setStageIssueCtx(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormPartyId('');
    setFormItems([{ itemId: '', quantity: '', rate: '', location: '', gstRate: '' }]);
    setFormNotes('');
    setFormStage(stage || 'quotation');
    setFormVehicleNo('');
    setFormDriverName('');
    setFormTransportCharges('0');
    setUpdateInventory(false);
    setUpdateCash(false);
    // A payment flow is COMPULSORY at the invoice stage — a sale created
    // straight at the invoice defaults to Book on credit (user can still
    // switch to a Cash/Bank account); other stages start at Don't touch.
    setFormSettlementType((stage || 'quotation') === 'sales_invoice' ? 'credit' : 'none');
    setFormAccountId('');
    setFormPaymentMode('bank_transfer' as any);


    // Document number suggested per the chosen starting stage
    setFormOrderNumber(suggestStageNumber('sales', stage || 'quotation'));
    setFormError(null);

    setStagedSaleDocs([]); // fresh document staging per create/edit dialog
    setIsFormOpen(true);
  };

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (fixedType === 'purchase' && customEvent.detail === 'create-po') {
        handleOpenCreate('purchase');
      }
    };
    window.addEventListener('app-header-action', handleHeaderAction);
    return () => window.removeEventListener('app-header-action', handleHeaderAction);
  }, [fixedType, sales.length + purchaseOrders.length]);

  // Close the stage-selection popover when clicking outside it
  React.useEffect(() => {
    if (!isStageMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (stageMenuRef.current && !stageMenuRef.current.contains(e.target as Node)) {
        setIsStageMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStageMenuOpen]);

  // Handle the AddPurchaseModal response (server-minted record already swaps
  // into cloudStore; the detail view follows via sync — nothing to route here).

  // Handle cancel from AddPurchaseModal
  const handleCancelPurchaseOrder = (orderId: string) => {
    onUpdatePurchase(orderId, { status: 'cancelled' });
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
    }
  };

  // Deep link from another module (e.g. the party statement "Issue stage"/
  // "Edit" actions): on arrival, resolve the order and open the requested
  // flow directly. onDeepLinkHandled clears the request app-side.
  React.useEffect(() => {
    if (!deepLink || !deepLink.orderId) return;
    const sale = sales.find((s) => s.id === deepLink.orderId);
    const purchase = purchaseOrders.find((p) => p.id === deepLink.orderId);
    const target = purchase ? purchaseToDisplay(purchase) : sale ? saleToDisplay(sale) : null;
    closeRowActionMenu();
    setIsDetailOpen(false);
    if (!target) {
      onDeepLinkHandled?.();
      return;
    }
    if (deepLink.action === 'edit') {
      handleOpenEdit(target);
    } else if (deepLink.action) {
      if (target.type === 'purchase') {
        setPurchaseOpenStage(deepLink.action as PurchaseStage);
        setPurchaseCreateStage('rfq');
        setEditingPurchaseOrder(target);
        setIsPurchaseModalOpen(true);
      } else {
        openIssueStageForm(target, deepLink.action as SalesStage);
      }
    } else {
      // No explicit action: open the order details modal
      setDetailStageTab(null);
      setSelectedOrder(target);
      setIsDetailOpen(true);
    }
    onDeepLinkHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink?.nonce]);

  // Handle open Form Modal for Edit
  const handleOpenEdit = (order: OrderDisplay, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStageIssueCtx(null);
    if (order.type === 'purchase') {
      // Edit opens the modal at the order's CURRENT stage: no create stage
      // (the modal falls back to the purchase's own latest stage)
      setPurchaseCreateStage(undefined);
      setPurchaseOpenStage(undefined);
      setEditingPurchaseOrder(order);
      setIsPurchaseModalOpen(true);
      return;
    }
    setEditingOrder(order);
    setFormType(order.type);
    setFormDate(order.date);
    setFormPartyId(order.partyId);
    setFormNotes(order.notes || '');
    // Prefill with the CURRENT stage's document number (sales-order number
    // at SO stage, quotation number at quotation stage) — number is immutable
    setFormOrderNumber((order.stageNumbers || [])[((order.stageNumbers || []).length) - 1]?.number || order.orderNumber);
    setFormStage((order.stage || 'sales_order') as SalesStage);
    setFormVehicleNo(order.vehicleNo || '');
    setFormDriverName(order.driverName || '');
    setFormTransportCharges(String(order.transportCharges || 0));
    // Inventory switch defaults OFF on create AND edit (user rule) — the
    // user enables it when they want the one-shot dispatch/inward to post.
    setUpdateInventory(false);
    setUpdateCash(false);
    // Payment flow mirrors the sale on edit: an applied flow shows locked ON
    // (echoes its stored type); an unapplied sale starts unchecked but the
    // toggle stays enabled — the edit save can book the flow at this stage.
    setFormSettlementType(order.cashApplied ? (order.settlementType || 'account') : 'none');
    setFormAccountId(order.settlementAccountId || '');
    setFormPaymentMode((order.paymentMode as any) || 'bank_transfer');
    setFormItems(
      order.items.map((i) => {
        const prod = items.find((it) => it.id === i.itemId);
        return {
          itemId: i.itemId,
          quantity: String(i.quantity),
          rate: String(i.rate),
          location: i.location || '',
          gstRate: String(i.gstRate ?? prod?.taxRateGst ?? 0),
        };
      })
    );
    setFormError(null);
    setStagedSaleDocs([]); // fresh document staging per create/edit dialog
    setIsFormOpen(true);
  };

  // Handle row addition in items form
  const handleAddFormItemRow = () => {
    setFormItems([...formItems, { itemId: '', quantity: '', rate: '', location: '', gstRate: '' }]);
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
  const handleFormItemChange = (index: number, field: 'itemId' | 'quantity' | 'rate' | 'location' | 'gstRate', value: string) => {
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
        updated[index].gstRate = String(selectedProduct.taxRateGst ?? 0);
      } else {
        updated[index].location = '';
      }
    }
    setFormItems(updated);
  };

  // Calculate dynamic subtotals for form (tax is per-item, so it is summed row by row)
  const formCalculations = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    formItems.forEach((row) => {
      const qty = Number(row.quantity) || 0;
      const rate = Number(row.rate) || 0;
      const gstRate = Number(row.gstRate) || 0;
      const lineTotal = qty * rate;
      subtotal += lineTotal;
      taxAmount += (lineTotal * gstRate) / 100;
    });

    const transportCharges = includeLogistics ? (Number(formTransportCharges) || 0) : 0;
    // Weighted-average slab kept on the order row for single-rate consumers
    // (detail view / print); individual slabs live on each item row.
    // All figures are approximated to 2 decimal places (paise).
    const subtotal2 = round2(subtotal);
    const taxAmount2 = round2(taxAmount);
    const blendedGstRate = subtotal2 > 0 ? Math.round((taxAmount2 / subtotal2) * 10000) / 100 : 0;
    const totalAmount = round2(subtotal2 + taxAmount2 + transportCharges);

    return { subtotal: subtotal2, taxAmount: taxAmount2, totalAmount, transportCharges, blendedGstRate };
  }, [formItems, formTransportCharges, includeLogistics]);

  // Save/Submit order form (SALES — create master+first stage, or master edit)
  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPartyId) {
      setFormError('Please select a Party.');
      return;
    }

    if ((formStage === 'sales_invoice' || formStage === 'sales_order') && formSettlementType === 'account') {
      if (!formPaymentMode) {
        setFormError('Please select a Payment Mode.');
        return;
      }
      if (!formAccountId) {
        setFormError(`Please select a ${formType === 'sales' ? 'Deposit / Settlement Account (where money will be credited)' : 'Disbursement Account (where money will be debited)'}.`);
        return;
      }
      if (!accounts.find((a) => a.id === formAccountId)) {
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

    // Map rows to item-input format (server resolves FKs: item/unit/location)
    const itemsList = validRows.map((row) => {
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
        quantity: qty,
        rate: rate,
        gstRate: Number(row.gstRate) || 0,
        locationName: assignedLoc,
        receivedQuantity: (formType === 'purchase') ? qty : undefined,
      };
    });

    const { taxAmount, totalAmount } = formCalculations;

    // Payment-flow stage fields: 'none' → Don't touch (nothing posts), 'credit'
    // → book on credit (party ledger only), 'account' → journal + receipt into
    // formAccountId. Once applied the section locks ON and prefills the stored
    // flow, so every save echoes it verbatim (never 'none' — the final-stage
    // journal voucher must keep upserting). At the invoice stage the flow is
    // COMPULSORY: an un-decided choice falls back to Book on credit.
    const settleStageFields = () => {
      const effType = formSettlementType === 'none' && settleFinalStage ? ('credit' as const) : formSettlementType;
      return {
        updateCash: effType !== 'none',
        settlementType: effType,
        settlementAccountId: effType === 'account' ? (formAccountId || undefined) : undefined,
        paymentMode: effType === 'account' ? formPaymentMode : undefined,
      };
    };

    if (stageIssueCtx) {
      // STAGE-ISSUE mode: submit issues the new stage document; the lines
      // become that stage's own rows (editable copy of the current stage).
      onAddSaleStage(stageIssueCtx.saleId, {
        stageType: stageIssueCtx.stageType,
        stageNumber: formOrderNumber.trim(),
        date: formDate,
        notes: formNotes.trim() || undefined,
        partyId: formPartyId || undefined,
        updateInventory,
        ...settleStageFields(),
        items: itemsList,
      });
      setStageIssueCtx(null);
      setIsFormOpen(false);
      return;
    }

    if (editingOrder) {
      // Master edit: items/notes/logistics/date — stages stay untouched. The
      // one-shot inventory switch rides along (default OFF; applied on save
      // only while the dispatch has never posted). The payment-flow toggle is
      // enabled while the flow was never applied — the edit save can book the
      // flow at the current stage; an applied flow is locked and never resent.
      onUpdateSale(editingOrder.id, {
        partyId: formPartyId,
        date: formDate,
        notes: formNotes.trim(),
        vehicleNo: includeLogistics && formVehicleNo.trim() ? formVehicleNo.trim() : undefined,
        driverName: includeLogistics && formDriverName.trim() ? formDriverName.trim() : undefined,
        transportCharges: includeLogistics ? (Number(formTransportCharges) || 0) : 0,
        items: itemsList,
        subtotal: formCalculations.subtotal,
        taxAmount,
        totalAmount,
        updateInventory: formStage !== 'quotation' ? updateInventory : false,
        ...(formStage !== 'quotation' && !(editingOrder as any).cashApplied ? settleStageFields() : {}),
      });
    } else {
      // Create: master + first stage document (+ toggles for the ONE-SHOT
      // inventory / cash application). Staged documents ride along as
      // documentIds — the server links them in the same flow as the sale.
      onAddSale({
        saleNumber: formOrderNumber.trim(),
        partyId: formPartyId,
        date: formDate,
        notes: formNotes.trim(),
        vehicleNo: includeLogistics && formVehicleNo.trim() ? formVehicleNo.trim() : undefined,
        driverName: includeLogistics && formDriverName.trim() ? formDriverName.trim() : undefined,
        transportCharges: includeLogistics ? (Number(formTransportCharges) || 0) : 0,
        items: itemsList,
        subtotal: formCalculations.subtotal,
        taxAmount,
        totalAmount,
        documentIds: stagedSaleDocs.map((d) => d.id),
        stage: {
          stageType: formStage,
          stageNumber: formOrderNumber.trim(),
          date: formDate,
          notes: formNotes.trim(),
          updateInventory,
          ...settleStageFields(),
        },
      });
      setStagedSaleDocs([]);
    }

    setIsFormOpen(false);
  };

  const handleOpenDetail = (order: OrderDisplay) => {
    setDetailStageTab(null); // default: show the current stage's document
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  // Keep the open detail view in step with fresh data (resync) — e.g. after
  // issuing a stage from within the detail modal, its stage list updates.
  React.useEffect(() => {
    if (!isDetailOpen || !selectedOrder) return;
    if (selectedOrder.type === 'purchase') {
      const fresh = purchaseOrders.find((p) => p.id === selectedOrder.id);
      if (fresh) setSelectedOrder(purchaseToDisplay(fresh));
      return;
    }
    const freshSale = sales.find((sc) => sc.id === selectedOrder.id);
    if (freshSale) setSelectedOrder(saleToDisplay(freshSale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ sales, purchaseOrders ]);

  // Dynamic lookup for linked Trip Slip if any
  const linkedTripSlip = useMemo(() => {
    if (!previewOrder) return null;
    return localDb.getTripSlips().find(s => s.orderId === previewOrder.id || s.orderNumber === previewOrder.orderNumber);
  }, [previewOrder, isPreviewOpen]);

  // Explicitly compute calculations to be 100% accurate for printable template.
  // A goods-receipt doc bills RECEIVED quantities at the PO rates (user rule).
  const previewCalculations = useMemo(() => {
    if (!previewOrder) return { subtotal: 0, taxAmount: 0, transportCharges: 0, grandTotal: 0 };
    const grnPreview = previewOrder.type === 'purchase' && previewOrder.purchaseStage === 'goods_receipt';
    const subtotal = previewOrder.items.reduce((sum, item) => {
      const q =
        grnPreview && item.receivedQuantity !== undefined && item.receivedQuantity !== null
          ? Number(item.receivedQuantity)
          : item.quantity;
      return sum + q * item.rate;
    }, 0);
    const transportCharges = previewOrder.transportCharges || 0;
    const taxAmount = (subtotal * (previewOrder.taxRateGst || 0)) / 100;
    const grandTotal = subtotal + taxAmount + transportCharges;
    return { subtotal, taxAmount, transportCharges, grandTotal };
  }, [previewOrder]);

  return (
    <div className="space-y-6" id="orders-management-container">
      {/* KPI Stats Banner commented out, keep them commented will work on this later */}
      {/* <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Parties</p>
                <p className="text-lg font-black text-[var(--color-primary)] mt-1">
                  {parties.length} Parties
                </p>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Registered party directory</p>
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
      </div> */}

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

          {/* New Order Button (+ Sales / Purchase document stage popover) */}
          <div className="relative" ref={stageMenuRef}>
            <button
              type="button"
              onClick={() => setIsStageMenuOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full transition-all shadow-xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{fixedType === 'sales' ? 'Add Sale' : fixedType === 'purchase' ? 'Add Purchase' : 'New Order'}</span>
            </button>

            {isStageMenuOpen && fixedType === 'purchase' && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-lg overflow-hidden">
                <p className="px-3 pt-3 pb-2 text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Create Purchase Document
                </p>
                {[
                  { id: 'rfq', label: 'Request Quotation', desc: 'Supplier inquiry — starts a new purchase' },
                  { id: 'purchase_order', label: 'Purchase Order', desc: 'Confirmed procurement' },
                  { id: 'goods_receipt', label: 'Goods Receiving', desc: 'Gate inward — completes the purchase' },
                ].map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setIsStageMenuOpen(false);
                      handleOpenCreate('purchase', step.id as PurchaseStage);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
                  >
                    <div>
                      <p className="text-xs font-bold text-[var(--color-on-surface)]">{step.label}</p>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)]">{step.desc}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--color-outline)] shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {isStageMenuOpen && fixedType !== 'purchase' && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-lg overflow-hidden">
                <p className="px-3 pt-3 pb-2 text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Create Sales Document
                </p>
                {[
                  { id: 'quotation', label: 'Quotation', desc: 'Price Quote — starts a new sale' },
                  { id: 'sales_order', label: 'Sales Order', desc: 'Confirmed outbound sale' },
                  { id: 'sales_invoice', label: 'Invoice', desc: 'Final GST Bill — locks the sale' },
                ].map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setIsStageMenuOpen(false);
                      handleOpenCreate('sales', step.id as SalesStage);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
                  >
                    <div>
                      <p className="text-xs font-bold text-[var(--color-on-surface)]">{step.label}</p>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)]">{step.desc}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--color-outline)] shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Orders Table Display */}
      <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">{fixedType === 'sales' ? 'Sale ID' : fixedType === 'purchase' ? 'Purchase ID' : 'Order ID'}</th>
                {!fixedType && <th className="py-3.5 px-3">Type</th>}
                {fixedType === 'sales' && <th className="py-3.5 px-3">Sales Stage</th>}
                {fixedType === 'purchase' && <th className="py-3.5 px-3">Purchase Stage</th>}
                <th className="py-3.5 px-3">Party Name</th>
                <th className="py-3.5 px-3">Stock / Cash</th>
                <th className="py-3.5 px-3">Materials Ordered</th>
                <th className="py-3.5 px-3 text-right">Total Amount</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={!fixedType ? 8 : 7} className="py-12 text-center text-[var(--color-on-surface-variant)]">
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
                      {/* Sale/Purchase ID column — the master row's primary
                          key shortened to `sale-<timestamp>` as the main
                          line; the registration timestamp beneath it
                          (dd-mm-yyyy + time) */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[var(--color-on-surface)] truncate max-w-[220px]">
                          {masterPkShort(order.id)}
                        </div>
                        <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                          {formatDateTime(order.createdAt, 'dash')}
                        </p>
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
                              rfq: 'Request Quotation',
                              purchase_order: 'Purchase Order',
                              goods_receipt: 'Goods Receiving',
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
                                
                              </div>
                            );
                          })()}
                        </td>
                      )}

                      {/* Party Name — legal name; trade name on the next line */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-[var(--color-on-surface)] max-w-[180px] truncate">
                          {order.purchaseStage === 'rfq' && (!order.partyName || order.partyName.includes('Unassigned') || order.partyId === 'unassigned') ? (
                            <span className="italic text-[var(--color-on-surface-variant)] font-semibold">Unassigned (RFQ)</span>
                          ) : (
                            parties.find((p) => p.id === order.partyId)?.name || order.partyName || '—'
                          )}
                        </div>
                        {(() => {
                          const party = parties.find((p) => p.id === order.partyId);
                          if (order.purchaseStage === 'rfq' && (!order.partyName || order.partyName.includes('Unassigned') || order.partyId === 'unassigned')) return null;
                          return party?.tradeName ? (
                            <div className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-0.5 max-w-[180px] truncate">
                              ({party.tradeName})
                            </div>
                          ) : null;
                        })()}
                      </td>

                      {/* One-shot application flags (Stock / Cash) */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            title={order.inventoryApplied ? 'Stockyard inventory applied (one-shot)' : 'Inventory not applied yet'}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                              order.inventoryApplied
                                ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                                : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                            }`}
                          >
                            <Boxes className="w-2.5 h-2.5" /> {order.inventoryApplied ? 'Stock ✓' : 'Stock —'}
                          </span>
                          <span
                            title={order.cashApplied
                              ? order.settlementType === 'credit'
                                ? 'Booked on credit — the receivable/payable moves to the Party ledger, no Cash/Bank movement'
                                : `Payment flow applied — receipt/payout voucher ${order.settlementVoucherNumber || ''} posted to ${order.settlementAccountName || 'Cash & Bank'}`
                              : 'Payment flow not applied yet (Don\'t touch settlement)'}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                              order.cashApplied
                                ? order.settlementType === 'credit'
                                  ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                                  : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                                : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                            }`}
                          >
                            <Landmark className="w-2.5 h-2.5" /> {order.cashApplied ? (order.settlementType === 'credit' ? 'Credit ✓' : 'Cash ✓') : 'Cash —'}
                          </span>
                        </div>
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
                              Request Quotation
                            </span>
                          </div>
                        ) : (
                          <div className="font-bold text-[var(--color-on-surface)]">
                            {formatCurrency(order.totalAmount)}
                            <span className="block text-[9px] text-[var(--color-on-surface-variant)] font-semibold mt-0.5">
                              GST Incl.
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Action buttons — ⋮ opens a portal popover (fixed above the page) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="relative" ref={rowActionRef}>
                            <button
                              type="button"
                              title="More Actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (rowActionMenuFor === order.id) {
                                  closeRowActionMenu();
                                  return;
                                }
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                // flip above the button when nothing fits underneath
                                const flip = rect.bottom + 270 > window.innerHeight;
                                setRowActionMenuPos({
                                  top: flip ? rect.top : rect.bottom,
                                  right: window.innerWidth - rect.right,
                                  flip,
                                });
                                setRowActionMenuFor(order.id);
                              }}
                              className={`p-1.5 rounded-full transition-colors ${
                                rowActionMenuFor === order.id
                                  ? 'text-[var(--color-on-surface)] bg-[var(--color-surface-container-highest)]'
                                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]'
                              }`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
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

      {/* Row action popover — PORTAL: fixed on the page so the list container
          (overflow-x-auto / overflow-hidden) can never clip it */}
      {rowActionMenuFor && rowActionMenuPos && createPortal(
        <div
          ref={rowMenuRef}
          style={{
            position: 'fixed',
            top: rowActionMenuPos.flip ? rowActionMenuPos.top - 4 : rowActionMenuPos.top + 4,
            right: Math.max(8, rowActionMenuPos.right + 8),
            transform: rowActionMenuPos.flip ? 'translateY(-100%)' : 'none',
          }}
          className="z-[60] w-60 max-w-[calc(100vw-16px)] rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 pt-2.5 pb-1.5 text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            Actions — {filteredOrders.find((o) => o.id === rowActionMenuFor)?.orderNumber || ''}
          </p>
          {(() => {
            const target = filteredOrders.find((o) => o.id === rowActionMenuFor);
            if (!target) return null;
            const locked = target.type === 'sales' ? isSaleLocked(target) : isPurchaseLocked(target);
            if (locked) {
              return (
                <div className="px-3 py-3 border-t border-[var(--color-outline-variant)]/50 text-[10px] font-bold text-[var(--color-error)] flex items-center gap-2">
                  <Ban className="w-3.5 h-3.5" />{' '}
                  {target.type === 'sales' ? 'Sale locked — invoice issued' : 'Purchase locked — goods received'}
                </div>
              );
            }
            // Purchase rows: edit + successive-stage actions through the
            // purchase modal (openStage), mirroring the sales ladder
            if (target.type !== 'sales') {
              return (
                <>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      closeRowActionMenu();
                      handleOpenEdit(target, e);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    {purchaseEditLabelFor(target)}
                  </button>
                  {purchaseStageActionMenu(target).map((sa) => {
                    const StageIcon = sa.icon;
                    return (
                      <button
                        key={sa.stageType}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          closeRowActionMenu();
                          setPurchaseOpenStage(sa.stageType);
                          setPurchaseCreateStage('rfq');
                          setEditingPurchaseOrder(target);
                          setIsPurchaseModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
                      >
                        <StageIcon className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                        <span className="flex-1">{sa.label}</span>
                      </button>
                    );
                  })}
                </>
              );
            }
            return (
              <>
                {/* Edit Sale */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    closeRowActionMenu();
                    handleOpenEdit(target, e);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  {editLabelFor(target)}
                </button>
                {/* View Proforma — renders the Sales Order in Proforma format */}
                {canViewProforma(target) && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      closeRowActionMenu();
                      setPreviewOrder(target);
                      setPreviewStage('proforma_invoice');
                      setIsPreviewOpen(true);
                    }}
                    disabled
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
                  >
                    <Receipt className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    View Proforma
                  </button>
                )}
                {/* Higher-hierarchy stage actions */}
                {salesStageActionMenu(target).map((sa) => {
                  const StageIcon = sa.icon;
                  return (
                    <button
                      key={sa.stageType}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        closeRowActionMenu();
                        openIssueStageForm(target, sa.stageType);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50"
                    >
                      <StageIcon className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                      <span className="flex-1">{sa.label}</span>
                    </button>
                  );
                })}
              </>
            );
          })()}
        </div>,
        document.body
      )}

      {/* --- FORM MODAL FOR CREATE & EDIT --- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                    stageIssueCtx?.stageType === 'sales_invoice' || (formType === 'sales' && !stageIssueCtx)
                      ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                      : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                  }`}
                >
                  {formType === 'sales' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
                    {(() => {
                      if (stageIssueCtx) {
                        return stageIssueCtx.stageType === 'sales_order'
                          ? `Create Sales Order — ${stageIssueCtx.saleNumber}`
                          : `Issue GST Tax Invoice — ${stageIssueCtx.saleNumber}`;
                      }
                      if (editingOrder) return `${editingOrder.stage === 'quotation' ? 'Edit Quotation' : 'Edit Sales Order'}: ${formOrderNumber}`;
                      const stageTitles: Record<string, string> = {
                        quotation: 'New Sales Quotation',
                        sales_order: 'New Sales Order',
                        proforma_invoice: 'New Proforma Invoice',
                        delivery_note: 'New Delivery Note / Challan',
                        sales_invoice: 'New Sales Invoice',
                      };
                      return stageTitles[formStage] || 'New Sales Order';
                    })()}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStageIssueCtx(null);
                  setIsFormOpen(false);
                }}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Order Number</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingOrder)}
                    title={editingOrder ? 'Document number is locked for existing stage documents' : undefined}
                    value={formOrderNumber}
                    onChange={(e) => setFormOrderNumber(e.target.value)}
                    className={`w-full px-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                      editingOrder ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
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
              </div>

              {/* Party Selection Row (hidden entirely while issuing the invoice) */}
              <div>
                {stageIssueCtx?.stageType === 'sales_invoice' ? null : (
                <>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Select Party
                </label>
                <select
                  required
                  disabled={Boolean(editingOrder) || Boolean(stageIssueCtx)}
                  title={(editingOrder || stageIssueCtx) ? 'Party is locked once the sale is created against it' : undefined}
                  value={formPartyId}
                  onChange={(e) => setFormPartyId(e.target.value)}
                  className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                    (editingOrder || stageIssueCtx) ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  <option value="">-- Choose Party --</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.tradeName ? ` (${p.tradeName})` : ''} {p.gstin ? `| GSTIN: ${p.gstin}` : ''}
                    </option>
                  ))}
                </select>
                {parties.length === 0 && (
                  <p className="text-[10px] text-[var(--color-error)] mt-1 ml-2">
                    No parties found. Please add a party under Party Directory.
                  </p>
                )}
                {(editingOrder || stageIssueCtx) && (
                  <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 ml-2 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Party is locked — set at sale creation and cannot be changed.
                  </p>
                )}
                </>
                )}
              </div>

              {/* Items Table Sub-Form — hidden entirely while issuing the invoice:
                  order number/date -> settlement -> inventory toggles */}
              {stageIssueCtx?.stageType !== 'sales_invoice' && (
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

                {/* No overflow-hidden here: the item-search dropdown must be
                    able to escape the table; corners are rounded on the
                    thead/tbody cells instead. */}
                <div className="border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-surface-container)]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-[10px] uppercase border-b border-[var(--color-outline-variant)]">
                        <th className="py-2.5 px-3 min-w-[240px] first:rounded-tl-2xl">Item / Product</th>
                        <th className="py-2.5 px-3 w-44">{formType === 'sales' ? 'Dispatch Location' : 'Receiving Location'}</th>
                        <th className="py-2.5 px-3 w-28">Quantity</th>
                        <th className="py-2.5 px-3 w-28">Rate ({settings.currency?.symbol || '₹'})</th>
                        <th className="py-2.5 px-3 w-24">GST Slab</th>
                        <th className="py-2.5 px-3 w-32 text-right">Line Total</th>
                        <th className="py-2.5 px-3 w-10 text-center last:rounded-tr-2xl"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-outline-variant)]/60 [&>tr:last-child>td:first-child]:rounded-bl-2xl [&>tr:last-child>td:last-child]:rounded-br-2xl">
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
                            {/* Material selection (typable, searchable by code or name) */}
                            <td className="py-2 px-3">
                              <SearchableSelect
                                value={row.itemId}
                                onChange={(v) => handleFormItemChange(idx, 'itemId', v)}
                                placeholder="Type item code or name..."
                                closedDisplay={selectedProd ? `${selectedProd.code} (${selectedProd.name})` : ''}
                                options={productItems.map((p) => ({
                                  value: p.id,
                                  label: p.code,
                                  sub: `(${p.name}) · Qty: ${p.currentStock || 0} ${p.unit}`,
                                }))}
                              />
                            </td>

                            {/* Location selection (typable, searchable) */}
                            <td className="py-2 px-3">
                              {!selectedProd ? (
                                <SearchableSelect
                                  value=""
                                  onChange={() => {}}
                                  disabledText="-- Select Item First --"
                                />
                              ) : prodLocations.length === 0 ? (
                                <SearchableSelect
                                  value=""
                                  onChange={() => {}}
                                  disabledText="No location added"
                                />
                              ) : (
                                (() => {
                                  const stockLabel = (stock: number | undefined) =>
                                    `${formType === 'sales' ? 'Avail' : 'Stock'}: ${stock ?? 0} ${selectedProd.unit}`;
                                  const selectedLocName = row.location || prodLocations[0].locationName;
                                  const selectedLoc = prodLocations.find((l) => l.locationName === selectedLocName) || prodLocations[0];
                                  return (
                                    <SearchableSelect
                                      value={selectedLocName}
                                      onChange={(v) => handleFormItemChange(idx, 'location', v)}
                                      placeholder="Type location name..."
                                      closedDisplay={`${selectedLoc.locationName} (${stockLabel(selectedLoc.currentStock)})`}
                                      options={prodLocations.map((loc) => ({
                                        value: loc.locationName,
                                        label: loc.locationName,
                                        sub: stockLabel(loc.currentStock),
                                      }))}
                                    />
                                  );
                                })()
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

                            {/* GST Slab (per item, typable/searchable) */}
                            <td className="py-2 px-3">
                              <SearchableSelect
                                value={row.gstRate}
                                onChange={(v) => handleFormItemChange(idx, 'gstRate', v)}
                                disabledText={!selectedProd ? '--' : undefined}
                                closedDisplay={row.gstRate === '' ? '--' : undefined}
                                options={[
                                  { value: '', label: '--' },
                                  { value: '0', label: '0% (GST Exempt)' },
                                  { value: '5', label: '5% (Transportation / Raw GSB)' },
                                  { value: '12', label: '12% (Machinery / Consumables)' },
                                  { value: '18', label: '18% (Standard Hot Asphalt / Bitumen)' },
                                  { value: '28', label: '28% (Luxury / Spares)' },
                                  ...(row.gstRate !== '' && !['0', '5', '12', '18', '28'].includes(row.gstRate)
                                    ? [{ value: row.gstRate, label: `${row.gstRate}% (Item Default Slab)` }]
                                    : []),
                                ]}
                              />
                            </td>

                            {/* Line Total */}
                            <td className="py-2 px-3 text-right text-xs font-bold text-[var(--color-on-surface)]">
                              {formatCurrency2(lineTotal)}
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
              )}

              {/* Payment Mode & Cash/Bank Settlement Account (Optional Switch) — Sales Order & Invoice stages */}
              {(formStage === 'sales_invoice' || formStage === 'sales_order') && (
              <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl transition-colors ${formSettlementType !== 'none' ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'}`}>
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                        {formType === 'sales' ? 'Payment Settlement & Deposit Account' : 'Payment Disbursement & Source Account'}
                      </h4>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                        {settleSectionLocked
                          ? 'The payment flow was applied at an earlier save and cannot be changed'
                          : settleFinalStage
                              ? 'The payment flow must be applied when the invoice is issued — choose Book on credit or settle into a Cash / Bank account'
                              : formSettlementType !== 'none'
                                ? 'Update the payment flow — book on credit or settle into a Cash / Bank account'
                                : "Don't touch — nothing will be posted for this order"}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch: OFF = Don't touch payment settlement; ON =
                      Update payment flow. Locked ON once the flow was applied,
                      or at the invoice stage where the flow is compulsory. */}
                  {(() => {
                    const flowLocked = settleSectionLocked || settleFinalStage;
                    const shown = formSettlementType !== 'none' || settleSectionLocked || settleFinalStage;
                    return (
                    <label className={`inline-flex items-center gap-2.5 select-none ${flowLocked ? 'opacity-70' : 'cursor-pointer'}`}>
                    <span className="text-xs font-bold text-[var(--color-on-surface)]">
                      {settleSectionLocked ? 'Payment Flow — Already Done' : 'Update payment flow'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={shown}
                      disabled={flowLocked}
                      title={settleSectionLocked
                        ? `The payment flow for this ${formType === 'sales' ? 'sale' : 'purchase'} was applied at an earlier save and cannot be changed`
                        : settleFinalStage
                        ? 'A payment flow must be applied when the invoice is issued — it cannot be switched off at this stage'
                        : undefined}
                      onClick={() => setFormSettlementType(formSettlementType === 'none' ? 'credit' : 'none')}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        shown ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                      } ${flowLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          shown ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                    );
                  })()}
                </div>

                {formSettlementType !== 'none' ? (
                  <div className="space-y-3 pt-1 border-t border-[var(--color-outline-variant)]/60 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Credit / Account chooser — value '' = Book on credit */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                          Choose Cash / Bank / Credit <span className="text-[var(--color-error)] font-bold">*</span>
                        </label>
                        <select
                          // NOTE: no `required` — the empty value is the valid
                          // "Book on credit" flow (validation happens on save).
                          value={formSettlementType === 'account' ? formAccountId : ''}
                          disabled={settleSectionLocked}
                          onChange={(e) => {
                            setFormAccountId(e.target.value);
                            setFormSettlementType(e.target.value ? 'account' : 'credit');
                          }}
                          className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${settleSectionLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <option value="">
                            Book on credit — {formType === 'sales' ? 'Receivable moves to the Party ledger (no cash movement)' : 'Payable moves to the Party ledger (no cash movement)'}
                          </option>
                          {accounts
                            .filter((a) => a.isActive)
                            .map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} [{acc.type === 'bank' ? (acc.bankName || 'Bank A/c') : 'Cash'}] — Bal: {formatCurrency(acc.currentBalance || 0)}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Mode of payment — only once an account is chosen */}
                      {formSettlementType === 'account' && formAccountId && (
                        <div>
                          <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                            Mode of Payment <span className="text-[var(--color-error)] font-bold">*</span>
                          </label>
                          <select
                            required
                            value={formPaymentMode}
                            disabled={settleSectionLocked}
                            onChange={(e) => setFormPaymentMode(e.target.value as PaymentMode)}
                            className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${settleSectionLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <option value="bank_transfer">Bank Transfer / IMPS</option>
                            <option value="neft_rtgs">NEFT / RTGS</option>
                            <option value="upi">UPI / QR Code</option>
                            <option value="cheque">Cheque / Demand Draft</option>
                            <option value="cash">Cash Counter / Petty Cash</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {accounts.length === 0 && (
                      <div className="p-2.5 rounded-xl bg-[var(--color-error-container)]/40 border border-[var(--color-error)]/30 flex items-center gap-2 text-[11px] text-[var(--color-error)] font-medium">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>No Cash/Bank accounts configured. Please create an account under Cash & Bank to book immediate settlement.</span>
                      </div>
                    )}

                    {/* Locked "already applied" banners vs pre-save banners */}
                    {settleSectionLocked && formSettlementType === 'account' ? (
                      <div className="p-3 rounded-xl bg-[var(--color-success-container)]/40 border border-[var(--color-success)]/30 flex items-center justify-between gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                        <span>
                          Payment of <strong className="text-[var(--color-on-surface)]">{formatCurrency(stageIssueCtx?.settledAmount ?? (editingOrder as any)?.settledAmount ?? formCalculations.totalAmount)}</strong>{' '}
                          was already settled into the sale's Cash/Bank account — no further voucher will be posted.
                        </span>
                        <span className="text-[10px] font-bold text-[var(--color-on-success-container)] uppercase bg-[var(--color-success-container)] px-2.5 py-0.5 rounded-full shrink-0">
                          Flow Applied
                        </span>
                      </div>
                    ) : settleSectionLocked && formSettlementType === 'credit' ? (
                      <div className="p-3 rounded-xl bg-[var(--color-primary-container)]/40 border border-[var(--color-primary)]/30 flex items-center justify-between gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                        <span>
                          <strong className="text-[var(--color-on-surface)]">Receivable</strong> of{' '}
                          <strong className="text-[var(--color-on-surface)] font-bold">{formatCurrency(stageIssueCtx?.settledAmount ?? (editingOrder as any)?.settledAmount ?? formCalculations.totalAmount)}</strong>{' '}
                          is already booked on the party ledger — flow applied; the voucher re-locks to the invoice total when the invoice stage is issued.
                        </span>
                        <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase bg-[var(--color-primary-container)]/60 px-2.5 py-0.5 rounded-full shrink-0">
                          Flow Applied
                        </span>
                      </div>
                    ) : formSettlementType === 'credit' ? (
                      <div className="p-2.5 rounded-xl bg-[var(--color-primary-container)]/40 border border-[var(--color-primary)]/30 flex items-center justify-between gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                        <span>
                          <strong className="text-[var(--color-on-surface)]">{formType === 'sales' ? 'Receivable' : 'Payable'}</strong> of{' '}
                          <strong className="text-[var(--color-on-surface)] font-bold">{formatCurrency(formCalculations.totalAmount)}</strong>{' '}
                          will be booked against the {formType === 'sales' ? 'party' : 'vendor'} on credit — no Cash/Bank movement.
                          {' '}No {formType === 'sales' ? 'receipt' : 'payout'} voucher will be posted.
                        </span>
                        <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase bg-[var(--color-primary-container)]/60 px-2.5 py-0.5 rounded-full shrink-0">
                          Credit {formType === 'sales' ? 'Sale' : 'Purchase'}
                        </span>
                      </div>
                    ) : formAccountId ? (
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
                    ) : null}
                  </div>
                ) : settleSectionLocked ? (
                  formSettlementType === 'account' ? (
                  <div className="p-3 rounded-xl bg-[var(--color-success-container)]/40 border border-[var(--color-success)]/30 flex items-center justify-between text-xs text-[var(--color-on-surface-variant)]">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                      <span>
                        Payment of <strong className="text-[var(--color-on-surface)]">{formatCurrency(stageIssueCtx?.settledAmount ?? (editingOrder as any)?.settledAmount ?? 0)}</strong>{' '}
                        was already settled into the sale's Cash/Bank account — no further voucher will be posted.
                      </span>
                    </span>
                    <span className="text-[10px] font-bold text-[var(--color-on-success-container)] uppercase bg-[var(--color-success-container)] px-2.5 py-0.5 rounded-full shrink-0">
                      Flow Applied
                    </span>
                  </div>
                  ) : (
                  <div className="p-3 rounded-xl bg-[var(--color-primary-container)]/40 border border-[var(--color-primary)]/30 flex items-center justify-between text-xs text-[var(--color-on-surface-variant)]">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                      <span>
                        {formType === 'sales' ? 'Receivable' : 'Payable'} of{' '}
                        <strong className="text-[var(--color-on-surface)]">{formatCurrency(stageIssueCtx?.settledAmount ?? (editingOrder as any)?.settledAmount ?? formCalculations.totalAmount)}</strong>{' '}
                        is already booked on the party ledger — flow applied; the voucher re-locks to the final document's total at the next {formType === 'sales' ? 'invoice' : 'goods-receipt'} stage.
                      </span>
                    </span>
                    <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase bg-[var(--color-primary-container)]/60 px-2.5 py-0.5 rounded-full shrink-0">
                      Flow Applied
                    </span>
                  </div>
                  )
                ) : (
                  <div className="p-3 rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)]/60 flex items-center justify-between text-xs text-[var(--color-on-surface-variant)]">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-outline)]" />
                      <span>
                        {editingOrder
                          ? 'Nothing will be posted while the flow is switched off — enable the toggle to book this order on credit or settle it into a Cash/Bank account from this edit.'
                          : "Nothing will be posted — no invoice/bill voucher, no party ledger move, no Cash/Bank movement. You can apply the payment flow later by editing the order or issuing the next document."}
                      </span>
                    </span>
                    <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase bg-[var(--color-surface-container-high)] px-2.5 py-0.5 rounded-full shrink-0">
                      No Entry
                    </span>
                  </div>
                )}
              </div>
              )}

              {/* Stockyard Inventory & Cash application toggles — ONE-SHOT per order.
                  Stock posts a sale_dispatch / purchase_inward movement at this
                  stage save the first time the user enables it; the server refuses
                  double application (master flag). Cash applies through the
                  Payment Settlement section on the invoice stage (voucher
                  posting — once per order). The inventory switch also shows on
                  the sales-ORDER EDIT form: checked + disabled once applied,
                  freely toggleable (and applied on save) while not. */}
              {formStage !== 'quotation' && (
                <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl transition-colors ${updateInventory ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'}`}>
                        <Boxes className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                          {formType === 'sales' ? 'Deduct Stockyard Inventory Now' : 'Receive Into Stockyard Inventory Now'}
                        </h4>
                        <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                          {Boolean(stageIssueCtx?.inventoryApplied || (editingOrder as any)?.inventoryApplied)
                            ? 'Inventory is already updated for this sale — no further stock movement will be written.'
                            : stageIssueCtx?.stageType === 'sales_invoice'
                            ? 'Issuing the invoice permanently updates this sale\'s inventory — it was not applied at an earlier stage, so the dispatch posts now and cannot be switched off.'
                            : updateInventory
                            ? (formType === 'sales'
                              ? 'FIFO sale_dispatch ledger rows will be written at this stage save (one-time per sale)'
                              : 'FIFO purchase_inward ledger rows will be written at this stage save (one-time per purchase)')
                            : 'No stock movement yet — you can enable it later at any stage save (applies once)'}
                        </p>
                      </div>
                    </div>

                    {(() => {
                      const already = Boolean(stageIssueCtx?.inventoryApplied || (editingOrder as any)?.inventoryApplied);
                      // Issuing the invoice (stage-issue OR create): PERMANENT-ON
                      // — applies here if it was not applied at the sales-order
                      // stage; cannot be unchecked at this stage.
                      const invoiceForcedOn = (stageIssueCtx?.stageType || formStage) === 'sales_invoice' && !already;
                      const locked = already || invoiceForcedOn;
                      const shown = locked || updateInventory;
                      return (
                    <label className={`inline-flex items-center gap-2.5 select-none ${locked ? 'opacity-70' : 'cursor-pointer'}`}>
                      <span className="text-xs font-bold text-[var(--color-on-surface)]">
                        {already ? 'Inventory Updated' : shown ? 'Update Inventory' : 'Inventory Untouched'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={shown}
                        disabled={locked}
                        title={already
                          ? 'Inventory is already updated for this sale'
                          : invoiceForcedOn
                          ? 'Inventory must be updated when the invoice is issued — cannot be unchecked at this stage'
                          : undefined}
                        onClick={() => setUpdateInventory(!updateInventory)}
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          shown ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                        } ${already ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            shown ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Transport & Logistics Section (Optional Switch for Sales) */}
              {formType === 'sales' && (
                <div className="hidden bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
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

                    {/* Toggle Switch (disabled for now — logistics coming soon) */}
                    <label className="inline-flex items-center gap-2.5 select-none opacity-60">
                      <span className="text-xs font-bold text-[var(--color-on-surface)]">
                        {includeLogistics ? 'Logistics Added' : 'No Transport'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={includeLogistics}
                        disabled
                        title="Logistics assignment coming soon"
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
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

                {/* Totals Summary — per-item GST summed across rows */}
                <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-2 text-xs">
                  <div className="flex justify-between font-medium text-[var(--color-on-surface-variant)]">
                    <span>Material Subtotal:</span>
                    <span className="font-bold text-[var(--color-on-surface)]">{formatCurrency2(formCalculations.subtotal)}</span>
                  </div>

                  <div className="flex justify-between font-medium text-[var(--color-on-surface-variant)]">
                    <span>Total GST (per-item slabs):</span>
                    <span className="font-bold text-[var(--color-on-surface)]">{formatCurrency2(formCalculations.taxAmount)}</span>
                  </div>

                  {formCalculations.transportCharges > 0 && (
                    <div className="flex justify-between font-medium text-[var(--color-on-surface-variant)]">
                      <span>Transport Charges:</span>
                      <span className="font-bold text-[var(--color-on-surface)]">{formatCurrency2(formCalculations.transportCharges)}</span>
                    </div>
                  )}

                  <div className="h-px bg-[var(--color-outline-variant)] my-2" />

                  <div className="flex justify-between items-center text-sm font-black text-[var(--color-on-surface)]">
                    <span>Grand Total:</span>
                    <span className="text-[var(--color-primary)] text-base">{formatCurrency2(formCalculations.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Error/Notice */}
              {formType === 'purchase' && (
                <div className="p-3.5 bg-[var(--color-success-container)]/30 border border-[var(--color-success)]/30 rounded-2xl text-[11px] text-[var(--color-on-success-container)] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Stock Inward notice:</span> Completing or saving this purchase order will increase the live silo/tank balances of the designated materials instantly.
                  </div>
                </div>
              )}

              {/* DOCUMENTS (S3 upload feature): attach while creating (staged),
                  editing a stage, or issuing a new stage — links to the order
                  immediately when the order already exists */}
              <OrderDocumentsSection
                feature="sale"
                entityId={editingOrder?.id || stageIssueCtx?.saleId}
                staged={editingOrder || stageIssueCtx ? undefined : stagedSaleDocs}
                onStagedChange={editingOrder || stageIssueCtx ? undefined : setStagedSaleDocs}
              />

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => {
                    setStageIssueCtx(null);
                    setIsFormOpen(false);
                  }}
                  className="px-5 py-2.5 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-high)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-90 transition-all shadow-xs"
                >
                  {editingOrder ? 'Save Changes' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ORDER DETAIL VIEW MODAL --- */}
      {/* ORDER DETAILS MODAL — shared with the party statement (same modal,
          same issue/edit actions and document preview) */}
      <OrderDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        order={selectedOrder}
        parties={parties}
        items={items}
        settings={settings}
        onIssueStage={(order, stageType) => {
          if (order.type === 'purchase') {
            setPurchaseOpenStage(stageType as PurchaseStage);
            setPurchaseCreateStage('rfq');
            setEditingPurchaseOrder(order);
            setIsPurchaseModalOpen(true);
            setIsDetailOpen(false);
          } else {
            openIssueStageForm(order, stageType as SalesStage);
          }
        }}
        onEditOrder={(order, e) => {
          setIsDetailOpen(false);
          handleOpenEdit(order, e);
        }}
      />

      {/* --- COMMERCIAL DOCUMENT PREVIEW MODAL --- */}
      {/* Commercial-document preview (shared component) */}
      <OrderDocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        order={previewOrder}
        stage={previewStage}
        parties={parties}
        items={items}
        settings={settings}
      />

      {/* Add Purchase 3-Stage Workflow Modal */}
      {isPurchaseModalOpen && (
        <AddPurchaseModal
          isOpen={isPurchaseModalOpen}
          onClose={() => {
            setIsPurchaseModalOpen(false);
            setEditingPurchaseOrder(null);
            setPurchaseCreateStage('rfq');
            setPurchaseOpenStage(undefined);
          }}
          existingOrder={editingPurchaseOrder}
          createStage={purchaseCreateStage}
          openStage={purchaseOpenStage}
          parties={parties}
          items={items}
          settings={settings}
          onAddPurchase={onAddPurchase}
          onUpdatePurchase={onUpdatePurchase}
          onAddPurchaseStage={onAddPurchaseStage}
          onCancelOrder={handleCancelPurchaseOrder}
        />
      )}

    </div>
  );
}
