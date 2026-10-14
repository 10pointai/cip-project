import React, { useState, useRef, useMemo } from 'react';
import {
  Plus,
  FileSpreadsheet,
  Trash2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Download,
  Building2,
  HelpCircle,
  RefreshCw,
  Sparkles,
  Check,
  ChevronDown,
} from 'lucide-react';
import { Party, PartyType, PartyCategory } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface BulkPartyRow {
  id: string;
  name: string;
  type: PartyType;
  gstin: string;
  mobile: string;
  email: string;
  city: string;
  openingBalance: string;
  notes?: string;
  category?: PartyCategory;
}

interface BulkPartyEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveParties: (parties: Array<Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>>) => void;
  currencySymbol?: string;
}

// GST State Code mapping for auto-inferring State & StateCode from 15-digit GSTIN
const GST_STATE_MAP: Record<string, { state: string; code: string }> = {
  '01': { state: 'Jammu & Kashmir', code: '01' },
  '02': { state: 'Himachal Pradesh', code: '02' },
  '03': { state: 'Punjab', code: '03' },
  '04': { state: 'Chandigarh', code: '04' },
  '05': { state: 'Uttarakhand', code: '05' },
  '06': { state: 'Haryana', code: '06' },
  '07': { state: 'Delhi', code: '07' },
  '08': { state: 'Rajasthan', code: '08' },
  '09': { state: 'Uttar Pradesh', code: '09' },
  '10': { state: 'Bihar', code: '10' },
  '11': { state: 'Sikkim', code: '11' },
  '12': { state: 'Arunachal Pradesh', code: '12' },
  '13': { state: 'Nagaland', code: '13' },
  '14': { state: 'Manipur', code: '14' },
  '15': { state: 'Mizoram', code: '15' },
  '16': { state: 'Tripura', code: '16' },
  '17': { state: 'Meghalaya', code: '17' },
  '18': { state: 'Assam', code: '18' },
  '19': { state: 'West Bengal', code: '19' },
  '20': { state: 'Jharkhand', code: '20' },
  '21': { state: 'Odisha', code: '21' },
  '22': { state: 'Chhattisgarh', code: '22' },
  '23': { state: 'Madhya Pradesh', code: '23' },
  '24': { state: 'Gujarat', code: '24' },
  '26': { state: 'Dadra & Nagar Haveli', code: '26' },
  '27': { state: 'Maharashtra', code: '27' },
  '29': { state: 'Karnataka', code: '29' },
  '30': { state: 'Goa', code: '30' },
  '31': { state: 'Lakshadweep', code: '31' },
  '32': { state: 'Kerala', code: '32' },
  '33': { state: 'Tamil Nadu', code: '33' },
  '34': { state: 'Puducherry', code: '34' },
  '36': { state: 'Telangana', code: '36' },
  '37': { state: 'Andhra Pradesh', code: '37' },
  '38': { state: 'Ladakh', code: '38' },
};

// Initial default rows exactly mimicking the design mockup
const createEmptyRow = (): BulkPartyRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
  name: '',
  type: 'vendor', // Supplier
  gstin: '',
  mobile: '',
  email: '',
  city: '',
  openingBalance: '0',
});

// Demo data matching user's design preview
const DEMO_ROWS: BulkPartyRow[] = [
  {
    id: 'demo-1',
    name: 'Shree Bala Traders',
    type: 'vendor',
    gstin: '08AABCS1234F1Z5',
    mobile: '9876543210',
    email: 'info@bala.com',
    city: 'Jaipur',
    openingBalance: '0',
  },
  {
    id: 'demo-2',
    name: 'R.K. Construction',
    type: 'customer',
    gstin: '27AAHCR5678K1Z1',
    mobile: '9812345678',
    email: 'rk@construction.com',
    city: 'Delhi',
    openingBalance: '25000',
  },
  {
    id: 'demo-3',
    name: 'Maa Bhagwati Suppliers',
    type: 'vendor',
    gstin: '09BBHPS7890L1Z3',
    mobile: '9876123456',
    email: 'contact@mbs.in',
    city: 'Lucknow',
    openingBalance: '0',
  },
  {
    id: 'demo-4',
    name: 'Gupta & Sons',
    type: 'customer',
    gstin: '',
    mobile: '9823456789',
    email: 'gupta.sons@gmail.com',
    city: 'Kanpur',
    openingBalance: '10500',
  },
  {
    id: 'demo-5',
    name: 'Shivam Enterprises',
    type: 'vendor',
    gstin: '24AABPP1122M1Z9',
    mobile: '9899988888',
    email: 'shivam@ent.com',
    city: 'Indore',
    openingBalance: '0',
  },
  createEmptyRow(),
  createEmptyRow(),
  createEmptyRow(),
];

