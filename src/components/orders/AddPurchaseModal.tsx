import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Boxes,
  Building,
  Landmark,
  FileText,
  FileCheck,
  ClipboardList,
  ArrowDownLeft,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Ban,
  Check,
  CheckCircle2,
  UserRound,
} from 'lucide-react';
import {
  Order,
  Party,
  Item,
  CompanySettings,
  Purchase,
  PurchaseStage,
  PaymentMode,
} from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { SearchableSelect } from './SearchableSelect';

interface AddPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Existing purchase shown as the Order-shaped display adapter from OrdersView
   *  (carries the one-shot flags on top of the legacy Order shape) */
  existingOrder?: (Order & { inventoryApplied?: boolean }) | null;
  parties: Party[];
  items: Item[];
  settings: CompanySettings;
  /** First-stage save (no purchase record yet): creates the master + first stage */
  onAddPurchase: (payload: any) => any;
  /** Master-level updates (items / notes / vendor) — inventory compensation on edit is server-side */
  onUpdatePurchase: (id: string, updates: any) => any;
  /** Save/advance a stage document (RFQ → PO → GRN); one-shot inventory rides on stageInput */
  onAddPurchaseStage: (id: string, stageInput: any) => any;
  onCancelOrder?: (orderId: string) => void;
  /** NEW purchase: the stage the popover picked (rfq | purchase_order | goods_receipt) */
  createStage?: PurchaseStage;
  /** SUCCESSIVE stage for an existing purchase (RFQ → PO → GRN advance) —
   *  the form opens directly at this stage document, never backwards */
  openStage?: PurchaseStage;
}

const GST_SLABS = [
  { value: '0', label: '0% (GST Exempt)' },
  { value: '5', label: '5% (Transportation / Raw GSB)' },
  { value: '12', label: '12% (Machinery / Consumables)' },
  { value: '18', label: '18% (Standard Hot Asphalt / Bitumen)' },
  { value: '28', label: '28% (Luxury / Spares)' },
];

/** Stage metadata for titles, badges & copy (purchase-side terminology) */
const STAGE_META: Record<PurchaseStage, { label: string; short: string; icon: any; desc: string }> = {
  rfq: {
    label: 'Request For Quotation',
    short: 'Request Quotation',
    icon: FileText,
    desc: 'Supplier rate solicitation',
  },
  purchase_order: {
    label: 'Purchase Order',
    short: 'Purchase Order',
    icon: ClipboardList,
    desc: 'Confirmed procurement sent to supplier',
  },
  goods_receipt: {
    label: 'Goods Receiving',
    short: 'Goods Receiving',
    icon: FileCheck,
    desc: 'Gate delivery, inspection & shortage reconciliation',
  },
};

