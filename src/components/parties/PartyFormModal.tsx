import React, { useState, useEffect } from 'react';
import { X, Building2, User, Phone, MapPin, CreditCard, ShieldCheck, AlertCircle, Info, Sparkles } from 'lucide-react';
import { Party, PartyType, PartyCategory } from '../../types';
import { INDIAN_STATES, validateGSTIN } from '../../utils/formatters';

interface PartyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (partyData: Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>) => void;
  initialParty?: Party | null;
  currencySymbol?: string;
}

const CATEGORIES: PartyCategory[] = [
  'Bitumen & Emulsion',
  'Stone Aggregates & GSB',
  'Cement & Flyash',
  'Fuel, Diesel & Oils',
  'Machinery, Spares & Maintenance',
  'Road Contracting Client',
  'Govt Dept (NHAI/PWD/MSRDC)',
  'Private Developer',
  'Transporter & Logistics',
  'General Supplies',
];

export function PartyFormModal({
  isOpen,
  onClose,
  onSave,
  initialParty,
  currencySymbol = '₹',
}: PartyFormModalProps) {
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [type, setType] = useState<PartyType>('customer');
  const [category, setCategory] = useState<PartyCategory>('Road Contracting Client');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Maharashtra');
  const [stateCode, setStateCode] = useState('27');
  const [pincode, setPincode] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [creditLimit, setCreditLimit] = useState('5000000');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingBalanceType, setOpeningBalanceType] = useState<'to_receive' | 'to_pay'>('to_receive');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [gstValidation, setGstValidation] = useState<{ isValid: boolean; stateName?: string; message?: string }>({
    isValid: true,
  });

  useEffect(() => {
    if (initialParty) {
      setName(initialParty.name || '');
      setTradeName(initialParty.tradeName || '');
      setType(initialParty.type || 'customer');
      setCategory(initialParty.category || 'Road Contracting Client');
      setGstin(initialParty.gstin || '');
      setPan(initialParty.pan || '');
      setContactPerson(initialParty.contactPerson || '');
      setPhone(initialParty.phone || '');
      setEmail(initialParty.email || '');
      setStreet(initialParty.address?.street || '');
      setCity(initialParty.address?.city || '');
      setState(initialParty.address?.state || 'Maharashtra');
      setStateCode(initialParty.address?.stateCode || '27');
      setPincode(initialParty.address?.pincode || '');
      setPaymentTermsDays(String(initialParty.paymentTermsDays || 30));
      setCreditLimit(String(initialParty.creditLimit || 0));
      setOpeningBalance(String(initialParty.openingBalance || 0));
      setOpeningBalanceType(initialParty.openingBalanceType || 'to_receive');
      setNotes(initialParty.notes || '');
      setIsActive(initialParty.isActive ?? true);
      if (initialParty.gstin) {
        setGstValidation(validateGSTIN(initialParty.gstin));
      }
    } else {
      // Default new form values
      setName('');
      setTradeName('');
      setType('customer');
      setCategory('Road Contracting Client');
      setGstin('');
      setPan('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setStreet('');
      setCity('Pune');
      setState('Maharashtra');
      setStateCode('27');
      setPincode('411026');
      setPaymentTermsDays('30');
      setCreditLimit('3000000');
      setOpeningBalance('0');
      setOpeningBalanceType('to_receive');
      setNotes('');
      setIsActive(true);
      setError('');
      setGstValidation({ isValid: true });
    }
  }, [initialParty, isOpen]);

  if (!isOpen) return null;

  // Handle GSTIN change and auto-extract PAN & State
  const handleGstinChange = (val: string) => {
    const uppercaseVal = val.toUpperCase().trim();
    setGstin(uppercaseVal);
    if (uppercaseVal) {
      const validation = validateGSTIN(uppercaseVal);
      setGstValidation(validation);
      if (validation.pan && !pan) {
        setPan(validation.pan);
      }
      if (validation.stateName) {
        const found = INDIAN_STATES.find((s) => s.code === uppercaseVal.substring(0, 2));
        if (found) {
          setState(found.name);
          setStateCode(found.code);
        }
      }
    } else {
      setGstValidation({ isValid: true });
    }
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = INDIAN_STATES.find((s) => s.name === e.target.value);
    if (selected) {
      setState(selected.name);
      setStateCode(selected.code);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter the Party / Company Name.');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter a Contact Phone Number.');
      return;
    }

    if (gstin && !gstValidation.isValid) {
      setError('Please enter a valid 15-character GSTIN or leave it blank.');
      return;
    }

    onSave({
      name: name.trim(),
      tradeName: tradeName.trim(),
      type,
      category,
      gstin: gstin.trim(),
      pan: pan.trim(),
      contactPerson: contactPerson.trim() || name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: {
        street: street.trim(),
        city: city.trim(),
        state,
        stateCode,
        pincode: pincode.trim(),
      },
      paymentTermsDays: parseInt(paymentTermsDays) || 30,
      creditLimit: parseFloat(creditLimit) || 0,
      openingBalance: parseFloat(openingBalance) || 0,
      openingBalanceType,
      notes: notes.trim(),
      isActive,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-3xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-primary)] flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-on-surface)]">
                {initialParty ? 'Edit Party Profile' : 'Add New Party / Business Partner'}
              </h2>
              
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] rounded-full hover:bg-[var(--color-surface-container-high)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--color-error-container)] border border-[var(--color-error)]/20 text-[var(--color-on-error-container)] text-xs rounded-2xl font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 2. Basic Identification */}
          <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
            <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--color-primary)]" />
              Company Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Legal Registered Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. National Highways Authority of India"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError('');
                  }}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Trade / Project / Site Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. NHAI Pkg 4 Expressway Camp"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                Business Category *
              </label>
              <select
                value={category}
                onChange={(e: any) => setCategory(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. GSTIN & Tax Compliance */}
          <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" />
                GSTIN & Tax Information (India)
              </h3>
              <span className="text-[11px] text-[var(--color-on-surface-variant)] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[var(--color-primary)]" />
                Auto-extracts PAN & State
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  15-Digit GSTIN (Goods & Service Tax ID)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 27AAAGN0123E1Z4"
                  value={gstin}
                  onChange={(e) => handleGstinChange(e.target.value)}
                  className={`w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border rounded-full text-xs font-mono uppercase tracking-wider focus:outline-none focus:ring-2 ${
                    gstin && !gstValidation.isValid
                      ? 'border-[var(--color-error)] focus:ring-[var(--color-error)] text-[var(--color-error)]'
                      : 'border-[var(--color-outline-variant)] focus:ring-[var(--color-primary)] text-[var(--color-on-surface)]'
                  }`}
                />
                {gstin && (
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
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  PAN (Permanent Account Number)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="e.g. AAAGN0123E"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase().trim())}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-mono uppercase tracking-wider text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>
          </div>

          {/* 4. Contact Details */}
          <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
            <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-[var(--color-primary)]" />
              Contact Personnel
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Key Contact Person
                </label>
                <input
                  type="text"
                  placeholder="e.g. Er. Sandeep Deshmukh"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Phone / WhatsApp Mobile *
                </label>
                <input
                  type="text"
                  placeholder="e.g. +91 98220 44556"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError('');
                  }}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. piu.pune@nhai.gov.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>
          </div>

          {/* 5. Address & Plant/Site Location */}
          <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
            <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[var(--color-error)]" />
              Billing & Site Location
            </h3>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                Street / Site Office / Quarry Address
              </label>
              <input
                type="text"
                placeholder="e.g. Expressway PIU Office, Sector 12, Nigdi or Quarry Gat No 182"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">City / District</label>
                <input
                  type="text"
                  placeholder="e.g. Pune"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">Indian State</label>
                <select
                  value={state}
                  onChange={handleStateChange}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
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
                  maxLength={6}
                  placeholder="e.g. 411044"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>
          </div>

          {/* 6. Financial & Credit Terms */}
          <div className="bg-[var(--color-surface-container)] p-4 rounded-2xl border border-[var(--color-outline-variant)] space-y-4">
            <h3 className="text-xs font-bold text-[var(--color-on-surface)] uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--color-primary)]" />
              Financial Terms & Opening Balance
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Credit Period (Days)
                </label>
                <select
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="0">0 Days (Immediate / Advance)</option>
                  <option value="7">7 Days (Weekly cycle)</option>
                  <option value="15">15 Days (Fortnightly)</option>
                  <option value="30">30 Days (Standard Monthly)</option>
                  <option value="45">45 Days (Govt / NHAI Pkg)</option>
                  <option value="60">60 Days (Tender terms)</option>
                  <option value="90">90 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                  Credit Limit ({currencySymbol})
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000000"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>

            {/* Opening Balance */}
            <div className="pt-2 border-t border-[var(--color-outline-variant)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    Opening Balance Amount ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    disabled={!!initialParty}
                    title={initialParty ? 'Opening Balance is fixed after party creation.' : undefined}
                    className="w-full px-4 py-2 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-full text-xs font-bold text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
                    Balance Nature
                  </label>
                  <div className="flex rounded-full overflow-hidden border border-[var(--color-outline-variant)] p-0.5 bg-[var(--color-surface-container-lowest)]">
                    <button
                      type="button"
                      onClick={() => setOpeningBalanceType('to_receive')}
                      disabled={!!initialParty}
                      title={initialParty ? 'Balance Nature is fixed after party creation.' : undefined}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-colors ${
                        openingBalanceType === 'to_receive'
                          ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-2xs'
                          : 'bg-transparent text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      To Receive (Dr)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpeningBalanceType('to_pay')}
                      disabled={!!initialParty}
                      title={initialParty ? 'Balance Nature is fixed after party creation.' : undefined}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-colors ${
                        openingBalanceType === 'to_pay'
                          ? 'bg-[var(--color-error)] text-[var(--color-on-error)] shadow-2xs'
                          : 'bg-transparent text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      To Pay (Cr)
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-1">
                {openingBalanceType === 'to_receive'
                  ? 'They owe money to your company (Receivable asset).'
                  : 'You owe money to them (Payable liability).'}
              </p>
            </div>
          </div>

          {/* 7. Operational Notes */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-on-surface-variant)] mb-1">
              Operational / Site Delivery Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Special asphalt mix specifications, preferred tanker entry gate, batching certificate requirements..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-2xl text-xs text-[var(--color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[var(--color-outline-variant)] flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-[var(--color-primary)] rounded border-[var(--color-outline-variant)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-xs font-medium text-[var(--color-on-surface-variant)]">Active Business Party</span>
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-[var(--color-primary)] hover:opacity-90 text-[var(--color-on-primary)] font-medium text-xs rounded-full shadow-xs transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {initialParty ? 'Update Party' : 'Save Party'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
