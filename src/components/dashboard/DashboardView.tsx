import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
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
      <div className="bg-[var(--color-primary)] rounded-[28px] p-6 sm:p-8 text-[var(--color-on-primary)] shadow-sm relative overflow-hidden border border-[var(--color-outline-variant)]">
        {/* Subtle decorative glow */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-[var(--color-on-primary)]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-[var(--color-success-container)] text-[var(--color-on-success-container)] border border-[var(--color-success)]/30 rounded-full text-xs font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse"></span>
                System Online
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--color-on-primary)]">
              {settings.companyName}
            </h1>
          </div>

          {/* Quick Action FABs */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canManageParties && (
              <button
                onClick={onOpenAddParty}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] hover:bg-[var(--color-surface-container)] font-semibold text-xs rounded-full shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <PlusCircle className="w-4 h-4" />
                Add Party
              </button>
            )}
            {canRecordPayments && (
              <>
                <button
                  onClick={() => onOpenPaymentModal('payment_in')}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--color-success)] hover:opacity-90 text-[var(--color-on-success)] font-semibold text-xs rounded-full shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  Record Receipt (In)
                </button>
                <button
                  onClick={() => onOpenPaymentModal('payment_out')}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--color-error)] hover:opacity-90 text-[var(--color-on-error)] font-semibold text-xs rounded-full shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Record Payment (Out)
                </button>
              </>
            )}
            {canManageParties && (
              <button
                onClick={onOpenVoucherModal}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white font-semibold text-xs rounded-full backdrop-blur-sm transition-colors border border-white/20"
              >
                <FileText className="w-4 h-4" />
                New Voucher
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Material 3 Color-Blocked Metric Cards */}
      {canViewFinancials ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Receivables - Soft Blue Container */}
          <div className="p-5 bg-[var(--color-primary-container)] rounded-[24px] border border-[var(--color-primary)]/20 text-[var(--color-on-primary-container)] shadow-2xs hover:shadow-md transition-all space-y-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                Total Client Receivables
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shadow-xs">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {formatCurrency(receivables, settings.currency.symbol)}
            </p>
            <div className="flex items-center justify-between text-xs opacity-90 pt-1.5 border-t border-[var(--color-primary)]/15">
              <span>{totalCustomers} Customer Accounts</span>
              <span className="font-bold">Dues to Collect</span>
            </div>
          </div>

          {/* Payables - Soft Secondary Container */}
          <div className="p-5 bg-[var(--color-secondary-container)] rounded-[24px] border border-[var(--color-secondary)]/20 text-[var(--color-on-secondary-container)] shadow-2xs hover:shadow-md transition-all space-y-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                Total Supplier Payables
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-secondary)] text-[var(--color-on-secondary)] flex items-center justify-center shadow-xs">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {formatCurrency(payables, settings.currency.symbol)}
            </p>
            <div className="flex items-center justify-between text-xs opacity-90 pt-1.5 border-t border-[var(--color-secondary)]/15">
              <span>{totalVendors} Supplier Accounts</span>
              <span className="font-bold">Dues to Pay</span>
            </div>
          </div>

          {/* Net Working Position - Soft Success Container */}
          <div className="p-5 bg-[var(--color-success-container)] rounded-[24px] border border-[var(--color-success)]/20 text-[var(--color-on-success-container)] shadow-2xs hover:shadow-md transition-all space-y-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                Net Working Position
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-success)] text-[var(--color-on-success)] flex items-center justify-center shadow-xs">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {formatCurrency(netPosition, settings.currency.symbol)}
            </p>
            <div className="flex items-center justify-between text-xs opacity-90 pt-1.5 border-t border-[var(--color-success)]/15">
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
              <span>{totalCustomers} Clients</span>
              <span>{totalVendors} Suppliers • {totalTransporters} Haulers</span>
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
              <span>{totalCustomers} Clients</span>
              <span>{totalVendors} Suppliers • {totalTransporters} Haulers</span>
            </div>
          </div>
        </div>
      )}

      {/* Visual Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Flow / Sales vs Procurement Bar Chart (2 columns) */}
        <div className="lg:col-span-2 bg-[var(--color-surface-container-lowest)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[var(--color-on-surface)]">Commercial Billing & Procurement Trend</h2>
              <p className="text-xs text-[var(--color-on-surface-variant)]">Monthly asphalt mix dispatches vs raw material intake (INR ₹)</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-[var(--color-primary)]">
                <span className="w-3 h-3 rounded-full bg-[var(--color-primary)] inline-block"></span> Material Sales
              </span>
              <span className="flex items-center gap-1.5 text-[var(--color-secondary)]">
                <span className="w-3 h-3 rounded-full bg-[var(--color-secondary)] inline-block"></span> Raw Materials (Procurement)
              </span>
            </div>
          </div>

          {monthlyData.length === 0 ? (
            <div className="h-72 w-full flex flex-col items-center justify-center space-y-2 border border-dashed border-[var(--color-outline-variant)] rounded-2xl p-6 text-center">
              <TrendingUp className="w-8 h-8 text-[var(--color-outline)]" />
              <p className="text-xs font-bold text-[var(--color-on-surface)]">No Commercial Transactions Logged</p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] max-w-sm">
                As you create sales invoices and purchase bills in the cloud database, monthly billing and procurement trends will render here in real time.
              </p>
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-outline-variant)" opacity={0.5} />
                  <XAxis dataKey="month" stroke="var(--color-outline)" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="var(--color-outline)"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => formatCompactCurrency(val, '₹')}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatCurrency(val, '₹'), '']}
                    contentStyle={{
                      backgroundColor: 'var(--color-inverse-surface)',
                      borderRadius: '16px',
                      color: 'var(--color-inverse-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                      fontSize: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    }}
                  />
                  <Bar dataKey="sales" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Material Sales" />
                  <Bar dataKey="procurement" fill="var(--color-secondary)" radius={[6, 6, 0, 0]} name="Raw Material Procurement" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Material Category Distribution Donut Chart (1 column) */}
        <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--color-on-surface)]">Procurement by Material</h2>
            <p className="text-xs text-[var(--color-on-surface-variant)]">Distribution of bitumen, aggregates, fuel & logistics</p>
          </div>

          {categoryData.length === 0 ? (
            <div className="h-52 w-full flex flex-col items-center justify-center space-y-2 border border-dashed border-[var(--color-outline-variant)] rounded-2xl p-4 text-center">
              <Package className="w-8 h-8 text-[var(--color-outline)]" />
              <p className="text-xs font-bold text-[var(--color-on-surface)]">No Procurement Logged</p>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] max-w-xs">
                Material expense distribution will appear as supplier purchase vouchers are entered.
              </p>
            </div>
          ) : (
            <>
              <div className="h-52 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [formatCurrency(val, '₹'), '']}
                      contentStyle={{
                        backgroundColor: 'var(--color-inverse-surface)',
                        borderRadius: '16px',
                        color: 'var(--color-inverse-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[var(--color-outline-variant)] text-xs">
                {categoryData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[var(--color-on-surface-variant)] truncate max-w-[170px]">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                      {item.name}
                    </span>
                    <span className="font-bold text-[var(--color-on-surface)]">{formatCompactCurrency(item.value, '₹')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

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
    </div>
  );
}
