import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Check,
  MapPin,
} from 'lucide-react';
import { CompanySettings } from '../../types';
import { INDIAN_STATES, validateGSTIN } from '../../utils/formatters';
import { useToast } from '../common/Toast';

interface SettingsViewProps {
  settings: CompanySettings;
  onUpdateSettings: (newSettings: Partial<CompanySettings>) => void;
  onOpenBackendStatus?: () => void;
}

export function SettingsView({ settings, onUpdateSettings }: SettingsViewProps) {
  const { showToast } = useToast();

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
    regPincode !== settings.registeredAddress.pincode;

  const [gstValidation, setGstValidation] = useState(validateGSTIN(settings.gstin));

  // The form states above initialize ONCE at mount from the settings prop.
  // If this screen opens before the initial cloud sync lands (settings still
  // seed/empty), the snapshot that arrives later must be folded into the
  // inputs — otherwise the fields stay empty until a remount. The form is
  // only repopulated while the user has NOT made unsaved edits (typing sets
  // the ref via the form's onInput), so in-flight typing is never clobbered.
  const formEditedRef = useRef(false);
  useEffect(() => {
    if (formEditedRef.current) return;
    setCompanyName(settings.companyName);
    setTradeName(settings.tradeName);
    setTagline(settings.tagline);
    setGstin(settings.gstin);
    setPan(settings.pan);
    setCin(settings.cin || '');
    setPhone(settings.phone);
    setEmail(settings.email);
    setWebsite(settings.website || '');
    setRegStreet(settings.registeredAddress.street);
    setRegCity(settings.registeredAddress.city);
    setRegState(settings.registeredAddress.state);
    setRegStateCode(settings.registeredAddress.stateCode);
    setRegPincode(settings.registeredAddress.pincode);
    setGstValidation(validateGSTIN(settings.gstin));
  }, [settings]);

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
    });

    // The saved snapshot flows back through onUpdateSettings → the settings
    // prop; let the hydration effect re-sync the inputs from it again.
    formEditedRef.current = false;

    showToast('Company settings updated and saved successfully!');
  };

  return (
    <div className="space-y-6">

      {/* Company Profile */}
      <form onSubmit={handleSaveAll} onInput={() => { formEditedRef.current = true; }} className="space-y-6">
        {/* Company Profile & Plant Location */}
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
