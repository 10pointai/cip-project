export type PartyType = 'vendor' | 'customer' | 'transporter' | 'both';

export type PartyCategory = 
  | 'Bitumen & Emulsion'
  | 'Stone Aggregates & GSB'
  | 'Cement & Flyash'
  | 'Fuel, Diesel & Oils'
  | 'Machinery, Spares & Maintenance'
  | 'Road Contracting Client'
  | 'Govt Dept (NHAI/PWD/MSRDC)'
  | 'Private Developer'
  | 'Transporter & Logistics'
  | 'General Supplies';

export interface Address {
  street: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
}

export interface Party {
  id: string;
  name: string;
  tradeName?: string;
  type: PartyType;
  category: PartyCategory;
  gstin?: string;
  pan?: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: Address;
  paymentTermsDays: number;
  creditLimit: number;
  openingBalance: number;
  openingBalanceType: 'to_pay' | 'to_receive'; // 'to_pay' = Payable (credit), 'to_receive' = Receivable (debit)
  currentBalance: number; // positive = we will receive (Receivable), negative = we have to pay (Payable)
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type VoucherType = 
  | 'sale_invoice'
  | 'purchase_bill'
  | 'payment_in'   // Received from Customer
  | 'payment_out'  // Paid to Vendor/Transporter
  | 'debit_note'
  | 'credit_note';

export type ItemType = 'product' | 'service';

export interface ItemCategory {
  id: string;
  name: string;
  description?: string;
  type: 'product' | 'service' | 'both';
  color?: string;
  createdAt: string;
}

export interface ItemUnit {
  id: string;
  code: string;
  name: string;
  allowDecimal: boolean;
  isStandard?: boolean;
}

export interface ItemLocation {
  id: string;
  name: string;
  code?: string;
  description?: string;
  capacity?: string;
  type?: 'silo' | 'tank' | 'stockpile' | 'warehouse' | 'bin' | 'yard' | 'other';
  isStandard?: boolean;
  createdAt: string;
}

export interface StockMovementLog {
  id: string;
  date: string;
  type: 'purchase_inward' | 'production_output' | 'production_consumed' | 'sale_dispatch' | 'opening' | 'reconciliation_in' | 'reconciliation_out' | 'adjustment_increase' | 'adjustment_decrease' | 'dispatch_reversal' | 'inward_reversal';
  quantity: number; // positive for additions, negative for deductions
  balanceAfter: number;
  // Actual-cost snapshots (facts-as-of-event; numeric snapshots per documentation §2):
  // rate = actual cost per unit of THIS movement (inward = the rate it entered
  // at; outward = the blended FIFO rate of what it actually consumed),
  // movementValue = the value of the quantity moved at that rate,
  // valuationRateAfter = the item's blended valuation rate after this movement.
  rate?: number;
  movementValue?: number;
  valuationRateAfter?: number;
  referenceNumber?: string;
  referenceId?: string; // FK to the source document master (sale/purchase id)
  sourcePartyOrBatch?: string;
  notes?: string;
}

export interface ItemLocationStock {
  locationId?: string;
  locationName: string;
  currentStock: number;
  openingStock?: number;
  minStockLevel?: number;
  maxCapacity?: number;
}

export interface Item {
  id: string;
  name: string;
  code: string; // SKU or item code
  type: ItemType;
  categoryId: string;
  // FK to item_units (resolved at write time from the master; the display
  // unit string is JOINed at read time — no unit name saving on the row)
  unitId?: string;
  categoryName?: string;
  unit: string; // e.g. MT, LTR, CUM, BRASS, HR, TRIP, NOS
  hsnSacCode?: string; // HSN for goods, SAC for services
  taxRateGst: number; // e.g. 0, 5, 12, 18, 28
  salePrice: number; // Default selling rate
  purchasePrice?: number; // Legacy or computed procurement rate

  // FIFO actual-cost valuation, computed server-side from the stock
  // movements ledger at read time (never persisted on the items row).
  // Each entered quantity keeps its own rate forever; valuationRate is the
  // blended rate of the remaining lots (display only).
  valuationRate?: number; // Blended rate of remaining FIFO lots
  stockValue?: number; // currentStock x valuationRate
  
