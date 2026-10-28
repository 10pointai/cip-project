import React, { useState, useMemo } from 'react';
import {
  Landmark,
  Wallet,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  SlidersHorizontal,
  Search,
  Filter,
  Calendar,
  CreditCard,
  Building2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ChevronRight,
  MoreVertical,
  Banknote,
  DollarSign,
  Layers,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  FileSpreadsheet,
  Printer,
  Check,
  Edit2,
  ShieldCheck,
} from 'lucide-react';
import {
  CashBankAccount,
  AccountType,
  InternalTransfer,
  AccountAdjustment,
  Transaction,
  CompanySettings,
  Order,
  EmployeePayment,
  EmployeeLedgerTransaction,
  VehicleEmiEntry,
  VehicleExpenseEntry,
} from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { formatLedgerBalance } from '../parties/partyStatement';
import { cloudStore as localDb } from '../../services/cloudStore';

/** A ledger row's registration timestamp (createdAt of its underlying
 *  transaction/transfer/adjustment/order) — falls back to the row's effective
 *  date for defensively-incomplete records. Running-balance sequencing and
 *  the display key on this. */
const registeredAtTsOf = (row: { createdAt?: string; date?: string }): number =>
  Date.parse(row.createdAt || '') || Date.parse(row.date || '') || 0;

interface CashBankViewProps {
  accounts: CashBankAccount[];
  transfers: InternalTransfer[];
  adjustments: AccountAdjustment[];
  transactions: Transaction[];
  orders?: Order[];
  /** payroll payouts — every payment carries its accountId and shows as money-out */
  employeePayments?: EmployeePayment[];
  employeeLedgerTransactions?: EmployeeLedgerTransaction[];
  /** auto-posted + manual vehicle loan installments debited from accounts */
  vehicleEmiEntries?: VehicleEmiEntry[];
  /** vehicle expense log (generic + diesel) debited from accounts */
  vehicleExpenses?: VehicleExpenseEntry[];
  settings: CompanySettings;
  onAddAccount: (acc: Omit<CashBankAccount, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance' | 'isActive'>) => void;
  onUpdateAccount: (id: string, updates: Partial<CashBankAccount>) => void;
  onDeleteAccount: (id: string) => void;
  onAddTransfer: (transfer: Omit<InternalTransfer, 'id' | 'createdAt' | 'transferNumber'>) => void;
  onDeleteTransfer: (id: string) => void;
  onAddAdjustment: (adj: Omit<AccountAdjustment, 'id' | 'createdAt' | 'adjustmentNumber' | 'previousBalance' | 'newBalance'>) => void;
  onDeleteAdjustment: (id: string) => void;
  onOpenRecordPayment: (type: 'payment_in' | 'payment_out') => void;
}

export function CashBankView({
  accounts,
  transfers,
  adjustments,
  transactions,
  orders,
  employeePayments,
  employeeLedgerTransactions,
  vehicleEmiEntries,
  vehicleExpenses,
  settings,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onAddTransfer,
  onDeleteTransfer,
  onAddAdjustment,
  onDeleteAdjustment,
  onOpenRecordPayment,
}: CashBankViewProps) {
  const currencySymbol = settings.currency.symbol;

  // Active subtab
  const [activeTab, setActiveTab] = useState<'all' | 'bank' | 'cash' | 'transfers' | 'adjustments'>('all');
  
  // View mode toggle: 'table' (list view) vs 'cards'
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Sort By
  const [sortBy, setSortBy] = useState<'name' | 'balance_desc' | 'balance_asc' | 'recent'>('name');

  // Selected Account for Ledger Drilldown
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Modals
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);

  // Modals state
  const [accountFormData, setAccountFormData] = useState({
    name: '',
    type: 'bank' as AccountType,
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    openingBalance: '',
    asOfDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [transferFormData, setTransferFormData] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    notes: '',
  });

  const [adjustmentFormData, setAdjustmentFormData] = useState({
    accountId: '',
    type: 'increase' as 'increase' | 'decrease',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reason: '',
    referenceNumber: '',
    notes: '',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');

  // Calculations
  const bankAccounts = accounts.filter((a) => a.type === 'bank');
  const cashAccounts = accounts.filter((a) => a.type === 'cash');

  const totalBankBalance = bankAccounts.reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);
  const totalCashBalance = cashAccounts.reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);
  const totalLiquidity = totalBankBalance + totalCashBalance;

  // Count transactions per account (including orders)
  const transactionCounts = useMemo(() => {
    const counts: Record<string, { inCount: number; outCount: number; total: number }> = {};
    accounts.forEach((a) => {
      counts[a.id] = { inCount: 0, outCount: 0, total: 0 };
    });

    transactions.forEach((t) => {
      if (t.accountId && counts[t.accountId]) {
        counts[t.accountId].total += 1;
        if (t.type === 'payment_in' || t.type === 'sale_invoice') {
          counts[t.accountId].inCount += 1;
        } else {
          counts[t.accountId].outCount += 1;
        }
      }
    });

    const ordersList = (orders || localDb.getOrders()).filter((o) => o.status !== 'cancelled');
    ordersList.forEach((ord) => {
      if (ord.accountId && counts[ord.accountId]) {
        if (ord.type === 'sales' && ord.stage === 'quotation') return; // quotations don't affect accounting
        counts[ord.accountId].total += 1;
        if (ord.type === 'sales') {
          counts[ord.accountId].inCount += 1;
        } else {
          counts[ord.accountId].outCount += 1;
        }
      }
    });

    transfers.forEach((trf) => {
      if (counts[trf.fromAccountId]) counts[trf.fromAccountId].total += 1;
      if (counts[trf.toAccountId]) counts[trf.toAccountId].total += 1;
    });

    adjustments.forEach((adj) => {
      if (counts[adj.accountId]) counts[adj.accountId].total += 1;
    });

    return counts;
  }, [accounts, transactions, transfers, adjustments, orders]);

