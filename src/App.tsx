import React, { useState, useEffect } from 'react';
import { useDatabase } from './hooks/useDatabase';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './components/dashboard/DashboardView';
import { PartiesView } from './components/parties/PartiesView';
import { SettingsView } from './components/settings/SettingsView';
import { ItemsView } from './components/items/ItemsView';
import { ProductionView } from './components/production/ProductionView';
import { OrdersView } from './components/orders/OrdersView';
import { LogisticsView } from './components/logistics/LogisticsView';
import { EmployeesView } from './components/employees/EmployeesView';
import { CashBankView } from './components/accounts/CashBankView';
import { EvidenceManager } from './components/evidence/EvidenceManager';
import { DesignSystemView } from './components/design-system/DesignSystemView';
import { UserManagementView } from './components/users/UserManagementView';
import { AuthModal } from './components/auth/AuthModal';
import { AuthScreen } from './components/auth/AuthScreen';
import { SignOutConfirmModal } from './components/auth/SignOutConfirmModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModulePlaceholderView } from './components/common/ModulePlaceholderView';
import { AccessDeniedView } from './components/common/AccessDeniedView';
import { PartyFormModal } from './components/parties/PartyFormModal';
import { RecordPaymentModal } from './components/parties/RecordPaymentModal';
import { TransactionFormModal } from './components/parties/TransactionFormModal';
import { PartyDetailModal } from './components/parties/PartyDetailModal';
import { BackendStatusModal } from './components/common/BackendStatusModal';
import { ToastProvider, useToast } from './components/common/Toast';
import { M3ThemeProvider, useM3Theme } from './design-system';
import { Party, UserPermissions } from './types';
import { formatCurrency } from './utils/formatters';