  // Opening stock & procurement cost tracking
  openingStock?: number; // Quantity of opening stock
  openingStockPrice?: number; // Procurement cost per unit of opening stock
  openingStockDate?: string; // Date of opening stock entry
  
  technicalSpecs?: string; // Specifications / mix formula notes
  remarks?: string; // Remarks and delivery / handling notes
  isActive: boolean;
  
  // Stockyard Inventory Attributes (applicable for physical products)
  currentStock?: number;
  minStockLevel?: number; // Safety / Reorder threshold
  maxCapacity?: number; // Silo / Tank / Stockpile capacity limit
  stockLocation?: string; // e.g. "Batching Silo Tower A", "Insulated Bitumen Tank 1"
  stockLocations?: string[]; // Multiple storage location names
  locations?: ItemLocationStock[]; // Detailed per-location stock breakdown
  lastStockUpdate?: string;
  movements?: StockMovementLog[];

  createdAt: string;
  updatedAt: string;
}

export type StockAdjustmentType = 'increase' | 'decrease';

// ==========================================
// DOCUMENTS (generic S3 upload records + order mapping)
// ==========================================
// Every feature (sales, purchases, and later others) uploads files to AWS S3
// via s3Upload.ts and persists the resulting link here. Named AppDocument —
// `Document` collides with the DOM's Document interface.

export type DocumentStatus = 'active' | 'deleted';

export interface AppDocument {
  id: string;
  /** Original file name (e.g. "Weighbridge Slip 26_001.pdf") — captured from the File object */
  fileName: string;
  /** User-entered document name, taken in an input against the upload (required; primary display label) */
  documentName?: string;
  /** S3 object key, e.g. Sale/<saleId>/<uuid4>.pdf */
  s3Key: string;
  /** Permanent S3 object URL — the value saved at upload time */
  url: string;
  contentType?: string;
  sizeBytes?: number;
  /** FK users.id — who uploaded it (null = system/tech-team upload) */
  uploadedById?: string;
  /** Soft-life flag: 'deleted' rows keep their mapping history but hide in UI */
  status: DocumentStatus;
  createdAt: string;
}

/** sales ↔ documents join row (FK-only per the data standard §Golden Rule) */
export interface SaleOrderDocumentLink {
  id: string;
  /** FK sales.id */
  saleId: string;
  /** FK documents.id */
  documentId: string;
  createdAt: string;
}

/** purchases ↔ documents join row (FK-only per the data standard §Golden Rule) */
export interface PurchaseOrderDocumentLink {
  id: string;
  /** FK purchases.id */
  purchaseId: string;
  /** FK documents.id */
  documentId: string;
  createdAt: string;
}

/** parties ↔ documents join row (FK-only) — table parties_documents */
export interface PartyDocumentLink {
  id: string;
  /** FK parties.id */
  partyId: string;
  /** FK documents.id */
  documentId: string;
  createdAt: string;
}

/** items ↔ documents join row (FK-only) — table inventory_documents */
export interface ItemDocumentLink {
  id: string;
  /** FK items.id */
  itemId: string;
  /** FK documents.id */
  documentId: string;
  createdAt: string;
}

/** employees ↔ documents join row (FK-only) — table employee_documents */
export interface EmployeeDocumentLink {
  id: string;
  /** FK employees.id */
  employeeId: string;
  /** FK documents.id */
  documentId: string;
  createdAt: string;
}

export interface ItemStockAdjustment {
  id: string;
  adjustmentNumber: string; // e.g. "STK-ADJ-26/001"
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  date: string; // YYYY-MM-DD
  type: StockAdjustmentType; // 'increase' (Add Stock) | 'decrease' (Reduce Stock)
  quantity: number;
  rate: number; // Procurement / valuation cost per unit at adjustment
  totalValue: number; // quantity * rate
  previousStock: number;
  newStock: number;
  reason: string; // e.g. "Physical Stock Audit / Reconciliation", "Damaged / Waste", "Opening Stock Correction", etc.
  location?: string;
  locationId?: string; // FK: resolved display name lives on the item's location mapping, never copied here
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
}

export interface ProductionBatchRun {
  id: string;
  batchNumber: string;
  date: string;
  plantUnit: string; // e.g. "Asphalt Batching Plant #1 (160 TPH)"
  targetItemId: string;
  targetItemName: string;
  targetQuantity: number; // e.g. 200 MT
  unit: string;
  rawMaterialsConsumed: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
  }>;
  supervisorName: string;
  mixTemperatureCelsius?: number; // e.g. 165°C
  notes?: string;
  createdAt: string;
}

