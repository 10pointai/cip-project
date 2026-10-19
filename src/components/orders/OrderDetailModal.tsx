import React, { useMemo, useState } from 'react';
import { X, Ban, Edit3, Boxes, Landmark } from 'lucide-react';
import { Item, Party, CompanySettings, SalesStage, PurchaseStage } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import {
  OrderDisplay,
  SALES_STAGE_META,
  PURCHASE_STAGE_META,
  saleToDisplay,
  purchaseToDisplay,
  salesStageActionMenu,
  purchaseStageActionMenu,
  isSaleLocked,
  isPurchaseLocked,
  editLabelFor,
  StageDocDisplay,
  PurchaseStageDocDisplay,
  masterPkShort,
} from './orderDisplay';
import { SaleStageDocCard, PurchaseStageDocCard } from './StageDocumentCards';
import { OrderDocumentPreviewModal } from './OrderDocumentPreviewModal';
import { OrderDocumentsSection } from './OrderDocumentsSection';
import { formatDateTime } from '../../utils/formatters';

/**
 * ORDER DETAILS MODAL — THE shared order story modal of the Sales/Purchases
 * module (stage tabs + per-stage document cards + issue/edit actions +
 * the commercial-document preview). OrdersView replays it inline; other
 * contexts (e.g. the party statement) mount the same modal with their own
 * action callbacks.
 */
interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Live-refreshed by the caller when the record syncs (OrdersView rules) */
  order: OrderDisplay | null;
  parties: Party[];
  items: Item[];
  settings: CompanySettings;
  /** Issue a next stage document — omit ⇒ no issue buttons */
  onIssueStage?: (order: OrderDisplay, stageType: SalesStage | PurchaseStage) => void;
  /** Edit the order master — omit ⇒ no edit button */
  onEditOrder?: (order: OrderDisplay, e: React.MouseEvent) => void;
  /** Called when the close (X / Close) button is used */
}