function AppContent() {
  const {
    parties,
    transactions,
    settings,
    items,
    categories,
    units,
    locations,
    productionBatches,
    orders,
    sales,
    purchases,
    employees,
    accounts,
    transfers,
    adjustments,
    stockAdjustments,
    isOnline,
    syncNow,
    db,
  } = useDatabase();
  const { showToast } = useToast();
  const { currentUser, isAuthenticated, isLoading: isAuthLoading, logout, hasPermission } = useAuth();

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBackendStatusOpen, setIsBackendStatusOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isFeatureRefreshing, setIsFeatureRefreshing] = useState(false);

  // Refresh feature data every time the user visits or switches between features
  React.useEffect(() => {
    let isMounted = true;
    const refreshFeatureData = async () => {
      setIsFeatureRefreshing(true);
      try {
        await syncNow(true);
      } catch (err) {
        console.warn('[App] Error syncing data on feature visit:', err);
      } finally {
        if (isMounted) {
          setIsFeatureRefreshing(false);
        }
      }
    };

    refreshFeatureData();

    return () => {
      isMounted = false;
    };
    // isAuthenticated in deps: the pre-login constructor sync now returns a
    // settings-only tier (GET /api/sync is data-gated), so sign-in MUST trigger
    // one full authenticated snapshot hydration — without this dep, landing on
    // the same tab you left the app with left the store hydrated settings-only.
  }, [activeTab, isAuthenticated, syncNow]);

  const checkTabPermission = (tab: NavigationTab): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    switch (tab) {
      case 'dashboard': return hasPermission('view_dashboard');
      case 'parties': return hasPermission('manage_parties') || hasPermission('record_payments');
      case 'cash-bank': return hasPermission('manage_cash_bank');
      case 'items': return hasPermission('manage_inventory');
      case 'sales': return hasPermission('manage_sales');
      case 'purchases': return hasPermission('manage_purchases');
      case 'production': return hasPermission('manage_production');
      case 'logistics': return hasPermission('manage_fleet');
      case 'employees': return hasPermission('manage_employees');
      case 'evidence': return hasPermission('manage_evidence');
      case 'users': return hasPermission('manage_users');
      case 'settings': return hasPermission('manage_settings');
      case 'design-system': return hasPermission('manage_settings');
      default: return true;
    }
  };

  React.useEffect(() => {
    if (!checkTabPermission(activeTab)) {
      const allowedTabs: NavigationTab[] = [
        'dashboard', 'parties', 'cash-bank', 'items', 'sales', 'purchases',
        'production', 'logistics', 'employees', 'evidence', 'users', 'settings'
      ];
      const firstAllowed = allowedTabs.find(t => checkTabPermission(t));
      if (firstAllowed) {
        setActiveTab(firstAllowed);
      }
    }
  }, [activeTab, currentUser]);

  const handleConfirmSignOut = () => {
    logout();
    setIsSignOutModalOpen(false);
    showToast('You have been signed out successfully.', 'info');
  };

  // Global Modals
  const [isAddPartyModalOpen, setIsAddPartyModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedPartyForDetail, setSelectedPartyForDetail] = useState<Party | null>(null);
  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    partyId?: string;
    type: 'payment_in' | 'payment_out';
  }>({ isOpen: false, type: 'payment_in' });
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [voucherModalPartyId, setVoucherModalPartyId] = useState<string | undefined>();

  // Deep link from the party statement: open an order's edit/issue flow in
  // the Sales or Purchases module (OrdersView consumes it on arrival).
  const [orderDeepLink, setOrderDeepLink] = useState<{
    orderId: string;
    orderType: 'sales' | 'purchase';
    action: string; // 'edit' | SalesStage | PurchaseStage
    nonce: number;
  } | null>(null);

  const handleOpenInOrders = (orderId: string, orderType: 'sales' | 'purchase', action: string) => {
    setOrderDeepLink({ orderId, orderType, action, nonce: Date.now() });
    setActiveTab(orderType === 'sales' ? 'sales' : 'purchases');
  };

  // Sidebar collapse (desktop): rail showing icons with hover-name tooltips.
  // Persisted per browser — it's a viewing convenience, not business data.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ops_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('ops_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
    } catch {
      // storage unavailable — collapse state just won't persist
    }
  }, [sidebarCollapsed]);

  // Opening a party's detail screen collapses the sidebar by default;
  // going back restores whatever the user had before.
  const sidebarWasCollapsed = React.useRef<boolean>(false);
  const handlePartyDetailOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      sidebarWasCollapsed.current = sidebarCollapsed;
      setSidebarCollapsed(true);
    } else if (sidebarWasCollapsed.current) {
      sidebarWasCollapsed.current = false;
      setSidebarCollapsed(false);
    }
  };

  // Handlers for Accounts & Transfers
  const handleAddAccount = (accData: any) => {
    db.addAccount(accData);
    showToast(`${accData.type === 'bank' ? 'Bank' : 'Cash'} Account "${accData.name}" created!`);
  };

  const handleUpdateAccount = (id: string, updates: any) => {
    db.updateAccount(id, updates);
    showToast('Account details updated!');
  };

  const handleDeleteAccount = (id: string) => {
    const success = db.deleteAccount(id);
    if (success) {
      showToast('Account removed.', 'info');
    }
  };

  const handleAddTransfer = (transferData: any) => {
    const trf = db.addTransfer(transferData);
    showToast(`Transfer of ${formatCurrency(transferData.amount, settings.currency.symbol)} executed!`);
    return trf;
  };

  const handleDeleteTransfer = (id: string) => {
    db.deleteTransfer(id);
    showToast('Transfer voucher deleted.', 'info');
  };

  const handleAddAdjustment = (adjData: any) => {
    const adj = db.addAdjustment(adjData);
    showToast(`Balance adjustment recorded!`);
    return adj;
  };

  const handleDeleteAdjustment = (id: string) => {
    db.deleteAdjustment(id);
    showToast('Adjustment voucher deleted.', 'info');
  };

  // Sales & Purchase handlers (relational order model)
  const handleAddSale = (payload: any) => {
    const sale = db.addSale(payload);
    showToast(`${payload.stage?.stageType === 'quotation' ? 'Quotation' : 'Sale'} ${sale.saleNumber} registered successfully!`);
    return sale;
  };

  const handleUpdateSale = (id: string, updates: any) => {
    const sale = db.updateSale(id, updates);
    if (sale) showToast(`Sale ${sale.saleNumber} updated successfully!`);
    return sale;
  };

  const handleAddSaleStage = (id: string, stageInput: any) => {
    const sale = db.addSaleStage(id, stageInput);
    if (sale) showToast(`Stage ${stageInput.stageType} saved on ${sale.saleNumber}!`);
    return sale;
  };

  const handleDeleteSale = (id: string) => {
    const success = db.deleteSale(id);
    if (success) {
      showToast('Sale deleted and ledger compensated.', 'info');
    }
    return success;
  };

  const handleAddPurchase = (payload: any) => {
    const purchase = db.addPurchase(payload);
    showToast(`Purchase ${purchase.purchaseNumber} registered successfully!`);
    return purchase;
  };

  const handleUpdatePurchase = (id: string, updates: any) => {
    const purchase = db.updatePurchase(id, updates);
    if (purchase) showToast(`Purchase ${purchase.purchaseNumber || ''} updated successfully!`);
    return purchase;
  };

  const handleAddPurchaseStage = (id: string, stageInput: any) => {
    const purchase = db.addPurchaseStage(id, stageInput);
    if (purchase) showToast(`Stage ${stageInput.stageType} saved on ${purchase.purchaseNumber}!`);
    return purchase;
  };

  const handleDeletePurchase = (id: string) => {
    const success = db.deletePurchase(id);
    if (success) {
      showToast('Purchase deleted and ledger compensated.', 'info');
    }
    return success;
  };

  const handleAddParty = (partyData: any) => {
    db.addParty(partyData);
    showToast('Party created successfully!');
  };

  const handleAddPartiesBulk = (partiesData: any[]) => {
    const created = db.addPartiesBulk(partiesData);
    showToast(`Successfully added ${created.length} parties to directory!`);
    return created;
  };

  const handleUpdateParty = (id: string, updates: any) => {
    db.updateParty(id, updates);
    showToast('Party details updated!');
    if (selectedPartyForDetail && selectedPartyForDetail.id === id) {
      setSelectedPartyForDetail((prev) => (prev ? { ...prev, ...updates } : null));
    }
  };

  const handleAddTransaction = (txData: any) => {
    db.addTransaction(txData);
    showToast(`Voucher ${txData.voucherNumber || ''} saved and ledger updated!`);
  };

  const handleRecordPayment = (data: any) => {
    const voucherNumber = `${settings.prefixes.paymentReceipt}${Math.floor(1000 + Math.random() * 9000)}`;
    const party = parties.find((p) => p.id === data.partyId);

    db.addTransaction({
      voucherNumber,
      partyId: data.partyId,
      partyName: party?.name || 'Party',
      partyType: party?.type || 'customer',
      type: data.type,
      amount: data.amount,
      date: data.date,
      accountId: data.accountId,
      accountName: data.accountName,
      paymentMode: data.paymentMode,
      referenceNumber: data.referenceNumber,
      description: data.description,
      status: 'paid',
    });

    showToast(`Payment of ${formatCurrency(data.amount, settings.currency.symbol)} recorded!`);
  };

  const handleUpdateSettings = (newSettings: any) => {
    db.updateSettings(newSettings);
  };

  // Header Titles
  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Dashboard',
          subtitle: 'All operations at a glance.',
        };
      case 'parties':
        return {
          title: 'Parties',
          subtitle: 'All customers, buyers and suppliers',
        };
      case 'cash-bank':
        return {
          title: 'Cash & Bank Management',
          subtitle: 'Bank accounts and cash registers.',
        };
      case 'items':
        return {
          title: 'Inventory',
          subtitle: 'Products, raw materials, stock levels.',
        };
      case 'settings':
        return {
          title: 'Company & Operations Settings',
          subtitle: '',
        };
      case 'logistics':
        return {
          title: 'Logistics & Fleet Management',
          subtitle: 'Insulated tipper trucks, bitumen tankers & driver trip slips',
        };
      case 'sales':
        return {
          title: 'Sales',
          subtitle: '',
        };
      case 'purchases':
        return {
          title: 'Purchases',
          subtitle: '',
        };
      case 'production':
        return {
          title: 'Production & Batching Management',
          subtitle: '',
        };
      case 'employees':
        return {
          title: 'Employee & HR Management',
          subtitle: 'Manage staff, driver profiles, attendance logs, leave requests, overtimes & payroll accounts',
        };
      case 'evidence':
        return {
          title: 'Document & Evidence Vault',
          subtitle: 'Cross-module repository for parties, fleet, HR, vouchers, invoices & operational files',
        };
      case 'users':
        return {
          title: 'User & Access Management',
          subtitle: '',
        };
      case 'design-system':
        return {
          title: 'Design System & Component Library',
          subtitle: 'Material Design 3 tokens, typography scale, shapes, elevation shadows, icons and components',
        };
      default:
        return { title: 'Operations Management', subtitle: '' };
    }
  };

  const headerInfo = getHeaderInfo();

  // If session is checking/loading, show sleek M3 splash indicator
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-on-surface)] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center mb-4 animate-pulse">
          <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--color-on-surface-variant)]">
          Validating Security Session...
        </p>
      </div>
    );
  }

  // SIGNED-OUT STATE: Only the beautiful AuthScreen is displayed
  if (!isAuthenticated || !currentUser) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-on-surface)] flex selection:bg-[var(--color-primary)] selection:text-[var(--color-on-primary)] transition-colors duration-200">
      {/* Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        partiesCount={parties.length}
        itemsCount={items.length}
        salesCount={sales.length + orders.filter(o => o.type === 'sales').length}
        purchasesCount={purchases.length + orders.filter(o => o.type === 'purchase').length}
        accountsCount={accounts.length}
        employeesCount={employees?.length || 0}
        settings={settings}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onRequestSignOut={() => setIsSignOutModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-72'}`}>
        {/* Top Header */}
        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          activeTab={activeTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          settings={settings}
          onOpenAddParty={() => {
            setEditingParty(null);
            setIsAddPartyModalOpen(true);
          }}
          onOpenRecordPayment={(type) => {
            setPaymentModalState({ isOpen: true, type });
          }}
          onOpenBackendStatus={() => setIsBackendStatusOpen(true)}
          isBackendOnline={isOnline}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onRequestSignOut={() => setIsSignOutModalOpen(true)}
          isFeatureRefreshing={isFeatureRefreshing}
          onRefreshFeature={() => syncNow(true)}
        />

        {/* Dynamic Page Views */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && hasPermission('view_dashboard') && (
            <DashboardView
              parties={parties}
              transactions={transactions}
              settings={settings}
              onNavigateToParties={() => setActiveTab('parties')}
              onOpenAddParty={() => {
                setEditingParty(null);
                setIsAddPartyModalOpen(true);
              }}
              onOpenPaymentModal={(type) => {
                setPaymentModalState({ isOpen: true, type });
              }}
              onOpenVoucherModal={() => {
                setVoucherModalPartyId(undefined);
                setIsVoucherModalOpen(true);
              }}
              onSelectParty={(party) => setSelectedPartyForDetail(party)}
            />
          )}

          {activeTab === 'parties' && (hasPermission('manage_parties') || hasPermission('record_payments')) && (
            <PartiesView
              parties={parties}
              transactions={transactions}
              sales={sales}
              purchases={purchases}
              settings={settings}
              accounts={accounts}
              onAddParty={handleAddParty}
              onAddPartiesBulk={handleAddPartiesBulk}
              onUpdateParty={handleUpdateParty}
              onAddTransaction={handleAddTransaction}
              onRecordPayment={handleRecordPayment}
              onOpenInOrders={handleOpenInOrders}
              onPartyDetailOpenChange={handlePartyDetailOpenChange}
            />
          )}

          {activeTab === 'cash-bank' && hasPermission('manage_cash_bank') && (
            <CashBankView
              accounts={accounts}
              transfers={transfers}
              adjustments={adjustments}
              transactions={transactions}
              orders={orders}
              settings={settings}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onAddTransfer={handleAddTransfer}
              onDeleteTransfer={handleDeleteTransfer}
              onAddAdjustment={handleAddAdjustment}
              onDeleteAdjustment={handleDeleteAdjustment}
              onOpenRecordPayment={(type) => {
                setPaymentModalState({ isOpen: true, type });
              }}
            />
          )}

          {activeTab === 'items' && hasPermission('manage_inventory') && (
            <ItemsView
              items={items}
              categories={categories}
              units={units}
              locations={locations}
              settings={settings}
              stockAdjustments={stockAdjustments}
            />
          )}

          {activeTab === 'production' && hasPermission('manage_production') && (
            <ProductionView
              batches={productionBatches}
              items={items}
              settings={settings}
            />
          )}

          {activeTab === 'sales' && hasPermission('manage_sales') && (
            <OrdersView
              sales={sales}
              purchaseOrders={purchases}
              parties={parties}
              items={items}
              settings={settings}
              onAddSale={handleAddSale}
              onUpdateSale={handleUpdateSale}
              onAddSaleStage={handleAddSaleStage}
              onDeleteSale={handleDeleteSale}
              onAddPurchase={handleAddPurchase}
              onUpdatePurchase={handleUpdatePurchase}
              onAddPurchaseStage={handleAddPurchaseStage}
              onDeletePurchase={handleDeletePurchase}
              fixedType="sales"
              deepLink={orderDeepLink && orderDeepLink.orderType === 'sales'
                ? { orderId: orderDeepLink.orderId, action: orderDeepLink.action, nonce: orderDeepLink.nonce }
                : null}
              onDeepLinkHandled={() => setOrderDeepLink(null)}
            />
          )}

          {activeTab === 'purchases' && hasPermission('manage_purchases') && (
            <OrdersView
              sales={sales}
              purchaseOrders={purchases}
              parties={parties}
              items={items}
              settings={settings}
              onAddSale={handleAddSale}
              onUpdateSale={handleUpdateSale}
              onAddSaleStage={handleAddSaleStage}
              onDeleteSale={handleDeleteSale}
              onAddPurchase={handleAddPurchase}
              onUpdatePurchase={handleUpdatePurchase}
              onAddPurchaseStage={handleAddPurchaseStage}
              onDeletePurchase={handleDeletePurchase}
              fixedType="purchase"
              deepLink={orderDeepLink && orderDeepLink.orderType === 'purchase'
                ? { orderId: orderDeepLink.orderId, action: orderDeepLink.action, nonce: orderDeepLink.nonce }
                : null}
              onDeepLinkHandled={() => setOrderDeepLink(null)}
            />
          )}

          {activeTab === 'settings' && hasPermission('manage_settings') && (
            <SettingsView
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onOpenBackendStatus={() => setIsBackendStatusOpen(true)}
            />
          )}

          {activeTab === 'logistics' && hasPermission('manage_fleet') && (
            <LogisticsView />
          )}

          {activeTab === 'employees' && hasPermission('manage_employees') && (
            <EmployeesView />
          )}

          {activeTab === 'evidence' && hasPermission('manage_evidence') && (
            <EvidenceManager title="Document & Evidence Vault" />
          )}

          {activeTab === 'users' && hasPermission('manage_users') && (
            <UserManagementView />
          )}

          {activeTab === 'design-system' && (
            <DesignSystemView />
          )}

          {activeTab !== 'dashboard' &&
            activeTab !== 'parties' &&
            activeTab !== 'cash-bank' &&
            activeTab !== 'items' &&
            activeTab !== 'sales' &&
            activeTab !== 'purchases' &&
            activeTab !== 'production' &&
            activeTab !== 'settings' &&
            activeTab !== 'logistics' &&
            activeTab !== 'employees' &&
            activeTab !== 'evidence' &&
            activeTab !== 'users' &&
            activeTab !== 'design-system' && (
              <ModulePlaceholderView
                tab={activeTab}
                onNavigateToParties={() => setActiveTab('parties')}
                onNavigateToDashboard={() => setActiveTab('dashboard')}
              />
            )}
        </main>
      </div>

      {/* Global Modals */}
      <PartyFormModal
        isOpen={isAddPartyModalOpen}
        onClose={() => {
          setIsAddPartyModalOpen(false);
          setEditingParty(null);
        }}
        onSave={(data) => {
          if (editingParty) {
            handleUpdateParty(editingParty.id, data);
          } else {
            handleAddParty(data);
          }
        }}
        initialParty={editingParty}
        currencySymbol={settings.currency.symbol}
      />

      <PartyDetailModal
        isOpen={!!selectedPartyForDetail}
        onClose={() => setSelectedPartyForDetail(null)}
        party={selectedPartyForDetail}
        transactions={transactions}
        sales={sales}
        purchases={purchases}
        accounts={accounts}
        settings={settings}
        onEdit={(party) => {
          setEditingParty(party);
          setIsAddPartyModalOpen(true);
        }}
        onRecordPayment={(partyId, type) => {
          setPaymentModalState({ isOpen: true, partyId, type });
        }}
        onOpenInOrders={handleOpenInOrders}
      />

      <RecordPaymentModal
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState({ isOpen: false, type: 'payment_in' })}
        parties={parties}
        defaultPartyId={paymentModalState.partyId}
        defaultType={paymentModalState.type}
        accounts={accounts}
        onSave={handleRecordPayment}
        currencySymbol={settings.currency.symbol}
      />

      <TransactionFormModal
        isOpen={isVoucherModalOpen}
        onClose={() => setIsVoucherModalOpen(false)}
        parties={parties}
        defaultPartyId={voucherModalPartyId}
        onSave={handleAddTransaction}
        currencySymbol={settings.currency.symbol}
        prefixes={settings.prefixes}
      />

      <BackendStatusModal
        isOpen={isBackendStatusOpen}
        onClose={() => setIsBackendStatusOpen(false)}
        onSync={syncNow}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <SignOutConfirmModal
        isOpen={isSignOutModalOpen}
        currentUser={currentUser}
        onConfirm={handleConfirmSignOut}
        onCancel={() => setIsSignOutModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <M3ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </M3ThemeProvider>
  );
}