export type OrderType = 'sales' | 'purchase';
export type OrderStatus = 'pending' | 'partially_delivered' | 'completed' | 'cancelled';
export type SalesStage = 'quotation' | 'sales_order' | 'proforma_invoice' | 'delivery_note' | 'sales_invoice';
export type PurchaseStage = 'rfq' | 'purchase_order' | 'goods_receipt';

export interface OrderItem {
  itemId: string;
  itemName: string;
  itemCode?: string; // hydrated read-time from the items master
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  gstRate?: number; // GST slab % for this line (each item can carry its own slab)
  location?: string; // Location dispatched from (Sales) or received into (Purchase)
  receivedQuantity?: number; // Actual received quantity in goods receipt
  shortageQuantity?: number; // Discrepancy (quantity - receivedQuantity)
  overageQuantity?: number; // Excess quantity if received > ordered
  itemNotes?: string;
}

export type PaymentMode = 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'neft_rtgs';

export interface RfqStageDetails {
  rfqNumber?: string;
  rfqDate?: string;
  quotationRef?: string;
  quotationDate?: string;
  validityDate?: string;
  expectedDeliveryDate?: string;
  notes?: string;
}

export interface PoStageDetails {
  poNumber?: string;
  poDate?: string;
  expectedDeliveryDate?: string;
  paymentTerms?: string;
  vendorContact?: string;
  notes?: string;
}

export interface ReceiptStageDetails {
  grnNumber?: string;
  receiptDate?: string;
  challanNumber?: string;
  vendorInvoiceNumber?: string;
  receivedBy?: string;
  inspectionStatus?: 'accepted' | 'accepted_with_shortage' | 'rejected';
  reconciliationNotes?: string;
  notes?: string;
}

export interface Order {
  /** @deprecated Split into Sale / Purchase (relational stage model). Kept only for legacy-row reads. */
  id: string;
  orderNumber: string;
  type: OrderType;
  partyId: string;
  partyName: string;
  date: string;
  status?: OrderStatus;
  stage?: SalesStage;
  purchaseStage?: PurchaseStage;
  rfqDetails?: RfqStageDetails;
  poDetails?: PoStageDetails;
  receiptDetails?: ReceiptStageDetails;
  items: OrderItem[];
  taxRateGst: number; // e.g. 18
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  vehicleNo?: string;
  driverName?: string;
  transportCharges?: number;
  paymentMode: PaymentMode;
  accountId: string; // Account where money is added (Sales) or deducted (Purchase)
  accountName?: string;
  paymentStatus?: 'paid' | 'pending' | 'partially_paid' | 'settled';
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  voucherNumber: string;
  // FKs only (Golden Rule §2): partyId + accountId are authoritative; the
  // party/account display names are resolved via JOINs at read time
  // (transactions stores NO name copies).
  partyId: string;
  partyType: PartyType;
  // Hydrated read-time view fields (never persisted)
  partyName?: string;
  accountName?: string;
  type: VoucherType;
  amount: number;
  date: string;
  accountId?: string; // Links transaction directly to Bank or Cash Account (FK)
  paymentMode?: 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'neft_rtgs';
  referenceNumber?: string;
  itemId?: string; // Associated product/service catalog item ID
  materialOrService?: string;
  quantityTonnes?: number;
  location?: string; // Location dispatched from (sale invoice) or received into (purchase bill)
  description: string;
  status: 'paid' | 'pending' | 'partially_paid' | 'settled' | 'cancelled';
  dueDate?: string;
  attachments?: EvidenceFile[];
  createdAt: string;
}

export type AccountType = 'bank' | 'cash';

