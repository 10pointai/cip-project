import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Calendar,
  Building,
  User,
  Landmark,
  FileText,
  FileCheck,
  FileSpreadsheet,
  ClipboardList,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Percent,
  Truck,
  Ban,
  Check,
} from 'lucide-react';
import {
  Order,
  OrderStatus,
  PurchaseStage,
  Party,
  Item,
  CompanySettings,
  Purchase,
  PaymentMode,
  CashBankAccount,
} from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';

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
}

interface StageStep {
  id: PurchaseStage;
  label: string;
  badge: string;
  title: string;
  desc: string;
  inventoryNote: string;
}

const STAGES: StageStep[] = [
  {
    id: 'rfq',
    label: 'Stage 1: RFQ',
    badge: 'RFQ / Ingestion',
    title: 'Request For Quotation',
    desc: 'Supplier price solicitation & rate quotation entry.',
    inventoryNote: 'Inward only when the Update Stockyard Inventory toggle is enabled at save (one-time per purchase).',
  },
  {
    id: 'purchase_order',
    label: 'Stage 2: PO',
    badge: 'Purchase Order',
    title: 'Official Purchase Order',
    desc: 'Procurement commitment sent to supplier.',
    inventoryNote: 'Inward only when the Update Stockyard Inventory toggle is enabled at save (one-time per purchase).',
  },
  {
    id: 'goods_receipt',
    label: 'Stage 3: Goods Receipt',
    badge: 'Receipt / GRN',
    title: 'Goods Receipt (GRN)',
    desc: 'Gate delivery, inspection & shortage reconciliation.',
    inventoryNote: 'Inward at the received quantities when the Update Stockyard Inventory toggle is enabled (one-time per purchase).',
  },
];

