import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Filter,
  Building2,
  Phone,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  LayoutGrid,
  List,
  Download,
  AlertCircle,
  Clock,
  MapPin,
  Sparkles,
  CreditCard,
} from 'lucide-react';
import { Party, Transaction, CompanySettings, PartyType, PartyCategory, Sale, Purchase, CashBankAccount } from '../../types';
import { formatCurrency, formatCompactCurrency } from '../../utils/formatters';
import { PartyFormModal } from './PartyFormModal';
import { BulkPartyEntryModal } from './BulkPartyEntryModal';
import { PartyDetailView } from './PartyDetailView';
import { RecordPaymentModal } from './RecordPaymentModal';
import { useToast } from '../common/Toast';
import { useAuth } from '../../context/AuthContext';

interface PartiesViewProps {
  parties: Party[];
  transactions: Transaction[];
  /** Relational sale/purchase masters feeding the statement ledger */
  sales?: Sale[];
  purchases?: Purchase[];
  settings: CompanySettings;
  accounts?: CashBankAccount[];
  onAddParty: (partyData: any) => void;
  onAddPartiesBulk?: (parties: any[]) => void;
  onUpdateParty: (id: string, updates: any) => void;
  onAddTransaction: (txData: any) => void;
  onRecordPayment?: (paymentData: any) => void;
  /** Jump to the Sales/Purchases module with an order's flow deep-linked */
  onOpenInOrders?: (orderId: string, orderType: 'sales' | 'purchase', action: string) => void;
  /** A party detail screen opened / closed (App collapses the sidebar) */
  onPartyDetailOpenChange?: (isOpen: boolean) => void;
}

