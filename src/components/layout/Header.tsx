import React from 'react';
import { Menu, Plus, ArrowDownLeft, ArrowUpRight, Calendar, MapPin, Layers, Scale, Clock, Coins, Sun, Moon, Sparkles, Server, Database, CreditCard, Shield, User, KeyRound, LogOut, RefreshCw } from 'lucide-react';
import { CompanySettings } from '../../types';
import { formatDate } from '../../utils/formatters';
import { NavigationTab } from './Sidebar';
import { useM3Theme } from '../../design-system';
import { useAuth } from '../../context/AuthContext';

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
        return  null;
      case 'parties':
        return null;
      case 'items':
        if (!hasPermission('manage_inventory')) return null;
        return null
      case 'production':
        if (!hasPermission('manage_production')) return null;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('app-header-action', { detail: 'log-batch' }))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Batch Run</span>
            </button>
          </div>
        );
      case 'sales':
        if (!hasPermission('manage_sales')) return null;
        return null
      case 'purchases':
        if (!hasPermission('manage_purchases')) return null;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('app-header-action', { detail: 'add-purchase' }))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Purchase</span>
            </button>
          </div>
        );
      case 'logistics':
        return (
          <div className="flex items-center gap-2">
            {hasPermission('dispatch_trips') && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('app-header-action', { detail: 'logistics-slip' }))}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-[var(--color-success-container)] hover:opacity-90 text-[var(--color-on-success-container)] border border-[var(--color-success)]/30 font-semibold text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-2xs"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-success)]" />
                <span>Record Trip Slip</span>
              </button>
            )}
            {hasPermission('manage_fleet') && (
              <>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('app-header-action', { detail: 'logistics-vehicle' }))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] font-semibold text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="hidden sm:inline">Add Vehicle</span>
                  <span className="sm:hidden">Vehicle</span>
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('app-header-action', { detail: 'logistics-tyre' }))}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Register Tyre</span>
                  <span className="sm:hidden">Tyre</span>
                </button>
              </>
            )}
          </div>
        );
      case 'employees':
        return (
          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasPermission('process_payroll') && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('app-header-action', { detail: 'record-employee-payment' }))}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 bg-[var(--color-warning-container)] hover:opacity-90 text-[var(--color-on-warning-container)] border border-[var(--color-warning)]/30 font-semibold text-[10px] sm:text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-2xs"
              >
                <Coins className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                <span className="hidden md:inline">Record Pay / Advance</span>
                <span className="md:hidden">Pay</span>
              </button>
            )}
            {hasPermission('manage_employees') && (
              <>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('app-header-action', { detail: 'apply-employee-leave' }))}
                  className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] font-semibold text-[10px] sm:text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-2xs"
                >
                  <Calendar className="w-3.5 h-3.5 text-[var(--color-on-surface-variant)]" />
                  <span>Leave</span>
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('app-header-action', { detail: 'add-employee' }))}
                  className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-semibold text-[10px] sm:text-xs rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add Employee</span>
                  <span className="sm:hidden">Employee</span>
                </button>
              </>
            )}
          </div>
        );
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

        {/* Theme Mode & Contrast Controls (Only shown on Settings & Design System pages) */}
        {(activeTab === 'settings' || activeTab === 'design-system') && (
          <div className="flex items-center gap-1 bg-[var(--color-surface-container-high)] p-1 rounded-full border border-[var(--color-outline-variant)]">
            <button
              onClick={toggleMode}
              className="p-1.5 rounded-full text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface)] transition-all"
              title={`Switch to ${mode === 'light' ? 'Dark' : 'Light'} Mode`}
              aria-label="Toggle Theme Mode"
            >
              {mode === 'light' ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              )}
            </button>

            <select
              value={contrast}
              onChange={(e) => setContrast(e.target.value as any)}
              className="bg-transparent text-[11px] font-semibold text-[var(--color-on-surface)] px-1.5 py-0.5 outline-none cursor-pointer rounded-full hover:bg-[var(--color-surface)]"
              title="M3 Contrast Level"
            >
              <option value="standard" className="bg-[var(--color-surface)] text-[var(--color-on-surface)]">Std Contrast</option>
              <option value="medium" className="bg-[var(--color-surface)] text-[var(--color-on-surface)]">Med Contrast</option>
              <option value="high" className="bg-[var(--color-surface)] text-[var(--color-on-surface)]">High Contrast (AAA)</option>
            </select>
          </div>
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
                  {onOpenAuthModal && (
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenAuthModal();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] rounded-xl text-left transition-all"
                    >
                      <User className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Account Profile & Security</span>
                    </button>
                  )}

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
