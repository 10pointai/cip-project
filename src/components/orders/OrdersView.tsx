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
  Calendar,
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

/**
 * Adapter: shapes the relational Sale/Purchase models (masters + items +
 * stage-history child tables) into the Order-shaped view used by the card
 * list, the detail panel and the print preview. The LATEST stage drives the
 * displayed document stage; totals fall back to per-line math when a stage
 * has no figures (RFQ).
 */
// Sales stage document meta (labels + icons for tabs/cards)
const SALES_STAGE_META: Record<string, { label: string; icon: any; tone: string }> = {
  quotation: { label: 'Quotation', icon: FileText, tone: 'text-[var(--color-secondary)]' },
  sales_order: { label: 'Sales Order', icon: ClipboardList, tone: 'text-[var(--color-success)]' },
  proforma_invoice: { label: 'Proforma Invoice (legacy)', icon: Receipt, tone: 'text-[var(--color-primary)]' },
  delivery_note: { label: 'Delivery Note (legacy)', icon: Truck, tone: 'text-[var(--color-warning)]' },
  sales_invoice: { label: 'GST Tax Invoice', icon: FileCheck, tone: 'text-[var(--color-success)]' },
};

interface StageDocDisplay {
  stageType: SalesStage;
  stageNumber: string;
  date: string;
  notes?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  items: OrderItem[];
}

interface OrderDisplay extends Order {
  inventoryApplied: boolean;
  cashApplied: boolean;
  // Cash & Bank settlement (hydrated sale/purchase master fields)
  settlementAccountId?: string;
  settlementAccountName?: string;
  invoiceVoucherNumber?: string;
  settlementVoucherNumber?: string;
  settledAmount?: number;
  settledDate?: string;
  /** paymentMode: inherited from Order (kept for the settlement record) */
  /** Stage document numbers as issued (chronological) */
  stageNumbers?: Array<{ type: string; number: string; date: string }>;
  /** Full stage documents with their OWN line values (quotation vs order...) */
  stageDocs?: StageDocDisplay[];
}

function saleToDisplay(s: Sale): OrderDisplay {
  const items: OrderItem[] = (s.items || []).map((li) => ({
    itemId: li.itemId,
    itemName: li.itemName || '',
    itemCode: (li as any).itemCode,
    quantity: li.quantity,
    unit: li.unit || '',
    rate: li.rate,
    amount: (li.amount ?? li.quantity * li.rate),
    gstRate: li.gstRate,
    location: li.location,
  }));
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const taxAmount = items.reduce((sum, i) => sum + (i.quantity * i.rate * (i.gstRate || 0)) / 100, 0);
  const transportCharges = s.transportCharges || 0;
  const latestStage = (s.stages || []).length > 0 ? s.stages[s.stages.length - 1] : undefined;
  const stageDocs: StageDocDisplay[] = (s.stages || []).map((st) => ({
    stageType: st.stageType,
    stageNumber: st.stageNumber,
    date: st.date,
    notes: st.notes,
    subtotal: st.subtotal,
    taxAmount: st.taxAmount,
    totalAmount: st.totalAmount,
    items: (st.items || []).map((li) => ({
      itemId: li.itemId,
      itemName: li.itemName || '',
      itemCode: (li as any).itemCode,
      quantity: li.quantity,
      unit: li.unit || '',
      rate: li.rate,
      amount: li.amount ?? li.quantity * li.rate,
      gstRate: li.gstRate,
      location: li.location,
    }) as OrderItem),
  }));
  return {
    id: s.id,
    orderNumber: s.saleNumber,
    type: 'sales',
    partyId: s.partyId,
    partyName: s.partyName,
    date: s.date,
    status: s.status,
    stage: latestStage?.stageType || 'sales_order',
    accountId: '',
    items,
    taxRateGst: subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) / 100 : 0,
    taxAmount: latestStage?.taxAmount ?? taxAmount,
    totalAmount: latestStage?.totalAmount ?? subtotal + taxAmount + transportCharges,
    notes: s.notes,
    vehicleNo: s.vehicleNo,
    driverName: s.driverName,
    transportCharges,
    inventoryApplied: s.inventoryApplied,
    cashApplied: s.cashApplied,
    settlementAccountId: (s as any).settlementAccountId || undefined,
    settlementAccountName: (s as any).settlementAccountName || undefined,
    paymentMode: (s as any).paymentMode,
    invoiceVoucherNumber: (s as any).invoiceVoucherNumber,
    settlementVoucherNumber: (s as any).settlementVoucherNumber,
    settledAmount: (s as any).settledAmount,
    settledDate: (s as any).settledDate,
    stageNumbers: (s.stages || []).map((st) => ({ type: st.stageType, number: st.stageNumber, date: st.date })),
    stageDocs,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  } as OrderDisplay;
}

