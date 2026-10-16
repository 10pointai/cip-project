import React, { useEffect, useState } from 'react';
import { X, Building2, Truck } from 'lucide-react';
import { SaleStageDocCard, PurchaseStageDocCard } from './StageDocumentCards';
import { OrderDisplay, SALES_STAGE_META, PURCHASE_STAGE_META, StageDocDisplay, PurchaseStageDocDisplay } from './orderDisplay';

/**
 * READ-ONLY order documents viewer — replays the Sales/Purchases detail
 * modal's presentation (stage pill tabs + per-stage document cards) for any
 * context outside the orders module (e.g. the party statement). No
 * issue/edit actions — those stay OrdersView-bound; "Open in module" is an
 * optional navigation affordance.
 */
interface OrderDocumentsViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderDisplay | null;
  currencyCode?: string;
  /** Optional "Open in Sales/Purchases" footer affordance */
  onOpenInModule?: () => void;
  moduleLabel?: string;
}

export function OrderDocumentsViewerModal({
  isOpen, onClose, order, currencyCode, onOpenInModule, moduleLabel,
}: OrderDocumentsViewerModalProps) {
  const [activeStage, setActiveStage] = useState<string | null>(null);

  // Esc closes (matches the orders module's modal shells)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Reset the tab when a different order (or none) is served
  useEffect(() => {
    setActiveStage(null);
  }, [order?.id]);

  if (!isOpen || !order) return null;

  const isSale = order.type === 'sales';
  const stageMeta = isSale ? SALES_STAGE_META : PURCHASE_STAGE_META;
  const stageDocs = isSale ? (order.stageDocs || []) : (order.purchaseStageDocs || []);
  // Default to the OLDEST tab? No — open on the latest issued document.
  const defaultStage = stageDocs.length > 0 ? stageDocs[stageDocs.length - 1].stageType : '';
  const currentStage = activeStage && stageDocs.some((d) => d.stageType === activeStage)
    ? activeStage : defaultStage;
  const activeDoc = stageDocs.find((d) => d.stageType === currentStage);
  const statusTone =
    order.status === 'cancelled' ? 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
    : order.status === 'completed' ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
    : 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] rounded-3xl w-full max-w-2xl shadow-2xl border border-[var(--color-outline-variant)] flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-[var(--color-outline-variant)]/60">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${isSale ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]' : 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'}`}>
              {isSale ? <Building2 className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <p className="font-mono font-bold text-sm text-[var(--color-on-surface)] truncate">{order.orderNumber}</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="text-xs text-[var(--color-on-surface-variant)] truncate">
                  {isSale ? 'Sale' : 'Purchase'} · {order.partyName || '—'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusTone}`}>
                  {(order.status || '').replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--color-surface-container-high)] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-[var(--color-on-surface-variant)]" />
          </button>
        </div>

        {/* Stage pill tabs (read-only — no issue buttons) */}
        {stageDocs.length > 0 && (
          <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-[var(--color-outline-variant)]/60 bg-[var(--color-surface-container-lowest)]">
            {stageDocs.map((d) => {
              const meta = stageMeta[d.stageType] || Object.values(stageMeta)[0];
              const active = d.stageType === currentStage;
              return (
                <button
                  key={d.stageType}
                  type="button"
                  onClick={() => setActiveStage(d.stageType)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                    active
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-highest)]'
                  }`}
                  title={`${meta.label} — ${d.stageNumber}`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Active stage document card (read-only) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {(() => {
            if (isSale) {
              const saleDoc = activeDoc as StageDocDisplay | undefined;
              return saleDoc
                ? <SaleStageDocCard doc={saleDoc} order={order} currencyCode={currencyCode} />
                : null;
            }
            const purchaseDoc = activeDoc as PurchaseStageDocDisplay | undefined;
            return purchaseDoc
              ? <PurchaseStageDocCard doc={purchaseDoc} order={order} currencyCode={currencyCode} />
              : null;
          })()}
          {!activeDoc && (
            <div className="text-xs text-[var(--color-on-surface-variant)] italic py-6 text-center">
              No stage documents issued for this {isSale ? 'sale' : 'purchase'} yet.
            </div>
          )}
        </div>

        {/* Optional module navigation footer */}
        {onOpenInModule && (
          <div className="px-5 py-3 border-t border-[var(--color-outline-variant)]/60 flex items-center justify-end bg-[var(--color-surface-container-lowest)]">
            <button
              type="button"
              onClick={onOpenInModule}
              className="px-4 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold hover:opacity-90 transition-all"
            >
              Open in {moduleLabel || (isSale ? 'Sales' : 'Purchases')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}