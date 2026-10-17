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
import { Party, Transaction, CompanySettings, CashBankAccount, Sale, Purchase } from '../../types';
import { formatDate } from '../../utils/formatters';
import { PrintStatementModal } from '../common/PrintStatementModal';
import { EvidenceManager } from '../evidence/EvidenceManager';
import { useAuth } from '../../context/AuthContext';
import { cloudStore as localDb } from '../../services/cloudStore';
import { PartyLedgerEntry, buildPartyStatement, statementToVoucherTransactions, ledgerMoneySplit } from './partyStatement';
import { PartyStatementSummaryCards } from './PartyStatementSummaryCards';
import { PartyStatementLedger } from './PartyStatementLedger';
import { PaymentVoucherDetailModal } from './PaymentVoucherDetailModal';
import { OrderDetailModal } from '../orders/OrderDetailModal';
import { saleToDisplay, purchaseToDisplay, OrderDisplay } from '../orders/orderDisplay';

interface PartyDetailViewProps {
  party: Party;
  transactions: Transaction[];
  /** Relational sale/purchase masters — the statement's document rows */
  sales?: Sale[];
  purchases?: Purchase[];
  /** Cash/Bank accounts for payment-voucher lookups */
  accounts?: CashBankAccount[];
  settings: CompanySettings;
  onBack: () => void;
  onEdit: (party: Party) => void;
  onRecordPayment: (partyId: string, type: 'payment_in' | 'payment_out') => void;
  /** Jump to the Sales/Purchases module with this order's edit/issue flow
   *  opened (deep link) — omit ⇒ issue/edit buttons are hidden */
  onOpenInOrders?: (orderId: string, orderType: 'sales' | 'purchase', action: string) => void;
}