export function PartiesView({
  parties,
  transactions,
  sales,
  purchases,
  settings,
  accounts,
  onAddParty,
  onAddPartiesBulk,
  onUpdateParty,
  onAddTransaction,
  onRecordPayment,
  onOpenInOrders,
  onPartyDetailOpenChange,
}: PartiesViewProps) {
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManageParties = hasPermission('manage_parties');
  const canRecordPayments = hasPermission('record_payments');
  const canViewFinancialMetrics = hasPermission('view_financial_metrics');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBalanceFilter, setSelectedBalanceFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Modals & Active Party Screen state
  const [isPartyFormOpen, setIsPartyFormOpen] = useState(false);
  const [isBulkEntryOpen, setIsBulkEntryOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    partyId?: string;
    type: 'payment_in' | 'payment_out';
  }>({ isOpen: false, type: 'payment_in' });

  // Notify the shell when the dedicated detail screen opens/closes
  // (the App collapses the sidebar by default for the detail view).
  useEffect(() => {
    onPartyDetailOpenChange?.(!!selectedPartyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartyId]);

  // Filtered Parties
  const filteredParties = useMemo(() => {
    return parties.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.tradeName && p.tradeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.gstin && p.gstin.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.phone.includes(searchQuery) ||
        p.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.city.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = selectedCategory === 'all' ? true : p.category === selectedCategory;

      const matchesBalance =
        selectedBalanceFilter === 'all'
          ? true
          : selectedBalanceFilter === 'receivable'
          ? p.currentBalance > 0
          : selectedBalanceFilter === 'payable'
          ? p.currentBalance < 0
          : p.currentBalance === 0;

      return matchesSearch && matchesCategory && matchesBalance;
    });
  }, [parties, searchQuery, selectedCategory, selectedBalanceFilter]);

  // Key KPI totals
  const totalReceivables = useMemo(() => {
    return parties.reduce((sum, p) => (p.currentBalance > 0 ? sum + p.currentBalance : sum), 0);
  }, [parties]);

  const totalPayables = useMemo(() => {
    return parties.reduce((sum, p) => (p.currentBalance < 0 ? sum + Math.abs(p.currentBalance) : sum), 0);
  }, [parties]);

  const netBalance = totalReceivables - totalPayables;

  // Categories list for dropdown
  const categories = useMemo(() => {
    const set = new Set(parties.map((p) => p.category));
    return Array.from(set);
  }, [parties]);

  const handleCreateParty = (partyData: any) => {
    onAddParty(partyData);
    showToast('Party created successfully!');
  };

  const handleBulkSaveParties = (newParties: any[]) => {
    if (onAddPartiesBulk) {
      onAddPartiesBulk(newParties);
    } else {
      newParties.forEach((p) => onAddParty(p));
      showToast(`Successfully created ${newParties.length} parties!`);
    }
  };

  const handleUpdateParty = (partyData: any) => {
    if (editingParty) {
      onUpdateParty(editingParty.id, partyData);
      showToast('Party profile updated successfully!');
    }
  };

  const handleRecordPaymentSubmit = (data: any) => {
    if (onRecordPayment) {
      onRecordPayment(data);
    } else {
      const voucherNumber = `${settings.prefixes.paymentReceipt}${Math.floor(1000 + Math.random() * 9000)}`;
      const party = parties.find((p) => p.id === data.partyId);
      onAddTransaction({
        ...data,
        voucherNumber,
        partyName: party?.name || 'Party',
        partyType: party?.type || 'customer',
        status: 'paid',
      });
      showToast(`Payment of ${formatCurrency(data.amount, settings.currency.symbol)} recorded!`);
    }
  };

  // If a specific party is selected, render the dedicated full detail screen
  const selectedParty = parties.find((p) => p.id === selectedPartyId);
  if (selectedParty) {
    return (
      <div className="space-y-6">
        <PartyDetailView
          party={selectedParty}
          transactions={transactions}
          sales={sales}
          purchases={purchases}
          accounts={accounts}
          settings={settings}
          onBack={() => setSelectedPartyId(null)}
          onEdit={(party) => {
            setEditingParty(party);
            setIsPartyFormOpen(true);
          }}
          onRecordPayment={(partyId, type) => {
            setPaymentModalState({ isOpen: true, partyId, type });
          }}
          onOpenInOrders={onOpenInOrders}
        />

        {/* Modals triggered from Detail Screen */}
        <PartyFormModal
          isOpen={isPartyFormOpen}
          onClose={() => setIsPartyFormOpen(false)}
          onSave={editingParty ? handleUpdateParty : handleCreateParty}
          initialParty={editingParty}
          currencySymbol={settings.currency.symbol}
        />

        <RecordPaymentModal
          isOpen={paymentModalState.isOpen}
          onClose={() => setPaymentModalState({ isOpen: false, type: 'payment_in' })}
          parties={parties}
          defaultPartyId={paymentModalState.partyId}
          defaultType={paymentModalState.type}
          accounts={accounts}
          onSave={handleRecordPaymentSubmit}
          currencySymbol={settings.currency.symbol}
        />

      </div>
    );
  }

  // Export Parties to CSV
  const handleExportCSV = () => {
    const headers = [
      'Name',
      'Trade Name',
      'Category',
      'GSTIN',
      'PAN',
      'Contact Person',
      'Phone',
      'City',
      'State',
      'Credit Terms (Days)',
      'Credit Limit',
      'Current Balance (INR)',
    ];

    const rows = parties.map((p) => [
      `"${p.name}"`,
      `"${p.tradeName || ''}"`,
      `"${p.category}"`,
      `"${p.gstin || ''}"`,
      `"${p.pan || ''}"`,
      `"${p.contactPerson}"`,
      `"${p.phone}"`,
      `"${p.address.city}"`,
      `"${p.address.state}"`,
      p.paymentTermsDays,
      p.creditLimit,
      p.currentBalance,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `parties_master_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Party directory exported to CSV.');
  };

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards - Rendered only when user has financial metrics permission */}
      {canViewFinancialMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 bg-[var(--color-primary-container)] border border-[var(--color-primary)]/20 rounded-[24px] shadow-2xs space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--color-on-primary-container)]/80 uppercase tracking-wider">Total Receivable</span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shadow-xs">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[var(--color-on-primary-container)]">
              {formatCurrency(totalReceivables, settings.currency.symbol)}
            </p>
            
          </div>

          <div className="p-5 bg-[var(--color-secondary-container)] border border-[var(--color-secondary)]/20 rounded-[24px] shadow-2xs space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--color-on-secondary-container)]/80 uppercase tracking-wider">Total Payable</span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-secondary)] text-[var(--color-on-secondary)] flex items-center justify-center shadow-xs">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[var(--color-on-secondary-container)]">
              {formatCurrency(totalPayables, settings.currency.symbol)}
            </p>
            
          </div>

          <div className="p-5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-[24px] shadow-2xs space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Total Active Parties</span>
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center font-bold text-xs shadow-xs">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users w-4 h-4 shrink-0 text-[var(--color-on-primary)]" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><path d="M16 3.128a4 4 0 0 1 0 7.744"></path><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><circle cx="9" cy="7" r="4"></circle></svg>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[var(--color-on-surface)]">
              {parties.length}
            </p>
            
          </div>
        </div>
      )}

      {/* Filter and Search Controls */}
      <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--color-outline)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by party name, trade site, phone, GSTIN, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* View Toggle & Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] font-semibold text-xs rounded-full shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[var(--color-outline)]" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            {canRecordPayments && (
              <button
                onClick={() => setPaymentModalState({ isOpen: true, type: 'payment_in' })}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-primary-container)] hover:opacity-90 text-[var(--color-on-primary-container)] border border-[var(--color-primary)]/20 font-semibold text-xs rounded-full shadow-2xs transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <CreditCard className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span className="hidden sm:inline">Record Payment</span>
                <span className="sm:hidden">Payment</span>
              </button>
            )}
            {canManageParties && (
              <>
                <button
                  onClick={() => {
                    setEditingParty(null);
                    setIsPartyFormOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full shadow-xs transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Party</span>
                </button>
              </>
            )}

          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-outline-variant)] text-xs">
          {/* Category and Balance Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3.5 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={selectedBalanceFilter}
              onChange={(e) => setSelectedBalanceFilter(e.target.value)}
              className="px-3.5 py-1.5 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="all">All Balances</option>
              <option value="receivable">Receivable Only (+)</option>
              <option value="payable">Payable Only (-)</option>
              <option value="zero">Settled / Zero</option>
            </select>
          </div>
        </div>
      </div>

      {/* Parties List Display */}
      {filteredParties.length === 0 ? (
        <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] border border-[var(--color-outline-variant)] p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          {parties.length === 0 ? (
            <>
              <h3 className="text-base font-bold text-[var(--color-on-surface)]">No parties yet</h3>
              <p className="text-xs text-[var(--color-on-surface-variant)] max-w-sm mx-auto mt-1">
                Add your first party to start tracking their ledger, payments and credit terms.
              </p>
              {canManageParties && (
                <div className="mt-4 flex items-center justify-center flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setEditingParty(null);
                      setIsPartyFormOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Party
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="text-base font-bold text-[var(--color-on-surface)]">No parties found</h3>
              <p className="text-xs text-[var(--color-on-surface-variant)] max-w-sm mx-auto mt-1">
                No parties match your current search or filters. Try adjusting them to see more results.
              </p>
            </>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredParties.map((party) => {
            const isReceivable = party.currentBalance > 0;
            const isPayable = party.currentBalance < 0;
            const cleanPhone = party.phone.replace(/[^0-9]/g, '');

            return (
              <div
                key={party.id}
                className="bg-[var(--color-surface-container-lowest)] rounded-[24px] border border-[var(--color-outline-variant)] shadow-2xs hover:shadow-md hover:border-[var(--color-primary)] transition-all flex flex-col justify-between overflow-hidden group"
              >
                <div className="p-5 space-y-3.5">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[var(--color-surface-container)] text-[var(--color-primary)] flex items-center justify-center font-bold text-base shrink-0 group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-on-primary-container)] transition-colors">
                        {party.name.charAt(0)}
                      </div>
                      <div>
                        <h3
                          onClick={() => setSelectedPartyId(party.id)}
                          className="text-sm font-bold text-[var(--color-on-surface)] hover:text-[var(--color-primary)] cursor-pointer transition-colors line-clamp-1"
                        >
                          {party.name}
                        </h3>
                        {party.tradeName && (
                          <p className="text-[11px] text-[var(--color-on-surface-variant)] line-clamp-1">{party.tradeName}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]">
                            {party.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* GSTIN and Contact Person */}
                  <div className="bg-[var(--color-surface-container)] p-3 rounded-2xl border border-[var(--color-outline-variant)] text-xs space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--color-on-surface-variant)]">GSTIN:</span>
                      <span className="font-mono font-bold text-[var(--color-on-surface)]">{party.gstin || 'Unregistered'}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--color-on-surface-variant)]">Contact:</span>
                      <span className="text-[var(--color-on-surface)] font-medium truncate max-w-[150px]">{party.contactPerson}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--color-on-surface-variant)]">Terms:</span>
                      <span className="text-[var(--color-on-surface)] font-medium">{party.paymentTermsDays} Days</span>
                    </div>
                  </div>

                  {/* Balance Display */}
                  <div
                    onClick={() => setSelectedPartyId(party.id)}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer hover:opacity-95 transition-opacity ${
                      isReceivable
                        ? 'bg-[var(--color-primary-container)] border-[var(--color-primary)]/20 text-[var(--color-on-primary-container)]'
                        : isPayable
                        ? 'bg-[var(--color-error-container)] border-[var(--color-error)]/20 text-[var(--color-on-error-container)]'
                        : 'bg-[var(--color-surface-container)] border-[var(--color-outline-variant)] text-[var(--color-on-surface)]'
                    }`}
                  >
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                        {isReceivable ? 'Receivable (To Receive)' : isPayable ? 'Payable (To Pay)' : 'Account Balance'}
                      </p>
                      <p className="text-base font-extrabold">
                        {formatCurrency(Math.abs(party.currentBalance), settings.currency.symbol)}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                        isReceivable
                          ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                          : isPayable
                          ? 'bg-[var(--color-error)] text-[var(--color-on-error)]'
                          : 'bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface-variant)]'
                      }`}
                    >
                      {isReceivable ? 'Dr' : isPayable ? 'Cr' : 'Nil'}
                    </span>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="px-5 py-3 bg-[var(--color-surface-container)]/80 border-t border-[var(--color-outline-variant)] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`tel:${party.phone}`}
                      className="p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full hover:bg-[var(--color-surface-container)] transition-colors"
                      title={`Call ${party.phone}`}
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`https://wa.me/${cleanPhone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-[var(--color-on-success-container)] hover:opacity-90 bg-[var(--color-success-container)] border border-[var(--color-success)]/30 rounded-full transition-colors"
                      title="WhatsApp Message"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <button
                    onClick={() => setSelectedPartyId(party.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80"
                  >
                    View Details & Ledger
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Data Table View */
        <div className="bg-[var(--color-surface-container-lowest)] rounded-[28px] border border-[var(--color-outline-variant)] overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--color-surface-container)] border-b border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Party Name & Category</th>
                  <th className="py-3 px-3">GSTIN / PAN</th>
                  <th className="py-3 px-3">Contact & City</th>
                  <th className="py-3 px-3">Credit Terms</th>
                  <th className="py-3 px-4 text-right">Outstanding Balance</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]">
                {filteredParties.map((party) => {
                  const isReceivable = party.currentBalance > 0;
                  const isPayable = party.currentBalance < 0;

                  return (
                    <tr
                      key={party.id}
                      className="hover:bg-[var(--color-surface-container)]/50 transition-colors cursor-pointer"
                      onClick={(e) => {
                        // Check if click was not on a button or link
                        if ((e.target as HTMLElement).closest('button, a')) return;
                        setSelectedPartyId(party.id);
                      }}
                    >
                      <td className="py-3.5 px-4">
                        <div
                          onClick={() => setSelectedPartyId(party.id)}
                          className="font-bold text-[var(--color-on-surface)] hover:text-[var(--color-primary)] cursor-pointer"
                        >
                          {party.name}
                          {party.tradeName && (
                            <span className="block text-[10px] font-medium italic text-[var(--color-outline)]">
                              ({party.tradeName})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--color-on-surface-variant)]">{party.category}</div>
                      </td>
                      <td className="py-3.5 px-3 font-mono font-medium text-[var(--color-on-surface)]">
                        {party.gstin || 'Unregistered'}
                      </td>
                      <td className="py-3.5 px-3">
                        <p className="font-semibold text-[var(--color-on-surface)]">{party.contactPerson}</p>
                        <p className="text-[11px] text-[var(--color-on-surface-variant)]">{party.phone} ({party.address.city})</p>
                      </td>
                      <td className="py-3.5 px-3 text-[var(--color-on-surface-variant)] font-medium">
                        {party.paymentTermsDays} Days
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono font-bold text-sm ${
                          isReceivable ? 'text-[var(--color-success)]' : isPayable ? 'text-[var(--color-error)]' : 'text-[var(--color-on-surface-variant)]'
                        }`}
                      >
                        {formatCurrency(Math.abs(party.currentBalance), settings.currency.symbol)}{' '}
                        <span className="text-[10px] uppercase">{isReceivable ? '(Dr)' : isPayable ? '(Cr)' : ''}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">                          {canManageParties && (
                            <button
                              onClick={() => {
                                setEditingParty(party);
                                setIsPartyFormOpen(true);
                              }}
                              className="px-3 py-1 bg-[var(--color-surface-container-high)] hover:opacity-90 text-[var(--color-on-surface)] font-semibold rounded-full text-xs transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {isBulkEntryOpen && (
        <BulkPartyEntryModal
          isOpen={isBulkEntryOpen}
          onClose={() => setIsBulkEntryOpen(false)}
          onSaveParties={handleBulkSaveParties}
          currencySymbol={settings.currency.symbol}
        />
      )}

      <PartyFormModal
        isOpen={isPartyFormOpen}
        onClose={() => setIsPartyFormOpen(false)}
        onSave={editingParty ? handleUpdateParty : handleCreateParty}
        initialParty={editingParty}
        currencySymbol={settings.currency.symbol}
      />

      <RecordPaymentModal
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState({ isOpen: false, type: 'payment_in' })}
        parties={parties}
        defaultPartyId={paymentModalState.partyId}
        defaultType={paymentModalState.type}
        accounts={accounts}
        onSave={handleRecordPaymentSubmit}
        currencySymbol={settings.currency.symbol}
      />
    </div>
  );
}
