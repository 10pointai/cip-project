import React from 'react';
import { X, Printer, Download, Building2, Phone, Mail, MapPin } from 'lucide-react';
import { Party, Transaction, CompanySettings } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PrintStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party;
  transactions: Transaction[];
  settings: CompanySettings;
}

export function PrintStatementModal({
  isOpen,
  onClose,
  party,
  transactions,
  settings,
}: PrintStatementModalProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  // Calculate sorted ledger entries with running balance
  const sortedTxs = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let runningBalance = party.openingBalanceType === 'to_receive' ? party.openingBalance : -party.openingBalance;

  const ledgerRows = sortedTxs.map((tx) => {
    let debit = 0;
    let credit = 0;
    const amt = Number(tx.amount) || 0;

    if (tx.type === 'sale_invoice' || tx.type === 'payment_out' || tx.type === 'debit_note') {
      debit = amt;
      runningBalance += amt;
    } else {
      credit = amt;
      runningBalance -= amt;
    }

    return {
      ...tx,
      debit,
      credit,
      balanceAfter: runningBalance,
    };
  });

  const totalDebit = ledgerRows.reduce((acc, r) => acc + r.debit, 0) + (party.openingBalanceType === 'to_receive' ? party.openingBalance : 0);
  const totalCredit = ledgerRows.reduce((acc, r) => acc + r.credit, 0) + (party.openingBalanceType === 'to_pay' ? party.openingBalance : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-4xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[95vh]">
        {/* Action Header (Hidden during print) */}
        <div className="print:hidden flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-bold text-[var(--color-on-surface)]">Statement of Account / Party Ledger</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Container */}
        <div id="printable-statement" className="p-8 overflow-y-auto bg-white text-slate-900 space-y-6">
          {/* Company Header */}
          <div className="border-b-2 border-slate-800 pb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  {settings.companyName}
                </h1>
                <p className="text-xs font-semibold text-amber-700 mt-0.5">{settings.tradeName}</p>
                <p className="text-xs text-slate-600 max-w-md mt-1">{settings.tagline}</p>
                <p className="text-xs text-slate-600 mt-1">
                  <strong>Regd. Office:</strong> {settings.registeredAddress.street}, {settings.registeredAddress.city}, {settings.registeredAddress.state} - {settings.registeredAddress.pincode}
                </p>
              </div>
              <div className="text-right text-xs text-slate-700 space-y-1">
                <p>
                  <strong>GSTIN:</strong> <span className="font-mono font-bold">{settings.gstin}</span>
                </p>
                <p>
                  <strong>PAN:</strong> <span className="font-mono">{settings.pan}</span>
                </p>
                <p>
                  <strong>Phone:</strong> {settings.phone}
                </p>
                <p>
                  <strong>Email:</strong> {settings.email}
                </p>
              </div>
            </div>
          </div>

          {/* Statement Meta & Party Details */}
          <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">STATEMENT FOR:</p>
              <h2 className="text-sm font-bold text-slate-900">{party.name}</h2>
              {party.tradeName && <p className="text-xs text-slate-600 font-medium">{party.tradeName}</p>}
              <p className="text-slate-600 mt-1">{party.address.street}, {party.address.city}, {party.address.state} - {party.address.pincode}</p>
              <p className="text-slate-700 mt-1">
                <strong>GSTIN:</strong> <span className="font-mono">{party.gstin || 'Unregistered'}</span> | <strong>PAN:</strong> <span className="font-mono">{party.pan || '-'}</span>
              </p>
              <p className="text-slate-600 mt-0.5">
                <strong>Contact:</strong> {party.contactPerson} ({party.phone})
              </p>
            </div>

            <div className="text-right space-y-1">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">STATEMENT SUMMARY:</p>
              <p><strong>Statement Date:</strong> {formatDate(new Date().toISOString())}</p>
              <p><strong>Payment Terms:</strong> {party.paymentTermsDays} Days</p>
              <div className="pt-2">
                <p className="text-xs text-slate-500">Net Outstanding Balance:</p>
                <p className={`text-base font-black ${party.currentBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {party.currentBalance >= 0
                    ? `Receivable ${formatCurrency(party.currentBalance, settings.currency.symbol)} (Dr)`
                    : `Payable ${formatCurrency(Math.abs(party.currentBalance), settings.currency.symbol)} (Cr)`}
                </p>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-y-2 border-slate-800 bg-slate-100 text-slate-800 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-2">Date</th>
                  <th className="py-2.5 px-2">Voucher / Ref #</th>
                  <th className="py-2.5 px-2">Type</th>
                  <th className="py-2.5 px-2">Particulars / Material Dispatched</th>
                  <th className="py-2.5 px-2 text-right">Debit ({settings.currency.symbol})</th>
                  <th className="py-2.5 px-2 text-right">Credit ({settings.currency.symbol})</th>
                  <th className="py-2.5 px-2 text-right">Balance ({settings.currency.symbol})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* Opening Balance Row */}
                <tr className="bg-slate-50/50 font-medium">
                  <td className="py-2 px-2 text-slate-500">-</td>
                  <td className="py-2 px-2 font-mono text-slate-500">OPENING</td>
                  <td className="py-2 px-2 text-slate-600">Opening Balance</td>
                  <td className="py-2 px-2 text-slate-600">Balance brought forward</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {party.openingBalanceType === 'to_receive' ? formatCurrency(party.openingBalance, '').trim() : '-'}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {party.openingBalanceType === 'to_pay' ? formatCurrency(party.openingBalance, '').trim() : '-'}
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-bold">
                    {formatCurrency(party.openingBalanceType === 'to_receive' ? party.openingBalance : -party.openingBalance, '').trim()}
                  </td>
                </tr>

                {ledgerRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-400 italic">
                      No additional transaction vouchers recorded for this period.
                    </td>
                  </tr>
                ) : (
                  ledgerRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2 whitespace-nowrap text-slate-700">{formatDate(row.date, 'short')}</td>
                      <td className="py-2 px-2 font-mono font-semibold text-slate-900">{row.voucherNumber}</td>
                      <td className="py-2 px-2 uppercase text-[10px] font-bold text-slate-600">
                        {row.type.replace('_', ' ')}
                      </td>
                      <td className="py-2 px-2 text-slate-700">
                        <p className="font-medium">{row.materialOrService || row.description}</p>
                        {row.referenceNumber && (
                          <p className="text-[10px] text-slate-500">Ref: {row.referenceNumber}</p>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-emerald-700 font-medium">
                        {row.debit > 0 ? formatCurrency(row.debit, '').trim() : '-'}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-rose-700 font-medium">
                        {row.credit > 0 ? formatCurrency(row.credit, '').trim() : '-'}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(row.balanceAfter, '').trim()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-800 bg-slate-100 font-bold">
                  <td colSpan={4} className="py-2.5 px-2 text-right uppercase">
                    Total Statement Turnover:
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-emerald-800">
                    {formatCurrency(totalDebit, settings.currency.symbol)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-rose-800">
                    {formatCurrency(totalCredit, settings.currency.symbol)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-slate-900 font-black">
                    {formatCurrency(party.currentBalance, settings.currency.symbol)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Authorized Signatory */}
          <div className="flex justify-end pt-4 border-t border-slate-200 text-xs">
            <div className="flex flex-col justify-end text-right">
              <p className="font-bold text-slate-900">For {settings.companyName}</p>
              <div className="h-12"></div>
              <p className="font-bold text-slate-800">{settings.authorizedSignatoryName}</p>
              <p className="text-[11px] text-slate-500">{settings.authorizedSignatoryDesignation}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