export function PartyDetailView({
  party,
  transactions,
  sales,
  purchases,
  accounts,
  settings,
  onBack,
  onEdit,
  onRecordPayment,
  onOpenInOrders,
}: PartyDetailViewProps) {
  const { hasPermission } = useAuth();
  const canManageParties = hasPermission('manage_parties');
  const canRecordPayments = hasPermission('record_payments');

  const currencySymbol = settings.currency.symbol;
  const [activeMainTab, setActiveMainTab] = useState<'ledger' | 'evidence'>('ledger');
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  /** The ledger row currently opened for its detail story */
  const [detailEntry, setDetailEntry] = useState<PartyLedgerEntry | null>(null);

  // The document-centric statement: one row per sale, purchase and payment
  // (plus standalone vouchers); internal mirroring vouchers are folded into
  // their order row so the running balance ties to party.currentBalance.
  const statement = useMemo(
    () =>
      buildPartyStatement({
        party,
        sales: sales || localDb.getSales(),
        purchases: purchases || localDb.getPurchases(),
        transactions,
      }),
    [party, sales, purchases, transactions],
  );

  // Clean WhatsApp phone number
  const cleanPhone = party.phone ? party.phone.replace(/[^0-9]/g, '') : '';
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(
    party.contactPerson || party.name
  )},%20regarding%20our%20account%20statement%20with%20${encodeURIComponent(settings.companyName)}:`;

  // Export Statement of Account to CSV (documents-first shape)
  const handleExportLedgerCSV = () => {
    const headers = ['Date', 'Document #', 'Stage/Type', 'Particulars', 'Reference', 'Sales', 'Purchases', 'Paid In', 'Paid Out', 'Settled', 'Running Balance', 'Status'];

    const rows = [
      [
        `"${formatDate(party.createdAt)}"`,
        '"OPENING"',
        '"Opening Balance"',
        `"Initial balance (${party.openingBalanceType === 'to_receive' ? 'Receivable' : 'Payable'})"`,
        '""',
        0, 0, 0, 0, '""',
        statement.openingBalance,
        '"Initial"',
      ],
      ...statement.rows.map((e) => {
        const money = ledgerMoneySplit(e);
        return [
          `"${formatDate(e.date)}"`,
          `"${e.documentNumber}"`,
          `"${(e.stageChip ? `${e.stageChip} — ` : '') + e.typeLabel}"`,
          `"${(e.particulars || '').replace(/"/g, '""')}"`,
          `"${e.reference || ''}"`,
          money.sale,
          money.purchase,
          money.paidIn,
          money.paidOut,
          e.settledAmount ?? 0,
          e.runningBalance,
          `"${e.status}"`,
        ];
      }),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `statement_${party.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
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
              <span>{party.phone}</span>
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
          {canRecordPayments && (
            <button
              type="button"
              onClick={() => onRecordPayment(party.id, party.type === 'customer' ? 'payment_in' : 'payment_out')}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-all hover:scale-[1.01] active:scale-[0.99] border border-[var(--color-primary)]/50"
              title="Record a payment for this party — switch between Received / Paid in the modal"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Record Payment</span>
            </button>
          )}
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
      {/* 3. FINANCIAL KPI STATS CARDS (fed by the document statement)              */}
      {/* ========================================================================= */}
      <PartyStatementSummaryCards
        party={party}
        statement={statement}
        currencySymbol={currencySymbol}
      />

      {/* ========================================================================= */}
      {/* 4. MAIN TAB SELECTOR (LEDGER vs EVIDENCE VAULT)                           */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 border-[var(--color-outline-variant)] pb-0">
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
          <span>Statement of Account & Ledger ({statement.rows.length})</span>
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
        /* STATEMENT OF ACCOUNT — doc-centric ledger with click-through detail */
        <PartyStatementLedger
          party={party}
          statement={statement}
          currencySymbol={currencySymbol}
          onOpenOrder={(entry) => setDetailEntry(entry)}
          onOpenVoucher={(entry) => setDetailEntry(entry)}
        />
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

      {/* Click-through: sale/purchase → THE orders module's details modal
          (same presentation + actions). Issue/edit actions deep-link into the
          Sales/Purchases module when the caller supplies the navigation. */}
      {(() => {
        if (!detailEntry) return null;
        if (detailEntry.kind === 'sale' && detailEntry.sale) {
          const order: OrderDisplay = saleToDisplay(detailEntry.sale);
          return (
            <OrderDetailModal
              isOpen
              onClose={() => setDetailEntry(null)}
              order={order}
              parties={[party]}
              items={localDb.getItems()}
              settings={settings}
              onIssueStage={onOpenInOrders
                ? (o, stageType) => {
                    setDetailEntry(null);
                    onOpenInOrders(o.id, o.type, String(stageType));
                  }
                : undefined}
              onEditOrder={onOpenInOrders
                ? (o) => {
                    setDetailEntry(null);
                    onOpenInOrders(o.id, o.type, 'edit');
                  }
                : undefined}
            />
          );
        }
        if (detailEntry.kind === 'purchase' && detailEntry.purchase) {
          const order: OrderDisplay = purchaseToDisplay(detailEntry.purchase);
          return (
            <OrderDetailModal
              isOpen
              onClose={() => setDetailEntry(null)}
              order={order}
              parties={[party]}
              items={localDb.getItems()}
              settings={settings}
              onIssueStage={onOpenInOrders
                ? (o, stageType) => {
                    setDetailEntry(null);
                    onOpenInOrders(o.id, o.type, String(stageType));
                  }
                : undefined}
              onEditOrder={onOpenInOrders
                ? (o) => {
                    setDetailEntry(null);
                    onOpenInOrders(o.id, o.type, 'edit');
                  }
                : undefined}
            />
          );
        }
        if (detailEntry.transaction) {
          const accountName = detailEntry.transaction.accountId
            ? (accounts || localDb.getAccounts()).find((a) => a.id === detailEntry.transaction!.accountId)?.name
            : undefined;
          return (
            <PaymentVoucherDetailModal
              isOpen
              onClose={() => setDetailEntry(null)}
              transaction={detailEntry.transaction}
              accountName={accountName}
              currencySymbol={currencySymbol}
            />
          );
        }
        return null;
      })()}

      {/* Printable Statement Modal (fed the underlying active vouchers so its
          voucher-based balance math stays identical to the server's) */}
      <PrintStatementModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        party={party}
        transactions={statementToVoucherTransactions(statement)}
        settings={settings}
      />
    </div>
  );
}