export interface CashBankAccount {
  id: string;
  name: string; // Display Name (e.g. "SBI Current A/c", "Main Plant Cash Drawer")
  type: AccountType; // 'bank' or 'cash'
  accountNumber?: string; // Optional for bank accounts
  ifscCode?: string; // Optional IFSC / Branch
  bankName?: string;
  openingBalance: number;
  currentBalance: number;
  asOfDate: string; // YYYY-MM-DD
  notes?: string;
  isDefault?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransferType = 'bank_to_bank' | 'cash_to_bank' | 'bank_to_cash' | 'cash_to_cash';

export interface InternalTransfer {
  id: string;
  transferNumber: string;
  date: string; // YYYY-MM-DD
  // FKs only (Golden Rule, documentation §2): from/to account NAME and every
  // other display field are resolved with JOINs against cash_bank_accounts at
  // read time, so account renames propagate to all transfer displays.
  fromAccountId: string;
  toAccountId: string;
  transferType: TransferType;
  amount: number;
  referenceNumber?: string; // UTR / Cheque / Slip No.
  notes?: string;
  createdAt: string;
  // Hydrated read-time fields (never persisted)
  fromAccountName?: string;
  toAccountName?: string;
}

export type AdjustmentType = 'increase' | 'decrease';

export interface AccountAdjustment {
  id: string;
  adjustmentNumber: string;
  // FK only (Golden Rule, documentation §2): account display name/type are
  // resolved with JOINs against cash_bank_accounts at read time.
  accountId: string;
  date: string; // YYYY-MM-DD
  type: AdjustmentType; // 'increase' (Add Money) or 'decrease' (Reduce Money)
  amount: number;
  previousBalance: number;
  newBalance: number;
  reason: string;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  // Hydrated read-time fields (never persisted)
  accountName?: string;
  accountType?: AccountType;
}

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  upiId?: string;
}

export interface CompanySettings {
  companyName: string;
  tradeName: string;
  tagline: string;
  gstin: string;
  pan: string;
  cin?: string;
  registeredAddress: Address;
  phone: string;
  email: string;
  website?: string;
  currency: {
    code: string;
    symbol: string;
    name: string;
    format: 'indian' | 'international';
  };
  defaultPaymentTermsDays: number;
  prefixes: {
    salesInvoice: string;
    purchaseBill: string;
    dispatchChallan: string;
    paymentReceipt: string;
  };
  themeColor: 'amber' | 'blue' | 'emerald' | 'slate';
  authorizedSignatoryName: string;
  authorizedSignatoryDesignation: string;
  invoiceNotes: string;
}

export type VehicleType = 'tipper' | 'tanker' | 'mixer' | 'loader' | 'other';
export type VehicleStatus = 'available' | 'on_trip' | 'maintenance' | 'out_of_service';
export type VehicleOwnership = 'owned' | 'contractor' | 'market';

export interface VehicleEmiDetails {
  hasEmi: boolean;
  financierName?: string; // e.g. "HDFC Bank Commercial", "Tata Capital", "ICICI Bank", "Sundaram Finance"
  loanAccountNumber?: string; // e.g. "LN-CV-89210"
  monthlyEmiAmount?: number; // e.g. 42500
  emiDueDay?: number; // Day of month 1 - 31 (e.g. 10)
  loanStartDate?: string; // YYYY-MM-DD
  loanEndDate?: string; // YYYY-MM-DD
  totalLoanAmount?: number; // e.g. 2400000
  interestRate?: number; // e.g. 8.75%
  totalTenureMonths?: number; // e.g. 48
  paidEmisCount?: number; // e.g. 18
  autoDebitAccount?: string; // Bank account name
  status?: 'active' | 'closed' | 'defaulted';
  lastPaymentDate?: string;
  notes?: string;
}

export interface Vehicle {
  id: string;
  vehicleNo: string;
  type: VehicleType;
  capacityTonnes: number;
  ownership: VehicleOwnership;
  status: VehicleStatus;
  currentDriverId?: string;
  currentDriverName?: string;
  insuranceExpiry?: string;
  fitnessExpiry?: string;
  emiDetails?: VehicleEmiDetails;
  notes?: string;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  licenseNo: string;
  phone: string;
  status: 'available' | 'on_duty' | 'leave';
  createdAt: string;
}

