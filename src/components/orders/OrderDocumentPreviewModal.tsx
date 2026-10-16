import React, { useMemo } from 'react';
import { Printer, X } from 'lucide-react';
import { Item, Party, CompanySettings } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { OrderDisplay } from './orderDisplay';

/** Verbatim move from OrdersView — number-to-words for the amount in words. */
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
 * COMMERCIAL DOCUMENT PREVIEW MODAL — the printable document viewer
 * (extraction of OrdersView's preview modal so the order details modal AND
 * other callers replay it). Entirely self-contained: computes its own
 * totals, amount-in-words, linked trip slip and print handling.
 */
interface OrderDocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The order as transformed for preview (stage-override + stage items). */
  order: OrderDisplay | null;
  /** Sales document stage override (purchases read purchaseStage off order) */
  stage?: string;
  parties: Party[];
  items: Item[];
  settings: CompanySettings;
}

export function OrderDocumentPreviewModal({
  isOpen, onClose, order: previewOrder, stage: previewStage, parties, items, settings,
}: OrderDocumentPreviewModalProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: settings.currency?.code || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  const linkedTripSlip = useMemo(() => {
    if (!previewOrder) return null;
    return localDb.getTripSlips().find(s => s.orderId === previewOrder.id || s.orderNumber === previewOrder.orderNumber);
  }, [previewOrder, isOpen]);

  const previewCalculations = useMemo(() => {
    if (!previewOrder) return { subtotal: 0, taxAmount: 0, transportCharges: 0, grandTotal: 0 };
    const grnPreview = previewOrder.type === 'purchase' && previewOrder.purchaseStage === 'goods_receipt';
    const subtotal = previewOrder.items.reduce((sum, item) => {
      return sum + (grnPreview && item.receivedQuantity !== undefined && item.receivedQuantity !== null
        ? Number(item.receivedQuantity) * item.rate
        : item.quantity * item.rate);
    }, 0);
    const transportCharges = previewOrder.transportCharges || 0;
    const taxAmount = (subtotal * (previewOrder.taxRateGst || 0)) / 100;
    return { subtotal, taxAmount, transportCharges, grandTotal: subtotal + taxAmount + transportCharges };
  }, [previewOrder]);

  if (!isOpen || !previewOrder) return null;

  return (
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
              onClick={onClose}
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
                  : (docTitles[previewStage || 'sales_order'] || 'SALES ORDER');
                const colorClass = isPurchase
                  ? previewOrder.purchaseStage === 'rfq'
                    ? 'bg-[#5c5b62] text-white'
                    : previewOrder.purchaseStage === 'goods_receipt'
                    ? 'bg-[#2e7d32] text-white'
                    : 'bg-[#005ac1] text-white'
                  : (docColors[previewStage || 'sales_order'] || 'bg-[#386a20] text-white');

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
                    const pre = prefixes[previewStage || 'sales_order'] || 'SO';
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
                {previewOrder.items.map((item, idx) => {
                  const grnPreview =
                    previewOrder.type === 'purchase' && previewOrder.purchaseStage === 'goods_receipt';
                  const billQty =
                    grnPreview && item.receivedQuantity !== undefined && item.receivedQuantity !== null
                      ? Number(item.receivedQuantity)
                      : item.quantity;
                  const lineAmount =
                    grnPreview && item.receivedQuantity !== undefined && item.receivedQuantity !== null
                      ? Number(item.receivedQuantity) * item.rate
                      : item.amount;
                  return (
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
                      {billQty.toLocaleString('en-IN')} {item.unit}
                      {grnPreview && item.receivedQuantity !== undefined && Number(item.receivedQuantity) !== item.quantity && (
                        <p className="text-[9px] font-semibold text-[#44474e] mt-0.5">
                          Ordered: {item.quantity.toLocaleString('en-IN')} {item.unit}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 border-r border-[#e1e2ec] text-right font-bold text-[#44474e]">
                      {formatCurrency(item.rate)}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-[#1c1b1f]">
                      {formatCurrency(lineAmount)}
                    </td>
                  </tr>
                  );
                })}
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
            onClick={onClose}
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
  );
}