function purchaseToDisplay(p: Purchase): OrderDisplay {
  const items: OrderItem[] = (p.items || []).map((li) => ({
    itemId: li.itemId,
    itemName: li.itemName || '',
    itemCode: (li as any).itemCode,
    quantity: li.quantity,
    unit: li.unit || '',
    rate: li.rate,
    amount: li.amount ?? li.quantity * li.rate,
    gstRate: li.gstRate,
    location: li.location,
    receivedQuantity: li.receivedQuantity,
    shortageQuantity: li.shortageQuantity,
    overageQuantity: li.overageQuantity,
  }));
  const isRfqOnly = !(p.stages || []).some((st) => st.stageType !== 'rfq');
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const taxAmount = items.reduce((sum, i) => sum + (i.quantity * i.rate * (i.gstRate || 0)) / 100, 0);
  const latestStage = (p.stages || []).length > 0 ? p.stages[p.stages.length - 1] : undefined;
  const byType = (t: string) => (p.stages || []).find((st) => st.stageType === t);
  return {
    id: p.id,
    orderNumber: p.purchaseNumber,
    type: 'purchase',
    partyId: p.partyId || 'unassigned',
    partyName: p.partyName || (p.partyId ? undefined : 'Unassigned (RFQ Ingestion)'),
    date: p.date,
    status: p.status,
    purchaseStage: latestStage?.stageType,
    rfqDetails: byType('rfq') ? { rfqNumber: byType('rfq')!.stageNumber, ...((byType('rfq') as any).rfqDetails || {}) } as any : undefined,
    poDetails: byType('purchase_order') ? { poNumber: byType('purchase_order')!.stageNumber, ...((byType('purchase_order') as any).poDetails || {}) } as any : undefined,
    receiptDetails: byType('goods_receipt') ? { grnNumber: byType('goods_receipt')!.stageNumber, ...((byType('goods_receipt') as any).receiptDetails || {}) } as any : undefined,
    items,
    taxRateGst: subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) / 100 : 0,
    taxAmount: isRfqOnly ? 0 : (latestStage?.taxAmount ?? taxAmount),
    totalAmount: isRfqOnly ? 0 : (latestStage?.totalAmount ?? subtotal + taxAmount),
    notes: p.notes,
    inventoryApplied: p.inventoryApplied,
    cashApplied: p.cashApplied,
    settlementAccountId: (p as any).settlementAccountId || undefined,
    settlementAccountName: (p as any).settlementAccountName || undefined,
    paymentMode: (p as any).paymentMode,
    invoiceVoucherNumber: (p as any).invoiceVoucherNumber,
    settlementVoucherNumber: (p as any).settlementVoucherNumber,
    settledAmount: (p as any).settledAmount,
    settledDate: (p as any).settledDate,
    stageNumbers: (p.stages || []).map((st) => ({ type: st.stageType, number: st.stageNumber, date: st.date })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  } as OrderDisplay;
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
}