export function AddPurchaseModal({
  isOpen,
  onClose,
  existingOrder,
  parties,
  items,
  settings,
  onAddPurchase,
  onUpdatePurchase,
  onAddPurchaseStage,
  onCancelOrder,
  createStage,
  openStage,
}: AddPurchaseModalProps) {
  // The stage THIS modal session writes. Successive-stage opens (openStage)
  // sit directly on the target document; plain edits sit on the order's
  // current stage (legacy purchses without stages default to PO); new
  // purchases start at the popover-picked stage.
  const currentStage =
    openStage ||
    createStage ||
    (existingOrder && !openStage ? (existingOrder.purchaseStage as PurchaseStage) || 'purchase_order' : 'rfq');
  const isRfq = currentStage === 'rfq';
  const isGrn = currentStage === 'goods_receipt';
  /** Plain edit of the order's CURRENT stage document (number locked) */
  const editingCurrent = Boolean(existingOrder && !openStage);
  /** Successive-stage document issued over an existing order (mirror of
   *  sales "Issue GST Tax Invoice" — locked values, purchase-side exceptions) */
  const issuingOverExisting = Boolean(existingOrder && openStage);

  const today = new Date().toISOString().split('T')[0];

  // ---- Reference number & date (mirror of the sales Order Number / Date) ----
  const suggestRef = (stageType: PurchaseStage): string => {
    const year = new Date().getFullYear();
    const prefix = stageType === 'rfq' ? 'RFQ' : stageType === 'purchase_order' ? 'PO' : 'GRN';
    // Client-side hint only — the server enforces uniqueness of the number
    const existingPurchases = localDb.getPurchases();
    const known = new Set<string>([
      ...existingPurchases.map((p) => p.purchaseNumber),
      ...existingPurchases.flatMap((p) => (p.stages || []).map((st) => st.stageNumber)),
    ]);
    for (let n = 1; n < 9999; n++) {
      const candidate = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
      if (!known.has(candidate)) return candidate;
    }
    return `${prefix}-${year}-${Date.now().toString().slice(-4)}`;
  };
  const [refNumber, setRefNumber] = useState<string>(
    existingOrder
      ? openStage
        ? suggestRef(openStage)
        : existingOrder.orderNumber || ''
      : suggestRef(currentStage)
  );
  const [date, setDate] = useState<string>(() => {
    // A saved stage document must keep the EXACT order date the user inserted
    // when they issued it — never the date the record was created or modified
    // on. The edit form therefore prefills the TARGET stage document's own
    // stored date (a plain edit re-saves the current stage document; a
    // deep-linked stage edit re-saves that same stage). Only a stage that
    // does not exist yet (a next stage being issued) and fresh creates
    // default to today — and even then the field stays user-editable.
    if (!existingOrder) return today;
    const targetStage = openStage || (existingOrder.purchaseStage as PurchaseStage) || 'purchase_order';
    const storedStageDate = existingOrder.purchaseStageDocs?.find(
      (d) => d.stageType === targetStage
    )?.date;
    return storedStageDate || today;
  });

  // ---- Vendor ----
  const [partyId, setPartyId] = useState<string>(
    existingOrder?.partyId === 'unassigned' ? '' : existingOrder?.partyId || ''
  );
  const vendorKnownOnMaster = Boolean(existingOrder?.partyId && existingOrder.partyId !== 'unassigned');
  // RFQ = pure inquiry: no vendor select at all. PO shows it (editable while
  // the vendor is not yet on the master, locked afterwards). GRN hides it —
  // mirror of the invoice-issuing stage — except when the supplier is still
  // unknown (direct-create receipt or RFQ→GRN jump): it must be set to save.
  const showVendor =
    currentStage === 'purchase_order' ||
    (isGrn && (!existingOrder || !vendorKnownOnMaster));
  const vendorLocked = Boolean(showVendor && existingOrder && vendorKnownOnMaster);

  // ---- Line items ----
  const [lineItems, setLineItems] = useState<
    Array<{
      itemId: string;
      itemName: string;
      quantity: string;
      unit: string;
      rate: string;
      gstRate: string;
      location: string;
      receivedQuantity: string;
    }>
  >(() => {
    const suggestedRate = (prod?: Item) =>
      prod?.purchasePrice !== undefined && prod.purchasePrice > 0
        ? String(prod.purchasePrice)
        : prod?.openingStockPrice !== undefined && prod.openingStockPrice > 0
        ? String(prod.openingStockPrice)
        : prod?.salePrice
        ? String(prod.salePrice)
        : '';
    if (existingOrder && existingOrder.items.length > 0) {
      let rows = existingOrder.items.map((i) => {
        const prod = items.find((it) => it.id === i.itemId);
        return {
          itemId: i.itemId,
          itemName: i.itemName,
          quantity: String(i.quantity),
          unit: i.unit,
          rate: String(i.rate ?? ''),
          gstRate: String(i.gstRate ?? ''),
          location: i.location || '',
          receivedQuantity: i.receivedQuantity !== undefined ? String(i.receivedQuantity) : '',
        };
      });
      // Advancing an RFQ to the Purchase Order: blank/zero (pending) vendor
      // rates auto-suggest from the item catalog, and unset slabs take the
      // item's GST default — the PO is where commercial terms are finalized.
      if (openStage === 'purchase_order') {
        rows = rows.map((r) => {
          const prod = items.find((it) => it.id === r.itemId);
          const needsRate = !r.rate || parseFloat(r.rate) === 0;
          return {
            ...r,
            rate: needsRate ? suggestedRate(prod) : r.rate,
            gstRate: r.gstRate === '' && prod?.taxRateGst !== undefined ? String(prod.taxRateGst) : r.gstRate,
          };
        });
      }
      return rows;
    }
    return [
      {
        itemId: '',
        itemName: '',
        quantity: '',
        unit: 'MT',
        rate: '',
        gstRate: '',
        location: '',
        receivedQuantity: '',
      },
    ];
  });

  // One-shot inventory application toggle for THIS stage save — stock inward
  // posts at most once per purchase (master flag guards server-side). It
  // defaults OFF on create AND edit (user rule); the goods receipt is
  // PERMANENT-ON regardless of this switch.
  const [updateInventory, setUpdateInventory] = useState<boolean>(false);
  const inventoryAlready = Boolean(existingOrder?.inventoryApplied);

  // NOTE: the Gate Inward Proof inputs (challan / vendor invoice /
  // inspection status) were REMOVED with their section — receiptDetails is no
  // longer collected on new goods receipts.

  // ---- Optional payment settlement (GRN stage only) ----
  // Payment-flow toggle: 'none' = Don't touch payment settlement (nothing
  // posts); 'credit' = book on credit (payable on the party ledger, no cash);
  // 'account' = journal + payout from accountId. Once applied, the section
  // locks ON and every save echoes the STORED flow (never 'none' — the GRN
  // bill voucher must keep upserting on later saves). The flow is COMPULSORY
  // at the goods-receipt stage: issuing one defaults to Book on credit.
  const cashAlready = Boolean((existingOrder as any)?.cashApplied);
  const [settlementType, setSettlementType] = useState<'none' | 'credit' | 'account'>(
    cashAlready
      ? (((existingOrder as any)?.settlementType || 'account') as 'credit' | 'account')
      : (currentStage === 'goods_receipt' ? 'credit' : 'none')
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    ((existingOrder as any)?.paymentMode as PaymentMode) || 'bank_transfer'
  );
  const [accountId, setAccountId] = useState<string>((existingOrder as any)?.settlementAccountId || '');

  // ---- Notes (full-width section) ----
  const [notes, setNotes] = useState<string>(existingOrder?.notes || '');

  // Confirmation modals
  const [showShortageConfirmModal, setShowShortageConfirmModal] = useState(false);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reference data (Supplier select shows ALL parties — any party can be a
  // buyer-side counterparty here; the label stays supplier/vendor)
  const accounts = useMemo(() => localDb.getAccounts(), []);
  const vendorParties: Party[] = parties;
  const productItems: Item[] = useMemo(() => {
    return items.filter((i) => i.type === 'product' || !i.type);
  }, [items]);

  const selectedParty = useMemo(() => {
    return parties.find((p) => p.id === partyId);
  }, [parties, partyId]);

  // Currency Formatter
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };
  // Amounts approximated to 2 decimal places (paise)
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const formatCurrency2 = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(round2(amount));
  };

  // ---- Line item handlers (sales-mirror pickers) ----
  const handleItemSelect = (index: number, selectedItemId: string) => {
    const product = productItems.find((p) => p.id === selectedItemId);
    const updated = [...lineItems];

    if (product) {
      // Locations from this selected product
      const rawProdLocs = product.locations && product.locations.length > 0
        ? product.locations
        : (product.stockLocation
            ? product.stockLocation.split(',').map((s) => ({ locationName: s.trim() }))
            : []);
      const seenLocs = new Set<string>();
      const productLocations = rawProdLocs.filter((l) => {
        const n = l.locationName?.trim();
        if (!n || seenLocs.has(n.toLowerCase())) return false;
        seenLocs.add(n.toLowerCase());
        return true;
      });
      const defaultLoc = productLocations.length > 0 ? productLocations[0].locationName : '';

      // Purchase rate defaults to the item's cost / purchase price
      const suggestedRate =
        product.purchasePrice !== undefined && product.purchasePrice > 0
          ? String(product.purchasePrice)
          : product.openingStockPrice !== undefined && product.openingStockPrice > 0
          ? String(product.openingStockPrice)
          : product.salePrice
          ? String(product.salePrice)
          : '';

      updated[index] = {
        ...updated[index],
        itemId: product.id,
        itemName: product.name,
        unit: product.unit || 'MT',
        rate: isRfq ? '' : suggestedRate,
        gstRate: product.taxRateGst !== undefined && product.taxRateGst !== null ? String(product.taxRateGst) : '',
        location: defaultLoc,
      };
    } else {
      updated[index] = {
        ...updated[index],
        itemId: '',
        itemName: '',
        rate: '',
        gstRate: '',
        location: '',
      };
    }

    setLineItems(updated);
  };

  const handleItemFieldChange = (
    index: number,
    field: 'quantity' | 'rate' | 'gstRate' | 'location' | 'receivedQuantity',
    val: string
  ) => {
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      [field]: val,
    };

    // While the receipt is not being reconciled, keep receivedQuantity in sync
    if (field === 'quantity' && currentStage !== 'goods_receipt') {
      updated[index].receivedQuantity = val;
    }

    setLineItems(updated);
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { itemId: '', itemName: '', quantity: '', unit: 'MT', rate: '', gstRate: '', location: '', receivedQuantity: '' },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    let totalOrderedQty = 0;
    let totalReceivedQty = 0;
    let hasShortage = false;
    let hasOverage = false;

    lineItems.forEach((row) => {
      const q = parseFloat(row.quantity) || 0;
      const r = parseFloat(row.rate) || 0;
      const recv =
        row.receivedQuantity !== '' ? parseFloat(row.receivedQuantity) || 0 : q;

      // The goods receipt bills the RECEIVED quantities at the PO rates
      // (user rule): short lines contribute less/zero, overages contribute more.
      const billQty = isGrn ? recv : q;
      subtotal += billQty * r;
      taxAmount += (billQty * r * (parseFloat(row.gstRate) || 0)) / 100;
      totalOrderedQty += q;
      totalReceivedQty += recv;

      if (isGrn) {
        if (recv < q) hasShortage = true;
        if (recv > q) hasOverage = true;
      }
    });

    const subtotal2 = round2(subtotal);
    const taxAmount2 = round2(taxAmount);
    const grandTotal = round2(subtotal2 + taxAmount2);

    return {
      subtotal: subtotal2,
      taxAmount: taxAmount2,
      grandTotal,
      totalOrderedQty,
      totalReceivedQty,
      hasShortage,
      hasOverage,
      discrepancyCount: lineItems.filter((row) => {
        const q = parseFloat(row.quantity) || 0;
        const recv =
          row.receivedQuantity !== '' ? parseFloat(row.receivedQuantity) || 0 : q;
        return recv !== q;
      }).length,
    };
  }, [lineItems, currentStage]);

  // ---- Validation ----
  const validateForm = (): boolean => {
    // Vendor is required at the PO / receiving stages (never asked at RFQ)
    if (showVendor && !partyId) {
      setValidationError('Please select a Supplier / Vendor for this purchase.');
      return false;
    }

    if (lineItems.length === 0 || !lineItems.some((i) => i.itemId)) {
      setValidationError('Please select at least one material item.');
      return false;
    }

    for (let i = 0; i < lineItems.length; i++) {
      const row = lineItems[i];
      if (!row.itemId) {
        setValidationError(`Line item #${i + 1} has no material selected.`);
        return false;
      }
      const qty = parseFloat(row.quantity);
      if (isNaN(qty) || qty <= 0) {
        setValidationError(`Line item #${i + 1} (${row.itemName || 'Item'}) must have a valid quantity > 0.`);
        return false;
      }
      if (!isRfq) {
        const rate = parseFloat(row.rate);
        if (isNaN(rate) || rate < 0) {
          setValidationError(`Line item #${i + 1} (${row.itemName || 'Item'}) must have a valid rate.`);
          return false;
        }
      }
      if (isGrn) {
        const recv = row.receivedQuantity === '' ? qty : parseFloat(row.receivedQuantity);
        if (isNaN(recv) || recv < 0) {
          setValidationError(`Line item #${i + 1} (${row.itemName || 'Item'}) must have a valid received quantity >= 0.`);
          return false;
        }
      }
    }

    // "Update payment flow" with an account requires a disbursement account
    // (server refuses the settle request without one — validate up front so
    // the user sees it). A locked (already-applied) save skips this: it echoes
    // the stored flow and must never be re-blocked.
    if (!isRfq && !cashAlready && settlementType === 'account' && !accountId) {
      setValidationError('Please select a Debit / Payment Account to settle this payment.');
      return false;
    }

    setValidationError(null);
    return true;
  };

  // ---- Stage-save payload (mirrors the sales model: master on first save,
  //      stage rows on successive saves; master edits ride along) ----
  const buildStagePayload = (targetStage: PurchaseStage) => {
    // Payment flow echoed on every save; COMPULSORY at the goods receipt —
    // an un-decided choice falls back to Book on credit.
    const settleEffType: 'none' | 'credit' | 'account' =
      settlementType === 'none' && targetStage === 'goods_receipt' ? 'credit' : settlementType;
    const itemsPayload = lineItems
      .filter((row) => row.itemId)
      .map((row) => {
        const orderedQty = parseFloat(row.quantity) || 0;
        const recvQty =
          row.receivedQuantity !== '' ? parseFloat(row.receivedQuantity) || 0 : orderedQty;
        const prod = productItems.find((p) => p.id === row.itemId);
        const prodLocs = prod?.locations || [];
        const assignedLoc =
          row.location?.trim() ||
          (prodLocs.length > 0 ? prodLocs[0].locationName : prod?.stockLocation || 'Main Yard');
        return {
          itemId: row.itemId,
          quantity: orderedQty,
          // RFQ keeps the pending rate (0) but carries the item's GST slab;
          // vendor rates finalize at the Purchase Order stage
          rate: isRfq ? 0 : parseFloat(row.rate) || 0,
          gstRate: round2(parseFloat(row.gstRate) || 0),
          locationName: assignedLoc,
          receivedQuantity: targetStage === 'goods_receipt' ? recvQty : orderedQty,
          unit: row.unit,
        };
      });

    const stageInput = {
      stageType: targetStage,
      stageNumber: refNumber,
      date: date || today,
      notes: notes || undefined,
      // Master edits ride along: a stage save can add the vendor, change the
      // date or notes (applied before the stage row is written)
      partyId: showVendor && partyId ? partyId : undefined,
      // NOTE: receiptDetails no longer collected (Gate Inward Proof removed).
      // ONE-SHOT inventory application (server guards the master flag; the
      // RFQ stage offers no toggle — quotations never alter stock; the goods
      // receipt is PERMANENT-ON — the inward posts there regardless).
      updateInventory: targetStage === 'rfq' ? false : (targetStage === 'goods_receipt' || updateInventory),
      // Payment-flow one-shot. IMPORTANT: once the flow was applied this is a
      // no-op save — echo the STORED flow verbatim (never 'none'), or the GRN
      // re-save would stop the purchase_bill journal voucher from upserting.
      // The server's wasSettled gate keeps the payout voucher one-shot. The
      // flow is COMPULSORY at the goods receipt: an un-decided choice falls
      // back to Book on credit.
      updateCash: settleEffType !== 'none',
      settlementType: settleEffType,
      settlementAccountId: settleEffType === 'account' ? (accountId || undefined) : undefined,
      paymentMode: settleEffType === 'account' ? paymentMode : undefined,
    };

    if (existingOrder) {
      // Items ALWAYS ride along (user rule: PO edits adjust quantities — an
      // earlier guard dropped them once inventory was applied, which silently
      // discarded PO edits). Safe: the server's master leg compensates applied
      // stock by un-applying and re-applying at the edited lines, and the GRN
      // reconciliation keeps its received-quantity logic.
      return { stageInput: { ...stageInput, items: itemsPayload } };
    }

    return {
      masterPayload: {
        purchaseNumber: refNumber,
        partyId: partyId || undefined,
        date: date || today,
        notes: notes || undefined,
        items: itemsPayload,
        stage: stageInput,
      },
    };
  };

  // Single submit funnel: first-stage saves create the purchase master; stage
  // saves write the stage document row (+ received quantities at the receipt)
  const submitStage = (targetStage: PurchaseStage) => {
    const built = buildStagePayload(targetStage);
    if (existingOrder) {
      onAddPurchaseStage((existingOrder as any).id, built.stageInput);
    } else {
      onAddPurchase(built.masterPayload);
    }
    onClose();
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    if (isGrn) {
      // Any shortage or overage discrepancy requires explicit confirmation
      if (calculations.discrepancyCount > 0) {
        setShowShortageConfirmModal(true);
        return;
      }
    }

    submitStage(currentStage);
  };

  // Confirm shortage submission from modal
  const handleConfirmShortageReceipt = () => {
    setShowShortageConfirmModal(false);
    submitStage(currentStage);
  };

  // Handle Cancel Purchase
  const handleConfirmCancel = () => {
    setShowCancelConfirmModal(false);
    if (existingOrder && onCancelOrder) {
      onCancelOrder((existingOrder as any).id);
    } else if (existingOrder) {
      onUpdatePurchase((existingOrder as any).id, { status: 'cancelled' });
    }
    onClose();
  };

  if (!isOpen) return null;

  const StageIcon = STAGE_META[currentStage].icon;
  const itemRateLocked = isGrn && Boolean(existingOrder);

  // Header title (mirrors the sales modal naming)
  const headerTitle = (() => {
    if (openStage && existingOrder) {
      return openStage === 'purchase_order'
        ? `Create Purchase Order — ${existingOrder.orderNumber}`
        : `Record Goods Receiving — ${existingOrder.orderNumber}`;
    }
    if (editingCurrent) {
      return `Edit ${currentStage === 'rfq' ? 'Request Quotation' : 'Purchase Order'}: ${refNumber}`;
    }
    return isRfq ? 'New Request Quotation' : isGrn ? 'New Goods Receiving (GRN)' : 'New Purchase Order';
  })();

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[var(--color-surface)] rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150">

        {/* --- HEADER --- */}
        <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center shadow-xs">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">{headerTitle}</h3>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                {STAGE_META[currentStage].desc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {existingOrder && (
              <button
                type="button"
                onClick={() => setShowCancelConfirmModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 border border-[var(--color-error)]/30 transition-all"
                title="Cancel purchase and revert any stock changes"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Cancel Purchase</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* --- SCROLLABLE FORM BODY --- */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Validation error */}
          {validationError && (
            <div className="p-3 rounded-2xl bg-[var(--color-error-container)]/40 border border-[var(--color-error)]/40 flex items-center justify-between text-xs text-[var(--color-error)] font-medium">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
              <button type="button" onClick={() => setValidationError(null)} className="p-1 hover:opacity-70">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Core Details Row — ref number + date (sales mirror) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Order Number</label>
              <input
                type="text"
                required
                disabled={editingCurrent}
                title={editingCurrent ? 'Document number is locked for existing stage documents' : undefined}
                value={refNumber}
                onChange={(e) => setRefNumber(e.target.value)}
                className={`w-full px-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                  editingCurrent ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Order Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          {/* Vendor Selection — never shown at the Request Quotation stage */}
          {showVendor && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                Select Supplier / Vendor
              </label>
              <select
                required
                disabled={vendorLocked}
                title={vendorLocked ? 'Vendor is locked once the purchase order is created against it' : undefined}
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                  vendorLocked ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                <option value="">-- Choose Registered Vendor --</option>
                {vendorParties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.gstin ? `| GSTIN: ${p.gstin}` : ''}
                  </option>
                ))}
              </select>
              {vendorParties.length === 0 && (
                <p className="text-[10px] text-[var(--color-error)] mt-1 ml-2">
                  No vendors found. Please add a supplier under Party Directory.
                </p>
              )}
              {vendorLocked && (
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 ml-2 flex items-center gap-1">
                  <Ban className="w-3 h-3" /> Vendor is locked — set when the purchase order was created and cannot be changed.
                </p>
              )}
              {selectedParty && !vendorLocked && (
                <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-1 ml-2">
                  Balance: <strong className="text-[var(--color-on-surface)]">{formatCurrency(selectedParty.balance || 0)}</strong>
                  {selectedParty.phone ? ` • Phone: ${selectedParty.phone}` : ''}
                </p>
              )}
            </div>
          )}

          {/* Vendor details — read-only panel at the Goods Receiving stage
              (the select is hidden once the vendor is on the master, but the
              receiving document should still show who is being received from) */}
          {isGrn && vendorKnownOnMaster && selectedParty && (
            <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl p-3.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <UserRound className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                    <p className="text-xs font-black text-[var(--color-on-surface)] truncate">
                      {selectedParty.name}
                      {selectedParty.tradeName ? ` (${selectedParty.tradeName})` : ''}
                    </p>
                  </div>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-1">
                    {[selectedParty.category, selectedParty.contactPerson && `Contact: ${selectedParty.contactPerson}`, selectedParty.phone]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                  {selectedParty.gstin && (
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-0.5">
                      GSTIN: <span className="font-mono font-bold text-[var(--color-on-surface)]">{selectedParty.gstin}</span>
                      {selectedParty.pan ? ` • PAN: ${selectedParty.pan}` : ''}
                    </p>
                  )}
                  {(selectedParty.address?.street || selectedParty.address?.city) && (
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-0.5">
                      {[selectedParty.address?.street, selectedParty.address?.city, selectedParty.address?.state, selectedParty.address?.pincode]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Net Balance</p>
                  <p className={`text-xs font-black ${
                    (selectedParty.currentBalance || 0) < 0
                      ? 'text-[var(--color-warning)]'
                      : 'text-[var(--color-success)]'
                  }`}>
                    {formatCurrency(selectedParty.currentBalance || 0)}
                  </p>
                  <p className="text-[9px] text-[var(--color-on-surface-variant)] font-semibold">
                    {(selectedParty.currentBalance || 0) < 0 ? 'Payable to vendor' : 'Receivable from vendor'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Items — Request Quotation & Purchase Order: full editable table.
              Goods Receiving over an existing order: locked PO values with
              only the Actual Received Qty reconciled per line. */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-[var(--color-primary)]" /> Purchased Materials &amp; Inward Stock Locations
              </h4>
              {!itemRateLocked && (
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-primary)] hover:opacity-80 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              )}
            </div>

            <div className="border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-surface-container)]">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-[10px] uppercase border-b border-[var(--color-outline-variant)]">
                    <th className="py-2.5 px-3 min-w-[220px] first:rounded-tl-2xl">Item / Raw Material</th>
                    <th className="py-2.5 px-3 w-44">Receiving Location</th>
                    <th className="py-2.5 px-3 w-28 text-right">{isRfq ? 'Requested Qty' : 'Ordered Qty'}</th>
                    {isGrn && <th className="py-2.5 px-3 w-32 text-right bg-[var(--color-surface-container-high)]">Actual Received Qty</th>}
                    {!isRfq && <th className="py-2.5 px-3 w-28 text-right">Rate ({settings.currency?.symbol || '₹'})</th>}
                    {!isRfq && <th className="py-2.5 px-3 w-24">GST Slab</th>}
                    {!isRfq && <th className="py-2.5 px-3 w-28 text-right">Total</th>}
                    <th className="py-2.5 px-3 w-10 text-center {!itemRateLocked ? 'last:rounded-tr-2xl' : 'last:rounded-tr-2xl'}"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60 [&>tr:last-child>td:first-child]:rounded-bl-2xl [&>tr:last-child>td:last-child]:rounded-br-2xl">
                  {lineItems.map((row, idx) => {
                    const selectedProd = productItems.find((p) => p.id === row.itemId);
                    const orderedQtyVal = parseFloat(row.quantity) || 0;
                    const receivedQtyVal =
                      row.receivedQuantity !== '' ? parseFloat(row.receivedQuantity) || 0 : orderedQtyVal;
                    // The goods receipt bills the RECEIVED quantity at the PO
                    // rate (user rule) — the line's money column follows that.
                    const lineTotal =
                      (isGrn ? receivedQtyVal : orderedQtyVal) * (Number(row.rate) || 0);
                    const shortage = orderedQtyVal - receivedQtyVal;

                    // Multi-location options for this product
                    const rawProdLocs = selectedProd?.locations && selectedProd.locations.length > 0
                      ? selectedProd.locations
                      : (selectedProd?.stockLocation
                          ? selectedProd.stockLocation.split(',').map((s) => ({ locationName: s.trim() }))
                          : []);
                    const seenRowLocs = new Set<string>();
                    const prodLocations = rawProdLocs.filter((l) => {
                      const n = l.locationName?.trim();
                      if (!n || seenRowLocs.has(n.toLowerCase())) return false;
                      seenRowLocs.add(n.toLowerCase());
                      return true;
                    });

                    return (
                      <tr key={idx} className="bg-[var(--color-surface-container-lowest)]">
                        {/* Material selection (searchable) / locked name at GRN */}
                        <td className="py-2 px-3">
                          {itemRateLocked ? (
                            <span className="text-xs font-bold text-[var(--color-on-surface)]">
                              {selectedProd ? `${selectedProd.code} (${selectedProd.name})` : row.itemName}
                            </span>
                          ) : (
                            <SearchableSelect
                              value={row.itemId}
                              onChange={(v) => handleItemSelect(idx, v)}
                              placeholder="Type item code or name..."
                              closedDisplay={selectedProd ? `${selectedProd.code} (${selectedProd.name})` : ''}
                              options={productItems.map((p) => ({
                                value: p.id,
                                label: p.code,
                                sub: `(${p.name}) · Unit: ${p.unit}`,
                              }))}
                            />
                          )}
                        </td>

                        {/* Receiving location (searchable) / locked text at GRN */}
                        <td className="py-2 px-3">
                          {itemRateLocked ? (
                            <span className="text-xs font-medium text-[var(--color-on-surface)] truncate block">{row.location || '—'}</span>
                          ) : !selectedProd ? (
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
                            <SearchableSelect
                              value={row.location || prodLocations[0].locationName}
                              onChange={(v) => handleItemFieldChange(idx, 'location', v)}
                              placeholder="Type location name..."
                              closedDisplay={row.location || prodLocations[0].locationName}
                              options={prodLocations.map((loc) => ({
                                value: loc.locationName,
                                label: loc.locationName,
                                // Storage snapshot of THIS material at THIS
                                // location (hydrated from item_location_mapping;
                                // stockLocation string fallbacks carry no numbers)
                                ...(typeof (loc as any).currentStock === 'number' || typeof (loc as any).maxCapacity === 'number'
                                  ? {
                                      sub: `In stock: ${Number((loc as any).currentStock || 0).toLocaleString('en-IN')} ${selectedProd?.unit || row.unit || ''} · Capacity: ${
                                        (loc as any).maxCapacity !== undefined && (loc as any).maxCapacity !== null && (loc as any).maxCapacity !== 0
                                          ? Number((loc as any).maxCapacity).toLocaleString('en-IN')
                                          : '—'
                                      }`,
                                    }
                                  : {}),
                              }))}
                            />
                          )}
                        </td>

                        {/* Ordered / Requested quantity — locked at GRN over an existing order */}
                        <td className="py-2 px-3 text-right">
                          {itemRateLocked ? (
                            <span className="text-xs font-bold text-[var(--color-on-surface)]">
                              {orderedQtyVal.toLocaleString('en-IN')} <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">{row.unit}</span>
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                step="any"
                                required
                                placeholder="0"
                                value={row.quantity}
                                onChange={(e) => handleItemFieldChange(idx, 'quantity', e.target.value)}
                                className="w-full bg-transparent border-b border-transparent focus:border-[var(--color-primary)] text-xs font-bold text-[var(--color-on-surface)] focus:outline-none text-right"
                              />
                              {selectedProd && <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">{selectedProd.unit}</span>}
                            </div>
                          )}
                        </td>

                        {/* Actual received quantity (GRN only) */}
                        {isGrn && (
                          <td className="py-2 px-3 text-right bg-[var(--color-surface-container-high)]/30">
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                step="any"
                                placeholder={String(orderedQtyVal || 0)}
                                value={row.receivedQuantity}
                                onChange={(e) => handleItemFieldChange(idx, 'receivedQuantity', e.target.value)}
                                className="w-full bg-transparent border-b border-[var(--color-primary)] text-xs font-black text-[var(--color-on-surface)] focus:outline-none text-right"
                              />
                              <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">{row.unit}</span>
                            </div>
                            {orderedQtyVal > 0 && (
                              <div className="mt-1 text-right">
                                {shortage > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]">
                                    <TrendingDown className="w-2.5 h-2.5" />
                                    Shortage: -{shortage} {row.unit}
                                  </span>
                                ) : shortage < 0 ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                                    <TrendingUp className="w-2.5 h-2.5" />
                                    Overage: +{Math.abs(shortage)} {row.unit}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">
                                    <Check className="w-2.5 h-2.5" />
                                    Full Receipt
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Rate — PO & GRN only (vendor rates are pending at RFQ) */}
                        {!isRfq && (
                          <td className="py-2 px-3 text-right">
                            {itemRateLocked ? (
                              <span className="text-xs font-bold text-[var(--color-on-surface)]">{formatCurrency2(parseFloat(row.rate) || 0)}</span>
                            ) : (
                              <input
                                type="number"
                                step="any"
                                required
                                placeholder="0.00"
                                value={row.rate}
                                onChange={(e) => handleItemFieldChange(idx, 'rate', e.target.value)}
                                className="w-full bg-transparent border-b border-transparent focus:border-[var(--color-primary)] text-xs font-bold text-[var(--color-on-surface)] focus:outline-none text-right"
                              />
                            )}
                          </td>
                        )}

                        {/* GST Slab per line (typable/searchable) */}
                        {!isRfq && (
                          <td className="py-2 px-3">
                            {itemRateLocked ? (
                              <span className="text-xs font-bold text-[var(--color-on-surface)]">{row.gstRate ? `${row.gstRate}%` : '--'}</span>
                            ) : (
                              <SearchableSelect
                                value={row.gstRate}
                                onChange={(v) => handleItemFieldChange(idx, 'gstRate', v)}
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
                            )}
                          </td>
                        )}

                        {/* Total (received × rate at the goods receipt) */}
                        {!isRfq && (
                          <td className="py-2 px-3 text-right text-xs font-bold text-[var(--color-on-surface)]">
                            {formatCurrency2(lineTotal)}
                          </td>
                        )}

                        {/* Remove Row Button */}
                        <td className="py-2 px-3 text-center">
                          {!itemRateLocked && (
                            <button
                              type="button"
                              disabled={lineItems.length === 1}
                              onClick={() => handleRemoveLineItem(idx)}
                              className="p-1 text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 disabled:opacity-30 rounded-full transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stockyard inventory toggle — PO & Receiving stages only (one-shot) */}
          {!isRfq && (
            <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl transition-colors ${updateInventory ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'}`}>
                    <Boxes className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                      Receive Into Stockyard Inventory Now
                    </h4>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                      {inventoryAlready
                        ? 'Inventory is already updated for this purchase — no further stock movement will be written.'
                        : isGrn
                        ? 'Receiving goods permanently updates this purchase\'s inventory — the inward posts at the goods receipt and cannot be switched off.'
                        : updateInventory
                        ? 'FIFO purchase_inward ledger rows will be written at this stage save (one-time per purchase)'
                        : 'No stock movement yet — you can enable it later at any stage save (applies once)'}
                    </p>
                  </div>
                </div>

                {(() => {
                  // The goods receipt is a PERMANENT-ON stage — the inward
                  // posts there even if the toggle was never enabled at PO.
                  const grnForcedOn = isGrn && !inventoryAlready;
                  const locked = inventoryAlready || grnForcedOn;
                  const shown = locked || updateInventory;
                  return (
                <label className={`inline-flex items-center gap-2.5 select-none ${locked ? 'opacity-70' : 'cursor-pointer'}`}>
                  <span className="text-xs font-bold text-[var(--color-on-surface)]">
                    {inventoryAlready ? 'Inventory Updated' : shown ? 'Update Inventory' : 'Inventory Untouched'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shown}
                    disabled={locked}
                    title={inventoryAlready
                      ? 'Inventory is already updated for this purchase'
                      : grnForcedOn
                      ? 'Inventory must be updated when goods are received — cannot be unchecked at this stage'
                      : undefined}
                    onClick={() => setUpdateInventory(!updateInventory)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      shown ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                    } ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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

          {/* NOTE: the "Gate Inward Proof" section (Delivery Challan / Vendor
              Invoice No / Inspection Status) was REMOVED — goods receipts no
              longer collect gate-inward documents. Older GRN rows keep their
              stored receiptDetails for the detail view. */}

          {/* Payment Disbursement & Source Account — Goods Receiving stage only
              (removed at the PO stage per user rule: the payment flow is chosen
              and is compulsory when goods are received, not when ordering).
              Payloads still echo an already-applied flow on PO re-saves. */}
          {isGrn && (
            <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl transition-colors ${settlementType !== 'none' ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'}`}>
                    <Landmark className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                      Payment Settlement &amp; Source Account
                    </h4>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                      {cashAlready
                        ? 'The payment flow was applied at an earlier save and cannot be changed'
                        : isGrn
                          ? 'The payment flow must be applied when goods are received — choose Book on credit or disburse from a Cash / Bank account'
                          : settlementType !== 'none'
                            ? 'Update the payment flow — book on credit or disburse from a Cash / Bank account'
                            : "Don't touch — nothing will be posted for this purchase"}
                    </p>
                  </div>
                </div>

                {/* Toggle Switch: OFF = Don't touch payment settlement; ON =
                    Update payment flow. Locked ON once the flow was applied,
                    or at the goods-receipt stage where the flow is compulsory. */}
                <label className={`inline-flex items-center gap-2.5 select-none ${cashAlready || (isGrn && !cashAlready) ? 'opacity-70' : 'cursor-pointer'}`}>
                  <span className="text-xs font-bold text-[var(--color-on-surface)]">
                    {cashAlready ? 'Payment Flow — Already Done' : 'Update payment flow'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={cashAlready || settlementType !== 'none'}
                    disabled={cashAlready || isGrn}
                    title={cashAlready
                      ? 'The payment flow for this purchase was applied at an earlier save and cannot be changed'
                      : isGrn
                      ? 'A payment flow must be applied when goods are received — it cannot be switched off at this stage'
                      : undefined}
                    onClick={() => setSettlementType(settlementType === 'none' ? 'credit' : 'none')}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      cashAlready || settlementType !== 'none' ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-highest)]'
                    } ${cashAlready ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        cashAlready || settlementType !== 'none' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>
              </div>

              {settlementType !== 'none' ? (
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
                        value={settlementType === 'account' ? accountId : ''}
                        disabled={cashAlready}
                        onChange={(e) => {
                          setAccountId(e.target.value);
                          setSettlementType(e.target.value ? 'account' : 'credit');
                        }}
                        className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${cashAlready ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <option value="">
                          Book on credit — Payable moves to the Party ledger (no cash movement)
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
                    {settlementType === 'account' && accountId && (
                      <div>
                        <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                          Mode of Payment <span className="text-[var(--color-error)] font-bold">*</span>
                        </label>
                        <select
                          required
                          value={paymentMode}
                          disabled={cashAlready}
                          onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                          className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${cashAlready ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                      <span>No Cash/Bank accounts configured. Please create an account under Cash &amp; Bank to book immediate settlement.</span>
                    </div>
                  )}

                  {/* Locked "already applied" banners vs pre-save banners */}
                  {cashAlready && settlementType === 'account' ? (
                    <div className="p-3 rounded-xl bg-[var(--color-success-container)]/40 border border-[var(--color-success)]/30 flex items-center justify-between gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                      <span>
                        Payment of <strong className="text-[var(--color-on-surface)]">{formatCurrency((existingOrder as any)?.settledAmount ?? calculations.grandTotal)}</strong>{' '}
                        was already settled from the purchase's Cash/Bank account — no further voucher will be posted.
                      </span>
                      <span className="text-[10px] font-bold text-[var(--color-on-success-container)] uppercase bg-[var(--color-success-container)] px-2.5 py-0.5 rounded-full shrink-0">
                        Flow Applied
                      </span>
                    </div>
                  ) : cashAlready && settlementType === 'credit' ? (
                    <div className="p-3 rounded-xl bg-[var(--color-primary-container)]/40 border border-[var(--color-primary)]/30 flex items-center justify-between gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                      <span>
                        <strong className="text-[var(--color-on-surface)]">Payable</strong> of{' '}
                        <strong className="text-[var(--color-on-surface)] font-bold">{formatCurrency((existingOrder as any)?.settledAmount ?? calculations.grandTotal)}</strong>{' '}
                        is already booked on the party ledger — flow applied; the voucher re-locks to the goods-receipt total at the GRN stage.
                      </span>
                      <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase bg-[var(--color-primary-container)]/60 px-2.5 py-0.5 rounded-full shrink-0">
                        Flow Applied
                      </span>
                    </div>
                  ) : settlementType === 'credit' ? (
                    <div className="p-2.5 rounded-xl bg-[var(--color-primary-container)]/40 border border-[var(--color-primary)]/30 flex items-center justify-between gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                      <span>
                        <strong className="text-[var(--color-on-surface)]">Payable</strong> of{' '}
                        <strong className="text-[var(--color-on-surface)] font-bold">{formatCurrency(calculations.grandTotal)}</strong>{' '}
                        will be booked against the vendor on credit — no Cash/Bank movement.
                        {' '}No payout voucher will be posted.
                      </span>
                      <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase bg-[var(--color-primary-container)]/60 px-2.5 py-0.5 rounded-full shrink-0">
                        Credit Purchase
                      </span>
                    </div>
                  ) : accountId ? (
                    <div className="p-2.5 rounded-xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)]/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--color-primary)]" />
                        <span>
                          <strong className="text-[var(--color-on-surface)]">Cash Flow Impact:</strong> Receipt amount of{' '}
                          <strong className="text-[var(--color-primary)] font-bold">
                            {formatCurrency(calculations.grandTotal)}
                          </strong>{' '}
                          will be deducted from the selected account balance.
                        </span>
                      </div>
                      {(() => {
                        const chosen = accounts.find((a) => a.id === accountId);
                        return chosen ? (
                          <span className="font-bold text-[10px] text-[var(--color-on-surface)] uppercase px-2 py-0.5 rounded-md bg-[var(--color-surface-container-high)] shrink-0">
                            {chosen.type.toUpperCase()}: {chosen.name}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  ) : null}
                </div>
              ) : cashAlready ? (
                settlementType === 'account' ? (
                  <div className="p-3 rounded-xl bg-[var(--color-success-container)]/40 border border-[var(--color-success)]/30 flex items-center justify-between text-xs text-[var(--color-on-surface-variant)]">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                      <span>
                        Payment of <strong className="text-[var(--color-on-surface)]">{formatCurrency((existingOrder as any)?.settledAmount ?? 0)}</strong>{' '}
                        was already settled from the purchase's Cash/Bank account — no further voucher will be posted.
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
                        Payable of <strong className="text-[var(--color-on-surface)]">{formatCurrency((existingOrder as any)?.settledAmount ?? calculations.grandTotal)}</strong>{' '}
                        is already booked on the party ledger — flow applied; the voucher re-locks to the goods-receipt total at the GRN stage.
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
                    <span>Nothing will be posted — no bill/payout voucher, no party ledger move, no Cash/Bank movement. You can apply the payment flow later by editing the order or recording the goods receipt.</span>
                  </span>
                  <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase bg-[var(--color-surface-container-high)] px-2.5 py-0.5 rounded-full shrink-0">
                    No Entry
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Operational Notes — full width */}
          <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--color-primary)]" />
              <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                {isRfq ? 'Operational & Inquiry Notes' : 'Operational Notes'}
              </h4>
            </div>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isRfq
                  ? 'e.g. Inquire about test certificate requirements, delivery schedules, and price validity period.'
                  : 'e.g. Weighbridge slip required with truck challan. Unload at Yard Section B.'
              }
              className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
            />
          </div>

          {/* Totals summary — vendor rates are pending at the RFQ stage */}
          {isRfq ? (
            <div className="p-3.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)]/60 rounded-2xl text-[11px] text-[var(--color-on-surface-variant)] flex items-center gap-2">
              <Building className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
              <span><strong className="text-[var(--color-on-surface)]">Pending vendor rates &amp; GST:</strong> {lineItems.filter((i) => i.itemId).length} material row(s) inquired — rates, tax slabs and totals are finalized at the Purchase Order stage.</span>
            </div>
          ) : (
            <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-2 text-xs sm:max-w-sm sm:ml-auto">
              <div className="flex justify-between font-medium text-[var(--color-on-surface-variant)]">
                <span>Materials Subtotal:</span>
                <span className="font-bold text-[var(--color-on-surface)]">{formatCurrency2(calculations.subtotal)}</span>
              </div>

              <div className="flex justify-between font-medium text-[var(--color-on-surface-variant)]">
                <span>Total GST (per-item slabs):</span>
                <span className="font-bold text-[var(--color-on-surface)]">{formatCurrency2(calculations.taxAmount)}</span>
              </div>

              <div className="h-px bg-[var(--color-outline-variant)] my-2" />

              <div className="flex justify-between items-center text-sm font-black text-[var(--color-on-surface)]">
                <span>Grand Total:</span>
                <span className="text-[var(--color-primary)] text-base">{formatCurrency2(calculations.grandTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* --- FOOTER ACTIONS --- */}
        <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] flex items-center justify-between gap-3 bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-2 text-xs text-[var(--color-on-surface-variant)]">
            <StageIcon className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>
              Workflow: <strong className="text-[var(--color-on-surface)]">{STAGE_META[currentStage].short}</strong>
            </span>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-high)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-90 transition-all shadow-xs"
            >
              Submit
            </button>
          </div>
        </div>

        {/* --- SHORTAGE CONFIRMATION MODAL --- */}
        {showShortageConfirmModal && (
          <div className="fixed inset-0 z-60 bg-[var(--color-scrim)]/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[var(--color-surface)] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[var(--color-outline-variant)] space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-[var(--color-on-surface)]">
                    Discrepancy Detected: Confirm Goods Receipt?
                  </h4>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                    Actual received quantities differ from the initial Purchase Order.
                  </p>
                </div>
              </div>

              {/* Items discrepancy review table */}
              <div className="border border-[var(--color-outline-variant)] rounded-2xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[var(--color-surface-container)] text-[10px] font-bold uppercase text-[var(--color-on-surface-variant)]">
                    <tr>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-2 text-right">Ordered</th>
                      <th className="py-2 px-2 text-right">Received</th>
                      <th className="py-2 px-3 text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
                    {lineItems.map((item, idx) => {
                      const ordered = parseFloat(item.quantity) || 0;
                      const received =
                        item.receivedQuantity !== ''
                          ? parseFloat(item.receivedQuantity) || 0
                          : ordered;
                      const diff = received - ordered;

                      return (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-[var(--color-on-surface)]">
                            {item.itemName || 'Item'}
                          </td>
                          <td className="py-2 px-2 text-right font-medium">
                            {ordered.toLocaleString('en-IN')} {item.unit}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-[var(--color-primary)]">
                            {received.toLocaleString('en-IN')} {item.unit}
                          </td>
                          <td className="py-2 px-3 text-right font-black">
                            {diff < 0 ? (
                              <span className="text-[var(--color-error)]">
                                Shortage: {diff} {item.unit}
                              </span>
                            ) : diff > 0 ? (
                              <span className="text-[var(--color-primary)]">
                                +{diff} {item.unit}
                              </span>
                            ) : (
                              <span className="text-[var(--color-success)]">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-[10px] text-[var(--color-on-surface-variant)] space-y-1">
                <p className="font-bold text-[var(--color-on-surface)]">
                  Inventory Stock Impact:
                </p>
                <p>
                  • Raw material yard inventory will be adjusted to match actual received quantities.
                </p>
                <p>
                  • Shortage/overage will be permanently recorded in the order's Goods Receipt log.
                </p>
                <p>
                  • The purchase order will close and be marked as <strong>Completed</strong>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShortageConfirmModal(false)}
                  className="px-4 py-2 border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-all"
                >
                  Edit Quantities
                </button>
                <button
                  type="button"
                  onClick={handleConfirmShortageReceipt}
                  className="px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-black transition-all shadow-xs"
                >
                  Confirm &amp; Update Stock
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- CANCEL CONFIRMATION MODAL --- */}
        {showCancelConfirmModal && (
          <div className="fixed inset-0 z-60 bg-[var(--color-scrim)]/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[var(--color-surface)] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[var(--color-outline-variant)] space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[var(--color-error-container)] text-[var(--color-on-error-container)] flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-[var(--color-error)]" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-[var(--color-on-surface)]">
                    Cancel This Purchase?
                  </h4>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                    This will cancel purchase and revert any stock changes made by it.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirmModal(false)}
                  className="px-4 py-2 border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-all"
                >
                  Keep Purchase
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  className="px-5 py-2 bg-[var(--color-error)] hover:opacity-90 text-[var(--color-on-error)] rounded-full text-xs font-black transition-all shadow-xs"
                >
                  Yes, Cancel Purchase
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}