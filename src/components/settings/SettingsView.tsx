import React, { useState, useRef } from 'react';
import {
  Building2,
  CreditCard,
  FileText,
  DollarSign,
  Database,
  Download,
  Upload,
  RotateCcw,
  Check,
  ShieldCheck,
  MapPin,
  Sparkles,
  Phone,
  Mail,
  Globe,
  AlertCircle,
  Cloud,
} from 'lucide-react';
import { CompanySettings } from '../../types';
import { INDIAN_STATES, validateGSTIN } from '../../utils/formatters';
import { useToast } from '../common/Toast';
import { cloudStore as localDb } from '../../services/cloudStore';
import { api } from '../../services/api';
import { M3Tabs } from '../../design-system';

interface SettingsViewProps {
  settings: CompanySettings;
  onUpdateSettings: (newSettings: Partial<CompanySettings>) => void;
  onOpenBackendStatus?: () => void;
}

export function SettingsView({ settings, onUpdateSettings, onOpenBackendStatus }: SettingsViewProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'currency' | 'prefixes' | 'database'>('profile');

  // Form states initialized from settings
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [tradeName, setTradeName] = useState(settings.tradeName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [gstin, setGstin] = useState(settings.gstin);
  const [pan, setPan] = useState(settings.pan);
  const [cin, setCin] = useState(settings.cin || '');
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [website, setWebsite] = useState(settings.website || '');

  // Registered Address
  const [regStreet, setRegStreet] = useState(settings.registeredAddress.street);
  const [regCity, setRegCity] = useState(settings.registeredAddress.city);
  const [regState, setRegState] = useState(settings.registeredAddress.state);
  const [regStateCode, setRegStateCode] = useState(settings.registeredAddress.stateCode);
  const [regPincode, setRegPincode] = useState(settings.registeredAddress.pincode);

  // Currency & Preferences
  const [currencySymbol, setCurrencySymbol] = useState(settings.currency.symbol);
  const [currencyCode, setCurrencyCode] = useState(settings.currency.code);
  const [currencyFormat, setCurrencyFormat] = useState<'indian' | 'international'>(settings.currency.format);
  const [defaultPaymentTermsDays, setDefaultPaymentTermsDays] = useState(String(settings.defaultPaymentTermsDays));

  // Prefixes & Signatory
  const [salesPrefix, setSalesPrefix] = useState(settings.prefixes.salesInvoice);
  const [purchasePrefix, setPurchasePrefix] = useState(settings.prefixes.purchaseBill);
  const [challanPrefix, setChallanPrefix] = useState(settings.prefixes.dispatchChallan);
  const [receiptPrefix, setReceiptPrefix] = useState(settings.prefixes.paymentReceipt);
  const [authorizedSignatoryName, setAuthorizedSignatoryName] = useState(settings.authorizedSignatoryName);
  const [authorizedSignatoryDesignation, setAuthorizedSignatoryDesignation] = useState(
    settings.authorizedSignatoryDesignation
  );
  const [invoiceNotes, setInvoiceNotes] = useState(settings.invoiceNotes);

  const hasChanges =
    companyName !== settings.companyName ||
    tradeName !== settings.tradeName ||
    tagline !== settings.tagline ||
    gstin !== settings.gstin ||
    pan !== settings.pan ||
    (cin || '') !== (settings.cin || '') ||
    phone !== settings.phone ||
    email !== settings.email ||
    (website || '') !== (settings.website || '') ||
    regStreet !== settings.registeredAddress.street ||
    regCity !== settings.registeredAddress.city ||
    regState !== settings.registeredAddress.state ||
    regStateCode !== settings.registeredAddress.stateCode ||
    regPincode !== settings.registeredAddress.pincode ||
    currencySymbol !== settings.currency.symbol ||
    currencyCode !== settings.currency.code ||
    currencyFormat !== settings.currency.format ||
    defaultPaymentTermsDays !== String(settings.defaultPaymentTermsDays) ||
    salesPrefix !== settings.prefixes.salesInvoice ||
    purchasePrefix !== settings.prefixes.purchaseBill ||
    challanPrefix !== settings.prefixes.dispatchChallan ||
    receiptPrefix !== settings.prefixes.paymentReceipt ||
    authorizedSignatoryName !== settings.authorizedSignatoryName ||
    authorizedSignatoryDesignation !== settings.authorizedSignatoryDesignation ||
    invoiceNotes !== settings.invoiceNotes;

  const [gstValidation, setGstValidation] = useState(validateGSTIN(settings.gstin));

  const handleGstinChange = (val: string) => {
    const clean = val.toUpperCase().trim();
    setGstin(clean);
    const valid = validateGSTIN(clean);
    setGstValidation(valid);
    if (valid.pan && !pan) setPan(valid.pan);
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();

    onUpdateSettings({
      companyName: companyName.trim(),
      tradeName: tradeName.trim(),
      tagline: tagline.trim(),
      gstin: gstin.trim(),
      pan: pan.trim(),
      cin: cin.trim() || undefined,
      phone: phone.trim(),
      email: email.trim(),
      website: website.trim() || undefined,
      registeredAddress: {
        street: regStreet.trim(),
        city: regCity.trim(),
        state: regState,
        stateCode: regStateCode,
        pincode: regPincode.trim(),
      },
      currency: {
        code: currencyCode,
        symbol: currencySymbol,
        name: currencyCode === 'INR' ? 'Indian Rupee' : currencyCode,
        format: currencyFormat,
      },
      defaultPaymentTermsDays: parseInt(defaultPaymentTermsDays) || 30,
      prefixes: {
        salesInvoice: salesPrefix.trim(),
        purchaseBill: purchasePrefix.trim(),
        dispatchChallan: challanPrefix.trim(),
        paymentReceipt: receiptPrefix.trim(),
      },
      authorizedSignatoryName: authorizedSignatoryName.trim(),
      authorizedSignatoryDesignation: authorizedSignatoryDesignation.trim(),
      invoiceNotes: invoiceNotes.trim(),
    });

    showToast('Company settings updated and saved successfully!');
  };

  // Backup & Restore Actions
  const handleExportBackup = () => {
    const backupJson = localDb.exportBackup();
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ops_mgmt_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Complete database backup exported to JSON!');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = localDb.importBackup(content);
      if (result.success) {
        showToast('Database restored successfully from backup!');
      } else {
        showToast(result.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleResetDemoData = async () => {
    if (confirm('Are you sure you want to purge all demo data and start with a clean, production-ready database?')) {
      try {
        const res = await api.purgeDemoData();
        await localDb.syncWithServer(true);
        showToast(res.message || 'All demo data has been purged. Database is now in a clean production state.', 'success');
      } catch (err: any) {
        showToast(err.message || 'Failed to purge demo data', 'error');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Tabs Navigation - Fixed/Sticky below Top App Bar */}
      <div className="sticky top-16 z-20 bg-[var(--color-surface)]/95 backdrop-blur-md -mt-4 sm:-mt-6 lg:-mt-8 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3 border-b border-[var(--color-outline-variant)] shadow-2xs transition-colors">
        <div className="max-w-7xl mx-auto">
          <M3Tabs
            tabs={[
              { id: 'profile', label: 'Company Profile', icon: Building2 },
              { id: 'currency', label: 'Currency & Preferences', icon: DollarSign },
              { id: 'prefixes', label: 'Vouchers & Invoice Formats', icon: FileText },
              { id: 'database', label: 'Cloud Database & Snapshots', icon: Database },
            ]}
            activeTab={activeTab}
            onChange={(tabId) => setActiveTab(tabId as any)}
            variant="primary"
          />
        </div>
      </div>

      {/* Tab Contents */}
      <form onSubmit={handleSaveAll} className="space-y-6">
        {/* TAB 1: Company Profile & Plant Location */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Legal Entity */}
            <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4">
              <h2 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--color-primary-container)] text-[var(--color-primary)]">
                  <Building2 className="w-4 h-4" />
                </div>
                Legal Entity & Business Identification
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    Company Registered Name *
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    Trade / Operational Name
                  </label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Tagline / Business Descriptor
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              {/* GSTIN & PAN */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--color-outline-variant)]">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    GSTIN (15 Digits) *
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={gstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  />
                  {gstValidation.message && (
                    <p
                      className={`text-[11px] mt-1 font-medium ${
                        gstValidation.isValid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                      }`}
                    >
                      {gstValidation.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">PAN *</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase().trim())}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">CIN (Optional)</label>
                  <input
                    type="text"
                    value={cin}
                    onChange={(e) => setCin(e.target.value.toUpperCase().trim())}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono uppercase tracking-wider text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--color-outline-variant)]">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Primary Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Official Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Website</label>
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Registered Office Address */}
            <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4">
              <h2 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
                  <MapPin className="w-4 h-4" />
                </div>
                Registered Corporate Office Address
              </h2>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Street Address</label>
                <input
                  type="text"
                  value={regStreet}
                  onChange={(e) => setRegStreet(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">City</label>
                  <input
                    type="text"
                    value={regCity}
                    onChange={(e) => setRegCity(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">State</label>
                  <select
                    value={regState}
                    onChange={(e) => {
                      const found = INDIAN_STATES.find((s) => s.name === e.target.value);
                      if (found) {
                        setRegState(found.name);
                        setRegStateCode(found.code);
                      }
                    }}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={s.name}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">PIN Code</label>
                  <input
                    type="text"
                    value={regPincode}
                    onChange={(e) => setRegPincode(e.target.value)}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Currency & Preferences */}
        {activeTab === 'currency' && (
          <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4 animate-in fade-in duration-150">
            <h2 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[var(--color-primary-container)] text-[var(--color-primary)]">
                <DollarSign className="w-4 h-4" />
              </div>
              Currency & Regional Preferences
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Currency Code</label>
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="INR">INR (Indian Rupee ₹)</option>
                  <option value="USD">USD (US Dollar $)</option>
                  <option value="EUR">EUR (Euro €)</option>
                  <option value="AED">AED (UAE Dirham)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Number Formatting</label>
                <select
                  value={currencyFormat}
                  onChange={(e: any) => setCurrencyFormat(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="indian">Indian (Lakhs/Crores: ₹ 1,50,000)</option>
                  <option value="international">International (Millions: ₹ 150,000)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-1 gap-4 pt-2 border-t border-[var(--color-outline-variant)]">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Default Payment Terms (Days)
                </label>
                <select
                  value={defaultPaymentTermsDays}
                  onChange={(e) => setDefaultPaymentTermsDays(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="0">0 Days (Advance / Cash)</option>
                  <option value="15">15 Days</option>
                  <option value="30">30 Days (Standard)</option>
                  <option value="45">45 Days (Govt Pkg)</option>
                  <option value="60">60 Days</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Vouchers & Prefixes */}
        {activeTab === 'prefixes' && (
          <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4 animate-in fade-in duration-150">
            <h2 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]">
                <FileText className="w-4 h-4" />
              </div>
              Document Numbering & Invoicing Standards
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Sales Invoice Prefix</label>
                <input
                  type="text"
                  value={salesPrefix}
                  onChange={(e) => setSalesPrefix(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Purchase Bill Prefix</label>
                <input
                  type="text"
                  value={purchasePrefix}
                  onChange={(e) => setPurchasePrefix(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Dispatch Challan Prefix</label>
                <input
                  type="text"
                  value={challanPrefix}
                  onChange={(e) => setChallanPrefix(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Receipt / Payment Prefix</label>
                <input
                  type="text"
                  value={receiptPrefix}
                  onChange={(e) => setReceiptPrefix(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--color-outline-variant)]">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Authorized Signatory Name
                </label>
                <input
                  type="text"
                  value={authorizedSignatoryName}
                  onChange={(e) => setAuthorizedSignatoryName(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Signatory Designation
                </label>
                <input
                  type="text"
                  value={authorizedSignatoryDesignation}
                  onChange={(e) => setAuthorizedSignatoryDesignation(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                Standard Terms & Conditions for Invoices/Ledgers
              </label>
              <textarea
                rows={3}
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>
        )}

        {/* TAB 5: Azure MySQL Flexible Server & Cloud Database Architecture */}
        {activeTab === 'database' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                      <Database className="w-4 h-4" />
                    </div>
                    Azure MySQL Flexible Server Architecture
                  </h2>
                  <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
                    Single authoritative cloud database engine with direct multi-table ACID transactions.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-bold rounded-full flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Cloud-First Authoritative
                  </span>
                  {onOpenBackendStatus && (
                    <button
                      type="button"
                      onClick={onOpenBackendStatus}
                      className="px-3 py-1 bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] text-xs font-bold rounded-full hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      Open Diagnostic Console
                    </button>
                  )}
                </div>
              </div>

              {/* Architecture Feature Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-1">
                  <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-semibold">Primary Database Engine</span>
                  <span className="font-bold text-[var(--color-on-surface)]">Azure MySQL Flexible Server</span>
                  <span className="text-[10px] text-emerald-600 block">TLS 1.2+ Enforced • Port 3306</span>
                </div>
                <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-1">
                  <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-semibold">Concurrency & Pooling</span>
                  <span className="font-bold text-[var(--color-on-surface)]">100+ Concurrent Operators</span>
                  <span className="text-[10px] text-[var(--color-primary)] block">30 Pooled Connections with Keep-Alive</span>
                </div>
                <div className="p-3 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-1">
                  <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-semibold">Client Storage Policy</span>
                  <span className="font-bold text-[var(--color-on-surface)]">Zero Split-Brain Divergence</span>
                  <span className="text-[10px] text-zinc-500 block">localStorage decommissioned for business records</span>
                </div>
              </div>

              {/* Backup & Data Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3">
                <div className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-on-surface)]">
                    <Download className="w-4 h-4 text-[var(--color-primary)]" />
                    Export Cloud Snapshot
                  </div>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                    Download an authoritative JSON snapshot of all parties, transactions, ledgers, items, and settings.
                  </p>
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="w-full py-2 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-bold text-xs rounded-full shadow-xs transition-opacity"
                  >
                    Download Snapshot JSON
                  </button>
                </div>

                <div className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-on-surface)]">
                    <Upload className="w-4 h-4 text-[var(--color-secondary)]" />
                    Restore Cloud Snapshot
                  </div>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                    Upload a verified snapshot JSON file to sync entities directly with the cloud database.
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportFile}
                    accept=".json"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 bg-[var(--color-secondary)] hover:opacity-90 text-[var(--color-on-secondary)] font-bold text-xs rounded-full shadow-xs transition-opacity"
                  >
                    Select Snapshot File
                  </button>
                </div>

                <div className="p-4 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-on-surface)]">
                    <RotateCcw className="w-4 h-4 text-[var(--color-error)]" />
                    Clean Production Slate
                  </div>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                    Purge all mock demo transactions, sample entities, and test data to start fresh in production.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetDemoData}
                    className="w-full py-2 bg-[var(--color-error-container)] hover:opacity-90 text-[var(--color-on-error-container)] font-bold text-xs rounded-full transition-opacity"
                  >
                    Purge All Demo Data
                  </button>
                </div>
              </div>
            </div>

            {/* AWS S3 Evidence Vault Integration Card */}
            <div className="bg-[var(--color-surface-container-high)] p-6 rounded-[28px] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-on-surface)]">
                      Amazon Web Services S3 Evidence Vault
                    </h3>
                    <p className="text-xs text-[var(--color-on-surface-variant)]">
                      Pre-signed URL direct upload pipeline for weighbridge receipts, bitumen QC certificates, and challans.
                    </p>
                  </div>
                </div>
                {onOpenBackendStatus && (
                  <button
                    type="button"
                    onClick={onOpenBackendStatus}
                    className="px-3 py-1 bg-[var(--color-surface)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] text-xs font-semibold rounded-full hover:bg-[var(--color-surface-container-highest)] transition-colors"
                  >
                    View S3 Status
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed max-w-2xl">
                Documents and test certificates bypass server memory and are uploaded directly to the S3 bucket using authenticated pre-signed URLs. When AWS S3 credentials are not configured, files seamlessly save to the server's local evidence vault without disruption.
              </p>
            </div>
          </div>
        )}

        {/* Global Save Button at bottom */}
        <div className="sticky bottom-0 z-20 bg-[var(--color-surface)]/95 backdrop-blur-md py-4 border-t border-[var(--color-outline-variant)] flex items-center justify-end gap-3 mt-8 shadow-xs">
          <button
            type="submit"
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-6 py-2.5 font-bold text-xs rounded-full shadow-xs transition-all ${
              hasChanges
                ? 'bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] hover:scale-[1.01] cursor-pointer'
                : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] opacity-50 cursor-not-allowed'
            }`}
          >
            <Check className="w-4 h-4" />
            {hasChanges ? 'Save Changes' : 'All Settings Saved'}
          </button>
        </div>
      </form>
    </div>
  );
}
