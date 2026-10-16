import React, { useMemo } from 'react';
import { Clock, FileText, Receipt } from 'lucide-react';
import { Party } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { PartyStatement } from './partyStatement';

/**
 * The four financial KPI cards of the party statement screen, recomputed
 * from the document-centric statement rows (shared by PartyDetailView and
 * the dashboard's party modal).
 */
interface PartyStatementSummaryCardsProps {
  party: Party;
  statement: PartyStatement;
  currencySymbol: string;
}

export function PartyStatementSummaryCards({ party, statement, currencySymbol }: PartyStatementSummaryCardsProps) {
  const isReceivable = party.currentBalance > 0;
  const isPayable = party.currentBalance < 0;
  const isSettled = party.currentBalance === 0;

  const creditUsedPct =
    party.creditLimit > 0
      ? Math.min(100, Math.round((Math.abs(party.currentBalance) / party.creditLimit) * 100))
      : 0;

  const kpis = useMemo(() => {
    let salesBilled = 0;
    let purchasesBilled = 0;
    let paymentsIn = 0;
    let paymentsOut = 0;
    let paymentsCount = 0;
    for (const row of statement.rows) {
      if (row.status === 'cancelled') continue;
      if (row.kind === 'sale' && row.isPosted) salesBilled += row.documentAmount;
      else if (row.kind === 'purchase' && row.isPosted) purchasesBilled += row.documentAmount;
      else if (row.kind === 'voucher') {
        const type = row.transaction?.type;
        if (type === 'sale_invoice') salesBilled += row.documentAmount;
        else if (type === 'purchase_bill') purchasesBilled += row.documentAmount;
      } else if (row.kind === 'payment') {
        if (row.transaction?.type === 'payment_in') paymentsIn += row.documentAmount;
        else paymentsOut += row.documentAmount;
        paymentsCount += 1;
      }
    }
    return { salesBilled, purchasesBilled, paymentsIn, paymentsOut, paymentsCount };
  }, [statement.rows]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Card 1: Outstanding Balance */}
      <div
        className={`p-5 rounded-[24px] border shadow-xs flex flex-col justify-between ${
          isReceivable
            ? 'bg-[var(--color-primary-container)] border-[var(--color-primary)]/20 text-[var(--color-on-primary-container)]'
            : isPayable
            ? 'bg-[var(--color-error-container)] border-[var(--color-error)]/20 text-[var(--color-on-error-container)]'
            : 'bg-[var(--color-surface-container)] border-[var(--color-outline-variant)] text-[var(--color-on-surface)]'
        }`}
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
              Outstanding Balance
            </p>
            <p className="text-2xl sm:text-3xl font-black mt-1 tracking-tight">
              {formatCurrency(Math.abs(party.currentBalance), currencySymbol)}
            </p>
          </div>
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
              isReceivable
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                : isPayable
                ? 'bg-[var(--color-error)] text-[var(--color-on-error)]'
                : 'bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface-variant)]'
            }`}
          >
            {isReceivable ? 'Receivable (Dr)' : isPayable ? 'Payable (Cr)' : 'Settled'}
          </span>
        </div>
        <p className="text-xs mt-3 font-medium opacity-90">
          {isReceivable
            ? `Party owes ${formatCurrency(party.currentBalance, currencySymbol)} to plant.`
            : isPayable
            ? `Plant owes ${formatCurrency(Math.abs(party.currentBalance), currencySymbol)} to party.`
            : 'All dues and payments are fully settled.'}
        </p>
      </div>

      {/* Card 2: Credit Terms & Limit */}
      <div className="p-5 rounded-[24px] bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            <span>Credit Terms & Limit</span>
            <Clock className="w-4 h-4 text-[var(--color-outline)]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-black text-[var(--color-on-surface)]">{party.paymentTermsDays} Days</p>
            <span className="text-xs text-[var(--color-on-surface-variant)] font-medium">
              Limit: {formatCurrency(party.creditLimit, currencySymbol)}
            </span>
          </div>
        </div>

        {party.creditLimit > 0 ? (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] font-bold text-[var(--color-on-surface-variant)] mb-1">
              <span>Credit Used</span>
              <span>{creditUsedPct}%</span>
            </div>
            <div className="w-full h-2 bg-[var(--color-surface-container-highest)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  creditUsedPct > 90
                    ? 'bg-[var(--color-error)]'
                    : creditUsedPct > 70
                    ? 'bg-[var(--color-tertiary)]'
                    : 'bg-[var(--color-primary)]'
                }`}
                style={{ width: `${creditUsedPct}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-2">
            Standard net payment terms applied.
          </p>
        )}
      </div>

      {/* Card 3: Total Invoiced Turnover */}
      <div className="p-5 rounded-[24px] bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            Total Invoiced Turnover
          </span>
          <div className="w-8 h-8 rounded-full bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <p className="text-2xl font-black text-[var(--color-primary)] tracking-tight">
            {formatCurrency(kpis.salesBilled + kpis.purchasesBilled, currencySymbol)}
          </p>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
            {party.type === 'customer'
              ? `Total ${formatCurrency(kpis.salesBilled, currencySymbol)} sales dispatched`
              : party.type === 'vendor'
              ? `Total ${formatCurrency(kpis.purchasesBilled, currencySymbol)} supplies received`
              : 'Lifetime commercial transaction value'}
          </p>
        </div>
      </div>

      {/* Card 4: Total Payments Settled */}
      <div className="p-5 rounded-[24px] bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            Total Payments Cleared
          </span>
          <div className="w-8 h-8 rounded-full bg-[var(--color-success-container)] text-[var(--color-on-success-container)] flex items-center justify-center">
            <Receipt className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <p className="text-2xl font-black text-[var(--color-success)] tracking-tight">
            {formatCurrency(kpis.paymentsIn + kpis.paymentsOut, currencySymbol)}
          </p>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
            Across {kpis.paymentsCount} payment vouchers
          </p>
        </div>
      </div>
    </div>
  );
}

