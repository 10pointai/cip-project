import React, { useState } from 'react';
import {
  X,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Building2,
  Calendar,
  CreditCard,
  Printer,
  PlusCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Edit2,
  Trash2,
  FileText,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Party, Transaction, CompanySettings, Order } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PrintStatementModal } from '../common/PrintStatementModal';
import { useAuth } from '../../context/AuthContext';
import { cloudStore as localDb } from '../../services/cloudStore';

interface PartyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party | null;
  transactions: Transaction[];
  orders?: Order[];
  settings: CompanySettings;
  onEdit: (party: Party) => void;
  onDelete: (partyId: string) => void;
  onRecordPayment: (partyId: string, type: 'payment_in' | 'payment_out') => void;
  onAddTransaction: (partyId: string) => void;
}

export function PartyDetailModal({
  isOpen,
  onClose,
  party,
  transactions,
  orders,
  settings,
  onEdit,
  onDelete,
  onRecordPayment,
  onAddTransaction,
}: PartyDetailModalProps) {
  const { hasPermission } = useAuth();
  const canManageParties = hasPermission('manage_parties');
  const canRecordPayments = hasPermission('record_payments');

  const [filterType, setFilterType] = useState<string>('all');
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  if (!isOpen || !party) return null;

  const rawTxList = transactions.filter((t) => t.partyId === party.id);
  const ordersList = (orders || localDb.getOrders()).filter(
    (o) => o.partyId === party.id && o.status !== 'cancelled'
  );

  const orderTxItems: Transaction[] = ordersList.map((o) => {
    const isSales = o.type === 'sales';
    const itemsSummary = o.items && o.items.length > 0
      ? o.items.map((i) => `${i.itemName} (${i.quantity} ${i.unit})`).join(', ')
      : 'Materials / Goods';

    return {
      id: o.id,
      voucherNumber: o.orderNumber,
      partyId: o.partyId,
      partyName: o.partyName,
      partyType: party.type,
      type: isSales ? 'sale_invoice' : 'purchase_bill',
      amount: Number(o.totalAmount) || 0,
      date: o.date,
      accountId: o.accountId,
      accountName: o.accountName,
      paymentMode: o.paymentMode,
      referenceNumber: o.vehicleNo ? `Veh: ${o.vehicleNo}` : (o.accountName ? `A/c: ${o.accountName}` : o.orderNumber),
      materialOrService: itemsSummary,
      description: `${isSales ? (o.stage ? `Sales Order [${o.stage.replace('_', ' ').toUpperCase()}]` : 'Sales Order') : 'Purchase Order'} • Payment: ${(o.paymentMode || 'bank_transfer').replace('_', ' ').toUpperCase()}${o.accountName ? ` (${o.accountName})` : ''}${o.notes ? ` • ${o.notes}` : ''}`,
      status: o.paymentStatus || 'paid',
      createdAt: o.createdAt,
    };
  });

  const allPartyEntries = [...rawTxList, ...orderTxItems];

  const partyTxs = allPartyEntries
    .filter((t) => (filterType === 'all' ? true : t.type === filterType))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Clean WhatsApp phone number
  const cleanPhone = party.phone.replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(
    party.contactPerson || party.name
  )},%20regarding%20our%20account%20statement%20with%20${encodeURIComponent(settings.companyName)}:`;

  const isReceivable = party.currentBalance > 0;
  const isPayable = party.currentBalance < 0;
  const isSettled = party.currentBalance === 0;

  const creditUsedPct = party.creditLimit > 0 ? Math.min(100, Math.round((Math.abs(party.currentBalance) / party.creditLimit) * 100)) : 0;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-4xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold text-xl shrink-0 mt-0.5">
                {party.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-[var(--color-on-surface)]">{party.name}</h1>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      party.type === 'customer'
                        ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                        : party.type === 'vendor'
                        ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                        : party.type === 'transporter'
                        ? 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]'
                        : 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                    }`}
                  >
                    {party.type}
                  </span>
                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]">
                    {party.category}
                  </span>
                </div>
                {party.tradeName && <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5 font-medium">{party.tradeName}</p>}
                <p className="text-xs text-[var(--color-on-surface-variant)] mt-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[var(--color-outline)] shrink-0" />
                  {party.address.street ? `${party.address.street}, ` : ''}
                  {party.address.city}, {party.address.state} - {party.address.pincode}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canManageParties && (
                <>
                  <button
                    onClick={() => onEdit(party)}
                    className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] rounded-xl hover:bg-[var(--color-surface-container-high)] transition-colors"
                    title="Edit Party Details"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete ${party.name}?`)) {
                        onDelete(party.id);
                        onClose();
                      }
                    }}
                    className="p-2 text-[var(--color-outline)] hover:text-[var(--color-error)] rounded-xl hover:bg-[var(--color-error-container)] transition-colors"
                    title="Delete Party"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-xl hover:bg-[var(--color-surface-container-high)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Communication & Action Ribbon */}
          <div className="px-6 py-2.5 bg-[var(--color-surface-container)]/60 border-b border-[var(--color-outline-variant)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <a
                href={`tel:${party.phone}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-container-lowest)] rounded-full border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] font-semibold hover:bg-[var(--color-surface-container)] transition-colors shadow-2xs"
              >
                <Phone className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Call: {party.phone}
              </a>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-success-container)] text-[var(--color-on-success-container)] rounded-full font-semibold hover:opacity-90 transition-colors shadow-2xs border border-[var(--color-success)]/30"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp Statement
              </a>
              {party.email && (
                <a
                  href={`mailto:${party.email}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-container-lowest)] rounded-full border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] font-medium hover:bg-[var(--color-surface-container)] transition-colors shadow-2xs"
                >
                  <Mail className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
                  {party.email}
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPrintOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-[var(--color-on-surface)] font-semibold hover:bg-[var(--color-surface-container)] transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Print Statement / PDF
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Financial Balance & Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Outstanding Balance */}
              <div
                className={`p-4 rounded-2xl border ${
                  isReceivable
                    ? 'bg-[var(--color-primary-container)] border-[var(--color-primary)]/20'
                    : isPayable
                    ? 'bg-[var(--color-error-container)] border-[var(--color-error)]/20'
                    : 'bg-[var(--color-surface-container)] border-[var(--color-outline-variant)]'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${
                      isReceivable ? 'text-[var(--color-on-primary-container)]/80' : isPayable ? 'text-[var(--color-on-error-container)]/80' : 'text-[var(--color-on-surface-variant)]'
                    }`}>
                      Current Outstanding Balance
                    </p>
                    <p
                      className={`text-2xl font-extrabold mt-1 ${
                        isReceivable ? 'text-[var(--color-on-primary-container)]' : isPayable ? 'text-[var(--color-on-error-container)]' : 'text-[var(--color-on-surface)]'
                      }`}
                    >
                      {formatCurrency(Math.abs(party.currentBalance), settings.currency.symbol)}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${
                      isReceivable
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                        : isPayable
                        ? 'bg-[var(--color-error)] text-[var(--color-on-error)]'
                        : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                    }`}
                  >
                    {isReceivable ? 'Receivable (Dr)' : isPayable ? 'Payable (Cr)' : 'Settled'}
                  </span>
                </div>
                <p className={`text-xs mt-2 font-medium ${
                  isReceivable ? 'text-[var(--color-on-primary-container)]/80' : isPayable ? 'text-[var(--color-on-error-container)]/80' : 'text-[var(--color-on-surface-variant)]'
                }`}>
                  {isReceivable
                    ? `They owe ${formatCurrency(party.currentBalance, settings.currency.symbol)} to your company.`
                    : isPayable
                    ? `You owe ${formatCurrency(Math.abs(party.currentBalance), settings.currency.symbol)} to them.`
                    : 'All dues and payments are fully balanced.'}
                </p>
              </div>

              {/* Card 2: Credit Terms & Limit */}
              <div className="p-4 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                    <span>Credit Terms & Limit</span>
                    <Clock className="w-3.5 h-3.5 text-[var(--color-outline)]" />
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="text-lg font-bold text-[var(--color-on-surface)]">{party.paymentTermsDays} Days</p>
                    <span className="text-xs text-[var(--color-on-surface-variant)] font-medium">
                      Limit: {formatCurrency(party.creditLimit, settings.currency.symbol)}
                    </span>
                  </div>
                </div>

                {party.creditLimit > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] font-semibold text-[var(--color-on-surface-variant)] mb-1">
                      <span>Limit Usage</span>
                      <span>{creditUsedPct}%</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--color-surface-container-highest)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          creditUsedPct > 90 ? 'bg-[var(--color-error)]' : creditUsedPct > 70 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-primary)]'
                        }`}
                        style={{ width: `${creditUsedPct}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: Tax & Registration */}
              <div className="p-4 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] space-y-2 text-xs">
                <p className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  Registration & Tax Info
                </p>
                <div className="space-y-1 text-[var(--color-on-surface)]">
                  <p>
                    <strong className="text-[var(--color-on-surface-variant)]">GSTIN:</strong>{' '}
                    <span className="font-mono font-bold text-[var(--color-on-surface)]">{party.gstin || 'Unregistered'}</span>
                  </p>
                  <p>
                    <strong className="text-[var(--color-on-surface-variant)]">PAN:</strong> <span className="font-mono font-bold text-[var(--color-on-surface)]">{party.pan || '-'}</span>
                  </p>
                  <p>
                    <strong className="text-[var(--color-on-surface-variant)]">Contact Person:</strong> {party.contactPerson}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Bar for Recording Voucher / Payment */}
            {(canRecordPayments || canManageParties) && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-2xl">
                <div>
                  <p className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">Quick Actions for this Party</p>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">Record payments received/made or dispatch/procurement vouchers</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {canRecordPayments && (
                    <>
                      <button
                        onClick={() => onRecordPayment(party.id, 'payment_in')}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full shadow-xs transition-colors"
                      >
                        <ArrowDownLeft className="w-4 h-4" />
                        Record Payment Received
                      </button>
                      <button
                        onClick={() => onRecordPayment(party.id, 'payment_out')}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-secondary)] hover:opacity-90 text-[var(--color-on-secondary)] font-semibold text-xs rounded-full shadow-xs transition-colors"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                        Record Payment Made
                      </button>
                    </>
                  )}
                  {canManageParties && (
                    <button
                      onClick={() => onAddTransaction(party.id)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container-highest)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] font-semibold text-xs rounded-full shadow-xs transition-colors"
                    >
                      <PlusCircle className="w-4 h-4" />
                      New Voucher / Bill
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Statement of Account / Ledger Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                    Statement of Account / Transaction Ledger
                  </h3>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">History of all bills, dispatches, receipts, and payments</p>
                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-1 bg-[var(--color-surface-container)] p-1 rounded-full border border-[var(--color-outline-variant)] text-xs">
                  {[
                    { id: 'all', label: 'All Vouchers' },
                    { id: 'sale_invoice', label: 'Sale Invoices' },
                    { id: 'purchase_bill', label: 'Purchase Bills' },
                    { id: 'payment_in', label: 'Receipts In' },
                    { id: 'payment_out', label: 'Payments Out' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setFilterType(tab.id)}
                      className={`px-3 py-1 rounded-full font-medium transition-colors ${
                        filterType === tab.id
                          ? 'bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] shadow-2xs font-bold'
                          : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transactions Table */}
              <div className="border border-[var(--color-outline-variant)] rounded-2xl overflow-hidden bg-[var(--color-surface-container-lowest)] shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Voucher #</th>
                      <th className="py-3 px-3">Voucher Type</th>
                      <th className="py-3 px-3">Material / Description</th>
                      <th className="py-3 px-3 text-right">Amount</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-outline-variant)]">
                    {/* Opening balance indicator row */}
                    <tr className="bg-[var(--color-surface-container)]/30">
                      <td className="py-2.5 px-3 text-[var(--color-on-surface-variant)]">{formatDate(party.createdAt, 'short')}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-[var(--color-on-surface-variant)]">OPENING</td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-[var(--color-on-surface)]">Opening Balance</span>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--color-on-surface-variant)]">
                        Initial balance entered upon party creation ({party.openingBalanceType === 'to_receive' ? 'Receivable' : 'Payable'})
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--color-on-surface)]">
                        {formatCurrency(party.openingBalance, settings.currency.symbol)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]">
                          Initial
                        </span>
                      </td>
                    </tr>

                    {partyTxs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[var(--color-outline)] italic">
                          No transactions found matching the filter.
                        </td>
                      </tr>
                    ) : (
                      partyTxs.map((tx) => (
                        <tr key={tx.id} className="hover:bg-[var(--color-surface-container)]/50 transition-colors">
                          <td className="py-3 px-3 whitespace-nowrap text-[var(--color-on-surface)] font-medium">
                            {formatDate(tx.date, 'short')}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[var(--color-on-surface)]">{tx.voucherNumber}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 font-bold text-[11px] uppercase ${
                                tx.type === 'sale_invoice'
                                  ? 'text-[var(--color-primary)]'
                                  : tx.type === 'purchase_bill'
                                  ? 'text-[var(--color-secondary)]'
                                  : tx.type === 'payment_in'
                                  ? 'text-[var(--color-success)]'
                                  : 'text-[var(--color-error)]'
                              }`}
                            >
                              {tx.type === 'sale_invoice' && <FileText className="w-3.5 h-3.5" />}
                              {tx.type === 'purchase_bill' && <FileText className="w-3.5 h-3.5" />}
                              {tx.type === 'payment_in' && <ArrowDownLeft className="w-3.5 h-3.5" />}
                              {tx.type === 'payment_out' && <ArrowUpRight className="w-3.5 h-3.5" />}
                              {tx.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-[var(--color-on-surface)] max-w-xs">
                            <p className="font-medium truncate">{tx.materialOrService || tx.description}</p>
                            {tx.referenceNumber && (
                              <p className="text-[10px] text-[var(--color-outline)] font-mono">Ref: {tx.referenceNumber}</p>
                            )}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-bold text-sm ${
                              tx.type === 'sale_invoice' || tx.type === 'payment_out'
                                ? 'text-[var(--color-primary)]'
                                : 'text-[var(--color-error)]'
                            }`}
                          >
                            {formatCurrency(tx.amount, settings.currency.symbol)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                tx.status === 'paid'
                                  ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                                  : tx.status === 'pending'
                                  ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                                  : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {party.notes && (
              <div className="p-3 bg-[var(--color-surface-container)] rounded-xl border border-[var(--color-outline-variant)] text-xs text-[var(--color-on-surface-variant)]">
                <span className="font-bold text-[var(--color-on-surface)]">Site / Batching Notes: </span>
                {party.notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Printable Statement Modal */}
      <PrintStatementModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        party={party}
        transactions={transactions.filter((t) => t.partyId === party.id)}
        settings={settings}
      />
    </>
  );
}