  // Filtered & sorted accounts list
  const filteredAccounts = useMemo(() => {
    return accounts
      .filter((acc) => {
        if (activeTab === 'bank' && acc.type !== 'bank') return false;
        if (activeTab === 'cash' && acc.type !== 'cash') return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            acc.name.toLowerCase().includes(q) ||
            (acc.bankName && acc.bankName.toLowerCase().includes(q)) ||
            (acc.accountNumber && acc.accountNumber.includes(q)) ||
            (acc.ifscCode && acc.ifscCode.toLowerCase().includes(q)) ||
            (acc.notes && acc.notes.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'balance_desc') {
          return (b.currentBalance || 0) - (a.currentBalance || 0);
        }
        if (sortBy === 'balance_asc') {
          return (a.currentBalance || 0) - (b.currentBalance || 0);
        }
        return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
      });
  }, [accounts, activeTab, searchQuery, sortBy]);

  // Selected Account details & Ledger
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // Build the full ledger for the selected account. Running balance is
  // sequenced by REGISTRATION order (createdAt — the moment the record was
  // actually registered on the account), never by the effective document
  // date: a back-dated entry joins the sequence where it was REGISTERED and
  // does not reshuffle the balance history before it (party-ledger rule). The
  // list is returned ascending (sequencing order); the display renders it
  // latest-on-top.
  const accountLedger = useMemo(() => {
    if (!selectedAccountId) return [];

    const list: Array<{
      id: string;
      date: string;
      type: 'payment_in' | 'payment_out' | 'transfer_in' | 'transfer_out' | 'adjustment_inc' | 'adjustment_dec' | 'voucher';
      title: string;
      description: string;
      referenceNumber?: string;
      moneyIn: number;
      moneyOut: number;
      createdAt: string;
      runningBalance: number;
    }> = [];

    // 1. Transactions (Payment in / out / sale / purchase)
    transactions
      .filter((t) => t.accountId === selectedAccountId && t.status !== 'cancelled')
      .forEach((t) => {
        const isCredit = t.type === 'payment_in' || t.type === 'sale_invoice';
        list.push({
          id: t.id,
          date: t.date,
          type: isCredit ? 'payment_in' : 'payment_out',
          title: `${t.partyName} (${t.type === 'payment_in' ? 'Receipt' : t.type === 'payment_out' ? 'Payment' : t.type.replace('_', ' ').toUpperCase()})`,
          description: t.description || `Voucher ${t.voucherNumber}`,
          referenceNumber: t.referenceNumber || t.voucherNumber,
          moneyIn: isCredit ? Number(t.amount) : 0,
          moneyOut: !isCredit ? Number(t.amount) : 0,
          createdAt: t.createdAt,
        });
      });

    // 2. Transfers
    transfers.forEach((trf) => {
      if (trf.toAccountId === selectedAccountId) {
        list.push({
          id: trf.id,
          date: trf.date,
          type: 'transfer_in',
          title: `Transfer from ${trf.fromAccountName}`,
          description: trf.notes || `Internal transfer ${trf.transferNumber}`,
          referenceNumber: trf.referenceNumber || trf.transferNumber,
          moneyIn: Number(trf.amount),
          moneyOut: 0,
          createdAt: trf.createdAt,
        });
      } else if (trf.fromAccountId === selectedAccountId) {
        list.push({
          id: trf.id,
          date: trf.date,
          type: 'transfer_out',
          title: `Transfer to ${trf.toAccountName}`,
          description: trf.notes || `Internal transfer ${trf.transferNumber}`,
          referenceNumber: trf.referenceNumber || trf.transferNumber,
          moneyIn: 0,
          moneyOut: Number(trf.amount),
          createdAt: trf.createdAt,
        });
      }
    });

    // 3. Adjustments
    adjustments
      .filter((adj) => adj.accountId === selectedAccountId)
      .forEach((adj) => {
        const isInc = adj.type === 'increase';
        list.push({
          id: adj.id,
          date: adj.date,
          type: isInc ? 'adjustment_inc' : 'adjustment_dec',
          title: `Balance Adjustment (${isInc ? '+ Increase' : '- Decrease'})`,
          description: adj.reason || `Adjustment voucher ${adj.adjustmentNumber}`,
          referenceNumber: adj.referenceNumber || adj.adjustmentNumber,
          moneyIn: isInc ? Number(adj.amount) : 0,
          moneyOut: !isInc ? Number(adj.amount) : 0,
          createdAt: adj.createdAt,
        });
      });

    // 3.b Payroll payouts out of this account (salary/advance/bonus/
    // reimbursement — recorded in the Payroll & Payments tab; deleting one
    // reverses it here, which is why the balance math re-computes after)
    (employeePayments || [])
      .filter((ep) => ep.accountId === selectedAccountId)
      .forEach((ep) => {
        list.push({
          id: ep.id,
          date: ep.date,
          type: 'payment_out',
          title: `Payroll — ${ep.employeeName} (${(ep.type || 'salary').replace('_', ' ')})`,
          description: ep.notes || `${(ep.type || 'salary').replace('_', ' ').toUpperCase()} payout${ep.monthYear ? ` for ${ep.monthYear}` : ''}`,
          referenceNumber: ep.referenceNo,
          moneyIn: 0,
          moneyOut: Number(ep.amount) || 0,
          createdAt: (ep as any).createdAt || ep.date,
        });
      });

    // 3.c Vehicle EMI installments — auto cron-posted on the due date and
    // manual records from the Vehicle EMI ledger (editing/removing an entry
    // rebalances the account on the server)
    (vehicleEmiEntries || [])
      .filter((e) => e.accountId === selectedAccountId)
      .forEach((e) => {
        list.push({
          id: e.id,
          date: e.date,
          type: 'payment_out',
          title: `Vehicle EMI — ${e.vehicleNo || 'Vehicle'} (${e.source === 'auto' ? 'Auto' : 'Manual'})`,
          description: e.notes || 'Monthly vehicle loan installment debited',
          referenceNumber: undefined,
          moneyIn: 0,
          moneyOut: Number(e.amount) || 0,
          createdAt: (e as any).createdAt || e.date,
          // assigned by the registration-order sequencer below
          runningBalance: 0,
        });
      });

    // 3.c-i Vehicle expense log entries — generic expenses and diesel fuel
    // fills from Fleets → Expenses (editing/removing an entry rebalances the
    // account on the server; diesel rows surface their litres × rate)
    (vehicleExpenses || [])
      .filter((e) => e.accountId === selectedAccountId)
      .forEach((e) => {
        const isDiesel = e.entryType === 'diesel';
        list.push({
          id: e.id,
          date: e.date,
          type: 'payment_out',
          title: `Vehicle Expense — ${e.vehicleNo || 'Vehicle'}${isDiesel ? ' (Diesel)' : ` (${e.expenseType || 'Expense'})`}`,
          description: e.notes || (isDiesel
            ? [e.litres !== undefined ? `${Number(e.litres).toLocaleString('en-IN')} L` : '', e.ratePerLitre !== undefined ? `₹${e.ratePerLitre}/L` : ''].filter(Boolean).join(' @ ') || 'Diesel fuel fill debited'
            : 'Vehicle expense debited'),
          referenceNumber: undefined,
          moneyIn: 0,
          moneyOut: Number(e.amount) || 0,
          createdAt: (e as any).createdAt || e.date,
          // assigned by the registration-order sequencer below
          runningBalance: 0,
        });
      });

    // 3.c Employee ledger rows on this account (Ledger & Salary tab): a
    // reduce_balance pays OUT; a bank-linked direct transaction moves
    // whichever direction was recorded (add_balance/accruals never touch bank)
    (employeeLedgerTransactions || [])
      .filter((t) => t.accountId === selectedAccountId)
      .forEach((t) => {
        const isOut = t.type === 'reduce_balance' ? true : (t.direction || 'money_out') === 'money_out';
        list.push({
          id: t.id,
          date: t.date,
          type: isOut ? 'payment_out' : 'payment_in',
          title: `Employee Ledger — ${t.employeeName || ''} (${t.type.replace('_', ' ')})`,
          description: t.reason,
          referenceNumber: undefined,
          moneyIn: isOut ? 0 : Number(t.amount) || 0,
          moneyOut: isOut ? Number(t.amount) || 0 : 0,
          createdAt: t.createdAt,
          // assigned by the registration-order sequencer below
          runningBalance: 0,
        });
      });

    // 4. Sales & Purchase Orders linked to this Account
    const ordersList = (orders || localDb.getOrders()).filter(
      (o) => o.accountId === selectedAccountId && o.status !== 'cancelled'
    );
    ordersList.forEach((ord) => {
      const isSales = ord.type === 'sales';
      if (isSales && ord.stage === 'quotation') return; // Quotations don't affect cash/bank ledger

      const itemsSummary = ord.items && ord.items.length > 0
        ? ord.items.map((i) => `${i.itemName} (${i.quantity} ${i.unit})`).join(', ')
        : 'Materials / Goods';

      const modeText = (ord.paymentMode || 'bank_transfer').replace('_', ' ').toUpperCase();
      const orderTypeTitle = isSales
        // RST (2026-10-28): sales-order numbers are referred to as RST —
        // bare serial numbers; legacy numbers keep their old spelling
        ? `${ord.partyName} (${/^\d+$/.test(String(ord.orderNumber || '')) ? 'RST' : 'Sales Order'}: ${ord.orderNumber})`
        : `${ord.partyName} (Purchase Order: ${ord.orderNumber})`;

      list.push({
        id: ord.id,
        date: ord.date,
        type: isSales ? 'payment_in' : 'payment_out',
        title: orderTypeTitle,
        description: `Settlement via ${modeText} • ${itemsSummary}${ord.notes ? ` • ${ord.notes}` : ''}`,
        referenceNumber: ord.vehicleNo ? `Veh: ${ord.vehicleNo}` : ord.orderNumber,
        moneyIn: isSales ? Number(ord.totalAmount) : 0,
        moneyOut: !isSales ? Number(ord.totalAmount) : 0,
        createdAt: ord.createdAt,
      });
    });

    // --- Sequence: REGISTRATION order with a running balance ---------------
    // Seeded from the account's opening balance; every entry adds
    // (moneyIn − moneyOut) in the order it was registered, so the final
    // running balance ties to account.currentBalance.
    const sorted = list.sort((a, b) => {
      const ca = registeredAtTsOf(a) - registeredAtTsOf(b);
      if (ca !== 0) return ca;
      const d = (a.date || '').localeCompare(b.date || '');
      if (d !== 0) return d;
      return a.id.localeCompare(b.id);
    });
    const openingSeed = Number(selectedAccount?.openingBalance) || 0;
    let running = openingSeed;
    for (const entry of sorted) {
      running = Math.round((running + entry.moneyIn - entry.moneyOut) * 100) / 100;
      entry.runningBalance = running;
    }

    return sorted;
  }, [selectedAccountId, selectedAccount, transactions, transfers, adjustments, orders, employeeLedgerTransactions, vehicleEmiEntries, vehicleExpenses]);