const STAGE_ORDER: PurchaseStage[] = ['rfq', 'purchase_order', 'goods_receipt'];

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
}: AddPurchaseModalProps) {
  // Determine initial and minimum allowed stage
  const initialStage: PurchaseStage = existingOrder?.purchaseStage || 'rfq';
  const minStageIndex = existingOrder?.purchaseStage
    ? STAGE_ORDER.indexOf(existingOrder.purchaseStage)
    : 0;

  // One-shot inventory application toggle for THIS stage save — stock inward
  // posts at most once per purchase (master flag guards server-side).
  const [updateInventory, setUpdateInventory] = useState<boolean>(
    Boolean(existingOrder && !existingOrder.inventoryApplied)
  );

  const [currentStage, setCurrentStage] = useState<PurchaseStage>(initialStage);
  const currentStageIndex = STAGE_ORDER.indexOf(currentStage);

  // Core order state
  const [partyId, setPartyId] = useState<string>(existingOrder?.partyId === 'unassigned' ? '' : (existingOrder?.partyId || ''));
  const [date, setDate] = useState<string>(
    existingOrder?.date || new Date().toISOString().split('T')[0]
  );
  const [orderNumber, setOrderNumber] = useState<string>(
    existingOrder?.orderNumber || ''
  );
  const [taxRateGst, setTaxRateGst] = useState<string>(
    existingOrder?.taxRateGst !== undefined ? String(existingOrder.taxRateGst) : '18'
  );
  const [notes, setNotes] = useState<string>(existingOrder?.notes || '');

  // Line items state
  const [lineItems, setLineItems] = useState<
    Array<{
      itemId: string;
      itemName: string;
      quantity: string;
      unit: string;
      rate: string;
      location: string;
      receivedQuantity: string;
      itemNotes: string;
    }>
  >(() => {
    if (existingOrder && existingOrder.items.length > 0) {
      return existingOrder.items.map((i) => ({
        itemId: i.itemId,
        itemName: i.itemName,
        quantity: String(i.quantity),
        unit: i.unit,
        rate: String(i.rate),
        location: i.location || '',
        receivedQuantity:
          i.receivedQuantity !== undefined
            ? String(i.receivedQuantity)
            : String(i.quantity),
        itemNotes: i.itemNotes || '',
      }));
    }
    return [
      {
        itemId: '',
        itemName: '',
        quantity: '',
        unit: 'MT',
        rate: '',
        location: '',
        receivedQuantity: '',
        itemNotes: '',
      },
    ];
  });

  // Stage-specific documentation state
  // RFQ
  const [rfqNumber, setRfqNumber] = useState<string>(
    existingOrder?.rfqDetails?.rfqNumber || ''
  );
  const [rfqDate, setRfqDate] = useState<string>(
    existingOrder?.rfqDetails?.rfqDate || new Date().toISOString().split('T')[0]
  );
  const [quotationRef, setQuotationRef] = useState<string>(
    existingOrder?.rfqDetails?.quotationRef || ''
  );
  const [quotationDate, setQuotationDate] = useState<string>(
    existingOrder?.rfqDetails?.quotationDate || ''
  );
  const [rfqValidityDate, setRfqValidityDate] = useState<string>(
    existingOrder?.rfqDetails?.validityDate || ''
  );
  const [rfqExpectedDeliveryDate, setRfqExpectedDeliveryDate] = useState<string>(
    existingOrder?.rfqDetails?.expectedDeliveryDate || ''
  );

  // PO
  const [poNumber, setPoNumber] = useState<string>(
    existingOrder?.poDetails?.poNumber || ''
  );
  const [poDate, setPoDate] = useState<string>(
    existingOrder?.poDetails?.poDate || new Date().toISOString().split('T')[0]
  );
  const [poDeliveryDate, setPoDeliveryDate] = useState<string>(
    existingOrder?.poDetails?.expectedDeliveryDate || ''
  );
  const [paymentTerms, setPaymentTerms] = useState<string>(
    existingOrder?.poDetails?.paymentTerms || 'Net 30 Days'
  );
  const [vendorContact, setVendorContact] = useState<string>(
    existingOrder?.poDetails?.vendorContact || ''
  );

  // Receipt / GRN
  const [grnNumber, setGrnNumber] = useState<string>(
    existingOrder?.receiptDetails?.grnNumber || ''
  );
  const [receiptDate, setReceiptDate] = useState<string>(
    existingOrder?.receiptDetails?.receiptDate || new Date().toISOString().split('T')[0]
  );
  const [challanNumber, setChallanNumber] = useState<string>(
    existingOrder?.receiptDetails?.challanNumber || ''
  );
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState<string>(
    existingOrder?.receiptDetails?.vendorInvoiceNumber || ''
  );
  const [receivedBy, setReceivedBy] = useState<string>(
    existingOrder?.receiptDetails?.receivedBy || ''
  );
  const [inspectionStatus, setInspectionStatus] = useState<
    'accepted' | 'accepted_with_shortage' | 'rejected'
  >(existingOrder?.receiptDetails?.inspectionStatus || 'accepted');
  const [reconciliationNotes, setReconciliationNotes] = useState<string>(
    existingOrder?.receiptDetails?.reconciliationNotes || ''
  );

  // Optional payment & deposit account section (settled = cash already moved
  // for this purchase; the one-shot flag guards a second payout voucher)
  const [includePayment, setIncludePayment] = useState<boolean>(
    Boolean((existingOrder as any)?.settlementAccountId)
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    ((existingOrder as any)?.paymentMode as PaymentMode) || 'bank_transfer'
  );
  const [accountId, setAccountId] = useState<string>(
    (existingOrder as any)?.settlementAccountId || ''
  );
  const cashAlready = Boolean((existingOrder as any)?.cashApplied);

  // Confirmation modals
  const [showShortageConfirmModal, setShowShortageConfirmModal] = useState(false);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reference data
  const accounts: CashBankAccount[] = useMemo(() => localDb.getAccounts(), []);
  const vendorParties: Party[] = useMemo(() => {
    return parties.filter((p) => p.type === 'vendor' || p.type === 'both');
  }, [parties]);
  const productItems: Item[] = useMemo(() => {
    return items.filter((i) => i.type === 'product' || !i.type);
  }, [items]);

  const selectedParty = useMemo(() => {
    return parties.find((p) => p.id === partyId);
  }, [parties, partyId]);

  // Generate default numbers on initialization
  useEffect(() => {
    if (!existingOrder) {
      const year = new Date().getFullYear();
      // Client-side hint only — the server enforces uniqueness of the number
      const existingPurchases = localDb.getPurchases();
      const known = new Set<string>([
        ...existingPurchases.map((p) => p.purchaseNumber),
        ...existingPurchases.flatMap((p) => (p.stages || []).map((st) => st.stageNumber)),
      ]);
      const freshNumber = (prefix: string) => {
        for (let n = 1; n < 9999; n++) {
          const candidate = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
          if (!known.has(candidate)) return candidate;
        }
        return `${prefix}-${year}-${Date.now().toString().slice(-4)}`;
      };

      if (!orderNumber) setOrderNumber(freshNumber('PO'));
      if (!rfqNumber) setRfqNumber(freshNumber('RFQ'));
      if (!poNumber) setPoNumber(freshNumber('PO'));
      if (!grnNumber) setGrnNumber(freshNumber('GRN'));
    }
  }, [existingOrder, orderNumber]);

  // When party changes, prefill contact if empty
  const handlePartyChange = (id: string) => {
    setPartyId(id);
    const p = parties.find((party) => party.id === id);
    if (p && !vendorContact) {
      setVendorContact(p.contactPerson || p.name);
    }
  };

  // Line item change handlers
  const handleItemSelect = (index: number, selectedItemId: string) => {
    const product = productItems.find((p) => p.id === selectedItemId);
    const updated = [...lineItems];

    if (product) {
      // Find locations from this selected product
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
      const defaultLoc =
        productLocations.length > 0
          ? productLocations[0].locationName
          : (localDb.getLocations()[0]?.name || '');

      // Purchase rate defaults to item cost/purchase price, fallback to rate
      const suggestedRate =
        product.purchasePrice !== undefined && product.purchasePrice > 0
          ? String(product.purchasePrice)
          : product.openingStockPrice !== undefined && product.openingStockPrice > 0
          ? String(product.openingStockPrice)
          : product.salePrice
          ? String(product.salePrice)
          : '0';

      updated[index] = {
        ...updated[index],
        itemId: product.id,
        itemName: product.name,
        unit: product.unit || 'MT',
        rate: suggestedRate,
        location: defaultLoc,
      };

      // Automatically preselect item GST slab if valid
      if (product.taxRateGst !== undefined && product.taxRateGst !== null) {
        setTaxRateGst(String(product.taxRateGst));
      }
    } else {
      updated[index] = {
        ...updated[index],
        itemId: '',
        itemName: '',
        rate: '',
        location: '',
      };
    }

    setLineItems(updated);
  };

  const handleItemFieldChange = (
    index: number,
    field: 'quantity' | 'rate' | 'location' | 'receivedQuantity' | 'itemNotes',
    val: string
  ) => {
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      [field]: val,
    };

    // If changing quantity and in RFQ/PO stage, keep receivedQuantity in sync by default
    if (field === 'quantity' && currentStage !== 'goods_receipt') {
      updated[index].receivedQuantity = val;
    }

    setLineItems(updated);
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        itemId: '',
        itemName: '',
        quantity: '',
        unit: 'MT',
        rate: '',
        location: '',
        receivedQuantity: '',
        itemNotes: '',
      },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalOrderedQty = 0;
    let totalReceivedQty = 0;
    let hasShortage = false;
    let hasOverage = false;

    lineItems.forEach((row) => {
      const q = parseFloat(row.quantity) || 0;
      const r = parseFloat(row.rate) || 0;
      const recv =
        row.receivedQuantity !== ''
          ? parseFloat(row.receivedQuantity) || 0
          : q;

      subtotal += q * r;
      totalOrderedQty += q;
      totalReceivedQty += recv;

      if (currentStage === 'goods_receipt') {
        if (recv < q) hasShortage = true;
        if (recv > q) hasOverage = true;
      }
    });

    const taxPercent = parseFloat(taxRateGst) || 0;
    // Figures approximated to 2 decimal places (paise)
    const subtotal2 = round2(subtotal);
    const taxAmount = round2((subtotal2 * taxPercent) / 100);
    const grandTotal = round2(subtotal2 + taxAmount);

    return {
      subtotal: subtotal2,
      taxAmount,
      grandTotal,
      totalOrderedQty,
      totalReceivedQty,
      hasShortage,
      hasOverage,
      discrepancyCount: lineItems.filter((row) => {
        const q = parseFloat(row.quantity) || 0;
        const recv =
          row.receivedQuantity !== ''
            ? parseFloat(row.receivedQuantity) || 0
            : q;
        return recv !== q;
      }).length,
    };
  }, [lineItems, taxRateGst, currentStage]);

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

  // Stage advancement validation & action
  const validateForm = (): boolean => {
    // Supplier is only required on Stage 2 (PO) and Stage 3 (Goods Receipt)
    if (currentStage !== 'rfq' && !partyId) {
      setValidationError('Please select a supplier / vendor for this Purchase Order.');
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
      // Rate is only required on Stage 2 (PO) and Stage 3 (Goods Receipt)
      if (currentStage !== 'rfq') {
        const rate = parseFloat(row.rate);
        if (isNaN(rate) || rate < 0) {
          setValidationError(`Line item #${i + 1} (${row.itemName || 'Item'}) must have a valid rate.`);
          return false;
        }
      }
      if (currentStage === 'goods_receipt') {
        const recv = parseFloat(row.receivedQuantity);
        if (isNaN(recv) || recv < 0) {
          setValidationError(`Line item #${i + 1} (${row.itemName || 'Item'}) must have a valid received quantity >= 0.`);
          return false;
        }
      }
    }

    setValidationError(null);
    return true;
  };

  // Build the stage-save payload against the RELATIONAL purchase model:
  //  - first-stage save  -> master payload {purchaseNumber, partyId, items, stage}
  //  - existing purchase -> stage payload (carry items only when inventory has
  //    NOT been applied; applied masters keep their ledger quantities fixed,
  //    master item edits go through PUT /:id with server-side compensation)
  const buildStagePayload = (targetStage: PurchaseStage) => {
    const isRfq = targetStage === 'rfq';
    const isStage3 = targetStage === 'goods_receipt';

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
          rate: isRfq ? 0 : parseFloat(row.rate) || 0,
          gstRate: isRfq ? 0 : parseFloat(taxRateGst) || 0,
          locationName: assignedLoc,
          receivedQuantity: isStage3 ? recvQty : undefined,
          itemNotes: row.itemNotes || undefined,
        };
      });

    const effectiveOrderNumber =
      targetStage === 'rfq'
        ? rfqNumber || orderNumber
        : targetStage === 'purchase_order'
        ? poNumber || orderNumber
        : grnNumber || orderNumber;

    const stageInput = {
      stageType: targetStage,
      stageNumber: effectiveOrderNumber,
      date: date || new Date().toISOString().split('T')[0],
      notes: notes || undefined,
      // Master-level fields ride along so a stage save can add/change the
      // vendor, date or notes (applied before the stage row is written)
      partyId: existingOrder ? (partyId || undefined) : undefined,
      rfqDetails: isRfq
        ? {
            rfqNumber: rfqNumber || undefined,
            rfqDate: rfqDate || undefined,
            quotationRef: quotationRef || undefined,
            quotationDate: quotationDate || undefined,
            validityDate: rfqValidityDate || undefined,
            expectedDeliveryDate: rfqExpectedDeliveryDate || undefined,
            notes: notes || undefined,
          }
        : undefined,
      poDetails: targetStage === 'purchase_order'
        ? {
            poNumber: poNumber || undefined,
            poDate: poDate || undefined,
            expectedDeliveryDate: poDeliveryDate || undefined,
            paymentTerms: paymentTerms || undefined,
            vendorContact: vendorContact || undefined,
            notes: notes || undefined,
          }
        : undefined,
      receiptDetails: isStage3
        ? {
            grnNumber: grnNumber || undefined,
            receiptDate: receiptDate || undefined,
            challanNumber: challanNumber || undefined,
            vendorInvoiceNumber: vendorInvoiceNumber || undefined,
            receivedBy: receivedBy || undefined,
            inspectionStatus,
            reconciliationNotes: reconciliationNotes || undefined,
            notes: notes || undefined,
          }
        : undefined,
      // ONE-SHOT inventory application toggle (server guards the master flag)
      updateInventory,
      // "Settle Payment Now" = the cash application one-shot: posts the
      // payment_out payout voucher against the chosen account on the server.
      updateCash: cashAlready ? false : includePayment,
      settlementAccountId: accountId || undefined,
      paymentMode,
    };

    if (existingOrder) {
      const canCarryItems = !existingOrder.inventoryApplied;
      return { stageInput: { ...stageInput, items: canCarryItems ? itemsPayload : undefined } };
    }

    return {
      masterPayload: {
        purchaseNumber: effectiveOrderNumber,
        partyId: partyId || undefined, // nullable: RFQ ingestion may have no vendor
        date: date || new Date().toISOString().split('T')[0],
        notes: notes || undefined,
        items: itemsPayload,
        stage: stageInput,
      },
    };
  };

  // Single submit funnel: first-stage saves create the purchase master; stage
  // saves write the stage document row (+ received quantities while inventory
  // is not yet applied).
  const submitStage = (targetStage: PurchaseStage) => {
    const built = buildStagePayload(targetStage);
    if (existingOrder) {
      onAddPurchaseStage((existingOrder as any).id, built.stageInput);
    } else {
      onAddPurchase(built.masterPayload);
    }
    onClose();
  };

  // Direct start or stage progression
  const handleStageSelect = (stage: PurchaseStage) => {
    const targetIndex = STAGE_ORDER.indexOf(stage);
    // User can NEVER go back to an earlier stage than minStageIndex
    if (targetIndex < minStageIndex) {
      return;
    }
    // Set stage
    setCurrentStage(stage);
    setValidationError(null);
  };

  // Submit current stage
  const handleSaveCurrentStage = () => {
    if (!validateForm()) return;

    // "Settle Payment Now" requires a disbursement account (server refuses a
    // settle request without one — validate up front so the user sees it).
    if (currentStage === 'goods_receipt' && includePayment && !accountId) {
      setValidationError('Please select a Debit / Payment Account to settle this receipt.');
      return;
    }

    if (currentStage === 'goods_receipt') {
      // If there is any shortage or overage discrepancy, require explicit confirmation modal
      if (calculations.discrepancyCount > 0) {
        setShowShortageConfirmModal(true);
        return;
      }
      // Clean match, proceed directly
      submitStage('goods_receipt');
      return;
    }

    // Saving at RFQ or PO stage
    submitStage(currentStage);
  };

  // Advance to next stage
  const handleAdvanceToNextStage = () => {
    if (!validateForm()) return;

    if (currentStage === 'rfq') {
      // Auto-populate suggested rates from item catalog for convenience when entering Stage 2 (PO)
      setLineItems((prev) =>
        prev.map((i) => {
          if (!i.rate || i.rate === '0') {
            const product = productItems.find((p) => p.id === i.itemId);
            const suggestedRate =
              product?.purchasePrice !== undefined && product.purchasePrice > 0
                ? String(product.purchasePrice)
                : product?.openingStockPrice !== undefined && product.openingStockPrice > 0
                ? String(product.openingStockPrice)
                : product?.salePrice
                ? String(product.salePrice)
                : '';
            return { ...i, rate: suggestedRate };
          }
          return i;
        })
      );
      setCurrentStage('purchase_order');
      return;
    }

    if (currentStage === 'purchase_order') {
      // Populate received quantities with ordered quantities as sensible defaults
      setLineItems((prev) =>
        prev.map((i) => ({
          ...i,
          receivedQuantity: i.receivedQuantity || i.quantity,
        }))
      );
      setCurrentStage('goods_receipt');
      return;
    }

    if (currentStage === 'goods_receipt') {
      handleSaveCurrentStage();
    }
  };

  // Confirm shortage submission from modal
  const handleConfirmShortageReceipt = () => {
    setShowShortageConfirmModal(false);
    submitStage('goods_receipt');
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

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-scrim)]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[var(--color-surface)] rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-[var(--color-outline-variant)] animate-in fade-in zoom-in-95 duration-150">
        
        {/* --- HEADER --- */}
        <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center shadow-xs">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[var(--color-on-surface)]">
                  {existingOrder ? `Purchase Order: ${existingOrder.orderNumber}` : 'Add Purchase'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs">
                  {STAGES.find((s) => s.id === currentStage)?.badge}
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                3-Stage Procurement Workflow: RFQ → Purchase Order → Goods Receipt (GRN)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cancel Order Button */}
            <button
              type="button"
              onClick={() => setShowCancelConfirmModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 border border-[var(--color-error)]/30 transition-all"
              title="Cancel purchase and revert any stock changes"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Cancel Purchase</span>
            </button>

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* --- HORIZONTAL STEPPER --- */}
        <div className="px-6 py-3.5 bg-[var(--color-surface-container-low)] border-b border-[var(--color-outline-variant)]/80">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {STAGES.map((step, idx) => {
              const isCurrent = step.id === currentStage;
              const isPast = idx < currentStageIndex;
              const isLocked = idx < minStageIndex; // Can never go backward
              const isAvailable = idx >= minStageIndex;

              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => handleStageSelect(step.id)}
                  className={`text-left p-3 rounded-2xl border transition-all flex items-start gap-3 relative ${
                    isCurrent
                      ? 'bg-[var(--color-surface)] border-[var(--color-primary)] shadow-sm ring-2 ring-[var(--color-primary)]/20'
                      : isPast
                      ? 'bg-[var(--color-surface-container)] border-[var(--color-outline-variant)] opacity-90 hover:opacity-100'
                      : isAvailable
                      ? 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)]/70 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface)]'
                      : 'bg-[var(--color-surface-container-lowest)]/50 border-dashed border-[var(--color-outline-variant)] opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                      isCurrent
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs'
                        : isPast
                        ? 'bg-[var(--color-success)] text-[var(--color-on-success)]'
                        : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                    }`}
                  >
                    {isPast ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-xs font-black truncate ${
                          isCurrent
                            ? 'text-[var(--color-primary)]'
                            : 'text-[var(--color-on-surface)]'
                        }`}
                      >
                        {step.label}
                      </p>
                      {isLocked && (
                        <span className="text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider bg-[var(--color-surface-container-high)] px-1.5 py-0.2 rounded">
                          Locked
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] line-clamp-1 mt-0.5">
                      {step.title}
                    </p>
                    <p className="text-[9px] text-[var(--color-primary)] font-semibold mt-1">
                      {step.inventoryNote}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-[var(--color-on-surface-variant)] mt-2 px-1">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>
                Current Active Stage:{' '}
                <strong className="text-[var(--color-on-surface)]">
                  {STAGES.find((s) => s.id === currentStage)?.title}
                </strong>
              </span>
            </span>
            <span className="text-[10px] italic">
              {minStageIndex > 0 ? 'Backward stages locked.' : 'Direct start enabled: advance forward anytime.'}
            </span>
          </div>
        </div>

        {/* --- VALIDATION ERROR ALERT --- */}
        {validationError && (
          <div className="mx-6 mt-3 p-3 bg-[var(--color-error-container)] border border-[var(--color-error)] text-[var(--color-on-error-container)] rounded-2xl flex items-center justify-between text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--color-error)] shrink-0" />
              <span className="font-semibold">{validationError}</span>
            </div>
            <button
              type="button"
              onClick={() => setValidationError(null)}
              className="p-1 hover:opacity-80 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* --- FORM BODY (SCROLLABLE) --- */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* SECTION 1: VENDOR & ORDER METADATA */}
          <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-5 rounded-2xl border border-[var(--color-outline-variant)] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-[var(--color-primary)]" />
                <h4 className="text-xs font-black text-[var(--color-on-surface)] uppercase tracking-wider">
                  {currentStage === 'rfq' ? 'RFQ & Procurement Details' : 'Supplier & Core Details'}
                </h4>
              </div>
              <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                {currentStage === 'rfq'
                  ? 'Supplier selection is required at Stage 2 (PO)'
                  : 'Vendors from existing master party directory'}
              </span>
            </div>

            <div className={`grid grid-cols-1 ${currentStage === 'rfq' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-4 text-xs`}>
              {/* Supplier Selection - Stage 2 & 3 Only */}
              {currentStage !== 'rfq' && (
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">
                    Supplier / Vendor <span className="text-[var(--color-error)]">*</span>
                  </label>
                  <select
                    value={partyId}
                    onChange={(e) => handlePartyChange(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                  >
                    <option value="">-- Select Registered Vendor --</option>
                    {vendorParties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.gstin ? `(${p.gstin})` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedParty && (
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-1">
                      Balance: <strong className="text-[var(--color-on-surface)]">{formatCurrency(selectedParty.balance || 0)}</strong>
                      {selectedParty.phone ? ` • Phone: ${selectedParty.phone}` : ''}
                    </p>
                  )}
                </div>
              )}

              {/* Order Date */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">
                  Workflow Entry Date <span className="text-[var(--color-error)]">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)] focus:border-[var(--color-primary)] outline-none"
                />
              </div>

              {/* Base Order / Tracking Reference */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">
                  Master Procurement Ref <span className="text-[var(--color-error)]">*</span>
                </label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="e.g. PO-2026-0042"
                  className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-bold text-[var(--color-on-surface)] focus:border-[var(--color-primary)] outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: STAGE-SPECIFIC DOCUMENTATION ACCORDION/CARDS */}
          <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-5 rounded-2xl border border-[var(--color-outline-variant)] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                <h4 className="text-xs font-black text-[var(--color-on-surface)] uppercase tracking-wider">
                  Stage Documentation & Reference Logs
                </h4>
              </div>
              <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                Preserved across all 3 stages for future audits
              </span>
            </div>

            {/* STAGE 1 (RFQ) FIELDS */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                currentStage === 'rfq'
                  ? 'bg-[var(--color-surface-container)] border-[var(--color-primary)]'
                  : 'bg-[var(--color-surface-container-low)] border-[var(--color-outline-variant)]/60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-[var(--color-on-surface)] flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  Stage 1: RFQ Inquiry Documentation
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                  {currentStage === 'rfq' ? 'Active' : 'Recorded'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                    RFQ Reference No
                  </label>
                  <input
                    type="text"
                    value={rfqNumber}
                    onChange={(e) => setRfqNumber(e.target.value)}
                    placeholder="RFQ-2026-001"
                    className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                    Supplier Quotation Ref
                  </label>
                  <input
                    type="text"
                    value={quotationRef}
                    onChange={(e) => setQuotationRef(e.target.value)}
                    placeholder="e.g. QT-VND-8841"
                    className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                    Quotation Date
                  </label>
                  <input
                    type="date"
                    value={quotationDate}
                    onChange={(e) => setQuotationDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                    Quotation Validity
                  </label>
                  <input
                    type="date"
                    value={rfqValidityDate}
                    onChange={(e) => setRfqValidityDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                  />
                </div>
              </div>
            </div>

            {/* STAGE 2 (PO) FIELDS */}
            {(currentStage === 'purchase_order' || currentStage === 'goods_receipt') && (
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  currentStage === 'purchase_order'
                    ? 'bg-[var(--color-surface-container)] border-[var(--color-primary)]'
                    : 'bg-[var(--color-surface-container-low)] border-[var(--color-outline-variant)]/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-[var(--color-on-surface)] flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    Stage 2: Official Purchase Order (PO) Agreement
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                    {currentStage === 'purchase_order' ? 'Active' : 'Contracted'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      PO Number
                    </label>
                    <input
                      type="text"
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      placeholder="PO-2026-0042"
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-bold text-[var(--color-on-surface)] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      PO Confirmation Date
                    </label>
                    <input
                      type="date"
                      value={poDate}
                      onChange={(e) => setPoDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      Promised Delivery Date
                    </label>
                    <input
                      type="date"
                      value={poDeliveryDate}
                      onChange={(e) => setPoDeliveryDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      Payment Terms
                    </label>
                    <input
                      type="text"
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                      placeholder="Net 30 Days / Advance"
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 3 (GOODS RECEIPT / GRN) FIELDS */}
            {currentStage === 'goods_receipt' && (
              <div className="p-3.5 rounded-2xl border bg-[var(--color-surface-container)] border-[var(--color-primary)] transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-[var(--color-on-surface)] flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-[var(--color-success)]" />
                    Stage 3: Goods Receipt Note (GRN) & Gate Inward Inspection
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-success-container)] text-[var(--color-on-success-container)]">
                    Inward Verification
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      GRN Number
                    </label>
                    <input
                      type="text"
                      value={grnNumber}
                      onChange={(e) => setGrnNumber(e.target.value)}
                      placeholder="GRN-2026-0042"
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-bold text-[var(--color-on-surface)] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      Inward Gate Date
                    </label>
                    <input
                      type="date"
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      Delivery Challan / E-Way Bill
                    </label>
                    <input
                      type="text"
                      value={challanNumber}
                      onChange={(e) => setChallanNumber(e.target.value)}
                      placeholder="e.g. CH-993021"
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      Vendor Invoice No
                    </label>
                    <input
                      type="text"
                      value={vendorInvoiceNumber}
                      onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                      placeholder="e.g. INV-2026-441"
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      Gate Inspector / Received By
                    </label>
                    <input
                      type="text"
                      value={receivedBy}
                      onChange={(e) => setReceivedBy(e.target.value)}
                      placeholder="e.g. Yard Supervisor Ramesh"
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-0.5">
                      Quality & Weighbridge Inspection Status
                    </label>
                    <select
                      value={inspectionStatus}
                      onChange={(e) =>
                        setInspectionStatus(
                          e.target.value as 'accepted' | 'accepted_with_shortage' | 'rejected'
                        )
                      }
                      className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-bold text-[var(--color-on-surface)]"
                    >
                      <option value="accepted">Accepted Full (Sound Material & Grade)</option>
                      <option value="accepted_with_shortage">Accepted With Discrepancy / Shortage</option>
                      <option value="rejected">Rejected (Off-Spec / Substandard)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: LINE ITEMS TABLE WITH RECEIPT RECONCILIATION */}
          <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-5 rounded-2xl border border-[var(--color-outline-variant)] shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--color-primary)]" />
                  <span>Purchased Materials & Inward Stock Locations</span>
                </h4>
                <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                  Locations derived from the selected item's inventory. Auto-fills rate & pre-selects configured location.
                </p>
              </div>

              {currentStage === 'goods_receipt' && calculations.discrepancyCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)] border border-[var(--color-warning)]/30">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {calculations.discrepancyCount} Item(s) with Shortage/Overage
                </span>
              )}
            </div>

            <div className="overflow-x-auto border border-[var(--color-outline-variant)] rounded-2xl bg-[var(--color-surface)]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[10px] font-extrabold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Item / Raw Material</th>
                    <th className="py-2.5 px-3 w-40">Target Stockyard Location</th>
                    <th className="py-2.5 px-3 w-28 text-right">
                      {currentStage === 'goods_receipt' ? 'Ordered Qty' : currentStage === 'rfq' ? 'Requested Qty' : 'Quantity'}
                    </th>
                    {currentStage === 'goods_receipt' && (
                      <th className="py-2.5 px-3 w-32 text-right bg-[var(--color-surface-container-high)]">
                        Actual Received Qty
                      </th>
                    )}
                    {/* Rate & Subtotal: Available on Stage 2 (PO) and Stage 3 (GRN) only */}
                    {currentStage !== 'rfq' && (
                      <>
                        <th className="py-2.5 px-3 w-28 text-right">Rate (₹/Unit)</th>
                        <th className="py-2.5 px-3 w-28 text-right">Subtotal</th>
                      </>
                    )}
                    <th className="py-2.5 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]/60">
                  {lineItems.map((row, idx) => {
                    const selectedProduct = productItems.find((p) => p.id === row.itemId);
                    const rawProdLocs = selectedProduct?.locations && selectedProduct.locations.length > 0
                      ? selectedProduct.locations
                      : (selectedProduct?.stockLocation
                          ? selectedProduct.stockLocation.split(',').map((s) => ({ locationName: s.trim(), currentStock: selectedProduct.currentStock || 0 }))
                          : []);
                    const seenPL = new Set<string>();
                    const prodLocations = rawProdLocs.filter((l) => {
                      const n = l.locationName?.trim();
                      if (!n || seenPL.has(n.toLowerCase())) return false;
                      seenPL.add(n.toLowerCase());
                      return true;
                    });
                    const plantLocs = localDb.getLocations();
                    const availableDropdownLocs = prodLocations.length > 0
                      ? prodLocations
                      : plantLocs.map((pl) => ({ locationName: pl.name, currentStock: selectedProduct?.currentStock || 0 }));
                    const orderedQtyVal = parseFloat(row.quantity) || 0;
                    const receivedQtyVal =
                      row.receivedQuantity !== ''
                        ? parseFloat(row.receivedQuantity) || 0
                        : orderedQtyVal;
                    const rateVal = parseFloat(row.rate) || 0;
                    const itemAmount = orderedQtyVal * rateVal;

                    const shortage = orderedQtyVal - receivedQtyVal;

                    return (
                      <tr key={idx} className="hover:bg-[var(--color-surface-container-high)]/20 transition-colors">
                        {/* Item selector */}
                        <td className="py-3 px-3 align-top">
                          <select
                            value={row.itemId}
                            onChange={(e) => handleItemSelect(idx, e.target.value)}
                            disabled={currentStage === 'goods_receipt'}
                            className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)] disabled:bg-[var(--color-surface-container-high)]/40 disabled:cursor-not-allowed"
                          >
                            <option value="">-- Choose Raw Material --</option>
                            {productItems.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                {prod.name} ({prod.unit || 'MT'})
                              </option>
                            ))}
                          </select>
                          {selectedProduct && (
                            <div className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 flex items-center gap-1.5">
                              <span>Total Stock: <strong className="text-[var(--color-on-surface)]">{selectedProduct.currentStock} {selectedProduct.unit}</strong></span>
                              {currentStage !== 'rfq' && selectedProduct.taxRateGst !== undefined && (
                                <span className="bg-[var(--color-surface-container-high)] px-1.5 py-0.2 rounded font-semibold text-[9px]">
                                  Default GST: {selectedProduct.taxRateGst}%
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Location Dropdown */}
                        <td className="py-3 px-3 align-top">
                          {availableDropdownLocs.length > 0 ? (
                            <select
                              value={row.location || availableDropdownLocs[0].locationName}
                              onChange={(e) => handleItemFieldChange(idx, 'location', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)] focus:border-[var(--color-primary)]"
                            >
                              {availableDropdownLocs.map((loc, lIdx) => (
                                <option key={lIdx} value={loc.locationName}>
                                  {loc.locationName} ({loc.currentStock} {selectedProduct?.unit || 'MT'})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={row.location}
                              onChange={(e) => handleItemFieldChange(idx, 'location', e.target.value)}
                              placeholder="Yard Pile / Silo"
                              className="w-full px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)]"
                            />
                          )}
                          <p className="text-[9px] text-[var(--color-on-surface-variant)] mt-1">
                            {prodLocations.length === 1
                              ? 'Single item location auto-selected'
                              : 'Select destination yard'}
                          </p>
                        </td>

                        {/* Ordered Quantity */}
                        <td className="py-3 px-3 align-top text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={row.quantity}
                              disabled={currentStage === 'goods_receipt'}
                              onChange={(e) => handleItemFieldChange(idx, 'quantity', e.target.value)}
                              placeholder="0"
                              className="w-20 px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-bold text-[var(--color-on-surface)] text-right disabled:bg-[var(--color-surface-container-high)]/40 disabled:cursor-not-allowed"
                            />
                            <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)]">
                              {row.unit || 'MT'}
                            </span>
                          </div>
                        </td>

                        {/* Actual Received Quantity (Only in Goods Receipt Stage) */}
                        {currentStage === 'goods_receipt' && (
                          <td className="py-3 px-3 align-top text-right bg-[var(--color-surface-container-high)]/30">
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={row.receivedQuantity}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, 'receivedQuantity', e.target.value)
                                }
                                placeholder={row.quantity}
                                className="w-20 px-2.5 py-1.5 bg-[var(--color-surface)] border-2 border-[var(--color-primary)] rounded-xl text-xs font-black text-[var(--color-on-surface)] text-right focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                              />
                              <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)]">
                                {row.unit || 'MT'}
                              </span>
                            </div>

                            {/* Shortage / Overage Badge */}
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

                        {/* Rate - Stage 2 (PO) & Stage 3 (GRN) Only */}
                        {currentStage !== 'rfq' && (
                          <td className="py-3 px-3 align-top text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)]">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={row.rate}
                                disabled={currentStage === 'goods_receipt'}
                                onChange={(e) => handleItemFieldChange(idx, 'rate', e.target.value)}
                                placeholder="0"
                                className="w-20 px-2.5 py-1.5 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)] text-right disabled:bg-[var(--color-surface-container-high)]/40 disabled:cursor-not-allowed"
                              />
                            </div>
                          </td>
                        )}

                        {/* Subtotal - Stage 2 (PO) & Stage 3 (GRN) Only */}
                        {currentStage !== 'rfq' && (
                          <td className="py-3 px-3 align-top text-right font-black text-[var(--color-on-surface)]">
                            {formatCurrency2(itemAmount)}
                          </td>
                        )}

                        {/* Remove */}
                        <td className="py-3 px-2 align-top text-center">
                          {currentStage !== 'goods_receipt' && lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(idx)}
                              className="p-1 text-[var(--color-on-surface-variant)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-full transition-colors"
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

            {currentStage !== 'goods_receipt' && (
              <button
                type="button"
                onClick={handleAddLineItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-primary)] border border-[var(--color-outline-variant)] transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Material Row</span>
              </button>
            )}
          </div>

          {/* SECTION 4: TAXES, GST RATE, & TOTAL SUMMARY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Notes & Taxation Selection (Taxation on Stage 2 & 3 only) */}
            <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-5 rounded-2xl border border-[var(--color-outline-variant)] shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-[var(--color-primary)]" />
                <h4 className="text-xs font-black text-[var(--color-on-surface)] uppercase tracking-wider">
                  {currentStage === 'rfq' ? 'Operational & Inquiry Notes' : 'Taxation & Operational Notes'}
                </h4>
              </div>

              {/* Taxation GST slab rate selection - Stage 2 & 3 only */}
              {currentStage !== 'rfq' && (
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">
                    GST Slab Rate (Auto-derived from item default)
                  </label>
                  <select
                    value={taxRateGst}
                    onChange={(e) => setTaxRateGst(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-black text-[var(--color-on-surface)] focus:border-[var(--color-primary)]"
                  >
                    <option value="0">0% (Exempted Aggregates)</option>
                    <option value="5">5% (Bitumen Emulsion & Standard Quarry)</option>
                    <option value="12">12% (Construction Minerals)</option>
                    <option value="18">18% (Standard Hotmix & Paving Goods)</option>
                    <option value="28">28% (Luxury / Specialized Chem Additives)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">
                  {currentStage === 'rfq' ? 'Quotation Instructions & Remarks' : 'Internal Notes & Supplier Instructions'}
                </label>
                <textarea
                  rows={currentStage === 'rfq' ? 4 : 2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    currentStage === 'rfq'
                      ? 'e.g. Inquire about test certificate requirements, delivery schedules, and price validity period.'
                      : 'e.g. Weighbridge slip required with truck challan. Unload at Yard Section B.'
                  }
                  className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs text-[var(--color-on-surface)] resize-none"
                />
              </div>
            </div>

            {/* Financial Summary (Stage 2 & 3) vs RFQ Scope Summary (Stage 1) */}
            <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-5 rounded-2xl border border-[var(--color-outline-variant)] shadow-xs flex flex-col justify-between space-y-3">
              {currentStage === 'rfq' ? (
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center font-bold text-[var(--color-on-surface-variant)]">
                    <span>Materials Inquired:</span>
                    <span className="text-[var(--color-on-surface)] font-black">
                      {lineItems.filter((i) => i.itemId).length} Material Row(s)
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-bold text-[var(--color-on-surface-variant)]">
                    <span>Total Requested Quantity:</span>
                    <span className="text-[var(--color-on-surface)] font-black">
                      {calculations.totalOrderedQty.toLocaleString('en-IN')} Units
                    </span>
                  </div>

                  <div className="h-px bg-[var(--color-outline-variant)]" />

                  <div className="p-2.5 rounded-xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/60 text-[11px]">
                    <span className="font-bold text-[var(--color-on-surface)] block mb-0.5">Commercial Terms:</span>
                    <p className="text-[10px] text-[var(--color-primary)] font-semibold">
                      Supplier rates, tax slabs & formal totals are finalized during Stage 2: Purchase Order preparation.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between font-bold text-[var(--color-on-surface-variant)]">
                    <span>Materials Subtotal:</span>
                    <span className="text-[var(--color-on-surface)]">{formatCurrency2(calculations.subtotal)}</span>
                  </div>

                  <div className="flex justify-between font-bold text-[var(--color-on-surface-variant)]">
                    <span>GST Amount ({taxRateGst}%):</span>
                    <span className="text-[var(--color-on-surface)]">{formatCurrency2(calculations.taxAmount)}</span>
                  </div>

                  <div className="h-px bg-[var(--color-outline-variant)]" />

                  <div className="flex justify-between items-center text-sm font-black text-[var(--color-on-surface)]">
                    <span>Grand Total (Net Inward):</span>
                    <span className="text-base text-[var(--color-primary)]">
                      {formatCurrency2(calculations.grandTotal)}
                    </span>
                  </div>
                </div>
              )}

              {/* Stage Inventory Notification Banner */}
              <div className="p-3 rounded-xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/60 text-[10px]">
                <p className="font-black text-[var(--color-on-surface)] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  Inventory Rule for {STAGES.find((s) => s.id === currentStage)?.label}:
                </p>
                <p className="text-[var(--color-on-surface-variant)] mt-0.5">
                  {currentStage === 'rfq' && 'RFQ stage does NOT alter raw material stockyard levels.'}
                  {currentStage === 'purchase_order' && 'Purchase Order stage increments inventory stock balance for ordered materials.'}
                  {currentStage === 'goods_receipt' && 'Goods Receipt reconciles inventory to actual received volume and registers shortage logs.'}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 5: OPTIONAL PAYMENT SETTLEMENT & DEPOSIT ACCOUNT - STAGE 3 (GOODS RECEIPT) ONLY */}
          {currentStage === 'goods_receipt' && (
            <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-5 rounded-2xl border border-[var(--color-outline-variant)] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-[var(--color-primary)]" />
                  <div>
                    <h4 className="text-xs font-black text-[var(--color-on-surface)] uppercase tracking-wider">
                      Payment Settlement & Bank Account
                    </h4>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)]">
                      Optional upfront ledger settlement or payout
                    </p>
                  </div>
                </div>

                {/* M3 Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePayment}
                    onChange={(e) => setIncludePayment(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[var(--color-surface-container-high)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                </label>
              </div>

              {includePayment && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[var(--color-outline-variant)]/60 text-xs animate-in fade-in duration-150">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">
                      Debit / Payment Account <span className="text-[var(--color-error)]">*</span>
                    </label>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-semibold text-[var(--color-on-surface)] focus:border-[var(--color-primary)] outline-none"
                    >
                      <option value="">-- Select Active Account --</option>
                      {accounts
                        .filter((a) => a.isActive)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({acc.type.toUpperCase()}) - Bal: {formatCurrency(acc.currentBalance)}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--color-on-surface-variant)] mb-1">
                      Payment Mode
                    </label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                      className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded-xl text-xs font-bold text-[var(--color-on-surface)] focus:border-[var(--color-primary)] outline-none"
                    >
                      <option value="bank_transfer">Bank Transfer (NEFT / RTGS)</option>
                      <option value="cheque">Cheque</option>
                      <option value="upi">UPI / Instant Pay</option>
                      <option value="cash">Cash Counter</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- FOOTER ACTIONS --- */}
        <div className="px-6 py-4 border-t border-[var(--color-outline-variant)] flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-on-surface-variant)]">
              Workflow:{' '}
              <strong className="text-[var(--color-on-surface)]">
                {STAGES.find((s) => s.id === currentStage)?.title}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <div className="flex flex-col gap-1">
              {/* ONE-SHOT inventory application toggle */}
              <label
                className={`inline-flex items-center gap-2 select-none ${
                  existingOrder?.inventoryApplied ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
                title={
                  existingOrder?.inventoryApplied
                    ? 'Stockyard inventory was already applied for this purchase (one-time per purchase)'
                    : 'POSTs the FIFO purchase_inward ledger rows in THIS stage save'
                }
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  disabled={existingOrder?.inventoryApplied}
                  checked={updateInventory}
                  onChange={(e) => setUpdateInventory(e.target.checked)}
                />
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                    updateInventory ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-outline)]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                      updateInventory ? 'translate-x-4' : 'translate-x-0.5'
                    } my-0.5 mx-0.5`}
                  />
                </span>
                <span className="text-[11px] font-bold text-[var(--color-on-surface)] whitespace-nowrap">
                  {existingOrder?.inventoryApplied
                    ? 'Inventory already applied'
                    : updateInventory
                    ? 'Update Stockyard Inventory ✓'
                    : 'Inventory untouched'}
                </span>
              </label>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-all"
            >
              Close
            </button>

            {/* Save Current Stage button */}
            <button
              type="button"
              onClick={handleSaveCurrentStage}
              className="px-4 py-2 bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface)] rounded-full text-xs font-bold border border-[var(--color-outline-variant)] transition-all shadow-xs"
            >
              Save as {STAGES.find((s) => s.id === currentStage)?.badge}
            </button>

            {/* Advance to Next Stage Button */}
            {currentStage !== 'goods_receipt' ? (
              <button
                type="button"
                onClick={handleAdvanceToNextStage}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-black transition-all shadow-xs active:scale-95"
              >
                <span>
                  Advance to{' '}
                  {currentStage === 'rfq'
                    ? 'Purchase Order (PO)'
                    : 'Goods Receipt (GRN)'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveCurrentStage}
                className="inline-flex items-center gap-1.5 px-6 py-2 bg-[var(--color-success)] hover:opacity-90 text-[var(--color-on-success)] rounded-full text-xs font-black transition-all shadow-xs active:scale-95"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Goods Receipt & Complete</span>
              </button>
            )}
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
                            {ordered} {item.unit}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-[var(--color-primary)]">
                            {received} {item.unit}
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
                  Confirm & Update Stock
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
                    Users can cancel anytime. If cancelled, this purchase order status will be set to Cancelled and any stock added at PO stage will be reverted.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirmModal(false)}
                  className="px-4 py-2 border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold transition-all"
                >
                  Keep Order Active
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
