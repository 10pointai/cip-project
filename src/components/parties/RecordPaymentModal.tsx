import React, { useState } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Check, AlertCircle, Landmark, Wallet } from 'lucide-react';
import { Party, VoucherType, CashBankAccount } from '../../types';
import { cloudStore as localDb } from '../../services/cloudStore';
import { formatCurrency } from '../../utils/formatters';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  defaultPartyId?: string;
  defaultType?: 'payment_in' | 'payment_out';
  accounts?: CashBankAccount[];
  onSave: (paymentData: {
    partyId: string;
    type: 'payment_in' | 'payment_out';
    amount: number;
    date: string;
    accountId?: string;
    accountName?: string;
    paymentMode: 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'neft_rtgs';
    referenceNumber: string;
    description: string;
  }) => void;
  currencySymbol?: string;
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  parties,
  defaultPartyId,
  defaultType = 'payment_in',
  accounts: propAccounts,
  onSave,
  currencySymbol = '₹',
}: RecordPaymentModalProps) {
  const availableAccounts = propAccounts || localDb.getAccounts();
  const [selectedPartyId, setSelectedPartyId] = useState(defaultPartyId || (parties[0]?.id ?? ''));
  const [type, setType] = useState<'payment_in' | 'payment_out'>(defaultType);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    const defaultAcc = availableAccounts.find((a) => a.isDefault && (defaultType === 'payment_in' ? a.type === 'bank' : true));
    return defaultAcc?.id || availableAccounts[0]?.id || '';
  });
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'neft_rtgs'>('neft_rtgs');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const selectedParty = parties.find((p) => p.id === selectedPartyId);
  const selectedAccount = availableAccounts.find((a) => a.id === selectedAccountId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (!selectedPartyId) {
      setError('Please select a party.');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }

    onSave({
      partyId: selectedPartyId,
      type,
      amount: numAmount,
      date,
      accountId: selectedAccountId || undefined,
      accountName: selectedAccount?.name,
      paymentMode,
      referenceNumber: referenceNumber.trim(),
      description: description.trim() || `${type === 'payment_in' ? 'Payment received' : 'Payment made'} via ${paymentMode.toUpperCase()}`,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-lg rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">Record Payment Voucher</h2>
            <p className="text-xs text-[var(--color-on-surface-variant)]">Update party ledger and outstanding balances immediately</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--color-error-container)] border border-[var(--color-error)]/30 text-[var(--color-on-error-container)] text-xs rounded-2xl font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Payment Direction Switcher */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface)] uppercase tracking-wider mb-2">
              Payment Flow
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('payment_in')}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border text-xs font-bold transition-all ${
                  type === 'payment_in'
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)] shadow-xs'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4" />
                Payment Received (In)
              </button>
              <button
                type="button"
                onClick={() => setType('payment_out')}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border text-xs font-bold transition-all ${
                  type === 'payment_out'
                    ? 'bg-[var(--color-error)] text-[var(--color-on-error)] border-[var(--color-error)] shadow-xs'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)]'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                Payment Made (Out)
              </button>
            </div>
            <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-1.5">
              {type === 'payment_in'
                ? 'Money coming into your company bank account from a Customer/Client.'
                : 'Money paid from your company to a Supplier, Transporter, or Vendor.'}
            </p>
          </div>

          {/* Select Party */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
              Select Party / Business Entity *
            </label>
            <select
              value={selectedPartyId}
              onChange={(e) => {
                setSelectedPartyId(e.target.value);
                setError('');
              }}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              required
            >
              <option value="">-- Choose Party --</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name} ({party.type.toUpperCase()}) - Current:{' '}
                  {party.currentBalance >= 0 ? `Receivable ₹${party.currentBalance}` : `Payable ₹${Math.abs(party.currentBalance)}`}
                </option>
              ))}
            </select>

            {selectedParty && (
              <div className="mt-2 p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] flex items-center justify-between text-xs">
                <div>
                  <span className="text-[var(--color-on-surface-variant)]">Current Balance: </span>
                  <span
                    className={`font-bold ${
                      selectedParty.currentBalance > 0
                        ? 'text-[var(--color-success)]'
                        : selectedParty.currentBalance < 0
                        ? 'text-[var(--color-error)]'
                        : 'text-[var(--color-on-surface)]'
                    }`}
                  >
                    {selectedParty.currentBalance > 0
                      ? `Receivable ${formatCurrency(selectedParty.currentBalance, currencySymbol)}`
                      : selectedParty.currentBalance < 0
                      ? `Payable ${formatCurrency(Math.abs(selectedParty.currentBalance), currencySymbol)}`
                      : 'Settled (₹ 0)'}
                  </span>
                </div>
                <span className="text-[var(--color-on-surface-variant)] bg-[var(--color-surface-container-lowest)] px-2.5 py-0.5 rounded-full border border-[var(--color-outline-variant)] text-[11px] font-medium">
                  {selectedParty.category}
                </span>
              </div>
            )}
          </div>

          {/* Bank / Cash Account Selection */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
              Deposit To / Paid From Account (Cash / Bank) *
            </label>
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">-- Direct Party Entry (No Account Ledger) --</option>
                <optgroup label="Bank Accounts">
                  {availableAccounts
                    .filter((a) => a.type === 'bank')
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        🏦 {acc.name} - Bal: {formatCurrency(acc.currentBalance, currencySymbol)}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Cash Drawers / Vaults">
                  {availableAccounts
                    .filter((a) => a.type === 'cash')
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        💵 {acc.name} - Bal: {formatCurrency(acc.currentBalance, currencySymbol)}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
            {selectedAccount && (
              <div className="mt-1.5 px-3 py-1.5 bg-[var(--color-surface-container)] rounded-xl flex items-center justify-between text-[11px] text-[var(--color-on-surface-variant)]">
                <span className="flex items-center gap-1.5">
                  {selectedAccount.type === 'bank' ? <Landmark className="w-3.5 h-3.5 text-[var(--color-primary)]" /> : <Wallet className="w-3.5 h-3.5 text-[var(--color-tertiary)]" />}
                  <span>{selectedAccount.type === 'bank' ? (selectedAccount.bankName || 'Bank Account') : 'Cash Account'}</span>
                </span>
                <span>Available Balance: <strong className="text-[var(--color-on-surface)]">{formatCurrency(selectedAccount.currentBalance, currencySymbol)}</strong></span>
              </div>
            )}
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                Amount ({currencySymbol}) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-outline)] font-bold text-sm">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError('');
                  }}
                  className="w-full pl-9 pr-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-sm font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                Payment Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
            </div>
          </div>

          {/* Payment Mode & Reference Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e: any) => setPaymentMode(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="neft_rtgs">NEFT / RTGS / IMPS</option>
                <option value="upi">UPI (GPay / PhonePe / QR)</option>
                <option value="cheque">Bank Cheque</option>
                <option value="bank_transfer">Direct Bank Transfer</option>
                <option value="cash">Cash Voucher</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                UTR / Cheque / Ref No.
              </label>
              <input
                type="text"
                placeholder="e.g. UTR-984128941 or Chq #40921"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          {/* Remarks / Description */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
              Remarks / Transaction Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Part payment against Bitumen batch #12 or Site Advance"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-medium text-xs rounded-full shadow-xs transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <Check className="w-4 h-4" />
              Save Payment Voucher
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