export interface TripSlip {
  id: string;
  slipNumber: string;
  date: string;
  time: string;
  vehicleId: string;
  vehicleNo: string;
  driverId: string;
  driverName: string;
  tripType: 'outward' | 'inward' | 'internal';
  orderId?: string;
  orderNumber?: string;
  partyName?: string;
  materialName: string;
  netWeightTonnes: number;
  destination: string;
  status: 'loading' | 'transit' | 'delivered' | 'closed';
  fuelIssuedLiters: number;
  cashAdvanceRupees: number;
  notes?: string;
  createdAt: string;
}

export interface Tyre {
  id: string;
  serialNumber: string;
  brand: string;
  size: string;
  type: 'radial' | 'tubeless' | 'bias';
  status: 'mounted' | 'available' | 'retreading' | 'scrapped';
  vehicleId?: string;
  vehicleNo?: string;
  position?: string;
  purchaseDate: string;
  purchaseCost: number;
  installOdometer?: number;
  currentOdometer?: number;
  lastInspectionDate?: string;
  lastInspectionCondition?: 'excellent' | 'good' | 'worn' | 'damaged';
  threadDepthMm?: number;
  notes?: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  role: 'driver' | 'supervisor' | 'operator' | 'accountant' | 'manager' | 'helper' | 'other';
  phone: string;
  email?: string;
  aadhaarNo?: string;
  panNo?: string;
  joiningDate: string;
  salaryBase: number;
  salaryType: 'monthly' | 'daily';
  status: 'active' | 'inactive';
  licenseNo?: string; // primarily for drivers
  bankAccountNo?: string;
  bankIFSC?: string;
  /** UPI VPA for instant payouts, e.g. name@upi */
  upiAddress?: string;
  /** Account holder name as printed on the bank/passbook — required by the bank for NEFT */
  nameOnAccount?: string;
  /** Employee's standard shift in-time (HH:mm) — the reference for late detection in attendance */
  defaultInTime?: string;
  /** Employee's standard shift out-time (HH:mm) */
  defaultOutTime?: string;
  /**
   * Employee ledger opening balance (SIGNED, ledger = employee's virtual account):
   * +ve → company owes the employee (employee's credit, e.g. advance salary given);
   * −ve → employee owes the company (e.g. advance taken before the ledger existed).
   * The CREATE UI collects a positive amount plus the employer's sign choice.
   */
  openingBalance?: number;
  createdAt: string;
}

export interface AttendancePunchLog {
  id: string;
  type: 'IN' | 'OUT';
  time: string; // HH:mm or HH:mm:ss
  source?: 'manual' | 'kiosk' | 'web' | 'biometric';
  note?: string;
}