  // Handle CSV Export
  const handleExportCSV = () => {
    const headers = ['Account Name', 'Type', 'Bank Name', 'Account Number', 'IFSC Code', 'Opening Balance', 'Current Balance', 'As of Date', 'Notes'];
    const rows = filteredAccounts.map((a) => [
      `"${a.name}"`,
      `"${a.type.toUpperCase()}"`,
      `"${a.bankName || ''}"`,
      `"${a.accountNumber || ''}"`,
      `"${a.ifscCode || ''}"`,
      a.openingBalance,
      a.currentBalance,
      `"${a.asOfDate || ''}"`,
      `"${(a.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cash_bank_accounts_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  // Handle Add Account Form Submit
  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountFormData.name.trim()) {
      setFormError('Please enter a display name for the account.');
      return;
    }

    const openBal = parseFloat(accountFormData.openingBalance) || 0;

    if (editingAccountId) {
      onUpdateAccount(editingAccountId, {
        name: accountFormData.name.trim(),
        type: accountFormData.type,
        bankName: accountFormData.type === 'bank' ? accountFormData.bankName.trim() : undefined,
        accountNumber: accountFormData.type === 'bank' ? accountFormData.accountNumber.trim() : undefined,
        ifscCode: accountFormData.type === 'bank' ? accountFormData.ifscCode.trim() : undefined,
        openingBalance: openBal,
        asOfDate: accountFormData.asOfDate || new Date().toISOString().split('T')[0],
        notes: accountFormData.notes.trim(),
      });
    } else {
      onAddAccount({
        name: accountFormData.name.trim(),
        type: accountFormData.type,
        bankName: accountFormData.type === 'bank' ? accountFormData.bankName.trim() : undefined,
        accountNumber: accountFormData.type === 'bank' ? accountFormData.accountNumber.trim() : undefined,
        ifscCode: accountFormData.type === 'bank' ? accountFormData.ifscCode.trim() : undefined,
        openingBalance: openBal,
        asOfDate: accountFormData.asOfDate || new Date().toISOString().split('T')[0],
        notes: accountFormData.notes.trim(),
      });
    }

    setIsAddAccountModalOpen(false);
    setEditingAccountId(null);
    setAccountFormData({
      name: '',
      type: 'bank',
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      openingBalance: '',
      asOfDate: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setFormError('');
  };

  // Open the account modal in EDIT mode, prefilled from the stored account.
  // (opening balance / as-of date / category stay fixed after creation —
  // same convention as parties: current balance flows from vouchers only)
  const openEditAccount = (acc: CashBankAccount) => {
    setEditingAccountId(acc.id);
    setAccountFormData({
      name: acc.name || '',
      type: acc.type || 'bank',
      bankName: acc.bankName || '',
      accountNumber: acc.accountNumber || '',
      ifscCode: acc.ifscCode || '',
      openingBalance: acc.openingBalance !== undefined ? String(acc.openingBalance) : '0',
      asOfDate: acc.asOfDate || new Date().toISOString().split('T')[0],
      notes: acc.notes || '',
    });
    setFormError('');
    setIsAddAccountModalOpen(true);
  };

  // Handle Internal Transfer Submit
  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(transferFormData.amount);

    if (!transferFormData.fromAccountId) {
      setFormError('Please select the Source (From) Account.');
      return;
    }
    if (!transferFormData.toAccountId) {
      setFormError('Please select the Destination (To) Account.');
      return;
    }
    if (transferFormData.fromAccountId === transferFormData.toAccountId) {
      setFormError('Source and Destination accounts cannot be the same.');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a transfer amount greater than 0.');
      return;
    }

    const fromAcc = accounts.find((a) => a.id === transferFormData.fromAccountId);
    const toAcc = accounts.find((a) => a.id === transferFormData.toAccountId);

    if (!fromAcc || !toAcc) {
      setFormError('Selected account not found.');
      return;
    }

    // Determine transfer type
    let transferType: any = 'bank_to_bank';
    if (fromAcc.type === 'cash' && toAcc.type === 'bank') transferType = 'cash_to_bank';
    else if (fromAcc.type === 'bank' && toAcc.type === 'cash') transferType = 'bank_to_cash';
    else if (fromAcc.type === 'cash' && toAcc.type === 'cash') transferType = 'cash_to_cash';

    // Account FKs only — display names are resolved by JOIN at read time
    onAddTransfer({
      date: transferFormData.date,
      fromAccountId: fromAcc.id,
      toAccountId: toAcc.id,
      transferType,
      amount: amt,
      referenceNumber: transferFormData.referenceNumber.trim(),
      notes: transferFormData.notes.trim(),
    });

    setIsTransferModalOpen(false);
    setTransferFormData({
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      referenceNumber: '',
      notes: '',
    });
    setFormError('');
  };

  // Handle Adjustment Submit
  const handleAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(adjustmentFormData.amount);

    if (!adjustmentFormData.accountId) {
      setFormError('Please select an account to adjust.');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid adjustment amount.');
      return;
    }
    if (!adjustmentFormData.reason.trim()) {
      setFormError('Please provide a reason for this balance adjustment.');
      return;
    }

    const acc = accounts.find((a) => a.id === adjustmentFormData.accountId);
    if (!acc) return;

    // Account FK only — display name/type are resolved by JOIN at read time
    onAddAdjustment({
      accountId: acc.id,
      date: adjustmentFormData.date,
      type: adjustmentFormData.type,
      amount: amt,
      reason: adjustmentFormData.reason.trim(),
      referenceNumber: adjustmentFormData.referenceNumber.trim(),
      notes: adjustmentFormData.notes.trim(),
    });

    setIsAdjustmentModalOpen(false);
    setAdjustmentFormData({
      accountId: '',
      type: 'increase',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      reason: '',
      referenceNumber: '',
      notes: '',
    });
    setFormError('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Liquidity */}
        <div className="p-5 rounded-[24px] bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
              Total Liquid Funds
            </span>
            <div className="w-9 h-9 rounded-full bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-[var(--color-on-surface)] tracking-tight">
              {formatCurrency(totalLiquidity, currencySymbol)}
            </p>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1 flex items-center gap-1.5">
              <span>{bankAccounts.length} Bank Accounts</span>
              <span>•</span>
              <span>{cashAccounts.length} Cash Drawers</span>
            </p>
          </div>
        </div>

        {/* Bank Total */}
        <div className="p-5 rounded-[24px] bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
              Bank Balance
            </span>
            <div className="w-9 h-9 rounded-full bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)] flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-[var(--color-primary)] tracking-tight">
              {formatCurrency(totalBankBalance, currencySymbol)}
            </p>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Across all bank accounts
            </p>
          </div>
        </div>

        {/* Cash Total */}
        <div className="p-5 rounded-[24px] bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
              Cash on Hand
            </span>
            <div className="w-9 h-9 rounded-full bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)] flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-[var(--color-tertiary)] tracking-tight">
              {formatCurrency(totalCashBalance, currencySymbol)}
            </p>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Across all cash drawers
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-outline)]" />
            <input
              type="text"
              placeholder="Search by account name, bank, a/c number, IFSC, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Controls: Sort & View toggle & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort Select */}
           

            

            {/* Export & Print */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExportCSV}
                className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors border border-[var(--color-outline-variant)]"
                title="Export Accounts CSV"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
              {/* <button
                type="button"
                onClick={handlePrint}
                className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors border border-[var(--color-outline-variant)]"
                title="Print Account List"
              >
                <Printer className="w-4 h-4" />
              </button> */}
            </div>

            {/* Quick Actions */}
            <button
              onClick={() => {
                setFormError('');
                setIsTransferModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Transfer</span>
            </button>

            <button
              onClick={() => {
                setFormError('');
                setIsAdjustmentModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--color-tertiary)]" />
              <span>Adjust</span>
            </button>

            <button
              onClick={() => {
                setAccountFormData({
                  name: '',
                  type: 'bank',
                  bankName: '',
                  accountNumber: '',
                  ifscCode: '',
                  openingBalance: '',
                  asOfDate: new Date().toISOString().split('T')[0],
                  notes: '',
                });
                setFormError('');
                setIsAddAccountModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Account</span>
            </button>
          </div>
        </div>

        {/* Quick Filter — tabs */}
        <div className="border-b border-[var(--color-outline-variant)] flex flex-wrap gap-2">
          {([
            { key: 'all', label: `All Accounts (${accounts.length})` },
          
            { key: 'transfers', label: `Transfers (${transfers.length})` },
            { key: 'adjustments', label: `Adjustments (${adjustments.length})` },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setActiveTab(t.key as typeof activeTab);
                setSelectedAccountId(null);
              }}
              className={`px-4 py-2.5 font-bold text-xs transition-all relative border-b-2 ${
                activeTab === t.key
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* VIEW: Internal Transfers Tab */}
      {activeTab === 'transfers' && !selectedAccountId && (
        <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Internal Fund Transfers</h3>
              <p className="text-xs text-[var(--color-on-surface-variant)]">Contra vouchers (Bank to Bank, Cash to Bank, Bank to Cash)</p>
            </div>
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-semibold rounded-full"
            >
              <Plus className="w-3.5 h-3.5" />
              New Transfer
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] uppercase tracking-wider text-[10px] font-bold border-b border-[var(--color-outline-variant)]">
                <tr>
                  <th className="py-3.5 px-4">Transfer #</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">From Account</th>
                  <th className="py-3.5 px-4">To Account</th>
                  <th className="py-3.5 px-4">Ref / Cheque No.</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-[var(--color-on-surface-variant)]">
                      No internal transfer vouchers recorded yet.
                    </td>
                  </tr>
                ) : (
                  transfers.map((trf) => (
                    <tr key={trf.id} className="hover:bg-[var(--color-surface-container)]/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[var(--color-primary)]">
                        {trf.transferNumber}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-on-surface)]">
                        {formatDate(trf.date)}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--color-on-surface)]">
                        {trf.fromAccountName}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--color-on-surface)]">
                        {trf.toAccountName}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-on-surface-variant)] font-mono">
                        {trf.referenceNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-sm text-[var(--color-on-surface)]">
                        {formatCurrency(trf.amount, currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onDeleteTransfer(trf.id)}
                          className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-error)] rounded-full hover:bg-[var(--color-error-container)]/30 transition-colors"
                          title="Delete Transfer Voucher"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: Adjustments Tab */}
      {activeTab === 'adjustments' && !selectedAccountId && (
        <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Account Balance Adjustments</h3>
              <p className="text-xs text-[var(--color-on-surface-variant)]">Physical reconciliation & balance corrections</p>
            </div>
            <button
              onClick={() => setIsAdjustmentModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-semibold rounded-full"
            >
              <Plus className="w-3.5 h-3.5" />
              New Adjustment
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] uppercase tracking-wider text-[10px] font-bold border-b border-[var(--color-outline-variant)]">
                <tr>
                  <th className="py-3.5 px-4">Adjustment #</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Account</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Reason</th>
                  <th className="py-3.5 px-4 text-right">Adj Amount</th>
                  <th className="py-3.5 px-4 text-right">New Balance</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]">
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-[var(--color-on-surface-variant)]">
                      No adjustments logged yet.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((adj) => (
                    <tr key={adj.id} className="hover:bg-[var(--color-surface-container)]/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[var(--color-tertiary)]">
                        {adj.adjustmentNumber}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-on-surface)]">
                        {formatDate(adj.date)}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--color-on-surface)]">
                        {adj.accountName}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            adj.type === 'increase'
                              ? 'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]'
                              : 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                          }`}
                        >
                          {adj.type === 'increase' ? '+' : '-'} {adj.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--color-on-surface-variant)] max-w-xs truncate">
                        {adj.reason}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold text-sm ${
                          adj.type === 'increase' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                        }`}
                      >
                        {adj.type === 'increase' ? '+' : '-'} {formatCurrency(adj.amount, currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[var(--color-on-surface)]">
                        {formatCurrency(adj.newBalance, currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onDeleteAdjustment(adj.id)}
                          className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-error)] rounded-full hover:bg-[var(--color-error-container)]/30 transition-colors"
                          title="Delete Adjustment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: Accounts List View (Table - Default) or Cards View */}
      {(activeTab === 'all' || activeTab === 'bank' || activeTab === 'cash') && !selectedAccountId && (
        filteredAccounts.length === 0 ? (
          <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] border border-[var(--color-outline-variant)] p-12 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-container)] text-[var(--color-outline)] flex items-center justify-center mx-auto">
              <Landmark className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[var(--color-on-surface)]">No accounts found</h3>
              <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto mt-1">
                Try adjusting your search criteria or create a new bank current account or cash register.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAccountFormData({
                  name: '',
                  type: 'bank',
                  bankName: '',
                  accountNumber: '',
                  ifscCode: '',
                  openingBalance: '',
                  asOfDate: new Date().toISOString().split('T')[0],
                  notes: '',
                });
                setIsAddAccountModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[var(--color-primary)] hover:opacity-95 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Account
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* TABULAR LIST VIEW (HORIZONTALLY SCROLLABLE LIKE INVENTORY) */
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[950px]">
                <thead>
                  <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Account Name & Category</th>
                    <th className="py-3.5 px-3">Bank Details</th>
                    <th className="py-3.5 px-3">Account / Reg #</th>
                    <th className="py-3.5 px-3">IFSC / Branch</th>
                    <th className="py-3.5 px-3 text-right">Opening Balance</th>
                    <th className="py-3.5 px-3 text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-outline-variant)]">
                  {filteredAccounts.map((acc) => {
                    return (
                      <tr
                        key={acc.id}
                        className="hover:bg-[var(--color-surface-container)]/60 transition-colors group cursor-pointer"
                        onClick={() => setSelectedAccountId(acc.id)}
                      >
                        {/* Account Name & Type */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                                acc.type === 'bank'
                                  ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                                  : 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]'
                              }`}
                            >
                              {acc.type === 'bank' ? <Landmark className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-[var(--color-on-surface)] group-hover:text-[var(--color-primary)] transition-colors">
                                  {acc.name}
                                </span>
                                {acc.isDefault && (
                                  <span className="font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border border-[var(--color-primary)]/20">
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-outline)] mt-0.5">
                                <span className="uppercase font-semibold tracking-wide">
                                  {acc.type === 'bank' ? 'Bank Account' : 'Cash Account'}
                                </span>
                                {acc.notes && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate max-w-[200px]">{acc.notes}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Bank Name */}
                        <td className="py-3 px-3">
                          {acc.type === 'bank' ? (
                            <span className="font-medium text-[var(--color-on-surface)]">
                              {acc.bankName || '—'}
                            </span>
                          ) : (
                            <span className="text-[var(--color-on-surface-variant)] text-[11px]">
                              Cash Drawer / Vault
                            </span>
                          )}
                        </td>

                        {/* Account Number */}
                        <td className="py-3 px-3 font-mono">
                          {acc.accountNumber ? (
                            <span className="text-[var(--color-on-surface)] font-medium">
                              {acc.accountNumber}
                            </span>
                          ) : (
                            <span className="text-[var(--color-outline)]">—</span>
                          )}
                        </td>

                        {/* IFSC Code */}
                        <td className="py-3 px-3 font-mono">
                          {acc.ifscCode ? (
                            <span className="text-[var(--color-on-surface-variant)] uppercase font-semibold">
                              {acc.ifscCode}
                            </span>
                          ) : (
                            <span className="text-[var(--color-outline)]">—</span>
                          )}
                        </td>

                        {/* Opening Balance */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-mono text-[var(--color-on-surface-variant)]">
                            {formatCurrency(acc.openingBalance, currencySymbol)}
                          </span>
                          <div className="text-[9px] text-[var(--color-outline)]">
                            as of {acc.asOfDate ? formatDate(acc.asOfDate) : 'Start'}
                          </div>
                        </td>

                        {/* Current Balance */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-bold text-sm text-[var(--color-on-surface)]">
                            {formatCurrency(acc.currentBalance, currencySymbol)}
                          </span>
                          <div className="text-[9px] font-semibold text-[var(--color-primary)]">
                            Available Liquid
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer with Summary Count */}
            <div className="p-3.5 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] flex items-center justify-between text-xs text-[var(--color-on-surface-variant)]">
              <span>Showing <strong>{filteredAccounts.length}</strong> accounts</span>
              <span className="font-mono">
                Total Listed Balance: <strong className="text-[var(--color-on-surface)]">{formatCurrency(filteredAccounts.reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0), currencySymbol)}</strong>
              </span>
            </div>
          </div>
        ) : (
          /* CARDS VIEW (ALTERNATIVE TOGGLE) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAccounts.map((acc) => (
              <div
                key={acc.id}
                className="p-5 rounded-[28px] bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                onClick={() => setSelectedAccountId(acc.id)}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          acc.type === 'bank'
                            ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                            : 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]'
                        }`}
                      >
                        {acc.type === 'bank' ? <Landmark className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[var(--color-on-surface)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-1">
                          {acc.name}
                        </h4>
                        <p className="text-[11px] text-[var(--color-on-surface-variant)] uppercase font-semibold">
                          {acc.type === 'bank' ? (acc.bankName || 'Bank Account') : 'Cash Account'}
                        </p>
                      </div>
                    </div>

                    {acc.isDefault && (
                      <span className="px-2 py-0.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-bold rounded-full border border-[var(--color-primary)]/20">
                        Default
                      </span>
                    )}
                  </div>

                  {/* Account Details if Bank */}
                  {acc.type === 'bank' && (
                    <div className="mt-4 pt-3 border-t border-[var(--color-outline-variant)]/60 text-xs space-y-1">
                      {acc.accountNumber && (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--color-on-surface-variant)]">A/C Number:</span>
                          <span className="font-mono font-bold text-[var(--color-on-surface)]">
                            •••• {acc.accountNumber.slice(-4)}
                          </span>
                        </div>
                      )}
                      {acc.ifscCode && (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--color-on-surface-variant)]">IFSC Code:</span>
                          <span className="font-mono text-[var(--color-on-surface)]">{acc.ifscCode}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes or cash detail */}
                  {acc.type === 'cash' && acc.notes && (
                    <div className="mt-4 pt-3 border-t border-[var(--color-outline-variant)]/60 text-[11px] text-[var(--color-on-surface-variant)] line-clamp-2">
                      {acc.notes}
                    </div>
                  )}
                </div>

                {/* Card Footer: Balance & Drilldown */}
                <div className="mt-5 pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--color-on-surface-variant)]">
                      Current Balance
                    </span>
                    <p className="text-xl font-black text-[var(--color-on-surface)] tracking-tight">
                      {formatCurrency(acc.currentBalance, currencySymbol)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAccountId(acc.id);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-primary)] hover:text-[var(--color-on-primary)] rounded-full text-xs font-bold text-[var(--color-on-surface)] transition-colors"
                  >
                    <span>Statement</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* VIEW: Specific Account Drilldown Ledger / Statement */}
      {selectedAccountId && selectedAccount && (
        <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs overflow-hidden space-y-4 p-5 sm:p-6">
          {/* Header of Account Detail */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-outline-variant)]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedAccountId(null)}
                className="p-2 bg-[var(--color-surface-container)] text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)]"
                title="Back to Accounts List"
              >
                <ArrowDownLeft className="w-4 h-4 rotate-45" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-[var(--color-on-surface)]">{selectedAccount.name}</h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      selectedAccount.type === 'bank'
                        ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                        : 'bg-[var(--color-tertiary-container)] text-[var(--color-on-tertiary-container)]'
                    }`}
                  >
                    {selectedAccount.type}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
                  Opening Balance: {formatCurrency(selectedAccount.openingBalance, currencySymbol)} as of {formatDate(selectedAccount.asOfDate)}
                  {selectedAccount.accountNumber && ` • A/C: ${selectedAccount.accountNumber}`}
                  {selectedAccount.ifscCode && ` • IFSC: ${selectedAccount.ifscCode}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[var(--color-on-surface-variant)]">
                  Available Balance
                </span>
                <p className="text-2xl font-black text-[var(--color-primary)]">
                  {formatCurrency(selectedAccount.currentBalance, currencySymbol)}
                </p>
              </div>

              <button
                onClick={() => openEditAccount(selectedAccount)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold border border-[var(--color-outline-variant)]"
                title="Edit account details"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>

              <button
                onClick={() => {
                  setAdjustmentFormData({
                    accountId: selectedAccount.id,
                    type: 'increase',
                    amount: '',
                    date: new Date().toISOString().split('T')[0],
                    reason: '',
                    referenceNumber: '',
                    notes: '',
                  });
                  setIsAdjustmentModalOpen(true);
                }}
                className="px-3.5 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-full text-xs font-bold border border-[var(--color-outline-variant)]"
              >
                Adjust
              </button>

              <button
                onClick={() => {
                  setTransferFormData({
                    fromAccountId: selectedAccount.id,
                    toAccountId: '',
                    amount: '',
                    date: new Date().toISOString().split('T')[0],
                    referenceNumber: '',
                    notes: '',
                  });
                  setIsTransferModalOpen(true);
                }}
                className="px-3.5 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-full text-xs font-bold shadow-xs"
              >
                Transfer
              </button>
            </div>
          </div>

          {/* Account Statement Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[820px]">
              <thead className="bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] uppercase tracking-wider text-[10px] font-bold border-b border-[var(--color-outline-variant)]">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Transaction / Party</th>
                  <th className="py-3 px-4">Ref / Voucher</th>
                  <th className="py-3 px-4 text-right">Amount (In/Out)</th>
                  <th className="py-3 px-4 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]">
                {accountLedger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[var(--color-on-surface-variant)]">
                      No transactions or transfers linked to this account yet.
                    </td>
                  </tr>
                ) : (
                  [...accountLedger]
                    .sort((a, b) => registeredAtTsOf(b) - registeredAtTsOf(a))
                    .map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--color-surface-container)]/50 transition-colors">
                      <td className="py-3 px-4 text-[var(--color-on-surface)] font-medium">
                        {formatDateTime(item.createdAt, 'dash')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-[var(--color-on-surface)]">{item.title}</div>
                        <div className="text-[11px] text-[var(--color-on-surface-variant)]">{item.description}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[var(--color-on-surface-variant)]">
                        {item.referenceNumber || '—'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold text-sm ${
                          item.moneyIn > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                        }`}
                      >
                        {item.moneyIn > 0
                          ? `+ ${formatCurrency(item.moneyIn, currencySymbol)}`
                          : `- ${formatCurrency(item.moneyOut, currencySymbol)}`}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          item.runningBalance >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                        }`}
                      >
                        {formatLedgerBalance(item.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
                {/* Opening Balance Row */}
                <tr className="bg-[var(--color-surface-container)]/40 font-semibold">
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 font-bold text-[var(--color-on-surface)]">
                      <Building2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      Opening Balance
                    </span>
                    <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                      {formatDateTime(selectedAccount.createdAt, 'dash')}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-[var(--color-on-surface-variant)]">
                    Initial balance registered ({selectedAccount.type === 'bank' ? 'Bank' : 'Cash'} account)
                  </td>
                  <td className="py-3 px-4 font-mono text-[var(--color-outline)]">—</td>
                  <td className="py-3 px-4 text-right font-mono text-[var(--color-surface-container-highest)]">—</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[var(--color-success)]">
                    {formatCurrency(selectedAccount.openingBalance, currencySymbol)}{' '}
                    <span className="text-[9px] uppercase font-normal">Dr</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD BANK / CASH ACCOUNT                                          */}
      {/* ========================================================================= */}
      {isAddAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-lg rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--color-on-surface)]">
                  {editingAccountId ? 'Edit Account' : `Add ${accountFormData.type === 'bank' ? 'Bank' : 'Cash'} Account`}
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)]">
                  {editingAccountId ? 'Update the account details below' : 'Configure account display name and opening balance'}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddAccountModalOpen(false);
                  setEditingAccountId(null);
                }}
                className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAccountSubmit} className="p-6 overflow-y-auto space-y-4">
              {formError && (
                <div className="p-3 bg-[var(--color-error-container)] text-[var(--color-on-error-container)] text-xs rounded-2xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Type Switcher (hidden in edit mode — category is fixed after creation) */}
              {!editingAccountId && (
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Account Category *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={!!editingAccountId}
                    title={editingAccountId ? 'Account category is fixed after creation.' : undefined}
                    onClick={() => setAccountFormData((prev) => ({ ...prev, type: 'bank' }))}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      accountFormData.type === 'bank'
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)]'
                        : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)]'
                    }`}
                  >
                    <Landmark className="w-4 h-4" />
                    Bank Account
                  </button>
                  <button
                    type="button"
                    disabled={!!editingAccountId}
                    title={editingAccountId ? 'Account category is fixed after creation.' : undefined}
                    onClick={() => setAccountFormData((prev) => ({ ...prev, type: 'cash' }))}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      accountFormData.type === 'cash'
                        ? 'bg-[var(--color-tertiary)] text-[var(--color-on-tertiary)] border-[var(--color-tertiary)]'
                        : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)]'
                    }`}
                  >
                    <Wallet className="w-4 h-4" />
                    Cash Account
                  </button>
                </div>
              </div>
              )}

              {/* Display Name */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  placeholder={accountFormData.type === 'bank' ? 'e.g. SBI Current A/c' : 'e.g. Plant Site Petty Cash'}
                  value={accountFormData.name}
                  onChange={(e) => setAccountFormData({ ...accountFormData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>

              {/* Bank-Specific Fields */}
              {accountFormData.type === 'bank' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. State Bank of India"
                      value={accountFormData.bankName}
                      onChange={(e) => setAccountFormData({ ...accountFormData, bankName: e.target.value })}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 394820194821"
                      value={accountFormData.accountNumber}
                      onChange={(e) => setAccountFormData({ ...accountFormData, accountNumber: e.target.value })}
                      className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                </div>
              )}

              {/* Opening Balance & As of Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    Opening Balance ({currencySymbol}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={accountFormData.openingBalance}
                    onChange={(e) => setAccountFormData({ ...accountFormData, openingBalance: e.target.value })}
                    disabled={!!editingAccountId}
                    title={editingAccountId ? 'Opening Balance is fixed after account creation.' : undefined}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-sm font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    As of Date *
                  </label>
                  <input
                    type="date"
                    value={accountFormData.asOfDate}
                    onChange={(e) => setAccountFormData({ ...accountFormData, asOfDate: e.target.value })}
                    disabled={!!editingAccountId}
                    title={editingAccountId ? 'As-of date is fixed after account creation.' : undefined}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                </div>
              </div>

              {/* Bank IFSC Code */}
              {accountFormData.type === 'bank' && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    IFSC / Branch Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SBIN0001824"
                    value={accountFormData.ifscCode}
                    onChange={(e) => setAccountFormData({ ...accountFormData, ifscCode: e.target.value })}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono uppercase text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Notes / Account Purpose
                </label>
                <input
                  type="text"
                  placeholder="e.g. Primary account for diesel fuel payments and client receipts"
                  value={accountFormData.notes}
                  onChange={(e) => setAccountFormData({ ...accountFormData, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddAccountModalOpen(false);
                    setEditingAccountId(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: TRANSFER FUNDS (CONTRA)                                          */}
      {/* ========================================================================= */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-lg rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--color-on-surface)]">
                  Internal Fund Transfer
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)]">Contra voucher between bank & cash accounts</p>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-6 overflow-y-auto space-y-4">
              {formError && (
                <div className="p-3 bg-[var(--color-error-container)] text-[var(--color-on-error-container)] text-xs rounded-2xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Source & Destination */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    From Account (Debit) *
                  </label>
                  <select
                    value={transferFormData.fromAccountId}
                    onChange={(e) => setTransferFormData({ ...transferFormData, fromAccountId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  >
                    <option value="">-- Select Source --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.type === 'bank' ? '🏦' : '💵'} {a.name} ({formatCurrency(a.currentBalance, currencySymbol)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    To Account (Credit) *
                  </label>
                  <select
                    value={transferFormData.toAccountId}
                    onChange={(e) => setTransferFormData({ ...transferFormData, toAccountId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  >
                    <option value="">-- Select Destination --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id} disabled={a.id === transferFormData.fromAccountId}>
                        {a.type === 'bank' ? '🏦' : '💵'} {a.name} ({formatCurrency(a.currentBalance, currencySymbol)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    Transfer Amount ({currencySymbol}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={transferFormData.amount}
                    onChange={(e) => setTransferFormData({ ...transferFormData, amount: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-sm font-bold text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    Transfer Date *
                  </label>
                  <input
                    type="date"
                    value={transferFormData.date}
                    onChange={(e) => setTransferFormData({ ...transferFormData, date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)]"
                    required
                  />
                </div>
              </div>

              {/* Reference / Cheque No */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Reference / Cheque / UTR No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. CHQ-99210 or UTR-SBI88219"
                  value={transferFormData.referenceNumber}
                  onChange={(e) => setTransferFormData({ ...transferFormData, referenceNumber: e.target.value })}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Transfer Remarks
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cash withdrawal from SBI for plant site driver daily diesel cash"
                  value={transferFormData.notes}
                  onChange={(e) => setTransferFormData({ ...transferFormData, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)]"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs"
                >
                  Execute Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADJUST ACCOUNT BALANCE                                          */}
      {/* ========================================================================= */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-lg rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--color-on-surface)]">
                  Adjust Account Balance
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)]">Add or reduce balance for physical cash/bank reconciliation</p>
              </div>
              <button
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="p-6 overflow-y-auto space-y-4">
              {formError && (
                <div className="p-3 bg-[var(--color-error-container)] text-[var(--color-on-error-container)] text-xs rounded-2xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Select Account */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Account to Adjust *
                </label>
                <select
                  value={adjustmentFormData.accountId}
                  onChange={(e) => setAdjustmentFormData({ ...adjustmentFormData, accountId: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                >
                  <option value="">-- Choose Account --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.type === 'bank' ? '🏦' : '💵'} {a.name} — Current: {formatCurrency(a.currentBalance, currencySymbol)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Type Switcher */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Adjustment Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAdjustmentFormData({ ...adjustmentFormData, type: 'increase' })}
                    className={`flex items-center justify-center gap-1.5 py-2 px-4 rounded-full border text-xs font-bold transition-all ${
                      adjustmentFormData.type === 'increase'
                        ? 'bg-[var(--color-success)] text-white border-[var(--color-success)]'
                        : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)]'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    + Increase Balance
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentFormData({ ...adjustmentFormData, type: 'decrease' })}
                    className={`flex items-center justify-center gap-1.5 py-2 px-4 rounded-full border text-xs font-bold transition-all ${
                      adjustmentFormData.type === 'decrease'
                        ? 'bg-[var(--color-error)] text-white border-[var(--color-error)]'
                        : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)]'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" />
                    - Reduce Balance
                  </button>
                </div>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    Adjustment Amount ({currencySymbol}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={adjustmentFormData.amount}
                    onChange={(e) => setAdjustmentFormData({ ...adjustmentFormData, amount: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-sm font-bold text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={adjustmentFormData.date}
                    onChange={(e) => setAdjustmentFormData({ ...adjustmentFormData, date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)]"
                    required
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Reason for Adjustment *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Month-end cash count physical difference reconciliation"
                  value={adjustmentFormData.reason}
                  onChange={(e) => setAdjustmentFormData({ ...adjustmentFormData, reason: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)]"
                  required
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
                  Reference Voucher / Slip
                </label>
                <input
                  type="text"
                  placeholder="e.g. REC-AUG-26"
                  value={adjustmentFormData.referenceNumber}
                  onChange={(e) => setAdjustmentFormData({ ...adjustmentFormData, referenceNumber: e.target.value })}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)]"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
