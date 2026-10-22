import React, { useMemo, useState } from 'react';
import {
  Wallet,
  Plus,
  History,
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  Landmark,
  CircleDollarSign,
  Loader2,
  Filter,
  Banknote,
  IndianRupee,
  AlertTriangle,
} from 'lucide-react';
import { useDatabase } from '../../hooks/useDatabase';
import { Employee, EmployeeLedgerTransaction, EmployeePayment, CashBankAccount } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { SearchableSelect } from '../orders/SearchableSelect';

interface EmployeeLedgerViewProps {
  /** All employees — every employee owns a ledger, active or not */
  employees: Employee[];
  /** FOCUSED mode (e.g. the detail page's Ledger tab): renders ONLY the
   *  register table — balance/record action live on the page's main header */
  focusedEmpId?: string;
}

type LedgerTxnType = EmployeeLedgerTransaction['type'];

/** One rendered ledger line — real rows plus legacy payroll payouts and each
 *  employee's opening balance folded in */
interface LedgerLine {
  key: string;
  employeeId: string;
  employeeName: string;
  date: string;
  /** registration timestamp (createdAt; opening rows fall back to their date) */
  createdAt: string;
  kind: LedgerTxnType | 'legacy_payment' | 'opening';
  title: string;
  reason: string;
  /** signed effect on the EMPLOYEE's ledger (+ company owes him, − he owes) */
  employeeEffect: number;
  /** signed effect on the linked bank account (0 when not bank-linked) */
  bankEffect: number;
  bankName?: string;
  amount: number;
  /** running balance AFTER this row (per-employee registration-ordered fold) */
  balance: number;
  /** which record surface created this row — drives the Particulars tag */
  intent?: 'adjust' | 'paid' | 'received';
  /** manual employee-ledger txn rows are editable; accruals and legacy rows are not */
  editable?: boolean;
  isAccrual?: boolean;
}

/** Internal type → employer-facing label ('reduce_balance' is presented as
 *  "Paid To Employee"; the stored type field is unchanged) */
const TYPE_LABELS: Record<LedgerTxnType, string> = {
  wage_accrual: 'Wage Accrual (auto)',
  add_balance: 'Increase Balance',
  reduce_balance: 'Paid To Employee',
  direct_transaction: 'Direct Transaction',
};
function typeLabel(type: LedgerTxnType): string {
  return TYPE_LABELS[type];
}

/** One employee's current ledger balance — the same fold the ledger table
 *  shows: master opening + accruals/adds (+), paid-to-employee (−) and legacy
 *  payroll payouts (−); direct rows are balance-neutral. */
export function employeeLedgerBalance(
  emp: Employee,
  txns: EmployeeLedgerTransaction[],
  payments: EmployeePayment[]
): number {
  let bal = Number(emp.openingBalance) || 0;
  txns.forEach((t) => {
    if (t.employeeId !== emp.id) return;
    if (t.type === 'wage_accrual' || t.type === 'add_balance') bal += t.amount;
    else if (t.type === 'reduce_balance') bal -= t.amount;
  });
  payments.forEach((p) => {
    if (p.employeeId === emp.id) bal -= Number(p.amount) || 0;
  });
  return Math.round(bal * 100) / 100;
}

