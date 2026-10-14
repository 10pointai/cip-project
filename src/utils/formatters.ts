export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh (New)' },
  { code: '38', name: 'Ladakh' },
];

/**
 * Formats a number to Indian numbering system (Lakhs & Crores)
 * e.g., 1520300 -> ₹ 15,20,300
 */
export function formatCurrency(
  amount: number,
  symbol: string = '₹',
  formatType: 'indian' | 'international' = 'indian'
): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  if (formatType === 'international') {
    const formatted = absAmount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return `${isNegative ? '-' : ''}${symbol} ${formatted}`;
  }

  // Indian Rupee formatting with lakhs/crores commas
  const formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${isNegative ? '-' : ''}${symbol} ${formatted}`;
}

/**
 * Compact Indian currency formatting for high-level charts & KPI chips (e.g. ₹ 1.25 Cr, ₹ 45.2 L)
 */
export function formatCompactCurrency(amount: number, symbol: string = '₹'): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 10000000) {
    return `${sign}${symbol}${(abs / 10000000).toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    return `${sign}${symbol}${(abs / 100000).toFixed(2)} L`;
  }
  if (abs >= 1000) {
    return `${sign}${symbol}${(abs / 1000).toFixed(1)} K`;
  }
  return `${sign}${symbol}${abs.toLocaleString('en-IN')}`;
}

/**
 * Validates standard Indian 15-character GSTIN
 * Format: 2 digits (State Code) + 10 chars (PAN) + 1 digit (Entity) + 1 char ('Z') + 1 check digit
 */
export function validateGSTIN(gstin: string): {
  isValid: boolean;
  stateName?: string;
  pan?: string;
  message?: string;
} {
  const clean = gstin.trim().toUpperCase();
  if (!clean) {
    return { isValid: true };
  }

  if (clean.length !== 15) {
    return {
      isValid: false,
      message: 'GSTIN must be exactly 15 characters long.',
    };
  }

  const stateCode = clean.substring(0, 2);
  const pan = clean.substring(2, 12);
  const state = INDIAN_STATES.find((s) => s.code === stateCode);

  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const isValid = gstinRegex.test(clean);

  return {
    isValid,
    stateName: state?.name,
    pan,
    message: isValid
      ? `Valid GSTIN (${state?.name || 'State ' + stateCode})`
      : 'Invalid GSTIN format (e.g., 27AAAAA0000A1Z5)',
  };
}

/**
 * Formats ISO date string to Indian readable date (e.g. 10 Aug 2026 or 10/08/2026)
 */
export function formatDate(dateString: string, style: 'short' | 'long' = 'long'): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    if (style === 'short') {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Calculate ageing days between given date and today
 */
export function getDaysAgo(dateString: string): number {
  const past = new Date(dateString);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - past.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