export function OrderDetailModal({
  isOpen,
  onClose,
  order: selectedOrder,
  parties,
  items,
  settings,
  onIssueStage,
  onEditOrder,
}: OrderDetailModalProps) {
  // Sales detail stage tabs: which issued stage document to display
  // (null = show the CURRENT/latest stage on open)
  const [detailStageTab, setDetailStageTab] = useState<string | null>(null);
  // Self-contained commercial-document preview (Open document / View Proforma)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<OrderDisplay | null>(null);
  const [previewStage, setPreviewStage] = useState<string>('sales_order');

  // Reset the stage tab when a different order is served
  React.useEffect(() => {
    setDetailStageTab(null);
  }, [selectedOrder?.id]);

  // Close the internal preview if the whole modal goes away
  React.useEffect(() => {
    if (!isOpen) {
      setIsPreviewOpen(false);
      setPreviewOrder(null);
    }
  }, [isOpen]);

  const linkedTripSlip = useMemo(() => {
    if (!previewOrder) return null;
    return localDb.getTripSlips().find((s) => s.orderId === previewOrder.id || s.orderNumber === previewOrder.orderNumber);
  }, [previewOrder, isPreviewOpen]);

  if (!isOpen || !selectedOrder) return null;

  /** Opens the commercial-document preview for a SPECIFIC stage doc (its own
   *  line values/totals), e.g. printing the quotation alone. */
  const openStageDocPreview = (doc: StageDocDisplay) => {
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

  /** Opens the purchase stage doc preview (the GRN/PO/RFQ variant) */
  const openPurchaseStageDocPreview = (doc: PurchaseStageDocDisplay) => {
    setPreviewOrder({ ...(selectedOrder as any), purchaseStage: doc.stageType });
    setPreviewStage(doc.stageType);
    setIsPreviewOpen(true);
  };

  const openProformaPreview = () => {
    setPreviewOrder(selectedOrder);
    setPreviewStage('proforma_invoice');
    setIsPreviewOpen(true);
  };

  const canIssue = !!onIssueStage;
  const canEdit = !!onEditOrder;

  return (
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
          {/* Master row's primary key (shortened) + creation date as subtext
              (user rule — not the order/date fields) */}
          <h3 className="text-base font-black text-[var(--color-on-surface)]">
            {masterPkShort(selectedOrder.id)}
          </h3>
          <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
            {formatDateTime(selectedOrder.createdAt, 'dash')}
          </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
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
                      {canIssue && !isSaleLocked(selectedOrder) && salesStageActionMenu(selectedOrder).map((sa) => {
                        const StageIcon = sa.icon;
                        return (
                          <button
                            key={sa.stageType}
                            type="button"
                            title={`Issue ${sa.label}`}
                            onClick={() => onIssueStage!(selectedOrder, sa.stageType)}
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

                    {/* The active stage document — the CURRENT stage's card
                        is dated with the order's saved date (user rule) */}
                    <SaleStageDocCard
                      doc={active.stageType === (selectedOrder.stage || 'sales_order')
                        ? { ...active, date: selectedOrder.date }
                        : active}
                      order={selectedOrder}
                      currencyCode={settings.currency?.code}
                      onOpenDocument={openStageDocPreview}
                      onViewProforma={openProformaPreview}
                    />
                  </>
                );
              })()}
            </div>
          )}

          {/* PURCHASE — Stage Documents: one card per issued stage
              (Request Quotation / Purchase Order / Goods Receiving),
              mirroring the sales detail modal's per-stage cards */}
          {selectedOrder.type === 'purchase' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                Stage Documents
              </h4>

              {(() => {
                const docs = selectedOrder.purchaseStageDocs || [];
                if (docs.length === 0) return null;
                const active =
                  docs.find((d) => d.stageType === (detailStageTab || selectedOrder.purchaseStage)) ||
                  docs[docs.length - 1];
                return (
                  <>
                    {/* Stage tabs — click a stage to view its document data */}
                    <div className="flex flex-wrap gap-1.5">
                      {docs.map((d) => {
                        const meta = PURCHASE_STAGE_META[d.stageType] || PURCHASE_STAGE_META.purchase_order;
                        const isActive = d.stageType === active.stageType;
                        const isCurrent = d.stageType === selectedOrder.purchaseStage;
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
                      {/* Next stages — dashed create buttons in the tab row */}
                      {canIssue && !isPurchaseLocked(selectedOrder) && purchaseStageActionMenu(selectedOrder).map((sa) => {
                        const StageIcon = sa.icon;
                        return (
                          <button
                            key={sa.stageType}
                            type="button"
                            title={`Issue ${sa.label}`}
                            onClick={() => onIssueStage!(selectedOrder, sa.stageType)}
                            className="flex flex-col items-start px-3.5 py-2 rounded-full text-[11px] font-bold border border-dashed border-[var(--color-primary)]/50 text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/30 transition-all"
                          >
                            <span className="flex items-center gap-1">
                              <StageIcon className="w-3.5 h-3.5" />+ {sa.label}
                            </span>
                          </button>
                        );
                      })}
                      {isPurchaseLocked(selectedOrder) && (
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold text-[var(--color-error)] bg-[var(--color-error-container)]/25 border border-[var(--color-error)]/30">
                          <Ban className="w-3 h-3" /> {selectedOrder.status === 'cancelled' ? 'Purchase cancelled' : 'Purchase locked — goods received'}
                        </span>
                      )}
                    </div>

                    {/* The active stage document */}
                    {(() => {
                      const purchaseActive = active as PurchaseStageDocDisplay;
                      return (
                        <PurchaseStageDocCard
                          doc={purchaseActive}
                          order={selectedOrder}
                          currencyCode={settings.currency?.code}
                          onOpenDocument={openPurchaseStageDocPreview}
                        />
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          )}

          {/* Order state info — the master's one-shot flags as plain info:
              stockyard posting + where the payment flow was booked */}
          {(() => {
            const isSale = selectedOrder.type === 'sales';
            const stockApplied = selectedOrder.inventoryApplied;
            const cashFlow = selectedOrder.cashApplied
              ? (selectedOrder.settlementType || 'account')
              : undefined;
            return (
              <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-1.5">
                {/* Stock: dispatch (sales) / inward (purchase) one-shot flag */}
                <div className="flex items-center gap-2 min-w-0">
                  <Boxes className={`w-4 h-4 shrink-0 ${stockApplied ? 'text-[var(--color-success)]' : 'text-[var(--color-outline)]'}`} />
                  <p className="text-xs min-w-0">
                    <span className="text-[var(--color-on-surface-variant)]">
                      {isSale ? 'Stockyard Dispatch' : 'Stock Inward'}:{' '}
                    </span>
                    <span className="font-bold text-[var(--color-on-surface)]">
                      {stockApplied ? 'stock updated' : 'stock not updated yet'}
                    </span>
                  </p>
                </div>

                {/* Payment flow: where/how the payment was booked */}
                <div className="flex items-center gap-2 min-w-0">
                  <Landmark className={`w-4 h-4 shrink-0 ${cashFlow ? 'text-[var(--color-success)]' : 'text-[var(--color-outline)]'}`} />
                  <p className="text-xs min-w-0">
                    <span className="text-[var(--color-on-surface-variant)]">Payment flow: </span>
                    {cashFlow === 'account' ? (
                      <span className="font-bold text-[var(--color-on-surface)]">
                        booked {isSale ? 'receipt' : 'payout'}
                        {selectedOrder.settlementVoucherNumber ? ` ${selectedOrder.settlementVoucherNumber}` : ''}
                        {selectedOrder.settlementAccountName ? ` · ${selectedOrder.settlementAccountName}` : ''}
                      </span>
                    ) : cashFlow === 'credit' ? (
                      <span className="font-bold text-[var(--color-on-surface)]">booked on credit — party ledger</span>
                    ) : (
                      <span className="font-bold text-[var(--color-on-surface)]">not booked yet</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* DOCUMENTS: available on EVERY order in EVERY stage — locked
              invoices included (upload-only; no delete per user directive).
              Uploads link to the order immediately. */}
          <OrderDocumentsSection
            feature={selectedOrder.type === 'purchase' ? 'purchase' : 'sale'}
            entityId={selectedOrder.id}
          />

          {/* Actions Footer */}
          <div className="flex items-center justify-end pt-3 border-t border-[var(--color-outline-variant)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] rounded-full text-xs font-semibold hover:bg-[var(--color-surface-container-high)] transition-colors"
              >
                Close
              </button>
              {/* Locked orders offer no edit: invoiced sales, and purchases
                  at the goods-receipt stage (or cancelled) — the GRN locks
                  the purchase. */}
              {canEdit &&
              !((selectedOrder.type === 'sales' && isSaleLocked(selectedOrder)) ||
              (selectedOrder.type === 'purchase' && isPurchaseLocked(selectedOrder))) && (
                <button
                  type="button"
                  onClick={(e) => onEditOrder?.(selectedOrder, e)}
                  className="flex items-center gap-1 px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-semibold hover:opacity-90 transition-colors"
                >
                  <Edit3 className="w-4 h-4" /> {selectedOrder.type === 'sales' ? editLabelFor(selectedOrder) : 'Edit Purchase'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Self-contained commercial-document preview */}
      <OrderDocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        order={previewOrder}
        stage={previewStage}
        parties={parties}
        items={items}
        settings={settings}
      />
    </div>
  );
}

/** Convenience re-exports so callers map relational masters once */
export { saleToDisplay, purchaseToDisplay };