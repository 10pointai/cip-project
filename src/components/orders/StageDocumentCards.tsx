import React from 'react';
import { Printer, Receipt } from 'lucide-react';
import { SALES_STAGE_META, PURCHASE_STAGE_META } from './orderDisplay';
import { StageDocDisplay, PurchaseStageDocDisplay, OrderDisplay } from './orderDisplay';

/** Amounts are approximated to 2 decimal places (paise); math keeps floats
 *  but every figure displayed is rounded to 2dp. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const makeFormatCurrency2 = (currencyCode?: string) => (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode || 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(amount));
};

interface StageDocCardProps {
  doc: StageDocDisplay;
  /** The order display model — supplies the settlement record for the strip */
  order?: OrderDisplay | null;
  currencyCode?: string;
  /** Optional handlers — omitted ⇒ read-only card (e.g. party statement) */
  onOpenDocument?: (doc: StageDocDisplay) => void;
  /** View Proforma (sales_order card) */
  onViewProforma?: () => void;
}

/** ONE stage document card: doc header in its own format, the stage's own
 *  line values, totals + its document actions. (Extracted verbatim from the
 *  sales detail modal in OrdersView so the party statement can reuse it.) */
export function SaleStageDocCard({ doc, order, currencyCode, onOpenDocument, onViewProforma }: StageDocCardProps) {
  const meta = SALES_STAGE_META[doc.stageType] || SALES_STAGE_META.sales_order;
  const MetaIcon = meta.icon;
  const formatCurrency2 = makeFormatCurrency2(currencyCode);
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
        {(onOpenDocument || onViewProforma) && (
          <div className="flex items-center gap-2 shrink-0">
            {/* {onOpenDocument && (
              <button
                type="button"
                onClick={() => onOpenDocument(doc)}
                className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-[10px] font-bold hover:opacity-90 transition-all"
              >
                <Printer className="w-3 h-3" /> Open document
              </button>
            )} */}
            {doc.stageType === 'sales_order' && onViewProforma && (
              <button
                type="button"
                disabled
                onClick={onViewProforma}
                className="flex items-center gap-1 px-3 py-1.5 border border-[var(--color-primary)]/40 text-[var(--color-primary)] rounded-full text-[10px] font-bold hover:bg-[var(--color-primary-container)]/30 transition-all"
              >
                <Receipt className="w-3 h-3" /> View Proforma
              </button>
            )}
          </div>
        )}
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
            {/* Transport / Fleet cost row — shows when the sale INCLUDED the
                transport cost (priced w × d × rate with its own GST slab) */}
            {order && Number(order.transportCharges) > 0 && (
              <tr>
                <td className="py-1.5 px-2 font-semibold text-[var(--color-on-surface)]">
                  Transport / Fleet Charges
                  <span className="block text-[9px] text-[var(--color-on-surface-variant)] font-medium">
                    {(Number(order.weightTonnes) || 0).toLocaleString('en-IN')} MT × {(Number(order.distanceKm) || 0).toLocaleString('en-IN')} km
                    {Number(order.freightRatePerTonne) > 0 ? ` @ ₹${Number(order.freightRatePerTonne)}/T-km` : ''}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-[var(--color-on-surface-variant)] font-medium">—</td>
                <td className="py-1.5 px-2 text-right font-bold text-[var(--color-on-surface)]">
                  {/* The sale's feeded load weight (tonnes) rides the transport row's qty */}
                  {(Number(order.weightTonnes) || 0).toLocaleString('en-IN')} MT
                </td>
                <td className="py-1.5 px-2 text-right text-[var(--color-on-surface-variant)]">
                  {Number(order.freightRatePerTonne) > 0 ? formatCurrency2(Number(order.freightRatePerTonne)) : '—'}
                </td>
                <td className="py-1.5 px-2 text-right text-[var(--color-on-surface-variant)]">{Number((order as any).freightGstRate) || 0}%</td>
                <td className="py-1.5 px-2 text-right font-bold text-[var(--color-on-surface)]">
                  {formatCurrency2(Number(order.transportCharges))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Doc totals — when transport was included, the GST strip reconciles:
          item tax + GST on the fleet-cost row (total already carries both) */}
      <div className="px-4 py-2.5 border-t border-[var(--color-outline-variant)]/60 flex items-center justify-end gap-4 text-[11px]">
        <span className="text-[var(--color-on-surface-variant)]">Subtotal: <strong className="text-[var(--color-on-surface)]">{formatCurrency2(doc.subtotal)}</strong></span>
        <span className="text-[var(--color-on-surface-variant)]">
          GST: <strong className="text-[var(--color-on-surface)]">
            {formatCurrency2(doc.taxAmount + (order && Number(order.transportCharges) > 0
              ? Math.round((Number(order.transportCharges) * (Number((order as any).freightGstRate) || 0) / 100) * 100) / 100
              : 0))}
          </strong>
        </span>
        <span className="text-[var(--color-on-surface-variant)]">
          Transport: <strong className="text-[var(--color-on-surface)]">{formatCurrency2(Number(order?.transportCharges) || 0)}</strong>
        </span>
        <span className="text-[var(--color-on-surface-variant)]">Total: <strong className="text-[var(--color-primary)]">{formatCurrency2(doc.totalAmount)}</strong></span>
      </div>

      {/* Doc settlement info — Cash & Bank wiring for the invoice stage */}
      {doc.stageType === 'sales_invoice' && order && (
        <div className="px-4 py-2.5 border-t border-[var(--color-outline-variant)]/60 flex flex-wrap items-center justify-between gap-2 text-[10px] bg-[var(--color-surface-container-lowest)]">
          <span className="text-[var(--color-on-surface-variant)]">
            Invoice voucher: <strong className="text-[var(--color-on-surface)] font-mono">{order.invoiceVoucherNumber || '—'}</strong>
          </span>
          {order.settlementVoucherNumber ? (
            <span className="text-[var(--color-on-surface-variant)]">
              Settled {(order.settledAmount !== undefined ? formatCurrency2(order.settledAmount) : '')}
              {(order.paymentMode ? ` · ${(order.paymentMode === 'upi' ? 'UPI' : order.paymentMode === 'bank_transfer' ? 'Bank Transfer / IMPS' : order.paymentMode === 'neft_rtgs' ? 'NEFT / RTGS' : order.paymentMode === 'cheque' ? 'Cheque / DD' : 'Cash')}` : '')}
              {' — '}<strong className="text-[var(--color-on-surface)]">{order.settlementAccountName || 'Cash/Bank'}</strong>
              {' · Receipt '}{order.settlementVoucherNumber ? <strong className="text-[var(--color-on-surface)] font-mono">{order.settlementVoucherNumber}</strong> : '—'}
            </span>
          ) : order.settlementType === 'credit' ? (
            <span className="text-[var(--color-on-surface-variant)] italic">Booked on credit — receivable on the Party ledger (receipt —)</span>
          ) : (
            <span className="text-[var(--color-on-surface-variant)] italic">Payment flow not applied — nothing posted yet</span>
          )}
        </div>
      )}
    </div>
  );
}

interface PurchaseStageDocCardProps {
  doc: PurchaseStageDocDisplay;
  /** The order display model — supplies items (GRN received audit), the
   *  stage-specific chips (rfq/po/receipt details) and the settlement strip */
  order?: OrderDisplay | null;
  currencyCode?: string;
  /** Optional handler — omitted ⇒ read-only card */
  onOpenDocument?: (doc: PurchaseStageDocDisplay) => void;
}

/** Purchase detail card for one issued stage (mirror of the sales stage doc
 *  card): the stage's own number/date/totals + stage-specific document chips
 *  + the purchase's item rows (Received/Shortage columns on the GRN card). */
export function PurchaseStageDocCard({ doc, order, currencyCode, onOpenDocument }: PurchaseStageDocCardProps) {
  const meta = PURCHASE_STAGE_META[doc.stageType] || PURCHASE_STAGE_META.purchase_order;
  const MetaIcon = meta.icon;
  const isGrnCard = doc.stageType === 'goods_receipt';
  // Request Quotation = pure inquiry: pending vendor rates — no money columns.
  const isRfqCard = doc.stageType === 'rfq';
  const formatCurrency2 = makeFormatCurrency2(currencyCode);
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
        {/* {onOpenDocument && (
          <button
            type="button"
            onClick={() => onOpenDocument(doc)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-[10px] font-bold hover:opacity-90 transition-all"
          >
            <Printer className="w-3 h-3" /> Open document
          </button>
        )} */}
      </div>

      {/* Stage-specific document chips (only the fields that exist) */}
      {(() => {
        const chips: Array<{ label: string; value: string }> = [];
        if (doc.stageType === 'rfq' && order?.rfqDetails?.rfqNumber) {
          chips.push({ label: 'RFQ No', value: order.rfqDetails.rfqNumber });
        }
        if (doc.stageType === 'purchase_order' && order?.poDetails?.poNumber) {
          chips.push({ label: 'PO No', value: order.poDetails.poNumber });
        }
        if (isGrnCard && order?.receiptDetails) {
          const rd: any = order.receiptDetails;
          if (rd.grnNumber) chips.push({ label: 'GRN', value: rd.grnNumber });
          if (rd.receiptDate) chips.push({ label: 'Inward', value: rd.receiptDate });
          if (rd.challanNumber) chips.push({ label: 'Challan', value: rd.challanNumber });
          if (rd.vendorInvoiceNumber) chips.push({ label: 'Vendor Inv', value: rd.vendorInvoiceNumber });
          if (rd.receivedBy) chips.push({ label: 'Inspector', value: rd.receivedBy });
        }
        if (chips.length === 0) return null;
        return (
          <div className="px-4 py-2 border-b border-[var(--color-outline-variant)]/60 flex flex-wrap gap-x-4 gap-y-1 text-[10px] bg-[var(--color-surface-container-lowest)]">
            {chips.map((c) => (
              <span key={c.label} className="text-[var(--color-on-surface-variant)]">
                {c.label}: <strong className="text-[var(--color-on-surface)]">{c.value}</strong>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Line rows (the purchase's items; Inward location; Received audit on GRN) */}
      <div className="px-2 py-2">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-[var(--color-on-surface-variant)] font-bold text-[9px] uppercase tracking-wider">
              <th className="py-1.5 px-2">Item</th>
              <th className="py-1.5 px-2">Inward Location</th>
              <th className="py-1.5 px-2 text-right">{isGrnCard ? 'Ordered / Received' : 'Qty'}</th>
              {!isRfqCard && <th className="py-1.5 px-2 text-right">Rate</th>}
              {!isRfqCard && <th className="py-1.5 px-2 text-right">GST</th>}
              {!isRfqCard && <th className="py-1.5 px-2 text-right">Amount</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-outline-variant)]/50">
            {(order?.items || []).map((i, idx) => (
              <tr key={idx}>
                <td className="py-1.5 px-2 font-semibold text-[var(--color-on-surface)] truncate max-w-[220px]">
                  {i.itemCode ? `${i.itemCode} (${i.itemName})` : i.itemName}
                </td>
                <td className="py-1.5 px-2 text-[var(--color-on-surface-variant)] font-medium">
                  {i.location || <span className="italic text-[10px]">Default Yard</span>}
                </td>
                <td className="py-1.5 px-2 text-right font-bold text-[var(--color-on-surface)]">
                  <div>{i.quantity.toLocaleString('en-IN')} {i.unit}</div>
                  {isGrnCard && i.receivedQuantity !== undefined && (
                    <div className="text-[9px] font-semibold mt-0.5">
                      <span className="text-[var(--color-primary)]">Recv: {i.receivedQuantity} {i.unit}</span>
                      {i.shortageQuantity ? (
                        <span className="ml-1 text-[var(--color-error)]">(Short: -{i.shortageQuantity})</span>
                      ) : i.overageQuantity ? (
                        <span className="ml-1 text-[var(--color-success)]">(Over: +{i.overageQuantity})</span>
                      ) : null}
                    </div>
                  )}
                </td>
                {!isRfqCard && (
                  <td className="py-1.5 px-2 text-right text-[var(--color-on-surface-variant)]">{formatCurrency2(i.rate)}</td>
                )}
                {!isRfqCard && (
                  <td className="py-1.5 px-2 text-right text-[var(--color-on-surface-variant)]">{i.gstRate ?? 0}%</td>
                )}
                {!isRfqCard && (
                  <td className="py-1.5 px-2 text-right font-bold text-[var(--color-on-surface)]">
                    {formatCurrency2(
                      /* The goods receipt bills received qty × PO rate (user rule) */
                      isGrnCard && i.receivedQuantity !== undefined && i.receivedQuantity !== null
                        ? Number(i.receivedQuantity) * i.rate
                        : i.amount ?? i.quantity * i.rate
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Doc totals — the RFQ carries no vendor rates, so no totals row */}
      {doc.stageType !== 'rfq' && (
        <div className="px-4 py-2.5 border-t border-[var(--color-outline-variant)]/60 flex items-center justify-end gap-4 text-[11px]">
          <span className="text-[var(--color-on-surface-variant)]">Subtotal: <strong className="text-[var(--color-on-surface)]">{formatCurrency2(doc.subtotal)}</strong></span>
          <span className="text-[var(--color-on-surface-variant)]">GST: <strong className="text-[var(--color-on-surface)]">{formatCurrency2(doc.taxAmount)}</strong></span>
          <span className="text-[var(--color-on-surface-variant)]">Total: <strong className="text-[var(--color-primary)]">{formatCurrency2(doc.totalAmount)}</strong></span>
        </div>
      )}

      {/* Settlement info — mirrored onto the goods-receipt card */}
      {isGrnCard && order && (
        <div className="px-4 py-2.5 border-t border-[var(--color-outline-variant)]/60 flex flex-wrap items-center justify-between gap-2 text-[10px] bg-[var(--color-surface-container-lowest)]">
          <span className="text-[var(--color-on-surface-variant)]">
            Bill voucher: <strong className="text-[var(--color-on-surface)] font-mono">{order.invoiceVoucherNumber || '—'}</strong>
          </span>
          {order.settlementVoucherNumber ? (
            <span className="text-[var(--color-on-surface-variant)]">
              Settled {(order.settledAmount !== undefined ? formatCurrency2(order.settledAmount) : '')}
              {(order.paymentMode ? ` · ${(order.paymentMode === 'upi' ? 'UPI' : order.paymentMode === 'bank_transfer' ? 'Bank Transfer / IMPS' : order.paymentMode === 'neft_rtgs' ? 'NEFT / RTGS' : order.paymentMode === 'cheque' ? 'Cheque / DD' : 'Cash')}` : '')}
              {' — '}<strong className="text-[var(--color-on-surface)]">{order.settlementAccountName || 'Cash/Bank'}</strong>
              {' · Payout '}{<strong className="text-[var(--color-on-surface)] font-mono">{order.settlementVoucherNumber}</strong>}
            </span>
          ) : order.settlementType === 'credit' ? (
            <span className="text-[var(--color-on-surface-variant)] italic">Booked on credit — payable on the Party ledger (payout —)</span>
          ) : (
            <span className="text-[var(--color-on-surface-variant)] italic">Payment flow not applied — nothing posted yet</span>
          )}
        </div>
      )}
    </div>
  );
}