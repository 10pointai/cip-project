import React, { useEffect } from 'react';
import { X, Receipt, Landmark, ArrowDownLeft, ArrowUpRight, Wallet, FileCheck, FileWarning } from 'lucide-react';
import { Transaction, VoucherType } from '../../types';

/**
 * Payment / standalone-voucher detail modal — the click-through for the
 * party statement's payment + other-voucher rows. Read-only presentation of
 * what the voucher recorded (party, amount + direction, mode, reference,
 * cash/bank account, description, status).
 */
interface PaymentVoucherDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  /** Display name of the linked cash/bank account (resolved by the caller) */
  accountName?: string;
  currencySymbol?: string;
}

const TYPE_META: Record<VoucherType, { label: string; tone: string }> = {
  sale_invoice: { label: 'Sale Invoice', tone: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]' },
  purchase_bill: { label: 'Purchase Bill', tone: 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]' },
  payment_in: { label: 'Payment Received', tone: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]' },
  payment_out: { label: 'Payment Made', tone: 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]' },
  debit_note: { label: 'Debit Note', tone: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]' },
  credit_note: { label: 'Credit Note', tone: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]' },
};

const MODE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer / IMPS',
  cheque: 'Cheque / DD',
  cash: 'Cash',
  upi: 'UPI',
  neft_rtgs: 'NEFT / RTGS',
};

const STATUS_META: Record<string, string> = {
  paid: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]',
  settled: 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]',
  pending: 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]',
  partially_paid: 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]',
  cancelled: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]',
};

export function PaymentVoucherDetailModal({
  isOpen, onClose, transaction, accountName, currencySymbol,
}: PaymentVoucherDetailModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !transaction) return null;

  const symbol = currencySymbol || '₹';
  const fmt = (amount: number) =>
    `${symbol}${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const meta = TYPE_META[transaction.type] || TYPE_META.debit_note;
  // Statement directions (mirror the ledger's debit/credit columns):
  // debit = sale_invoice | debit_note | payment_out, credit = purchase_bill |
  // credit_note | payment_in.
  const isDebitLike = transaction.type === 'payment_in'
    ? false
    : transaction.type === 'purchase_bill' || transaction.type === 'credit_note'
      ? false
      : true;
  const amountTone = isDebitLike ? 'text-[var(--color-primary)]' : 'text-[var(--color-success)]';
  const AmountIcon = transaction.type === 'payment_in' ? ArrowDownLeft
    : transaction.type === 'payment_out' ? ArrowUpRight
    : transaction.type === 'sale_invoice' || transaction.type === 'purchase_bill' ? Receipt
    : transaction.type === 'debit_note' ? FileWarning : FileCheck;
  const cancelled = transaction.status === 'cancelled';

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: 'Voucher No',
      value: <span className="font-mono font-bold">{transaction.voucherNumber}</span>,
    },
    { label: 'Date', value: transaction.date },
    { label: 'Amount', value: <span className={`font-mono font-bold ${amountTone}`}>{fmt(transaction.amount)}</span> },
    ...(transaction.type === 'payment_in' || transaction.type === 'payment_out'
      ? [{ label: 'Payment Mode', value: transaction.paymentMode ? (MODE_LABELS[transaction.paymentMode] || transaction.paymentMode) : '—' }]
      : []),
    { label: 'Reference', value: transaction.referenceNumber || '—' },
    { label: 'Account', value: accountName || '—' },
    { label: 'Description', value: transaction.description || '—' },
    ...(transaction.dueDate ? [{ label: 'Due Date', value: transaction.dueDate }] : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] rounded-3xl w-full max-w-lg shadow-2xl border border-[var(--color-outline-variant)] flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-[var(--color-outline-variant)]/60">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${meta.tone}`}>
              <AmountIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black text-[var(--color-on-surface)]">{meta.label}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_META[transaction.status] || STATUS_META.pending}`}>
                  {transaction.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] font-medium mt-0.5">
                {isDebitLike
                  ? 'Debits the party ledger — balance up (receivable / payout)'
                  : 'Credits the party ledger — balance down (payable / receipt)'}
              </p>
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

        {/* Detail rows */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="divide-y divide-[var(--color-outline-variant)]/50">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-on-surface-variant)] shrink-0">
                  {row.label}
                </span>
                <span className="text-xs text-[var(--color-on-surface)] text-right break-words">
                  {cancelled && row.label !== 'Voucher No' && row.label !== 'Date'
                    ? <span className="italic text-[var(--color-on-surface-variant)]">{row.value}</span>
                    : row.value}
                </span>
              </div>
            ))}
          </div>
          {cancelled && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-error-container)] text-[var(--color-on-error-container)] text-[11px] font-semibold">
              <FileWarning className="w-3.5 h-3.5 shrink-0" />
              Cancelled voucher — ignored by ledger balance calculations.
            </div>
          )}
          {(transaction.type === 'payment_in') && accountName && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] text-[11px]">
              <Landmark className="w-3.5 h-3.5 shrink-0 text-[var(--color-success)]" />
              Credited to <strong className="text-[var(--color-on-surface)]">{accountName}</strong>
            </div>
          )}
          {(transaction.type === 'payment_out') && accountName && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] text-[11px]">
              <Wallet className="w-3.5 h-3.5 shrink-0 text-[var(--color-error)]" />
              Debited from <strong className="text-[var(--color-on-surface)]">{accountName}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}