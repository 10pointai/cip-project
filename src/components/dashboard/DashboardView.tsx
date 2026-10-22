import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Users,
  PlusCircle,
  FileText,
  ChevronRight,
  Package,
  MessageSquare,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { Party, Transaction, CompanySettings } from '../../types';
import { formatCurrency, formatCompactCurrency } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { cloudStore } from '../../services/cloudStore';
import { Landmark, Truck, Clock3, AlertTriangle } from 'lucide-react';

interface DashboardViewProps {
  parties: Party[];
  transactions: Transaction[];
  settings: CompanySettings;
  onNavigateToParties: () => void;
  onOpenAddParty: () => void;
  onOpenPaymentModal: (type: 'payment_in' | 'payment_out') => void;
  onOpenVoucherModal: () => void;
  onSelectParty: (party: Party) => void;
}

export function DashboardView({
  parties,
  transactions,
  settings,
  onNavigateToParties,
  onOpenAddParty,
  onOpenPaymentModal,
  onOpenVoucherModal,
  onSelectParty,
}: DashboardViewProps) {
  const { hasPermission } = useAuth();
  const canViewFinancials = hasPermission('view_financial_metrics');
  const canManageParties = hasPermission('manage_parties');
  const canRecordPayments = hasPermission('record_payments');

  // Upcoming / overdue vehicle EMI debits raise two days before each due date
  const [emiAlerts, setEmiAlerts] = React.useState(() => cloudStore.getVehicleEmiAlerts());
  React.useEffect(() => {
    setEmiAlerts(cloudStore.getVehicleEmiAlerts());
    const unsubscribe = cloudStore.subscribe(() => setEmiAlerts(cloudStore.getVehicleEmiAlerts()));
    return () => unsubscribe();
  }, []);

  // Financial Calculations
  const receivables = parties.reduce((sum, p) => (p.currentBalance > 0 ? sum + p.currentBalance : sum), 0);
  const payables = parties.reduce((sum, p) => (p.currentBalance < 0 ? sum + Math.abs(p.currentBalance) : sum), 0);
  const netPosition = receivables - payables;

  const totalCustomers = parties.filter((p) => p.type === 'customer' || p.type === 'both').length;
  const totalVendors = parties.filter((p) => p.type === 'vendor' || p.type === 'both').length;
  const totalTransporters = parties.filter((p) => p.type === 'transporter').length;

  // Dynamic monthly Sales vs Purchase trend chart data derived from actual transactions
  const monthlyData = React.useMemo(() => {
    if (!transactions.length) return [];
    const map = new Map<string, { month: string; sales: number; procurement: number; sortKey: string }>();
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return;
      const monthKey = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(sortKey)) {
        map.set(sortKey, { month: monthKey, sales: 0, procurement: 0, sortKey });
      }
      const entry = map.get(sortKey)!;
      if (tx.type === 'sale_invoice') {
        entry.sales += tx.amount || 0;
      } else if (tx.type === 'purchase_bill') {
        entry.procurement += tx.amount || 0;
      }
    });
    return Array.from(map.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-6);
  }, [transactions]);

  // Dynamic material category allocation derived from transactions
  const categoryData = React.useMemo(() => {
    if (!transactions.length) return [];
    const palette = [
      'var(--color-primary)',
      'var(--color-success)',
      'var(--color-secondary)',
      'var(--color-error)',
      'var(--color-tertiary)',
    ];
    const catMap = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.type === 'purchase_bill') {
        const cat = tx.materialOrService || 'General Material';
        catMap.set(cat, (catMap.get(cat) || 0) + (tx.amount || 0));
      }
    });
    return Array.from(catMap.entries())
      .map(([name, value], i) => ({
        name,
        value,
        color: palette[i % palette.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [transactions]);

  // Top Receivables
  const topReceivables = [...parties]
    .filter((p) => p.currentBalance > 0)
    .sort((a, b) => b.currentBalance - a.currentBalance)
    .slice(0, 4);

  // Top Payables
  const topPayables = [...parties]
    .filter((p) => p.currentBalance < 0)
    .sort((a, b) => a.currentBalance - b.currentBalance)
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Top Welcome & Operations Overview Banner */}
      

      {/* Material 3 Color-Blocked Metric Cards */}
      {canViewFinancials ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Receivables - Success (green) Container */}
          <div className="p-5 bg-[var(--color-success-container)] rounded-[24px] border border-[var(--color-success)]/20 text-[var(--color-on-success-container)] shadow-2xs hover:shadow-md transition-all space-y-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                Total Client Receivables
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-success)] text-[var(--color-on-success)] flex items-center justify-center shadow-xs">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {formatCurrency(receivables, settings.currency.symbol)}
            </p>
            <div className="flex items-center justify-between text-xs opacity-90 pt-1.5 border-t border-[var(--color-success)]/15">
              <span className="font-bold">Dues to Collect</span>
            </div>
          </div>

          {/* Payables - Error (red) Container */}
          <div className="p-5 bg-[var(--color-error-container)] rounded-[24px] border border-[var(--color-error)]/20 text-[var(--color-on-error-container)] shadow-2xs hover:shadow-md transition-all space-y-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                Total Supplier Payables
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-error)] text-[var(--color-on-error)] flex items-center justify-center shadow-xs">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {formatCurrency(payables, settings.currency.symbol)}
            </p>
            <div className="flex items-center justify-between text-xs opacity-90 pt-1.5 border-t border-[var(--color-error)]/15">
              <span className="font-bold">Dues to Pay</span>
            </div>
          </div>

          {/* Net Working Position — tone follows the value: green surplus, red deficit */}
          <div className={`p-5 rounded-[24px] border shadow-2xs hover:shadow-md transition-all space-y-2 overflow-hidden ${
            netPosition >= 0
              ? 'bg-[var(--color-success-container)] border-[var(--color-success)]/20 text-[var(--color-on-success-container)]'
              : 'bg-[var(--color-error-container)] border-[var(--color-error)]/20 text-[var(--color-on-error-container)]'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                Net Working Position
              </span>
              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-xs ${
                netPosition >= 0
                  ? 'bg-[var(--color-success)] text-[var(--color-on-success)]'
                  : 'bg-[var(--color-error)] text-[var(--color-on-error)]'
              }`}>
                {netPosition >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {formatCurrency(netPosition, settings.currency.symbol)}
            </p>
            <div className={`flex items-center justify-between text-xs opacity-90 pt-1.5 border-t ${
              netPosition >= 0 ? 'border-[var(--color-success)]/15' : 'border-[var(--color-error)]/15'
            }`}>
              <span>Receivables vs Payables</span>
              <span className="font-bold">{netPosition >= 0 ? '+ Surplus' : '- Deficit'}</span>
            </div>
          </div>

          {/* Active Parties - Neutral Soft Surface Container */}
          <div className="p-5 bg-[var(--color-surface-container)] rounded-[24px] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] shadow-2xs hover:shadow-md transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Total Business Directory
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shadow-xs">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">{parties.length} Parties</p>
            <div className="flex items-center justify-between text-xs text-[var(--color-on-surface-variant)] pt-1.5 border-t border-[var(--color-outline-variant)]">
              
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 bg-[var(--color-surface-container)] rounded-[24px] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] shadow-2xs hover:shadow-md transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Total Business Directory
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shadow-xs">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">{parties.length} Parties</p>
            <div className="flex items-center justify-between text-xs text-[var(--color-on-surface-variant)] pt-1.5 border-t border-[var(--color-outline-variant)]">
             
            </div>
          </div>
        </div>
      )}

      

      {/* Actionable Tables: Top Receivables & Payables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Receivables (Clients who owe us) */}
        <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--color-on-surface)] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] shrink-0"></span>
                <span className="truncate">Top Receivables (Clients)</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-[var(--color-on-surface-variant)] line-clamp-1">Immediate follow-up list for road construction clients</p>
            </div>
            <button
              onClick={onNavigateToParties}
              className="text-xs font-semibold text-[var(--color-primary)] hover:opacity-80 flex items-center gap-1 shrink-0"
            >
              View All
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {topReceivables.length === 0 ? (
              <div className="py-8 text-center space-y-1.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] px-4">
                <p className="text-xs font-bold text-[var(--color-on-surface)]">No Outstanding Customer Dues</p>
                <p className="text-[11px] text-[var(--color-on-surface-variant)]">All customer accounts are clear or no customers have been registered yet.</p>
              </div>
            ) : (
              topReceivables.map((party) => {
                const cleanPhone = party.phone.replace(/[^0-9]/g, '');
                return (
                  <div
                    key={party.id}
                    className="p-3 sm:p-3.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] rounded-2xl border border-[var(--color-outline-variant)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p
                        onClick={() => onSelectParty(party)}
                        className="text-xs font-bold text-[var(--color-on-surface)] hover:text-[var(--color-primary)] cursor-pointer truncate"
                      >
                        {party.name}
                      </p>
                      <p className="text-[11px] text-[var(--color-on-surface-variant)] truncate">
                        {party.contactPerson || 'Account'} • {party.paymentTermsDays} Days Terms
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 shrink-0 pt-1.5 sm:pt-0 border-t border-[var(--color-outline-variant)]/60 sm:border-0">
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-black text-[var(--color-on-surface)]">
                          {formatCurrency(party.currentBalance, settings.currency.symbol)}
                        </p>
                        <span className="text-[10px] font-semibold text-[var(--color-on-primary-container)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full inline-block">
                          Receivable
                        </span>
                      </div>

                      {cleanPhone && (
                        <div className="flex items-center gap-1">
                          <a
                            href={`https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(
                              party.contactPerson || party.name
                            )},%20gentle%20reminder%20regarding%20payment%20statement.`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 bg-[var(--color-success-container)] hover:opacity-90 text-[var(--color-on-success-container)] rounded-full transition-colors shrink-0"
                            title="WhatsApp Reminder"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top Payables (Suppliers we need to pay) */}
        <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--color-on-surface)] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-error)] shrink-0"></span>
                <span className="truncate">Top Payables (Suppliers)</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-[var(--color-on-surface-variant)] line-clamp-1">Bitumen refineries, quarry crushers & diesel payments</p>
            </div>
            <button
              onClick={onNavigateToParties}
              className="text-xs font-semibold text-[var(--color-primary)] hover:opacity-80 flex items-center gap-1 shrink-0"
            >
              View All
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {topPayables.length === 0 ? (
              <div className="py-8 text-center space-y-1.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] px-4">
                <p className="text-xs font-bold text-[var(--color-on-surface)]">No Outstanding Supplier Payables</p>
                <p className="text-[11px] text-[var(--color-on-surface-variant)]">All supplier accounts are clear or no vendors have been registered yet.</p>
              </div>
            ) : (
              topPayables.map((party) => (
                <div
                  key={party.id}
                  className="p-3 sm:p-3.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] rounded-2xl border border-[var(--color-outline-variant)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p
                      onClick={() => onSelectParty(party)}
                      className="text-xs font-bold text-[var(--color-on-surface)] hover:text-[var(--color-primary)] cursor-pointer truncate"
                    >
                      {party.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-on-surface-variant)] truncate">
                      {party.category || 'Vendor'} • {party.paymentTermsDays} Days Terms
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 shrink-0 pt-1.5 sm:pt-0 border-t border-[var(--color-outline-variant)]/60 sm:border-0">
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-black text-[var(--color-error)]">
                        {formatCurrency(Math.abs(party.currentBalance), settings.currency.symbol)}
                      </p>
                      <span className="text-[10px] font-semibold text-[var(--color-on-error-container)] bg-[var(--color-error-container)] px-2 py-0.5 rounded-full inline-block">
                        Payable
                      </span>
                    </div>

                    <button
                      onClick={() => onSelectParty(party)}
                      className="px-3 py-1.5 bg-[var(--color-error-container)] hover:opacity-90 text-[var(--color-on-error-container)] font-semibold rounded-full text-xs transition-colors shrink-0"
                    >
                      Pay
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Vehicle EMI — Upcoming & Overdue Deductions (raised 2 days before each due date) */}
      <div className="bg-[var(--color-surface-container-lowest)] p-4 sm:p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[var(--color-on-surface)] flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${emiAlerts.some((a) => a.shortOfFunds) ? 'bg-[var(--color-error)]' : 'bg-[var(--color-warning)]'}`}></span>
              <span className="truncate">Vehicle EMI — Upcoming Debits</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-[var(--color-on-surface-variant)] line-clamp-1">
              Auto-deducted from the linked bank account on the due date (alert fires 2 days early)
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {emiAlerts.length === 0 ? (
            <div className="py-8 text-center space-y-1.5 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] px-4">
              <Landmark className="w-6 h-6 mx-auto text-[var(--color-outline)]" />
              <p className="text-xs font-bold text-[var(--color-on-surface)]">No EMI Deductions This Window</p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                Next vehicle EMI alert will appear here 2 days before its due date.
              </p>
            </div>
          ) : (
            emiAlerts.map((a) => (
              <div
                key={`${a.vehicleId}-${a.dueDate}`}
                className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                  a.shortOfFunds
                    ? 'bg-[var(--color-error-container)]/40 border-[var(--color-error)]/25'
                    : a.daysUntil <= 0
                      ? 'bg-[var(--color-warning-container)]/25 border-[var(--color-warning)]/25'
                      : 'bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] border-[var(--color-outline-variant)]'
                }`}
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Truck className="w-3.5 h-3.5 text-[var(--color-outline)] shrink-0" />
                    <span className="text-xs font-black font-mono text-[var(--color-on-surface)]">{a.vehicleNo}</span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                      a.shortOfFunds
                        ? 'bg-[var(--color-error)] text-[var(--color-on-error)] animate-pulse'
                        : a.daysUntil <= 1
                          ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                          : 'bg-[var(--color-info-container)] text-[var(--color-on-info-container)]'
                    }`}>
                      {a.shortOfFunds
                        ? '⚠ Account Short of EMI Funds'
                        : a.daysUntil <= 0 ? `Overdue ${Math.abs(a.daysUntil)} day(s)` : a.daysUntil === 1 ? 'Due Tomorrow' : 'Due in 2 Days'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] truncate flex items-center gap-1">
                    <Landmark className="w-3 h-3 shrink-0" />
                    {a.accountName} • EMI date {a.dueDate}
                  </p>
                  {a.shortOfFunds && (
                    <p className="text-[10px] font-bold text-[var(--color-on-surface-variant)]">
                    ⚠ {a.accountName} balance ₹{a.accountBalance.toLocaleString('en-IN')} is short of the ₹{a.amount.toLocaleString('en-IN')} EMI required.
                    </p>
                  )}
                </div>

                <div className="text-left sm:text-right pt-1.5 sm:pt-0 border-t border-[var(--color-outline-variant)]/60 sm:border-0">
                  <p className="text-xs font-black text-[var(--color-on-surface)]">₹{a.amount.toLocaleString('en-IN')}</p>
                  {a.shortOfFunds ? (
                    <span className="text-[10px] font-black text-[var(--color-on-surface-variant)] bg-[var(--color-error-container)] px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5" /> Cannot deduct — top up account
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-[var(--color-on-warning-container)] bg-[var(--color-warning-container)] px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Clock3 className="w-2.5 h-2.5" /> Auto-deduct scheduled
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
