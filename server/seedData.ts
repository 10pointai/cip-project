import {
  Party,
  Transaction,
  CompanySettings,
  Item,
  ItemCategory,
  ItemUnit,
  ItemLocation,
  ProductionBatchRun,
  Order,
  Vehicle,
  Driver,
  TripSlip,
  Tyre,
  Employee,
  EmployeeAttendance,
  EmployeeLeave,
  EmployeePayment,
  AppUser,
  UserPermissions,
  CashBankAccount,
  InternalTransfer,
  AccountAdjustment,
} from '../src/types';
import bcrypt from 'bcryptjs';

export const SEED_SETTINGS: CompanySettings = {
  companyName: 'Operations Enterprise Ltd.',
  tradeName: 'Operations & Materials Plant',
  tagline: 'Operations Management System',
  gstin: '',
  pan: '',
  cin: '',
  registeredAddress: {
    street: '',
    city: '',
    state: '',
    stateCode: '',
    pincode: '',
  },
  phone: '',
  email: '',
  website: '',
  currency: {
    code: 'INR',
    symbol: '₹',
    name: 'Indian Rupee',
    format: 'indian',
  },
  defaultPaymentTermsDays: 30,
  prefixes: {
    salesInvoice: 'INV-26/',
    purchaseBill: 'PUR-26/',
    dispatchChallan: 'DC-26/',
    paymentReceipt: 'RCPT-26/',
  },
  themeColor: 'amber',
  authorizedSignatoryName: '',
  authorizedSignatoryDesignation: '',
  invoiceNotes: '',
};

export const SEED_CATEGORIES: ItemCategory[] = [
  { id: 'cat-1', name: 'Hot Mix Asphalt (Bituminous)', description: 'DBM, BC Grade 1, BM and Hot Mix surface layers', type: 'product', color: 'amber', createdAt: '2026-04-01T08:00:00.000Z' },
  { id: 'cat-2', name: 'Raw Bitumen & Emulsions', description: 'VG-30, VG-40, CRMB-55 and Tack/Prime coat emulsions', type: 'product', color: 'blue', createdAt: '2026-04-01T08:00:00.000Z' },
  { id: 'cat-3', name: 'Crushed Stone Aggregates', description: '40mm, 20mm, 10mm, 6mm blue metal and stone dust', type: 'product', color: 'emerald', createdAt: '2026-04-01T08:00:00.000Z' },
  { id: 'cat-4', name: 'Granular Sub-Base & WMM', description: 'Wet Mix Macadam and GSB mix for road foundations', type: 'product', color: 'purple', createdAt: '2026-04-01T08:00:00.000Z' },
  { id: 'cat-5', name: 'Cement & Mineral Fillers', description: 'OPC 53 Grade bulk cement and hydrated lime filler', type: 'product', color: 'slate', createdAt: '2026-04-01T08:00:00.000Z' },
  { id: 'cat-6', name: 'Fuels & Heavy Machinery Oils', description: 'HSD Diesel, LDO furnace fuel and hydraulic lubricants', type: 'product', color: 'rose', createdAt: '2026-04-01T08:00:00.000Z' },
  { id: 'cat-7', name: 'Paving & Laying Job Services', description: 'Sensor paver laying, compaction and milling services', type: 'service', color: 'amber', createdAt: '2026-04-01T08:00:00.000Z' },
  { id: 'cat-8', name: 'Freight & Transportation', description: 'Tipper freight, demurrage and material transit hire', type: 'service', color: 'blue', createdAt: '2026-04-01T08:00:00.000Z' },
];

export const SEED_UNITS: ItemUnit[] = [
  { id: 'u-1', code: 'MT', name: 'Metric Tonne (1,000 kg)', allowDecimal: true, isStandard: true },
  { id: 'u-2', code: 'LTR', name: 'Liter', allowDecimal: true, isStandard: true },
  { id: 'u-3', code: 'CUM', name: 'Cubic Meter (m³)', allowDecimal: true, isStandard: true },
  { id: 'u-4', code: 'BRASS', name: 'Brass (100 cu ft)', allowDecimal: true, isStandard: true },
  { id: 'u-5', code: 'TRIP', name: 'Tipper Trip Count', allowDecimal: false, isStandard: true },
  { id: 'u-6', code: 'HR', name: 'Equipment Machine Hour', allowDecimal: true, isStandard: true },
  { id: 'u-7', code: 'SQM', name: 'Square Meter (m²)', allowDecimal: true, isStandard: true },
  { id: 'u-8', code: 'BAG', name: '50 kg Bag', allowDecimal: false, isStandard: true },
];

export const SEED_LOCATIONS: ItemLocation[] = [];

export const SEED_PARTIES: Party[] = [];

export const SEED_ITEMS: Item[] = [];

export const SEED_TRANSACTIONS: Transaction[] = [];

export const SEED_BATCHES: ProductionBatchRun[] = [];

export const SEED_ORDERS: Order[] = [];

export const SEED_VEHICLES: Vehicle[] = [];

export const SEED_DRIVERS: Driver[] = [];

export const SEED_TRIP_SLIPS: TripSlip[] = [];

export const SEED_TYRES: Tyre[] = [];

export const SEED_EMPLOYEES: Employee[] = [];

export const SEED_ATTENDANCE: EmployeeAttendance[] = [];

export const SEED_LEAVES: EmployeeLeave[] = [];

export const SEED_PAYMENTS: EmployeePayment[] = [];

export const FULL_ADMIN_PERMISSIONS: UserPermissions = {
  view_dashboard: true,
  view_financial_metrics: true,
  manage_parties: true,
  record_payments: true,
  manage_cash_bank: true,
  manage_inventory: true,
  manage_production: true,
  manage_sales: true,
  manage_purchases: true,
  manage_fleet: true,
  manage_emi: true,
  dispatch_trips: true,
  manage_employees: true,
  process_payroll: true,
  manage_evidence: true,
  manage_users: true,
  manage_settings: true,
};

// Default permission template for a newly provisioned account — wide operational
// access, but none of the administrative keys. SINGLE SOURCE OF TRUTH: any route
// or service that needs a "default user" permissions object derives it from this
// constant instead of re-declaring keys (a third drift-prone copy previously
// lived in the POST /api/users handler and went stale whenever a key was added).
export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  ...FULL_ADMIN_PERMISSIONS,
  manage_employees: false,
  process_payroll: false,
  manage_users: false,
  manage_settings: false,
};

export const SEED_USERS: AppUser[] = [
  {
    id: 'usr-superadmin',
    fullName: 'System Administrator',
    email: 'admin@opsinfra.in',
    phone: '',
    username: 'admin',
    passwordHash: bcrypt.hashSync('Admin@123', 10),
    role: 'super_admin',
    status: 'active',
    permissions: { ...FULL_ADMIN_PERMISSIONS },
    createdAt: '2026-04-01T08:00:00.000Z',
    notes: 'Primary Super Administrator with full unrestricted access',
  },
];

export const SEED_ACCOUNTS: CashBankAccount[] = [];

export const SEED_TRANSFERS: InternalTransfer[] = [];

export const SEED_ADJUSTMENTS: AccountAdjustment[] = [];
