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
  VehicleEmiEntry,
  Employee,
  EmployeeAttendance,
  EmployeeLeave,
  EmployeePayment,
  EmployeeLedgerTransaction,
  CashBankAccount,
  InternalTransfer,
  AccountAdjustment,
  ItemStockAdjustment,
  Sale,
  Purchase,
  EvidenceFolder,
  EvidenceFile,
} from '../types';
import { api } from './api';

// ---------------------------------------------------------------------------
// PER-FEATURE LOADING MAPS
// ---------------------------------------------------------------------------

/** The 25 store collections, as addressable fetch targets. */
export type CollectionName =
  | 'parties' | 'transactions' | 'settings' | 'items' | 'categories' | 'units'
  | 'locations' | 'productionBatches' | 'orders' | 'sales' | 'purchases'
  | 'vehicles' | 'drivers' | 'tripSlips' | 'tyres' | 'employees' | 'attendance'
  | 'leaves' | 'employeePayments' | 'employeeLedgerTransactions' | 'accounts'
  | 'transfers' | 'adjustments'
  | 'stockAdjustments' | 'evidenceFolders' | 'evidenceFiles' | 'vehicleEmiEntries';

export interface SidebarCounts {
  parties: number;
  items: number;
  sales: number;
  purchases: number;
  orders: number;
  accounts: number;
  employees: number;
}

// Boot lookups — the small master/lookup tables that global modals (Record
// Payment, New Voucher, PartyDetail), sidebar badges and cross-tab dropdowns
// read from ANY tab. Loaded once per sign-in. Heavy browsing data
// (transactions, sales, purchases, stock adjustments, attendance, ...) is
// deliberately NOT here — it is per-feature.
const BOOT_LOOKUPS: CollectionName[] = [
  'settings', 'parties', 'items', 'categories', 'units', 'locations', 'accounts',
  'orders', 'vehicles', 'drivers', 'tripSlips', 'tyres', 'vehicleEmiEntries',
];

// Collections touched by a sale/purchase write (they can mint or compensate
// journal + settlement vouchers, move party/account balances and stock).
// 'tripSlips' rides with the sale touch list: the server auto-derives /
// updates the dispatch trip slip on every sale create/edit
const SALE_TOUCH: CollectionName[] = ['sales', 'transactions', 'parties', 'accounts', 'items', 'tripSlips'];
const PURCHASE_TOUCH: CollectionName[] = ['purchases', 'transactions', 'parties', 'accounts', 'items'];

// Sidebar tab → the heavy collections fetched on EVERY visit to that tab
// (lookup dependencies come from BOOT_LOOKUPS). Tab ids mirror the Sidebar's
// NavigationTab union without importing a component type into the service
// layer. users/settings/design tabs need nothing here.
const FEATURE_COLLECTIONS: Record<string, CollectionName[]> = {
  dashboard: ['transactions'],
  parties: ['parties', 'transactions', 'sales', 'purchases', 'accounts'],
  'cash-bank': ['accounts', 'transfers', 'adjustments', 'transactions', 'parties', 'employeePayments'],
  items: ['items', 'categories', 'units', 'locations', 'stockAdjustments'],
  sales: ['sales', 'purchases', 'transactions', 'accounts'],
  purchases: ['purchases', 'sales', 'transactions', 'accounts'],
  production: ['productionBatches', 'items'],
  // drivers are employees with role 'driver' — loaded via 'employees'.
  logistics: [
    'vehicles', 'tripSlips', 'tyres', 'employees', 'vehicleEmiEntries',
    // The Trips table's SALE ORDER column + transport figures resolve from
    // the sales master (slip.saleId) — the fleet feature must carry it
    'sales',
  ],
  // attendance reads are date-scoped (daily sheet / register fetch their own
  // window); the ledger rows carry each employee's virtual account balance,
  // and accounts ride along — recording a bank-linked payout needs them.
  employees: ['employees', 'leaves', 'employeePayments', 'employeeLedgerTransactions', 'accounts'],
  evidence: ['evidenceFolders', 'evidenceFiles', 'parties'],
};

// Collection → REST fetch. Both evidence members of one GET /documents/evidence
// call and `settings` (single record) are handled specially in loadCollections.
const COLLECTION_FETCHERS: Partial<Record<CollectionName, () => Promise<{ success: boolean; data?: unknown[] }>>> = {
  parties: () => api.getParties(),
  transactions: () => api.getTransactions(),
  items: () => api.getItems(),
  categories: () => api.getCategories(),
  units: () => api.getUnits(),
  locations: () => api.getLocations(),
  productionBatches: () => api.getBatches(),
  orders: () => api.getOrders(),
  sales: () => api.getSales(),
  purchases: () => api.getPurchases(),
  vehicles: () => api.getVehicles(),
  drivers: () => api.getDrivers(),
  tripSlips: () => api.getTripSlips(),
  tyres: () => api.getTyres(),
  vehicleEmiEntries: () => api.getVehicleEmiEntries(),
  employees: () => api.getEmployees(),
  attendance: () => api.getAttendance(),
  leaves: () => api.getLeaves(),
  employeePayments: () => api.getEmployeePayments(),
  employeeLedgerTransactions: () => api.getEmployeeLedgerTransactions(),
  accounts: () => api.getAccounts(),
  transfers: () => api.getTransfers(),
  adjustments: () => api.getAdjustments(),
  stockAdjustments: () => api.getStockAdjustments(),
};

