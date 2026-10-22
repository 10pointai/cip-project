import React from 'react';
import { Menu, Plus, ArrowDownLeft, ArrowUpRight, MapPin, Layers, Scale, Clock, Sun, Moon, Sparkles, Server, Database, CreditCard, Shield, User, KeyRound, LogOut, RefreshCw, Bell, Landmark, AlertTriangle } from 'lucide-react';
import { CompanySettings } from '../../types';
import { formatDate } from '../../utils/formatters';
import { NavigationTab } from './Sidebar';
import { useM3Theme } from '../../design-system';
import { useAuth } from '../../context/AuthContext';
import { cloudStore } from '../../services/cloudStore';

interface HeaderProps {
  title: string;
  subtitle?: string;
  activeTab: NavigationTab;
  onOpenMobileMenu: () => void;
  settings: CompanySettings;
  onOpenAddParty: () => void;
  onOpenRecordPayment: (type: 'payment_in' | 'payment_out') => void;
  onOpenBackendStatus?: () => void;
  isBackendOnline?: boolean;
  onOpenAuthModal?: () => void;
  onRequestSignOut?: () => void;
  isFeatureRefreshing?: boolean;
  onRefreshFeature?: () => void;
}

export function Header({
  title,
  subtitle,
  activeTab,
  onOpenMobileMenu,
  settings,
  onOpenAddParty,
  onOpenRecordPayment,
  onOpenBackendStatus,
  isBackendOnline = true,
  onOpenAuthModal,
  onRequestSignOut,
  isFeatureRefreshing = false,
  onRefreshFeature,
}: HeaderProps) {
  const { currentUser, logout, isAuthenticated, hasPermission } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const today = formatDate(new Date().toISOString(), 'long');

  // EMI alert bell — re-reads the store on any sync so the 2-days-before
  // due-date alerts follow the data everywhere in the app.
  const [emiAlerts, setEmiAlerts] = React.useState(() => cloudStore.getVehicleEmiAlerts());
  const [isEmiBellOpen, setIsEmiBellOpen] = React.useState(false);
  React.useEffect(() => {
    setEmiAlerts(cloudStore.getVehicleEmiAlerts());
    const unsubscribe = cloudStore.subscribe(() => setEmiAlerts(cloudStore.getVehicleEmiAlerts()));
    return () => unsubscribe();
  }, []);

  // Close user dropdown menu when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const renderActionButtons = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasPermission('record_payments') && (
              <button
                onClick={() => onOpenRecordPayment('payment_out')}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-[var(--color-warning-container)] hover:opacity-90 text-[var(--color-on-warning-container)] border border-[var(--color-warning)]/30 font-semibold text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-2xs"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                <span>Record Payment</span>
              </button>
            )}
            {hasPermission('manage_parties') && (
              <button
                onClick={onOpenAddParty}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Party</span>
              </button>
            )}
          </div>
        );
      case 'parties':
        return null;
      case 'items':
        if (!hasPermission('manage_inventory')) return null;
        return null
      case 'production':
        // No header action — batch runs are logged inside the Production view.
        if (!hasPermission('manage_production')) return null;
        return null;
      case 'sales':
        if (!hasPermission('manage_sales')) return null;
        return null
      case 'purchases':
        // No header action — purchase creation lives on the Purchases view
        // (Add Purchase on the search card).
        if (!hasPermission('manage_purchases')) return null;
        return null;
      case 'logistics':
        // No header actions — trip slips, vehicles and tyres are created and
        // managed inside the Logistics & Fleet view itself.
        return null;
      case 'employees':
        return null;
      default:
        return null;
    }
  };

  const { mode, toggleMode, contrast, setContrast } = useM3Theme();

  return (
    <header className="sticky top-0 z-30 h-16 bg-[var(--color-surface)]/90 backdrop-blur-md border-b border-[var(--color-outline-variant)] px-4 sm:px-8 flex items-center justify-between gap-4 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile menu trigger */}
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container)] transition-colors"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-[var(--color-on-surface)] tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-[var(--color-on-surface-variant)] font-medium truncate hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Vehicle EMI Alert Bell — raises 2 days before every EMI due date */}
        {isAuthenticated && emiAlerts.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setIsEmiBellOpen((v) => !v)}
              className={`relative inline-flex items-center justify-center p-2 rounded-full border transition-all shadow-2xs hover:scale-[1.03] active:scale-95 ${
                emiAlerts.some((a) => a.shortOfFunds)
                  ? 'bg-[var(--color-error-container)] border-[var(--color-error)]/30 text-[var(--color-on-error-container)]'
                  : 'bg-[var(--color-warning-container)] border-[var(--color-warning)]/30 text-[var(--color-on-warning-container)]'
              }`}
              title="Vehicle EMI due alerts"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-error)] text-[var(--color-on-error)] text-[9px] font-black flex items-center justify-center">
                {emiAlerts.length}
              </span>
            </button>

            {isEmiBellOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xl p-2 z-50 animate-scaleUp">
                <div className="flex items-center justify-between px-2.5 py-2 border-b border-[var(--color-outline-variant)]">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-on-surface)]">Vehicle EMI Alerts</p>
                  <button onClick={() => setIsEmiBellOpen(false)} className="text-[9px] font-bold text-[var(--color-on-surface-variant)] hover:underline">Close</button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 py-1.5">
                  {emiAlerts.map((a) => (
                    <div key={`${a.vehicleId}-${a.dueDate}`} className={`px-2.5 py-2 rounded-xl ${a.shortOfFunds ? 'bg-[var(--color-error-container)]/50' : 'bg-[var(--color-surface-container)]'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black font-mono text-[var(--color-on-surface)]">{a.vehicleNo}</span>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                          a.shortOfFunds
                            ? 'bg-[var(--color-error)] text-[var(--color-on-error)] animate-pulse'
                            : a.daysUntil <= 1
                              ? 'bg-[var(--color-warning-container)] text-[var(--color-on-warning-container)]'
                              : 'bg-[var(--color-info-container)] text-[var(--color-on-info-container)]'
                        }`}>
                          {a.shortOfFunds
                            ? '⚠ Account Short of EMI Funds'
                            : a.daysUntil <= 0 ? `⚠ Overdue ${Math.abs(a.daysUntil)}d` : a.daysUntil === 1 ? 'Due Tomorrow' : 'Due in 2 Days'}
                        </span>
                      </div>
                      {a.shortOfFunds && (
                        <p className="text-[9px] font-bold text-[var(--color-on-error-container)] mt-1">
                          {a.accountName} balance {`₹${a.accountBalance.toLocaleString('en-IN')}`} is short of the required {`₹${a.amount.toLocaleString('en-IN')}`}.
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-[var(--color-on-surface-variant)] flex items-center gap-1">
                          <Landmark className="h-3 w-3" /> {a.accountName}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--color-on-surface)]">₹{a.amount.toLocaleString('en-IN')}</span>
                      </div>
                      <p className="text-[9px] text-[var(--color-on-surface-variant)] mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> EMI date {a.dueDate}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feature Refresh Indicator & Manual Refresh Trigger */}
        {onRefreshFeature && (
          <button
            onClick={onRefreshFeature}
            disabled={isFeatureRefreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] border border-[var(--color-outline-variant)] text-[11px] font-medium text-[var(--color-on-surface)] transition-all shadow-2xs hover:scale-[1.02] active:scale-95 disabled:opacity-70"
            title="Data refreshes automatically on feature visit. Click to manually re-sync."
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--color-primary)] ${isFeatureRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline font-mono text-[10px]">
              {isFeatureRefreshing ? 'Syncing...' : 'Synced'}
            </span>
          </button>
        )}

       

        {/* Dynamic Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {renderActionButtons()}
        </div>

        {/* User Account Menu / Dropdown */}
        {currentUser ? (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] transition-all shadow-2xs hover:scale-[1.02] active:scale-95"
              title={`Signed in as ${currentUser.fullName} (@${currentUser.username})`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                currentUser.role === 'super_admin'
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                  : 'bg-[var(--color-secondary)] text-[var(--color-on-secondary)]'
              }`}>
                {currentUser.fullName.charAt(0)}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <span className="text-[11px] font-bold block truncate max-w-[100px]">{currentUser.fullName}</span>
                <span className="text-[9px] font-mono text-[var(--color-primary)] block uppercase">{currentUser.role.replace('_', ' ')}</span>
              </div>
            </button>

            {/* M3 Dropdown Popover */}
            {isUserMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)] shadow-xl p-2 z-50 animate-scaleUp">
                <div className="p-2.5 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] rounded-xl mb-1.5">
                  <p className="text-xs font-bold text-[var(--color-on-surface)] truncate">{currentUser.fullName}</p>
                  <p className="text-[11px] font-mono text-[var(--color-primary)] truncate">@{currentUser.username}</p>
                  <p className="text-[10px] text-[var(--color-on-surface-variant)] truncate mt-0.5">{currentUser.email}</p>
                  <div className="mt-1.5 inline-block px-2 py-0.5 rounded-full text-[9px] font-mono uppercase bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                    {currentUser.role.replace('_', ' ')}
                  </div>
                </div>

                <div className="space-y-0.5">
                  

                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      if (onRequestSignOut) {
                        onRequestSignOut();
                      } else {
                        logout();
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-xl text-left transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full transition-all shadow-xs"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