export const BulkPartyEntryModal: React.FC<BulkPartyEntryModalProps> = ({
  isOpen,
  onClose,
  onSaveParties,
  currencySymbol = '₹',
}) => {
  // Initialize with 8 rows matching the mockup
  const [rows, setRows] = useState<BulkPartyRow[]>(() => {
    return Array.from({ length: 8 }, () => createEmptyRow());
  });

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  // Focus tracking for smooth arrow/tab navigation
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Handle cell edit
  const handleCellChange = (id: string, field: keyof BulkPartyRow, value: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        let processedValue = value;
        // Auto-uppercase GSTIN
        if (field === 'gstin') {
          processedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
        }
        // Numbers only for mobile
        if (field === 'mobile') {
          processedValue = value.replace(/\D/g, '').slice(0, 10);
        }

        return { ...row, [field]: processedValue };
      })
    );
  };

  // Add 1 row
  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  // Add 5 rows
  const handleAddFiveRows = () => {
    setRows((prev) => [
      ...prev,
      createEmptyRow(),
      createEmptyRow(),
      createEmptyRow(),
      createEmptyRow(),
      createEmptyRow(),
    ]);
  };

  // Delete row
  const handleDeleteRow = (id: string) => {
    if (rows.length <= 1) {
      // Keep at least one empty row
      setRows([createEmptyRow()]);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Clear all
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all rows? This cannot be undone.')) {
      setRows(Array.from({ length: 8 }, () => createEmptyRow()));
      setValidationAttempted(false);
    }
  };

  // Load mockup preview data
  const handleLoadDemo = () => {
    setRows(JSON.parse(JSON.stringify(DEMO_ROWS)));
    setValidationAttempted(false);
  };

  // Analyze rows for status indicators
  const rowStats = useMemo(() => {
    let filledCount = 0;
    let errorCount = 0;
    const errorsMap: Record<string, string[]> = {};

    rows.forEach((row, idx) => {
      const isFilled =
        row.name.trim() !== '' ||
        row.gstin.trim() !== '' ||
        row.mobile.trim() !== '' ||
        row.email.trim() !== '' ||
        row.city.trim() !== '' ||
        (Number(row.openingBalance) > 0);

      if (isFilled) {
        filledCount++;
        const rowErrors: string[] = [];

        // Party Name is mandatory for filled rows
        if (!row.name.trim()) {
          rowErrors.push('Party Name is required');
        }

        // GSTIN format check if provided
        if (row.gstin.trim() && row.gstin.trim().length !== 15) {
          rowErrors.push('GSTIN must be 15 alphanumeric characters');
        }

        // Mobile check if provided
        if (row.mobile.trim() && row.mobile.trim().length !== 10) {
          rowErrors.push('Mobile must be 10 digits');
        }

        // Email check if provided
        if (row.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
          rowErrors.push('Invalid email address format');
        }

        if (rowErrors.length > 0) {
          errorCount += rowErrors.length;
          errorsMap[row.id] = rowErrors;
        }
      }
    });

    return {
      totalRows: rows.length,
      filledCount,
      errorCount,
      errorsMap,
    };
  }, [rows]);

  // Handle smart paste from clipboard text
  const handleApplyPasteText = (text: string) => {
    if (!text.trim()) return;

    // Split lines
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const parsedRows: BulkPartyRow[] = [];

    // Check if first line is a header
    const firstLineLower = lines[0].toLowerCase();
    const hasHeader =
      firstLineLower.includes('name') ||
      firstLineLower.includes('party') ||
      firstLineLower.includes('type') ||
      firstLineLower.includes('gstin');

    const dataLines = hasHeader ? lines.slice(1) : lines;

    dataLines.forEach((line) => {
      // Split by tab (Excel/Sheets) or comma (CSV)
      const delimiter = line.includes('\t') ? '\t' : ',';
      const cols = line.split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim());

      if (cols.length === 0 || !cols[0]) return;

      const name = cols[0] || '';
      const rawType = (cols[1] || '').toLowerCase();
      let type: PartyType = 'vendor';
      if (rawType.includes('cust') || rawType.includes('client')) {
        type = 'customer';
      } else if (rawType.includes('trans') || rawType.includes('lorry') || rawType.includes('logistics')) {
        type = 'transporter';
      } else if (rawType.includes('both')) {
        type = 'both';
      }

      const gstin = (cols[2] || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
      const mobile = (cols[3] || '').replace(/\D/g, '').slice(0, 10);
      const email = cols[4] || '';
      const city = cols[5] || '';
      const balance = cols[6] ? cols[6].replace(/[^0-9.]/g, '') : '0';

      parsedRows.push({
        id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name,
        type,
        gstin,
        mobile,
        email,
        city,
        openingBalance: balance || '0',
      });
    });

    if (parsedRows.length > 0) {
      // Replace or append
      setRows(parsedRows);
      setIsPasteModalOpen(false);
      setPasteText('');
      setValidationAttempted(false);
    }
  };

  // Direct paste on table handler (Ctrl+V)
  const handleTablePaste = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData.getData('text');
    if (clipboardData && (clipboardData.includes('\t') || clipboardData.includes('\n'))) {
      // Multi-cell or multi-row paste detected
      e.preventDefault();
      handleApplyPasteText(clipboardData);
    }
  };

  // Review & Save Clicked
  const handleReviewAndSave = () => {
    setValidationAttempted(true);

    if (rowStats.filledCount === 0) {
      alert('Please fill in at least one party name before saving.');
      return;
    }

    if (rowStats.errorCount > 0) {
      alert(`Please fix the ${rowStats.errorCount} error(s) highlighted in red before proceeding.`);
      return;
    }

    // Open review modal
    setIsReviewModalOpen(true);
  };

  // Confirm final save
  const handleConfirmSave = () => {
    const filledRows = rows.filter((r) => r.name.trim() !== '');

    const partiesToCreate = filledRows.map((r) => {
      const gstinClean = r.gstin.trim();
      const statePrefix = gstinClean ? gstinClean.substring(0, 2) : '';
      const detectedState = GST_STATE_MAP[statePrefix] || { state: 'Maharashtra', code: '27' };

      const openBal = Number(r.openingBalance) || 0;
      // Opening balance type: Customers default to 'to_receive', Suppliers default to 'to_pay'
      const openBalType = r.type === 'customer' ? 'to_receive' : 'to_pay';

      // Smart default category based on party type
      const defaultCategory: PartyCategory =
        r.type === 'customer'
          ? 'Road Contracting Client'
          : r.type === 'transporter'
          ? 'Transporter & Logistics'
          : 'General Supplies';

      const partyData: Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'> = {
        name: r.name.trim(),
        tradeName: r.name.trim(),
        type: r.type,
        category: r.category || defaultCategory,
        gstin: gstinClean || undefined,
        pan: gstinClean && gstinClean.length >= 12 ? gstinClean.substring(2, 12) : undefined,
        contactPerson: r.name.trim(),
        phone: r.mobile.trim() ? `+91 ${r.mobile.trim()}` : '+91 98000 00000',
        email: r.email.trim() || undefined,
        address: {
          street: r.city.trim() ? `${r.city.trim()} Commercial Complex` : 'Industrial Zone',
          city: r.city.trim() || 'Mumbai',
          state: detectedState.state,
          stateCode: detectedState.code,
          pincode: '400001',
        },
        paymentTermsDays: 30,
        creditLimit: r.type === 'customer' ? 500000 : 0,
        openingBalance: openBal,
        openingBalanceType: openBalType,
        notes: `Bulk entered on ${new Date().toLocaleDateString()}`,
        isActive: true,
      };

      return partyData;
    });

    onSaveParties(partiesToCreate);
    setIsReviewModalOpen(false);
    onClose();
  };

  // Copy sample template to clipboard
  const handleCopySampleTemplate = () => {
    const template = `Party Name\tParty Type\tGSTIN\tMobile\tEmail\tCity\tOpening Balance
Shree Bala Traders\tSupplier\t08AABCS1234F1Z5\t9876543210\tinfo@bala.com\tJaipur\t0
R.K. Construction\tCustomer\t27AAHCR5678K1Z1\t9812345678\trk@construction.com\tDelhi\t25000
Maa Bhagwati Suppliers\tSupplier\t09BBHPS7890L1Z3\t9876123456\tcontact@mbs.in\tLucknow\t0`;

    navigator.clipboard.writeText(template);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div
      id="bulk-party-entry-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-[#001d34]/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        id="bulk-party-entry-modal"
        className="bg-[var(--color-surface-container-lowest)] w-full max-w-[1240px] rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] flex flex-col max-h-[95vh] overflow-hidden transition-all text-[var(--color-on-surface)]"
        onClick={(e) => e.stopPropagation()}
        onPaste={handleTablePaste}
      >
        {/* TOP HEADER - Exact visual layout from user design */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)]/60 bg-[var(--color-surface-container-lowest)] gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] flex items-center justify-center shadow-2xs">
              <Building2 className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--color-on-surface)]">
                Add Party Details
              </h2>
              <p className="text-xs text-[var(--color-outline)]">
                Fast spreadsheet-style bulk entry with keyboard navigation & Excel clipboard support
              </p>
            </div>
          </div>

          {/* Top Actions: + Add Row | Paste from Excel | Clear All */}
          <div className="flex items-center flex-wrap gap-2.5">
            <button
              id="bulk-load-demo-btn"
              onClick={handleLoadDemo}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] transition-all shadow-2xs"
              title="Load the 5 sample parties from mockup"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Load Mockup Data</span>
            </button>

            <button
              id="bulk-add-row-top-btn"
              onClick={handleAddRow}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-primary-container)]/30 active:bg-[var(--color-primary-container)]/50 transition-all shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Row</span>
            </button>

            <button
              id="bulk-paste-excel-btn"
              onClick={() => setIsPasteModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-primary-container)]/30 active:bg-[var(--color-primary-container)]/50 transition-all shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Paste from Excel</span>
            </button>

            <button
              id="bulk-clear-all-btn"
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full border border-[var(--color-error)]/30 text-[var(--color-error)] bg-[var(--color-error-container)]/30 hover:bg-[var(--color-error-container)]/60 transition-all shadow-2xs"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All</span>
            </button>

            <button
              id="bulk-close-btn"
              onClick={onClose}
              className="p-2 rounded-full text-[var(--color-outline)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-colors ml-1"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DATA GRID / TABLE CONTAINER */}
        <div
          ref={tableContainerRef}
          className="flex-1 overflow-auto p-4 sm:p-6 bg-[var(--color-surface-container-low)]/40"
        >
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/60 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1040px]">
                {/* Table Header matching mockup */}
                <thead>
                  <tr className="bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-variant)] text-xs font-semibold border-b border-[var(--color-outline-variant)]/60">
                    <th className="py-3.5 px-3 text-center w-12 text-[var(--color-outline)]">#</th>
                    <th className="py-3.5 px-3 min-w-[210px]">
                      Party Name <span className="text-[var(--color-error)]">*</span>
                    </th>
                    <th className="py-3.5 px-3 min-w-[140px]">
                      Party Type <span className="text-[var(--color-error)]">*</span>
                    </th>
                    <th className="py-3.5 px-3 min-w-[175px]">GSTIN</th>
                    <th className="py-3.5 px-3 min-w-[145px]">Mobile</th>
                    <th className="py-3.5 px-3 min-w-[190px]">Email</th>
                    <th className="py-3.5 px-3 min-w-[140px]">City</th>
                    <th className="py-3.5 px-3 min-w-[145px]">Opening Balance (₹)</th>
                    <th className="py-3.5 px-3 text-center w-16">Action</th>
                  </tr>
                </thead>

                {/* Table Rows */}
                <tbody className="divide-y divide-[var(--color-outline-variant)]/40 text-xs">
                  {rows.map((row, index) => {
                    const rowErrors = rowStats.errorsMap[row.id] || [];
                    const hasErrors = validationAttempted && rowErrors.length > 0;
                    const isRowFilled =
                      row.name.trim() !== '' ||
                      row.gstin.trim() !== '' ||
                      row.mobile.trim() !== '' ||
                      row.city.trim() !== '';

                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-[var(--color-surface-container-low)]/50 transition-colors ${
                          hasErrors ? 'bg-[var(--color-error-container)]/15' : ''
                        }`}
                      >
                        {/* # Row Number */}
                        <td className="py-2.5 px-3 text-center font-semibold text-[var(--color-outline)] select-none">
                          {index + 1}
                        </td>

                        {/* Party Name * */}
                        <td className="py-2.5 px-3">
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Enter party name"
                              value={row.name}
                              onChange={(e) => handleCellChange(row.id, 'name', e.target.value)}
                              className={`w-full px-3 py-2 bg-[var(--color-surface-container-lowest)] rounded-xl border text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]/60 focus:outline-none focus:ring-2 transition-all ${
                                hasErrors && !row.name.trim()
                                  ? 'border-[var(--color-error)] focus:ring-[var(--color-error)]'
                                  : 'border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'
                              }`}
                            />
                            {hasErrors && !row.name.trim() && (
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-error)]" title="Party Name is required">
                                <AlertCircle className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Party Type * */}
                        <td className="py-2.5 px-3">
                          <div className="relative">
                            <select
                              value={row.type}
                              onChange={(e) => handleCellChange(row.id, 'type', e.target.value)}
                              className="w-full appearance-none px-3 py-2 pr-8 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)] text-xs font-medium text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all cursor-pointer"
                            >
                              <option value="vendor">Supplier</option>
                              <option value="customer">Customer</option>
                              <option value="transporter">Transporter</option>
                              <option value="both">Both (Client & Vendor)</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-[var(--color-outline)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>

                        {/* GSTIN */}
                        <td className="py-2.5 px-3">
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Enter GSTIN"
                              maxLength={15}
                              value={row.gstin}
                              onChange={(e) => handleCellChange(row.id, 'gstin', e.target.value)}
                              className={`w-full px-3 py-2 bg-[var(--color-surface-container-lowest)] rounded-xl border text-xs font-mono uppercase text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]/60 focus:outline-none focus:ring-2 transition-all ${
                                hasErrors && row.gstin.trim() && row.gstin.trim().length !== 15
                                  ? 'border-[var(--color-error)] focus:ring-[var(--color-error)]'
                                  : 'border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'
                              }`}
                            />
                            {row.gstin.trim().length === 15 && (
                              <span
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded"
                                title={`State detected: ${GST_STATE_MAP[row.gstin.substring(0, 2)]?.state || 'Verified'}`}
                              >
                                {GST_STATE_MAP[row.gstin.substring(0, 2)]?.code || '✓'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Mobile */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            placeholder="Enter mobile"
                            maxLength={10}
                            value={row.mobile}
                            onChange={(e) => handleCellChange(row.id, 'mobile', e.target.value)}
                            className={`w-full px-3 py-2 bg-[var(--color-surface-container-lowest)] rounded-xl border text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]/60 focus:outline-none focus:ring-2 transition-all ${
                              hasErrors && row.mobile.trim() && row.mobile.trim().length !== 10
                                ? 'border-[var(--color-error)] focus:ring-[var(--color-error)]'
                                : 'border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'
                            }`}
                          />
                        </td>

                        {/* Email */}
                        <td className="py-2.5 px-3">
                          <input
                            type="email"
                            placeholder="Enter email"
                            value={row.email}
                            onChange={(e) => handleCellChange(row.id, 'email', e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)] text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]/60 focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
                          />
                        </td>

                        {/* City */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            placeholder="Enter city"
                            value={row.city}
                            onChange={(e) => handleCellChange(row.id, 'city', e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)] text-xs font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]/60 focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
                          />
                        </td>

                        {/* Opening Balance (₹) */}
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={row.openingBalance}
                            onChange={(e) => handleCellChange(row.id, 'openingBalance', e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--color-surface-container-lowest)] rounded-xl border border-[var(--color-outline-variant)] text-xs font-mono font-medium text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]/60 focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
                          />
                        </td>

                        {/* Action - Delete row icon button */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            className="p-1.5 text-[var(--color-outline)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-container)]/30 rounded-lg transition-colors"
                            title="Delete row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* BOTTOM FOOTER - Matching layout from user design */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-t border-[var(--color-outline-variant)]/60 bg-[var(--color-surface-container-lowest)] gap-4 shrink-0">
          {/* Left: + Add 5 More Rows */}
          <div className="flex items-center gap-2">
            <button
              id="bulk-add-5-rows-btn"
              onClick={handleAddFiveRows}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl border border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-primary-container)]/30 active:bg-[var(--color-primary-container)]/50 transition-all shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add 5 More Rows</span>
            </button>
          </div>

          {/* Center / Right: Status indicator + Review & Save */}
          <div className="flex items-center flex-wrap justify-between sm:justify-end gap-5">
            {/* Status indicators e.g. (✓) 8 rows | 5 filled | 0 errors */}
            <div className="flex items-center gap-3 text-xs font-semibold text-[var(--color-on-surface-variant)]">
              <div className="flex items-center gap-1.5">
                {rowStats.errorCount === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[var(--color-error)]" />
                )}
                <span>{rowStats.totalRows} rows</span>
              </div>
              <span className="text-[var(--color-outline-variant)]">|</span>
              <span className="text-[var(--color-on-surface)]">{rowStats.filledCount} filled</span>
              <span className="text-[var(--color-outline-variant)]">|</span>
              <span
                className={
                  rowStats.errorCount > 0
                    ? 'text-[var(--color-error)] font-bold'
                    : 'text-emerald-700'
                }
              >
                {rowStats.errorCount} {rowStats.errorCount === 1 ? 'error' : 'errors'}
              </span>
            </div>

            {/* Review & Save Button */}
            <button
              id="bulk-review-save-btn"
              onClick={handleReviewAndSave}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[var(--color-primary)] hover:opacity-95 active:scale-[0.98] text-[var(--color-on-primary)] text-sm font-semibold rounded-xl shadow-sm transition-all"
            >
              <span>Review & Save</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* PASTE FROM EXCEL MODAL */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#001d34]/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-[var(--color-surface-container-lowest)] w-full max-w-2xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-outline-variant)]/60 pb-3">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                  Paste Data from Excel / Google Sheets
                </h3>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="p-1 rounded-full text-[var(--color-outline)] hover:text-[var(--color-on-surface)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--color-outline)] leading-relaxed">
              Copy your columns from Microsoft Excel, Google Sheets, or CSV and paste them directly
              below. Supported column order:
              <br />
              <strong className="text-[var(--color-on-surface)] font-mono text-[11px]">
                Party Name | Party Type | GSTIN | Mobile | Email | City | Opening Balance
              </strong>
            </p>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-outline)] font-medium">
                Paste raw table data (Ctrl+V):
              </span>
              <button
                onClick={handleCopySampleTemplate}
                className="flex items-center gap-1 text-[var(--color-primary)] font-semibold hover:underline"
              >
                {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTemplate ? 'Copied to Clipboard!' : 'Copy Sample Excel Template'}</span>
              </button>
            </div>

            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste cells here...&#10;Example:&#10;Shree Bala Traders	Supplier	08AABCS1234F1Z5	9876543210	info@bala.com	Jaipur	0&#10;R.K. Construction	Customer	27AAHCR5678K1Z1	9812345678	rk@construction.com	Delhi	25000"
              className="w-full p-3 font-mono text-xs bg-[var(--color-surface-container-low)] rounded-xl border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]/50 focus:bg-[var(--color-surface-container-lowest)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-full text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApplyPasteText(pasteText)}
                disabled={!pasteText.trim()}
                className="px-5 py-2 text-xs font-semibold rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-xs hover:opacity-90 disabled:opacity-40 transition-all"
              >
                Apply to Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW & CONFIRM MODAL */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#001d34]/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-[var(--color-surface-container-lowest)] w-full max-w-xl rounded-[28px] shadow-2xl border border-[var(--color-outline-variant)] p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-outline-variant)]/60 pb-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                  Review & Confirm Party Import
                </h3>
              </div>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="p-1 rounded-full text-[var(--color-outline)] hover:text-[var(--color-on-surface)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[var(--color-primary-container)]/40 p-4 rounded-2xl border border-[var(--color-primary)]/20 space-y-3">
              <h4 className="text-xs font-bold text-[var(--color-on-primary-container)] uppercase tracking-wider">
                Summary of Parties to be Created
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-[var(--color-surface-container-lowest)] p-2.5 rounded-xl border border-[var(--color-outline-variant)]/40">
                  <span className="text-[10px] text-[var(--color-outline)] font-medium">Total Parties</span>
                  <p className="text-lg font-bold text-[var(--color-primary)]">
                    {rows.filter((r) => r.name.trim() !== '').length}
                  </p>
                </div>
                <div className="bg-[var(--color-surface-container-lowest)] p-2.5 rounded-xl border border-[var(--color-outline-variant)]/40">
                  <span className="text-[10px] text-[var(--color-outline)] font-medium">Suppliers</span>
                  <p className="text-lg font-bold text-amber-700">
                    {rows.filter((r) => r.name.trim() !== '' && (r.type === 'vendor' || r.type === 'both')).length}
                  </p>
                </div>
                <div className="bg-[var(--color-surface-container-lowest)] p-2.5 rounded-xl border border-[var(--color-outline-variant)]/40">
                  <span className="text-[10px] text-[var(--color-outline)] font-medium">Customers</span>
                  <p className="text-lg font-bold text-sky-700">
                    {rows.filter((r) => r.name.trim() !== '' && (r.type === 'customer' || r.type === 'both')).length}
                  </p>
                </div>
                <div className="bg-[var(--color-surface-container-lowest)] p-2.5 rounded-xl border border-[var(--color-outline-variant)]/40">
                  <span className="text-[10px] text-[var(--color-outline)] font-medium">Total Open Bal</span>
                  <p className="text-sm font-bold text-emerald-700 truncate">
                    {formatCurrency(
                      rows.reduce((sum, r) => sum + (Number(r.openingBalance) || 0), 0),
                      currencySymbol
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2 pr-1 divide-y divide-[var(--color-outline-variant)]/30 text-xs">
              {rows
                .filter((r) => r.name.trim() !== '')
                .map((r, i) => (
                  <div key={r.id} className="pt-2 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[var(--color-on-surface)]">
                        {i + 1}. {r.name}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--color-outline)]">
                        <span className="capitalize">{r.type}</span>
                        {r.city && <span>• {r.city}</span>}
                        {r.gstin && <span className="font-mono">• {r.gstin}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-medium text-[var(--color-on-surface)]">
                        {formatCurrency(Number(r.openingBalance) || 0, currencySymbol)}
                      </span>
                      <p className="text-[10px] text-[var(--color-outline)]">
                        {r.type === 'customer' ? 'Receivable' : 'Payable'}
                      </p>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-outline-variant)]/60">
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-full text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] transition-colors"
              >
                Back to Edit
              </button>
              <button
                onClick={handleConfirmSave}
                className="px-6 py-2.5 text-xs font-semibold rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-sm hover:opacity-90 transition-all flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save {rows.filter((r) => r.name.trim() !== '').length} Parties</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