export function EmployeeLedgerView({ employees, focusedEmpId }: EmployeeLedgerViewProps) {
  const {
    employeeLedgerTransactions,
    employeePayments,
    accounts,
    settings,
    db,
  } = useDatabase();

  const currencySymbol = settings?.currency?.symbol || '₹';
  // Empty = ALL employees; picking one narrows the table to his ledger
  const [filterEmpId, setFilterEmpId] = useState<string>('');
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  // The list has no Actions column, so this stays null — the modal is
  // record-only (kept for the record popover + modal structure below).
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  // Record flow: the "Record Transaction" button pops the two base choices —
  // the modal then opens pre-set to Increase (Adjust Ledger) or Reduce
  const [isRecordPopoverOpen, setIsRecordPopoverOpen] = useState(false);
  const [recordType, setRecordType] = useState<'adjust' | 'paid' | 'received'>('adjust');

  const filteredEmp = employees.find((e) => e.id === filterEmpId) || null;
  // FOCUSED mode wins over the manual filter (the modal's ledger view)
  const focusEmp = focusedEmpId ? (employees.find((e) => e.id === focusedEmpId) || null) : null;
  const effectiveEmp = focusEmp || filteredEmp;
  const effectiveFilterEmpId = focusEmp ? focusEmp.id : filterEmpId;

  /**
   * Per-employee fold in REGISTRATION order (createdAt — the same convention
   * as the Cash & Bank account ledger): each employee's balance starts on his
   * master's openingBalance, then accruals (+), add-balance (+), reduce (−),
   * legacy payroll payouts (−) and direct rows (0) apply. Every line carries
   * the balance AFTER it, so an all-employees view still shows the correct
   * per-employee balance per row.
   */
  const { lines: allLines, balanceByEmployee } = useMemo(() => {
    const lines: LedgerLine[] = [];
    const balanceByEmployee: Record<string, number> = {};

    employees.forEach((emp) => {
      const opening = Number(emp.openingBalance) || 0;
      let running = opening;

      const folds = employeeLedgerTransactions
        .filter((t) => t.employeeId === emp.id)
        .map((t) => ({
          date: t.date,
          kind: t.type,
          title: typeLabel(t.type),
          intent: t.intent,
          reason: t.reason,
          // amount is always positive; the type (and direction) carries the sign
          employeeEffect:
            t.type === 'wage_accrual' || t.type === 'add_balance'
              ? t.amount
              : t.type === 'reduce_balance'
              ? -t.amount
              : 0, // direct transactions never move the employee's balance
          bankEffect:
            !t.accountId
              ? 0
              : t.type === 'add_balance'
              ? t.amount // received from employee — money comes IN
              : t.type === 'reduce_balance'
              ? -t.amount
              : t.direction === 'money_in'
              ? t.amount
              : -t.amount,
          bankName: t.accountName,
          amount: t.amount,
          createdAt: t.createdAt || '',
          refId: t.id,
          editable: t.source !== 'accrual_engine',
          isAccrual: t.type === 'wage_accrual',
        }));

      // Legacy payroll payouts recorded before the ledger existed — they stay
      // bank-affecting (already counted there) and drain the employee balance.
      employeePayments
        .filter((p) => p.employeeId === emp.id)
        .forEach((p) => {
          folds.push({
            date: p.date,
            kind: 'legacy_payment' as const,
            title: `Legacy Payroll — ${p.type.charAt(0).toUpperCase() + p.type.slice(1)}`,
            reason: p.notes || p.referenceNo || `Payout via ${p.paymentMode.replace('_', ' ')}`,
            employeeEffect: -Number(p.amount) || 0,
            bankEffect: -Number(p.amount) || 0,
            bankName: p.accountName,
            amount: Number(p.amount) || 0,
            createdAt: p.createdAt || p.date || '',
            refId: p.id,
            editable: false,
            isAccrual: false,
          });
        });

      folds.sort((a, b) => {
        const ca = Date.parse(a.createdAt) || Date.parse(a.date) || 0;
        const cb = Date.parse(b.createdAt) || Date.parse(b.date) || 0;
        return ca - cb;
      });

      lines.push({
        key: `opening-${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        date: emp.joiningDate,
        createdAt: '',
        kind: 'opening',
        title: 'Opening Balance',
        reason: 'Carried into the ledger when the employee was created',
        employeeEffect: opening,
        bankEffect: 0,
        amount: Math.abs(opening),
        balance: opening,
      });

      folds.forEach((f) => {
        running += f.employeeEffect;
        lines.push({
          key: f.refId,
          employeeId: emp.id,
          employeeName: emp.name,
          date: f.date,
          createdAt: f.createdAt,
          kind: f.kind,
          title: f.title,
          intent: f.intent,
          reason: f.reason,
          employeeEffect: f.employeeEffect,
          bankEffect: f.bankEffect,
          bankName: f.bankName,
          amount: f.amount,
          balance: running,
          editable: f.editable,
          isAccrual: f.isAccrual,
        });
      });

      balanceByEmployee[emp.id] = running;
    });

    return { lines, balanceByEmployee };
  }, [employees, employeeLedgerTransactions, employeePayments]);

  // Single-employee filter drives the current-balance card; the table shows
  // ALL employees' transactions unless one is picked
  const currentBalance = effectiveEmp ? balanceByEmployee[effectiveEmp.id] || 0 : 0;
  const visibleLines = useMemo(
    () => (effectiveFilterEmpId ? allLines.filter((l) => l.employeeId === effectiveFilterEmpId) : allLines),
    [allLines, effectiveFilterEmpId]
  );
  // The table renders the rows GLOBALLY newest-first ("latest on top") — a
  // plain reversal of the fold would keep each employee's block together in
  // the all-employees view instead of interleaving every row by recency.
  // Each row's Employee Balance is unaffected: it stays the running value of
  // that employee's own chronological fold.
  const displayLines = useMemo(
    () => [...visibleLines].sort((a, b) => {
      const ca = Date.parse(a.createdAt) || Date.parse(a.date) || 0;
      const cb = Date.parse(b.createdAt) || Date.parse(b.date) || 0;
      return cb - ca;
    }),
    [visibleLines]
  );

  const openRecordModal = (intent: 'adjust' | 'paid' | 'received') => {
    setIsRecordPopoverOpen(false);
    setRecordType(intent);
    setEditingTxnId(null);
    setIsTxnModalOpen(true);
  };

  return (
    <div className="space-y-5" id="employee-ledger-container">
      {/* FOCUSED mode (the detail page's Ledger tab) renders NO bar card —
          the employee's balance and the Record Transaction action live on the
          DETAIL PAGE's main header instead */}
      {!focusEmp && (
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[var(--color-primary)]" />
              <span className="text-xs font-black text-[var(--color-on-surface-variant)] uppercase tracking-wider">Employee Ledgers</span>
            </div>
            <div className="sm:w-72 px-3 py-2 bg-[var(--color-surface-container-high)] rounded-lg border border-transparent focus-within:border-[var(--color-primary)] focus-within:bg-[var(--color-surface-container-lowest)]">
              <SearchableSelect
                value={filterEmpId}
                onChange={setFilterEmpId}
                placeholder="All employees"
                options={[
                  { value: '', label: 'All Employees', sub: 'Every ledger transaction' },
                  ...employees.map((e) => ({
                    value: e.id,
                    label: e.name,
                    sub: `${e.role.charAt(0).toUpperCase() + e.role.slice(1)} • ${formatCurrency(e.salaryBase, currencySymbol)} / ${e.salaryType === 'daily' ? 'day' : 'month'}`,
                  })),
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {filteredEmp && (
              <div className="px-4 py-2 rounded-xl bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]">
                <p className="text-[9px] font-black text-[var(--color-on-surface-variant)] uppercase tracking-wider">{filteredEmp.name}'s Balance</p>
                <p className={`text-base font-black ${currentBalance < 0 ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
                  {formatCurrency(currentBalance, currencySymbol)}
                </p>
                <p className="text-[9px] font-bold text-[var(--color-on-surface-variant)]">
                  {currentBalance > 0 ? 'Company owes employee' : currentBalance < 0 ? 'Employee owes company' : 'Settled'}
                </p>
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setIsRecordPopoverOpen((v) => !v)}
                className="flex items-center justify-center gap-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs px-4 py-2.5 rounded-full hover:opacity-90 transition shadow-xs"
              >
                <Plus className="w-4 h-4" /> Record Transaction
              </button>
              {/* The three record choices — each opens its own modal variant */}
              {isRecordPopoverOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsRecordPopoverOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-2xl overflow-hidden text-left">
                    <p className="px-3 pt-2.5 pb-1 text-[9px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                      What are you recording?
                    </p>
                    <button
                      type="button"
                      onClick={() => openRecordModal('adjust')}
                      className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container)] transition-colors border-b border-[var(--color-outline-variant)]/50"
                    >
                      <ArrowUpCircle size={18} className="shrink-0 text-[var(--color-success)]" />
                      <span>
                        <span className="block text-[11px] font-black text-[var(--color-on-surface)]">Adjust Ledger</span>
                        <span className="block text-[10px] font-semibold text-[var(--color-on-surface-variant)]">Increase or reduce the employee's ledger balance (tabs inside).</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openRecordModal('paid')}
                      className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container)] transition-colors border-b border-[var(--color-outline-variant)]/50"
                    >
                      <ArrowDownCircle size={18} className="shrink-0 text-[var(--color-error)]" />
                      <span>
                        <span className="block text-[11px] font-black text-[var(--color-on-surface)]">Paid To Employee</span>
                        <span className="block text-[10px] font-semibold text-[var(--color-on-surface-variant)]">Dues goes DOWN — advance handed out, salary disbursed.</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openRecordModal('received')}
                      className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-container)] transition-colors"
                    >
                      <Banknote size={18} className="shrink-0 text-[var(--color-success)]" />
                      <span>
                        <span className="block text-[11px] font-black text-[var(--color-on-surface)]">Received From Employee</span>
                        <span className="block text-[10px] font-semibold text-[var(--color-on-surface-variant)]">Money received into the company — dues go UP, bank must be chosen.</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ledger table (latest on top) — NO container scroll anywhere now
          (the page itself scrolls both axes like the party statement); the
          header row rides sticky beneath the app header in BOTH the main tab
          and the detail page's focused ledger */}
      <div className={`bg-[var(--color-surface-container-lowest)] shadow-xs ${focusEmp ? 'rounded-2xl border border-[var(--color-outline-variant)]' : ''}`}>
        {!focusEmp && (
          <div className="p-4 bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] flex items-center justify-between">
            <p className="text-[11px] font-black text-[var(--color-on-surface-variant)] uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              {filteredEmp ? `${filteredEmp.name}'s Ledger` : 'All Employee Ledgers'}
            </p>
            <p className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">
              {displayLines.length} entr{displayLines.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
        )}
        <div>
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="sticky top-16 z-20">
              <tr className="bg-[var(--color-surface-container-low)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] text-[11px] font-bold uppercase tracking-wider">
                <th className="p-4 min-w-[150px]">Date &amp; Time</th>
                {/* Employee column only on the all-employees view — the detail
                    page's Ledger tab already shows the employee's name in its
                    header, so the column is redundant there */}
                {!focusEmp && <th className="p-4">Employee</th>}
                <th className="p-4">Particulars</th>
                <th className="p-4">Bank / Account</th>
                <th className="p-4 min-w-[140px]">Amount</th>
                <th className="p-4">Ledger Entry</th>
                <th className="p-4">Employee Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/60 text-xs">
              {displayLines.length === 0 ? (
                <tr>
                  <td colSpan={focusEmp ? 6 : 7} className="p-8 text-center text-[var(--color-on-surface-variant)] font-semibold">
                    No transactions yet — record the first entry (opening balances are carried on each employee's card).
                  </td>
                </tr>
              ) : (
                displayLines.map((line) => {
                  const effLabel =
                    line.employeeEffect > 0 ? `+${formatCurrency(line.employeeEffect, currencySymbol)}` : line.employeeEffect < 0 ? `-${formatCurrency(Math.abs(line.employeeEffect), currencySymbol)}` : '—';
                  // The registration TIME rides under the date (rows without a
                  // registration timestamp show their effective date only)
                  const regTime = line.createdAt && Date.parse(line.createdAt)
                    ? new Date(line.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : '';
                  // Particulars tag: exactly three employer-facing tags —
                  // Adjusted (green on an increase, red on a reduce),
                  // Paid To Employee (red), Received From Employee (green)
                  const SUCCESS = 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]';
                  const ERROR = 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]';
                  const tag =
                    line.kind === 'wage_accrual'
                      ? { label: line.title, cls: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]', Icon: History }
                      : line.kind === 'legacy_payment'
                      ? { label: line.title, cls: 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]', Icon: Landmark }
                      : line.kind === 'direct_transaction'
                      ? { label: 'Direct Transaction', cls: 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]', Icon: Gift }
                      : line.kind === 'add_balance'
                      ? (line.intent === 'received'
                          ? { label: 'Received From Employee', cls: SUCCESS, Icon: Banknote }
                          : { label: 'Adjusted', cls: SUCCESS, Icon: ArrowUpCircle })
                      : (line.intent === 'paid'
                          ? { label: 'Paid To Employee', cls: ERROR, Icon: ArrowDownCircle }
                          : { label: 'Adjusted', cls: ERROR, Icon: ArrowDownCircle });
                  const TagIcon = tag.Icon;
                  return (
                    <tr key={line.key} className="hover:bg-[var(--color-surface-container-low)]/50 transition">
                      <td className="p-4">
                        <p className="font-bold text-[var(--color-on-surface)]">{line.date}</p>
                        {regTime && <p className="text-[10px] font-semibold text-[var(--color-on-surface-variant)]">{regTime}</p>}
                      </td>
                      {!focusEmp && (
                        <td className="p-4 font-bold text-[var(--color-on-surface)]">{line.employeeName}</td>
                      )}
                      <td className="p-4">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-bold text-[10px] rounded-full whitespace-nowrap ${tag.cls}`}>
                            <TagIcon className="w-3 h-3" />
                            {tag.label}
                          </span>
                          <span className="font-semibold text-[var(--color-on-surface-variant)] max-w-xs" title={line.reason}>
                            {line.reason}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        {line.bankName ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-on-surface)]">
                            <Landmark className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                            {line.bankName}
                          </span>
                        ) : (
                          <span className="text-[var(--color-on-surface-variant)]">—</span>
                        )}
                      </td>
                      <td className="p-4 font-black text-[var(--color-on-surface)]">{formatCurrency(line.amount, currencySymbol)}</td>
                      <td className={`p-4 font-black ${line.employeeEffect > 0 ? 'text-[var(--color-success)]' : line.employeeEffect < 0 ? 'text-[var(--color-error)]' : 'text-[var(--color-on-surface-variant)]'}`}>
                        {effLabel}
                      </td>
                      <td className="p-4 font-black text-[var(--color-on-surface)]">
                        {formatCurrency(line.balance, currencySymbol)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-on-surface-variant)] px-1">
        Wage rows post automatically: daily wagers earn per attendance day (Present/Late/Early Exit full, Half Day half, Holiday paid); monthly wagers get full salary on the 1st, minus absents and half-days. Record Transaction → Adjust Ledger opens Increase/Reduce tabs (always on-ledger, book on credit, no bank); Paid To Employee pays OUT of a chosen bank (MANDATORY, with an "Add on Ledger" switch); Received From Employee raises the balance and MUST name the bank account the money arrived in (money IN). Employee Balance shows the row's employee's running balance, not a combined total.
      </p>

      {/* MODAL: Record ledger transaction — the employee is chosen HERE */}
      {/* the record modal is tab-flow only (focused pages own their action) */}
      {!focusEmp && isTxnModalOpen && (
        <LedgerTxnModal
          editingTxn={editingTxnId ? employeeLedgerTransactions.find((t) => t.id === editingTxnId) || null : null}
          variant={recordType}
          employees={employees}
          preselectedEmployeeId={effectiveFilterEmpId}
          accounts={accounts}
          currencySymbol={currencySymbol}
          onClose={() => {
            setIsTxnModalOpen(false);
            setEditingTxnId(null);
          }}
          onSave={(payload, txnId) => {
            if (txnId) {
              db.updateEmployeeLedgerTransaction(txnId, payload);
            } else {
              db.addEmployeeLedgerTransaction(payload);
            }
            setIsTxnModalOpen(false);
            setEditingTxnId(null);
          }}
        />
      )}
    </div>
  );
}

interface LedgerTxnModalProps {
  editingTxn: EmployeeLedgerTransaction | null;
  /** Which entry point opened the modal:
   *  'adjust'   = Adjust Ledger — Increase/Reduce tabs, no bank, no checkbox
   *               (always on-ledger, book on credit) —
   *  'paid'     = ORIGINAL Paid To Employee — balance ↓, bank money OUT
   *               (bank MANDATORY), "Add on Ledger" checkbox —
   *  'received' = Received From Employee — balance ↑ ALWAYS, bank REQUIRED
   *               (money IN), no checkbox.
   *  */
  variant?: 'adjust' | 'paid' | 'received';
  /** Cash & Bank accounts (paid/received variants' bank picker) */
  accounts: CashBankAccount[];
  employees: Employee[];
  /** Pre-picks the table's active filter employee in record mode */
  preselectedEmployeeId?: string;
  currencySymbol: string;
  onClose: () => void;
  onSave: (payload: Partial<EmployeeLedgerTransaction>, txnId?: string) => void;
}

/**
 * The transaction modal in THREE variants:
 *   'adjust'   — Adjust Ledger: Increase/Reduce tabs, NO bank account, NO
 *                checkbox — every row lands on the ledger (book on credit).
 *   'paid'     — original Paid To Employee: balance goes DOWN with a Bank
 *                Account picker (money OUT; REQUIRED) and the "Add on Ledger"
 *                checkbox (unchecked = ledger-free direct txn).
 *   'received' — Received From Employee: balance goes UP ALWAYS ("Add on
 *                Ledger" is implicit), and the employer MUST choose the bank
 *                account the money was received into (movement = money IN).
 * The employee is selected inside (required); the reason is mandatory.
 */
export function LedgerTxnModal({
  editingTxn,
  variant = 'adjust',
  accounts,
  employees,
  preselectedEmployeeId,
  currencySymbol,
  onClose,
  onSave,
}: LedgerTxnModalProps) {
  const isPaid = variant === 'paid';
  const isReceived = variant === 'received';
  const isBankLinked = isPaid || isReceived;
  const [employeeId, setEmployeeId] = useState<string>(editingTxn?.employeeId || preselectedEmployeeId || '');
  // Adjust Ledger tabs — 'increase' lifts the balance (payable), 'reduce'
  // lowers it (paid to employee). Both directions stay switchable inside.
  // Edit mode stays fixed.
  const [mode, setMode] = useState<'increase' | 'reduce'>(
    editingTxn ? (editingTxn.type === 'add_balance' ? 'increase' : 'reduce') : 'increase'
  );
  // Paid variant's checkbox (checked by default — uncheck = direct transaction)
  const [addOnLedger, setAddOnLedger] = useState<boolean>(editingTxn ? editingTxn.type !== 'direct_transaction' : true);
  // Bank account: REQUIRED in both paid & received variants
  const [accountId, setAccountId] = useState<string>(editingTxn?.accountId || '');
  // Inline mandatory-field error (bank account left unselected on submit)
  const [showAccountError, setShowAccountError] = useState<boolean>(false);
  const [date, setDate] = useState<string>(editingTxn?.date || new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>(editingTxn ? String(editingTxn.amount) : '');
  const [reason, setReason] = useState<string>(editingTxn?.reason || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The row's stored type: received is ALWAYS an on-ledger add_balance; the
  // paid variant follows its checkbox; the adjust variant follows its tab
  const effectiveType: LedgerTxnType = isReceived
    ? 'add_balance'
    : isPaid
    ? (addOnLedger ? 'reduce_balance' : 'direct_transaction')
    : (mode === 'increase' ? 'add_balance' : 'reduce_balance');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (!employeeId) {
      alert('Select the employee this transaction belongs to.');
      return;
    }
    if (!reason.trim()) {
      alert('A note / reason is required for every ledger transaction.');
      return;
    }
    if (amt <= 0) {
      alert('Enter a positive amount.');
      return;
    }
    if (isBankLinked && !accountId) {
      // Inline error instead of an alert: red field + error caption below it
      setShowAccountError(true);
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Partial<EmployeeLedgerTransaction> = {
        employeeId,
        date,
        type: effectiveType,
        amount: amt,
        reason: reason.trim(),
        // The Adjust modal never links a bank account; the Paid modal pays
        // OUT of its account (REQUIRED) and a ledger-free direct row books a
        // money-OUT movement; Received books money-IN (required).
        // intent marks the record surface — it drives the Particulars tag.
        accountId: isBankLinked && accountId ? accountId : undefined,
        direction: isReceived && accountId ? 'money_in' : (isPaid && !addOnLedger && accountId ? 'money_out' : undefined),
        intent: isBankLinked ? variant : 'adjust',
      };
      onSave(payload, editingTxn?.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs">
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-outline-variant)] shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface-container)]">
          <h3 className="text-sm font-black text-[var(--color-on-surface)] flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[var(--color-primary)]" />
            {editingTxn
              ? 'Edit Ledger Transaction'
              : isPaid
              ? 'Paid To Employee'
              : isReceived
              ? 'Received From Employee'
              : `${mode === 'increase' ? 'Increase Balance' : 'Reduce Balance'} (Adjust Ledger)`}
          </h3>
          <button onClick={onClose} className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] p-1.5 rounded-full hover:bg-[var(--color-surface-container-high)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Searchable: Employee (fixed in edit mode) */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">
              Select Employee {editingTxn ? '(fixed on an existing row)' : '*'}
            </label>
            {editingTxn ? (
              <div className="w-full px-3 py-2.5 bg-[var(--color-surface-container-high)] rounded-lg border border-[var(--color-outline-variant)] text-xs font-bold text-[var(--color-on-surface)]">
                {employees.find((e) => e.id === editingTxn.employeeId)?.name || editingTxn.employeeName || editingTxn.employeeId}
              </div>
            ) : (
              <div className="w-full px-3 py-2 bg-[var(--color-surface-container-high)] rounded-lg border border-transparent focus-within:border-[var(--color-primary)] focus-within:bg-[var(--color-surface-container-lowest)]">
                <SearchableSelect
                  value={employeeId}
                  onChange={setEmployeeId}
                  placeholder="Type to search employees..."
                  options={employees.map((e) => ({
                    value: e.id,
                    label: e.name,
                    sub: `${e.role.charAt(0).toUpperCase() + e.role.slice(1)} • ${formatCurrency(e.salaryBase, currencySymbol)}${(Number(e.openingBalance) || 0) !== 0 ? ` • Opening ${formatCurrency(e.openingBalance, currencySymbol)}` : ''}`,
                  }))}
                />
              </div>
            )}
          </div>

          {/* Adjust Ledger tabs (record + adjust variant only — the Paid and
              Received variants have no tabs; edit mode shows the fixed line) */}
          {editingTxn ? (
            <p className="text-xs font-bold text-[var(--color-on-surface-variant)] capitalize">
              Editing: {typeLabel(editingTxn.type)} — {editingTxn.reason}
            </p>
          ) : variant === 'adjust' ? (
            <div className="grid grid-cols-2 gap-2">
              {([
                { mode: 'increase' as const, label: 'Increase Balance', hint: 'payable to employee', icon: ArrowUpCircle },
                { mode: 'reduce' as const, label: 'Reduce Balance', hint: 'paid to employee', icon: ArrowDownCircle },
              ]).map((tab) => (
                <button
                  key={tab.mode}
                  type="button"
                  onClick={() => setMode(tab.mode)}
                  className={`flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-xl border-2 transition ${
                    mode === tab.mode
                      ? tab.mode === 'increase'
                        ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border-[var(--color-success)]'
                        : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)] border-[var(--color-error)]'
                      : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border-transparent hover:bg-[var(--color-surface-container-lowest)]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-black">
                    {(() => {
                      const TabIcon = tab.icon;
                      return <TabIcon className="w-4 h-4 shrink-0" style={{ color: tab.mode === 'increase' ? 'var(--color-success)' : 'var(--color-error)' }} />;
                    })()}
                    {tab.label}
                  </span>
                  <span className="text-[9px] font-bold opacity-80">
                    ({tab.hint})
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-black text-[var(--color-on-surface-variant)] pointer-events-none">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 2500"
                  className="w-full pl-7 pr-3 py-2.5 text-xs bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-bold"
                />
              </div>
            </div>
          </div>

          {/* BANK-LINKED variants (paid + received): the bank account picker —
              money OUT on record for paid; money IN for received. REQUIRED in
              both variants (no credit-booking through this modal). */}
          {isBankLinked && (
            <div className="bg-[var(--color-surface-container-high)] p-3 rounded-xl border border-[var(--color-outline-variant)] space-y-3">
              <label className="text-xs font-bold text-[var(--color-on-surface-variant)] flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                {isReceived ? 'Received In (Bank Account) *' : 'Bank Account *'}
              </label>
              <div
                className={`px-3 py-2 bg-[var(--color-surface-container-lowest)] rounded-lg border transition-colors ${
                  showAccountError
                    ? 'border-[var(--color-error)]'
                    : 'border-transparent focus-within:border-[var(--color-primary)]'
                }`}
              >
                <SearchableSelect
                  value={accountId}
                  onChange={(v) => {
                    setAccountId(v);
                    if (v) setShowAccountError(false);
                  }}
                  placeholder="Type to search accounts..."
                  options={accounts.filter((a) => a.isActive !== false).map((a) => ({
                    value: a.id,
                    label: a.name,
                    sub: `${a.type === 'cash' ? 'Cash' : 'Bank'} • ${formatCurrency(a.currentBalance || 0, currencySymbol)}`,
                  }))}
                />
              </div>
              {showAccountError && !accountId && (
                <p className="text-[10px] font-bold text-[var(--color-error)] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {isReceived
                    ? 'Select the bank account where the money was received — this field is mandatory.'
                    : 'Select the bank account the payment goes out of — this field is mandatory.'}
                </p>
              )}
              <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)]">
                {isReceived
                  ? "Money comes INTO this account's ledger on record."
                  : "Money goes OUT of this account's ledger on record."}
              </p>
            </div>
          )}

          {/* Paid variant's checkbox (checked by default — uncheck = direct txn) */}
          {isPaid && (
            <label
              className={`flex items-start gap-2.5 p-3 rounded-xl border transition ${
                addOnLedger
                  ? 'bg-[var(--color-success-container)]/30 border-[var(--color-success)]/30'
                  : 'bg-[var(--color-secondary-container)]/30 border-[var(--color-secondary)]/30'
              } ${editingTxn ? 'opacity-70' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={addOnLedger}
                disabled={Boolean(editingTxn)}
                onChange={(e) => setAddOnLedger(e.target.checked)}
                className="accent-[var(--color-primary)] w-4 h-4 mt-0.5 shrink-0"
              />
              <span>
                <span className="block text-[11px] font-black text-[var(--color-on-surface)]">
                  Add on Ledger
                </span>
                <span className="block text-[10px] font-semibold text-[var(--color-on-surface-variant)]">
                  {addOnLedger
                    ? 'Checked: the employee\'s dues move DOWN on his ledger.'
                    : 'Unchecked: recorded without changing the ledger — a direct transaction (e.g. festival bonus, reward).'}
                </span>
              </span>
            </label>
          )}

          {/* ADJUST variant: no bank account and no checkbox here —
              every row always lands on the ledger, booked on credit */}
          {!isBankLinked && (
            <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)] bg-[var(--color-success-container)]/30 p-2.5 rounded-lg">
              Booked on credit, always on the ledger — the employee's balance moves without touching any bank account.
            </p>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--color-on-surface-variant)] mb-1">Note / Reason (required) *</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Advance, festival bonus, salary disbursed, reimbursement"
              className="w-full text-xs p-2.5 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] rounded-lg border border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-surface-container-lowest)] outline-hidden font-medium"
            />
          </div>

          <div className="pt-4 border-t border-[var(--color-outline-variant)] flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] font-bold text-xs rounded-full hover:bg-[var(--color-surface-container-highest)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full hover:opacity-90 transition shadow-xs disabled:opacity-50 inline-flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingTxn ? 'Save Changes' : 'Record Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}