// Typable, searchable picker used by every <select> inside the line-item rows,
// so all columns feel the same (type-to-filter, option list, escaped dropdown).
// Renders as a non-interactive text when `disabledText` is given.
function SearchableSelect({
  options,
  value,
  onChange,
  closedDisplay,
  placeholder = 'Type to search...',
  disabledText,
}: {
  options?: Array<{ value: string; label: string; sub?: string }>;
  value: string;
  onChange: (value: string) => void;
  /** What to show in the closed input; defaults to the selected option's label. */
  closedDisplay?: string;
  placeholder?: string;
  /** When set, renders a dimmed non-interactive placeholder instead of the picker. */
  disabledText?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const lowerQuery = query.trim().toLowerCase();
  const matches = (
    lowerQuery
      ? (options ?? []).filter(
          (o) =>
            o.label.toLowerCase().includes(lowerQuery) ||
            (o.sub ?? '').toLowerCase().includes(lowerQuery)
        )
      : options ?? []
  ).slice(0, 50);

  if (disabledText !== undefined) {
    return (
      <div className="w-full text-xs font-medium text-[var(--color-outline)] cursor-not-allowed select-none truncate">
        {disabledText}
      </div>
    );
  }

  const display = closedDisplay ?? options.find((o) => o.value === value)?.label ?? '';

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : display}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className="w-full bg-transparent text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none"
      />
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-max min-w-[200px] max-w-[280px] max-h-56 overflow-y-auto rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-[10px] text-[var(--color-on-surface-variant)]">
              No matches for "{query}"
            </p>
          ) : (
            matches.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full px-3 py-2 text-left text-[11px] hover:bg-[var(--color-surface-container)] transition-colors border-t border-[var(--color-outline-variant)]/50 first:border-t-0 ${
                  o.value === value ? 'bg-[var(--color-primary-container)]/60' : ''
                }`}
              >
                <span className="font-bold text-[var(--color-on-surface)]">{o.label}</span>
                {o.sub && (
                  <span className="block text-[9px] text-[var(--color-on-surface-variant)]">{o.sub}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
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
}: OrdersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | OrderType>('all');
  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isStageMenuOpen, setIsStageMenuOpen] = useState(false);
  const stageMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderDisplay | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<OrderDisplay | null>(null);
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

  // Payment settlement toggle — the cash posting rules are being specified
  // separately; this UI selects mode/account preferences and is NOT persisted
  // on the sale/purchase model yet.
  const [includePayment, setIncludePayment] = useState<boolean>(false);
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
  } | null>(null);

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
   * Sales stage hierarchy for the row ⋮ popover. The current (latest issued)
   * stage gates what can still be issued — the user can NEVER create same-or-
   * lower documents. Per direction: from quotation -> Sales Order, Proforma,
   * Invoice; from sales_order -> Proforma + Invoice only (Delivery Note never
   * appears in this menu); from proforma / delivery_note -> Invoice; from
   * sales_invoice -> nothing (final).
   */
  // Sales stage ladder for the row ⋮ popover (user's exact rules):
  //   quotation     -> Sales Order (row seeding from quotation), Invoice direct
  //   sales_order   -> Invoice; "View Proforma" shows the SO as a proforma doc
  //   sales_invoice -> sale LOCKED: no edit, no further stages, no cancel/delete
  const salesStageActionMenu = (order: OrderDisplay): Array<{ stageType: SalesStage; label: string; icon: any }> => {
    const current = order.stage || 'sales_order';
    const menu: Array<{ stageType: SalesStage; label: string; icon: any }> = [];
    if (current === 'sales_invoice') return menu; // locked
    if (current === 'quotation') {
      menu.push({ stageType: 'sales_order', label: 'Create Sales Order', icon: Layers });
      menu.push({ stageType: 'sales_invoice', label: 'Issue GST Tax Invoice', icon: FileText });
    } else {
      // sales_order (and legacy proforma/delivery_note rows)
      menu.push({ stageType: 'sales_invoice', label: 'Issue GST Tax Invoice', icon: FileText });
    }
    return menu;
  };
  const isSaleLocked = (order: OrderDisplay) => (order.stage || 'sales_order') === 'sales_invoice';
  const editLabelFor = (order: OrderDisplay) =>
    (order.stage || 'sales_order') === 'quotation' ? 'Edit Quotation' : 'Edit Sales Order';
  const canViewProforma = (order: OrderDisplay) => {
    const c = order.stage || 'sales_order';
    return c === 'sales_order' || c === 'proforma_invoice' || c === 'delivery_note';
  };

  /**
   * Opens the full sales form modal in STAGE-ISSUE mode: lines are seeded as
   * an editable copy of the sale's current-stage items; submit issues the
   * stage document (server stores these rows against the new stage).
   */
  const openIssueStageForm = (order: OrderDisplay, stageType: SalesStage) => {
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
    setIncludePayment(false);
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
    setIsFormOpen(true);
  };

  /** Opens the commercial-document preview for a SPECIFIC stage doc (its own
   *  line values/totals), e.g. printing the quotation alone. */
  const openStageDocPreview = (doc: StageDocDisplay) => {
    if (!selectedOrder) return;
    const subtotal = doc.items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
    const blendedRate = subtotal > 0 ? Math.round((doc.taxAmount / subtotal) * 10000) / 100 : 0;
    setPreviewOrder({
      ...selectedOrder,
      stage: doc.stageType,
      items: doc.items,
      taxRateGst: blendedRate,
      taxAmount: doc.taxAmount,
      totalAmount: doc.totalAmount,
      notes: doc.notes || selectedOrder.notes,
    });
    setPreviewStage(doc.stageType);
    setIsPreviewOpen(true);
  };

  /** Renders ONE stage document card: doc header in its own format, the
   *  stage's own line values, totals + its document actions. */
  const renderStageDocCard = (doc: StageDocDisplay) => {
    const meta = SALES_STAGE_META[doc.stageType] || SALES_STAGE_META.sales_order;
    const MetaIcon = meta.icon;
    return (
      <div className="bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] overflow-hidden">
        {/* Doc header */}
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-[var(--color-surface-container-high)]/60 border-b border-[var(--color-outline-variant)]/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <MetaIcon className={`w-4 h-4 ${meta.tone} shrink-0`} />
            <div className="min-w-0">
              <p className="text-xs font-black text-[var(--color-on-surface)] truncate">
                {meta.label} <span className="text-[var(--color-on-surface-variant)] font-semibold">· {doc.stageNumber}</span>
              </p>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium">Issued {doc.date}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            
            <button
              type="button"
              onClick={() => openStageDocPreview(doc)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-[10px] font-bold hover:opacity-90 transition-all"
            >
              <Printer className="w-3 h-3" /> Open document
            </button>
            {doc.stageType === 'sales_order' && (
              <button
                type="button"
                onClick={() => {
                  setPreviewOrder(selectedOrder);
                  setPreviewStage('proforma_invoice');
                  setIsPreviewOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 border border-[var(--color-primary)]/40 text-[var(--color-primary)] rounded-full text-[10px] font-bold hover:bg-[var(--color-primary-container)]/30 transition-all"
              >
                <Receipt className="w-3 h-3" /> View Proforma
              </button>
            )}
          </div>
        </div>

        {/* Doc line items (its own values) */}
        <div className="px-2 py-2">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="text-[var(--color-on-surface-variant)] font-bold text-[9px] uppercase tracking-wider">
                <th className="py-1.5 px-2">Item</th>
                <th className="py-1.5 px-2">Location</th>
                <th className="py-1.5 px-2 text-right">Qty</th>
                <th className="py-1.5 px-2 text-right">Rate</th>
                <th className="py-1.5 px-2 text-right">GST</th>
                <th className="py-1.5 px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/50">
              {doc.items.map((i, idx) => (
                <tr key={idx}>
                  <td className="py-1.5 px-2 font-semibold text-[var(--color-on-surface)] truncate max-w-[220px]">
                    {i.itemCode ? `${i.itemCode} (${i.itemName})` : i.itemName}
                  </td>
                  <td className="py-1.5 px-2 text-[var(--color-on-surface-variant)] font-medium">{i.location || 'Default Yard'}</td>
                  <td className="py-1.5 px-2 text-right font-bold text-[var(--color-on-surface)]">{i.quantity.toLocaleString('en-IN')} {i.unit}</td>
                  <td className="py-1.5 px-2 text-right text-[var(--color-on-surface-variant)]">{formatCurrency2(i.rate)}</td>
                  <td className="py-1.5 px-2 text-right text-[var(--color-on-surface-variant)]">{i.gstRate ?? 0}%</td>
                  <td className="py-1.5 px-2 text-right font-bold text-[var(--color-on-surface)]">{formatCurrency2(i.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Doc totals */}
        <div className="px-4 py-2.5 border-t border-[var(--color-outline-variant)]/60 flex items-center justify-end gap-4 text-[11px]">
          <span className="text-[var(--color-on-surface-variant)]">Subtotal: <strong className="text-[var(--color-on-surface)]">{formatCurrency2(doc.subtotal)}</strong></span>
          <span className="text-[var(--color-on-surface-variant)]">GST: <strong className="text-[var(--color-on-surface)]">{formatCurrency2(doc.taxAmount)}</strong></span>
          <span className="text-[var(--color-on-surface-variant)]">Total: <strong className="text-[var(--color-primary)]">{formatCurrency2(doc.totalAmount)}</strong></span>
        </div>

        {/* Doc settlement info — Cash & Bank wiring for the invoice stage */}
        {doc.stageType === 'sales_invoice' && selectedOrder && (
          <div className="px-4 py-2.5 border-t border-[var(--color-outline-variant)]/60 flex flex-wrap items-center justify-between gap-2 text-[10px] bg-[var(--color-surface-container-lowest)]">
            <span className="text-[var(--color-on-surface-variant)]">
              Invoice voucher: <strong className="text-[var(--color-on-surface)] font-mono">{selectedOrder.invoiceVoucherNumber || '—'}</strong>
            </span>
            {selectedOrder.settlementVoucherNumber ? (
              <span className="text-[var(--color-on-surface-variant)]">
                Settled {(selectedOrder.settledAmount !== undefined ? formatCurrency2(selectedOrder.settledAmount) : '')}
                {(selectedOrder.paymentMode ? ` · ${(selectedOrder.paymentMode === 'upi' ? 'UPI' : selectedOrder.paymentMode === 'bank_transfer' ? 'Bank Transfer / IMPS' : selectedOrder.paymentMode === 'neft_rtgs' ? 'NEFT / RTGS' : selectedOrder.paymentMode === 'cheque' ? 'Cheque / DD' : 'Cash')}` : '')}
                {' — '}<strong className="text-[var(--color-on-surface)]">{selectedOrder.settlementAccountName || 'Cash/Bank'}</strong>
                {' · Receipt '}{selectedOrder.settlementVoucherNumber ? <strong className="text-[var(--color-on-surface)] font-mono">{selectedOrder.settlementVoucherNumber}</strong> : '—'}
              </span>
            ) : (
              <span className="text-[var(--color-on-surface-variant)] italic">Booked on credit — settle later under Cash &amp; Bank / Party ledger</span>
            )}
          </div>
        )}
      </div>
    );
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
    return currentOrders.filter((o) => {
      const matchesSearch =
        (o.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.partyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.items.some((item) => (item.itemName || '').toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesType = fixedType ? true : (typeFilter === 'all' || o.type === typeFilter);

      return matchesSearch && matchesType;
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
  const handleOpenCreate = (type: OrderType, stage?: SalesStage) => {
    const resolvedType = fixedType || type;
    if (resolvedType === 'purchase') {
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
    setIncludePayment(false);
    setFormAccountId('');
    setFormPaymentMode('bank_transfer' as any);


    // Document number suggested per the chosen starting stage
    setFormOrderNumber(suggestStageNumber('sales', stage || 'quotation'));
    setFormError(null);

    setIsFormOpen(true);
  };

  React.useEffect(() => {
    const handleHeaderAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (
        fixedType === 'purchase' &&
        (customEvent.detail === 'create-po' || customEvent.detail === 'add-purchase')
      ) {
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

  // Handle open Form Modal for Edit
  const handleOpenEdit = (order: OrderDisplay, e: React.MouseEvent) => {
    e.stopPropagation();
    setStageIssueCtx(null);
    if (order.type === 'purchase') {
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
    setUpdateInventory(order.inventoryApplied ? false : true);
    setUpdateCash(false);
    // Settlement only exists on the invoice stage — never carry a stale
    // settle toggle/account from a previously opened invoice form here.
    setIncludePayment(false);
    setFormAccountId('');
    setFormPaymentMode('bank_transfer' as any);
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

    if (formStage === 'sales_invoice' && includePayment) {
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
        // "Settle Payment Now" = the cash application one-shot: posts the
        // payment_in receipt voucher against the chosen account on the server.
        updateCash: includePayment,
        settlementAccountId: formAccountId || undefined,
        paymentMode: formPaymentMode,
        items: itemsList,
      });
      setStageIssueCtx(null);
      setIsFormOpen(false);
      return;
    }

    if (editingOrder) {
      // Master edit: items/notes/logistics/date — stages stay untouched.
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
      });
    } else {
      // Create: master + first stage document (+ toggles for the ONE-SHOT
      // inventory / cash application)
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
        stage: {
          stageType: formStage,
          stageNumber: formOrderNumber.trim(),
          date: formDate,
          notes: formNotes.trim(),
          updateInventory,
          // "Settle Payment Now" = the cash application one-shot: posts the
          // payment_in receipt voucher against the chosen account on the server.
          updateCash: includePayment,
          settlementAccountId: formAccountId || undefined,
          paymentMode: formPaymentMode,
        },
      });
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

          {/* New Order Button (+ Sales Document Stage Popover) */}
          <div className="relative" ref={stageMenuRef}>
            <button
              type="button"
              onClick={() => {
                if (fixedType === 'purchase') {
                  handleOpenCreate('purchase');
                } else {
                  setIsStageMenuOpen((open) => !open);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full transition-all shadow-xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{fixedType === 'sales' ? 'Add Sale' : fixedType === 'purchase' ? 'Add Purchase' : 'New Order'}</span>
            </button>

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
                <th className="py-3.5 px-4">Date</th>
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
                      {/* Date */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[var(--color-on-surface)] flex items-center gap-1">
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
                              ? `Cash applied — receipt voucher ${order.settlementVoucherNumber || ''} posted to ${order.settlementAccountName || 'Cash & Bank'}`
                              : 'Cash not applied yet — booked on credit'}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                              order.cashApplied
                                ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                                : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                            }`}
                          >
                            <Landmark className="w-2.5 h-2.5" /> {order.cashApplied ? 'Cash ✓' : 'Cash —'}
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

                      {/* Action buttons — ⋮ opens a portal popover (fixed above the page) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isSales ? (
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
                          ) : (
                            <button
                              type="button"
                              title="Edit Purchase"
                              onClick={(e) => handleOpenEdit(order, e)}
                              className="p-1.5 text-[var(--color-primary)] hover:opacity-80 hover:bg-[var(--color-primary-container)]/30 rounded-full transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
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
            if (isSaleLocked(target)) {
              return (
                <div className="px-3 py-3 border-t border-[var(--color-outline-variant)]/50 text-[10px] font-bold text-[var(--color-error)] flex items-center gap-2">
                  <Ban className="w-3.5 h-3.5" /> Sale locked — invoice issued
                </div>
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

              {/* Payment Mode & Cash/Bank Settlement Account (Optional Switch) — Invoice Stage Only */}
              {formStage === 'sales_invoice' && (
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

                  {/* Toggle Switch (locked ON once the payment voucher was posted) */}
                  {(() => {
                    const cashAlready = Boolean(stageIssueCtx?.cashApplied);
                    const shown = cashAlready || includePayment;
                    return (
                    <label className={`inline-flex items-center gap-2.5 select-none ${cashAlready ? 'opacity-70' : 'cursor-pointer'}`}>
                    <span className="text-xs font-bold text-[var(--color-on-surface)]">
                      {cashAlready ? 'Payment Already Settled' : includePayment ? 'Settle Payment Now' : 'Book on Credit (Unpaid)'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={shown}
                      disabled={cashAlready}
                      title={cashAlready ? 'Payment was already settled for this sale' : undefined}
                      onClick={() => setIncludePayment(!includePayment)}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        shown ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                      } ${cashAlready ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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
                          disabled={Boolean(stageIssueCtx?.cashApplied)}
                          onChange={(e) => setFormAccountId(e.target.value)}
                          className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${stageIssueCtx?.cashApplied ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                  stageIssueCtx?.cashApplied ? (
                  <div className="p-3 rounded-xl bg-[var(--color-success-container)]/40 border border-[var(--color-success)]/30 flex items-center justify-between text-xs text-[var(--color-on-surface-variant)]">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                      <span>
                        Payment of <strong className="text-[var(--color-on-surface)]">{formatCurrency(stageIssueCtx.settledAmount ?? 0)}</strong>{' '}
                        was already settled into the sale's Cash/Bank account — no further voucher will be posted.
                      </span>
                    </span>
                    <span className="text-[10px] font-bold text-[var(--color-on-success-container)] uppercase bg-[var(--color-success-container)] px-2.5 py-0.5 rounded-full shrink-0">
                      Payment Settled
                    </span>
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
                  )
                )}
              </div>
              )}

              {/* Stockyard Inventory & Cash application toggles — ONE-SHOT per order.
                  Stock posts a sale_dispatch / purchase_inward movement at this
                  stage save the first time the user enables it; the server refuses
                  double application (master flag). Cash applies through the
                  Payment Settlement section on the invoice stage (voucher
                  posting — once per order). */}
              {!editingOrder && (
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
                          {stageIssueCtx?.inventoryApplied
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
                      const already = Boolean(stageIssueCtx?.inventoryApplied);
                      // Issuing the invoice: PERMANENT-ON — applies here if it
                      // was not applied at the sales-order stage; cannot be
                      // unchecked at this stage.
                      const invoiceForcedOn = stageIssueCtx?.stageType === 'sales_invoice' && !already;
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
                  {selectedOrder.type === 'sales' ? (
                    <h3 className="text-base font-black text-[var(--color-on-surface)]">{selectedOrder.date}</h3>
                  ) : (
                    <>
                      <h3 className="text-base font-black text-[var(--color-on-surface)]">{selectedOrder.orderNumber}</h3>
                      <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Booked on {selectedOrder.date}</p>
                    </>
                  )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedOrder.type === 'purchase' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewOrder(selectedOrder);
                      setPreviewStage(selectedOrder.stage || 'sales_order');
                      setIsPreviewOpen(true);
                    }}
                    title="Print this sale document"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsDetailOpen(false)}
                  className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
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

              {/* Party (plain — no card) */}
              <div>
                <p className="text-xs font-black text-[var(--color-on-surface)]">
                  {parties.find((p) => p.id === selectedOrder.partyId)?.name || selectedOrder.partyName || '—'}
                </p>
                {(() => {
                  const party = parties.find((p) => p.id === selectedOrder.partyId);
                  return party?.tradeName ? (
                    <p className="text-[11px] text-[var(--color-on-surface-variant)] font-medium">({party.tradeName})</p>
                  ) : null;
                })()}
                {(() => {
                  const party = parties.find((p) => p.id === selectedOrder.partyId);
                  return party?.category ? (
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-0.5">{party.category}</p>
                  ) : null;
                })()}
              </div>

              {/* SALES — every issued stage document (values in its own format) + create buttons */}
              {selectedOrder.type === 'sales' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                    Stage Documents
                  </h4>

                  {(() => {
                    const docs = selectedOrder.stageDocs || [];
                    if (docs.length === 0) return null;
                    const active = docs.find((d) => d.stageType === (detailStageTab || selectedOrder.stage)) || docs[docs.length - 1];
                    return (
                      <>
                        {/* Stage tabs — click a stage to view its document data */}
                        <div className="flex flex-wrap gap-1.5">
                          {docs.map((d) => {
                            const meta = SALES_STAGE_META[d.stageType] || SALES_STAGE_META.sales_order;
                            const isActive = d.stageType === active.stageType;
                            const isCurrent = d.stageType === (selectedOrder.stage || 'sales_order');
                            return (
                              <button
                                key={d.stageType + d.stageNumber}
                                type="button"
                                onClick={() => setDetailStageTab(d.stageType)}
                                className={`px-3.5 py-2 rounded-full text-[11px] font-bold transition-all border text-left ${
                                  isActive
                                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)] shadow-xs'
                                    : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)]'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <meta.icon className="w-3.5 h-3.5 shrink-0" />
                                  {meta.label}
                                  {isCurrent && <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/25' : 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'}`}>current</span>}
                                </span>
                                <span className={`block text-[9px] font-semibold mt-0.5 ${isActive ? 'opacity-80' : 'opacity-70'}`}>
                                  {d.stageNumber} · {d.date}
                                </span>
                              </button>
                            );
                          })}
                          {/* Next stages — as dashed create buttons in the tab row */}
                          {!isSaleLocked(selectedOrder) && salesStageActionMenu(selectedOrder).map((sa) => {
                            const StageIcon = sa.icon;
                            return (
                              <button
                                key={sa.stageType}
                                type="button"
                                title={`Issue ${sa.label}`}
                                onClick={() => openIssueStageForm(selectedOrder, sa.stageType)}
                                className="flex flex-col items-start px-3.5 py-2 rounded-full text-[11px] font-bold border border-dashed border-[var(--color-primary)]/50 text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/30 transition-all"
                              >
                                <span className="flex items-center gap-1">
                                  <StageIcon className="w-3.5 h-3.5" />+ {sa.label}
                                </span>
                              </button>
                            );
                          })}
                          {isSaleLocked(selectedOrder) && (
                            <span className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold text-[var(--color-error)] bg-[var(--color-error-container)]/25 border border-[var(--color-error)]/30">
                              <Ban className="w-3 h-3" /> Sale locked — invoice issued
                            </span>
                          )}
                        </div>

                        {/* The active stage document */}
                        {renderStageDocCard(active)}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Items List (PURCHASES) */}
              {selectedOrder.type === 'purchase' && (
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
                          <td className="py-2.5 px-3 font-semibold text-[var(--color-on-surface)]">
                            {i.itemCode ? `${i.itemCode} (${i.itemName})` : i.itemName}
                          </td>
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
              )}

              

              {/* Actions Footer */}
              <div className="flex items-center justify-end pt-3 border-t border-[var(--color-outline-variant)]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDetailOpen(false)}
                    className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    Close
                  </button>
                  {selectedOrder.type === 'sales' && isSaleLocked(selectedOrder) ? null : (
                    <button
                      type="button"
                      onClick={(e) => {
                        setIsDetailOpen(false);
                        handleOpenEdit(selectedOrder, e);
                      }}
                      className="flex items-center gap-1 px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-90 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" /> {selectedOrder.type === 'sales' ? editLabelFor(selectedOrder) : 'Edit Purchase'}
                    </button>
                  )}
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
                          <p className="font-bold text-[#1c1b1f]">
                            {item.itemCode ? `${item.itemCode} (${item.itemName})` : item.itemName}
                          </p>
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
          onAddPurchase={onAddPurchase}
          onUpdatePurchase={onUpdatePurchase}
          onAddPurchaseStage={onAddPurchaseStage}
          onCancelOrder={handleCancelPurchaseOrder}
        />
      )}

    </div>
  );
}