const DEFAULT_CLEAN_SETTINGS: CompanySettings = {
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

/**
 * Authoritative Cloud Data Store
 * Directly connects all frontend modules to the backend REST API and Azure MySQL Flexible Server.
 * All local DB, browser localStorage persistence, and mock seed layers are completely decommissioned.
 */
class CloudStore {
  private parties: Party[] = [];
  private transactions: Transaction[] = [];
  private settings: CompanySettings = { ...DEFAULT_CLEAN_SETTINGS };
  private items: Item[] = [];
  private categories: ItemCategory[] = [];
  private units: ItemUnit[] = [];
  private locations: ItemLocation[] = [];
  private productionBatches: ProductionBatchRun[] = [];
  private orders: Order[] = []; // legacy rows (retired table) — read-only
  private sales: Sale[] = [];
  private purchases: Purchase[] = [];
  private vehicles: Vehicle[] = [];
  private drivers: Driver[] = [];
  private tripSlips: TripSlip[] = [];
  private tyres: Tyre[] = [];
  private vehicleEmiEntries: VehicleEmiEntry[] = [];
  private employees: Employee[] = [];
  private attendance: EmployeeAttendance[] = [];
  private leaves: EmployeeLeave[] = [];
  private employeePayments: EmployeePayment[] = [];
  private employeeLedgerTransactions: EmployeeLedgerTransaction[] = [];
  private accounts: CashBankAccount[] = [];
  private transfers: InternalTransfer[] = [];
  private adjustments: AccountAdjustment[] = [];
  private stockAdjustments: ItemStockAdjustment[] = [];
  private evidenceFolders: EvidenceFolder[] = [];
  private evidenceFiles: EvidenceFile[] = [];

  private listeners: Set<() => void> = new Set();
  private isServerOnline = true;
  private lastSyncTime = '';
  private syncInProgress = false;
  private pendingSyncFresh = false;

  constructor() {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.loadSettingsOnly();
      }, 50);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[CloudStore] Listener notify error:', err);
      }
    });
  }

  /**
   * Hydrates state directly from the authoritative Cloud REST API.
   */
  public async syncWithServer(fresh = false): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (this.syncInProgress) {
      this.pendingSyncFresh = this.pendingSyncFresh || fresh;
      return false;
    }
    this.syncInProgress = true;
    try {
      const res = await api.syncAll(fresh);
      if (res && res.success && res.data) {
        const d = res.data;
        if (d.parties) this.parties = d.parties;
        if (d.transactions) {
          const validPartyIds = new Set((this.parties || []).map((p) => p.id));
          this.transactions = d.transactions.filter((t) => validPartyIds.has(t.partyId));
        }
        if (d.settings) this.settings = d.settings;
        if (d.items) this.items = d.items;
        if (d.categories) this.categories = d.categories;
        if (d.units) this.units = d.units;
        if (d.locations) this.locations = d.locations;
        if (d.productionBatches) this.productionBatches = d.productionBatches;
        if (d.orders) this.orders = d.orders;
        if (d.sales) this.sales = d.sales;
        if (d.purchases) this.purchases = d.purchases;
        if (d.vehicles) this.vehicles = d.vehicles;
        if (d.drivers) this.drivers = d.drivers;
        if (d.tripSlips) this.tripSlips = d.tripSlips;
        if (d.tyres) this.tyres = d.tyres;
        if (d.employees) this.employees = d.employees;
        if (d.attendance) this.attendance = d.attendance;
        if (d.leaves) this.leaves = d.leaves;
        if (d.employeePayments) this.employeePayments = d.employeePayments;
        if (d.employeeLedgerTransactions) this.employeeLedgerTransactions = d.employeeLedgerTransactions;
        if (d.accounts) this.accounts = d.accounts;
        if (d.transfers) this.transfers = d.transfers;
        if (d.adjustments) this.adjustments = d.adjustments;
        if (d.stockAdjustments) this.stockAdjustments = d.stockAdjustments;
        if (d.evidenceFolders) this.evidenceFolders = d.evidenceFolders;
        if (d.evidenceFiles) this.evidenceFiles = d.evidenceFiles;

        this.isServerOnline = true;
        this.lastSyncTime = new Date().toLocaleTimeString();
        this.notify();
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[CloudStore] Cloud sync failed:', e);
      this.isServerOnline = false;
      return false;
    } finally {
      this.syncInProgress = false;
      if (this.pendingSyncFresh) {
        const nextFresh = this.pendingSyncFresh;
        this.pendingSyncFresh = false;
        setTimeout(() => {
          this.syncWithServer(nextFresh);
        }, 50);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PER-FEATURE LOADING
  // ---------------------------------------------------------------------------
  // The app no longer rides one monolithic snapshot for every tab. Each sidebar
  // tab fetches only the collections it consumes (loadFeature), global modal /
  // dropdown dependencies load once at sign-in (BOOT_LOOKUPS), and mutations
  // refresh only the collections they actually affect (targeted
  // loadCollections calls at each write site). syncWithServer remains ONLY for
  // the explicit full-refetch affordances (BackendStatusModal "Sync Now",
  // backup restore). No view code changed — collections still land in this
  // store and reach views through the same useDatabase() getters.
  private featureLoading = false;
  private counts: SidebarCounts | null = null;

  /**
   * Fetches the given collections from their per-entity endpoints and assigns
   * them. Assignment order matters: parties MUST land before transactions so
   * the valid-party filter (getTransactions) sees the party list. Every other
   * collection is authoritative per-entity data — an empty [] overwrites what
   * was locally held, unlike syncWithServer's keep-if-absent semantics.
   */
  public async loadCollections(names: CollectionName[]): Promise<void> {
    if (typeof window === 'undefined' || names.length === 0) return;
    const unique = Array.from(new Set(names));
    this.featureLoading = true;
    this.notify();
    try {
      const arrayNames = unique.filter(
        (n) => n !== 'settings' && n !== 'evidenceFolders' && n !== 'evidenceFiles'
      );
      const settled = await Promise.all(
        arrayNames.map(async (name) => [name, await COLLECTION_FETCHERS[name]!().catch(() => null)] as const)
      );

      const loaded: Partial<Record<CollectionName, unknown[]>> = {};
      let anySuccess = false;
      for (const [name, res] of settled) {
        if (res && res.success && Array.isArray(res.data)) {
          loaded[name] = res.data;
          anySuccess = true;
        }
      }

      if (unique.includes('evidenceFolders') || unique.includes('evidenceFiles')) {
        const ev = await api.getEvidence().catch(() => null);
        if (ev && ev.success && ev.data) {
          if (unique.includes('evidenceFolders')) this.evidenceFolders = ev.data.evidenceFolders || [];
          if (unique.includes('evidenceFiles')) this.evidenceFiles = ev.data.evidenceFiles || [];
          anySuccess = true;
        }
      }

      // parties first, so the transaction filter below runs against the fresh set
      if (loaded.parties) this.parties = loaded.parties as Party[];
      if (loaded.orders) this.orders = loaded.orders as Order[];
      if (loaded.transactions) {
        // Filter by valid parties ONLY when the party list is already known
        // (fresh in this load, or previously loaded). Until then keep every
        // row — the server JOINs party names itself, so worst case the filter
        // is a client-side refinement, never a correctness requirement.
        const guardTransactions = Boolean(loaded.parties) || this.parties.length > 0;
        if (guardTransactions) {
          const validPartyIds = new Set(this.parties.map((p) => p.id));
          this.transactions = (loaded.transactions as Transaction[]).filter((t) => validPartyIds.has(t.partyId));
        } else {
          this.transactions = loaded.transactions as Transaction[];
        }
      }
      if (loaded.items) this.items = loaded.items as Item[];
      if (loaded.categories) this.categories = loaded.categories as ItemCategory[];
      if (loaded.units) this.units = loaded.units as ItemUnit[];
      if (loaded.locations) this.locations = loaded.locations as ItemLocation[];
      if (loaded.productionBatches) this.productionBatches = loaded.productionBatches as ProductionBatchRun[];
      if (loaded.sales) this.sales = loaded.sales as Sale[];
      if (loaded.purchases) this.purchases = loaded.purchases as Purchase[];
      if (loaded.vehicles) this.vehicles = loaded.vehicles as Vehicle[];
      if (loaded.drivers) this.drivers = loaded.drivers as Driver[];
      if (loaded.tripSlips) this.tripSlips = loaded.tripSlips as TripSlip[];
      if (loaded.tyres) this.tyres = loaded.tyres as Tyre[];
      if (loaded.vehicleEmiEntries) this.vehicleEmiEntries = loaded.vehicleEmiEntries as VehicleEmiEntry[];
      if (loaded.employees) this.employees = loaded.employees as Employee[];
      if (loaded.attendance) this.attendance = loaded.attendance as EmployeeAttendance[];
      if (loaded.leaves) this.leaves = loaded.leaves as EmployeeLeave[];
      if (loaded.employeePayments) this.employeePayments = loaded.employeePayments as EmployeePayment[];
      if (loaded.employeeLedgerTransactions) this.employeeLedgerTransactions = loaded.employeeLedgerTransactions as EmployeeLedgerTransaction[];
      if (loaded.accounts) this.accounts = loaded.accounts as CashBankAccount[];
      if (loaded.transfers) this.transfers = loaded.transfers as InternalTransfer[];
      if (loaded.adjustments) this.adjustments = loaded.adjustments as AccountAdjustment[];
      if (loaded.stockAdjustments) this.stockAdjustments = loaded.stockAdjustments as ItemStockAdjustment[];
      if (loaded.evidenceFolders) this.evidenceFolders = loaded.evidenceFolders as EvidenceFolder[];
      if (loaded.evidenceFiles) this.evidenceFiles = loaded.evidenceFiles as EvidenceFile[];

      const settingsRes = unique.includes('settings') ? await api.getSettings().catch(() => null) : null;
      if (settingsRes && settingsRes.success) {
        this.settings = settingsRes.data;
        anySuccess = true;
      }

      this.isServerOnline = anySuccess;
      this.lastSyncTime = new Date().toLocaleTimeString();
    } catch (err) {
      console.warn('[CloudStore] Per-feature load failed:', err);
      this.isServerOnline = false;
    } finally {
      this.featureLoading = false;
      this.notify();
    }
  }

  /** Fetches only the tab's own (heavy) collections on each sidebar visit. */
  public async loadFeature(tab: string): Promise<void> {
    const names = FEATURE_COLLECTIONS[tab] || [];
    await this.loadCollections(names);
  }

  /**
   * One boot batch per sign-in: the small master/lookup tables that global
   * modals, dropdowns and name-resolution read from ANY tab, plus sidebar
   * counts. Heavy per-feature data is deliberately NOT here.
   */
  public async loadBootLookups(): Promise<void> {
    await this.loadCollections(BOOT_LOOKUPS);
    await this.refreshCounts();
  }

  /** Pre-login hydration: branding settings only (previously the tiered /api/sync). */
  public async loadSettingsOnly(): Promise<void> {
    try {
      const res = await api.getSettings();
      if (res && res.success) {
        this.settings = res.data;
        this.isServerOnline = true;
        this.lastSyncTime = new Date().toLocaleTimeString();
      } else {
        this.isServerOnline = false;
      }
    } catch {
      this.isServerOnline = false;
    }
    this.notify();
  }

  public async refreshCounts(): Promise<void> {
    try {
      const res = await api.getCounts();
      if (res && res.success && res.data) {
        this.counts = {
          parties: Number(res.data.parties ?? this.parties.length),
          items: Number(res.data.items ?? this.items.length),
          sales: Number(res.data.sales ?? this.sales.length),
          purchases: Number(res.data.purchases ?? this.purchases.length),
          orders: Number(res.data.orders ?? this.orders.length),
          accounts: Number(res.data.accounts ?? this.accounts.length),
          employees: Number(res.data.employees ?? this.employees.length),
        };
      }
    } catch (err) {
      console.warn('[CloudStore] Counts fetch failed:', err);
    }
    this.notify();
  }

  public getCounts(): SidebarCounts | null {
    return this.counts ? { ...this.counts } : null;
  }

  public isFeatureLoading(): boolean {
    return this.featureLoading;
  }

  /**
   * Targeted post-mutation refresh — the per-feature replacement for the old
   * post-write full snapshot. Refreshes only the collections the write can
   * affect (plus sidebar counts where they can move). Fire-and-forget,
   * matching the previous syncWithServer call-shape.
   */
  private refreshAfter(names: CollectionName[], withCounts = true): void {
    this.loadCollections(names);
    if (withCounts) this.refreshCounts();
  }

  // --- GETTERS ---
  public getParties(): Party[] { return [...this.parties]; }
  public getPartyById(id: string): Party | undefined { return this.parties.find((p) => p.id === id); }
  public getTransactions(): Transaction[] {
    const validPartyIds = new Set(this.parties.map((p) => p.id));
    return this.transactions.filter((t) => validPartyIds.has(t.partyId));
  }
  public getSettings(): CompanySettings { return { ...this.settings }; }
  public getItems(): Item[] { return [...this.items]; }
  public getCategories(): ItemCategory[] { return [...this.categories]; }
  public getUnits(): ItemUnit[] { return [...this.units]; }
  public getLocations(): ItemLocation[] { return [...this.locations]; }
  public getProductionBatches(): ProductionBatchRun[] { return [...this.productionBatches]; }
  /** @deprecated legacy `orders` rows (retired table) — read-only */
  public getOrders(): Order[] { return [...this.orders]; }

  /** @deprecated legacy `orders` are retired writers; this only patches the
   *  in-memory legacy mirror (e.g. logistics vehicle sync on old rows). */
  public updateLegacyOrder(id: string, updates: Partial<Order>): Order | null {
    let updated: Order | null = null;
    this.orders = this.orders.map((o) => {
      if (o.id === id) {
        updated = { ...o, ...updates };
        return updated;
      }
      return o;
    });
    if (updated) this.notify();
    return updated;
  }
  public getSales(): Sale[] { return [...this.sales]; }
  public getPurchaseById(id: string) { return this.purchases.find((p) => p.id === id); }
  public getSaleById(id: string) { return this.sales.find((s) => s.id === id); }
  public getPurchases(): Purchase[] { return [...this.purchases]; }
  public getVehicles(): Vehicle[] { return [...this.vehicles]; }
  public getDrivers(): Driver[] { return [...this.drivers]; }
  public getTripSlips(): TripSlip[] { return [...this.tripSlips]; }
  public getTyres(): Tyre[] { return [...this.tyres]; }
  public getVehicleEmiEntries(vehicleId?: string): VehicleEmiEntry[] {
    return vehicleId ? this.vehicleEmiEntries.filter((e) => e.vehicleId === vehicleId) : [...this.vehicleEmiEntries];
  }
  public getEmployees(): Employee[] { return [...this.employees]; }
  public getAttendance(): EmployeeAttendance[] { return [...this.attendance]; }
  public getLeaves(): EmployeeLeave[] { return [...this.leaves]; }
  public getEmployeePayments(): EmployeePayment[] { return [...this.employeePayments]; }
  public getEmployeeLedgerTransactions(): EmployeeLedgerTransaction[] { return [...this.employeeLedgerTransactions]; }
  public getAccounts(): CashBankAccount[] { return [...this.accounts]; }
  public getTransfers(): InternalTransfer[] { return [...this.transfers]; }
  public getAdjustments(): AccountAdjustment[] { return [...this.adjustments]; }
  public getStockAdjustments(): ItemStockAdjustment[] { return [...this.stockAdjustments]; }
  public getEvidenceFolders(): EvidenceFolder[] { return [...this.evidenceFolders]; }
  public getEvidenceFiles(): EvidenceFile[] { return [...this.evidenceFiles]; }
  public isBackendOnline(): boolean { return this.isServerOnline; }
  public getLastSyncTime(): string { return this.lastSyncTime; }
  public isSyncing(): boolean { return this.syncInProgress; }

  // --- MUTATIONS: DIRECT CLOUD REST OPERATIONS ---

  // Parties
  public addParty(partyData: Omit<Party, 'id' | 'currentBalance' | 'createdAt' | 'updatedAt'>): Party {
    // documentIds ride the create payload (staged documents — the server links
    // them once the authoritative party id is minted) but are NEVER stored on
    // the optimistic local party row.
    const { documentIds, ...storedPartyData } = partyData as typeof partyData & { documentIds?: string[] };
    const newParty: Party = {
      ...storedPartyData,
      id: `pty-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      currentBalance: partyData.openingBalance ? (partyData.openingBalanceType === 'to_receive' ? partyData.openingBalance : -partyData.openingBalance) : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.parties.unshift(newParty);
    this.notify();
    // Capture the SERVER-minted party (authoritative ID) — the optimistic ID
    // is only a placeholder and would orphan follow-up edits before resync.
    api
      .createParty(partyData)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.parties = this.parties.map((p) =>
            p.id === newParty.id ? { ...created } : p
          );
          this.notify();
        }
      })
      // Refresh AFTER adoption, so a post-POST list response can never race in
      // front of the server-minted record and wipe it.
      .then(() => this.refreshAfter(['parties']))
      .catch((err) => console.error('[CloudStore] addParty cloud error:', err));
    return newParty;
  }

  public addPartiesBulk(partiesData: Array<Omit<Party, 'id' | 'currentBalance' | 'createdAt' | 'updatedAt'>>): Party[] {
    const created: Party[] = partiesData.map((p, idx) => ({
      ...p,
      id: `pty-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      currentBalance: p.openingBalance ? (p.openingBalanceType === 'to_receive' ? p.openingBalance : -p.openingBalance) : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    this.parties = [...created, ...this.parties];
    this.notify();
    Promise.all(
      partiesData.map((p, idx) =>
        // Capture each server-minted party and swap the optimistic record by
        // index (created[idx] corresponds to partiesData[idx]).
        api
          .createParty(p)
          .then((res) => {
            const srv = res?.data;
            if (srv?.id) {
              this.parties = this.parties.map((q) =>
                q.id === created[idx]?.id ? { ...srv } : q
              );
              this.notify();
            }
          })
          .catch((err) => console.error('[CloudStore] addPartiesBulk cloud error:', err))
      )
      // ONE authoritative refresh after every row is registered — never before,
      // or a pre-POST list response would wipe the adopted rows.
    ).then(() => this.refreshAfter(['parties']));
    return created;
  }

  public updateParty(id: string, updates: Partial<Party>): Party | null {
    let updated: Party | null = null;
    this.parties = this.parties.map((p) => {
      if (p.id === id) {
        updated = { ...p, ...updates, updatedAt: new Date().toISOString() };
        return updated;
      }
      return p;
    });
    if (updated) {
      this.notify();
      api.updateParty(id, updates).then(() => this.refreshAfter(['parties'], false)).catch((err) => console.error('[CloudStore] updateParty cloud error:', err));
    }
    return updated;
  }

  public deleteParty(id: string): boolean {
    const exists = this.parties.some((p) => p.id === id);
    if (exists) {
      this.parties = this.parties.filter((p) => p.id !== id);
      this.transactions = this.transactions.filter((t) => t.partyId !== id);
      this.notify();
      // The server also removes the party's vouchers (server-side sweep that
      // touches account balances) — refresh transactions + accounts too.
      api.deleteParty(id).then(() => this.refreshAfter(['parties', 'transactions', 'accounts'])).catch((err) => console.error('[CloudStore] deleteParty cloud error:', err));
      return true;
    }
    return false;
  }

  // Transactions
  public addTransaction(txData: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
    const newTx: Transaction = {
      ...txData,
      id: `txn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    };
    this.transactions.unshift(newTx);
    // Adjust party balance in memory
    const party = this.parties.find((p) => p.id === txData.partyId);
    if (party) {
      let delta = 0;
      if (txData.type === 'sale_invoice') delta = txData.amount;
      else if (txData.type === 'purchase_bill') delta = -txData.amount;
      else if (txData.type === 'payment_in') delta = -txData.amount;
      else if (txData.type === 'payment_out') delta = txData.amount;
      party.currentBalance = (party.currentBalance || 0) + delta;
    }
    this.notify();
    api.createTransaction(txData).then(() => this.refreshAfter(['parties', 'transactions', 'accounts'])).catch((err) => console.error('[CloudStore] addTransaction cloud error:', err));
    return newTx;
  }

  // Settings
  public updateSettings(newSettings: Partial<CompanySettings>): CompanySettings {
    this.settings = { ...this.settings, ...newSettings };
    this.notify();
    api.updateSettings(newSettings).then(() => this.refreshAfter(['settings'], false)).catch((err) => console.error('[CloudStore] updateSettings cloud error:', err));
    return this.settings;
  }

  // Items & Products
  public addItem(itemData: Partial<Item>): Item {
    // documentIds ride the create payload (staged documents — the server links
    // them once the authoritative item id is minted) but are NEVER stored on
    // the optimistic local item row.
    const { documentIds, ...storedItemData } = itemData as typeof itemData & { documentIds?: string[] };
    const newItem: Item = {
      id: `itm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: storedItemData.name || '',
      code: storedItemData.code || '',
      type: storedItemData.type || 'product',
      categoryId: storedItemData.categoryId || '',
      categoryName: storedItemData.categoryName || '',
      unit: storedItemData.unit || 'MT',
      hsnSacCode: storedItemData.hsnSacCode || '',
      taxRateGst: storedItemData.taxRateGst ?? 18,
      salePrice: storedItemData.salePrice || 0,
      purchasePrice: storedItemData.purchasePrice || 0,
      isActive: storedItemData.isActive ?? true,
      currentStock: storedItemData.currentStock || 0,
      minStockLevel: storedItemData.minStockLevel || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...storedItemData,
    } as Item;
    this.items.unshift(newItem);
    this.notify();
    // Adopt the SERVER-minted item (authoritative id) — an immediate edit
    // without a refresh must never target the optimistic placeholder id.
    api
      .createItem(itemData)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.items = this.items.map((it) => (it.id === newItem.id ? { ...created } : it));
          this.notify();
        }
      })
      // AFTER adoption (same no-race rule as addParty)
      .then(() => this.refreshAfter(['items']))
      .catch((err) => console.error('[CloudStore] addItem cloud error:', err));
    return newItem;
  }

  public updateItem(id: string, updates: Partial<Item>): Item | null {
    let updated: Item | null = null;
    this.items = this.items.map((it) => {
      if (it.id === id) {
        updated = { ...it, ...updates, updatedAt: new Date().toISOString() };
        return updated;
      }
      return it;
    });
    if (updated) {
      this.notify();
      // Item hydrations (categoryName, stock valuation) resolve via JOINs —
      // refresh the collection after the edit so display fields follow.
      api.updateItem(id, updates).then(() => this.refreshAfter(['items'], false)).catch((err) => console.error('[CloudStore] updateItem cloud error:', err));
    }
    return updated;
  }

  public deleteItem(id: string): boolean {
    const exists = this.items.some((i) => i.id === id);
    if (exists) {
      this.items = this.items.filter((i) => i.id !== id);
      this.notify();
      api.deleteItem(id).then(() => this.refreshAfter(['items'])).catch((err) => console.error('[CloudStore] deleteItem cloud error:', err));
      return true;
    }
    return false;
  }

  // Categories
  public addCategory(cat: Partial<ItemCategory>): ItemCategory {
    const newCat: ItemCategory = {
      id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: cat.name || '',
      description: cat.description || '',
      type: cat.type || 'product',
      color: cat.color || 'blue',
      createdAt: new Date().toISOString(),
      ...cat,
    };
    this.categories.push(newCat);
    this.notify();
    // Adopt the SERVER-minted category (authoritative id) — items immediately
    // referencing this category must never keep the optimistic placeholder id.
    // The server creator honors a supplied id (createCategory's contract), so
    // the optimistic id rides the payload — client & server agree instantly.
    api
      .createCategory(newCat)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.categories = this.categories.map((c) => (c.id === newCat.id ? { ...created } : c));
          this.notify();
        }
      })
      .catch((err) => console.error('[CloudStore] addCategory cloud error:', err));
    return newCat;
  }

  public updateCategory(id: string, updates: Partial<ItemCategory>): ItemCategory | null {
    let updated: ItemCategory | null = null;
    this.categories = this.categories.map((c) => {
      if (c.id === id) {
        updated = { ...c, ...updates };
        return updated;
      }
      return c;
    });
    if (updated) {
      this.notify();
      api.updateCategory(id, updates).then(() => this.refreshAfter(['categories', 'items'], false)).catch((err) => console.error('[CloudStore] updateCategory cloud error:', err));
    }
    return updated;
  }

  public deleteCategory(id: string): boolean {
    const exists = this.categories.some((c) => c.id === id);
    if (exists) {
      this.categories = this.categories.filter((c) => c.id !== id);
      this.notify();
      api.deleteCategory(id).then(() => this.refreshAfter(['categories', 'items'], false)).catch((err) => console.error('[CloudStore] deleteCategory cloud error:', err));
      return true;
    }
    return false;
  }

  // Units
  public addUnit(unit: Partial<ItemUnit>): ItemUnit {
    const newUnit: ItemUnit = {
      id: `u-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      code: unit.code || '',
      name: unit.name || '',
      allowDecimal: unit.allowDecimal ?? true,
      isStandard: unit.isStandard ?? false,
      ...unit,
    };
    this.units.push(newUnit);
    this.notify();
    // Adopt the SERVER-minted unit (authoritative id) — swap out the placeholder.
    // The server creator honors a supplied id, so it rides the payload.
    api
      .createUnit(newUnit)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.units = this.units.map((u) => (u.id === newUnit.id ? { ...created } : u));
          this.notify();
        }
      })
      .catch((err) => console.error('[CloudStore] addUnit cloud error:', err));
    return newUnit;
  }

  public updateUnit(id: string, updates: Partial<ItemUnit>): ItemUnit | null {
    let updated: ItemUnit | null = null;
    this.units = this.units.map((u) => {
      if (u.id === id) {
        updated = { ...u, ...updates };
        return updated;
      }
      return u;
    });
    if (updated) {
      this.notify();
      api.updateUnit(id, updates).then(() => this.refreshAfter(['units', 'items'], false)).catch((err) => console.error('[CloudStore] updateUnit cloud error:', err));
    }
    return updated;
  }

  public deleteUnit(id: string): boolean {
    const exists = this.units.some((u) => u.id === id);
    if (exists) {
      this.units = this.units.filter((u) => u.id !== id);
      this.notify();
      api.deleteUnit(id).then(() => this.refreshAfter(['units', 'items'], false)).catch((err) => console.error('[CloudStore] deleteUnit cloud error:', err));
      return true;
    }
    return false;
  }

  // Locations
  public addLocation(loc: Partial<ItemLocation>): ItemLocation {
    const newLoc: ItemLocation = {
      id: `loc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: loc.name || '',
      code: loc.code,
      type: loc.type || 'warehouse',
      capacity: loc.capacity,
      description: loc.description,
      isStandard: loc.isStandard ?? false,
      createdAt: new Date().toISOString(),
      ...loc,
    };
    this.locations.push(newLoc);
    this.notify();
    // Adopt the SERVER-minted location (authoritative id) — item location
    // rows referencing it must never keep the optimistic placeholder id.
    // The server creator honors a supplied id, so it rides the payload.
    api
      .createLocation(newLoc)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.locations = this.locations.map((l) => (l.id === newLoc.id ? { ...created } : l));
          this.notify();
        }
      })
      .catch((err) => console.error('[CloudStore] addLocation cloud error:', err));
    return newLoc;
  }

  public updateLocation(id: string, updates: Partial<ItemLocation>): ItemLocation | null {
    let updated: ItemLocation | null = null;
    this.locations = this.locations.map((l) => {
      if (l.id === id) {
        updated = { ...l, ...updates };
        return updated;
      }
      return l;
    });
    if (updated) {
      this.notify();
      api.updateLocation(id, updates).then(() => this.refreshAfter(['locations', 'items'], false)).catch((err) => console.error('[CloudStore] updateLocation cloud error:', err));
    }
    return updated;
  }

  public deleteLocation(id: string): boolean {
    const exists = this.locations.some((l) => l.id === id);
    if (exists) {
      this.locations = this.locations.filter((l) => l.id !== id);
      this.notify();
      api.deleteLocation(id).then(() => this.refreshAfter(['locations', 'items'], false)).catch((err) => console.error('[CloudStore] deleteLocation cloud error:', err));
      return true;
    }
    return false;
  }

  // Stock Adjustments
  public addStockAdjustment(adj: Partial<ItemStockAdjustment>): ItemStockAdjustment {
    return this.createStockAdjustment(adj);
  }

  public createStockAdjustment(adj: Partial<ItemStockAdjustment>): ItemStockAdjustment {
    const newAdj: ItemStockAdjustment = {
      id: `stk-adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      // No client-side voucher number: the server generates the authoritative
      // collision-free STK-ADJ-26/NNN numbering and the post-create sync adopts it.
      adjustmentNumber: adj.adjustmentNumber || '',
      itemId: adj.itemId || '',
      itemName: adj.itemName || '',
      itemCode: adj.itemCode || '',
      unit: adj.unit || 'MT',
      date: adj.date || new Date().toISOString().split('T')[0],
      type: adj.type || 'increase',
      quantity: adj.quantity || 0,
      rate: adj.rate || 0,
      totalValue: (adj.quantity || 0) * (adj.rate || 0),
      previousStock: adj.previousStock || 0,
      newStock: adj.newStock || 0,
      reason: adj.reason || '',
      createdAt: new Date().toISOString(),
      ...adj,
    };
    if (!newAdj.adjustmentNumber) delete (newAdj as any).adjustmentNumber;
    this.stockAdjustments.unshift(newAdj);
    // Update item stock level in memory
    const itm = this.items.find((i) => i.id === adj.itemId);
    if (itm) {
      if (adj.type === 'increase') itm.currentStock += adj.quantity || 0;
      else itm.currentStock -= adj.quantity || 0;
    }
    this.notify();
    api.createStockAdjustment(adj).then(() => this.refreshAfter(['items', 'stockAdjustments'])).catch((err) => console.error('[CloudStore] createStockAdjustment cloud error:', err));
    return newAdj;
  }

  public deleteStockAdjustment(id: string): boolean {
    const exists = this.stockAdjustments.some((a) => a.id === id);
    if (exists) {
      this.stockAdjustments = this.stockAdjustments.filter((a) => a.id !== id);
      this.notify();
      // Notify the server so it reverts the stock and deletes the voucher row.
      // Only re-sync after the server confirms, otherwise the deleted voucher resurrects.
      api.deleteStockAdjustment(id)
        .then(() => this.refreshAfter(['items', 'stockAdjustments']))
        .catch((err) => {
          console.error('[CloudStore] deleteStockAdjustment cloud error:', err);
          // Server delete failed - re-fetch to restore the authoritative state
          this.refreshAfter(['items', 'stockAdjustments']);
        });
      return true;
    }
    return false;
  }

  // Accounts
  public addAccount(data: Partial<CashBankAccount>): CashBankAccount {
    const newAcc: CashBankAccount = {
      id: `acc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: data.name || (data as any).accountName || 'Cash Account',
      type: data.type || (data as any).accountType || 'cash',
      openingBalance: data.openingBalance || 0,
      currentBalance: data.currentBalance ?? (data.openingBalance || 0),
      asOfDate: data.asOfDate || new Date().toISOString().split('T')[0],
      isActive: data.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    this.accounts.unshift(newAcc);
    this.notify();
    // Adopt the SERVER-minted account (authoritative id) — vouchers/payments
    // posted against it must never carry the optimistic placeholder id.
    api
      .createAccount(data)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.accounts = this.accounts.map((a) => (a.id === newAcc.id ? { ...created } : a));
          this.notify();
        }
      })
      .then(() => this.refreshAfter(['accounts']))
      .catch((err) => console.error('[CloudStore] addAccount cloud error:', err));
    return newAcc;
  }

  public updateAccount(id: string, updates: Partial<CashBankAccount>): CashBankAccount | null {
    let updated: CashBankAccount | null = null;
    this.accounts = this.accounts.map((a) => {
      if (a.id === id) {
        updated = { ...a, ...updates, updatedAt: new Date().toISOString() };
        return updated;
      }
      return a;
    });
    if (updated) {
      this.notify();
      api.updateAccount(id, updates).then(() => this.refreshAfter(['accounts'])).catch((err) => console.error('[CloudStore] updateAccount cloud error:', err));
    }
    return updated;
  }

  public deleteAccount(id: string): boolean {
    const exists = this.accounts.some((a) => a.id === id);
    if (exists) {
      this.accounts = this.accounts.filter((a) => a.id !== id);
      this.notify();
      api.deleteAccount(id).then(() => this.refreshAfter(['accounts'], true)).catch((err) => console.error('[CloudStore] deleteAccount cloud error:', err));
      return true;
    }
    return false;
  }

  // Transfers & Adjustments
  public addTransfer(data: Partial<InternalTransfer>): InternalTransfer {
    const newTrf: InternalTransfer = {
      id: `trf-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      transferNumber: data.transferNumber || `TRF-${Date.now().toString().substr(-6)}`,
      date: data.date || new Date().toISOString().split('T')[0],
      // Account FKs only; the optimistic record hydrates display names from the
      // local account mirror until the server resync replaces it with the
      // JOIN-resolved row (Golden Rule, documentation §2).
      fromAccountId: data.fromAccountId || '',
      toAccountId: data.toAccountId || '',
      transferType: data.transferType || 'bank_to_bank',
      amount: data.amount || 0,
      createdAt: new Date().toISOString(),
      ...data,
    };
    newTrf.fromAccountName =
      this.accounts.find((a) => a.id === newTrf.fromAccountId)?.name || newTrf.fromAccountName || undefined;
    newTrf.toAccountName =
      this.accounts.find((a) => a.id === newTrf.toAccountId)?.name || newTrf.toAccountName || undefined;
    this.transfers.unshift(newTrf);
    this.notify();
    api.createTransfer(data).then(() => this.refreshAfter(['accounts', 'transfers', 'transactions'])).catch((err) => console.error('[CloudStore] addTransfer cloud error:', err));
    return newTrf;
  }

  public deleteTransfer(id: string): boolean {
    const exists = this.transfers.some((t) => t.id === id);
    if (exists) {
      this.transfers = this.transfers.filter((t) => t.id !== id);
      this.notify();
      api.deleteTransfer(id).then(() => this.refreshAfter(['accounts', 'transfers', 'transactions'])).catch((err) => console.error('[CloudStore] deleteTransfer cloud error:', err));
      return true;
    }
    return false;
  }

  public addAdjustment(data: Partial<AccountAdjustment>): AccountAdjustment {
    const newAdj: AccountAdjustment = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      adjustmentNumber: data.adjustmentNumber || `ADJ-${Date.now().toString().substr(-6)}`,
      // Account FK only; the optimistic record hydrates the display name/type
      // from the local account mirror until the server resync replaces it with
      // the JOIN-resolved row (Golden Rule, documentation §2).
      accountId: data.accountId || '',
      date: data.date || new Date().toISOString().split('T')[0],
      type: data.type || 'increase',
      amount: data.amount || 0,
      previousBalance: data.previousBalance || 0,
      newBalance: data.newBalance || 0,
      reason: data.reason || '',
      createdAt: new Date().toISOString(),
      ...data,
    };
    const adjAcc = this.accounts.find((a) => a.id === newAdj.accountId);
    newAdj.accountName = adjAcc?.name || newAdj.accountName || undefined;
    newAdj.accountType = adjAcc?.type || newAdj.accountType || undefined;
    this.adjustments.unshift(newAdj);
    this.notify();
    api.createAdjustment(data).then(() => this.refreshAfter(['accounts', 'adjustments', 'transactions'], false)).catch((err) => console.error('[CloudStore] addAdjustment cloud error:', err));
    return newAdj;
  }

  public deleteAdjustment(id: string): boolean {
    const exists = this.adjustments.some((a) => a.id === id);
    if (exists) {
      this.adjustments = this.adjustments.filter((a) => a.id !== id);
      this.notify();
      api.deleteAdjustment(id).then(() => this.refreshAfter(['accounts', 'adjustments', 'transactions'], false)).catch((err) => console.error('[CloudStore] deleteAdjustment cloud error:', err));
      return true;
    }
    return false;
  }

  // Sales & Purchases — relational order model.
  // Mutations post to the REST API and swap in the SERVER-minted record
  // (authoritative id, stage history, computed status + inventory flag),
  // then re-sync so ledger-driven stock levels land everywhere.

  // Sales
  public addSale(payload: any): Sale {
    const now = new Date().toISOString();
    const stage = payload.stage || undefined;
    const optimistic: Sale = {
      id: payload.id || `sale-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      saleNumber: payload.saleNumber || stage?.stageNumber || `SALE-${Date.now().toString().substr(-6)}`,
      partyId: payload.partyId || '',
      date: payload.date || now.split('T')[0],
      status: 'pending',
      notes: payload.notes,
      vehicleId: payload.vehicleId,
      siteAddress: payload.siteAddress,
      distanceKm: payload.distanceKm,
      vehicleNo: payload.vehicleNo,
      driverName: payload.driverName,
      transportCharges: Number(payload.transportCharges) || 0,
      freightRatePerTonne: (payload as any).freightRatePerTonne,
      freightGstRate: (payload as any).freightGstRate,
      inventoryApplied: Boolean(stage?.updateInventory),
      cashApplied: Boolean(stage?.updateCash),
      settlementType: stage?.settlementType && stage.settlementType !== 'none' ? stage.settlementType : undefined,
      settlementAccountId: stage?.settlementAccountId,
      paymentMode: stage?.paymentMode,
      settledAmount: stage?.updateCash && stage.settlementType !== 'credit' ? payload.totalAmount ?? payload.grandTotal : undefined,
      settledDate: stage?.updateCash && stage.settlementType !== 'credit' ? (stage.date || payload.date) : undefined,
      items: payload.items || [],
      stages: stage
        ? [{
            id: `sos-${Date.now()}`,
            saleId: payload.id || '',
            stageType: stage.stageType || 'sales_order',
            stageNumber: stage.stageNumber || payload.saleNumber || '',
            date: stage.date || payload.date || now.split('T')[0],
            subtotal: payload.subtotal ?? 0,
            taxAmount: payload.taxAmount ?? 0,
            totalAmount: payload.totalAmount ?? payload.grandTotal ?? 0,
            notes: stage.notes,
            createdAt: now,
          }]
        : [],
      createdAt: now,
      updatedAt: now,
    };
    this.sales.unshift(optimistic);
    this.notify();
    // Capture the SERVER-minted sale (authoritative id + stage rows + flags)
    api
      .createSale(payload)
      .then(async (res) => {
        const created = res?.data;
        if (created?.id) {
          this.sales = this.sales.map((s) => (s.id === optimistic.id ? { ...created } : s));
          this.notify();
        }
        await this.loadCollections(SALE_TOUCH);
        this.refreshCounts();
      })
      .catch((err) => console.error('[CloudStore] addSale cloud error:', err));
    return optimistic;
  }

  public updateSale(id: string, updates: any): Sale | null {
    let updated: Sale | null = null;
    this.sales = this.sales.map((s) => {
      if (s.id === id) {
        // One-shot inventory switch on the edit form: reflect the application
        // immediately (server response + resync confirm it).
        const invApplied = Boolean(updates.updateInventory) || s.inventoryApplied;
        updated = { ...s, ...updates, inventoryApplied: invApplied, updatedAt: new Date().toISOString() };
        return updated;
      }
      return s;
    });
    if (updated) {
      this.notify();
      api
        .updateSale(id, updates)
        .then(() => this.refreshAfter(SALE_TOUCH))
        .catch((err) => console.error('[CloudStore] updateSale cloud error:', err));
    }
    return updated;
  }

  public addSaleStage(id: string, stageInput: any): Sale | null {
    const existing = this.sales.find((s) => s.id === id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const optimisticStage = {
      id: `sos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      saleId: id,
      stageType: stageInput.stageType,
      stageNumber: stageInput.stageNumber || existing.saleNumber,
      date: stageInput.date || now.split('T')[0],
      subtotal: stageInput.subtotal ?? 0,
      taxAmount: stageInput.taxAmount ?? 0,
      totalAmount: stageInput.totalAmount ?? stageInput.grandTotal ?? 0,
      notes: stageInput.notes,
      createdAt: now,
    };
    this.sales = this.sales.map((s) =>
      s.id === id
        ? {
            ...s,
            stages: [...s.stages, optimisticStage],
            inventoryApplied: s.inventoryApplied || Boolean(stageInput.updateInventory),
            cashApplied: s.cashApplied || Boolean(stageInput.updateCash),
            settlementType: s.settlementType ?? (stageInput.settlementType && stageInput.settlementType !== 'none' ? stageInput.settlementType : undefined),
            updatedAt: now,
          }
        : s
    );
    this.notify();
    api
      .addSaleStage(id, stageInput)
      .then(() => this.refreshAfter(SALE_TOUCH))
      .catch((err) => console.error('[CloudStore] addSaleStage cloud error:', err));
    return this.sales.find((s) => s.id === id) || null;
  }

  public deleteSale(id: string): boolean {
    const exists = this.sales.some((s) => s.id === id);
    if (exists) {
      this.sales = this.sales.filter((s) => s.id !== id);
      this.notify();
      api
        .deleteSale(id)
        .then(() => this.refreshAfter(SALE_TOUCH))
        .catch((err) => {
          console.error('[CloudStore] deleteSale cloud error:', err);
          this.refreshAfter(SALE_TOUCH);
        });
      return true;
    }
    return false;
  }

  // Purchases
  public addPurchase(payload: any): Purchase {
    const now = new Date().toISOString();
    const stage = payload.stage || undefined;
    const optimistic: Purchase = {
      id: payload.id || `purc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      purchaseNumber: payload.purchaseNumber || stage?.stageNumber || `PURC-${Date.now().toString().substr(-6)}`,
      partyId: payload.partyId || undefined,
      date: payload.date || now.split('T')[0],
      status: 'pending',
      notes: payload.notes,
      inventoryApplied: Boolean(stage?.updateInventory),
      cashApplied: Boolean(stage?.updateCash),
      settlementType: stage?.settlementType && stage.settlementType !== 'none' ? stage.settlementType : undefined,
      settlementAccountId: stage?.settlementAccountId,
      paymentMode: stage?.paymentMode,
      settledAmount: stage?.updateCash && stage.settlementType !== 'credit' ? payload.totalAmount ?? payload.grandTotal : undefined,
      settledDate: stage?.updateCash && stage.settlementType !== 'credit' ? (stage.date || payload.date) : undefined,
      items: payload.items || [],
      stages: stage
        ? [{
            id: `pos-${Date.now()}`,
            purchaseId: payload.id || '',
            stageType: stage.stageType || 'purchase_order',
            stageNumber: stage.stageNumber || payload.purchaseNumber || '',
            date: stage.date || payload.date || now.split('T')[0],
            subtotal: payload.subtotal ?? 0,
            taxAmount: payload.taxAmount ?? 0,
            totalAmount: payload.totalAmount ?? payload.grandTotal ?? 0,
            rfqDetails: stage.rfqDetails,
            poDetails: stage.poDetails,
            receiptDetails: stage.receiptDetails,
            notes: stage.notes,
            createdAt: now,
          }]
        : [],
      createdAt: now,
      updatedAt: now,
    };
    this.purchases.unshift(optimistic);
    this.notify();
    api
      .createPurchase(payload)
      .then(async (res) => {
        const created = res?.data;
        if (created?.id) {
          this.purchases = this.purchases.map((p) => (p.id === optimistic.id ? { ...created } : p));
          this.notify();
        }
        await this.loadCollections(PURCHASE_TOUCH);
        this.refreshCounts();
      })
      .catch((err) => console.error('[CloudStore] addPurchase cloud error:', err));
    return optimistic;
  }

  public updatePurchase(id: string, updates: any): Purchase | null {
    let updated: Purchase | null = null;
    this.purchases = this.purchases.map((p) => {
      if (p.id === id) {
        const invApplied = Boolean(updates.updateInventory) || p.inventoryApplied;
        updated = { ...p, ...updates, inventoryApplied: invApplied, updatedAt: new Date().toISOString() };
        return updated;
      }
      return p;
    });
    if (updated) {
      this.notify();
      api
        .updatePurchase(id, updates)
        .then(() => this.refreshAfter(PURCHASE_TOUCH))
        .catch((err) => console.error('[CloudStore] updatePurchase cloud error:', err));
    }
    return updated;
  }

  public addPurchaseStage(id: string, stageInput: any): Purchase | null {
    const existing = this.purchases.find((p) => p.id === id);
    if (!existing) return null;
    const now = new Date().toISOString();
    this.purchases = this.purchases.map((p) =>
      p.id === id
        ? {
            ...p,
            stages: [
              ...p.stages.filter((s) => s.stageType !== stageInput.stageType),
              {
                id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                purchaseId: id,
                stageType: stageInput.stageType,
                stageNumber: stageInput.stageNumber || p.purchaseNumber,
                date: stageInput.date || now.split('T')[0],
                subtotal: stageInput.subtotal ?? 0,
                taxAmount: stageInput.taxAmount ?? 0,
                totalAmount: stageInput.totalAmount ?? stageInput.grandTotal ?? 0,
                rfqDetails: stageInput.rfqDetails,
                poDetails: stageInput.poDetails,
                receiptDetails: stageInput.receiptDetails,
                notes: stageInput.notes,
                createdAt: now,
              },
            ],
            inventoryApplied: p.inventoryApplied || Boolean(stageInput.updateInventory),
            cashApplied: p.cashApplied || Boolean(stageInput.updateCash),
            settlementType: p.settlementType ?? (stageInput.settlementType && stageInput.settlementType !== 'none' ? stageInput.settlementType : undefined),
            items: stageInput.items ? stageInput.items : p.items,
            updatedAt: now,
          }
        : p
    );
    this.notify();
    api
      .addPurchaseStage(id, stageInput)
      .then(() => this.refreshAfter(PURCHASE_TOUCH))
      .catch((err) => console.error('[CloudStore] addPurchaseStage cloud error:', err));
    return this.purchases.find((p) => p.id === id) || null;
  }

  public deletePurchase(id: string): boolean {
    const exists = this.purchases.some((p) => p.id === id);
    if (exists) {
      this.purchases = this.purchases.filter((p) => p.id !== id);
      this.notify();
      api
        .deletePurchase(id)
        .then(() => this.refreshAfter(PURCHASE_TOUCH))
        .catch((err) => {
          console.error('[CloudStore] deletePurchase cloud error:', err);
          this.refreshAfter(PURCHASE_TOUCH);
        });
      return true;
    }
    return false;
  }

  // Production Batches
  public addProductionBatch(batchData: Partial<ProductionBatchRun>): ProductionBatchRun {
    const newBatch: ProductionBatchRun = {
      id: `pbr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      batchNumber: batchData.batchNumber || `BATCH-${Date.now().toString().substr(-6)}`,
      date: batchData.date || new Date().toISOString().split('T')[0],
      plantUnit: batchData.plantUnit || '',
      targetItemId: batchData.targetItemId || '',
      targetItemName: batchData.targetItemName || '',
      targetQuantity: batchData.targetQuantity || 0,
      unit: batchData.unit || 'MT',
      mixTemperatureCelsius: batchData.mixTemperatureCelsius || 160,
      supervisorName: batchData.supervisorName || '',
      rawMaterialsConsumed: batchData.rawMaterialsConsumed || [],
      createdAt: new Date().toISOString(),
      ...batchData,
    };
    this.productionBatches.unshift(newBatch);
    this.notify();
    // Adopt the SERVER-minted batch (authoritative id) — production edits
    // and consumption views must never target the optimistic placeholder id.
    // The create also MOVES INVENTORY (raw deduction) — resync so item stocks
    // adopt the ledger everywhere.
    api
      .createBatch(batchData)
      .then(async (res) => {
        const created = res?.data;
        if (created?.id) {
          this.productionBatches = this.productionBatches.map((b) => (b.id === newBatch.id ? { ...created } : b));
          this.notify();
        }
        await this.loadCollections(['productionBatches', 'items']);
      })
      .catch((err) => console.error('[CloudStore] addProductionBatch cloud error:', err));
    return newBatch;
  }

  public deleteProductionBatch(id: string): boolean {
    const exists = this.productionBatches.some((b) => b.id === id);
    if (exists) {
      this.productionBatches = this.productionBatches.filter((b) => b.id !== id);
      this.notify();
      api.deleteBatch(id).then(() => this.refreshAfter(['productionBatches', 'items'])).catch((err) => console.error('[CloudStore] deleteProductionBatch cloud error:', err));
      return true;
    }
    return false;
  }

  // Logistics: Vehicles, Drivers, Tyres, Trip Slips
  public addVehicle(v: Partial<Vehicle>): Vehicle {
    // documentIds ride the create payload (staged documents — the server links
    // them once the authoritative vehicle id is minted) but are NEVER stored
    // on the optimistic local vehicle row.
    const { documentIds, ...storedVehData } = v as typeof v & { documentIds?: string[] };
    const newVeh: Vehicle = {
      id: `veh-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      vehicleNo: storedVehData.vehicleNo || (storedVehData as any).plateNumber || '',
      type: storedVehData.type || 'tipper',
      capacityTonnes: storedVehData.capacityTonnes || (storedVehData as any).capacityTons || 25,
      ownership: storedVehData.ownership || 'owned',
      status: storedVehData.status || 'available',
      createdAt: new Date().toISOString(),
      ...storedVehData,
    };
    this.vehicles.unshift(newVeh);
    this.notify();
    // Adopt the SERVER-minted vehicle (authoritative id) — trip slips and
    // tyre mounts referencing it must never keep the placeholder id.
    api
      .createVehicle(v)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.vehicles = this.vehicles.map((veh) => (veh.id === newVeh.id ? { ...created } : veh));
          this.notify();
        }
      })
      .then(() => this.refreshAfter(['vehicles']))
      .catch((err) => console.error('[CloudStore] addVehicle cloud error:', err));
    return newVeh;
  }

  public updateVehicle(id: string, updates: Partial<Vehicle>): Vehicle | null {
    let updated: Vehicle | null = null;
    this.vehicles = this.vehicles.map((v) => {
      if (v.id === id) {
        updated = { ...v, ...updates };
        return updated;
      }
      return v;
    });
    if (updated) {
      this.notify();
      api.updateVehicle(id, updates).then(() => this.refreshAfter(['vehicles'])).catch((err) => console.error('[CloudStore] updateVehicle cloud error:', err));
    }
    return updated;
  }

  public deleteVehicle(id: string): boolean {
    const exists = this.vehicles.some((v) => v.id === id);
    if (exists) {
      this.vehicles = this.vehicles.filter((v) => v.id !== id);
      this.notify();
      api.deleteVehicle(id).then(() => this.refreshAfter(['vehicles'])).catch((err) => console.error('[CloudStore] deleteVehicle cloud error:', err));
      return true;
    }
    return false;
  }

  public addDriver(d: Partial<Driver>): Driver {
    const newDriver: Driver = {
      id: `dr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: d.name || '',
      licenseNo: d.licenseNo || (d as any).licenseNumber || '',
      phone: d.phone || '',
      status: d.status || 'available',
      createdAt: new Date().toISOString(),
      ...d,
    };
    this.drivers.unshift(newDriver);
    this.notify();
    // Adopt the SERVER-minted driver (authoritative id) — trip slips referencing
    // the driver must never keep the optimistic placeholder id.
    api
      .createDriver(d)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.drivers = this.drivers.map((dr) => (dr.id === newDriver.id ? { ...created } : dr));
          this.notify();
        }
      })
      .then(() => this.refreshAfter(['drivers']))
      .catch((err) => console.error('[CloudStore] addDriver cloud error:', err));
    return newDriver;
  }

  public updateDriver(id: string, updates: Partial<Driver>): Driver | null {
    let updated: Driver | null = null;
    this.drivers = this.drivers.map((d) => {
      if (d.id === id) {
        updated = { ...d, ...updates };
        return updated;
      }
      return d;
    });
    if (updated) {
      this.notify();
      api.updateDriver(id, updates).then(() => this.refreshAfter(['drivers'])).catch((err) => console.error('[CloudStore] updateDriver cloud error:', err));
    }
    return updated;
  }

  public deleteDriver(id: string): boolean {
    const exists = this.drivers.some((d) => d.id === id);
    if (exists) {
      this.drivers = this.drivers.filter((d) => d.id !== id);
      this.notify();
      api.deleteDriver(id).then(() => this.refreshAfter(['drivers'])).catch((err) => console.error('[CloudStore] deleteDriver cloud error:', err));
      return true;
    }
    return false;
  }

  public addTripSlip(s: Partial<TripSlip>): TripSlip {
    const newSlip: TripSlip = {
      id: `ts-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      slipNumber: s.slipNumber || `TS-${Date.now().toString().substr(-6)}`,
      date: s.date || new Date().toISOString().split('T')[0],
      time: s.time || new Date().toLocaleTimeString(),
      vehicleId: s.vehicleId || '',
      vehicleNo: s.vehicleNo || (s as any).vehiclePlate || '',
      driverId: s.driverId || '',
      driverName: s.driverName || '',
      tripType: s.tripType || 'outward',
      materialName: s.materialName || (s as any).materialType || '',
      netWeightTonnes: s.netWeightTonnes || 0,
      destination: s.destination || '',
      status: s.status || 'transit',
      fuelIssuedLiters: s.fuelIssuedLiters || 0,
      cashAdvanceRupees: s.cashAdvanceRupees || 0,
      createdAt: new Date().toISOString(),
      ...s,
    };
    this.tripSlips.unshift(newSlip);
    this.notify();
    // Adopt the SERVER-minted slip (authoritative id) — follow-up edits and
    // vehicle/driver status syncs must never target the placeholder id. The
    // create also flips vehicle/driver status server-side — resync so the
    // fleet lists adopt it.
    api
      .createTripSlip(s)
      .then(async (res) => {
        const created = res?.data;
        if (created?.id) {
          this.tripSlips = this.tripSlips.map((ts) => (ts.id === newSlip.id ? { ...created } : ts));
          this.notify();
        }
        await this.loadCollections(['tripSlips']);
      })
      .catch((err) => console.error('[CloudStore] addTripSlip cloud error:', err));
    return newSlip;
  }

  public updateTripSlip(id: string, updates: Partial<TripSlip>): TripSlip | null {
    let updated: TripSlip | null = null;
    this.tripSlips = this.tripSlips.map((s) => {
      if (s.id === id) {
        updated = { ...s, ...updates };
        return updated;
      }
      return s;
    });
    if (updated) {
      this.notify();
      api.updateTripSlip(id, updates).then(() => this.refreshAfter(['tripSlips'])).catch((err) => console.error('[CloudStore] updateTripSlip cloud error:', err));
    }
    return updated;
  }

  public deleteTripSlip(id: string): boolean {
    const exists = this.tripSlips.some((s) => s.id === id);
    if (exists) {
      this.tripSlips = this.tripSlips.filter((s) => s.id !== id);
      this.notify();
      api.deleteTripSlip(id).then(() => this.refreshAfter(['tripSlips'])).catch((err) => console.error('[CloudStore] deleteTripSlip cloud error:', err));
      return true;
    }
    return false;
  }

  public addTyre(t: Partial<Tyre>): Tyre {
    const newTyre: Tyre = {
      id: `tyre-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNumber: t.serialNumber || '',
      brand: t.brand || 'MRF',
      size: t.size || '295/90 R20',
      type: t.type || 'radial',
      status: t.status || 'available',
      purchaseDate: t.purchaseDate || new Date().toISOString().split('T')[0],
      purchaseCost: t.purchaseCost || 0,
      threadDepthMm: t.threadDepthMm || (t as any).treadDepthMm || 16,
      createdAt: new Date().toISOString(),
      ...t,
    };
    this.tyres.unshift(newTyre);
    this.notify();
    // Adopt the SERVER-minted tyre (authoritative id) — mount/dismount records
    // referencing it must never keep the optimistic placeholder id.
    api
      .createTyre(t)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.tyres = this.tyres.map((ty) => (ty.id === newTyre.id ? { ...created } : ty));
          this.notify();
        }
      })
      .then(() => this.refreshAfter(['tyres']))
      .catch((err) => console.error('[CloudStore] addTyre cloud error:', err));
    return newTyre;
  }

  public updateTyre(id: string, updates: Partial<Tyre>): Tyre | null {
    let updated: Tyre | null = null;
    this.tyres = this.tyres.map((t) => {
      if (t.id === id) {
        updated = { ...t, ...updates };
        return updated;
      }
      return t;
    });
    if (updated) {
      this.notify();
      api.updateTyre(id, updates).then(() => this.refreshAfter(['tyres'])).catch((err) => console.error('[CloudStore] updateTyre cloud error:', err));
    }
    return updated;
  }

  public deleteTyre(id: string): boolean {
    const exists = this.tyres.some((t) => t.id === id);
    if (exists) {
      this.tyres = this.tyres.filter((t) => t.id !== id);
      this.notify();
      api.deleteTyre(id).then(() => this.refreshAfter(['tyres'])).catch((err) => console.error('[CloudStore] deleteTyre cloud error:', err));
      return true;
    }
    return false;
  }

  // Vehicle EMI ledger — auto cron rows appear via refresh; 'manual' rows are
  // recorded (and ANY row edited/removed) by the operator from the EMI tab.
  // Every mutation also refreshes 'accounts' + 'vehicleEmiEntries' so the
  // account balances (server rebalances on the entry itself) and the ledger
  // adopt the server state.
  public addVehicleEmiEntry(entry: Partial<VehicleEmiEntry>): VehicleEmiEntry {
    const newEntry: VehicleEmiEntry = {
      id: `vem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      vehicleId: entry.vehicleId || '',
      accountId: entry.accountId || '',
      date: entry.date || new Date().toISOString().split('T')[0],
      amount: Number(entry.amount) || 0,
      source: entry.source || 'manual',
      notes: entry.notes || undefined,
      createdAt: new Date().toISOString(),
      ...entry,
    } as VehicleEmiEntry;
    const stored = { ...newEntry } as any;
    delete stored.vehicleNo;
    delete stored.accountName;
    this.vehicleEmiEntries.unshift(newEntry);
    this.notify();
    api
      .createVehicleEmiEntry(stored)
      .then(async (res) => {
        if (res?.data?.id) {
          this.vehicleEmiEntries = this.vehicleEmiEntries.map((e) => (e.id === newEntry.id ? res.data : e));
          this.notify();
        }
        await this.refreshAfter(['vehicleEmiEntries', 'accounts']);
      })
      .catch((err) => console.error('[CloudStore] addVehicleEmiEntry cloud error:', err));
    return newEntry;
  }

  public updateVehicleEmiEntry(id: string, updates: Partial<VehicleEmiEntry>): VehicleEmiEntry | null {
    let updated: VehicleEmiEntry | null = null;
    this.vehicleEmiEntries = this.vehicleEmiEntries.map((e) => {
      if (e.id === id) {
        updated = { ...e, ...updates };
        return updated;
      }
      return e;
    });
    if (updated) {
      this.notify();
      api
        .updateVehicleEmiEntry(id, updates)
        .then(async () => {
          await this.refreshAfter(['vehicleEmiEntries', 'accounts']);
        })
        .catch((err) => console.error('[CloudStore] updateVehicleEmiEntry cloud error:', err));
    }
    return updated;
  }

  public deleteVehicleEmiEntry(id: string): boolean {
    const exists = this.vehicleEmiEntries.some((e) => e.id === id);
    if (exists) {
      this.vehicleEmiEntries = this.vehicleEmiEntries.filter((e) => e.id !== id);
      this.notify();
      api
        .deleteVehicleEmiEntry(id)
        .then(async () => {
          await this.refreshAfter(['vehicleEmiEntries', 'accounts']);
        })
        .catch((err) => console.error('[CloudStore] deleteVehicleEmiEntry cloud error:', err));
      return true;
    }
    return false;
  }

  /**
   * Upcoming/overdue vehicle EMI deductions for the header bell + dashboard
   * widget. Alert rule (client directive): raise the alert TWO DAYS before
   * the EMI date — `daysUntil` 0 (today), 1 or 2 — and also flag overdue
   * deductions whose due date has passed with no ledger entry posted yet
   * (tenure not exhausted, loan not closed).
   */
  public getVehicleEmiAlerts(): Array<{
    vehicleId: string;
    vehicleNo: string;
    accountId: string;
    accountName: string;
    amount: number;
    dueDate: string;
    /** negative = overdue by |daysUntil| days */
    daysUntil: number;
    /** RED alert: the linked account's balance is lower than the EMI amount */
    shortOfFunds: boolean;
    accountBalance: number;
  }> {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const alerts: Array<{
      vehicleId: string;
      vehicleNo: string;
      accountId: string;
      accountName: string;
      amount: number;
      dueDate: string;
      daysUntil: number;
      shortOfFunds: boolean;
      accountBalance: number;
    }> = [];

    for (const v of this.vehicles) {
      const emi = (v as any).emiDetails;
      if (!emi || !emi.hasEmi || !emi.emiAccountId || !(Number(emi.monthlyEmiAmount) > 0) || emi.status === 'closed') continue;
      const dueDay = Math.min(31, Math.max(1, Number(emi.emiDueDay) || 10));
      const account = this.accounts.find((a) => a.id === emi.emiAccountId);
      // Scan this month and next 2: the first due date on/after today that
      // either has no posted entry for that month yet (upcoming/overdue) or
      // that the entry stream hasn't reached — plus any overdue month this
      // window whose deduction never landed.
      const candidates: string[] = [];
      const now = new Date(`${today}T00:00:00Z`);
      for (let addM = 0; addM <= 2; addM++) {
        const m0 = now.getUTCMonth() + addM;
        const y = now.getUTCFullYear() + Math.floor(m0 / 12);
        const m = m0 % 12;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const day = Math.min(dueDay, lastDay);
        candidates.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
      const entriesForVehicle = this.vehicleEmiEntries.filter((e) => e.vehicleId === v.id);
      const postedMonths = new Set(entriesForVehicle.map((e) => String(e.date).slice(0, 7)));

      for (const dueDate of candidates) {
        const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
        const daysUntil = Math.round((dueMs - todayMs) / 86_400_000);
        const monthKey = dueDate.slice(0, 7);
        if (postedMonths.has(monthKey)) continue;
        // Only surface within/around the alert window or overdue months
        if (daysUntil > 2) continue;
        if (daysUntil < 0 && !account) continue;
        const accountBalance = Number(account?.currentBalance) || 0;
        alerts.push({
          vehicleId: v.id,
          vehicleNo: v.vehicleNo,
          accountId: emi.emiAccountId,
          accountName: account?.name || 'Linked account',
          amount: Number(emi.monthlyEmiAmount) || 0,
          dueDate,
          daysUntil,
          shortOfFunds: accountBalance < (Number(emi.monthlyEmiAmount) || 0),
          accountBalance,
        });
      }
    }
    return alerts.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  // Employees & HR
  public addEmployee(emp: Partial<Employee>): Employee {
    const newEmp: Employee = {
      id: `emp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: emp.name || '',
      role: emp.role || 'driver',
      phone: emp.phone || '',
      salaryBase: emp.salaryBase || (emp as any).salary || 0,
      salaryType: emp.salaryType || 'monthly',
      status: emp.status || 'active',
      joiningDate: emp.joiningDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      ...emp,
    };
    // documentIds (staged Aadhaar/PAN uploads) ride the CREATE payload so the
    // server links them once the authoritative id is minted — they must never
    // persist on the client row itself (same contract as createParty).
    delete (newEmp as any).documentIds;
    this.employees.unshift(newEmp);
    this.notify();
    // Adopt the SERVER-minted employee (authoritative id) — attendance,
    // leave and payroll records must never target the placeholder id.
    api
      .createEmployee(emp)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.employees = this.employees.map((e) => (e.id === newEmp.id ? { ...created } : e));
          this.notify();
        }
      })
      .then(() => this.refreshAfter(['employees']))
      .catch((err) => console.error('[CloudStore] addEmployee cloud error:', err));
    return newEmp;
  }

  public updateEmployee(id: string, updates: Partial<Employee>): Employee | null {
    // Edit-mode uploads link immediately via the documents endpoint, so
    // documentIds should never ride an update payload.
    delete (updates as any).documentIds;
    let updated: Employee | null = null;
    this.employees = this.employees.map((e) => {
      if (e.id === id) {
        updated = { ...e, ...updates };
        return updated;
      }
      return e;
    });
    if (updated) {
      this.notify();
      api.updateEmployee(id, updates).then(() => this.refreshAfter(['employees'])).catch((err) => console.error('[CloudStore] updateEmployee cloud error:', err));
    }
    return updated;
  }

  public deleteEmployee(id: string): boolean {
    const exists = this.employees.some((e) => e.id === id);
    if (exists) {
      this.employees = this.employees.filter((e) => e.id !== id);
      this.notify();
      api.deleteEmployee(id).then(() => this.refreshAfter(['employees'], true)).catch((err) => console.error('[CloudStore] deleteEmployee cloud error:', err));
      return true;
    }
    return false;
  }

  /**
   * Driver → vehicle assignment from the employee's profile. Optimistically
   * mirrors the server's rule in the vehicle cache (claim the chosen vehicle
   * / release the freed one — the FK lives on the vehicle row), then the
   * server call re-fetches the authoritative vehicle set.
   */
  public assignEmployeeVehicle(
    empId: string,
    opts: { vehicleId?: string; releaseVehicleId?: string }
  ): void {
    let next = this.vehicles.map((v) => {
      if (opts.vehicleId && v.id === opts.vehicleId && v.currentDriverId !== empId) {
        return { ...v, currentDriverId: empId };
      }
      // Release: the freed vehicle only leaves the driver's list server-side
      // (claim releases the driver's OTHER vehicles implicitly)
      if (!opts.vehicleId && opts.releaseVehicleId && v.id === opts.releaseVehicleId && v.currentDriverId === empId) {
        return { ...v, currentDriverId: undefined };
      }
      return v;
    });
    if (opts.vehicleId) {
      // Claiming releases the driver's other vehicles too
      next = next.map((v) =>
        v.currentDriverId === empId && v.id !== opts.vehicleId ? { ...v, currentDriverId: undefined } : v
      );
    }
    this.vehicles = next;
    this.notify();
    api
      .assignEmployeeVehicle(empId, opts)
      .then(() => this.refreshAfter(['vehicles']))
      .catch((err) => console.error('[CloudStore] assignEmployeeVehicle cloud error:', err));
  }

  public async bulkAddAttendance(records: any[]): Promise<void> {
    const recs: EmployeeAttendance[] = records.map((r, idx) => ({
      id: r.id || `att-${Date.now()}-${idx}`,
      employeeId: r.employeeId || '',
      employeeName: r.employeeName || '',
      date: r.date || new Date().toISOString().split('T')[0],
      status: r.status || 'present',
      ...r,
    }));
    recs.forEach((rec) => {
      const existingIdx = this.attendance.findIndex((a) => a.employeeId === rec.employeeId && a.date === rec.date);
      if (existingIdx >= 0) {
        this.attendance[existingIdx] = { ...this.attendance[existingIdx], ...rec };
      } else {
        this.attendance.push(rec);
      }
    });
    this.notify();
    // One post per record; the merged local rows are what the open sheet
    // renders — the sheet re-fetches its own date only AFTER these settle
    // (no whole-table reload: reads are date-scoped).
    const results = await Promise.allSettled(
      recs.map((rec) => api.recordAttendance(rec))
    );
    // Adopt the SERVER's rows (authoritative id/content) wherever a post
    // succeeded — surface any FAILED post loudly (a failing save must never
    // disappear into the sheet's next fetch)
    results.forEach((r) => {
      if (r.status === 'rejected') {
        console.error('[CloudStore] recordAttendance FAILED:', (r as PromiseRejectedResult).reason?.message || r.reason);
      }
      const created = r.status === 'fulfilled' ? r.value?.data : undefined;
      if (created?.id && created.employeeId && created.date) {
        const idx = this.attendance.findIndex(
          (a) => a.employeeId === created.employeeId && a.date === created.date
        );
        if (idx >= 0) {
          this.attendance[idx] = created;
        }
      }
    });
    if (recs.length > 0) {
      this.notify();
    }
  }

  public updateAttendance(id: string, updates: Partial<EmployeeAttendance>): void {
    this.attendance = this.attendance.map((a) => (a.id === id ? { ...a, ...updates } : a));
    this.notify();
  }

  public recordPunch(...args: any[]): void {
    const employeeId = args[0];
    const punch = typeof args[1] === 'object' ? args[1] : { type: args[1], time: args[2] || new Date().toLocaleTimeString() };
    const today = new Date().toISOString().split('T')[0];
    const existing = this.attendance.find((a) => a.employeeId === employeeId && a.date === today);
    if (existing) {
      existing.punchLogs = [...(existing.punchLogs || []), punch];
      this.notify();
    }
  }

  public addLeave(leave: Partial<EmployeeLeave>): EmployeeLeave {
    const newLeave: EmployeeLeave = {
      id: `lv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      employeeId: leave.employeeId || '',
      employeeName: leave.employeeName || '',
      leaveType: leave.leaveType || 'casual',
      startDate: leave.startDate || '',
      endDate: leave.endDate || '',
      totalDays: leave.totalDays || 1,
      reason: leave.reason || '',
      status: leave.status || 'pending',
      createdAt: new Date().toISOString(),
      ...leave,
    };
    this.leaves.unshift(newLeave);
    this.notify();
    // Adopt the SERVER-minted leave (authoritative id) — approval edits made
    // before any refresh must never target the optimistic placeholder id.
    api
      .applyLeave(leave)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.leaves = this.leaves.map((l) => (l.id === newLeave.id ? { ...created } : l));
          this.notify();
        }
      })
      .catch((err) => console.error('[CloudStore] addLeave cloud error:', err));
    return newLeave;
  }

  public updateLeave(id: string, updates: Partial<EmployeeLeave>): EmployeeLeave | null {
    let updated: EmployeeLeave | null = null;
    this.leaves = this.leaves.map((l) => {
      if (l.id === id) {
        updated = { ...l, ...updates };
        return updated;
      }
      return l;
    });
    if (updated) {
      this.notify();
    }
    return updated;
  }

  public deleteLeave(id: string): boolean {
    const exists = this.leaves.some((l) => l.id === id);
    if (exists) {
      this.leaves = this.leaves.filter((l) => l.id !== id);
      this.notify();
      return true;
    }
    return false;
  }

  public addEmployeePayment(pay: Partial<EmployeePayment>): EmployeePayment {
    const newPay = this.hydrateEmployeePaymentNames({
      id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      employeeId: pay.employeeId || '',
      date: pay.date || new Date().toISOString().split('T')[0],
      type: pay.type || 'salary',
      amount: pay.amount || 0,
      paymentMode: pay.paymentMode || 'cash',
      createdAt: new Date().toISOString(),
      ...pay,
    } as EmployeePayment);
    this.employeePayments.unshift(newPay);
    this.notify();
    // Adopt the SERVER-minted payment (authoritative id) — voucher detail
    // edits must never target the optimistic placeholder id.
    api
      .addEmployeePayment(pay)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.employeePayments = this.employeePayments.map((p) => (p.id === newPay.id ? { ...created } : p));
          this.notify();
        }
      })
      .then(() => this.refreshAfter(['employeePayments', 'accounts']))
      .catch((err) => console.error('[CloudStore] addEmployeePayment cloud error:', err));
    return newPay;
  }

  /** Deletes a payroll payment; the server reverses it out of the account ledger. */
  public deleteEmployeePayment(id: string): boolean {
    const exists = this.employeePayments.some((p) => p.id === id);
    if (exists) {
      this.employeePayments = this.employeePayments.filter((p) => p.id !== id);
      this.notify();
      api.deleteEmployeePayment(id).then(() => this.refreshAfter(['employeePayments', 'accounts'])).catch((err) => console.error('[CloudStore] deleteEmployeePayment cloud error:', err));
      return true;
    }
    return false;
  }

  /** Resolves the display names for a payroll row from the client-side masters */
  private hydrateEmployeePaymentNames(pay: EmployeePayment): EmployeePayment {
    return {
      ...pay,
      employeeName: this.employees.find((e) => e.id === pay.employeeId)?.name || pay.employeeName,
      accountName: pay.accountId ? this.accounts.find((a) => a.id === pay.accountId)?.name : undefined,
    };
  }

  /**
   * Edits a recorded payroll payment (amount/date/type/mode/account/refs).
   * employeeName/accountName are display-only (JOIN/read-time hydrated) and
   * never ride the PUT; both ledgers reconcile server-side when the account
   * or amount moves.
   */
  public updateEmployeePayment(id: string, updates: Partial<EmployeePayment>): EmployeePayment | null {
    delete (updates as any).employeeName;
    delete (updates as any).accountName;
    let updated: EmployeePayment | null = null;
    this.employeePayments = this.employeePayments.map((p) => {
      if (p.id === id) {
        updated = this.hydrateEmployeePaymentNames({ ...p, ...updates });
        return updated;
      }
      return p;
    });
    if (updated) {
      this.notify();
      api.updateEmployeePayment(id, updates).then(() => this.refreshAfter(['employeePayments', 'accounts'])).catch((err) => console.error('[CloudStore] updateEmployeePayment cloud error:', err));
    }
    return updated;
  }

  // --- EMPLOYEE LEDGER (virtual accounts) ---

  /** Resolves display names on an optimistic ledger row from the client masters */
  private hydrateEmployeeLedgerNames(t: EmployeeLedgerTransaction): EmployeeLedgerTransaction {
    return {
      ...t,
      employeeName: this.employees.find((e) => e.id === t.employeeId)?.name || t.employeeName,
      accountName: t.accountId ? this.accounts.find((a) => a.id === t.accountId)?.name : undefined,
    };
  }

  public addEmployeeLedgerTransaction(txn: Partial<EmployeeLedgerTransaction>): EmployeeLedgerTransaction {
    const newTxn = this.hydrateEmployeeLedgerNames({
      id: `elt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      employeeId: txn.employeeId || '',
      date: txn.date || new Date().toISOString().split('T')[0],
      type: txn.type as EmployeeLedgerTransaction['type'],
      amount: Number(txn.amount) || 0,
      reason: txn.reason || '',
      createdAt: new Date().toISOString(),
      source: 'manual',
      ...txn,
    } as EmployeeLedgerTransaction);
    this.employeeLedgerTransactions.unshift(newTxn);
    this.notify();
    // Adopt the SERVER-minted row (authoritative id) and refresh the accounts:
    // a bank-linked row moves real money on the Cash/Bank side.
    api
      .addEmployeeLedgerTransaction(txn)
      .then((res) => {
        const created = res?.data;
        if (created?.id) {
          this.employeeLedgerTransactions = this.employeeLedgerTransactions.map((t) =>
            t.id === newTxn.id ? { ...created } : t
          );
          this.notify();
        }
      })
      .then(() => this.refreshAfter(['employeeLedgerTransactions', 'accounts']))
      .catch((err) => console.error('[CloudStore] addEmployeeLedgerTransaction cloud error:', err));
    return newTxn;
  }

  /** Locked auto rows (wage accruals) are rejected with a thrown error server-side. */
  public updateEmployeeLedgerTransaction(id: string, updates: Partial<EmployeeLedgerTransaction>): EmployeeLedgerTransaction | null {
    let updated: EmployeeLedgerTransaction | null = null;
    this.employeeLedgerTransactions = this.employeeLedgerTransactions.map((t) => {
      if (t.id === id) {
        if (t.source === 'accrual_engine') return t;
        updated = this.hydrateEmployeeLedgerNames({ ...t, ...updates, id: t.id, createdAt: t.createdAt });
        return updated;
      }
      return t;
    });
    if (updated) {
      this.notify();
      api.updateEmployeeLedgerTransaction(id, updates).then(() => this.refreshAfter(['employeeLedgerTransactions', 'accounts'])).catch((err) => console.error('[CloudStore] updateEmployeeLedgerTransaction cloud error:', err));
    }
    return updated;
  }

  public deleteEmployeeLedgerTransaction(id: string): boolean {
    const row = this.employeeLedgerTransactions.find((t) => t.id === id);
    if (!row || row.source === 'accrual_engine') return false;
    this.employeeLedgerTransactions = this.employeeLedgerTransactions.filter((t) => t.id !== id);
    this.notify();
    api.deleteEmployeeLedgerTransaction(id).then(() => this.refreshAfter(['employeeLedgerTransactions', 'accounts'])).catch((err) => console.error('[CloudStore] deleteEmployeeLedgerTransaction cloud error:', err));
    return true;
  }

  // Evidence Files & Folders
  public addFolder(folderData: Partial<EvidenceFolder>): EvidenceFolder {
    const newFolder: EvidenceFolder = {
      id: `fld-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: folderData.name || 'New Folder',
      entityType: folderData.entityType || 'general',
      parentId: folderData.parentId ?? null,
      isSystemGenerated: folderData.isSystemGenerated ?? false,
      color: folderData.color || '#0284c7',
      description: folderData.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...folderData,
    };
    this.evidenceFolders.unshift(newFolder);
    this.notify();
    return newFolder;
  }

  public updateFolder(id: string, updates: Partial<EvidenceFolder>): EvidenceFolder | null {
    let updated: EvidenceFolder | null = null;
    this.evidenceFolders = this.evidenceFolders.map((f) => {
      if (f.id === id) {
        updated = { ...f, ...updates, updatedAt: new Date().toISOString() };
        return updated;
      }
      return f;
    });
    if (updated) {
      this.notify();
    }
    return updated;
  }

  public deleteFolder(id: string): boolean {
    const exists = this.evidenceFolders.some((f) => f.id === id);
    if (exists) {
      this.evidenceFolders = this.evidenceFolders.filter((f) => f.id !== id);
      this.evidenceFiles = this.evidenceFiles.filter((f) => f.folderId !== id);
      this.notify();
      return true;
    }
    return false;
  }

  public addFile(fileData: Partial<EvidenceFile>): EvidenceFile {
    const newFile: EvidenceFile = {
      id: `ef-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      folderId: fileData.folderId || 'fld-gen-1',
      name: fileData.name || 'Untitled File',
      size: fileData.size || 0,
      type: fileData.type || 'application/octet-stream',
      entityType: fileData.entityType || 'general',
      createdAt: new Date().toISOString(),
      ...fileData,
    };
    this.evidenceFiles.unshift(newFile);
    this.notify();
    return newFile;
  }

  public deleteFile(id: string): boolean {
    const exists = this.evidenceFiles.some((f) => f.id === id);
    if (exists) {
      this.evidenceFiles = this.evidenceFiles.filter((f) => f.id !== id);
      this.notify();
      return true;
    }
    return false;
  }

  // Backup & Restore
  public getFullSnapshot(): any {
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      settings: this.settings,
      parties: this.parties,
      transactions: this.transactions,
      items: this.items,
      categories: this.categories,
      units: this.units,
      locations: this.locations,
      productionBatches: this.productionBatches,
      orders: this.orders,
      sales: this.sales,
      purchases: this.purchases,
      vehicles: this.vehicles,
      drivers: this.drivers,
      tripSlips: this.tripSlips,
      tyres: this.tyres,
      employees: this.employees,
      attendance: this.attendance,
      leaves: this.leaves,
      employeePayments: this.employeePayments,
      employeeLedgerTransactions: this.employeeLedgerTransactions,
      accounts: this.accounts,
      transfers: this.transfers,
      adjustments: this.adjustments,
      stockAdjustments: this.stockAdjustments,
      evidenceFolders: this.evidenceFolders,
      evidenceFiles: this.evidenceFiles,
    };
  }

  public exportBackup(): string {
    return JSON.stringify(this.getFullSnapshot(), null, 2);
  }

  public importBackup(content: string): { success: boolean; message: string } {
    try {
      const parsed = JSON.parse(content);
      api.restoreBackup(parsed).then(() => this.syncWithServer(true)).catch((err) => console.error('[CloudStore] restoreBackup cloud error:', err));
      return { success: true, message: 'Cloud database snapshot uploaded and queued for hydration.' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to parse JSON backup.' };
    }
  }

  public async purgeDemoData(): Promise<{ success: boolean; message: string }> {
    const res = await api.purgeDemoData();
    await this.syncWithServer(true);
    return res;
  }
}

export const cloudStore = new CloudStore();
export { cloudStore as localDb };