export interface EmployeeAttendance {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'half_day' | 'leave' | 'late' | 'early_exit' | 'holiday';
  checkInTime?: string; // HH:mm
  checkOutTime?: string; // HH:mm
  totalHoursWorked?: number; // e.g. 9.25
  shiftName?: string; // e.g. "Day Shift (08:30 - 17:30)"
  punchLogs?: AttendancePunchLog[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeLeave {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: 'casual' | 'sick' | 'earned' | 'maternity' | 'unpaid';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface EmployeePayment {
  id: string;
  employeeId: string;
  /** FK employees.id only (Golden Rule §2) — the name is resolved from the
   *  employees master via JOIN/read-time hydration, never stored on the row */
  employeeName?: string;
  date: string; // YYYY-MM-DD
  type: 'salary' | 'advance' | 'bonus' | 'reimbursement';
  amount: number;
  paymentMode: 'bank_transfer' | 'cash' | 'upi' | 'cheque';
  /** FK cash_bank_accounts.id — the account the payout leaves (decides the mode: bank → transfer, cash → cash) */
  accountId?: string;
  referenceNo?: string;
  notes?: string;
  monthYear?: string; // e.g. "August 2026"
  /** Hydrated read-time display field (never persisted on the row) */
  accountName?: string;
  createdAt?: string;
}

export type EvidenceEntityType = 'party' | 'vehicle' | 'employee' | 'production' | 'general';

/**
 * Employee Ledger row — one line of an employee's virtual account (running
 * balance kept like the account ledger: opening + chronological fold, no
 * stored balance column). amount is ALWAYS a positive number; the type (and
 * bank direction) decides the effect's sign:
 *   wage_accrual      + amount (auto earnings row — daily wages from attendance,
 *                     monthly salary on the 1st minus absent/half-day deductions)
 *   add_balance       + amount (balance up; NEVER bank-linked)
 *   reduce_balance    − amount from the employee's balance; when a bank account
 *                     is chosen the payout also leaves that account (money out)
 *   direct_transaction  employee balance UNTOUCHED; bank optional (direction picks
 *                     money in/out on that account)
 */
export interface EmployeeLedgerTransaction {
  id: string;
  /** FK employees.id ONLY (Golden Rule §2) — the name resolves from the
   *  employees master via read-time hydration, never stored on the row */
  employeeId: string;
  /** Hydrated read-time display field (never persisted on the row) */
  employeeName?: string;
  /** Effective ledger date (YYYY-MM-DD) — accruals dated their earning day */
  date: string;
  type: 'wage_accrual' | 'add_balance' | 'reduce_balance' | 'direct_transaction';
  /** Always POSITIVE; sign comes from the type + bank direction */
  amount: number;
  /** Mandatory reason: salary, festival bonus, advance disbursed, reimbursement … */
  reason: string;
  /** FK cash_bank_accounts.id — only on bank-linked reduce / direct rows */
  accountId?: string;
  /** Bank side of a bank-linked DIRECT transaction (reduce rows are always out) */
  direction?: 'money_in' | 'money_out';
  /**
   * Which record surface created the row — drives the Particulars tag:
   *   'adjust'   → "Adjusted" (green on an increase, red on a reduce)
   *   'paid'     → "Paid To Employee" (red)
   *   'received' → "Received From Employee" (green)
   */
  intent?: 'adjust' | 'paid' | 'received';
  /** Auto rows from the accrual engine are locked — the employer cannot edit them */
  source?: 'accrual_engine' | 'manual';
  notes?: string;
  /** Hydrated read-time display field (never persisted on the row) */
  accountName?: string;
  createdAt: string;
}

export interface EvidenceFolder {
  id: string;
  name: string;
  entityType: EvidenceEntityType;
  entityId?: string; // e.g. party.id, vehicle.id, employee.id, or null/undefined for general
  entityName?: string; // display name for quick lookup (e.g. "UltraTech Cement")
  parentId?: string | null; // For nested user folders (null = root level of entity)
  isSystemGenerated?: boolean;
  color?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceFile {
  id: string;
  folderId: string;
  name: string;
  size: number; // in bytes
  type: string; // MIME type (e.g. "image/jpeg", "image/png", "application/pdf")
  dataUrl?: string; // Data URL / Base64 / SVG or simulated asset URL for preview
  s3Url?: string; // Permanent AWS S3 object URL — saved at upload time by s3Upload.ts
  s3Key?: string; // S3 object key (for presigned download / lifecycle ops)
  entityType: EvidenceEntityType;
  entityId?: string;
  entityName?: string;
  linkedEntryType?: string; // e.g. "sale_invoice", "purchase_bill", "payment_in", "payment_out", "trip_slip", "weighbridge", "fuel_slip", "salary_slip", "rc_document", "insurance"
  linkedEntryId?: string; // e.g. voucherNumber or transactionId or slipNumber
  uploadedBy?: string;
  description?: string;
  tags?: string[];
  createdAt: string;
}

// ==========================================
// USER MANAGEMENT & JWT AUTH TYPES
// ==========================================

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'operator';

/** 'deleted' = legacy tombstone rows on disk (never shown in lists, never
 *  sign-in-able — legacy delete flows wrote the status instead of removing) */
export type UserStatus = 'pending_setup' | 'active' | 'suspended' | 'deleted';

export interface UserPermissions {
  view_dashboard: boolean;
  view_financial_metrics: boolean;
  manage_parties: boolean;
  record_payments: boolean;
  manage_cash_bank: boolean;
  manage_inventory: boolean;
  manage_production: boolean;
  manage_sales: boolean;
  manage_purchases: boolean;
  manage_fleet: boolean;
  manage_emi: boolean;
  dispatch_trips: boolean;
  manage_employees: boolean;
  process_payroll: boolean;
  manage_evidence: boolean;
  manage_users: boolean;
  manage_settings: boolean;
}

export interface AppUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  username: string; // Unique system-generated username (e.g., rahul.adm942)
  passwordHash?: string; // Stored securely on server
  role: UserRole;
  status: UserStatus;
  permissions: UserPermissions;
  activationCode?: string; // One-time verification token for first-time password setup
  createdAt: string;
  lastLoginAt?: string;
  notes?: string;
}

export interface AuthSession {
  token: string;
  user: AppUser;
}

// ==========================================
// SALES & PURCHASE — RELATIONAL ORDER MODEL
// (Phase 1 redesign: the legacy `orders` JSON-blob table is split into
//  sale/purchase MASTERS + items child tables + stage-history child tables.
//  A "sale"/"purchase" is created once; stage documents (quotation, sales
//  order, proforma, delivery note, invoice — or RFQ, PO, GRN) are separate
//  rows saved against the master, keeping the full document history.)
// Golden Rule §2: child tables store FKs (item_id, unit_id, location_id,
// party_id). The document numbers + stage totals rows are the §2 exception-1
// statutory snapshots.
// ==========================================

export interface SalesOrderItem {
  id: string;
  saleId: string;
  /** FK to sales_order_stages — items are scoped PER STAGE: a quotation keeps
   *  its own line set; editing a sales order touches only that stage's rows. */
  stageId?: string;
  itemId: string;
  unitId?: string; // FK item_units — unit display JOINed at read
  // Hydrated read-time view fields (never persisted)
  itemName?: string;
  itemCode?: string;
  unit?: string;
  location?: string;
  quantity: number;
  rate: number;
  amount?: number; // convenience: quantity * rate
  gstRate?: number; // GST slab % for this line
  locationId?: string; // FK item_locations — dispatched from
  itemNotes?: string;
}

export interface SalesOrderStage {
  id: string;
  saleId: string;
  stageType: SalesStage; // quotation | sales_order | proforma_invoice | delivery_note | sales_invoice
  stageNumber: string; // document number as issued (SO-2026-0004, INV-26/…)
  date: string; // YYYY-MM-DD
  // Document totals snapshot (§2 exception 1 — figures as printed at issue)
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  // Line items captured for THIS stage document (quotation lines are frozen
  // once the sale advances; invoice issuance locks the sale)
  items?: SalesOrderItem[];
  notes?: string;
  createdAt: string;
}

export interface Sale {
  id: string;
  saleNumber: string;
  partyId: string;
  partyName?: string; // hydrated read-time (JOIN parties)
  date: string; // YYYY-MM-DD (master creation date)
  status: OrderStatus; // computed server-side from stage history + flags
  notes?: string;
  vehicleNo?: string;
  driverName?: string;
  transportCharges?: number;
  // One-shot application flags — stock / cash may post at most ONCE per sale;
  // the user decides WHERE (which stage save) via the toggle in the UI.
  inventoryApplied: boolean;
  // cashApplied = "payment flow applied (locked)" — true for BOTH the account
  // and the credit flow; settlementType tells which one.
  cashApplied: boolean;
  // Which payment flow was applied: 'credit' = booked on the party ledger (no
  // cash moved), 'account' = settled into a Cash/Bank account; undefined =
  // Don't touch — flow never applied.
  settlementType?: 'credit' | 'account';
  // Cash & Bank wiring (FKs per Golden Rule §2 — names JOINed at read time;
  // settled_amount is the §2 exception statutory snapshot of the settled total)
  settlementAccountId?: string;
  settlementAccountName?: string; // hydrated read-time (JOIN cash_bank_accounts)
  paymentMode?: 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'neft_rtgs';
  invoiceVoucherId?: string; // FK transactions — the sale_invoice journal voucher
  settlementVoucherId?: string; // FK transactions — the payment_in receipt voucher
  invoiceVoucherNumber?: string; // hydrated read-time (JOIN transactions)
  settlementVoucherNumber?: string; // hydrated read-time (JOIN transactions)
  settledAmount?: number;
  settledDate?: string;
  // Attached child rows (hydrated at read)
  items: SalesOrderItem[];
  stages: SalesOrderStage[]; // chronological (oldest first)
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseId: string;
  itemId: string;
  unitId?: string;
  // Hydrated read-time view fields (never persisted)
  itemName?: string;
  itemCode?: string;
  unit?: string;
  location?: string;
  quantity: number;
  rate: number;
  amount?: number;
  gstRate?: number;
  locationId?: string; // FK item_locations — received into
  receivedQuantity?: number; // actual received at goods receipt (GRN stage)
  shortageQuantity?: number;
  overageQuantity?: number;
  itemNotes?: string;
}

export interface PurchaseOrderStage {
  id: string;
  purchaseId: string;
  stageType: PurchaseStage; // rfq | purchase_order | goods_receipt (one each per purchase)
  stageNumber: string; // RFQ-…/PO-…/GRN-… document number as issued
  date: string; // YYYY-MM-DD
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  // Stage-specific document details (statutory snapshot of what was recorded)
  rfqDetails?: RfqStageDetails;
  poDetails?: PoStageDetails;
  receiptDetails?: ReceiptStageDetails;
  notes?: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  partyId?: string; // nullable: RFQ ingestion may have no vendor yet
  partyName?: string; // hydrated read-time (JOIN parties)
  date: string;
  status: OrderStatus;
  notes?: string;
  inventoryApplied: boolean;
  // cashApplied = "payment flow applied (locked)" — true for BOTH the account
  // and the credit flow; settlementType tells which one.
  cashApplied: boolean;
  // 'credit' = payable on the party ledger (no cash moved); 'account' = paid
  // from a Cash/Bank account; undefined = Don't touch — flow never applied.
  settlementType?: 'credit' | 'account';
  settlementAccountId?: string;
  settlementAccountName?: string; // hydrated read-time (JOIN cash_bank_accounts)
  paymentMode?: 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'neft_rtgs';
  invoiceVoucherId?: string; // FK transactions — the purchase_bill journal voucher
  settlementVoucherId?: string; // FK transactions — the payment_out payout voucher
  invoiceVoucherNumber?: string; // hydrated read-time (JOIN transactions)
  settlementVoucherNumber?: string; // hydrated read-time (JOIN transactions)
  settledAmount?: number;
  settledDate?: string;
  items: PurchaseOrderItem[];
  stages: PurchaseOrderStage[]; // chronological (oldest first)
  createdAt: string;
  updatedAt: string;
}

/** Stage-save request payloads — `updateInventory` is the user's per-stage
 *  "update stockyard inventory?" toggle (applies the stock movement at most
 *  once per order: guards on the master's inventory_applied flag). */
export interface SalesOrderStageInput {
  stageType: SalesStage;
  stageNumber: string;
  date: string;
  notes?: string;
  updateInventory?: boolean;
  updateCash?: boolean;
  // Payment flow choice: 'none' = Don't touch settlement (nothing posts),
  // 'credit' = book on the party ledger (receivable, no cash), 'account' =
  // settle into settlementAccountId. NOTE: once the flow was applied the
  // section is locked — later saves must ECHO the stored value, never 'none'.
  settlementType?: 'none' | 'credit' | 'account';
  // Payment voucher — required when settlementType is 'account'.
  settlementAccountId?: string;
  paymentMode?: 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'neft_rtgs';
}

export interface PurchaseOrderStageInput {
  stageType: PurchaseStage;
  stageNumber: string;
  date: string;
  notes?: string;
  rfqDetails?: RfqStageDetails;
  poDetails?: PoStageDetails;
  receiptDetails?: ReceiptStageDetails;
  updateInventory?: boolean;
  updateCash?: boolean;
  // Mirror of SalesOrderStageInput.settlementType (payable vs receivable).
  // Once applied, later saves must ECHO the stored value, never 'none'.
  settlementType?: 'none' | 'credit' | 'account';
  settlementAccountId?: string;
  paymentMode?: 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'neft_rtgs';
}

/** Line-item input shape sent from the forms (ids may arrive as FKs or display
 *  fallbacks; the server resolves/authoritatively stores FKs only). */
export interface SalesOrderItemInput {
  itemId: string;
  quantity: number;
  rate: number;
  gstRate?: number;
  locationName?: string;
  locationId?: string;
  itemNotes?: string;
}

export interface PurchaseOrderItemInput extends SalesOrderItemInput {
  receivedQuantity?: number;
}


