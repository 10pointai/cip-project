import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Building2,
  Calendar,
  CreditCard,
  Printer,
  ArrowDownLeft,
  ArrowUpRight,
  Edit2,
  FileText,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  Receipt,
  User,
  ExternalLink,
  ChevronRight,
  Sparkles,
  FolderOpen,
  Paperclip,
} from 'lucide-react';
import { Party, Transaction, CompanySettings, Order } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PrintStatementModal } from '../common/PrintStatementModal';
import { EvidenceManager } from '../evidence/EvidenceManager';
import { useAuth } from '../../context/AuthContext';
import { cloudStore as localDb } from '../../services/cloudStore';

interface PartyDetailViewProps {
  party: Party;
  transactions: Transaction[];
  orders?: Order[];
  settings: CompanySettings;
  onBack: () => void;
  onEdit: (party: Party) => void;
  onRecordPayment: (partyId: string, type: 'payment_in' | 'payment_out') => void;
}

export function PartyDetailView({
  party,
  transactions,
  orders,
  settings,
  onBack,
  onEdit,
  onRecordPayment,
}: PartyDetailViewProps) {
  const { hasPermission } = useAuth();
  const canManageParties = hasPermission('manage_parties');
  const canRecordPayments = hasPermission('record_payments');

  const currencySymbol = settings.currency.symbol;
  const [activeMainTab, setActiveMainTab] = useState<'ledger' | 'evidence'>('ledger');
  const [filterType, setFilterType] = useState<string>('all');
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  // All unified ledger transactions & orders for this party
  const partyTxs = useMemo(() => {
    const rawTxList = transactions.filter((t) => t.partyId === party.id);
    
    // Convert Party Orders to unified ledger items
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

    return [...rawTxList, ...orderTxItems];
  }, [transactions, orders, party.id, party.type]);

  // Filtered transactions based on filter tabs & search query
  const filteredTxs = useMemo(() => {
    return partyTxs
      .filter((t) => {
        if (filterType === 'all') return true;
        if (filterType === 'sale_invoice') return t.type === 'sale_invoice';
        if (filterType === 'purchase_bill') return t.type === 'purchase_bill';
        if (filterType === 'payment_in') return t.type === 'payment_in';
        if (filterType === 'payment_out') return t.type === 'payment_out';
        if (filterType === 'pending') return t.status === 'pending';
        return true;
      })
      .filter((t) => {
        if (!ledgerSearchQuery.trim()) return true;
        const q = ledgerSearchQuery.toLowerCase();
        return (
          t.voucherNumber.toLowerCase().includes(q) ||
          (t.materialOrService && t.materialOrService.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.referenceNumber && t.referenceNumber.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [partyTxs, filterType, ledgerSearchQuery]);

  // Clean WhatsApp phone number
  const cleanPhone = party.phone ? party.phone.replace(/[^0-9]/g, '') : '';
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(
    party.contactPerson || party.name
  )},%20regarding%20our%20account%20statement%20with%20${encodeURIComponent(settings.companyName)}:`;

  const isReceivable = party.currentBalance > 0;
  const isPayable = party.currentBalance < 0;
  const isSettled = party.currentBalance === 0;

  const creditUsedPct =
    party.creditLimit > 0
      ? Math.min(100, Math.round((Math.abs(party.currentBalance) / party.creditLimit) * 100))
      : 0;

  // Cumulative financial stats
  const totalSalesBilled = useMemo(() => {
    return partyTxs
      .filter((t) => t.type === 'sale_invoice')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [partyTxs]);

  const totalPurchasesBilled = useMemo(() => {
    return partyTxs
      .filter((t) => t.type === 'purchase_bill')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [partyTxs]);

  const totalPaymentsReceived = useMemo(() => {
    return partyTxs
      .filter((t) => t.type === 'payment_in')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [partyTxs]);

  const totalPaymentsMade = useMemo(() => {
    return partyTxs
      .filter((t) => t.type === 'payment_out')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [partyTxs]);

  // Calculate Running Balances chronologically (oldest to newest)
  const chronologicalLedger = useMemo(() => {
    const sortedAsc = [...partyTxs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let runningBal = party.openingBalanceType === 'to_receive' ? party.openingBalance : -party.openingBalance;

    const calculated = sortedAsc.map((tx) => {
      let debit = 0;
      let credit = 0;
      const amt = Number(tx.amount) || 0;

      if (tx.type === 'sale_invoice' || tx.type === 'payment_out' || tx.type === 'debit_note') {
        debit = amt;
        runningBal += amt;
      } else {
        credit = amt;
        runningBal -= amt;
      }

      return {
        ...tx,
        debit,
        credit,
        runningBalance: runningBal,
      };
    });

    // Return mapped lookup dictionary for quick runningBalance access by id
    const lookup: Record<string, { debit: number; credit: number; runningBalance: number }> = {};
    calculated.forEach((item) => {
      lookup[item.id] = {
        debit: item.debit,
        credit: item.credit,
        runningBalance: item.runningBalance,
      };
    });
    return lookup;
  }, [partyTxs, party.openingBalance, party.openingBalanceType]);

  // Export Party Ledger to CSV
  const handleExportLedgerCSV = () => {
    const headers = ['Date', 'Voucher Number', 'Type', 'Description / Material', 'Ref Number', 'Debit', 'Credit', 'Running Balance', 'Status'];
    
    // Sort oldest first for readable export
    const sortedForExport = [...partyTxs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let currentExportBal = party.openingBalanceType === 'to_receive' ? party.openingBalance : -party.openingBalance;

    const rows = [
      [
        `"${formatDate(party.createdAt)}"`,
        '"OPENING"',
        '"Opening Balance"',
        `"Initial balance (${party.openingBalanceType === 'to_receive' ? 'Receivable' : 'Payable'})"`,
        '""',
        party.openingBalanceType === 'to_receive' ? party.openingBalance : 0,
        party.openingBalanceType === 'to_pay' ? party.openingBalance : 0,
        currentExportBal,
        '"Initial"',
      ],
      ...sortedForExport.map((t) => {
        const amt = Number(t.amount) || 0;
        let d = 0;
        let c = 0;
        if (t.type === 'sale_invoice' || t.type === 'payment_out') {
          d = amt;
          currentExportBal += amt;
        } else {
          c = amt;
          currentExportBal -= amt;
        }
        return [
          `"${formatDate(t.date)}"`,
          `"${t.voucherNumber}"`,
          `"${t.type.replace('_', ' ').toUpperCase()}"`,
          `"${(t.materialOrService || t.description || '').replace(/"/g, '""')}"`,
          `"${t.referenceNumber || ''}"`,
          d,
          c,
          currentExportBal,
          `"${t.status}"`,
        ];
      }),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ledger_${party.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. TOP NAVIGATION & BREADCRUMB HEADER                                    */}
      {/* ========================================================================= */}
      <div className="bg-[var(--color-surface-container-lowest)] rounded-[24px] border border-[var(--color-outline-variant)] p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 p-2.5 rounded-full bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] transition-all flex items-center justify-center border border-[var(--color-outline-variant)] shadow-2xs hover:scale-105 active:scale-95 shrink-0"
            title="Back to Parties Directory"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-outline)] mb-1">
              <button
                type="button"
                onClick={onBack}
                className="hover:text-[var(--color-primary)] transition-colors"
              >
                Parties
              </button>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[var(--color-on-surface-variant)]">{party.category}</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[var(--color-primary)] font-bold truncate max-w-[200px]">
                {party.name}
              </span>
            </div>

            {/* Title & Tags */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--color-on-surface)] tracking-tight">
                {party.name}
              </h1>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]">
                {party.category}
              </span>
            </div>

            {party.tradeName && (
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-1 font-medium flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-[var(--color-outline)]" />
                <span>Trade Site / Brand: <strong>{party.tradeName}</strong></span>
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsPrintOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold shadow-2xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Print Statement</span>
          </button>

          <button
            type="button"
            onClick={handleExportLedgerCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full text-xs font-semibold shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
            <span>Export CSV</span>
          </button>

          {canManageParties && (
            <>
              <button
                type="button"
                onClick={() => onEdit(party)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary-container)] hover:opacity-90 text-[var(--color-on-primary-container)] border border-[var(--color-primary)]/20 rounded-full text-xs font-bold shadow-2xs transition-all"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>

            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. PROFILE, CONTACT & REGISTRATION RIBBON                                  */}
      {/* ========================================================================= */}
      <div className="bg-[var(--color-surface-container-lowest)] rounded-[24px] border border-[var(--color-outline-variant)] p-4 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          {party.phone && (
            <a
              href={`tel:${party.phone}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full font-semibold transition-colors shadow-2xs"
            >
              <Phone className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Call: {party.phone}</span>
            </a>
          )}

          {cleanPhone && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-success-container)] text-[var(--color-on-success-container)] hover:opacity-90 border border-[var(--color-success)]/30 rounded-full font-bold transition-all shadow-2xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>WhatsApp Statement</span>
            </a>
          )}

          {party.email && (
            <a
              href={`mailto:${party.email}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] rounded-full font-medium transition-colors shadow-2xs"
            >
              <Mail className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
              <span>{party.email}</span>
            </a>
          )}

          <div className="flex items-center gap-1 text-[var(--color-on-surface-variant)] px-2">
            <User className="w-3.5 h-3.5 text-[var(--color-outline)]" />
            <span>Contact: <strong>{party.contactPerson || 'Direct'}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-[var(--color-on-surface-variant)]">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[var(--color-outline)] shrink-0" />
            <span>
              {party.address.street ? `${party.address.street}, ` : ''}
              {party.address.city}, {party.address.state} {party.address.pincode ? `- ${party.address.pincode}` : ''}
            </span>
          </div>

          {party.gstin && (
            <div className="flex items-center gap-1 bg-[var(--color-surface-container)] px-2.5 py-1 rounded-full border border-[var(--color-outline-variant)]">
              <span className="text-[10px] text-[var(--color-outline)] font-bold uppercase">GST:</span>
              <span className="font-mono font-bold text-[var(--color-on-surface)]">{party.gstin}</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. FINANCIAL KPI STATS CARDS                                              */}
      {/* ========================================================================= */}
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
              {formatCurrency(totalSalesBilled + totalPurchasesBilled, currencySymbol)}
            </p>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              {party.type === 'customer'
                ? `Total ${formatCurrency(totalSalesBilled, currencySymbol)} sales dispatched`
                : party.type === 'vendor'
                ? `Total ${formatCurrency(totalPurchasesBilled, currencySymbol)} supplies received`
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
              {formatCurrency(totalPaymentsReceived + totalPaymentsMade, currencySymbol)}
            </p>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Across {partyTxs.filter((t) => t.type === 'payment_in' || t.type === 'payment_out').length} payment vouchers
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. QUICK ACTION BAR FOR RECORDING VOUCHERS & PAYMENTS                      */}
      {/* ========================================================================= */}
      {(canRecordPayments || canManageParties) && (
        <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
              Quick Actions for {party.name}
            </h3>
            <p className="text-xs text-[var(--color-on-surface-variant)]">
              Record direct collections, disbursement vouchers, or sales/purchase invoices
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canRecordPayments && (
              <button
                type="button"
                onClick={() => onRecordPayment(party.id, party.type === 'customer' ? 'payment_in' : 'payment_out')}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all hover:scale-[1.01] active:scale-[0.99]"
                title="Record a payment for this party — switch between Received / Paid in the modal"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MAIN TAB SELECTOR (LEDGER vs EVIDENCE VAULT)                           */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 border-b border-[var(--color-outline-variant)] pb-1">
        <button
          type="button"
          onClick={() => setActiveMainTab('ledger')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all ${
            activeMainTab === 'ledger'
              ? 'bg-[var(--color-primary)] text-white shadow-xs'
              : 'bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Statement of Account & Ledger ({partyTxs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('evidence')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all ${
            activeMainTab === 'evidence'
              ? 'bg-[var(--color-primary)] text-white shadow-xs'
              : 'bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Documents & Evidence Vault (📁)</span>
        </button>
      </div>

      {activeMainTab === 'ledger' ? (
        /* STATEMENT OF ACCOUNT / TRANSACTION LEDGER TABLE (HORIZONTALLY SCROLLABLE) */
        <div className="bg-[var(--color-surface-container-lowest)] rounded-[24px] border border-[var(--color-outline-variant)] shadow-xs overflow-hidden space-y-3">
        {/* Table Header Controls */}
        <div className="p-4 border-b border-[var(--color-outline-variant)] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
              Statement of Account & Ledger
            </h3>
            <p className="text-xs text-[var(--color-on-surface-variant)]">
              Chronological log of dispatches, procurement, receipts, and payments
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search inside ledger */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-[var(--color-outline)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search voucher #, material, ref..."
                value={ledgerSearchQuery}
                onChange={(e) => setLedgerSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-[var(--color-surface-container)] p-0.5 rounded-full border border-[var(--color-outline-variant)] text-xs overflow-x-auto">
              {[
                { id: 'all', label: 'All Logs' },
                { id: 'sale_invoice', label: 'Sale Invoices' },
                { id: 'purchase_bill', label: 'Purchase Bills' },
                { id: 'payment_in', label: 'Receipts In' },
                { id: 'payment_out', label: 'Payments Out' },
                { id: 'pending', label: 'Pending Dues' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-1 rounded-full font-semibold transition-colors whitespace-nowrap ${
                    filterType === tab.id
                      ? 'bg-[var(--color-surface-container-lowest)] text-[var(--color-primary)] shadow-xs'
                      : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[950px]">
            <thead>
              <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-3">Voucher #</th>
                <th className="py-3 px-3">Transaction Type</th>
                <th className="py-3 px-3">Material / Service / Details</th>
                <th className="py-3 px-3">Reference / Cheque</th>
                <th className="py-3 px-3 text-right text-[var(--color-primary)]">Debit (Dr / Sales / Out)</th>
                <th className="py-3 px-3 text-right text-[var(--color-success)]">Credit (Cr / Receipt / In)</th>
                <th className="py-3 px-3 text-right">Running Balance</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]">
              {/* Opening Balance Row */}
              <tr className="bg-[var(--color-surface-container)]/40 font-semibold">
                <td className="py-3 px-4 text-[var(--color-on-surface)]">
                  {formatDate(party.createdAt)}
                </td>
                <td className="py-3 px-3 font-mono font-bold text-[var(--color-on-surface-variant)]">
                  OPENING
                </td>
                <td className="py-3 px-3">
                  <span className="inline-flex items-center gap-1 font-bold text-[var(--color-on-surface)]">
                    <Building2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    Opening Balance
                  </span>
                </td>
                <td className="py-3 px-3 text-[var(--color-on-surface-variant)]">
                  Initial balance registered ({party.openingBalanceType === 'to_receive' ? 'Receivable from Party' : 'Payable to Party'})
                </td>
                <td className="py-3 px-3 font-mono text-[var(--color-outline)]">—</td>
                <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-primary)]">
                  {party.openingBalanceType === 'to_receive' ? formatCurrency(party.openingBalance, currencySymbol) : '—'}
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-success)]">
                  {party.openingBalanceType === 'to_pay' ? formatCurrency(party.openingBalance, currencySymbol) : '—'}
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-on-surface)]">
                  {formatCurrency(party.openingBalance, currencySymbol)} {party.openingBalanceType === 'to_receive' ? 'Dr' : 'Cr'}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                    Initial
                  </span>
                </td>
              </tr>

              {/* Transactions List */}
              {filteredTxs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-xs text-[var(--color-on-surface-variant)] italic">
                    No transactions found matching your search or active filter.
                  </td>
                </tr>
              ) : (
                filteredTxs.map((tx) => {
                  const runningData = chronologicalLedger[tx.id] || { debit: 0, credit: 0, runningBalance: 0 };
                  const isDebit = tx.type === 'sale_invoice' || tx.type === 'payment_out';

                  return (
                    <tr key={tx.id} className="hover:bg-[var(--color-surface-container)]/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-[var(--color-on-surface)] font-medium">
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-[var(--color-on-surface)]">
                        {tx.voucherNumber}
                      </td>
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
                        <p className="font-medium truncate">{tx.materialOrService || tx.description || '—'}</p>
                      </td>
                      <td className="py-3 px-3 font-mono text-[var(--color-on-surface-variant)]">
                        {tx.referenceNumber || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-primary)]">
                        {isDebit ? formatCurrency(tx.amount, currencySymbol) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-success)]">
                        {!isDebit ? formatCurrency(tx.amount, currencySymbol) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[var(--color-on-surface)]">
                        {formatCurrency(Math.abs(runningData.runningBalance), currencySymbol)}{' '}
                        <span className="text-[9px] uppercase font-normal">
                          {runningData.runningBalance > 0 ? 'Dr' : runningData.runningBalance < 0 ? 'Cr' : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Site Notes & Additional Meta */}
        {party.notes && (
          <div className="p-4 bg-[var(--color-surface-container)] border-t border-[var(--color-outline-variant)] text-xs text-[var(--color-on-surface-variant)]">
            <span className="font-bold text-[var(--color-on-surface)]">Site Instructions & Plant Notes: </span>
            {party.notes}
          </div>
        )}
      </div>
      ) : (
        /* EVIDENCE & DOCUMENTS VAULT TAB */
        <EvidenceManager
          initialEntityType="party"
          initialEntityId={party.id}
          initialEntityName={party.name}
          title={`Evidence & Files Vault: ${party.name}`}
          isEmbedded={true}
        />
      )}

      {/* Printable Statement Modal */}
      <PrintStatementModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        party={party}
        transactions={partyTxs}
        settings={settings}
      />
    </div>
  );
}
