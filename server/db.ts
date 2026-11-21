import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { moveS3Object, orderDocumentRoot } from './services/documentFiles';
import {
  Party,
  Transaction,
  CompanySettings,
  Item,
  ItemAttributeKey,
  ItemCategory,
  ItemUnit,
  ItemLocation,
  ItemLocationStock,
  ProductionBatchRun,
  BatchMix,
  BatchMixIngredient,
  Order,
  Vehicle,
  Driver,
  TripSlip,
  TYRE_POSITIONS,
  isTyreItemName,
  isDieselItemName,
  InventoryUnit,
  InventoryUnitEvent,
  InventoryUnitStatus,
  InventoryUnitEventType,
  Employee,
  EmployeeAttendance,
  EmployeeLeave,
  EmployeePayment,
  EmployeeLedgerTransaction,
  ItemStockAdjustment,
  StockMovementLog,
  OrderStatus,
  PaymentMode,
  PurchaseStage,
  Sale,
  Purchase,
  SalesOrderItem,
  SalesOrderStage,
  SalesStage,
  PurchaseOrderItem,
  PurchaseOrderStage,
  SalesOrderItemInput,
  PurchaseOrderItemInput,
  SalesOrderStageInput,
  PurchaseOrderStageInput,
  SaleInvoice,
  SaleInvoiceItem,
  SaleInvoiceOrderLink,
  AppUser,
  AppDocument,
  AppDefault,
  SaleOrderDocumentLink,
  PurchaseOrderDocumentLink,
  PartyDocumentLink,
  ItemDocumentLink,
  EmployeeDocumentLink,
  VehicleDocumentLink,
  VehicleEmiEntry,
  VehicleExpenseEntry,
  ExpenseDocumentLink,
  UserPermissions,
  UserRole,
  UserStatus,
  CashBankAccount,
  InternalTransfer,
  AccountAdjustment,
} from '../src/types';
import {
  loadAllFromMysql,
  liveSyncParty,
  liveSyncItem,
  liveSyncTransaction,
  liveSyncSale,
  liveSyncSaleItems,
  liveSyncSaleStages,
  liveSyncSaleInvoice,
  liveSyncSaleInvoiceItems,
  liveSyncSaleInvoiceOrders,
  liveSyncPurchase,
  liveSyncPurchaseItems,
  liveSyncPurchaseStages,
  liveSyncBatch,
  liveSyncBatchMix,
  liveSyncInventoryUnit,
  liveSyncInventoryUnitEvent,
  liveSyncInventoryUnitEventsBulk,
  liveSyncAuditLog,
  liveSyncDocument,
  liveSyncSaleOrderDocLink,
  liveSyncPurchaseOrderDocLink,
  liveSyncPartyDocLink,
  liveSyncItemDocLink,
  liveSyncEmployeeDocLink,
  liveSyncVehicleDocLink,
  liveSyncVehicle,
  liveSyncVehicleEmiEntry,
  liveSyncVehicleExpenseEntry,
  liveSyncExpenseDocLink,
  liveSyncAppDefault,
  liveSyncDriver,
  liveSyncTripSlip,
  liveSyncEmployee,
  liveSyncAttendance,
  liveSyncLeave,
  liveSyncEmployeePayment,
  liveSyncEmployeeLedgerTransaction,
  liveSyncSettings,
  liveSyncUser,
  liveSyncCategory,
  liveSyncUnit,
  liveSyncLocation,
  liveSyncAccount,
  liveSyncTransfer,
  liveSyncAdjustment,
  liveSyncStockAdjustment,
  liveSyncStockMovement,
} from './mysql/azureSync';
import { isMysqlConfigured } from './mysql/connection';

/** Document-mapping feature kinds (one join table per kind). */
type DocLinkKind = 'sale' | 'purchase' | 'party' | 'item' | 'employee' | 'vehicle' | 'expense';
import {
  computeItemValuation,
  computeOutwardConsumptionRate,
} from './inventoryValuation';
import {
  SEED_SETTINGS,
  SEED_PARTIES,
  SEED_CATEGORIES,
  SEED_UNITS,
  SEED_LOCATIONS,
  SEED_ITEMS,
  SEED_TRANSACTIONS,
  SEED_BATCHES,
  SEED_ORDERS,
  SEED_VEHICLES,
  SEED_DRIVERS,
  SEED_TRIP_SLIPS,
  SEED_EMPLOYEES,
  SEED_ATTENDANCE,
  SEED_LEAVES,
  SEED_PAYMENTS,
  SEED_USERS,
  SEED_ACCOUNTS,
  SEED_TRANSFERS,
  SEED_ADJUSTMENTS,
  FULL_ADMIN_PERMISSIONS,
} from './seedData';

export interface AuditLog {
  id: string;
  timestamp: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'DISPATCH' | 'RESTORE' | 'RESET';
  entity: string;
  entityId?: string;
  details: string;
  userId?: string;
  userName?: string;
}

export interface DatabaseSchema {
  version: string;
  lastUpdated: string;
  settings: CompanySettings;
  parties: Party[];
  transactions: Transaction[];
  items: Item[];
  categories: ItemCategory[];
  units: ItemUnit[];
  locations: ItemLocation[];
  stockAdjustments: ItemStockAdjustment[];
  productionBatches: ProductionBatchRun[];
  /** Batch mixes (recipes) — production feature (2026-11-12) */
  batchMixes: BatchMix[];
  /** @deprecated legacy `orders` rows (retired by the relational sale/purchase split) */
  orders: Order[];
  sales: Sale[];
  /** Consolidated sales invoices (one invoice = N sales orders) */
  salesInvoices: SaleInvoice[];
  purchases: Purchase[];
  vehicles: Vehicle[];
  drivers: Driver[];
  tripSlips: TripSlip[];
  employees: Employee[];
  attendance: EmployeeAttendance[];
  leaves: EmployeeLeave[];
  employeePayments: EmployeePayment[];
  /** employee ledger rows (virtual accounts with a running balance) */
  employeeLedgerTransactions: EmployeeLedgerTransaction[];
  accounts: CashBankAccount[];
  transfers: InternalTransfer[];
  adjustments: AccountAdjustment[];
  stockMovements: StockMovementRecord[];
  users: AppUser[];
  auditLogs: AuditLog[];
  documents: AppDocument[];
  saleOrderDocuments: SaleOrderDocumentLink[];
  purchaseOrderDocuments: PurchaseOrderDocumentLink[];
  /** party ↔ document mapping rows (table parties_documents) */
  partyDocuments: PartyDocumentLink[];
  /** item ↔ document mapping rows (table inventory_documents) */
  itemDocuments: ItemDocumentLink[];
  /** employee ↔ document mapping rows (table employee_documents) */
  employeeDocuments: EmployeeDocumentLink[];
  /** vehicle ↔ document mapping rows (table vehicle_documents) */
  vehicleDocuments: VehicleDocumentLink[];
  /** vehicle EMI ledger rows (table vehicle_emi_entries) — balance stream */
  vehicleEmiEntries: VehicleEmiEntry[];
  /** vehicle expense log rows (table vehicle_expense_entries) — balance stream */
  vehicleExpenseEntries: VehicleExpenseEntry[];
  /** expense_documents mapping rows (table vehicle_expense_documents) */
  expenseDocuments: ExpenseDocumentLink[];
  /** APP DEFAULTS — the generic key/value default store (table app_defaults;
   *  key IS the primary key). First member: diesel_rate = '99.8' (₹/litre). */
  appDefaults: AppDefault[];
  /** TRACKABLE INVENTORY — asset-type items are catalog headers; each physical
   *  unit is one register row + its append-only lifecycle log. */
  inventoryUnits: InventoryUnit[];
  inventoryUnitEvents: InventoryUnitEvent[];
}

/**
 * Internal ledger record shape for the in-memory sandbox (dev without MySQL).
 * Mirrors the Azure MySQL `stock_movements` table: append-only, references by
 * primary keys only (item_id, location_id, party_id) — names are joined at read time.
 */
export interface StockMovementRecord extends StockMovementLog {
  itemId: string;
  locationId?: string;
  partyId?: string;
  referenceType?: string;
  referenceId?: string; // FK to the source sale/purchase master (reversal key)
  // Display names resolved via JOIN at read time (never persisted by name in MySQL)
  locationName?: string;
  partyName?: string;
}

class ServerLocalDatabase {
  private data: DatabaseSchema;
  private isLoaded = false;
  private saveTimeout: NodeJS.Timeout | null = null;
  // Monotonic ledger clock: two movements within the same millisecond (bulk
  // entry, tests, back-to-back vouchers) must still sort chronologically —
  // the valuation replay orders strictly by movement date.
  private lastLedgerMs = 0;

  constructor() {
    this.data = this.getDefaultSchema();
    this.init();
  }

  private getDefaultSchema(): DatabaseSchema {
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      settings: JSON.parse(JSON.stringify(SEED_SETTINGS)),
      parties: JSON.parse(JSON.stringify(SEED_PARTIES)),
      transactions: [],
      items: JSON.parse(JSON.stringify(SEED_ITEMS)),
      categories: JSON.parse(JSON.stringify(SEED_CATEGORIES)),
      units: JSON.parse(JSON.stringify(SEED_UNITS)),
      locations: JSON.parse(JSON.stringify(SEED_LOCATIONS)),
      stockAdjustments: [],
      stockMovements: [],
      productionBatches: JSON.parse(JSON.stringify(SEED_BATCHES)),
      batchMixes: [],
      inventoryUnits: [],
      inventoryUnitEvents: [],
      orders: [],
      sales: [],
      salesInvoices: [],
      purchases: [],
      vehicles: JSON.parse(JSON.stringify(SEED_VEHICLES)),
      drivers: JSON.parse(JSON.stringify(SEED_DRIVERS)),
      tripSlips: JSON.parse(JSON.stringify(SEED_TRIP_SLIPS)),
      employees: JSON.parse(JSON.stringify(SEED_EMPLOYEES)),
      attendance: JSON.parse(JSON.stringify(SEED_ATTENDANCE)),
      leaves: JSON.parse(JSON.stringify(SEED_LEAVES)),
      employeePayments: JSON.parse(JSON.stringify(SEED_PAYMENTS)),
      employeeLedgerTransactions: [],
      accounts: JSON.parse(JSON.stringify(SEED_ACCOUNTS)),
      transfers: JSON.parse(JSON.stringify(SEED_TRANSFERS)),
      adjustments: JSON.parse(JSON.stringify(SEED_ADJUSTMENTS)),
      users: JSON.parse(JSON.stringify(SEED_USERS)),
      documents: [],
      saleOrderDocuments: [],
      purchaseOrderDocuments: [],
      partyDocuments: [],
      itemDocuments: [],
      employeeDocuments: [],
      vehicleDocuments: [],
      vehicleEmiEntries: [],
      vehicleExpenseEntries: [],
      expenseDocuments: [],
      // First default (user directive): diesel cost fixed at ₹99.8/litre —
      // editable from Settings; the bulk diesel rows prefill it
      appDefaults: [
        { key: 'diesel_rate', value: '99.8', updatedAt: new Date().toISOString() },
      ],
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          timestamp: new Date().toISOString(),
          action: 'RESET',
          entity: 'SYSTEM',
          details: 'Local file-based database engine initialized with production seed data.',
        },
      ],
    };
  }

  private init() {
    try {
      this.data = this.getDefaultSchema();
      this.ensureDefaultUsersAndHashes();
      this.ensureOrphanedTransactionsCleaned();
      this.isLoaded = true;
      console.log('[DB] Cloud-authoritative database engine initialized. Local JSON file writing decommissioned.');
    } catch (err) {
      console.error('[DB] Failed to initialize database schema:', err);
      this.data = this.getDefaultSchema();
      this.ensureDefaultUsersAndHashes();
      this.ensureOrphanedTransactionsCleaned();
      this.isLoaded = true;
    }
  }

  private ensureOrphanedTransactionsCleaned() {
    const validPartyIds = new Set((this.data.parties || []).map((p) => p.id));
    this.data.transactions = (this.data.transactions || []).filter((t) => validPartyIds.has(t.partyId));
  }

  private ensureDefaultUsersAndHashes() {
    let changed = false;
    if (!this.data.users) {
      this.data.users = JSON.parse(JSON.stringify(SEED_USERS));
      changed = true;
    }

    // Default password hash for 'Admin@123'
    const defaultPasswordHash = bcrypt.hashSync('Admin@123', 10);

    // Ensure super_admin exists
    let superAdmin = this.data.users.find(
      (u) => u.role === 'super_admin' || u.username.toLowerCase() === 'admin'
    );

    if (!superAdmin) {
      const defaultSuperAdmin = SEED_USERS.find((u) => u.id === 'usr-superadmin') || SEED_USERS[0];
      superAdmin = JSON.parse(JSON.stringify(defaultSuperAdmin));
      superAdmin.passwordHash = defaultPasswordHash;
      superAdmin.status = 'active';
      this.data.users.unshift(superAdmin);
      changed = true;
      console.log('[DB] Re-seeded missing Super Administrator account.');
    } else {
      // Ensure super_admin has active status, all permissions, and a valid passwordHash
      if (superAdmin.status !== 'active') {
        superAdmin.status = 'active';
        changed = true;
      }
      if (!superAdmin.passwordHash) {
        superAdmin.passwordHash = defaultPasswordHash;
        changed = true;
        console.log('[DB] Restored Super Administrator password hash.');
      }
      if (superAdmin.role !== 'super_admin') {
        superAdmin.role = 'super_admin';
        changed = true;
      }
      if (!superAdmin.permissions || !superAdmin.permissions.manage_users || !superAdmin.permissions.manage_settings) {
        superAdmin.permissions = { ...FULL_ADMIN_PERMISSIONS };
        changed = true;
      }
    }

    // Ensure active users have valid passwordHash
    for (const u of this.data.users) {
      if (u.status === 'active' && !u.passwordHash) {
        u.passwordHash = defaultPasswordHash;
        changed = true;
      }
    }

    if (changed) {
      this.persistSync();
      console.log('[DB] Successfully verified user accounts.');
    }
  }

  private persistSync() {
    this.data.lastUpdated = new Date().toISOString();
  }

  public save() {
    this.persistSync();
  }

  public logAudit(action: AuditLog['action'], entity: string, entityId?: string, details: string = '') {
    const log: AuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action,
      entity,
      entityId,
      details,
    };
    this.data.auditLogs = [log, ...(this.data.auditLogs || []).slice(0, 499)];
    liveSyncAuditLog(log);
  }

  private lastMysqlHydrationTime = 0;
  private initPromise: Promise<boolean> | null = null;

  public async initFromMysql(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && now - this.lastMysqlHydrationTime < 1500) {
      return true;
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = (async () => {
      try {
        const mysqlData = await loadAllFromMysql();
        if (mysqlData) {
          const validPartyIds = new Set((mysqlData.parties || []).map((p) => p.id));
          mysqlData.transactions = (mysqlData.transactions || []).filter((t) => validPartyIds.has(t.partyId));
          this.data = mysqlData;
          this.lastMysqlHydrationTime = Date.now();
          this.persistSync();
          // Balance-stream sweep: accounts touched by vehicle expense entries
          // recompute their balance straight from the entry lists (opening +
          // streams) — covers expenses recorded before this stream joined
          // recalculateAccountBalance, and keeps every hydration idempotent.
          const touchedExpenseAccounts = new Set((mysqlData.vehicleExpenseEntries || []).map((e) => e.accountId));
          touchedExpenseAccounts.forEach((aid) => { try { this.recalculateAccountBalance(aid); } catch (e: any) { console.warn('[DB] Expense-stream balance sweep failed for account:', aid, e.message); } });
          console.log('[DB] Live database hydrated directly from Azure Database for MySQL Flexible Server');
          return true;
        }
      } catch (err: any) {
        console.error('[DB] Failed to initialize from Azure MySQL:', err.message);
      } finally {
        this.initPromise = null;
      }
      return false;
    })();
    return this.initPromise;
  }

  public getFullSnapshot(): DatabaseSchema {
    this.ensureOrphanedTransactionsCleaned();
    // Item reads are views: movements are hydrated from the stock movement
    // ledger on every snapshot, whichever sync mode the client uses.
    const snapshot = {
      ...this.data,
      items: this.data.items.map((i) => this.hydrateItemWithMovements(i)),
      // Sale/purchase display fields are live views: party/unit/location names
      // are re-resolved from the masters on every snapshot (Golden Rule §2).
      sales: (this.data.sales || []).filter((s) => this.isVisibleSale(s)).map((s) => this.hydrateSale(s)),
      salesInvoices: (this.data.salesInvoices || []).map((si) => this.hydrateSaleInvoice(si)),
      tripSlips: this.visibleTripSlips(),
      purchases: (this.data.purchases || []).map((p) => this.hydratePurchase(p)),
      // Transfer/adjustment display names are live views from the account master
      transfers: (this.data.transfers || []).map((t) => this.hydrateTransfer(t)),
      adjustments: (this.data.adjustments || []).map((a) => this.hydrateAdjustment(a)),
      // Employee ledger names are live views from the employees master
      employeeLedgerTransactions: (this.data.employeeLedgerTransactions || []).map((t) => this.hydrateEmployeeLedgerTransaction(t)),
      transactions: (this.data.transactions || []).map((t) => this.hydrateTransactionParty(t)),
    };
    return snapshot;
  }

  public getStats() {
    return {
      dbFilePath: 'decommissioned (cloud-authoritative)',
      fileSizeKb: 0,
      storageModel: 'Azure Database for MySQL Flexible Server',
      localJsonStatus: 'decommissioned',
      lastUpdated: this.data.lastUpdated,
      counts: {
        parties: this.data.parties.length,
        transactions: this.data.transactions.length,
        items: this.data.items.length,
        categories: this.data.categories.length,
        units: this.data.units.length,
        locations: this.data.locations.length,
        productionBatches: this.data.productionBatches.length,
        orders: this.data.orders.length,
        sales: (this.data.sales || []).length,
        purchases: (this.data.purchases || []).length,
        vehicles: this.data.vehicles.length,
        drivers: this.data.drivers.length,
        tripSlips: this.data.tripSlips.length,
        employees: this.data.employees.length,
        attendance: this.data.attendance.length,
        leaves: this.data.leaves.length,
        employeePayments: this.data.employeePayments.length,
        employeeLedgerTransactions: (this.data.employeeLedgerTransactions || []).length,
        auditLogs: this.data.auditLogs.length,
      },
    };
  }

  // --- RECALCULATE PARTY BALANCES ---
  public recalculatePartyBalance(partyId: string): number {
    const party = this.data.parties.find((p) => p.id === partyId);
    if (!party) return 0;

    // Guard: parties created without an opening balance carry undefined here —
    // start the ledger from 0, never from NaN (NaN would poison every later
    // read balance and write back as 0/null).
    const opening = Number(party.openingBalance) || 0;
    let balance = party.openingBalanceType === 'to_receive' ? opening : -opening;

    const txns = this.data.transactions.filter((t) => t.partyId === partyId);
    for (const t of txns) {
      if (t.status === 'cancelled') continue;
      if (t.type === 'sale_invoice' || t.type === 'debit_note') {
        balance += t.amount;
      } else if (t.type === 'purchase_bill' || t.type === 'credit_note') {
        balance -= t.amount;
      } else if (t.type === 'payment_in') {
        balance -= t.amount; // Customer paid us -> balance decreases
      } else if (t.type === 'payment_out') {
        balance += t.amount; // We paid vendor -> balance increases toward zero
      }
    }

    party.currentBalance = balance;
    party.updatedAt = new Date().toISOString();
    return balance;
  }

  // --- SETTINGS ---
  public getSettings(): CompanySettings {
    return this.data.settings;
  }

  public updateSettings(updates: Partial<CompanySettings>, actorId?: string): CompanySettings {
    this.data.settings = { ...this.data.settings, ...updates };
    // DONE-BY AUDIT (2026-11-21): a settings edit never takes the actor from
    // the client body; a legacy row without a stamp adopts the first saver.
    delete (this.data.settings as any).updatedById;
    delete (this.data.settings as any).updatedByName;
    if (actorId) this.data.settings.updatedById = actorId;
    this.logAudit('UPDATE', 'SETTINGS', undefined, `Updated company profile: ${this.data.settings.companyName}`);
    this.save();
    liveSyncSettings(this.data.settings);
    return this.data.settings;
  }

  // --- PARTIES ---
  public getParties(filter?: { type?: string; category?: string; query?: string }): Party[] {
    let result = this.data.parties;
    if (filter?.type && filter.type !== 'all') {
      result = result.filter((p) => p.type === filter.type || p.type === 'both');
    }
    if (filter?.category && filter.category !== 'all') {
      result = result.filter((p) => p.category === filter.category);
    }
    if (filter?.query) {
      const q = filter.query.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.tradeName && p.tradeName.toLowerCase().includes(q)) ||
          (p.contactPerson && p.contactPerson.toLowerCase().includes(q)) ||
          (p.phone && p.phone.includes(q)) ||
          (p.gstin && p.gstin.toLowerCase().includes(q))
      );
    }
    return result;
  }

  public getPartyById(id: string): Party | undefined {
    return this.data.parties.find((p) => p.id === id);
  }

  // DONE-BY AUDIT (2026-11-21): every mutating entry point takes an optional
  // trailing actorId (the server-stamped session user) and stamps it onto the
  // row — createdById on create, updatedById on edit. The stamping is done
  // HERE (the sandbox the MySQL layer mirrors), never on the client.
  public createParty(partyData: Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'> & { currentBalance?: number }, actorId?: string): Party {
    // Monotonic clock id: concurrent creates must never share an id
    const newId = `pty-${this.nextLedgerMs()}`;
    // documentIds ride the create payload like createSale's flow — staged
    // uploads (Pending/*) registered while the form was open; strip before
    // the party spread (never persisted on the party row) and link below.
    const createDocIds = this.extractDocumentIds(partyData);
    delete (partyData as any).documentIds;
    const openingBal = Number(partyData.openingBalance) || 0;
    const initialBal =
      partyData.currentBalance !== undefined
        ? partyData.currentBalance
        : partyData.openingBalanceType === 'to_receive'
        ? openingBal
        : -openingBal;

    const newParty: Party = {
      ...partyData,
      id: newId,
      currentBalance: initialBal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdById: actorId || (partyData as any).createdById,
      updatedById: actorId || (partyData as any).updatedById,
    };

    this.data.parties.unshift(newParty);
    this.logAudit('CREATE', 'PARTY', newId, `Created party ${newParty.name} (${newParty.type})`);
    this.save();
    liveSyncParty(newParty);
    if (createDocIds.length > 0) this.linkPartyDocuments(newId, createDocIds);
    return newParty;
  }

  public bulkCreateParties(partiesData: Array<Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'> & { currentBalance?: number }>): Party[] {
    const created: Party[] = [];
    const timestamp = Date.now();

    partiesData.forEach((partyData, index) => {
      const newId = `pty-${timestamp}-${index}-${Math.random().toString(36).substring(2, 7)}`;
      const openingBal = Number(partyData.openingBalance) || 0;
      const initialBal =
        partyData.currentBalance !== undefined
          ? partyData.currentBalance
          : partyData.openingBalanceType === 'to_receive'
          ? openingBal
          : -openingBal;

      const newParty: Party = {
        ...partyData,
        id: newId,
        currentBalance: initialBal,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      created.push(newParty);
      this.data.parties.unshift(newParty);
      liveSyncParty(newParty);
    });

    this.logAudit('CREATE', 'PARTY', undefined, `Bulk created ${created.length} parties`);
    this.save();
    return created;
  }

  public updateParty(id: string, updates: Partial<Party>, actorId?: string): Party {
    const index = this.data.parties.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Party ${id} not found.`);
    // Defensive strip: edit-mode uploads link immediately via the documents
    // endpoint, so documentIds should never ride an update — never persist it.
    delete (updates as any).documentIds;
    // A party master edit must never rewrite createdById (strip any client
    // forgery); updatedById moves only with a real acting user.
    delete (updates as any).createdById;
    delete (updates as any).updatedById;
    delete (updates as any).createdByName;
    delete (updates as any).updatedByName;
    const updated = {
      ...this.data.parties[index],
      ...updates,
      updatedAt: new Date().toISOString(),
      ...(actorId ? { updatedById: actorId } : {}),
    };
    this.data.parties[index] = updated;
    this.recalculatePartyBalance(id);
    this.logAudit('UPDATE', 'PARTY', id, `Updated party ${updated.name}`);
    this.save();
    liveSyncParty(updated);
    return this.data.parties[index];
  }

  public deleteParty(id: string): boolean {
    const index = this.data.parties.findIndex((p) => p.id === id);
    if (index === -1) return false;
    const removedParty = this.data.parties[index];
    const name = removedParty.name;
    this.data.parties.splice(index, 1);
    this.data.transactions = this.data.transactions.filter((t) => t.partyId !== id);
    this.detachPartyDocuments(id);
    this.logAudit('DELETE', 'PARTY', id, `Deleted party ${name} and related transactions`);
    this.save();
    liveSyncParty(removedParty, true);
    return true;
  }

  // --- TRANSACTIONS ---
  /**
   * The transaction voucher row KEEPS its party_name copy (statutory: printed
   * vouchers show the party as issued), but every READ resolves partyName as a
   * LIVE VIEW from the parties table (Golden Rule §2) so renames propagate.
   */
  private hydrateTransactionParty(tx: Transaction): Transaction {
    const party = (this.data.parties || []).find((p) => p.id === tx.partyId);
    const account = tx.accountId ? (this.data.accounts || []).find((a) => a.id === tx.accountId) : undefined;
    return {
      ...tx,
      partyName: party?.name || tx.partyName,
      accountName: account?.name || tx.accountName,
    };
  }

  public getTransactions(filter?: { partyId?: string; type?: string; status?: string }): Transaction[] {
    const validPartyIds = new Set((this.data.parties || []).map((p) => p.id));
    let result = (this.data.transactions || []).filter((t) => validPartyIds.has(t.partyId));
    if (filter?.partyId) {
      result = result.filter((t) => t.partyId === filter.partyId);
    }
    if (filter?.type && filter.type !== 'all') {
      result = result.filter((t) => t.type === filter.type);
    }
    if (filter?.status && filter.status !== 'all') {
      result = result.filter((t) => t.status === filter.status);
    }
    return result.map((t) => this.hydrateTransactionParty(t));
  }

  public getTransactionById(id: string): Transaction | undefined {
    const t = this.data.transactions.find((t) => t.id === id);
    return t ? this.hydrateTransactionParty(t) : undefined;
  }

  public createTransaction(data: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; createdAt?: string }, skipLiveSync: boolean = false, actorId?: string): Transaction {
    const newId = data.id || `txn-${Date.now()}`;
    const newTxn: Transaction = {
      ...data,
      id: newId,
      createdAt: data.createdAt || new Date().toISOString(),
      createdById: actorId || (data as any).createdById,
      updatedById: actorId || (data as any).updatedById,
    };
    const existingIndex = this.data.transactions.findIndex((t) => t.id === newId);
    if (existingIndex !== -1) {
      // Upsert-replace (idempotent re-run of the same stage save): the
      // ORIGINAL journal voucher's booking user is a historical fact — keep
      // their createdById even when a later re-save replays the row; only
      // updatedById moves when a real actor is present.
      this.data.transactions[existingIndex] = {
        ...newTxn,
        createdById: this.data.transactions[existingIndex].createdById || newTxn.createdById,
        updatedById: actorId || newTxn.updatedById,
      };
    } else {
      this.data.transactions.unshift(newTxn);
    }
    this.recalculatePartyBalance(data.partyId);
    if (data.accountId) {
      this.recalculateAccountBalance(data.accountId);
    }
    this.logAudit('CREATE', 'TRANSACTION', newId, `Voucher ${newTxn.voucherNumber} (${newTxn.type}) of ₹${newTxn.amount} for ${newTxn.partyName}`);
    this.save();
    if (!skipLiveSync) {
      liveSyncTransaction(newTxn);
    }
    return newTxn;
  }

  public updateTransaction(id: string, updates: Partial<Transaction>, actorId?: string): Transaction {
    const index = this.data.transactions.findIndex((t) => t.id === id);
    if (index === -1) throw new Error(`Transaction ${id} not found.`);
    const previous = this.data.transactions[index];
    // A voucher edit never rewrites who booked it (strip client forgery);
    // updatedById moves only with a real acting user.
    delete (updates as any).createdById;
    delete (updates as any).updatedById;
    delete (updates as any).createdByName;
    delete (updates as any).updatedByName;
    const updated = {
      ...previous,
      ...updates,
      ...(actorId ? { updatedById: actorId } : {}),
    };
    this.data.transactions[index] = updated;

    this.recalculatePartyBalance(updated.partyId);
    if (previous.partyId !== updated.partyId) {
      this.recalculatePartyBalance(previous.partyId);
    }
    if (previous.accountId) {
      this.recalculateAccountBalance(previous.accountId);
    }
    if (updated.accountId) {
      this.recalculateAccountBalance(updated.accountId);
    }

    this.logAudit('UPDATE', 'TRANSACTION', id, `Updated voucher ${updated.voucherNumber}`);
    this.save();
    liveSyncTransaction(updated);
    return updated;
  }

  public deleteTransaction(id: string): boolean {
    const index = this.data.transactions.findIndex((t) => t.id === id);
    if (index === -1) return false;
    const txn = this.data.transactions[index];
    this.data.transactions.splice(index, 1);
    this.recalculatePartyBalance(txn.partyId);
    if (txn.accountId) {
      this.recalculateAccountBalance(txn.accountId);
    }
    this.logAudit('DELETE', 'TRANSACTION', id, `Deleted voucher ${txn.voucherNumber}`);
    this.save();
    liveSyncTransaction(txn, true);
    return true;
  }

  // --- ITEMS / PRODUCTS & SERVICES ---

  /**
   * Movement history lives ONLY in the stock_movements ledger (in-memory sandbox
   * collection here, stock_movements table on Azure MySQL) — never in the items
   * table. Item reads are hydrated from the ledger by reference, so renaming an
   * item or a location never orphans historical movement display.
   */
  private hydrateItemWithMovements(item: Item): Item {
    const ledger = (this.data.stockMovements || []).slice(0, 5000).filter((m) => m.itemId === item.id);
    // FIFO actual-cost valuation is computed SERVER-side from the full
    // ledger at read time — a single source of truth for every client view.
    const valuation = computeItemValuation(item, ledger);
    const hydrated: Item = {
      ...item,
      valuationRate: valuation.valuationRate > 0 ? valuation.valuationRate : undefined,
      stockValue: valuation.stockValue > 0 ? valuation.stockValue : undefined,
      // categoryName / unit / location names are LIVE VIEW fields: resolved
      // from the masters (by FK) at read time so renames propagate (§2).
      // Mirrors the MySQL item_location_mapping ↔ item_locations JOIN.
      categoryName: (this.data.categories || []).find((c) => c.id === item.categoryId)?.name || item.categoryName,
      unit:
        (item.unitId && (this.data.units || []).find((u) => u.id === item.unitId)?.code) ||
        item.unit,
    };
    if (item.type === 'product' && item.locations && item.locations.length > 0) {
      const liveLocs = item.locations.map((l) => ({
        ...l,
        locationName:
          (l.locationId && (this.data.locations || []).find((ml) => ml.id === l.locationId)?.name) || l.locationName,
      }));
      hydrated.locations = liveLocs;
      hydrated.stockLocations = liveLocs.map((l) => l.locationName).filter(Boolean);
      hydrated.stockLocation = hydrated.stockLocations.join(', ');
    }
    if (ledger.length === 0) return hydrated;
    hydrated.movements = ledger.slice(0, 100).map((m) => ({
      id: m.id,
      date: m.date,
      type: m.type,
      quantity: m.quantity,
      balanceAfter: m.balanceAfter,
      rate: m.rate,
      movementValue: m.movementValue,
      valuationRateAfter: m.valuationRateAfter,
      referenceNumber: m.referenceNumber,
      sourcePartyOrBatch: m.sourcePartyOrBatch,
      notes: m.notes,
    }));
    return hydrated;
  }

  private findItemRaw(id: string): Item | undefined {
    return this.data.items.find((i) => i.id === id);
  }

  /** Strictly increasing millisecond clock (ledger rows, voucher ids). */
  private nextLedgerMs(): number {
    let now = Date.now();
    if (now <= this.lastLedgerMs) now = this.lastLedgerMs + 1;
    this.lastLedgerMs = now;
    return now;
  }

  /** Strictly increasing ISO timestamp: equal-millisecond events get +1ms each. */
  private nextLedgerTimestamp(): string {
    return new Date(this.nextLedgerMs()).toISOString();
  }

  public getItems(filter?: { categoryId?: string; type?: string; query?: string }): Item[] {
    let result = this.data.items;
    if (filter?.categoryId && filter.categoryId !== 'all') {
      result = result.filter((i) => i.categoryId === filter.categoryId);
    }
    if (filter?.type && filter.type !== 'all') {
      result = result.filter((i) => i.type === filter.type);
    }
    if (filter?.query) {
      const q = filter.query.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    return result.map((i) => this.hydrateItemWithMovements(i));
  }

  public getItemById(id: string): Item | undefined {
    const raw = this.findItemRaw(id);
    return raw ? this.hydrateItemWithMovements(raw) : undefined;
  }

  public createItem(data: Partial<Item>, actorId?: string): Item {
    const newId = data.id || `itm-${Date.now()}`;
    // documentIds ride the create payload like createParty's flow — staged
    // uploads (Pending/*) registered while the form was open; strip before
    // the item spread (never persisted on the item row) and link below.
    const createDocIds = this.extractDocumentIds(data);
    delete (data as any).documentIds;
    // TYPE SANITATION (2026-11-17): rows saved during the onClick={handleOpenAdd}
    // bug carried a CLICK-EVENT object as their `type` — only the real
    // ItemType strings may persist (invalid values fall back per-path below).
    if (data.type !== undefined && !['product', 'service', 'asset'].includes(data.type)) {
      delete (data as any).type;
    }
    // DIESEL PRICING LOCK (2026-11-17, client directive): the diesel item has
    // NO procured cost of its own — purchase/opening cost are ALWAYS the
    // global diesel_rate (app_defaults snapshot at save time).
    const dieselRateMaster = Number(this.getAppDefault('diesel_rate')) || 0;
    if (isDieselItemName(data.name) && dieselRateMaster > 0) {
      data.purchasePrice = dieselRateMaster;
      if (data.openingStockPrice !== undefined || Number(data.openingStock) > 0) {
        data.openingStockPrice = dieselRateMaster;
      }
    }
    const existingIdx = this.data.items.findIndex((i) => i.id === newId);

    // Normalize multiple locations if provided
    let locations = data.locations && data.locations.length > 0 ? data.locations : [];
    if (data.type === 'product' && locations.length === 0 && data.stockLocation) {
      const parts = data.stockLocation.split(',').map((s) => s.trim()).filter(Boolean);
      locations = parts.length > 1
        ? parts.map((name, idx) => ({
            locationName: name,
            currentStock: idx === 0 ? (Number(data.currentStock) || Number(data.openingStock) || 0) : 0,
            openingStock: idx === 0 ? (Number(data.openingStock) || 0) : 0,
            minStockLevel: data.minStockLevel,
            maxCapacity: data.maxCapacity,
          }))
        : [{
            locationName: data.stockLocation,
            currentStock: Number(data.currentStock) || Number(data.openingStock) || 0,
            openingStock: Number(data.openingStock) || 0,
            minStockLevel: data.minStockLevel,
            maxCapacity: data.maxCapacity,
          }];
    }

    const calculatedStock = locations.length > 0
      ? locations.reduce((sum, l) => sum + (Number(l.currentStock) || 0), 0)
      : (data.currentStock !== undefined ? data.currentStock : 0);

    const calculatedOpeningStock = locations.length > 0 && locations.some((l) => l.openingStock !== undefined)
      ? locations.reduce((sum, l) => sum + (Number(l.openingStock) || 0), 0)
      : (data.openingStock !== undefined ? Number(data.openingStock) : 0);

    const calculatedMinStock = locations.length > 0 && locations.some((l) => l.minStockLevel !== undefined)
      ? locations.reduce((sum, l) => sum + (Number(l.minStockLevel) || 0), 0)
      : (data.minStockLevel !== undefined ? Number(data.minStockLevel) : 0);

    const stockLocations = locations.map((l) => l.locationName);
    const stockLocationStr = stockLocations.length > 0 ? stockLocations.join(', ') : (data.stockLocation || '');

    const newItem: Item = {
      name: data.name || '',
      code: data.code || '',
      type: data.type || 'product',
      categoryId: data.categoryId || '',
      unit: data.unit || 'MT',
      taxRateGst: data.taxRateGst !== undefined ? data.taxRateGst : 18,
      salePrice: data.salePrice || 0,
      isActive: data.isActive !== undefined ? data.isActive : true,
      ...data,
      currentStock: calculatedStock,
      openingStock: calculatedOpeningStock,
      minStockLevel: calculatedMinStock,
      locations: data.type === 'product' && locations.length > 0 ? locations : data.locations,
      stockLocations: data.type === 'product' && stockLocations.length > 0 ? stockLocations : data.stockLocations,
      stockLocation: stockLocationStr,
      id: newId,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21): the session user who registered the item
      createdById: actorId || (data as any).createdById,
      updatedById: actorId || (data as any).updatedById,
    };
    // Movements are ledger-only: never persist movement history on the item row.
    // valuationRate/stockValue are read-time computations — likewise never persisted.
    delete newItem.movements;
    delete newItem.valuationRate;
    delete newItem.stockValue;
    // Resolve the item_units FK from the unit code the form sends (Golden Rule §2):
    // the unit display string is JOINed at read time — no unit name is stored.
    newItem.unitId =
      (this.data.units || []).find((u) => (u.code || '').trim().toLowerCase() === (newItem.unit || '').trim().toLowerCase() ||
        (u.name || '').trim().toLowerCase() === (newItem.unit || '').trim().toLowerCase())?.id || newItem.unitId;
    // DYNAMIC ATTRIBUTES (serialized, 2026-11-16): the declared per-unit key
    // list rides the create payload for trackable items.
    if (newItem.type === 'asset' && data.attributes !== undefined) {
      newItem.attributes = this.sanitizeItemAttributes(data.attributes);
    } else {
      delete newItem.attributes;
    }
    if (existingIdx !== -1) {
      this.data.items[existingIdx] = newItem;
    } else {
      this.data.items.unshift(newItem);
    }
    this.logAudit(existingIdx !== -1 ? 'UPDATE' : 'CREATE', 'ITEM', newId, `Item ${newItem.name} (${newItem.code})`);
    this.save();
    liveSyncItem(newItem);
    if (createDocIds.length > 0) this.linkItemDocuments(newId, createDocIds);
    return newItem;
  }

  public updateItem(id: string, updates: Partial<Item>, actorId?: string): Item {
    const index = this.data.items.findIndex((i) => i.id === id);
    if (index === -1) {
      return this.createItem({ ...updates, id }, actorId);
    }
    // Defensive strip: edit-mode uploads link immediately via the documents
    // endpoint, so documentIds should never ride an update — never persist it.
    delete (updates as any).documentIds;
    // DONE-BY AUDIT (2026-11-21): a master edit never rewrites the booking
    // user (strip client forgery); updatedById moves only with a real actor.
    delete (updates as any).createdById;
    delete (updates as any).updatedById;
    delete (updates as any).createdByName;
    delete (updates as any).updatedByName;
    // TYPE SANITATION (2026-11-17): same as createItem — a corrupted
    // (event-object) type never re-persists; the field is simply dropped so
    // the stored value survives.
    if (updates.type !== undefined && !['product', 'service', 'asset'].includes(updates.type)) {
      delete (updates as any).type;
    }
    const existing = this.data.items[index];
    // DIESEL PRICING LOCK (2026-11-17): on a diesel item the procured cost is
    // fixed at the global diesel_rate — any purchase/opening price riding an
    // edit is overwritten with the snapshot.
    const dieselRateMaster = Number(this.getAppDefault('diesel_rate')) || 0;
    const isDieselMasterName = isDieselItemName(updates.name ?? existing.name);
    if (isDieselMasterName && dieselRateMaster > 0) {
      if (updates.purchasePrice !== undefined) updates.purchasePrice = dieselRateMaster;
      if (updates.openingStockPrice !== undefined) updates.openingStockPrice = dieselRateMaster;
    }

    // TYPE GUARD (trackable, 2026-11-13): an item's type may change ONLY while
    // nothing depends on it — no stock-movement history (the aggregate ledger)
    // and no register units. A "Tyre" mistakenly created as a Stock Item can be
    // converted to Trackable until its first movement / unit; after that the
    // type is frozen to keep the registers meaningful.
    // CORRUPTION REPAIR (2026-11-17): an existing type that is not a real
    // ItemType string (the onClick-event bug row) is not a type at all —
    // normalizing it to a valid one is always allowed, history or not.
    const existingTypeCorrupt = !['product', 'service', 'asset'].includes(existing.type);
    if (updates.type && updates.type !== existing.type) {
      if (existingTypeCorrupt) {
        this.logAudit('UPDATE', 'ITEM', id, `Item ${existing.name} corrupted type repaired → ${updates.type}`);
      } else {
        const hasMovements = (this.data.stockMovements || []).some((m) => m.itemId === id);
        const hasRegisterUnits = (this.data.inventoryUnits || []).some((u) => u.itemId === id);
        if (hasMovements || hasRegisterUnits) {
          throw new Error(`"${existing.name}" carries stock history / registered units — its type can no longer change.`);
        }
        this.logAudit('UPDATE', 'ITEM', id, `Item ${existing.name} type changed ${existing.type} → ${updates.type}`);
      }
    }

    let locations = updates.locations !== undefined ? updates.locations : existing.locations;
    let computedStock = updates.currentStock !== undefined ? Number(updates.currentStock) : existing.currentStock;
    let computedMinStock = updates.minStockLevel !== undefined ? Number(updates.minStockLevel) : (existing.minStockLevel || 0);
    let computedOpeningStock = updates.openingStock !== undefined ? Number(updates.openingStock) : (existing.openingStock || 0);

    if (existing.type === 'product' && locations && locations.length > 0) {
      if (updates.locations !== undefined) {
        computedStock = locations.reduce((sum, l) => sum + (Number(l.currentStock) || 0), 0);
        if (locations.some((l) => l.minStockLevel !== undefined)) {
          computedMinStock = locations.reduce((sum, l) => sum + (Number(l.minStockLevel) || 0), 0);
        }
        if (locations.some((l) => l.openingStock !== undefined)) {
          computedOpeningStock = locations.reduce((sum, l) => sum + (Number(l.openingStock) || 0), 0);
        }
      }
    }

    const stockLocations = locations ? locations.map((l) => l.locationName) : existing.stockLocations;
    const stockLocationStr = stockLocations && stockLocations.length > 0 ? stockLocations.join(', ') : (updates.stockLocation || existing.stockLocation);

    const updated = {
      ...existing,
      ...updates,
      currentStock: computedStock,
      openingStock: computedOpeningStock,
      minStockLevel: computedMinStock,
      locations,
      stockLocations,
      stockLocation: stockLocationStr,
      id,
      updatedAt: new Date().toISOString(),
      ...(actorId ? { updatedById: actorId } : {}),
    };
    // DYNAMIC ATTRIBUTES (serialized, 2026-11-16): a trackable item's key list
    // may grow/change while its units live — existing units keep their stored
    // values (unknown keys survive as legacy data on the unit row only).
    if (updates.attributes !== undefined) {
      if (existing.type !== 'asset') {
        throw new Error(`Attribute keys apply to serialized (trackable) items — "${existing.name}" is not one.`);
      }
      updated.attributes = this.sanitizeItemAttributes(updates.attributes);
    }
    // else: keep whatever the existing row carried (spread above)
    // Movements are ledger-only: never persist movement history on the item row.
    // valuationRate/stockValue are read-time computations — likewise never persisted.
    delete updated.movements;
    delete updated.valuationRate;
    delete updated.stockValue;
    this.data.items[index] = updated;
    // Resolve the item_units FK from the unit code (the unit display string is
    // JOIN-resolved at read time — Golden Rule §2).
    updated.unitId = (this.data.units || []).find((u) =>
      (u.code || '').trim().toLowerCase() === (updated.unit || '').trim().toLowerCase() ||
      (u.name || '').trim().toLowerCase() === (updated.unit || '').trim().toLowerCase()
    )?.id || updated.unitId;
    this.logAudit('UPDATE', 'ITEM', id, `Updated item ${updated.name}`);
    this.save();
    liveSyncItem(updated);
    return updated;
  }

  public deleteItem(id: string): boolean {
    const index = this.data.items.findIndex((i) => i.id === id);
    if (index === -1) return false;
    const removedItem = this.data.items[index];
    const name = removedItem.name;
    this.data.items.splice(index, 1);
    this.detachItemDocuments(id);
    this.logAudit('DELETE', 'ITEM', id, `Deleted item ${name}`);
    this.save();
    liveSyncItem(removedItem, true);
    return true;
  }

  public adjustItemStock(id: string, delta: number, logType: 'purchase_inward' | 'production_output' | 'production_consumed' | 'production_consumed_reversal' | 'sale_dispatch' | 'opening' | 'adjustment_increase' | 'adjustment_decrease' | 'dispatch_reversal' | 'inward_reversal' | 'diesel_issue' | 'diesel_issue_reversal' | 'transfer_out' | 'transfer_in', refNo?: string, notes?: string, locationName?: string, partyId?: string, rate?: number, referenceId?: string): Item {
    const item = this.findItemRaw(id);
    if (!item) throw new Error(`Item ${id} not found.`);
    // TRACKABLE (asset) items carry NO aggregate stock — their physical units
    // live in the inventory_units register (enter / deploy / sell / scrap).
    // An aggregate movement here would invent stock the register never had.
    if (item.type === 'asset') {
      throw new Error(`"${item.name}" is a trackable (asset) item — it carries no aggregate stock. Capture its serial units in the trackable register instead.`);
    }
    const current = item.currentStock || 0;
    // NEGATIVE STOCK IS ALLOWED (mirrors the Azure MySQL path, which applies
    // the raw delta unclamped in liveSyncStockMovement): clamping here made
    // the ledger's balance_after snapshot diverge from the authoritative
    // MySQL current_stock (e.g. deduction to -15 recorded as 0).
    const nextStock = current + delta;
    const movementId = `stk-${this.nextLedgerMs()}-${Math.random().toString(36).slice(2, 8)}`;

    // Normalize and deduplicate existing location stock breakdown
    let updatedLocations: ItemLocationStock[] = [];
    if (item.locations && item.locations.length > 0) {
      const seen = new Set<string>();
      for (const loc of item.locations) {
        const key = (loc.locationName || '').trim().toLowerCase();
        if (!key) continue;
        if (!seen.has(key)) {
          seen.add(key);
          updatedLocations.push({ ...loc, locationName: loc.locationName.trim() });
        } else {
          // Consolidate duplicate location stocks
          const existing = updatedLocations.find((l) => l.locationName.trim().toLowerCase() === key);
          if (existing) {
            existing.currentStock = (Number(existing.currentStock) || 0) + (Number(loc.currentStock) || 0);
          }
        }
      }
    } else if (item.stockLocation) {
      const parts = item.stockLocation.split(',').map((s) => s.trim()).filter(Boolean);
      const uniqueParts = Array.from(new Set(parts.map((p) => p.toLowerCase()))).map(
        (lower) => parts.find((p) => p.toLowerCase() === lower)!
      );
      updatedLocations = uniqueParts.map((p, idx) => ({
        locationName: p,
        currentStock: idx === 0 ? (current || 0) : 0,
        openingStock: idx === 0 ? (item.openingStock || 0) : 0,
      }));
    }

    if (updatedLocations.length === 0) {
      const fallbackName = this.data.locations && this.data.locations.length > 0
        ? this.data.locations[0].name
        : 'Main Storage';
      updatedLocations = [
        {
          locationName: fallbackName,
          currentStock: current || 0,
          openingStock: item.openingStock || 0,
        },
      ];
    }

    const targetLoc = locationName?.trim();
    let targetLocationId: string | undefined;
    // Resolve a bucket's FK from the master list (legacy breakdown rows carry
    // no locationId; the ledger movement must still post the authoritative id).
    const masterIdForName = (name?: string) =>
      name
        ? this.data.locations?.find((ml) => (ml.name || '').trim().toLowerCase() === name.trim().toLowerCase())?.id
        : undefined;
    const applyDeltaToBucket = (idx: number) => {
      const curLocStock = Number(updatedLocations[idx].currentStock) || 0;
      updatedLocations[idx] = { ...updatedLocations[idx], currentStock: curLocStock + delta };
      targetLocationId = updatedLocations[idx].locationId || masterIdForName(updatedLocations[idx].locationName);
    };

    if (targetLoc) {
      const locIdx = updatedLocations.findIndex((l) => l.locationName.trim().toLowerCase() === targetLoc.toLowerCase());
      if (locIdx !== -1) {
        applyDeltaToBucket(locIdx);
      } else if (delta > 0) {
        // Positive qty at an unplanned location opens a fresh bucket for it.
        updatedLocations.push({ locationName: targetLoc, currentStock: delta, openingStock: 0 });
        targetLocationId = masterIdForName(targetLoc);
      } else {
        // Unmatched deduction: the item total MUST still move — take it from
        // the first assigned bucket (ledger row records where it actually
        // left). Silent no-op would strand the outward (currentStock is
        // recomputed from the breakdown below).
        if (updatedLocations.length > 0) applyDeltaToBucket(0);
      }
    } else if (updatedLocations.length > 0) {
      // No location supplied: land the delta on the first assigned bucket so
      // the movement always reaches the item total (the ledger row carries the
      // bucket; Azure's per-location mapping stays untouched as before).
      applyDeltaToBucket(0);
    }

    // Deduplicate location names cleanly
    const uniqueNames: string[] = [];
    const seenNames = new Set<string>();
    for (const l of updatedLocations) {
      const trimmed = l.locationName.trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !seenNames.has(lower)) {
        seenNames.add(lower);
        uniqueNames.push(trimmed);
      }
    }

    item.locations = updatedLocations;
    item.currentStock = updatedLocations.length > 0
      ? updatedLocations.reduce((sum, l) => sum + (Number(l.currentStock) || 0), 0)
      : nextStock;
    item.stockLocations = uniqueNames;
    item.stockLocation = uniqueNames.join(', ');
    item.lastStockUpdate = new Date().toISOString();
    item.updatedAt = new Date().toISOString();

    // Actual-cost snapshots on the ledger row (numeric snapshots, documentation §2):
    //  - rate: the actual cost per unit of THIS event — inward enters at the
    //    rate it was entered/purchased at (existing lots are never re-priced);
    //    outward records the blended FIFO rate of what it actually consumed
    //  - movementValue: the value of the quantity moved at that rate
    //  - valuationRateAfter: the item's blended valuation rate after this event
    const priorMovements = (this.data.stockMovements || []).filter((m) => m.itemId === item.id);
    const isOutward = delta < 0;
    const outwardRate = isOutward ? computeOutwardConsumptionRate(item, priorMovements, Math.abs(delta)) : 0;
    const rateToRecord = isOutward ? outwardRate : Number(rate) || 0;

    const movement: StockMovementRecord = {
      id: movementId,
      itemId: item.id,
      locationId: targetLocationId || undefined,
      date: this.nextLedgerTimestamp(),
      type: logType,
      quantity: delta,
      balanceAfter: item.currentStock,
      rate: rateToRecord > 0 ? rateToRecord : undefined,
      movementValue: rateToRecord > 0 ? Math.abs(delta) * rateToRecord : undefined,
      referenceNumber: refNo,
      referenceId: referenceId,
      sourcePartyOrBatch: undefined, // resolved via party JOIN on read, never stored by name
      partyId: partyId && partyId !== 'unassigned' ? partyId : undefined,
      notes: notes,
    };
    switch (logType) {
      case 'adjustment_increase':
      case 'adjustment_decrease':
        movement.referenceType = 'stock_adjustment';
        break;
      case 'opening':
        movement.referenceType = 'opening';
        break;
      case 'production_output':
      case 'production_consumed':
        movement.referenceType = 'production_batch';
        break;
      // Consumption reversal keyed on the ORIGINAL movement's id (the same
      // matching pattern as dispatch_reversal) — the sale it belongs to drives
      // the referenceId.
      case 'production_consumed_reversal':
        movement.referenceType = 'production_batch';
        break;
      // Fleet diesel fuel-fill: the ledger row belongs to the vehicle
      // expense entry (referenceId = entry id) — a stock trace of the fill.
      case 'diesel_issue':
      case 'diesel_issue_reversal':
        movement.referenceType = 'vehicle_expense';
        break;
      // Stock transfer legs: both ledger rows trace to the adjustment doc
      case 'transfer_out':
      case 'transfer_in':
        movement.referenceType = 'stock_adjustment';
        break;
      default:
        movement.referenceType = referenceId ? 'order_document' : 'order';
    }

    // Append-only ledger: one INSERT per stock change, never rewritten.
    // Snapshot the blended valuation rate WITH this movement applied.
    const valuation = computeItemValuation(item, priorMovements.concat(movement));
    movement.valuationRateAfter = valuation.valuationRate > 0 ? valuation.valuationRate : undefined;
    this.data.stockMovements.unshift(movement);

    this.logAudit('UPDATE', 'ITEM_STOCK', id, `Adjusted stock for ${item.name} by ${delta} ${item.unit} (New: ${nextStock}${targetLoc ? ` at ${targetLoc}` : ''})`);
    this.save();
    if (isMysqlConfigured()) {
      // Ledger path on Azure MySQL: INSERT movement + atomic in-place increments
      // (no full-row REPLACE, so concurrent stock changes never overwrite each other).
      liveSyncStockMovement(item, movement, targetLoc, partyId && partyId !== 'unassigned' ? partyId : undefined);
    }
    return item;
  }

  // --- CATEGORIES, UNITS, LOCATIONS ---
  public getCategories(): ItemCategory[] {
    return this.data.categories;
  }

  public createCategory(cat: Partial<ItemCategory>, actorId?: string): ItemCategory {
    const newId = cat.id || `cat-${Date.now()}`;
    const existingIdx = this.data.categories.findIndex((c) => c.id === newId);
    const newCat: ItemCategory = {
      name: cat.name || '',
      type: cat.type || 'product',
      description: cat.description || '',
      color: cat.color || '#005ac1',
      ...cat,
      id: newId,
      createdAt: cat.createdAt || new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21)
      createdById: actorId || (cat as any).createdById,
      updatedById: actorId || (cat as any).updatedById,
    };
    if (existingIdx !== -1) {
      this.data.categories[existingIdx] = newCat;
    } else {
      this.data.categories.push(newCat);
    }
    this.save();
    liveSyncCategory(newCat);
    return newCat;
  }

  public updateCategory(id: string, updates: Partial<ItemCategory>, actorId?: string): ItemCategory {
    const idx = this.data.categories.findIndex((c) => c.id === id);
    if (idx === -1) {
      return this.createCategory({ ...updates, id }, actorId);
    }
    // DONE-BY AUDIT (2026-11-21): only a real actor moves updatedById
    delete (updates as any).createdById;
    delete (updates as any).createdByName;
    this.data.categories[idx] = { ...this.data.categories[idx], ...updates, id, ...(actorId ? { updatedById: actorId } : {}) };
    this.save();
    liveSyncCategory(this.data.categories[idx]);
    return this.data.categories[idx];
  }

  public deleteCategory(id: string): boolean {
    const idx = this.data.categories.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    const cat = this.data.categories[idx];
    this.data.categories.splice(idx, 1);
    this.save();
    liveSyncCategory(cat, true);
    return true;
  }

  public getUnits(): ItemUnit[] {
    return this.data.units;
  }

  public createUnit(unit: Partial<ItemUnit>, actorId?: string): ItemUnit {
    const newId = unit.id || `unit-${Date.now()}`;
    const existingIdx = this.data.units.findIndex((u) => u.id === newId);
    const newUnit: ItemUnit = {
      name: unit.name || '',
      code: (unit.code || '').toUpperCase().trim(),
      allowDecimal: unit.allowDecimal !== undefined ? unit.allowDecimal : true,
      isStandard: Boolean(unit.isStandard),
      ...unit,
      id: newId,
      // DONE-BY AUDIT (2026-11-21)
      createdById: actorId || (unit as any).createdById,
      updatedById: actorId || (unit as any).updatedById,
    };
    if (existingIdx !== -1) {
      this.data.units[existingIdx] = newUnit;
    } else {
      this.data.units.push(newUnit);
    }
    this.save();
    liveSyncUnit(newUnit);
    return newUnit;
  }

  public updateUnit(id: string, updates: Partial<ItemUnit>, actorId?: string): ItemUnit {
    const idx = this.data.units.findIndex((u) => u.id === id);
    if (idx === -1) {
      return this.createUnit({ ...updates, id }, actorId);
    }
    // DONE-BY AUDIT (2026-11-21): only a real actor moves updatedById
    delete (updates as any).createdById;
    delete (updates as any).createdByName;
    this.data.units[idx] = { ...this.data.units[idx], ...updates, id, ...(actorId ? { updatedById: actorId } : {}) };
    this.save();
    liveSyncUnit(this.data.units[idx]);
    return this.data.units[idx];
  }

  public deleteUnit(id: string): boolean {
    const idx = this.data.units.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    const unit = this.data.units[idx];
    this.data.units.splice(idx, 1);
    this.save();
    liveSyncUnit(unit, true);
    return true;
  }

  public getLocations(): ItemLocation[] {
    return this.data.locations;
  }

  public createLocation(loc: Partial<ItemLocation>, actorId?: string): ItemLocation {
    const newId = loc.id || `loc-${Date.now()}`;
    const existingIdx = this.data.locations.findIndex((l) => l.id === newId);
    const newLoc: ItemLocation = {
      name: loc.name || '',
      code: loc.code,
      type: loc.type || 'yard',
      capacity: loc.capacity,
      description: loc.description,
      isStandard: Boolean(loc.isStandard),
      ...loc,
      id: newId,
      createdAt: loc.createdAt || new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21)
      createdById: actorId || (loc as any).createdById,
      updatedById: actorId || (loc as any).updatedById,
    };
    if (existingIdx !== -1) {
      this.data.locations[existingIdx] = newLoc;
    } else {
      this.data.locations.push(newLoc);
    }
    this.save();
    liveSyncLocation(newLoc);
    return newLoc;
  }

  public updateLocation(id: string, updates: Partial<ItemLocation>, actorId?: string): ItemLocation {
    const idx = this.data.locations.findIndex((l) => l.id === id);
    if (idx === -1) {
      return this.createLocation({ ...updates, id }, actorId);
    }
    // DONE-BY AUDIT (2026-11-21): only a real actor moves updatedById
    delete (updates as any).createdById;
    delete (updates as any).createdByName;
    this.data.locations[idx] = { ...this.data.locations[idx], ...updates, id, ...(actorId ? { updatedById: actorId } : {}) };
    this.save();
    liveSyncLocation(this.data.locations[idx]);
    return this.data.locations[idx];
  }

  public deleteLocation(id: string): boolean {
    const idx = this.data.locations.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    const loc = this.data.locations[idx];
    this.data.locations.splice(idx, 1);

    // Clean up items pointing to this deleted location
    const fallbackLocName = this.data.locations.length > 0 ? this.data.locations[0].name : '';
    for (const item of this.data.items) {
      let changed = false;
      if (item.locations && item.locations.length > 0) {
        const remaining = item.locations.filter(
          (l) => l.locationName.trim().toLowerCase() !== loc.name.trim().toLowerCase()
        );
        if (remaining.length !== item.locations.length) {
          item.locations = remaining.length > 0 ? remaining : (fallbackLocName ? [{ locationName: fallbackLocName, currentStock: item.currentStock || 0, openingStock: item.openingStock || 0 }] : []);
          item.stockLocations = item.locations.map((l) => l.locationName);
          item.stockLocation = item.stockLocations.join(', ');
          changed = true;
        }
      } else if (item.stockLocation && item.stockLocation.toLowerCase().includes(loc.name.toLowerCase())) {
        const parts = item.stockLocation.split(',').map((s) => s.trim()).filter((s) => s.toLowerCase() !== loc.name.toLowerCase());
        item.stockLocations = parts.length > 0 ? parts : (fallbackLocName ? [fallbackLocName] : []);
        item.stockLocation = item.stockLocations.join(', ');
        changed = true;
      }
      if (changed) {
        liveSyncItem(item);
      }
    }

    this.save();
    liveSyncLocation(loc, true);
    return true;
  }

  // --- ITEM STOCK ADJUSTMENTS ---

  /**
   * Voucher display fields (itemName/itemCode/unit/location) are LIVE VIEW fields:
   * always resolved from the items table + its location mapping (or the item_locations
   * master) at read time — so item/location renames propagate to every voucher display.
   * Only FKs (itemId, locationId) are authoritative on the stored record.
   */
  private hydrateStockAdjustment(adj: ItemStockAdjustment): ItemStockAdjustment {
    const item = this.findItemRaw(adj.itemId);
    let locationName = adj.location;
    if (item) {
      // MASTER (renamed item_locations) FIRST — renames propagate (Golden Rule §2)
      if (adj.locationId) {
        const masterLoc = (this.data.locations || []).find((ml) => ml.id === adj.locationId);
        locationName = masterLoc?.name || locationName;
      }
      // Item's mapped-locations fallback (raw row names, only if master absent)
      if (adj.locationId && Array.isArray(item.locations) && !locationName) {
        locationName = item.locations.find((l) => l.locationId === adj.locationId)?.locationName || locationName;
      }
      return {
        ...adj,
        itemName: item.name,
        itemCode: item.code,
        unit: item.unit,
        location: locationName,
        // STOCK TRANSFER (2026-11-17): From/To names resolve live by FK
        fromLocationName: adj.fromLocationId
          ? (this.data.locations || []).find((ml) => ml.id === adj.fromLocationId)?.name || adj.fromLocationName
          : adj.fromLocationName,
        toLocationName: adj.toLocationId
          ? (this.data.locations || []).find((ml) => ml.id === adj.toLocationId)?.name || adj.toLocationName
          : adj.toLocationName,
      };
    }
    return { ...adj, location: locationName };
  }

  public getStockAdjustments(): ItemStockAdjustment[] {
    return (this.data.stockAdjustments || []).map((a) => this.hydrateStockAdjustment(a));
  }

  public createStockAdjustment(adjData: Partial<ItemStockAdjustment>, actorId?: string): ItemStockAdjustment {
    if (!this.data.stockAdjustments) {
      this.data.stockAdjustments = [];
    }
    // Voucher id uses the monotonic clock: two vouchers created in the same
    // millisecond (bulk ops, tests) must never share an id — a collision makes
    // lookups resolve the wrong voucher (wrong revert direction).
    const newId = adjData.id || `stk-adj-${this.nextLedgerMs()}`;
    // Generate a collision-free sequential adjustment number
    let count = this.data.stockAdjustments.length + 1;
    let adjustmentNumber = adjData.adjustmentNumber || '';
    if (!adjustmentNumber) {
      const existing = new Set(this.data.stockAdjustments.map((a) => a.adjustmentNumber));
      do {
        adjustmentNumber = `STK-ADJ-26/${String(count).padStart(3, '0')}`;
        count++;
      } while (existing.has(adjustmentNumber));
    }
    const item = this.getItemById(adjData.itemId || '');
    const prevStock = item ? (item.currentStock || 0) : 0;
    const qty = Number(adjData.quantity) || 0;
    const rate = Number(adjData.rate) || 0;
    const totalVal = Math.round(qty * rate * 100) / 100;
    const newStock = adjData.type === 'increase' ? prevStock + qty : adjData.type === 'decrease' ? Math.max(0, prevStock - qty) : prevStock;

    // ===== STOCK TRANSFER (2026-11-17, client directive): ONE adjustment
    // document, From → To location of the SAME item; the item total never
    // changes. Both ledger legs (transfer_out at the source, transfer_in at
    // the destination) trace to this doc. Value-neutral: the legs price at
    // the item's blended valuation rate.
    const isTransfer = adjData.type === 'transfer';
    let fromLocationId: string | undefined;
    let toLocationId: string | undefined;
    let fromBucket: ItemLocationStock | undefined;
    let toBucket: ItemLocationStock | undefined;
    if (isTransfer) {
      if (!item) throw new Error('Pick the item to transfer its stock.');
      if (qty <= 0) throw new Error('The transfer quantity is required (must be more than zero).');
      fromLocationId = adjData.fromLocationId || adjData.locationId;
      toLocationId = adjData.toLocationId;
      if (!fromLocationId || !toLocationId) throw new Error('A transfer needs both a FROM and a TO location.');
      if (fromLocationId === toLocationId) throw new Error('A transfer cannot move stock between the same location — pick a different destination.');
      // FROM/TO resolve by FK first, then by NAME (legacy item buckets without
      // a locationId reach the transfer as a display name).
      const masterFrom = (this.data.locations || []).find((l) => l.id === fromLocationId || l.name?.trim().toLowerCase() === String(fromLocationId).trim().toLowerCase());
      const masterTo = (this.data.locations || []).find((l) => l.id === toLocationId || l.name?.trim().toLowerCase() === String(toLocationId).trim().toLowerCase());
      if (!masterFrom) throw new Error('The FROM location was not found.');
      if (!masterTo) throw new Error('The TO location was not found.');
      const buckets = item.locations && item.locations.length > 0
        ? item.locations
        : (item.stockLocation ? item.stockLocation.split(',').map((s) => ({ locationName: s.trim(), currentStock: item.currentStock })) : []);
      const byIdOrName = (id: string) =>
        buckets.find((b) => (b as any).locationId === id) ||
        buckets.find((b) => (b.locationName || '').trim().toLowerCase() === (this.data.locations || []).find((l) => l.id === id)?.name?.trim().toLowerCase());
      fromBucket = byIdOrName(fromLocationId);
      toBucket = byIdOrName(toLocationId);
      if (!fromBucket) throw new Error(`The item is not stocked at ${masterFrom.name} (FROM) — it cannot be the transfer source (not found).`);
      const available = Number(fromBucket.currentStock) || 0;
      if (qty > available) {
        throw new Error(`Stock at ${masterFrom.name} is ${available.toLocaleString('en-IN')} ${item.unit} — cannot transfer ${qty.toLocaleString('en-IN')} ${item.unit}.`);
      }
    }
    const transferRate = isTransfer && item
      ? computeItemValuation(item, (this.data.stockMovements || []).filter((m) => m.itemId === item.id)).valuationRate
      : rate;

    const newAdj: ItemStockAdjustment = {
      id: newId,
      adjustmentNumber,
      itemId: adjData.itemId || '',
      itemName: adjData.itemName || item?.name || '',   // display field; resolved live on read
      itemCode: adjData.itemCode || item?.code || '',   // display field; resolved live on read
      unit: adjData.unit || item?.unit || 'MT',         // display field; resolved live on read
      date: adjData.date || new Date().toISOString().split('T')[0],
      type: adjData.type || 'increase',
      quantity: qty,
      rate: rate,
      totalValue: totalVal,
      previousStock: prevStock,
      newStock: newStock,
      reason: adjData.reason || 'Inventory Stock Reconciliation',
      location: isTransfer
        ? ((this.data.locations || []).find((l) => l.id === fromLocationId)?.name || '')
        : (adjData.location || item?.stockLocation || ''),  // display field; resolved live on read
      ...(isTransfer ? { fromLocationId, toLocationId } : {}),
      referenceNumber: adjData.referenceNumber || '',
      notes: adjData.notes || '',
      createdAt: adjData.createdAt || new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21): the session user who recorded the voucher
      createdById: actorId || (adjData as any).createdById,
      updatedById: actorId || (adjData as any).updatedById,
    };
    // Store the FK of the chosen storage location (display name is resolved at read time)
    if (isTransfer) {
      newAdj.locationId = fromLocationId;
    } else {
      newAdj.locationId = this.findItemRaw(newAdj.itemId)?.locations?.find(
        (l) => (l.locationName || '').trim().toLowerCase() === (newAdj.location || '').trim().toLowerCase()
      )?.locationId;
      if (!newAdj.locationId) {
        // A location typed freely without an exact item-location match: fall back to the item's own location copy
        const fallbackName = (newAdj.location || '').trim().toLowerCase();
        newAdj.locationId = (this.data.locations || []).find((ml) => ml.name?.trim().toLowerCase() === fallbackName)?.id;
      }
    }

    this.data.stockAdjustments.unshift(newAdj);

    if (item && isTransfer) {
      // Transfer legs — BOTH trace to this adjustment doc:
      //  OUT at the source (blended WAC consumption, computed by the ledger)
      //  IN at the destination (SAME blended rate ⇒ the item's total value is unchanged)
      const fromName = (this.data.locations || []).find((l) => l.id === fromLocationId)?.name;
      const toName = (this.data.locations || []).find((l) => l.id === toLocationId)?.name;
      this.adjustItemStock(
        item.id,
        -qty,
        'transfer_out',
        newAdj.adjustmentNumber,
        `[Stock Transfer] ${qty} ${newAdj.unit} ${fromName || ''} → ${toName || ''}`,
        fromName,
        undefined,
        undefined,
        newAdj.id,
      );
      this.adjustItemStock(
        item.id,
        qty,
        'transfer_in',
        newAdj.adjustmentNumber,
        `[Stock Transfer] ${qty} ${newAdj.unit} ${fromName || ''} → ${toName || ''}`,
        toName,
        undefined,
        transferRate > 0 ? transferRate : undefined,
        newAdj.id,
      );
    } else if (item) {
      this.adjustItemStock(
        item.id,
        adjData.type === 'increase' ? qty : -qty,
        adjData.type === 'increase' ? 'adjustment_increase' : 'adjustment_decrease',
        newAdj.adjustmentNumber,
        `[Stock Adj: ${newAdj.reason}] ${newAdj.notes || ''}`.trim(),
        newAdj.location,
        undefined,
        // Actual rate of this event (recorded on the ledger; the valuation
        // engine enters increases at it and consumes decreases at WAC):
        Number(newAdj.rate) || undefined
      );
    }

    this.logAudit('CREATE', 'STOCK_ADJUSTMENT', newId, `Stock Adjustment ${newAdj.adjustmentNumber} (${newAdj.type}) for ${newAdj.itemName}: ${qty} ${newAdj.unit} at ${newAdj.location || 'Storage'}`);
    this.save();
    liveSyncStockAdjustment(newAdj, false, newAdj.locationId);
    return newAdj;
  }

  public deleteStockAdjustment(id: string): boolean {
    if (!this.data.stockAdjustments) return false;
    const idx = this.data.stockAdjustments.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    const adj = this.data.stockAdjustments[idx];
    this.data.stockAdjustments.splice(idx, 1);

    const item = this.getItemById(adj.itemId);
    if (item && adj.type === 'transfer' && adj.fromLocationId && adj.toLocationId) {
      // TRANSFER REVERSAL (2026-11-17): a deleted transfer moves the stock
      // BACK — it returns to the source (at the transfer_in rate it entered)
      // and leaves the destination.
      const fromName = (this.data.locations || []).find((l) => l.id === adj.fromLocationId)?.name;
      const toName = (this.data.locations || []).find((l) => l.id === adj.toLocationId)?.name;
      const inRate = (this.data.stockMovements || [])
        .filter((m) => m.itemId === adj.itemId && m.referenceNumber === adj.adjustmentNumber && m.type === 'transfer_in')
        .map((m) => (Number(m.rate) > 0 ? Number(m.rate) : undefined))[0];
      try {
        this.adjustItemStock(
          item.id, -adj.quantity, 'transfer_out', `REV-${adj.adjustmentNumber}`,
          `Revert stock transfer ${adj.adjustmentNumber} — leaves ${toName || 'destination'}`,
          toName, undefined, undefined, adj.id,
        );
        this.adjustItemStock(
          item.id, adj.quantity, 'transfer_in', `REV-${adj.adjustmentNumber}`,
          `Revert stock transfer ${adj.adjustmentNumber} — returns to ${fromName || 'source'}`,
          fromName, undefined, inRate, adj.id,
        );
      } catch (e: any) {
        console.error(`[DB] Failed to revert stock transfer ${adj.adjustmentNumber}:`, e.message);
      }
    } else if (item) {
      const revertDelta = adj.type === 'increase' ? -adj.quantity : adj.quantity;
      // Revert at the SAME storage the voucher touched: resolve the display name
      // live from the location FK so a rename never breaks the revert.
      const revertLocation = this.hydrateStockAdjustment(adj).location;
      // Reverting a decrease re-enters stock at the FIFO blended cost the
      // original movement actually consumed at (recorded on its ledger row);
      // reverting an increase consumes at the current WAC (no rate passed).
      const originalMovement = (this.data.stockMovements || []).find(
        (m) => m.itemId === adj.itemId && m.referenceNumber === adj.adjustmentNumber
      );
      const revertRate = revertDelta > 0
        ? (originalMovement?.rate || originalMovement?.valuationRateAfter || undefined)
        : undefined;
      this.adjustItemStock(
        item.id,
        revertDelta,
        revertDelta >= 0 ? 'adjustment_increase' : 'adjustment_decrease',
        `REV-${adj.adjustmentNumber}`,
        `Revert stock adjustment ${adj.adjustmentNumber}`,
        revertLocation,
        undefined,
        revertRate
      );
    }

    this.logAudit('DELETE', 'STOCK_ADJUSTMENT', id, `Deleted stock adjustment ${adj.adjustmentNumber}`);
    this.save();
    liveSyncStockAdjustment(adj, true, adj.locationId);
    return true;
  }

  // ========== SALES & PURCHASE — RELATIONAL ORDER MODEL ==========
  // The legacy single-table `orders` design is retired: a sale / purchase is a
  // MASTER record; stage documents (quotation → sales order / proforma →
  // delivery note / invoice; RFQ → PO → GRN) are separate rows saved against
  // it (full document history). Items live on the master. Stock / cash
  // application happens ONCE per master, at whichever stage save the user
  // flips the "update inventory / update cash" toggle.

  /** Legacy `orders` rows are READ-only (kept for the retired table). */
  public getOrders(): Order[] {
    return this.data.orders;
  }

  public getOrderById(id: string): Order | undefined {
    return this.data.orders.find((o) => o.id === id);
  }

  // ---------- shared FK resolution helpers (Golden Rule §2) ----------

  private resolveUnitIdFromCode(code?: string | null): string | undefined {
    const c = (code || '').trim().toLowerCase();
    if (!c) return undefined;
    return this.data.units.find(
      (u) => (u.code || '').trim().toLowerCase() === c || (u.name || '').trim().toLowerCase() === c
    )?.id;
  }

  private resolveLocationIdFromName(name?: string | null): string | undefined {
    const n = (name || '').trim().toLowerCase();
    if (!n) return undefined;
    return this.data.locations.find((l) => (l.name || '').trim().toLowerCase() === n)?.id;
  }

  /** RST numbering (2026-10-28 user rule): the sales-order document number is
   *  a SIMPLE SERIAL stored bare ('0001'); every surface shows the number
   *  beside the "RST" label (RST 0001). Next = highest bare-serial saleNumber
   *  in use — INCLUDING soft-deleted rows, whose numbers stay spent — plus 1;
   *  legacy SO-/QUO-/SALE-… numbers are ignored by the parse and untouched. */
  private isBareSerial(v: string | undefined): boolean {
    return /^\d+$/.test(String(v || ''));
  }

  private nextRstNumber(): string {
    let max = 0;
    for (const s of this.data.sales || []) {
      if (!this.isBareSerial(s.saleNumber)) continue;
      const n = parseInt(String(s.saleNumber), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return String(max + 1).padStart(4, '0');
  }

  /** For the Add-Sale form's prefill (GET /api/sales/next-rst). */
  public peekNextRstNumber(): string {
    return this.nextRstNumber();
  }

  private computeStageTotals(
    lines: Array<{ quantity: number; rate: number; gstRate?: number }>,
    transportCharges = 0,
    freightGstRate = 0
  ): { subtotal: number; taxAmount: number; totalAmount: number; taxRateGst: number; freightGstAmount: number } {
    let subtotal = 0;
    let taxAmount = 0;
    for (const li of lines) {
      const lineTotal = (Number(li.quantity) || 0) * (Number(li.rate) || 0);
      subtotal += lineTotal;
      taxAmount += (lineTotal * (Number(li.gstRate) || 0)) / 100;
    }
    const taxRateGst = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0;
    // Figures approximated to 2 decimal places (paise) — matches the modal math
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const subtotal2 = r2(subtotal);
    const taxAmount2 = r2(taxAmount);
    // Fleet-cost row: transportCharges carries its OWN GST slab (its own doc
    // row, separate from the item-line tax)
    const freightGstAmount = r2(((Number(transportCharges) || 0) * (Number(freightGstRate) || 0)) / 100);
    return {
      subtotal: subtotal2,
      taxAmount: taxAmount2,
      totalAmount: r2(subtotal2 + taxAmount2 + (Number(transportCharges) || 0) + freightGstAmount),
      taxRateGst,
      freightGstAmount,
    };
  }

  /** Received-based stage totals — the goods-receipt document bills the
   *  ACTUAL received quantities at the PO's locked rates: every line is worth
   *  received qty × rate + that line's GST slab, so a short line contributes
   *  less/zero and an overage contributes more (user rule). Lines without a
   *  recorded received quantity fall back to the ordered qty. */
  private computeReceivedStageTotals(
    lines: Array<{ quantity: number; rate: number; gstRate?: number; receivedQuantity?: number | null }>
  ): { subtotal: number; taxAmount: number; totalAmount: number; taxRateGst: number } {
    const receivedLines = (lines || []).map((li) => ({
      ...li,
      quantity:
        li.receivedQuantity !== undefined && li.receivedQuantity !== null
          ? Number(li.receivedQuantity)
          : Number(li.quantity) || 0,
    }));
    return this.computeStageTotals(receivedLines, 0);
  }

  private computeSalesStatus(sale: Sale): OrderStatus {
    if (sale.status === 'cancelled') return 'cancelled';
    const stageTypes = new Set((sale.stages || []).map((s) => s.stageType));
    return stageTypes.has('delivery_note') || stageTypes.has('sales_invoice') ? 'completed' : 'pending';
  }

  private computePurchaseStatus(purchase: Purchase): OrderStatus {
    if (purchase.status === 'cancelled') return 'cancelled';
    return (purchase.stages || []).some((s) => s.stageType === 'goods_receipt') ? 'completed' : 'pending';
  }

  // ---------- CASH & BANK SETTLEMENT — voucher posting for sales/purchases ----------
  // A sale's sales_invoice stage (a purchase's goods_receipt stage) posts TWO
  // entries through the shared voucher funnel (cash & bank + party ledger):
  //   1. the invoice/bill journal voucher  — party receivable/payable moves;
  //      NO account linkage → the Cash/Bank account balance is untouched.
  //   2. (only when the user chose "Settle Payment Now") the receipt/payout
  //      voucher — account FK set via createTransaction → its
  //      recalculateAccountBalance credits/debits the account, and
  //      recalculatePartyBalance cancels the receivable/payable.
  // Voucher ids are deterministic (`txn-<saleId>-inv` / `-pay`), so a re-run
  // of the same stage save REPLACES its own row instead of duplicating it
  // (createTransaction upserts by id). The invoice/bill voucher number is
  // stamped at first issue and then kept stable across re-runs.

  private roundMoney(n: number): number {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  /** Mint a voucher number under the company's configured prefix, skipping
   *  collisions with any existing voucher. */
  private mintVoucherNumber(prefix: string): string {
    const taken = new Set((this.data.transactions || []).map((t) => t.voucherNumber));
    for (let i = 0; i < 50; i += 1) {
      const candidate = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${prefix}${Date.now().toString().slice(-6)}`; // fallback after 50 tries
  }

  /** Voucher mutations recalculate the sandbox party/account balances — the
   *  finance reads rehydrate from MySQL, so push the fresh balances out. */
  private syncLedgerBalances(partyId?: string, accountIds?: Array<string | undefined | null>): void {
    if (partyId) {
      this.recalculatePartyBalance(partyId);
      const party = this.data.parties.find((p) => p.id === partyId);
      if (party) liveSyncParty(party);
    }
    for (const aid of accountIds || []) {
      if (!aid) continue;
      this.recalculateAccountBalance(aid);
      const acc = (this.data.accounts || []).find((a) => a.id === aid);
      if (acc) liveSyncAccount(acc);
    }
  }

  /** The invoice/bill journal voucher reads "settled" (status paid) only when
   *  the payment flow was applied with a real Cash/Bank account — booking on
   *  credit moves the party ledger but never marks the voucher paid. */
  private cashFlowSettled(master: { settlementType?: string; settlementVoucherId?: string }): boolean {
    const flowType = master.settlementType ?? (master.settlementVoucherId ? 'account' : undefined);
    return flowType === 'account';
  }

  /** Post (idempotently, by id) the sale_invoice journal voucher for the
   *  invoice stage — amount is a statutory snapshot of the stage total. */
  private upsertSaleInvoiceVoucher(sale: Sale, stage: SalesOrderStage, actorId?: string): string {
    const party = this.data.parties.find((p) => p.id === sale.partyId);
    const existingVoucher = sale.invoiceVoucherId
      ? (this.data.transactions || []).find((t) => t.id === sale.invoiceVoucherId)
      : undefined;
    const voucherNumber = existingVoucher?.voucherNumber || this.mintVoucherNumber(this.data.settings.prefixes.salesInvoice);
    const voucherId = existingVoucher?.id || `txn-${sale.id}-inv`;
    // The voucher names the document that booked the receivable — credit
    // bookings can post at the sales_order stage before any invoice exists.
    const docLabel = stage.stageType === 'sales_invoice' ? 'Sales Invoice' : 'Sales Order';
    this.createTransaction(
      {
        id: voucherId,
        voucherNumber,
        partyId: sale.partyId,
        partyType: (party?.type as any) || 'customer',
        type: 'sale_invoice',
        amount: this.roundMoney(stage.totalAmount),
        date: stage.date || sale.date,
        referenceNumber: stage.stageNumber,
        description: `${docLabel} ${stage.stageNumber} — sale ${sale.saleNumber}`,
        status: this.cashFlowSettled(sale) ? 'paid' : 'pending',
      },
      false,
      actorId
    );
    return voucherId;
  }

  /** Post (idempotently) the payment_in receipt voucher crediting the chosen
   *  Cash/Bank account; throws when the settlement account is unknown (the
   *  routes surface it as a 400 via the bizStatus pattern). */
  private upsertSaleReceiptVoucher(sale: Sale, stage: SalesOrderStage, settlementAccountId: string, paymentMode?: string, actorId?: string): string {
    const account = (this.data.accounts || []).find((a) => a.id === settlementAccountId && a.isActive);
    if (!account) {
      throw new Error('Selected settlement account was not found — please choose an active Cash/Bank account.');
    }
    const party = this.data.parties.find((p) => p.id === sale.partyId);
    const existingVoucher = sale.settlementVoucherId
      ? (this.data.transactions || []).find((t) => t.id === sale.settlementVoucherId)
      : undefined;
    const voucherNumber = existingVoucher?.voucherNumber || this.mintVoucherNumber(this.data.settings.prefixes.paymentReceipt);
    const voucherId = existingVoucher?.id || `txn-${sale.id}-pay`;
    this.createTransaction(
      {
        id: voucherId,
        voucherNumber,
        partyId: sale.partyId,
        partyType: (party?.type as any) || 'customer',
        type: 'payment_in',
        amount: this.roundMoney(stage.totalAmount),
        date: stage.date || sale.date,
        accountId: settlementAccountId,
        paymentMode: (paymentMode as any) || 'bank_transfer',
        referenceNumber: stage.stageNumber,
        description: `Receipt against Sales Invoice ${stage.stageNumber} — sale ${sale.saleNumber}`,
        status: 'paid',
      },
      false,
      actorId
    );
    return voucherId;
  }

  /** One-shot gate: applies the sale's payment flow exactly once per sale —
   *  settlement.type picks the flow (db.ts wire: stageInput.settlementType):
   *   'none'   → don't touch: nothing posts at all (no journal, no ledger);
   *   'credit' → party ledger only: the sale_invoice journal voucher posts the
   *              moment credit is booked (stage total — the receivable must
   *              move immediately); the later invoice save re-upserts it with
   *              the invoice-stage total. No cash ever moves;
   *   'account'→ full flow: journal (at the invoice document) + payment_in
   *              receipt into the chosen account (stage-total-now policy;
   *              later invoice differences stay outstanding on the party).
   *  Legacy callers (no type) keep today's behavior: unsettled credit posting
   *  + receipt only when settle=true. Runs at sales_order AND sales_invoice
   *  stage saves; cashApplied acts as the one-shot "flow applied" lock. */
  private applySaleCash(
    sale: Sale,
    stage: SalesOrderStage,
    settlement: { settle: boolean; type?: 'none' | 'credit' | 'account'; settlementAccountId?: string; paymentMode?: PaymentMode },
    stageType?: SalesStage,
    actorId?: string
  ): void {
    // Legacy fallback: old clients send only updateCash — settle ⇒ account.
    const flowType = settlement.type ?? (settlement.settle ? 'account' as const : undefined);
    // "Don't touch payment settlement": post nothing, lock nothing. At the
    // FINAL document stage, however, a payment flow is COMPULSORY — the
    // invoice cannot be issued without deciding credit vs account.
    if (flowType === 'none') {
      if (stageType === undefined || stageType === 'sales_invoice') {
        throw new Error('A payment flow (Book on credit or Cash/Bank settlement) must be applied when the Sales Invoice is issued.');
      }
      return;
    }

    const wasSettled = sale.cashApplied;
    const isInvoice = stageType === undefined || stageType === 'sales_invoice';

    // Validate the settlement account BEFORE any voucher is written — a reject
    // must not leave an orphaned journal voucher behind.
    if (flowType === 'account' && !wasSettled) {
      if (!settlement.settlementAccountId) {
        throw new Error('A Deposit / Settlement Account is required when settling payment.');
      }
      const account = (this.data.accounts || []).find((a) => a.id === settlement.settlementAccountId && a.isActive);
      if (!account) {
        throw new Error('Selected settlement account was not found — please choose an active Cash/Bank account.');
      }
    }

    // 1. Invoice journal voucher — posted for 'credit' and 'account' flows.
    //    For 'credit' it posts IMMEDIATELY at whichever stage the flow was
    //    applied (party receivable must move the moment credit is booked);
    //    the later invoice save re-upserts it with the invoice-stage total.
    //    For 'account'/legacy flows it belongs to the invoice document.
    if (isInvoice || flowType === 'credit') {
      const billId = this.upsertSaleInvoiceVoucher(sale, stage, actorId);
      sale.invoiceVoucherId = billId;
    }

    // 2. Receipt voucher (only for the account flow; guard: never doubles,
    //    and it keeps the settled STAGE total — a later invoice difference
    //    simply stays outstanding on the party ledger).
    if (flowType === 'account' && !wasSettled) {
      const payId = this.upsertSaleReceiptVoucher(sale, stage, settlement.settlementAccountId!, settlement.paymentMode, actorId);
      sale.settlementVoucherId = payId;
      sale.settlementAccountId = settlement.settlementAccountId;
      sale.paymentMode = settlement.paymentMode || sale.paymentMode;
      sale.settledAmount = this.roundMoney(stage.totalAmount);
      sale.settledDate = stage.date || sale.date;
      sale.cashApplied = true;
      sale.settlementType = 'account';
    } else if (flowType === 'credit' && !wasSettled) {
      // Book on credit: receivable rides the party ledger (journal voucher),
      // no account linkage — the flow is still one-shot locked.
      sale.cashApplied = true;
      sale.settlementType = 'credit';
    }
    // Refresh the invoice voucher's status flag: paid only for the account flow.
    if (sale.invoiceVoucherId) {
      const invoiceTxn = (this.data.transactions || []).find((t) => t.id === sale.invoiceVoucherId);
      if (invoiceTxn && invoiceTxn.status !== (this.cashFlowSettled(sale) ? 'paid' : 'pending') && invoiceTxn.status !== 'cancelled') {
        this.updateTransaction(invoiceTxn.id, { status: this.cashFlowSettled(sale) ? 'paid' : 'pending' }, actorId);
      }
    }
    // Push the recalculated party/account balances to MySQL.
    this.syncLedgerBalances(sale.partyId, [sale.settlementAccountId]);
  }

  /** Mirror for purchases at purchase_order AND goods_receipt stages. Same
   *  payment-flow semantics as applySaleCash: 'none' touches nothing, 'credit'
   *  books the payable on the party ledger immediately at the applying stage
   *  (re-upserted with GRN totals at the goods receipt), 'account' adds the
   *  payment_out payout from the chosen account (stage-total-now policy; later
   *  GRN differences stay on the party). Legacy callers (no type) keep
   *  today's behavior. */
  private applyPurchaseCash(
    purchase: Purchase,
    stage: PurchaseOrderStage,
    settlement: { settle: boolean; type?: 'none' | 'credit' | 'account'; settlementAccountId?: string; paymentMode?: PaymentMode },
    stageType?: PurchaseStage,
    actorId?: string
  ): void {
    // Legacy fallback: old clients send only updateCash — settle ⇒ account.
    const flowType = settlement.type ?? (settlement.settle ? 'account' as const : undefined);
    // "Don't touch payment settlement": post nothing, lock nothing. At the
    // FINAL document stage, however, a payment flow is COMPULSORY — the
    // goods receipt cannot be recorded without deciding credit vs account.
    if (flowType === 'none') {
      if (stageType === undefined || stageType === 'goods_receipt') {
        throw new Error('A payment flow (Book on credit or Cash/Bank settlement) must be applied when the Goods Receiving is recorded.');
      }
      return;
    }

    const wasSettled = purchase.cashApplied;
    const isGrn = stageType === undefined || stageType === 'goods_receipt';
    const party = purchase.partyId ? this.data.parties.find((p) => p.id === purchase.partyId) : undefined;

    // Validate BEFORE any voucher is written — a reject must not leave an
    // orphaned bill voucher behind. The journal + payout vouchers carry
    // partyId FKs into the party ledger, so a payer is always required;
    // the payout additionally needs a source account.
    if (!purchase.partyId && (flowType === 'credit' || (flowType === 'account' && !wasSettled))) {
      throw new Error(flowType === 'credit'
        ? 'A Supplier / Vendor is required to book the purchase on credit.'
        : 'A Supplier / Vendor is required when settling payment.');
    }
    if (flowType === 'account' && !wasSettled) {
      if (!settlement.settlementAccountId) {
        throw new Error('A Disbursement / Source Account is required when settling payment.');
      }
      const account = (this.data.accounts || []).find((a) => a.id === settlement.settlementAccountId && a.isActive);
      if (!account) {
        throw new Error('Selected settlement account was not found — please choose an active Cash/Bank account.');
      }
    }

    // 1. Purchase bill journal voucher (payable moves; no account linkage) —
    //    posted for 'credit' and 'account' flows. For 'credit' it posts
    //    IMMEDIATELY at whichever stage the flow was applied (party payable
    //    must move the moment credit is booked); the later GRN save re-upserts
    //    it with the goods-receipt totals. For 'account'/legacy flows it
    //    belongs to the goods-receipt document.
    if (isGrn || flowType === 'credit') {
      const existingBill = purchase.invoiceVoucherId
        ? (this.data.transactions || []).find((t) => t.id === purchase.invoiceVoucherId)
        : undefined;
      const billNumber = existingBill?.voucherNumber || this.mintVoucherNumber(this.data.settings.prefixes.purchaseBill);
      const billId = existingBill?.id || `txn-${purchase.id}-bill`;
      // The voucher names the document that booked the payable — credit
      // bookings can post at the purchase_order stage before any GRN exists.
      const docLabel = stage.stageType === 'goods_receipt' ? 'Purchase Bill' : 'Purchase Order';
      this.createTransaction(
        {
          id: billId,
          voucherNumber: billNumber,
          partyId: purchase.partyId!,
          partyType: (party?.type as any) || 'supplier',
          type: 'purchase_bill',
          amount: this.roundMoney(stage.totalAmount),
          date: stage.date || purchase.date,
          referenceNumber: stage.stageNumber,
          description: `${docLabel} ${stage.stageNumber} — purchase ${purchase.purchaseNumber}`,
          status: this.cashFlowSettled(purchase) ? 'paid' : 'pending',
        },
        false,
        actorId
      );
      purchase.invoiceVoucherId = billId;
    }

    // 2. Payout voucher (debit the account; one-shot — never doubles).
    if (flowType === 'account' && !wasSettled) {
      const existingPay = purchase.settlementVoucherId
        ? (this.data.transactions || []).find((t) => t.id === purchase.settlementVoucherId)
        : undefined;
      const payNumber = existingPay?.voucherNumber || this.mintVoucherNumber(this.data.settings.prefixes.paymentReceipt);
      const payId = existingPay?.id || `txn-${purchase.id}-pay`;
      this.createTransaction(
        {
          id: payId,
          voucherNumber: payNumber,
          partyId: purchase.partyId!,
          partyType: (party?.type as any) || 'supplier',
          type: 'payment_out',
          amount: this.roundMoney(stage.totalAmount),
          date: stage.date || purchase.date,
          accountId: settlement.settlementAccountId,
          paymentMode: (settlement.paymentMode as any) || 'bank_transfer',
          referenceNumber: stage.stageNumber,
          description: `Payout against purchase ${purchase.purchaseNumber} (stage ${stage.stageNumber})`,
          status: 'paid',
        },
        false,
        actorId
      );
      purchase.settlementVoucherId = payId;
      purchase.settlementAccountId = settlement.settlementAccountId;
      purchase.paymentMode = settlement.paymentMode || purchase.paymentMode;
      purchase.settledAmount = this.roundMoney(stage.totalAmount);
      purchase.settledDate = stage.date || purchase.date;
      purchase.cashApplied = true;
      purchase.settlementType = 'account';
    } else if (flowType === 'credit' && !wasSettled) {
      // Book on credit: payable rides the party ledger (bill voucher at GRN),
      // no account linkage — the flow is still one-shot locked.
      purchase.cashApplied = true;
      purchase.settlementType = 'credit';
    }
    if (purchase.invoiceVoucherId && isGrn) {
      const billTxn = (this.data.transactions || []).find((t) => t.id === purchase.invoiceVoucherId);
      if (billTxn && billTxn.status !== (this.cashFlowSettled(purchase) ? 'paid' : 'pending') && billTxn.status !== 'cancelled') {
        this.updateTransaction(billTxn.id, { status: this.cashFlowSettled(purchase) ? 'paid' : 'pending' }, actorId);
      }
    }
    // Push the recalculated party/account balances to MySQL.
    this.syncLedgerBalances(purchase.partyId, [purchase.settlementAccountId]);
  }

  /** Remove the voucher(s) a sale/purchase posted to Cash & Bank (deletion /
   *  cancellation reversal — the party + account balances re-recalculate via
   *  deleteTransaction's built-in compensation). */
  private deleteLinkedVouchers(
    master: { partyId?: string; invoiceVoucherId?: string; settlementVoucherId?: string },
    label: string
  ): void {
    const accountIds: Array<string | undefined> = [];
    for (const vid of [master.invoiceVoucherId, master.settlementVoucherId]) {
      if (vid) {
        const txn = (this.data.transactions || []).find((t) => t.id === vid);
        if (txn) {
          accountIds.push(txn.accountId);
          this.deleteTransaction(vid);
          this.logAudit('DELETE', 'VOUCHER_REVERSAL', vid, `${label}: removed voucher ${txn.voucherNumber}`);
        }
      }
    }
    master.invoiceVoucherId = undefined;
    master.settlementVoucherId = undefined;
    // Push the recalculated party/account balances to MySQL.
    this.syncLedgerBalances(master.partyId, accountIds);
  }

  /** Edit compensation (user rule: "money follows the document"): re-size the
   *  posted journal + receipt/payout vouchers to the edited document total —
   *  the journal refreshes the party receivable/payable leg, the money voucher
   *  re-adjusts its Cash/Bank account via updateTransaction's recalc. Only
   *  vouchers whose amounts actually differ are rewritten. */
  private resizeVoucherAmounts(
    master: {
      partyId?: string;
      invoiceVoucherId?: string;
      settlementVoucherId?: string;
      settlementAccountId?: string;
      settledAmount?: number;
    },
    newAmount: number,
    label: string,
    auditAction: string
  ): void {
    const accountIds: Array<string | undefined> = [];
    for (const vid of [master.invoiceVoucherId, master.settlementVoucherId]) {
      if (!vid) continue;
      const txn = (this.data.transactions || []).find((t) => t.id === vid);
      if (!txn) continue;
      accountIds.push(txn.accountId);
      if (this.roundMoney(txn.amount) !== this.roundMoney(newAmount)) {
        this.updateTransaction(vid, { amount: this.roundMoney(newAmount) });
        this.logAudit('UPDATE', auditAction, vid, `${label}: voucher ${txn.voucherNumber} (${txn.type}) amount resized to ₹${newAmount}`);
      }
    }
    // The settled snapshot rides on the resized money voucher.
    if (master.settlementVoucherId) {
      master.settledAmount = this.roundMoney(newAmount);
    }
    // Push the recalculated party/account balances to MySQL.
    this.syncLedgerBalances(master.partyId, accountIds);
  }

  /** Material equality of order line sets (item, qty, rate, received qty) —
   *  re-saves that don't change the applied values must not churn the ledger. */
  private areOrderItemLinesEqual(
    a: Array<any> | undefined,
    b: Array<any> | undefined
  ): boolean {
    const la = a || [];
    const lb = b || [];
    if (la.length !== lb.length) return false;
    const epsilon = 1e-9;
    return la.every((x, i) => {
      const y = lb[i];
      const sameId = x.itemId === y.itemId;
      const sameQty = Math.abs((Number(x.quantity) || 0) - (Number(y.quantity) || 0)) < epsilon;
      const sameRate = Math.abs((Number(x.rate) || 0) - (Number(y.rate) || 0)) < epsilon;
      const sameRecv =
        (x.receivedQuantity === undefined || x.receivedQuantity === null) === (y.receivedQuantity === undefined || y.receivedQuantity === null) &&
        Math.abs((Number(x.receivedQuantity) || 0) - (Number(y.receivedQuantity) || 0)) < epsilon;
      return sameId && sameQty && sameRate && sameRecv;
    });
  }

  // ---------- hydration (display names re-resolved live from the masters) ----------

  private hydrateSale(sale: Sale): Sale {
    const party = this.data.parties.find((p) => p.id === sale.partyId);
    const hydrateLines = (lines?: SalesOrderItem[]): SalesOrderItem[] =>
      (lines || []).map((li) => {
        const master = this.findItemRaw(li.itemId);
        const unitId = li.unitId || master?.unitId;
        const unit = unitId
          ? this.data.units.find((u) => u.id === unitId)?.code || undefined
          : master?.unit;
        const location = li.locationId
          ? this.data.locations.find((l) => l.id === li.locationId)?.name
          : undefined;
        return {
          ...li,
          itemName: master?.name,
          itemCode: master?.code,
          unit,
          location,
          amount: (Number(li.quantity) || 0) * (Number(li.rate) || 0),
        };
      });
    const stages: SalesOrderStage[] = (sale.stages || []).map((st) => ({
      ...st,
      items: hydrateLines(st.items),
    }));
    // Sale.items = the CURRENT (latest) stage's line set; falls back to the
    // master-level rows for legacy data that predates stage scoping.
    const latestStage = stages.length > 0 ? stages[stages.length - 1] : undefined;
    const items: SalesOrderItem[] =
      latestStage && (latestStage.items || []).length > 0
        ? (latestStage.items as SalesOrderItem[])
        : hydrateLines(sale.items);
    return {
      ...sale,
      partyName: party ? (party.tradeName || party.name) : undefined,
      items,
      stages,
      // Dispatch attachment hydration (Golden Rule §2): vehicle number + the
      // truck's CURRENT driver join from the fleet/employees masters at read.
      vehicleNo: sale.vehicleId
        ? this.data.vehicles.find((v) => v.id === sale.vehicleId)?.vehicleNo || sale.vehicleNo
        : sale.vehicleNo,
      driverName: sale.vehicleId
        ? (() => {
            const veh = this.data.vehicles.find((v) => v.id === sale.vehicleId);
            return veh?.currentDriverId
              ? this.data.employees.find((e) => e.id === veh.currentDriverId)?.name || undefined
              : undefined;
          })()
        : sale.driverName,
      // Load weight — the persisted ORDER-LEVEL (one common) value is the
      // authority; legacy per-line rows fall back to their line-weight sum.
      weightTonnes: sale.weightTonnes !== undefined
        ? sale.weightTonnes
        : items.reduce((sum, li) => sum + (Number((li as any).weightTonnes) || 0), 0) || undefined,
      // Legacy derive: pre-flow rows have no settlementType — a settlement
      // voucher means the account flow was applied (mirrors the MySQL backfill).
      settlementType: sale.settlementType ?? (sale.settlementVoucherId ? 'account' : undefined),
      // Settlement display fields (Golden Rule §2 — JOINed, never persisted)
      settlementAccountName: sale.settlementAccountId
        ? (this.data.accounts || []).find((a) => a.id === sale.settlementAccountId)?.name
        : undefined,
      invoiceVoucherNumber: sale.invoiceVoucherId
        ? (this.data.transactions || []).find((t) => t.id === sale.invoiceVoucherId)?.voucherNumber
        : undefined,
      settlementVoucherNumber: sale.settlementVoucherId
        ? (this.data.transactions || []).find((t) => t.id === sale.settlementVoucherId)?.voucherNumber
        : undefined,
    };
  }

  private hydratePurchase(purchase: Purchase): Purchase {
    const party = purchase.partyId
      ? this.data.parties.find((p) => p.id === purchase.partyId)
      : undefined;
    const items: PurchaseOrderItem[] = (purchase.items || []).map((li) => {
      const master = this.findItemRaw(li.itemId);
      const unitId = li.unitId || master?.unitId;
      const unit = unitId
        ? this.data.units.find((u) => u.id === unitId)?.code || undefined
        : master?.unit;
      const location = li.locationId
        ? this.data.locations.find((l) => l.id === li.locationId)?.name
        : undefined;
      const ordered = Number(li.quantity) || 0;
      const recv = li.receivedQuantity !== undefined && li.receivedQuantity !== null ? Number(li.receivedQuantity) : undefined;
      return {
        ...li,
        itemName: master?.name,
        itemCode: master?.code,
        unit,
        location,
        receivedQuantity: recv,
        shortageQuantity: recv !== undefined && recv < ordered ? ordered - recv : undefined,
        overageQuantity: recv !== undefined && recv > ordered ? recv - ordered : undefined,
        amount: ordered * (Number(li.rate) || 0),
      };
    });
    return {
      ...purchase,
      partyName: party ? (party.tradeName || party.name) : undefined,
      items,
      stages: [...(purchase.stages || [])],
      // Legacy derive: pre-flow rows have no settlementType — a settlement
      // voucher means the account flow was applied (mirrors the MySQL backfill).
      settlementType: purchase.settlementType ?? (purchase.settlementVoucherId ? 'account' : undefined),
      // Settlement display fields (Golden Rule §2 — JOINed, never persisted)
      settlementAccountName: purchase.settlementAccountId
        ? (this.data.accounts || []).find((a) => a.id === purchase.settlementAccountId)?.name
        : undefined,
      invoiceVoucherNumber: purchase.invoiceVoucherId
        ? (this.data.transactions || []).find((t) => t.id === purchase.invoiceVoucherId)?.voucherNumber
        : undefined,
      settlementVoucherNumber: purchase.settlementVoucherId
        ? (this.data.transactions || []).find((t) => t.id === purchase.settlementVoucherId)?.voucherNumber
        : undefined,
    };
  }

  // ---------- line normalization: FKs only, resolved from the masters ----------

  private normalizeSaleItemLines(saleId: string, input: SalesOrderItemInput[], stageId?: string): SalesOrderItem[] {
    const now = new Date().toISOString();
    return (input || [])
      .map((li) => {
        const master = this.findItemRaw(li.itemId);
        // TRACKABLE (asset) lines ship REGISTER UNITS: the serial selection IS
        // the line — quantity equals the number of chosen units, and at least
        // one unit must ride every asset line (an unscoped asset sale would
        // tell stock nothing at all).
        const rawUnitIds = Array.isArray(li.unitIds) ? li.unitIds.filter(Boolean) : [];
        if (master?.type === 'asset') {
          if (rawUnitIds.length === 0) {
            throw new Error(`Select the serial unit(s) for line "${li.itemName || master.name}" — a trackable item is sold per physical unit.`);
          }
          if (rawUnitIds.length !== new Set(rawUnitIds).size) {
            throw new Error(`Duplicate unit selection on line "${li.itemName || master.name}".`);
          }
          for (const uid of rawUnitIds) {
            const unit = this.data.inventoryUnits?.find((u) => u.id === uid);
            if (!unit) throw new Error(`Selected unit no longer exists on line "${li.itemName || master.name}" — refresh and pick again.`);
            if (unit.itemId !== li.itemId) throw new Error(`Unit ${unit.serialNumber} does not belong to "${master.name}" — pick units of the line's own item.`);
            if (unit.status === 'sold') throw new Error(`Unit ${unit.serialNumber} is already sold.`);
            if (unit.status === 'scrapped') throw new Error(`Unit ${unit.serialNumber} was scrapped — it cannot be sold.`);
          }
        }
        const unitCount = master?.type === 'asset' ? rawUnitIds.length : (Number(li.quantity) || 0);
        if (!li.itemId || unitCount <= 0) return null;
        const quantity = unitCount;
        const rate = Number(li.rate) || 0;
        const locationId = li.locationId || this.resolveLocationIdFromName(li.locationName);
        return {
          id: `soi-${saleId}-${Math.random().toString(36).slice(2, 10)}`,
          saleId,
          stageId: stageId,
          itemId: li.itemId,
          unitId: master?.unitId || this.resolveUnitIdFromCode(master?.unit),
          quantity,
          rate,
          weightTonnes: Number((li as any).weightTonnes) > 0 ? Number((li as any).weightTonnes) : undefined,
          amount: quantity * rate,
          gstRate: li.gstRate ?? master?.taxRateGst ?? 0,
          locationId,
          itemNotes: li.itemNotes,
          ...(master?.type === 'asset' ? { unitIds: rawUnitIds } : {}),
          // PRODUCE-&-SELL-DIRECTLY: the line flag rides the sale (the run
          // configuration itself lives on the production_batches row)
          produceDirect: Boolean(li.produceDirect),
          // One-shot run config (NOT persisted on the line — the run row is
          // the record; it rides creation/edit payloads to the run factory)
          ...((li as any).production ? { production: (li as any).production } : {}),
          createdAt: now,
        } as unknown as SalesOrderItem;
      })
      .filter((li): li is SalesOrderItem => li !== null);
  }

  private normalizePurchaseItemLines(purchaseId: string, input: PurchaseOrderItemInput[]): PurchaseOrderItem[] {
    const now = new Date().toISOString();
    return (input || [])
      .filter((li) => li.itemId && Number(li.quantity) > 0)
      .map((li) => {
        const master = this.findItemRaw(li.itemId);
        const locationId = li.locationId || this.resolveLocationIdFromName(li.locationName);
        // SERIALIZED line (2026-11-16): an asset line IS one physical unit —
        // quantity is fixed at 1 (more units = more lines), and the unit's
        // entry (serial + declared-key values) rides the line.
        const serialized = master?.type === 'asset';
        const ordered = serialized ? 1 : (Number(li.quantity) || 0);
        const rate = Number(li.rate) || 0;
        const recv = serialized ? undefined : (li.receivedQuantity !== undefined && li.receivedQuantity !== null
          ? Number(li.receivedQuantity)
          : undefined);
        const rawEntry = (li as any).unitEntry as { serialNumber?: string; attributes?: Record<string, string | number> } | undefined;
        const serial = serialized ? String(rawEntry?.serialNumber || '').trim() : undefined;
        const cleanEntry: PurchaseOrderItem['unitEntry'] = serialized
          ? (serial
            ? { serialNumber: serial, ...(rawEntry?.attributes && typeof rawEntry.attributes === 'object' ? { attributes: rawEntry.attributes } : {}) }
            : undefined)
          : undefined;
        if (serialized && !serial) {
          throw new Error(`Enter the serial number for line "${master?.name || li.itemId}" — a serialized purchase line carries exactly ONE unit.`);
        }
        if (serialized && li.receivedQuantity !== undefined && li.receivedQuantity !== null && Number(li.receivedQuantity) > 1) {
          throw new Error(`A serialized line ("${master?.name}") receives exactly one unit — add more lines to receive more units.`);
        }
        return {
          id: `poi-${purchaseId}-${Math.random().toString(36).slice(2, 10)}`,
          purchaseId,
          itemId: li.itemId,
          unitId: master?.unitId || this.resolveUnitIdFromCode(master?.unit),
          quantity: ordered,
          rate,
          amount: ordered * rate,
          gstRate: li.gstRate ?? master?.taxRateGst ?? 0,
          locationId,
          receivedQuantity: recv,
          shortageQuantity: recv !== undefined && recv < ordered ? ordered - recv : undefined,
          overageQuantity: recv !== undefined && recv > ordered ? recv - ordered : undefined,
          itemNotes: li.itemNotes,
          ...(cleanEntry ? { unitEntry: cleanEntry } : {}),
          createdAt: now,
        } as unknown as PurchaseOrderItem;
      });
  }

  // ---------- stock application (ONCE per master, toggle-gated) ----------

  /**
   * Posts the sale's dispatch movements (one sale_dispatch row per line,
   * FIFO: adjustItemStock records the blended consumed rate). Guarded by the
   * master's inventory_applied flag — the toggle can never double-post.
   */
  public applySaleInventory(sale: Sale, referenceNumber?: string, force = false, actorId?: string): boolean {
    if (sale.inventoryApplied && !force) return false;
    // TRACKABLE lines: their register units flip to SOLD here (sale FK on the
    // unit + a 'sold' event) — no ledger movement applies to asset items.
    const assetUnitIds = (sale.items || [])
      .filter((li) => this.findItemRaw(li.itemId)?.type === 'asset')
      .flatMap((li) => li.unitIds || []);
    if (assetUnitIds.length > 0) {
      try {
        this.markUnitsSold(assetUnitIds, sale.id, `Sold against sale ${sale.saleNumber}${referenceNumber && referenceNumber !== sale.saleNumber ? ` (${referenceNumber})` : ''}`, actorId);
      } catch (e: any) {
        console.error(`[DB] Unit sale failed for sale ${sale.saleNumber}:`, e.message);
      }
    }
    for (const li of sale.items || []) {
      const master = this.findItemRaw(li.itemId);
      if (!master) {
        console.error(`[DB] Sale inventory: item ${li.itemId} not found for sale ${sale.saleNumber}`);
        continue;
      }
      if (master.type === 'asset') continue; // register-managed — no aggregate movement
      // PRODUCE-&-SELL-DIRECTLY line: its output was manufactured off the
      // sale-bound run and never entered stock — no dispatch outward posts
      // (the run carries the raw-material consumption instead; see
      // syncSaleDirectRuns).
      if (li.produceDirect) continue;
      const locName = li.locationId
        ? this.data.locations.find((l) => l.id === li.locationId)?.name
        : undefined;
      try {
        this.adjustItemStock(
          li.itemId,
          -Math.abs(Number(li.quantity) || 0),
          'sale_dispatch',
          referenceNumber || sale.saleNumber,
          `Sales dispatch against ${sale.saleNumber}`,
          locName,
          sale.partyId,
          undefined, // outward: FIFO blended consumption rate is computed by the funnel
          sale.id
        );
      } catch (e: any) {
        console.error(`[DB] Failed to dispatch item ${li.itemId} for sale ${sale.saleNumber}:`, e.message);
      }
    }
    return true;
  }

  /**
   * Releases every unit this sale sold (status 'sold' + saleId), back to
   * in-stock — the edit-compensation / cancel path calls this before the
   * (possibly edited) line set re-applies. A unit that meanwhile changed
   * hands elsewhere keeps its new state (release only what still points here).
   */
  private releaseUnitsFromSale(sale: Sale, reason: string, actorId?: string): void {
    const owned = (this.data.inventoryUnits || []).filter(
      (u) => u.saleId === sale.id && u.status === 'sold'
    );
    for (const unit of owned) {
      unit.status = 'in_stock';
      unit.saleId = undefined;
      unit.vehicleId = undefined;
      unit.position = undefined;
      unit.updatedAt = new Date().toISOString();
      this.postUnitEvent(unit, 'returned', { notes: `${reason} ${sale.saleNumber} — unit re-entered the register`, saleId: undefined }, actorId);
      this.logAudit('UPDATE', 'INVENTORY_UNIT', unit.id, `Unit ${unit.serialNumber} released back to register (${reason.trim()})`);
      liveSyncInventoryUnit(unit);
    }
  }

  /**
   * Compensates EVERY sale_dispatch row posted for this sale by writing
   * dispatch_reversal rows that re-enter stock at the FIFO blended rate the
   * original movement actually consumed (its recorded `rate`). Reversals are
   * matched to their originals by referenceNumber = original movement id —
   * append-only ledger stays idempotent (an already-reversed dispatch is never
   * reversed twice).
   */
  public unapplySaleInventory(sale: Sale, reason = 'Reversal of sales dispatch', actorId?: string): void {
    // TRACKABLE units first: release what this sale holds before reversing
    // the product movements.
    this.releaseUnitsFromSale(sale, reason, actorId);
    const originals = (this.data.stockMovements || []).filter(
      (m) => m.referenceId === sale.id && m.type === 'sale_dispatch'
    );
    const reversalKeys = new Set(
      (this.data.stockMovements || [])
        .filter((m) => m.type === 'dispatch_reversal' && m.referenceId === sale.id)
        .map((m) => m.referenceNumber)
    );
    for (const original of originals) {
      if (reversalKeys.has(original.id)) continue;
      const master = this.findItemRaw(original.itemId);
      const locName =
        original.locationId
          ? master?.locations?.find((l) => l.locationId === original.locationId)?.locationName ||
            this.data.locations.find((l) => l.id === original.locationId)?.name
          : undefined;
      try {
        this.adjustItemStock(
          original.itemId,
          Math.abs(Number(original.quantity) || 0),
          'dispatch_reversal',
          original.id, // reversal key: matching original movement id (idempotency)
          `${reason} ${sale.saleNumber} (doc ${original.referenceNumber || '—'})`,
          locName,
          sale.partyId,
          Number(original.rate) > 0 ? Number(original.rate) : undefined, // re-enter at the consumed FIFO rate
          sale.id
        );
      } catch (e: any) {
        console.error(`[DB] Failed to reverse sale dispatch ${original.id}:`, e.message);
      }
    }
  }

  // ---------- PRODUCE & SELL DIRECTLY (2026-11-16) ----------
  // A sales-order line may carry produceDirect: its output is manufactured by
  // a production run BOUND TO THE SALE (production_batches.sale_id +
  // sale_item_id). Client rules (2026-11-16):
  //   - raw MATERIALS still leave stock (FIFO outward, exactly like the
  //     Production module) — only the OUTPUT lot inward and the sale's own
  //     dispatch outward are skipped (the output never sits in stock);
  //   - the run's quantity is LOCKED to the sale line's quantity;
  //   - the recipe is THE item's single batch mix (one recipe per output item
  //     is strict — createBatchMix/updateBatchMix enforce it);
  //   - runs are BOUND TO THE SALE: an edit reconciles them per line (tearing
  //     down + recreating changed lines with consumption reversal), a
  //     cancellation/deletion removes them (reversing consumption), and while
  //     the sale's dispatch stands a bound run cannot be deleted from the
  //     Production module.

  /**
   * Reconciles the production runs bound to `sale` with the sale's current
   * produceDirect lines. Runs whose line is gone or changed (item/quantity)
   * are torn down — consumption reversed at the recorded rates — and the
   * fresh line set gets new runs while `apply` is true (the run exists only
   * while the sale's dispatch stands; quotation-stage sales keep none).
   * Runs claim their lines by exact line id first, then by an
   * (item, quantity) fingerprint: a master edit regenerates every line id,
   * but an UNTOUCHED produce-direct line must not churn its run (its raw
   * materials would needlessly re-consume, reshuffling the FIFO lots).
   */
  private syncSaleDirectRuns(sale: Sale, apply: boolean, actorId?: string): void {
    const items = sale.items || [];
    const directLines = items.filter((li) => li.produceDirect && (Number(li.quantity) || 0) > 0);
    const unlinked = new Set(directLines.map((li) => li.id));
    const matches = (line: SalesOrderItem, run: ProductionBatchRun) =>
      line.itemId === run.targetItemId &&
      Math.abs((Number(line.quantity) || 0) - Number(run.targetQuantity)) <= 0.0001;
    const current = (this.data.productionBatches || []).filter((b) => b.saleId === sale.id);
    for (const run of current) {
      let line = run.saleItemId
        ? directLines.find((li) => li.id === run.saleItemId)
        : undefined;
      if (!line || !matches(line, run)) {
        line = directLines.find((li) => unlinked.has(li.id) && matches(li, run));
      }
      if (line) {
        // Keep + re-link (the line id may have been regenerated by an edit).
        run.saleItemId = line.id;
        liveSyncBatch(run);
        unlinked.delete(line.id);
        continue;
      }
      this.reverseDirectRunConsumption(run, sale);
      this.data.productionBatches = (this.data.productionBatches || []).filter((b) => b.id !== run.id);
      liveSyncBatch(run, true);
      this.logAudit('DELETE', 'PRODUCTION_BATCH', run.id, `Direct-sale run ${run.batchNumber} torn down with sale ${sale.saleNumber} (line changed) — raw-material consumption reversed`);
    }
    if (!apply) return;
    for (const line of directLines) {
      if (!unlinked.has(line.id)) continue;
      this.createDirectSaleRun(sale, line, actorId);
    }
  }

  /**
   * Records the direct-sale run for ONE sale line: quantity locked to the
   * line, recipe resolved to the item's single batch mix (client may pass an
   * explicit batchMixId in the line's `production` config — validated to be
   * the item's own), sourcing locations from `production.itemLocations`.
   * Throws when the item has no recipe — the caller aborts the whole sale
   * (nothing half-posts).
   */
  private createDirectSaleRun(sale: Sale, line: SalesOrderItem, actorId?: string): ProductionBatchRun {
    const item = this.findItemRaw(line.itemId);
    if (!item) throw new Error(`Produce-direct line: item ${line.itemId} no longer exists in the items master.`);
    const cfg = ((line as any).production || {}) as {
      date?: string;
      supervisorName?: string;
      mixTemperatureCelsius?: number;
      notes?: string;
      batchMixId?: string;
      itemLocations?: Array<{ itemId: string; locationId?: string; locationName?: string }>;
    };
    let mix = cfg.batchMixId
      ? (this.data.batchMixes || []).find((m) => m.id === cfg.batchMixId)
      : (this.data.batchMixes || []).find((m) => m.outputItemId === line.itemId && m.isActive !== false);
    if (mix && mix.outputItemId !== line.itemId) {
      throw new Error(`Recipe ${mix.mixNumber} (${mix.name}) does not produce "${item.name}" — the run's recipe must match the sale line's item.`);
    }
    // Defensive fallbacks: exactly one ACTIVE mix is the rule, but a legacy
    // all-inactive item still gets its recipe resolved (latest created).
    if (!mix) {
      const itemMixes = (this.data.batchMixes || []).filter((m) => m.outputItemId === line.itemId);
      if (itemMixes.length === 0) {
        throw new Error(`No recipe (batch mix) exists for "${item.name}" — create one in the Production module first.`);
      }
      mix = itemMixes[0];
    }
    if (mix.isActive === false) {
      throw new Error(`Recipe ${mix.mixNumber} (${mix.name}) is inactive — reactivate it before producing for ${sale.saleNumber}.`);
    }
    return this.createProductionBatch({
      batchMixId: mix.id,
      targetQuantity: Math.abs(Number(line.quantity) || 0),
      date: cfg.date || sale.date,
      supervisorName: cfg.supervisorName || 'Plant Supervisor',
      mixTemperatureCelsius: cfg.mixTemperatureCelsius,
      notes: cfg.notes?.trim() || `Produced directly for sale ${sale.saleNumber} — output dispatched to ${this.data.parties.find((p) => p.id === sale.partyId)?.name || 'the party'} without stocking.`,
      itemLocations: cfg.itemLocations || [],
      saleId: sale.id,
      saleItemId: line.id,
      directSale: true,
      skipOutputLot: true,
    }, actorId);
  }

  /**
   * Reverses a direct-sale run's raw-material consumption: every
   * production_consumed row posted for the run re-enters stock at its
   * recorded FIFO rate (a production_consumed_reversal keyed on the original
   * movement id — append-only ledger stays idempotent).
   */
  private reverseDirectRunConsumption(run: ProductionBatchRun, sale: Sale): void {
    const originals = (this.data.stockMovements || []).filter(
      (m) => m.referenceId === run.id && m.type === 'production_consumed'
    );
    const reversalKeys = new Set(
      (this.data.stockMovements || [])
        .filter((m) => m.type === 'production_consumed_reversal' && m.referenceId === sale.id)
        .map((m) => m.referenceNumber)
    );
    for (const original of originals) {
      if (reversalKeys.has(original.id)) continue;
      const master = this.findItemRaw(original.itemId);
      const locName = original.locationId
        ? master?.locations?.find((l) => l.locationId === original.locationId)?.locationName ||
          this.data.locations.find((l) => l.id === original.locationId)?.name
        : undefined;
      try {
        this.adjustItemStock(
          original.itemId,
          Math.abs(Number(original.quantity) || 0),
          'production_consumed_reversal',
          original.id, // reversal key: matching original movement id (idempotency)
          `Consumption reversal of run ${run.batchNumber} (sale ${sale.saleNumber})`,
          locName,
          undefined,
          Number(original.rate) > 0 ? Number(original.rate) : undefined, // re-enter at the consumed FIFO rate
          sale.id
        );
      } catch (e: any) {
        console.error(`[DB] Failed to reverse production consumption ${original.id}:`, e.message);
      }
    }
  }

  /**
   * Tear down EVERY production run bound to this sale (sale deletion /
   * cancellation) — consumption reversed at the recorded rates.
   */
  private removeSaleDirectRuns(sale: Sale, reason: string): void {
    const runs = (this.data.productionBatches || []).filter((b) => b.saleId === sale.id);
    for (const run of runs) {
      this.reverseDirectRunConsumption(run, sale);
      this.data.productionBatches = (this.data.productionBatches || []).filter((b) => b.id !== run.id);
      liveSyncBatch(run, true);
      this.logAudit('DELETE', 'PRODUCTION_BATCH', run.id, `Direct-sale run ${run.batchNumber} removed (${reason} ${sale.saleNumber}) — raw-material consumption reversed`);
    }
  }

  /**
   * Posts the purchase's inward movements (receivedQuantity at GRN, ordered
   * quantity otherwise; every line enters a FIFO lot at its own rate).
   */
  // ---------- SERIALISED PURCHASE (2026-11-16) ----------
  // An asset line on a purchase IS one physical unit. When a stage save (PO or
  // GRN) or a master edit carries serial numbers, the reconcile creates the
  // register unit per line — supplier = the purchase's vendor, purchase date =
  // the stage date, cost = the line rate — and removes units whose serial left
  // the line set while they still sit untouched in stock (nothing deployed /
  // sold / scrapped is ever removed).

  /** Creates (idempotently) the ONE unit a serialized line carries. */
  private createPurchaseUnit(
    purchase: Purchase,
    li: PurchaseOrderItem,
    stageDate: string,
    actorId?: string
  ): void {
    const item = this.findItemRaw(li.itemId);
    if (!item || item.type !== 'asset' || !li.unitEntry) return;
    const existing = (this.data.inventoryUnits || []).find(
      (u) => u.itemId === li.itemId &&
        String(u.serialNumber).trim().toLowerCase() === li.unitEntry!.serialNumber.toLowerCase()
    );
    if (existing) {
      if (existing.purchaseId === purchase.id) return; // re-save — already registered
      throw new Error(`Serial "${li.unitEntry.serialNumber}" of ${item.name} is already registered to ${existing.purchaseId ? 'another purchase' : 'the register'} — enter a different serial.`);
    }
    // Validate the declared-key values against the item's key list
    this.validateUnitAttributes({ attributes: li.unitEntry.attributes || {} }, li.itemId);
    const now = new Date().toISOString();
    const unit = this.createInventoryUnit({
      itemId: li.itemId,
      serialNumber: li.unitEntry.serialNumber,
      purchaseId: purchase.id,
      supplierId: purchase.partyId || undefined, // auto: the purchase's vendor
      purchaseDate: purchase.date || stageDate,   // auto: the document date
      purchaseCost: Number(li.rate) > 0 ? Number(li.rate) : undefined, // auto: the line rate
      attributes: li.unitEntry.attributes || {},
      entryNotes: `Registered against purchase ${purchase.purchaseNumber}`,
    }, actorId);
    this.logAudit('CREATE', 'INVENTORY_UNIT', unit.id, `Unit ${unit.serialNumber} of ${item.name} registered from purchase ${purchase.purchaseNumber}`);
  }

  /** Reconciles ALL serialized lines of a purchase against the register. */
  private syncPurchaseSerializedUnits(purchase: Purchase, stageDate?: string, actorId?: string): void {
    const desired = new Map<string, string>(); // serial → line id
    for (const li of purchase.items || []) {
      const item = this.findItemRaw(li.itemId);
      if (item?.type !== 'asset' || !li.unitEntry) continue;
      desired.set(li.unitEntry.serialNumber.trim().toLowerCase(), li.id);
      try {
        this.createPurchaseUnit(purchase, li, stageDate || purchase.date, actorId);
      } catch (e: any) {
        // A duplicate/bad serial fails the save with a clear message
        throw new Error(`Purchase ${purchase.purchaseNumber}: ${e.message}`);
      }
    }
    // Cleanup: units bound to THIS purchase whose serial left the line set,
    // and which never moved beyond 'entered' in stock (life history is kept).
    const live = (this.data.inventoryUnits || []).filter(
      (u) => u.purchaseId === purchase.id && !desired.has(String(u.serialNumber).trim().toLowerCase())
    );
    for (const unit of live) {
      if (unit.status !== 'in_stock') continue; // deployed/sold — never removed here
      const events = (this.data.inventoryUnitEvents || []).filter((e) => e.unitId === unit.id);
      const lifecycle = events.some((e) => e.type !== 'entered');
      if (lifecycle) continue;
      this.logAudit('DELETE', 'INVENTORY_UNIT', unit.id, `Unit ${unit.serialNumber} removed — its serialized line left purchase ${purchase.purchaseNumber}`);
      this.data.inventoryUnits = (this.data.inventoryUnits || []).filter((u) => u.id !== unit.id);
      this.data.inventoryUnitEvents = (this.data.inventoryUnitEvents || []).filter((e) => e.unitId !== unit.id);
      liveSyncInventoryUnit(unit, true);
    }
    if (live.length > 0) this.save();
  }

  /** Purchase cancellation/deletion: untouched units registered by it go away. */
  private removePurchaseUnits(purchase: Purchase, reason: string): void {
    const live = (this.data.inventoryUnits || []).filter(
      (u) => u.purchaseId === purchase.id && u.status === 'in_stock'
    );
    for (const unit of live) {
      const lifecycle = (this.data.inventoryUnitEvents || []).some((e) => e.unitId === unit.id && e.type !== 'entered');
      if (lifecycle) continue; // deployed/sold history — keep the audit trail
      this.logAudit('DELETE', 'INVENTORY_UNIT', unit.id, `Unit ${unit.serialNumber} removed (${reason} ${purchase.purchaseNumber})`);
      this.data.inventoryUnits = (this.data.inventoryUnits || []).filter((u) => u.id !== unit.id);
      this.data.inventoryUnitEvents = (this.data.inventoryUnitEvents || []).filter((e) => e.unitId !== unit.id);
      liveSyncInventoryUnit(unit, true);
    }
    if (live.length > 0) this.save();
  }

  public applyPurchaseInventory(purchase: Purchase, referenceNumber?: string, force = false): boolean {
    if (purchase.inventoryApplied && !force) return false;
    for (const li of purchase.items || []) {
      const master = this.findItemRaw(li.itemId);
      if (!master) {
        console.error(`[DB] Purchase inventory: item ${li.itemId} not found for purchase ${purchase.purchaseNumber}`);
        continue;
      }
      // SERIALIZED lines (2026-11-16): an asset item carries NO aggregate stock
      // — its unit already entered the register via syncPurchaseSerializedUnits.
      if (master.type === 'asset') continue;
      const locName = li.locationId
        ? this.data.locations.find((l) => l.id === li.locationId)?.name
        : undefined;
      const qty = li.receivedQuantity !== undefined && li.receivedQuantity !== null
        ? Number(li.receivedQuantity)
        : Number(li.quantity) || 0;
      try {
        this.adjustItemStock(
          li.itemId,
          Math.abs(qty),
          'purchase_inward',
          referenceNumber || purchase.purchaseNumber,
          `Goods inward against ${purchase.purchaseNumber}`,
          locName,
          purchase.partyId,
          Number(li.rate) > 0 ? Number(li.rate) : undefined, // inward enters its lot at the line rate
          purchase.id
        );
      } catch (e: any) {
        console.error(`[DB] Failed to receive item ${li.itemId} for purchase ${purchase.purchaseNumber}:`, e.message);
      }
    }
    return true;
  }

  /**
   * Compensates EVERY purchase_inward row posted for this purchase by writing
   * inward_reversal rows that consume the previously-entered lot value (out at
   * the original line rate). Matching key: reversal.referenceNumber = original
   * movement id (reversal must consume that exact lot's cost).
   */
  public unapplyPurchaseInventory(purchase: Purchase, reason = 'Reversal of goods inward'): void {
    const originals = (this.data.stockMovements || []).filter(
      (m) => m.referenceId === purchase.id && m.type === 'purchase_inward'
    );
    const reversalKeys = new Set(
      (this.data.stockMovements || [])
        .filter((m) => m.type === 'inward_reversal' && m.referenceId === purchase.id)
        .map((m) => m.referenceNumber)
    );
    for (const original of originals) {
      if (reversalKeys.has(original.id)) continue;
      const master = this.findItemRaw(original.itemId);
      const locName =
        original.locationId
          ? master?.locations?.find((l) => l.locationId === original.locationId)?.locationName ||
            this.data.locations.find((l) => l.id === original.locationId)?.name
          : undefined;
      try {
        this.adjustItemStock(
          original.itemId,
          -Math.abs(Number(original.quantity) || 0),
          'inward_reversal',
          original.id,
          `${reason} ${purchase.purchaseNumber} (doc ${original.referenceNumber || '—'})`,
          locName,
          purchase.partyId,
          Number(original.rate) > 0 ? Number(original.rate) : undefined,
          purchase.id
        );
      } catch (e: any) {
        console.error(`[DB] Failed to reverse purchase inward ${original.id}:`, e.message);
      }
    }
  }

  // ---------- MySQL sync fire-and-forget wrappers ----------

  private syncSaleToMysql(sale: Sale, isDelete = false): void {
    liveSyncSale(sale, isDelete);
    if (!isDelete) {
      // Stage-scoped rows: every stage's item set is synced (rows carry
      // stageId); sale.items alone would only cover the current stage.
      const allStageItems = (sale.stages || []).flatMap((st) => st.items || []);
      liveSyncSaleItems(sale.id, allStageItems.length > 0 ? allStageItems : (sale.items || []), false);
      liveSyncSaleStages(sale.id, sale.stages || [], false);
    }
  }

  private syncPurchaseToMysql(purchase: Purchase, isDelete = false): void {
    liveSyncPurchase(purchase, isDelete);
    if (!isDelete) {
      liveSyncPurchaseItems(purchase.id, purchase.items || [], false);
      liveSyncPurchaseStages(purchase.id, purchase.stages || [], false);
    }
  }

  // ---------- SALES ----------

  /** Sales fetch (Golden fetch-rule, 2026-10-28): soft-deleted rows
   *  (status 'deleted') never surface in the sales feature. */
  private isVisibleSale(s: Sale): boolean {
    return s.status !== 'deleted';
  }

  public getSales(): Sale[] {
    return (this.data.sales || [])
      .filter((s) => this.isVisibleSale(s))
      .map((s) => this.hydrateSale(s));
  }

  public getSaleById(id: string): Sale | undefined {
    const sale = (this.data.sales || []).find((s) => s.id === id && this.isVisibleSale(s));
    return sale ? this.hydrateSale(sale) : undefined;
  }

  public createSale(data: any, actorId?: string): Sale {
    const saleId = data.id || `sale-${this.nextLedgerMs()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const transportCharges = Number(data.transportCharges) || 0;

    const stageInput: SalesOrderStageInput = data.stage || {
      stageType: 'sales_order',
      stageNumber: data.saleNumber,
      date: data.date,
    };
    const firstStageType = stageInput.stageType || 'sales_order';
    let masterNumber = data.saleNumber || stageInput.stageNumber || '';
    // RST minting: a sales_order master without a number gets the next
    // simple serial (quotation/invoice-first sales keep the client's QUO-/INV-…)
    if (!masterNumber && firstStageType === 'sales_order') {
      masterNumber = this.nextRstNumber();
    }
    if (!masterNumber) masterNumber = `SALE-${Date.now().toString().slice(-8)}`;
    // RST uniqueness: a bare serial must never collide with an existing sale
    // (user-override protection; server-minted serials never clash)
    if (this.isBareSerial(masterNumber) &&
        (this.data.sales || []).some((s) => s.saleNumber === masterNumber)) {
      throw new Error(`RST number ${masterNumber} is already in use — choose a different RST number.`);
    }

    // The FIRST stage owns the item rows it is saved with (quotation /
    // sales_order / invoice — a new sale may start at any of the three).
    const firstStageId = `sos-${saleId}-${Math.random().toString(36).slice(2, 8)}`;
    const items = this.normalizeSaleItemLines(saleId, data.items || [], firstStageId);
    const total = this.computeStageTotals(items, transportCharges, data.freightGstRate || 0);
    const firstStage: SalesOrderStage = {
      id: firstStageId,
      saleId,
      stageType: stageInput.stageType || 'sales_order',
      stageNumber: stageInput.stageNumber || masterNumber,
      date: stageInput.date || data.date || now.split('T')[0],
      subtotal: total.subtotal,
      taxAmount: total.taxAmount,
      totalAmount: total.totalAmount,
      items,
      notes: stageInput.notes || data.notes,
      createdAt: now,
    };

    const sale: Sale = {
      id: saleId,
      saleNumber: masterNumber,
      partyId: data.partyId,
      date: data.date || now.split('T')[0],
      status: 'pending',
      notes: data.notes,
      // Dispatch attachment (FK authority — vehicleNo/driverName are legacy
      // string snapshots hydrated at read; see hydrateSale)
      vehicleId: data.vehicleId || undefined,
      siteAddress: data.siteAddress || undefined,
      distanceKm: data.distanceKm !== undefined && data.distanceKm !== null && Number(data.distanceKm) > 0
        ? Number(data.distanceKm)
        : undefined,
      // ONE load weight for the whole order (all items) — the trip slip's load
      weightTonnes: Number(data.weightTonnes) > 0 ? Number(data.weightTonnes) : undefined,
      vehicleNo: data.vehicleNo,
      driverName: data.driverName,
      transportCharges,
      // Fleet cost (priced PER SALE, never per vehicle): the checkbox rate is
      // ₹ per tonne per KM; transportCharges = weight × distance × rate
      freightRatePerTonne: Number(data.freightRatePerTonne) > 0 ? Number(data.freightRatePerTonne) : undefined,
      freightGstRate: Number((data as any).freightGstRate) > 0 ? Number((data as any).freightGstRate) : undefined,
      // Consolidated-invoice membership — server-managed flag (createSaleInvoice)
      isInvoiced: false,
      inventoryApplied: false,
      cashApplied: false,
      items,
      stages: [firstStage],
      createdAt: now,
      updatedAt: now,
    };

    // 2026-10-28 (CLIENT RULE, no toggle/no choice): EVERY money-stage first save
    // applies its stock AND books the flow as CREDIT — the sales_order stage and
    // the direct invoice both deduct stockyard inventory and post the credit
    // journal immediately (receivable rides the party ledger; receipt is
    // recorded later against the party). Quotations touch nothing.
    if (firstStage.stageType === 'sales_invoice' || firstStageType === 'sales_order') {
      // PRODUCE-&-SELL-DIRECTLY lines record their runs FIRST: a failed run
      // (no recipe / insufficient raw stock) aborts the whole sale so nothing
      // half-posts (client rule: the toggle promises produce + sell).
      this.syncSaleDirectRuns(sale, true, actorId);
      if (this.applySaleInventory(sale, firstStage.stageNumber, true, actorId)) {
        sale.inventoryApplied = true;
      }
      const askedType = (stageInput as any).settlementType;
      this.applySaleCash(sale, firstStage, {
        settle: false,
        type: 'credit',
        settlementAccountId: undefined,
        paymentMode: undefined,
      }, firstStage.stageType as SalesStage, actorId);
      this.logAudit('CREATE', 'SALE_CASH', saleId, `Forced flow on sale ${sale.saleNumber} at ${firstStage.stageType} (inventory forced; credit journal)${askedType && askedType !== 'credit' ? ` — client asked ${askedType}, overridden to credit` : ''}`);
    } else if (stageInput.updateCash) {
      this.logAudit('DISPATCH', 'SALE_CASH', saleId, `Cash application requested at ${firstStage.stageType} stage — applies at the sales-order stage`);
    }
    sale.status = this.computeSalesStatus(sale);
    // DONE-BY AUDIT (2026-11-21): the session user who registered the sale
    sale.createdById = actorId || (data as any).createdById;
    sale.updatedById = actorId || (data as any).updatedById;

    this.data.sales.unshift(sale);
    delete (sale as any).documentIds; // never persisted — linked below
    this.logAudit('CREATE', 'SALE', saleId, `Registered sale ${sale.saleNumber} (stage ${firstStage.stageType})`);
    this.save();
    this.syncSaleToMysql(sale);
    // Auto-derive the dispatch trip slip (sale ⇢ trip_slips via saleId; a
    // created sale always carries a vehicle — the UI enforces it)
    this.syncSaleTripSlip(sale);
    const createDocIds = this.extractDocumentIds(data);
    if (createDocIds.length > 0) this.linkOrderDocuments('sale', saleId, createDocIds);
    return this.hydrateSale(sale);
  }

  public updateSale(
    id: string,
    updates: Partial<Sale> & { items?: SalesOrderItemInput[]; updateInventory?: boolean },
    opts: { skipMysqlSync?: boolean; redateCurrentStage?: boolean } = {},
    actorId?: string
  ): Sale | null {
    const index = (this.data.sales || []).findIndex((s) => s.id === id);
    if (index === -1) {
      return this.createSale({ ...updates, id }, actorId);
    }
    const existing = this.data.sales[index];
    const stagesArr = existing.stages || [];
    const latestStage = stagesArr.length > 0 ? stagesArr[stagesArr.length - 1] : undefined;

    // INVOICE LOCK: once the sales_invoice stage is issued the sale is
    // immutable — no master edits, no item edits, no cancellation.
    if (latestStage?.stageType === 'sales_invoice') {
      throw new Error(`Sale ${existing.saleNumber} is locked (invoice issued) — nothing can be edited.`);
    }
    // CONSOLIDATED-INVOICE LOCK: member sales orders of a consolidated
    // invoice are frozen too (they cannot be edited out from under it).
    if ((existing as any).isInvoiced) {
      throw new Error(`Sale ${existing.saleNumber} is locked (included in a consolidated invoice) — nothing can be edited.`);
    }
    const wasCancelled = existing.status === 'cancelled';

    // Master-level fields (stages stay intact; items branch below scopes rows)
    // PARTY LOCK: the sale is bound to its party at creation — edits and
    // stage issuances can never change it (user rule; the UI also disables
    // the field after creation).
    if (updates.partyId !== undefined && updates.partyId !== existing.partyId) {
      this.logAudit('UPDATE', 'SALE', id, `Party change attempt ignored on ${existing.saleNumber} — sale is party-locked`);
    }
    existing.date = updates.date ?? existing.date;
    // ORDER DATE = STAGE DOCUMENT DATE (user rule): the stage document must
    // show the exact order date the user inserted — never the date the stage
    // row was created or last modified on. A master edit that inserts a date
    // therefore re-dates the edited (current/latest) stage document too;
    // stage ISSUANCE is exempt (the addSaleStageDirect composite pre-call —
    // a new stage carries its own newly inserted date).
    if (opts.redateCurrentStage && updates.date && latestStage) {
      latestStage.date = updates.date;
    }
    existing.notes = updates.notes ?? existing.notes;
    // Dispatch attachment: the vehicle FK is the authority — number/driver
    // snapshot strings hydrate from the fleet master at read (hydrateSale).
    existing.vehicleId = updates.vehicleId !== undefined ? (updates.vehicleId || undefined) : existing.vehicleId;
    existing.siteAddress = updates.siteAddress !== undefined ? (updates.siteAddress || undefined) : existing.siteAddress;
    existing.distanceKm = updates.distanceKm !== undefined
      ? (Number(updates.distanceKm) > 0 ? Number(updates.distanceKm) : undefined)
      : existing.distanceKm;
    // Order-level load weight (one common value for all items)
    existing.weightTonnes = updates.weightTonnes !== undefined
      ? (Number(updates.weightTonnes) > 0 ? Number(updates.weightTonnes) : undefined)
      : existing.weightTonnes;
    existing.vehicleNo = updates.vehicleNo ?? existing.vehicleNo;
    existing.driverName = updates.driverName ?? existing.driverName;
    existing.transportCharges = updates.transportCharges !== undefined
      ? Number(updates.transportCharges) || 0
      : existing.transportCharges;
    // Fleet-cost rate + slab always ride explicitly ('' from an unchecked box → 0)
    existing.freightRatePerTonne = (updates as any).freightRatePerTonne !== undefined
      ? (Number((updates as any).freightRatePerTonne) > 0 ? Number((updates as any).freightRatePerTonne) : undefined)
      : existing.freightRatePerTonne;
    existing.freightGstRate = (updates as any).freightGstRate !== undefined
      ? (Number((updates as any).freightGstRate) > 0 ? Number((updates as any).freightGstRate) : undefined)
      : existing.freightGstRate;
    existing.updatedAt = new Date().toISOString();

    // Master items replaced → the edit applies ONLY to the CURRENT (latest)
    // stage's rows: editing a quotation writes the quotation rows; editing a
    // sales order writes the sales-order rows while its sale's quotation rows
    // remain untouched (stage-scoped items). If stock was already applied,
    // compensate (reverse the old dispatches) and re-apply the new quantities.
    if (updates.items !== undefined) {
      const normalized = this.normalizeSaleItemLines(id, updates.items || [], latestStage?.id);
      const identical = this.areOrderItemLinesEqual(existing.items, normalized);
      existing.items = normalized;
      if (latestStage) {
        latestStage.items = normalized;
      }
      if (existing.inventoryApplied && !identical) {
        this.unapplySaleInventory(existing, 'Edit compensation for sale', actorId);
        if (this.applySaleInventory(existing, existing.saleNumber, true, actorId)) {
          existing.inventoryApplied = true;
        } else {
          existing.inventoryApplied = false;
        }
      }
      // Refresh the EDITED stage's document totals from the new prices/GST —
      // other stages keep their own (stage-scoped) figures.
      if (latestStage) {
        const refreshed = this.computeStageTotals(existing.items, Number(existing.transportCharges) || 0, existing.freightGstRate || 0);
        latestStage.subtotal = refreshed.subtotal;
        latestStage.taxAmount = refreshed.taxAmount;
        latestStage.totalAmount = refreshed.totalAmount;
      }
      // Voucher compensation on edit (user rule: money follows the document) —
      // the posted sale_invoice journal (party receivable leg) AND the payment
      // receipt (Cash/Bank leg, when settled) both resize to the edited total.
      if (!identical) {
        const refreshed = this.computeStageTotals(existing.items, Number(existing.transportCharges) || 0, existing.freightGstRate || 0);
        this.resizeVoucherAmounts(existing, refreshed.totalAmount, `Sale ${existing.saleNumber} edit`, 'SALE_CASH');
      }
    }

    // One-shot inventory application rides on the master EDIT: the edit form
    // shows the Deduct Stockyard Inventory switch (default OFF) — enabled only
    // while the dispatch has never posted (user rule for the edit-stage flow).
    if (updates.updateInventory && !existing.inventoryApplied) {
      if (this.applySaleInventory(existing, existing.saleNumber, false, actorId)) {
        existing.inventoryApplied = true;
      }
    }

    // PRODUCE-&-SELL-DIRECTLY: the bound runs follow the sale's line set —
    // changed lines tear down + recreate (consumption reversed at the recorded
    // rates) while the dispatch stands; a not-yet-applied sale (quotation
    // stages, or an edit that only now switched the dispatch on) reconciles
    // against the effective inventory_applied flag. A cancellation skips this
    // — its bound runs are removed wholesale just below.
    const cancellingNow = (updates as any).status === 'cancelled' && !wasCancelled;
    if (!cancellingNow) {
      this.syncSaleDirectRuns(existing, existing.inventoryApplied, actorId);
    }

    // Payment-flow switch on the master EDIT: a flow never applied at
    // creation can be chosen here (Sales Order stage). Applies once through
    // the shared settlement gate; a sale already carrying a flow ignores it.
    const editSettleType = (updates as any).settlementType as 'none' | 'credit' | 'account' | undefined;
    if (editSettleType && editSettleType !== 'none' && !existing.cashApplied && latestStage &&
        latestStage.stageType === 'sales_order') {
      // The flow applies at the CURRENT stage's totals and number — the
      // invoice stage cannot occur here (locked above).
      const settleStage: SalesOrderStage = {
        ...latestStage,
        subtotal: Number((updates as any).subtotal ?? latestStage.subtotal) || 0,
        taxAmount: Number((updates as any).taxAmount ?? latestStage.taxAmount) || 0,
        totalAmount: Number((updates as any).totalAmount ?? latestStage.totalAmount) || 0,
      };
      this.applySaleCash(existing, settleStage, {
        settle: editSettleType === 'account',
        type: editSettleType,
        settlementAccountId: (updates as any).settlementAccountId,
        paymentMode: (updates as any).paymentMode,
      }, latestStage.stageType as SalesStage, actorId);
      this.logAudit('CREATE', 'SALE_CASH', id, `Payment flow on sale ${existing.saleNumber} via edit at ${latestStage.stageType} (type=${editSettleType})`);
    }

    // Cancellation reverses the applied dispatch (policy: revisit with user)
    if (updates.status === 'cancelled' && !wasCancelled && existing.inventoryApplied) {
      this.unapplySaleInventory(existing, 'Cancellation reversal for sale', actorId);
      existing.inventoryApplied = false;
    }
    // A cancelled sale keeps no direct-sale runs — bound runs are removed and
    // their raw-material consumption reversed (runs exist only on live sales).
    if (updates.status === 'cancelled' && !wasCancelled) {
      this.removeSaleDirectRuns(existing, 'Cancellation of sale');
    }
    if (updates.status) existing.status = updates.status;
    existing.status = this.computeSalesStatus(existing);

    // DONE-BY AUDIT (2026-11-21): only a real actor moves updatedById; the
    // booking user (createdById) never changes on an edit.
    if (actorId && !existing.createdById) existing.createdById = actorId;
    if (actorId) existing.updatedById = actorId;
    this.logAudit('UPDATE', 'SALE', id, `Updated sale ${existing.saleNumber}`);
    this.save();
    // When a composite flow (e.g. addSaleStageDirect) follows this call with
    // its own sync, skip the intermediate write: two fire-and-forget REPLACEs
    // for one row race the connection pool and can land out of order, leaving
    // STALE flags (e.g. inventory_applied=0 while the stock already applied).
    if (!opts.skipMysqlSync) {
      this.syncSaleToMysql(existing);
    }
    // Keep the auto-derived trip slip in step (also on stage-issue composite
    // saves: the slip mirrors the effective stage's lines → weight sum)
    this.syncSaleTripSlip(existing);
    // Document links ride on the master-edit payload when present (idempotent)
    const editDocIds = this.extractDocumentIds(updates);
    if (editDocIds.length > 0) this.linkOrderDocuments('sale', id, editDocIds);
    return this.hydrateSale(existing);
  }

  /**
   * Issues the NEXT stage document for a sale. Stage ladder (2026-10-28):
   *   quotation     -> sales_order (item rows seeded as a copy of the
   *                    quotation's own rows or the caller's lines)
   *   sales_order   -> LOCKED ladder: no further RUNG — GST invoices are
   *                    consolidated separately (createSaleInvoice: one invoice
   *                    for N sales orders). Legacy 'sales_invoice' stage rows
   *                    still render (history) but can never be issued again.
   * Item rows are PER STAGE (sales_order_items.sales_order_stage_id): the new
   * stage keeps its own rows — either the caller's lines (stageInput.items)
   * or an exact copy of the current stage's lines — and previous stage values
   * remain untouched forever (a quotation cannot be edited after advancing).
   */
  public addSaleStage(id: string, stageInput: SalesOrderStageInput, actorId?: string): Sale | null {
    const sale = (this.data.sales || []).find((s) => s.id === id);
    if (!sale) return null;
    const stagesArr = sale.stages || [];
    const latest = stagesArr.length > 0 ? stagesArr[stagesArr.length - 1] : undefined;
    const currentType = latest?.stageType || 'quotation';

    if (currentType === 'sales_invoice') {
      throw new Error(`Sale ${sale.saleNumber} is locked (invoice issued) — no further stage documents can be added.`);
    }
    if ((sale as any).isInvoiced) {
      throw new Error(`Sale ${sale.saleNumber} is locked (included in a consolidated invoice) — no further stage documents can be added.`);
    }
    if (sale.status === 'cancelled') {
      throw new Error(`Sale ${sale.saleNumber} is cancelled — no further stage documents can be added.`);
    }
    // LADDER (2026-10-28): the invoice is no longer a rung. A sale is
    // quotation → sales_order; GST invoices are CONSOLIDATED (one invoice for
    // N sales orders) via the Create Invoice action (see createSaleInvoice).
    if (stageInput.stageType === 'sales_invoice') {
      throw new Error('A sale cannot issue a sales invoice directly — invoices are now consolidated from several sales orders via the Create Invoice action.');
    }
    const allowed: SalesStage[] = currentType === 'quotation' ? ['sales_order'] : [];
    if (!allowed.includes(stageInput.stageType as SalesStage)) {
      throw new Error(`A sale at ${currentType} stage cannot issue a ${stageInput.stageType} document.`);
    }

    const now = new Date().toISOString();
    const stageId = `sos-${id}-${Math.random().toString(36).slice(2, 8)}`;

    // RST (2026-10-28): issuing the sales_order stage PROMOTES the master
    // numbering to the confirmed order's RST serial — a quotation-first sale
    // abandons its QUO-… number in favor of the RST (the quotation stage row
    // keeps its own QUO-… stageNumber as the §2 statutory snapshot). The
    // caller's typed number wins; otherwise the server mints the next serial.
    let stageNumber = stageInput.stageNumber || sale.saleNumber;
    if (stageInput.stageType === 'sales_order' && !this.isBareSerial(sale.saleNumber)) {
      const minted = (stageInput.stageNumber || '').trim() || this.nextRstNumber();
      if ((this.data.sales || []).some((s) => s.id !== id && s.saleNumber === minted)) {
        throw new Error(`RST number ${minted} is already in use — choose a different RST number.`);
      }
      stageNumber = minted;
      sale.saleNumber = minted;
    }

    // Dispatch attachment (2026-10-28): a quotation-stage creation ships NO
    // vehicle — issuing the sales_order stage may carry the dispatch details
    // from the issue dialog; the master adopts them (own-fleet FK authority,
    // outsourced typed plate — same semantics as updateSale). The sales order
    // may not be issued without SOME dispatch attachment.
    const si = stageInput as any;
    if (stageInput.stageType === 'sales_order' &&
        (si.vehicleId !== undefined || si.vehicleNo !== undefined)) {
      if (si.vehicleId) {
        sale.vehicleId = si.vehicleId;
        sale.vehicleNo = undefined;
      } else {
        const plate = String(si.vehicleNo || '').trim().toUpperCase();
        if (plate) {
          sale.vehicleId = undefined;
          sale.vehicleNo = plate;
        }
      }
    }
    if (stageInput.stageType === 'sales_order' && !sale.vehicleId && !sale.vehicleNo) {
      throw new Error('A sales order must carry a dispatch attachment — attach a fleet vehicle or enter an outsourced vehicle number.');
    }
    if (stageInput.stageType === 'sales_order') {
      if (si.siteAddress !== undefined) sale.siteAddress = si.siteAddress || undefined;
      if (si.distanceKm !== undefined) {
        sale.distanceKm = Number(si.distanceKm) > 0 ? Number(si.distanceKm) : undefined;
      }
      if (si.weightTonnes !== undefined) {
        sale.weightTonnes = Number(si.weightTonnes) > 0 ? Number(si.weightTonnes) : undefined;
      }
    }

    // The new stage's rows: caller-provided lines, else seeded from the
    // current stage's rows (copy — ids regenerate; values carry over).
    const provided = (stageInput as any).items as SalesOrderItemInput[] | undefined;
    const seedInput: SalesOrderItemInput[] =
      provided && provided.length > 0
        ? provided
        : (latest?.items || sale.items || []).map((li) => ({
            itemId: li.itemId,
            quantity: Number(li.quantity) || 0,
            rate: Number(li.rate) || 0,
            gstRate: li.gstRate,
            locationId: li.locationId,
            itemNotes: li.itemNotes,
            weightTonnes: (li as any).weightTonnes,
            // TRACKABLE lines: the register selection carries into the new
            // stage (the promoted document sells the same physical units)
            unitIds: li.unitIds,
            // PRODUCE-&-SELL-DIRECTLY: the flag + one-shot run config carry
            // into the promoted stage (produce + sell stays produce + sell)
            produceDirect: (li as any).produceDirect,
            ...((li as any).production ? { production: (li as any).production } : {}),
          }));
    const items = this.normalizeSaleItemLines(id, seedInput, stageId);
    const total = this.computeStageTotals(items, Number(sale.transportCharges) || 0, sale.freightGstRate || 0);

    const stage: SalesOrderStage = {
      id: stageId,
      saleId: id,
      stageType: stageInput.stageType,
      stageNumber,
      date: stageInput.date || now.split('T')[0],
      subtotal: total.subtotal,
      taxAmount: total.taxAmount,
      totalAmount: total.totalAmount,
      items,
      notes: stageInput.notes,
      createdAt: now,
    };
    stagesArr.push(stage);
    sale.stages = stagesArr;
    sale.items = items; // master view follows the current stage

    // 2026-10-28 (CLIENT RULE, no toggle/no choice): issuing the sales_order
    // stage applies the dispatch AND books the flow as CREDIT — the sale's
    // stock updates now (one-shot) and the receivable posts to the party
    // ledger at this save. (The invoice-stage rung is retired — consolidated
    // invoices post nothing; see createSaleInvoice.)
    if (stage.stageType === 'sales_order') {
      if (!sale.inventoryApplied && this.applySaleInventory(sale, stage.stageNumber, true, actorId)) {
        sale.inventoryApplied = true;
        // The dispatch stands now — bound direct-sale runs come to life
        // (client rule: produce + sell, run qty locked to the sale lines).
        this.syncSaleDirectRuns(sale, true, actorId);
      }
      const askedType = (stageInput as any).settlementType;
      this.applySaleCash(sale, stage, {
        settle: false,
        type: 'credit',
        settlementAccountId: undefined,
        paymentMode: undefined,
      }, 'sales_order', actorId);
      this.logAudit('CREATE', 'SALE_CASH', id, `Forced flow on sale ${sale.saleNumber} at ${stage.stageType} ${stage.stageNumber} (inventory forced; credit journal)${askedType && askedType !== 'credit' ? ` — client asked ${askedType}, overridden to credit` : ''}`);
    } else if (stageInput.updateCash) {
      this.logAudit('DISPATCH', 'SALE_CASH', id, `Cash application requested at ${stage.stageType} stage — applies at the sales-order stage`);
    }
    sale.status = this.computeSalesStatus(sale);
    sale.updatedAt = now;
    // DONE-BY AUDIT (2026-11-21): the stage issuance edited the master row
    if (actorId) sale.updatedById = actorId;

    this.logAudit('UPDATE', 'SALE_STAGE', id, `Issued stage ${stage.stageType} ${stage.stageNumber} on sale ${sale.saleNumber}`);
    this.save();
    this.syncSaleToMysql(sale);
    // The new stage may carry re-edited line weights — keep the derived slip
    // on the effective stage's line sum
    this.syncSaleTripSlip(sale);
    const stageDocIds = this.extractDocumentIds(stageInput);
    if (stageDocIds.length > 0) this.linkOrderDocuments('sale', id, stageDocIds);
    return this.hydrateSale(sale);
  }

  public deleteSale(id: string): boolean {
    const index = (this.data.sales || []).findIndex((s) => s.id === id);
    if (index === -1) return false;
    const stagesArr = this.data.sales[index].stages || [];
    if (stagesArr.length > 0 && stagesArr[stagesArr.length - 1].stageType === 'sales_invoice') {
      throw new Error(`Sale ${this.data.sales[index].saleNumber} is locked (invoice issued) and cannot be deleted.`);
    }
    if ((this.data.sales[index] as any).isInvoiced) {
      throw new Error(`Sale ${this.data.sales[index].saleNumber} is locked (included in a consolidated invoice) and cannot be deleted.`);
    }
    const sale = this.data.sales[index];
    if (sale.inventoryApplied) {
      this.unapplySaleInventory(sale, 'Deletion reversal for sale');
      sale.inventoryApplied = false;
    }
    // Bound direct-sale runs go with the sold sale — consumption reversed.
    this.removeSaleDirectRuns(sale, 'Deletion of sale');
    if (sale.invoiceVoucherId || sale.settlementVoucherId) {
      // Defensive: an invoice-stage sale is locked, so this is only reachable
      // for API-side settlement data — un-book the vouchers before deleting.
      this.deleteLinkedVouchers(sale, `Deletion reversal for sale ${sale.saleNumber}`);
    }
    this.data.sales.splice(index, 1);
    // The dispatch trip slip was sale-derived — remove it with the sale
    // (operator progress on it is lost with the sale's own data).
    const linkedSlip = (this.data.tripSlips || []).find((t) => t.saleId === id);
    if (linkedSlip) {
      this.deleteTripSlip(linkedSlip.id);
      this.logAudit('DELETE', 'SALE', id, `Deleted trip slip ${linkedSlip.slipNumber} (sale ${sale.saleNumber} deleted)`);
    }
    this.detachSaleDocuments(id); // drop mappings, soft-delete orphaned docs
    this.logAudit('DELETE', 'SALE', id, `Deleted sale ${sale.saleNumber}`);
    this.save();
    this.syncSaleToMysql(sale, true);
    return true;
  }

  // ---------- CONSOLIDATED SALES INVOICES (one invoice = N sales orders) ----------
  // An invoice is no longer a rung of the sale ladder: sales orders carry only
  // Quotation → Sales Order. The Create Invoice action (Sales page / Party
  // detail) folds N of a party's UNINVOICED sales orders in a date range into
  // ONE invoice entry — its lines flatten every member order's current-stage
  // rows (FKs per §2; qty/rate/gst are statutory snapshots — invoiced orders
  // are locked, so they cannot drift). sales_orders.is_invoiced marks
  // membership: invoiced orders stop being eligible, are locked and complete.

  /** Collision-safe invoice serial: highest CINV-<year>-#### in use + 1. */
  private nextSaleInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const prefix = `CINV-${year}-`;
    let max = 0;
    for (const inv of this.data.salesInvoices || []) {
      if (!String(inv.invoiceNumber || '').startsWith(prefix)) continue;
      const n = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  private hydrateSaleInvoice(invoice: SaleInvoice): SaleInvoice {
    const party = this.data.parties.find((p) => p.id === invoice.partyId);
    const items: SaleInvoiceItem[] = (invoice.items || []).map((li) => {
      const master = this.findItemRaw(li.itemId);
      const unitId = li.unitId || master?.unitId;
      const saleRow = (this.data.sales || []).find((s) => s.id === li.saleId);
      return {
        ...li,
        saleNumber: saleRow?.saleNumber || li.saleNumber,
        itemName: master?.name,
        itemCode: master?.code,
        unit: unitId ? this.data.units.find((u) => u.id === unitId)?.code || undefined : master?.unit,
        location: li.locationId ? this.data.locations.find((l) => l.id === li.locationId)?.name : undefined,
        amount: (Number(li.quantity) || 0) * (Number(li.rate) || 0),
      };
    });
    const orders: SaleInvoiceOrderLink[] = (invoice.orders || []).map((lk) => {
      const saleRow = (this.data.sales || []).find((s) => s.id === lk.saleId);
      return {
        ...lk,
        saleNumber: saleRow?.saleNumber || lk.saleNumber,
        saleDate: saleRow?.date || lk.saleDate,
      };
    });
    return {
      ...invoice,
      partyName: party ? (party.tradeName || party.name) : undefined,
      orders,
      items,
      // Settlement display fields (Golden Rule §2 — JOINed, never persisted)
      settlementAccountName: invoice.settlementAccountId
        ? (this.data.accounts || []).find((a) => a.id === invoice.settlementAccountId)?.name
        : undefined,
      invoiceVoucherNumber: invoice.invoiceVoucherId
        ? (this.data.transactions || []).find((t) => t.id === invoice.invoiceVoucherId)?.voucherNumber
        : undefined,
      settlementVoucherNumber: invoice.settlementVoucherId
        ? (this.data.transactions || []).find((t) => t.id === invoice.settlementVoucherId)?.voucherNumber
        : undefined,
    };
  }

  public getSaleInvoices(): SaleInvoice[] {
    return (this.data.salesInvoices || []).map((i) => this.hydrateSaleInvoice(i));
  }

  public getSaleInvoiceById(id: string): SaleInvoice | undefined {
    const invoice = (this.data.salesInvoices || []).find((i) => i.id === id);
    return invoice ? this.hydrateSaleInvoice(invoice) : undefined;
  }

  private syncSaleInvoiceToMysql(invoice: SaleInvoice, isDelete = false): void {
    liveSyncSaleInvoice(invoice, isDelete);
    if (!isDelete) {
      liveSyncSaleInvoiceItems(invoice.id, invoice.items || [], false);
      liveSyncSaleInvoiceOrders(invoice.id, invoice.orders || [], false);
    }
  }

  /**
   * Create ONE invoice entry from N selected sales orders of a single party:
   *   1. validate every member (same party, not cancelled, not already
   *      invoiced, no legacy invoice stage, SO-stage confirmed, has items);
   *   2. CATCH-UP dispatch: member orders whose inventory never applied
   *      (legacy rows) dispatch NOW — dispatched goods must be billed;
   *   3. flatten lines + totals from each member's current (latest) stage;
   *   4. stamp every member sale is_invoiced + status Completed;
   *   5. persist invoice + members to MySQL.
   * 2026-10-28 (CLIENT RULE): the consolidated invoice is a pure DOCUMENT —
   * it posts NO journal and NO receipt voucher of its own (every member
   * booked its credit receivable at creation; posting again would
   * double-count). The party pays later; the receipts post as payment_in
   * vouchers against the party (Record Payment), un-keyed to the invoice.
   * The displayed settlement rides the members: all-credit ⇒ 'credit'.
   */
  public createSaleInvoice(data: any, actorId?: string): SaleInvoice {
    const now = new Date().toISOString();
    const partyId = data.partyId;
    const invoiceDate = data.date || now.split('T')[0];
    const party = this.data.parties.find((p) => p.id === partyId);
    if (!party) throw new Error('Party not found — a consolidated invoice needs an existing party.');

    const saleIds: string[] = Array.isArray(data.saleIds) ? data.saleIds : [];
    if (saleIds.length === 0) throw new Error('Select at least one sales order to invoice.');
    if (new Set(saleIds).size !== saleIds.length) throw new Error('Duplicate sales orders in the selection.');

    const members = saleIds.map((sid) => (this.data.sales || []).find((s) => s.id === sid));
    if (members.some((m) => !m)) {
      throw new Error(`Sales order not found: ${saleIds[members.findIndex((m) => !m)]}`);
    }
    const sales = members as Sale[];
    for (const sale of sales) {
      if (sale.partyId !== partyId) {
        throw new Error(`Sales order ${sale.saleNumber} belongs to a different party — an invoice covers a single party.`);
      }
      if (sale.status === 'cancelled') {
        throw new Error(`Sales order ${sale.saleNumber} is cancelled and cannot be invoiced.`);
      }
      if ((sale as any).isInvoiced) {
        throw new Error(`Sales order ${sale.saleNumber} is already part of an invoice and cannot join another one.`);
      }
      const stagesArr = sale.stages || [];
      const latest = stagesArr.length > 0 ? stagesArr[stagesArr.length - 1] : undefined;
      if (latest?.stageType === 'sales_invoice') {
        throw new Error(`Sales order ${sale.saleNumber} is locked (legacy invoice issued) and cannot join a consolidated invoice.`);
      }
      if (!latest || latest.stageType !== 'sales_order') {
        throw new Error(`Sales order ${sale.saleNumber} is not a confirmed Sales Order yet — advance it to the Sales Order stage before invoicing.`);
      }
      if ((sale.items || []).length === 0) {
        throw new Error(`Sales order ${sale.saleNumber} has no items to invoice.`);
      }
    }

    // Validate... the settlement account is gone: the invoice posts nothing of
    // its own (member journals already carry the receivable).

    // 1. Catch-up inventory: a member that never applied its dispatch
    //    (legacy rows that predate the forced rule) dispatches NOW.
    for (const sale of sales) {
      // Legacy catch-up dispatch — no session actor is threaded here (the
      // consolidated invoice posts nothing itself); the units keep whoever
      // booked them originally.
      if (!sale.inventoryApplied && this.applySaleInventory(sale, sale.saleNumber, true)) {
        sale.inventoryApplied = true;
        // Produce-&-sell-directly lines: the dispatch stands — their bound
        // runs come to life with the catch-up.
        this.syncSaleDirectRuns(sale, true);
      }
    }

    // 2. Build the invoice: member links + flattened line rows.
    const invoiceId = `vinv-${this.nextLedgerMs()}-${Math.random().toString(36).slice(2, 8)}`;
    const invoiceNumber = this.nextSaleInvoiceNumber();
    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;
    let transportCharges = 0;
    const orders: SaleInvoiceOrderLink[] = sales.map((sale, idx) => {
      const latest = (sale.stages || []).length > 0 ? (sale.stages || [])[(sale.stages || []).length - 1] : undefined;
      subtotal += Number(latest?.subtotal) || 0;
      taxAmount += Number(latest?.taxAmount) || 0;
      totalAmount += Number(latest?.totalAmount) || 0;
      transportCharges += Number(sale.transportCharges) || 0;
      return {
        id: `sio-${invoiceId}-${idx}`,
        salesInvoiceId: invoiceId,
        saleId: sale.id,
        saleTotalAmount: this.roundMoney(Number(latest?.totalAmount) || 0),
        createdAt: now,
      };
    });
    subtotal = this.roundMoney(subtotal);
    taxAmount = this.roundMoney(taxAmount);
    totalAmount = this.roundMoney(totalAmount);
    const items: SaleInvoiceItem[] = [];
    for (const sale of sales) {
      const stagesArr = sale.stages || [];
      const latest = stagesArr.length > 0 ? stagesArr[stagesArr.length - 1] : undefined;
      const stageRows = latest && (latest.items || []).length > 0 ? latest.items! : sale.items || [];
      for (const li of stageRows) {
        if ((Number(li.quantity) || 0) === 0) continue; // empty placeholder rows never invoice
        items.push({
          id: `sli-${invoiceId}-${items.length + 1}`,
          salesInvoiceId: invoiceId,
          saleId: sale.id,
          saleStageId: latest?.id,
          itemId: li.itemId,
          unitId: li.unitId,
          quantity: Number(li.quantity) || 0,
          rate: Number(li.rate) || 0,
          gstRate: li.gstRate,
          locationId: li.locationId,
          itemNotes: li.itemNotes,
        });
      }
    }

    const invoice: SaleInvoice = {
      id: invoiceId,
      invoiceNumber,
      partyId,
      date: invoiceDate,
      notes: data.notes,
      subtotal,
      taxAmount,
      totalAmount,
      transportCharges: this.roundMoney(transportCharges),
      // Display-only flow state (the invoice posts nothing): members booked
      // credit at creation — all-credit members ⇒ 'credit'. Legacy members
      // with the account flow (or flow never applied) ⇒ 'account' is shown
      // only when the members actually settled into accounts.
      cashApplied: true,
      settlementType: sales.every((s) => s.cashApplied && s.settlementType === 'credit')
        ? 'credit'
        : (sales.some((s) => s.cashApplied && s.settlementType === 'account') ? 'account' : 'credit'),
      settlementAccountId: undefined,
      paymentMode: undefined,
      orders,
      items,
      createdAt: now,
      updatedAt: now,
    };

    // 3. Stamp EVERY member sale isInvoiced + Completed (locked from here on).
    for (const sale of sales) {
      sale.isInvoiced = true;
      sale.status = 'completed';
      sale.updatedAt = now;
      this.logAudit('UPDATE', 'SALE', sale.id, `Sales order ${sale.saleNumber} joined consolidated invoice ${invoiceNumber} (is_invoiced → locked)`);
      this.syncSaleToMysql(sale);
    }

    // DONE-BY AUDIT (2026-11-21): the session user who consolidated the invoice
    invoice.createdById = actorId || (data as any).createdById;
    invoice.updatedById = actorId || (data as any).updatedById;

    (this.data.salesInvoices = this.data.salesInvoices || []).unshift(invoice);
    this.logAudit('CREATE', 'SALE_INVOICE', invoiceId, `Consolidated invoice ${invoiceNumber} created for ${members.length} sales order(s) (₹${totalAmount}; document-only — member journals already carry the receivable)`);
    this.save();
    this.syncSaleInvoiceToMysql(invoice);
    return this.hydrateSaleInvoice(invoice);
  }

  /** payment_in receipt voucher for a consolidated invoice (mirror of
   *  upsertSaleReceiptVoucher; id `txn-<invoiceId>-pay`, idempotent). */
  private upsertInvoiceReceiptVoucher(invoice: SaleInvoice, paymentMode?: string): string {
    const account = (this.data.accounts || []).find((a) => a.id === invoice.settlementAccountId && a.isActive);
    if (!account) {
      throw new Error('Selected settlement account was not found — please choose an active Cash/Bank account.');
    }
    const party = this.data.parties.find((p) => p.id === invoice.partyId);
    const existingVoucher = invoice.settlementVoucherId
      ? (this.data.transactions || []).find((t) => t.id === invoice.settlementVoucherId)
      : undefined;
    const voucherNumber = existingVoucher?.voucherNumber || this.mintVoucherNumber(this.data.settings.prefixes.paymentReceipt);
    const voucherId = existingVoucher?.id || `txn-${invoice.id}-pay`;
    this.createTransaction(
      {
        id: voucherId,
        voucherNumber,
        partyId: invoice.partyId,
        partyType: (party?.type as any) || 'customer',
        type: 'payment_in',
        amount: this.roundMoney(invoice.totalAmount),
        date: invoice.date,
        accountId: invoice.settlementAccountId,
        paymentMode: ((paymentMode as any) || invoice.paymentMode || 'bank_transfer'),
        referenceNumber: invoice.invoiceNumber,
        description: `Receipt against Sales Invoice ${invoice.invoiceNumber}`,
        status: 'paid',
      }
    );
    return voucherId;
  }

  /**
   * Cancel a consolidated invoice: un-book its vouchers (journal + receipt —
   * the party/account balances re-recalculate via deleteTransaction's built-in
   * compensation), RELEASE every member sale (is_invoiced → false, status
   * recomputed) so the orders become selectable again, and DELETE the invoice
   * entry. Stock dispatches are NOT reversed — the goods left the yard.
   */
  public deleteSaleInvoice(id: string): boolean {
    const index = (this.data.salesInvoices || []).findIndex((i) => i.id === id);
    if (index === -1) return false;
    const invoice = this.data.salesInvoices[index];
    this.deleteLinkedVouchers(invoice, `Consolidated invoice ${invoice.invoiceNumber} cancellation`);
    for (const lk of invoice.orders || []) {
      const sale = (this.data.sales || []).find((s) => s.id === lk.saleId);
      if (!sale) continue; // the member sale may be gone — release what exists
      sale.isInvoiced = false;
      sale.status = this.computeSalesStatus(sale);
      this.logAudit('UPDATE', 'SALE', sale.id, `Sales order ${sale.saleNumber} released from cancelled invoice ${invoice.invoiceNumber}`);
      this.syncSaleToMysql(sale);
    }
    this.data.salesInvoices.splice(index, 1);
    this.logAudit('DELETE', 'SALE_INVOICE', invoice.id, `Cancelled consolidated invoice ${invoice.invoiceNumber} (members released)`);
    this.save();
    this.syncSaleInvoiceToMysql(invoice, true);
    return true;
  }

  // ---------- PURCHASES ----------

  public getPurchases(): Purchase[] {
    return (this.data.purchases || []).map((p) => this.hydratePurchase(p));
  }

  public getPurchaseById(id: string): Purchase | undefined {
    const purchase = (this.data.purchases || []).find((p) => p.id === id);
    return purchase ? this.hydratePurchase(purchase) : undefined;
  }

  public createPurchase(data: any, actorId?: string): Purchase {
    const purchaseId = data.id || `purc-${this.nextLedgerMs()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const items = this.normalizePurchaseItemLines(purchaseId, data.items || []);
    // A purchase created straight at goods-receipt bills received quantities.
    const firstStageType = data.stage?.stageType || 'purchase_order';
    const total = firstStageType === 'goods_receipt'
      ? this.computeReceivedStageTotals(items)
      : this.computeStageTotals(items, 0);

    const stageInput: PurchaseOrderStageInput = data.stage || {
      stageType: 'purchase_order',
      stageNumber: data.purchaseNumber,
      date: data.date,
    };
    const masterNumber = data.purchaseNumber || stageInput.stageNumber || `PURC-${Date.now().toString().slice(-8)}`;
    const stage: PurchaseOrderStage = {
      id: `pos-${purchaseId}-${Math.random().toString(36).slice(2, 8)}`,
      purchaseId,
      stageType: stageInput.stageType || 'purchase_order',
      stageNumber: stageInput.stageNumber || masterNumber,
      date: stageInput.date || data.date || now.split('T')[0],
      subtotal: total.subtotal,
      taxAmount: total.taxAmount,
      totalAmount: total.totalAmount,
      rfqDetails: stageInput.rfqDetails,
      poDetails: stageInput.poDetails,
      receiptDetails: stageInput.receiptDetails,
      notes: stageInput.notes || data.notes,
      createdAt: now,
    };

    const purchase: Purchase = {
      id: purchaseId,
      purchaseNumber: masterNumber,
      partyId: data.partyId, // nullable — RFQ ingestion may have no vendor yet
      date: data.date || now.split('T')[0],
      status: 'pending',
      notes: data.notes,
      inventoryApplied: false,
      cashApplied: false,
      items,
      stages: [stage],
      createdAt: now,
      updatedAt: now,
    };

    // Inventory: the goods_receipt is a PERMANENT-ON stage (mirrors the sales
    // invoice) — inward posts here even if the toggle was never enabled at PO.
    if (stageInput.updateInventory || stage.stageType === 'goods_receipt') {
      if (this.applyPurchaseInventory(purchase, stage.stageNumber)) {
        purchase.inventoryApplied = true;
      }
    }
    if (stage.stageType === 'purchase_order' || stage.stageType === 'goods_receipt') {
      // Cash & Bank wiring: the payment_out payout voucher posts the moment
      // "Settle Payment Now" is chosen (purchase-order or goods-receipt
      // stage — once per purchase); the purchase_bill journal voucher
      // belongs to the goods-receipt document. A goods receipt also refuses
      // to record payables without a vendor.
      if (stage.stageType === 'goods_receipt' && !purchase.partyId) {
        throw new Error('A Supplier / Vendor is required to record a Goods Receiving. Add the vendor at the Purchase Order stage first.');
      }
      this.applyPurchaseCash(purchase, stage, {
        settle: Boolean(stageInput.updateCash),
        type: (stageInput as any).settlementType,
        settlementAccountId: stageInput.settlementAccountId,
        paymentMode: stageInput.paymentMode,
      }, stage.stageType, actorId);
      this.logAudit('CREATE', 'PURCHASE_CASH', purchaseId, `Payment flow on purchase ${purchase.purchaseNumber} at ${stage.stageType} (type=${(stageInput as any).settlementType ?? (stageInput.updateCash ? 'account(legacy)' : 'legacy-off')})`);
    } else if (stageInput.updateCash) {
      this.logAudit('DISPATCH', 'PURCHASE_CASH', purchaseId, `Cash application requested at ${stage.stageType} stage — applies at the purchase-order stage`);
    }
    purchase.status = this.computePurchaseStatus(purchase);
    // DONE-BY AUDIT (2026-11-21): the session user who registered the purchase
    purchase.createdById = actorId || (data as any).createdById;
    purchase.updatedById = actorId || (data as any).updatedById;

    // SERIALISED lines (2026-11-16): a purchase created straight at PO/GRN
    // registers its units right away (PO too, per the user's rule)
    if (stage.stageType === 'purchase_order' || stage.stageType === 'goods_receipt') {
      this.syncPurchaseSerializedUnits(purchase, stage.date, actorId);
    }

    this.data.purchases.unshift(purchase);
    delete (purchase as any).documentIds; // never persisted — linked below
    this.logAudit('CREATE', 'PURCHASE', purchaseId, `Registered purchase ${purchase.purchaseNumber} (stage ${stage.stageType})`);
    this.save();
    this.syncPurchaseToMysql(purchase);
    const createDocIds = this.extractDocumentIds(data);
    if (createDocIds.length > 0) this.linkOrderDocuments('purchase', purchaseId, createDocIds);
    return this.hydratePurchase(purchase);
  }

  public updatePurchase(
    id: string,
    updates: Partial<Purchase> & { items?: PurchaseOrderItemInput[]; updateInventory?: boolean },
    opts: { skipMysqlSync?: boolean; redateCurrentStage?: boolean } = {},
    actorId?: string
  ): Purchase | null {
    const index = (this.data.purchases || []).findIndex((p) => p.id === id);
    if (index === -1) {
      return this.createPurchase({ ...updates, id }, actorId);
    }
    const existing = this.data.purchases[index];
    const wasCancelled = existing.status === 'cancelled';

    existing.partyId = updates.partyId !== undefined ? (updates.partyId || undefined) : existing.partyId;
    existing.date = updates.date ?? existing.date;
    // ORDER DATE = STAGE DOCUMENT DATE (user rule) — same as updateSale: a
    // master edit that inserts a date re-dates the current/latest stage
    // document; the addPurchaseStageDirect composite pre-call is exempt (the
    // stage row is re-dated by addPurchaseStage itself right after).
    if (opts.redateCurrentStage && updates.date && existing.stages && existing.stages.length > 0) {
      existing.stages[existing.stages.length - 1].date = updates.date;
    }
    existing.notes = updates.notes ?? existing.notes;
    existing.updatedAt = new Date().toISOString();

    if (updates.items !== undefined) {
      const normalized = this.normalizePurchaseItemLines(id, updates.items || []);
      // Identical re-saves (e.g. document re-issue) do NOT churn the ledger:
      // compensation only fires when the applied quantities/rates changed.
      const identical = this.areOrderItemLinesEqual(existing.items, normalized);
      existing.items = normalized;
      if (existing.inventoryApplied && !identical) {
        this.unapplyPurchaseInventory(existing, 'Edit compensation for purchase');
        if (this.applyPurchaseInventory(existing, existing.purchaseNumber, true)) {
          existing.inventoryApplied = true;
        } else {
          existing.inventoryApplied = false;
        }
      }
      // Voucher compensation on edit (user rule: money follows the document) —
      // BOTH posted vouchers resize to the edited total: the purchase_bill
      // journal (party payable leg) and the payment_out payout (Cash/Bank leg,
      // when settled at an earlier stage; the bank balance re-adjusts too).
      // A GRN'd purchase sizes to its RECEIVED-based document total.
      if (!identical) {
        const latest = (existing.stages || []).length > 0 ? existing.stages[existing.stages.length - 1] : undefined;
        const refreshed = latest?.stageType === 'goods_receipt'
          ? this.computeReceivedStageTotals(existing.items)
          : this.computeStageTotals(existing.items, 0);
        this.resizeVoucherAmounts(existing, refreshed.totalAmount, `Purchase ${existing.purchaseNumber} edit`, 'PURCHASE_CASH');
      }
    }

    // One-shot inventory application rides on the master EDIT (user rule:
    // the edit-stage flow shows the Receive Into Stockyard Inventory switch,
    // default OFF — enabled only while the inward has never posted).
    if (updates.updateInventory && !existing.inventoryApplied) {
      if (this.applyPurchaseInventory(existing, existing.purchaseNumber)) {
        existing.inventoryApplied = true;
      }
    }

    // Payment-flow switch on the master EDIT: a flow never applied at
    // creation can be chosen here (Purchase Order stage) — same one-shot
    // settlement gate as the stage saves.
    const editSettleType = (updates as any).settlementType as 'none' | 'credit' | 'account' | undefined;
    const latestStage = (existing.stages || []).length > 0 ? existing.stages[existing.stages.length - 1] : undefined;
    if (editSettleType && editSettleType !== 'none' && !existing.cashApplied && latestStage &&
        (latestStage.stageType === 'purchase_order' || latestStage.stageType === 'goods_receipt')) {
      const settleStage: PurchaseOrderStage = {
        ...latestStage,
        subtotal: Number((updates as any).subtotal ?? latestStage.subtotal) || 0,
        taxAmount: Number((updates as any).taxAmount ?? latestStage.taxAmount) || 0,
        totalAmount: Number((updates as any).totalAmount ?? latestStage.totalAmount) || 0,
      };
      this.applyPurchaseCash(existing, settleStage, {
        settle: editSettleType === 'account',
        type: editSettleType,
        settlementAccountId: (updates as any).settlementAccountId,
        paymentMode: (updates as any).paymentMode,
      }, latestStage.stageType as PurchaseStage, actorId);
      this.logAudit('CREATE', 'PURCHASE_CASH', id, `Payment flow on purchase ${existing.purchaseNumber} via edit at ${latestStage.stageType} (type=${editSettleType})`);
    }

    if (updates.status === 'cancelled' && !wasCancelled && existing.inventoryApplied) {
      this.unapplyPurchaseInventory(existing, 'Cancellation reversal for purchase');
      existing.inventoryApplied = false;
    }
    if (updates.status === 'cancelled' && !wasCancelled && (existing.invoiceVoucherId || existing.settlementVoucherId)) {
      // Cancellation of a GRN'd purchase also un-books its Cash & Bank entries.
      this.deleteLinkedVouchers(existing, `Cancellation reversal for purchase ${existing.purchaseNumber}`);
    }
    // SERIALISED lines: a cancelled purchase keeps no untouched units — its
    // register entries (never deployed/sold) are removed with it.
    if (updates.status === 'cancelled' && !wasCancelled) {
      this.removePurchaseUnits(existing, 'Cancellation of purchase');
    }
    if (updates.status) existing.status = updates.status;
    existing.status = this.computePurchaseStatus(existing);

    // SERIALISED lines (2026-11-16): the register follows the line set on a
    // master edit (new serials register per stage rules; removed serials tear
    // down while untouched in stock)
    this.syncPurchaseSerializedUnits(existing, existing.date, actorId);

    // DONE-BY AUDIT (2026-11-21): only a real actor moves updatedById
    if (actorId && !existing.createdById) existing.createdById = actorId;
    if (actorId) existing.updatedById = actorId;
    this.logAudit('UPDATE', 'PURCHASE', id, `Updated purchase ${existing.purchaseNumber}`);
    this.save();
    // Composite flows (addPurchaseStageDirect) sync AFTER the stage save —
    // two fire-and-forget REPLACEs for one row race the pool and can land
    // out of order, leaving stale flags (inventory_applied=0 with stock applied).
    if (!opts.skipMysqlSync) {
      this.syncPurchaseToMysql(existing);
    }
    // Document links ride on the master-edit payload when present (idempotent)
    const editDocIds = this.extractDocumentIds(updates);
    if (editDocIds.length > 0) this.linkOrderDocuments('purchase', id, editDocIds);
    return this.hydratePurchase(existing);
  }

  /**
   * Saves a stage against the purchase (RFQ / PO / GRN — one row per stage
   * type; re-saving a stage type UPDATES its existing row). `updateInventory`
   * applies the one-shot goods inward (receivedQuantity at GRN).
   */
  public addPurchaseStage(id: string, stageInput: PurchaseOrderStageInput, actorId?: string): Purchase | null {
    const purchase = (this.data.purchases || []).find((p) => p.id === id);
    if (!purchase) return null;
    const now = new Date().toISOString();
    const stageType = stageInput.stageType;
    // The goods-receipt document bills the ACTUAL received quantities at the
    // PO's locked rates (shortage lines contribute less/zero, overage more);
    // PO/RFQ stage totals stay ordered-qty based (user rule).
    const total = stageType === 'goods_receipt'
      ? this.computeReceivedStageTotals(purchase.items || [])
      : this.computeStageTotals(purchase.items || [], 0);

    const existingStageIdx = (purchase.stages || []).findIndex((s) => s.stageType === stageType);
    const stageNumber = stageInput.stageNumber || purchase.purchaseNumber;
    if (existingStageIdx >= 0) {
      // Stage re-save: update the existing row (UNIQUE(purchase_id, stage_type))
      const s = purchase.stages[existingStageIdx];
      s.stageNumber = stageNumber || s.stageNumber;
      s.date = stageInput.date || s.date;
      s.subtotal = total.subtotal;
      s.taxAmount = total.taxAmount;
      s.totalAmount = total.totalAmount;
      s.notes = stageInput.notes ?? s.notes;
      s.rfqDetails = stageInput.rfqDetails ?? s.rfqDetails;
      s.poDetails = stageInput.poDetails ?? s.poDetails;
      s.receiptDetails = stageInput.receiptDetails ?? s.receiptDetails;
    } else {
      purchase.stages.push({
        id: `pos-${id}-${Math.random().toString(36).slice(2, 8)}`,
        purchaseId: id,
        stageType,
        stageNumber: stageNumber || purchase.purchaseNumber,
        date: stageInput.date || now.split('T')[0],
        subtotal: total.subtotal,
        taxAmount: total.taxAmount,
        totalAmount: total.totalAmount,
        rfqDetails: stageInput.rfqDetails,
        poDetails: stageInput.poDetails,
        receiptDetails: stageInput.receiptDetails,
        notes: stageInput.notes,
        createdAt: now,
      });
    }

    // Stage item quantities (receivedQuantity at GRN) live on the master items
    // and are applied via updatePurchase — the stage save reuses those totals.
    const stageRow = (purchase.stages || []).find((s) => s.stageType === stageType);

    // Inventory: the goods_receipt is a PERMANENT-ON stage (mirrors the sales
    // invoice) — inward posts here even if the toggle was never enabled at PO.
    if ((stageInput.updateInventory || stageType === 'goods_receipt') && this.applyPurchaseInventory(purchase, stageNumber)) {
      purchase.inventoryApplied = true;
    }
    if (stageType === 'purchase_order' || stageType === 'goods_receipt') {
      // A goods receipt records payables against the vendor — refuse it
      // without one (mirror of the sales settlement-account guard).
      if (stageType === 'goods_receipt' && !purchase.partyId) {
        throw new Error('A Supplier / Vendor is required to record a Goods Receiving. Add the vendor at the Purchase Order stage first.');
      }
      // Cash & Bank wiring: the payment_out payout voucher posts the moment
      // "Settle Payment Now" is checked (purchase-order or goods-receipt
      // stage — once per purchase); the purchase_bill journal voucher
      // belongs to the goods-receipt document.
      this.applyPurchaseCash(purchase, stageRow, {
        settle: Boolean(stageInput.updateCash),
        type: (stageInput as any).settlementType,
        settlementAccountId: stageInput.settlementAccountId,
        paymentMode: stageInput.paymentMode,
      }, stageType, actorId);
      this.logAudit('CREATE', 'PURCHASE_CASH', id, `Payment flow on purchase ${purchase.purchaseNumber} at ${stageType} ${stageRow?.stageNumber || stageNumber} (type=${(stageInput as any).settlementType ?? (stageInput.updateCash ? 'account(legacy)' : 'legacy-off')})`);
    } else if (stageInput.updateCash) {
      this.logAudit('DISPATCH', 'PURCHASE_CASH', id, `Cash application requested at ${stageType} stage — applies at the purchase-order stage`);
    }
    // SERIALISED lines (2026-11-16): a PO or GRN stage save registers the
    // units its serialized lines carry (PO too, per the user's rule) and
    // reconciles removed serials with the register.
    if (stageType === 'purchase_order' || stageType === 'goods_receipt') {
      this.syncPurchaseSerializedUnits(purchase, stageRow?.date || now.split('T')[0], actorId);
    }
    purchase.status = this.computePurchaseStatus(purchase);
    purchase.updatedAt = now;
    // DONE-BY AUDIT (2026-11-21): the stage issuance edited the master row
    if (actorId) purchase.updatedById = actorId;

    this.logAudit('UPDATE', 'PURCHASE_STAGE', id, `Added stage ${stageType} ${stageNumber} to purchase ${purchase.purchaseNumber}`);
    this.save();
    this.syncPurchaseToMysql(purchase);
    const stageDocIds = this.extractDocumentIds(stageInput);
    if (stageDocIds.length > 0) this.linkOrderDocuments('purchase', id, stageDocIds);
    return this.hydratePurchase(purchase);
  }

  public deletePurchase(id: string): boolean {
    const index = (this.data.purchases || []).findIndex((p) => p.id === id);
    if (index === -1) return false;
    const purchase = this.data.purchases[index];
    if (purchase.inventoryApplied) {
      this.unapplyPurchaseInventory(purchase, 'Deletion reversal for purchase');
      purchase.inventoryApplied = false;
    }
    // SERIALISED lines: deleting the purchase removes its never-moved units.
    this.removePurchaseUnits(purchase, 'Deletion of purchase');
    if (purchase.invoiceVoucherId || purchase.settlementVoucherId) {
      // Deleting a GRN'd purchase un-books its Cash & Bank vouchers.
      this.deleteLinkedVouchers(purchase, `Deletion reversal for purchase ${purchase.purchaseNumber}`);
    }
    this.data.purchases.splice(index, 1);
    this.detachPurchaseDocuments(id); // drop mappings, soft-delete orphaned docs
    this.logAudit('DELETE', 'PURCHASE', id, `Deleted purchase ${purchase.purchaseNumber}`);
    this.save();
    this.syncPurchaseToMysql(purchase, true);
    return true;
  }

  // --- BATCH MIXES (RECIPES) — 2026-11-12 ---
  // FK-only storage: output_item_id / ingredient item ids reference the items
  // master; every display name/unit is resolved at READ time (Golden Rule §2).
  private nextBatchMixNumber(): string {
    const year = new Date().getFullYear();
    const prefix = `BM-${year}-`;
    let max = 0;
    for (const m of this.data.batchMixes || []) {
      if (!String(m.mixNumber || '').startsWith(prefix)) continue;
      const n = parseInt(m.mixNumber.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  public getBatchMixes(): BatchMix[] {
    return this.data.batchMixes || [];
  }

  public getBatchMixById(id: string): BatchMix | undefined {
    return this.data.batchMixes?.find((m) => m.id === id);
  }

  /** Server-minted next mix number for the Add-Mix form prefill. */
  public peekNextBatchMixNumber(): string {
    // Mint-and-hold is unnecessary for recipes: numbering scans existing
    // mixes, so a peek that never saves just re-uses the slot.
    return this.nextBatchMixNumber();
  }

  /**
   * Validate + normalize a submitted recipe. Throws a business-rule error
   * (surfaced as an HTTP 400) when the row cannot stand as written.
   * SIZING IS PER-ROW (2026-11-12 correction): each ingredient independently
   * picks quantity (own unit) or percentage of produced output — bitumen in %
   * and LDO in MT mix freely on ONE recipe. referenceOutputQty (the one-mix
   * yield) is required as soon as ANY row is quantity-sized, since that is
   * what scales those rows on a run.
   */
  private sanitizeBatchMix(data: any): { name: string; outputItemId: string; referenceOutputQty?: number; ingredients: BatchMixIngredient[]; notes?: string; isActive: boolean } {
    const outputItemId = String(data.outputItemId || '').trim();
    const outputItem = outputItemId ? this.findItemRaw(outputItemId) : undefined;
    if (!outputItem) {
      // Report WHAT arrived so stale-client-placeholder ids are diagnosable.
      throw new Error(
        outputItemId
          ? `The selected output item (id ${outputItemId}) is not in the items master — your session may hold a stale id; re-open the mix form and re-pick the item.`
          : 'Select the item this mix produces from the items master.'
      );
    }
    // 2026-11-16 (client rule): the mix picks NO name of its own — the OUTPUT
    // ITEM identifies the recipe. A caller-supplied name is ignored in favour
    // of the item's live name (display never stored as authoritative copy on
    // read-back: the card resolves it from the items master too).
    const name = outputItem.name;
    // Legacy recipe-level basis — only a fallback for rows created before
    // per-row sizing shipped (same day); never accepted from the client now.
    const legacyBasis: 'quantity' | 'percentage' = data.basis === 'percentage' ? 'percentage' : 'quantity';

    const seen = new Set<string>();
    const ingredients: BatchMixIngredient[] = [];
    for (const raw of Array.isArray(data.ingredients) ? data.ingredients : []) {
      const itemId = String(raw.itemId || '').trim();
      if (!itemId) continue;
      if (itemId === outputItemId) throw new Error('A mix cannot consume its own output item.');
      if (seen.has(itemId)) throw new Error(`Item is listed more than once in the ingredient rows.`);
      seen.add(itemId);
      const item = this.findItemRaw(itemId);
      if (!item) {
        throw new Error(`Ingredient item (id ${itemId}) is not in the items master — re-pick it in the mix form (stale session id).`);
      }
      const rowBasis: 'quantity' | 'percentage' =
        raw.basis === 'percentage' || raw.basis === 'quantity' ? raw.basis : legacyBasis;
      if (rowBasis === 'quantity') {
        const qty = Number(raw.quantity);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Every quantity-sized ingredient needs a positive quantity (in the item's own unit).`);
        ingredients.push({ id: raw.id, itemId, basis: 'quantity', quantity: qty });
      } else {
        const pct = Number(raw.percentage);
        if (!Number.isFinite(pct) || pct <= 0) throw new Error(`Every percentage-sized ingredient needs a positive percentage of the produced output.`);
        ingredients.push({ id: raw.id, itemId, basis: 'percentage', percentage: pct });
      }
    }
    if (ingredients.length === 0) throw new Error('A mix needs at least one ingredient item.');
    const hasQtyRows = ingredients.some((ing) => ing.basis === 'quantity');
    if (hasQtyRows) {
      const refQty = Number(data.referenceOutputQty);
      if (!Number.isFinite(refQty) || refQty <= 0) throw new Error('A positive batch yield (the output of ONE mix) is required while any ingredient is sized by quantity.');
      return { name, outputItemId, referenceOutputQty: refQty, ingredients, notes: data.notes?.trim() || undefined, isActive: data.isActive !== false };
    }
    return { name, outputItemId, ingredients, notes: data.notes?.trim() || undefined, isActive: data.isActive !== false };
  }

  /**
   * ONE RECIPE PER OUTPUT ITEM (client rule, 2026-11-16): an item resolves to
   * "the" recipe by itself (sales produce-direct auto-fetch); a second ACTIVE
   * mix for the same output item is refused. Inactive mixes coexist as
   * history; re-activating a second one for an item that already has an
   * active recipe is refused the same way.
   */
  private assertSingleActiveMixForItem(outputItemId: string, excludeMixId?: string): void {
    const clash = (this.data.batchMixes || []).find(
      (m) => m.id !== excludeMixId && m.outputItemId === outputItemId && m.isActive !== false
    );
    if (!clash) return;
    const out = this.findItemRaw(outputItemId)?.name || outputItemId;
    throw new Error(`"${out}" already has an active recipe (BM ${clash.mixNumber} — ${clash.name}). One recipe per item is strict: edit that recipe or delete it instead of creating a second one.`);
  }

  public createBatchMix(data: any, actorId?: string): BatchMix {
    const clean = this.sanitizeBatchMix(data);
    this.assertSingleActiveMixForItem(clean.outputItemId);
    const newMix: BatchMix = {
      ...clean,
      id: `bmix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mixNumber: this.nextBatchMixNumber(),
      createdAt: new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21)
      createdById: actorId || (data as any).createdById,
      updatedById: actorId || (data as any).updatedById,
    };
    // Ingredient rows are server-minted ids (replaced wholesale per save).
    for (const ing of newMix.ingredients) ing.id = `bmi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.data.batchMixes = [newMix, ...(this.data.batchMixes || [])];
    this.logAudit('CREATE', 'BATCH_MIX', newMix.id, `Recipe ${newMix.mixNumber} (${newMix.name}) created: ${newMix.ingredients.length} ingredients producing ${this.findItemRaw(newMix.outputItemId)?.name}`);
    this.save();
    liveSyncBatchMix(newMix);
    return newMix;
  }

  public updateBatchMix(id: string, updates: any, actorId?: string): BatchMix | undefined {
    const idx = this.data.batchMixes?.findIndex((m) => m.id === id);
    if (idx === undefined || idx === -1) return undefined;
    // DONE-BY AUDIT (2026-11-21): the booking user never changes on an edit
    delete (updates as any).createdById;
    delete (updates as any).createdByName;
    const clean = this.sanitizeBatchMix({ ...this.data.batchMixes[idx], ...updates });
    // One-recipe-per-item holds through edits too — retargeting the output
    // item or re-activating the mix cannot steal an item that has a recipe.
    this.assertSingleActiveMixForItem(clean.outputItemId, id);
    const updated: BatchMix = {
      ...this.data.batchMixes[idx],
      ...clean,
      // Ingredient rows are FULLY REPLACED on every save — fresh ids.
      ingredients: clean.ingredients.map((ing) => ({
        ...ing,
        id: `bmi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 4)}`,
      })),
    };
    if (actorId) updated.updatedById = actorId;
    this.data.batchMixes[idx] = updated;
    this.logAudit('UPDATE', 'BATCH_MIX', id, `Recipe ${updated.mixNumber} (${updated.name}) updated`);
    this.save();
    liveSyncBatchMix(updated);
    return updated;
  }

  public deleteBatchMix(id: string): boolean {
    const idx = this.data.batchMixes?.findIndex((m) => m.id === id);
    if (idx === undefined || idx === -1) return false;
    const mix = this.data.batchMixes[idx];
    const usedByRun = (this.data.productionBatches || []).some((b) => b.batchMixId === id);
    if (usedByRun) throw new Error('This mix is used by recorded production runs and cannot be deleted — mark it inactive instead.');
    this.data.batchMixes.splice(idx, 1);
    this.logAudit('DELETE', 'BATCH_MIX', id, `Recipe ${mix.mixNumber} (${mix.name}) deleted`);
    this.save();
    liveSyncBatchMix(mix, true);
    return true;
  }

  // ==========================================================================
  // TRACKABLE INVENTORY (2026-11-13) — asset-type items are catalog headers;
  // every physical unit is one register row. Aggregate stock NEVER applies:
  // count = COUNT(units WHERE status = 'in_stock'), computed by JOIN. Every
  // reference is an FK (item / location / vehicle / supplier / sale) and the
  // lifecycle posts into an append-only event log.
  // ==========================================================================
  public getInventoryUnits(): InventoryUnit[] {
    return this.data.inventoryUnits || [];
  }

  public getInventoryUnitById(id: string): InventoryUnit | undefined {
    return this.data.inventoryUnits?.find((u) => u.id === id);
  }

  public getInventoryUnitEvents(unitId?: string): InventoryUnitEvent[] {
    const events = this.data.inventoryUnitEvents || [];
    return unitId ? events.filter((e) => e.unitId === unitId) : events;
  }

  /** An asset item must exist AND be type 'asset' (stock items can carry
   *  aggregate stock and never belong in the unit register). */
  private requireAssetItem(itemId: string): Item {
    const key = String(itemId || '').trim();
    const item = this.findItemRaw(key);
    if (!item) throw new Error('The trackable item no longer exists in the items master.');
    if (item.type !== 'asset') throw new Error(`"${item.name}" is not a trackable (asset) item — only asset-type items own a unit register.`);
    return item;
  }

  /** Validate an optional FK payload member against its master. */
  private requireRef<T extends { id: string }>(collection: T[] | undefined, id: string | undefined, label: string): T | undefined {
    if (!id) return undefined;
    const found = collection?.find((x: T) => x.id === id);
    if (!found) throw new Error(`${label} not found — pick it from the master.`);
    return found;
  }

  /** Shared serial rule: unique WITHIN the item master (two different items
   *  may both carry serial T-100; one item's units may not). */
  private assertSerialFree(itemId: string, serial: string, ignoreUnitId?: string): void {
    const key = serial.trim().toLowerCase();
    const clash = this.data.inventoryUnits?.find(
      (u) => u.itemId === itemId && String(u.serialNumber).trim().toLowerCase() === key && u.id !== ignoreUnitId
    );
    if (clash) {
      throw new Error(`Serial "${serial}" is already registered for this item${ignoreUnitId ? ' — edit the unit instead of duplicating it' : ''}.`);
    }
  }

  // ==========================================================================
  // DYNAMIC ATTRIBUTES (serialized inventory, 2026-11-16)
  // A trackable (asset) item declares which per-unit fields exist. Fixed facts
  // stay columns (serial, supplier, purchase date, cost); everything else is
  // one of the item's KEYS (text/number/date/select). Units store their values
  // by key; the item's key list may grow and change while units live.
  // ==========================================================================

  /** Slug for an attribute key (stable identifier in the unit's value map). */
  private attrKeySlug(label: string): string {
    return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `key-${Date.now().toString(36)}`;
  }

  /** Validates + normalizes an item's attribute-key list. */
  private sanitizeItemAttributes(input: any): ItemAttributeKey[] {
    const rows: ItemAttributeKey[] = [];
    const seenKeys = new Set<string>();
    const seenLabels = new Set<string>();
    for (const raw of Array.isArray(input) ? input : []) {
      const label = String(raw?.label ?? raw?.name ?? '').trim();
      if (!label) continue;
      const lowerLabel = label.toLowerCase();
      if (seenLabels.has(lowerLabel)) continue; // silently dedupe repeats
      seenLabels.add(lowerLabel);
      const type = ['text', 'number', 'date', 'select'].includes(raw?.type) ? raw.type : 'text';
      const options = Array.isArray(raw.options)
        ? raw.options.map((o: any) => String(o).trim()).filter(Boolean)
        : [];
      if (type === 'select' && options.length === 0) {
        throw new Error(`Attribute "${label}" is a pick-list — add at least one option value.`);
      }
      let key = raw?.key ? String(raw.key).trim() : undefined;
      if (!key) key = this.attrKeySlug(label);
      while (seenKeys.has(key)) key = `${key}-2`;
      seenKeys.add(key);
      rows.push({
        key,
        label,
        type: type as ItemAttributeKey['type'],
        ...(type === 'select' ? { options } : {}),
        ...(raw?.required ? { required: true } : {}),
      });
    }
    return rows;
  }

  /**
   * Validates a unit entry's attribute VALUES against the owning item's key
   * list — typed coercion + required enforcement. Unknown keys (no longer
   * declared) are carried along if the unit already stored them, so legacy
   * data is not lost when keys change; they just don't render as columns.
   */
  private validateUnitAttributes(data: any, itemId: string, existingUnit?: InventoryUnit): Partial<InventoryUnit> {
    const item = this.findItemRaw(itemId);
    if (!item) throw new Error('The owning item no longer exists.');
    const inMap = (data?.attributes && typeof data.attributes === 'object' && !Array.isArray(data.attributes))
      ? data.attributes
      : {};
    const out: Record<string, string | number> = {};
    const declared: ItemAttributeKey[] = Array.isArray(item.attributes) ? item.attributes : [];
    for (const keyDef of declared) {
      const raw = inMap[keyDef.key];
      const filled = raw !== undefined && raw !== null && String(raw).trim() !== '';
      if (keyDef.required && !filled) {
        throw new Error(`"${keyDef.label}" is required for every ${item.name} entry.`);
      }
      if (!filled) continue;
      if (keyDef.type === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`"${keyDef.label}" must be a number.`);
        out[keyDef.key] = n;
      } else if (keyDef.type === 'select') {
        const v = String(raw).trim();
        if (!keyDef.options?.includes(v)) {
          throw new Error(`"${keyDef.label}" must be one of: ${(keyDef.options || []).join(', ')}.`);
        }
        out[keyDef.key] = v;
      } else {
        out[keyDef.key] = String(raw).trim();
      }
    }
    // Preserve stored values whose keys were removed from the master (legacy)
    for (const [k, v] of Object.entries(existingUnit?.attributes || {})) {
      if (declared.some((d) => d.key === k)) continue;
      out[k] = v as string | number;
    }
    return Object.keys(out).length > 0 ? { attributes: out } : { attributes: undefined };
  }

  private validateUnitPayload(data: any, itemId: string): Partial<InventoryUnit> {
    const patch: Partial<InventoryUnit> = {};
    if (data.supplierId !== undefined) {
      // supplier FK (parties master) — an explicit '' clears it
      patch.supplierId = this.requireRef(this.data.parties, data.supplierId?.trim() || undefined, 'Supplier')?.id;
    }
    if (data.locationId !== undefined) {
      // storage-location FK (item_locations master); '' clears it
      patch.locationId = this.requireRef(this.data.locations, data.locationId?.trim() || undefined, 'Storage location')?.id;
    }
    if (data.purchaseDate !== undefined) patch.purchaseDate = data.purchaseDate?.trim() || undefined;
    if (data.purchaseCost !== undefined) patch.purchaseCost = data.purchaseCost === null || data.purchaseCost === '' ? undefined : Number(data.purchaseCost);
    if (data.warrantyExpiry !== undefined) patch.warrantyExpiry = data.warrantyExpiry?.trim() || undefined;
    if (data.condition !== undefined) {
      patch.condition = ['excellent', 'good', 'worn', 'damaged'].includes(data.condition) ? data.condition : undefined;
    }
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || undefined;
    // Purchase linkage (FK to the purchase that received the unit)
    if (data.purchaseId !== undefined) patch.purchaseId = data.purchaseId?.trim() || undefined;
    // DYNAMIC ATTRIBUTES (2026-11-16): validated + coerced against the owning
    // item's declared key list (required enforcement, number/select types).
    if (data.attributes !== undefined) {
      const existingUnit = data.id ? this.data.inventoryUnits?.find((u) => u.id === data.id) : undefined;
      const attrPatch = this.validateUnitAttributes({ attributes: data.attributes }, itemId, existingUnit);
      patch.attributes = attrPatch.attributes;
    }
    if (data.serialNumber !== undefined) {
      const serial = String(data.serialNumber || '').trim();
      if (!serial) throw new Error('A serial number is required — the unit register tracks uniqueness by it.');
      patch.serialNumber = serial;
      this.assertSerialFree(itemId, serial, data.id);
    }
    return patch;
  }

  /**
   * Register ONE physical unit of an asset item. Always enters at `in_stock`
   * (GRN capture / manual entry / legacy backfill) with an 'entered' event.
   */
  public createInventoryUnit(data: any, actorId?: string): InventoryUnit {
    const itemId = String(data.itemId || '').trim();
    const item = this.requireAssetItem(itemId);
    const serial = String(data.serialNumber || '').trim();
    if (!serial) throw new Error('A serial number is required — the register tracks uniqueness by it.');
    this.assertSerialFree(itemId, serial);

    const now = new Date().toISOString();
    const unit: InventoryUnit = {
      id: `iu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemId,
      serialNumber: serial,
      status: 'in_stock',
      createdAt: now,
      updatedAt: now,
      ...this.validateUnitPayload({ ...data, id: undefined, itemId, serialNumber: serial }, itemId),
    };
    // DONE-BY AUDIT (2026-11-21): the session user who registered the unit
    // (a client/seed caller may carry its own fallback id)
    unit.createdById = actorId || (data as any).createdById;
    unit.updatedById = actorId || (data as any).updatedById;

    const event: InventoryUnitEvent = {
      id: `iue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      unitId: unit.id,
      date: now,
      type: 'entered',
      notes: data.entryNotes?.trim() || (data.source === 'purchase_grn' ? 'Captured on goods receipt' : 'Manually registered'),
      supplierId: unit.supplierId,
      locationId: unit.locationId,
      createdAt: now,
      // DONE-BY AUDIT (2026-11-21): the registrant; a GRN-captured unit carries
      // the purchase save's acting user
      ...(actorId ? { createdById: actorId } : {}),
    };

    this.data.inventoryUnits = [unit, ...(this.data.inventoryUnits || [])];
    this.data.inventoryUnitEvents = [event, ...(this.data.inventoryUnitEvents || [])];
    this.logAudit('CREATE', 'INVENTORY_UNIT', unit.id, `Unit ${unit.serialNumber} of ${item.name} registered (${unit.status})`);
    this.save();
    liveSyncInventoryUnit(unit);
    liveSyncInventoryUnitEvent(event);
    return unit;
  }

  /** Register N units at once (purchase GRN with serials / legacy backfill). */
  public createInventoryUnitsBulk(entries: any[], actorId?: string): InventoryUnit[] {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error('No units to register.');
    return entries.map((e) => this.createInventoryUnit(e, actorId));
  }

  /**
   * Edit a unit's procurement/condition facts. The lifecycle fields (status,
   * vehicle, sale linkage) are NOT editable here — lifecycle moves through the
   * explicit endpoints so every transition lands in the event log.
   */
  public updateInventoryUnit(id: string, updates: any, actorId?: string): InventoryUnit {
    const unit = this.data.inventoryUnits?.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    // DONE-BY AUDIT (2026-11-21): a register edit never rewrites the
    // registrant (strip client forgery); updatedById moves with a real actor.
    delete (updates as any).createdById;
    delete (updates as any).updatedById;
    delete (updates as any).createdByName;
    delete (updates as any).updatedByName;
    const item = this.findItemRaw(unit.itemId);

    for (const locked of ['status', 'vehicleId', 'position', 'fitOdometer', 'saleId', 'itemId']) {
      if (updates[locked] !== undefined && updates[locked] !== unit[locked as keyof InventoryUnit]) {
        throw new Error(`"${locked}" is a lifecycle field — use the dedicated deploy / return / sell / scrap actions.`);
      }
    }
    const patch = this.validateUnitPayload({ ...updates, id, serialNumber: updates.serialNumber ?? unit.serialNumber }, unit.itemId);
    // Storage only applies while the unit sits on the shelf.
    if (unit.status !== 'in_stock' && patch.locationId !== undefined) {
      delete patch.locationId;
    }
    const updated: InventoryUnit = { ...unit, ...patch, updatedAt: new Date().toISOString(), ...(actorId ? { updatedById: actorId } : {}) };
    const idx = this.data.inventoryUnits!.findIndex((u) => u.id === id);
    this.data.inventoryUnits![idx] = updated;
    this.logAudit('UPDATE', 'INVENTORY_UNIT', id, `Unit ${updated.serialNumber} of ${item?.name} updated`);
    this.save();
    liveSyncInventoryUnit(updated);
    return updated;
  }

  /** Append one lifecycle event for a unit (shared shape for the moves below). */
  private postUnitEvent(unit: InventoryUnit, type: InventoryUnitEventType, ctx: {
    notes?: string; vehicleId?: string; position?: string; odometer?: number; locationId?: string; saleId?: string;
  }, actorId?: string): InventoryUnitEvent {
    const now = new Date().toISOString();
    const event: InventoryUnitEvent = {
      id: `iue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      unitId: unit.id,
      date: now,
      type,
      notes: ctx.notes?.trim() || undefined,
      vehicleId: ctx.vehicleId,
      position: ctx.position,
      odometer: ctx.odometer,
      locationId: ctx.locationId,
      saleId: ctx.saleId,
      createdAt: now,
      // DONE-BY AUDIT (2026-11-21): the operator who performed the movement
      ...(actorId ? { createdById: actorId } : {}),
    };
    this.data.inventoryUnitEvents = [event, ...(this.data.inventoryUnitEvents || [])];
    liveSyncInventoryUnitEvent(event);
    return event;
  }

  /** Fit the unit onto a fleet vehicle (position + odometer at fitment).
   *  TYRE AWARENESS (client directive, 2026-11-17): a unit of a tyre-named
   *  item MUST carry one of the 12 dumper positions (FL/FR/L1..L5/R1..R5)
   *  and each position holds at most one fitted unit per vehicle; every
   *  OTHER unit may ride a vehicle but never a position (it is stripped). */
  public deployInventoryUnit(id: string, data: any, actorId?: string): InventoryUnit {
    const unit = this.data.inventoryUnits?.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    if (unit.status !== 'in_stock') throw new Error(`Unit ${unit.serialNumber} is already ${unit.status.replace('_', ' ')} — only in-stock units can be deployed.`);
    const vehicleId = String(data.vehicleId || data.vehicle_id || '').trim();
    if (!vehicleId) throw new Error('Pick the vehicle (or mark the unit as in use) for this deploy.');
    const vehicle = this.requireRef(this.data.vehicles, vehicleId, 'Vehicle');
    if (!vehicle) throw new Error('Vehicle not found — pick it from the fleet master.');

    const item = this.findItemRaw(unit.itemId);
    const isTyre = isTyreItemName(item?.name);

    let position: string | undefined;
    if (isTyre) {
      const raw = String(data.position || '').trim();
      if (!raw) throw new Error(`Tyre ${unit.serialNumber} must be fitted at a wheel position — pick one of FL, FR, L1..L5, R1..R5.`);
      position = raw.toUpperCase();
      if (!TYRE_POSITIONS.includes(position as any)) {
        throw new Error(`"${raw}" is not a valid tyre position — pick one of FL, FR, L1..L5, R1..R5.`);
      }
      const occupied = (this.data.inventoryUnits || []).find(
        (u) => u.id !== id && u.vehicleId === vehicleId && (u.position || '').toUpperCase() === position,
      );
      if (occupied) {
        throw new Error(`Position ${position} on ${vehicle.vehicleNo} is already occupied by unit ${occupied.serialNumber} — unload it first.`);
      }
    }

    const contextLocation = unit.locationId;
    unit.status = 'deployed';
    unit.vehicleId = vehicleId;
    unit.position = position ?? undefined;
    unit.fitOdometer = data.odometer !== undefined && data.odometer !== null && data.odometer !== '' ? Number(data.odometer) : unit.fitOdometer;
    unit.updatedAt = new Date().toISOString();
    if (actorId) unit.updatedById = actorId;
    this.postUnitEvent(unit, 'deployed', {
      notes: data.notes?.trim() || data.deployNotes?.trim() || `${item?.name || 'Unit'} ${unit.serialNumber} mounted on ${(vehicle as any).vehicleNo || 'vehicle'}${unit.position ? ` @ ${unit.position}` : ''}${unit.fitOdometer ? ` @ ${unit.fitOdometer} km` : ''}`,
      vehicleId,
      position: unit.position,
      odometer: unit.fitOdometer,
      locationId: contextLocation,
    }, actorId);
    this.logAudit('UPDATE', 'INVENTORY_UNIT', id, `Unit ${unit.serialNumber} (${item?.name}) deployed to vehicle`);
    this.save();
    liveSyncInventoryUnit(unit);
    return unit;
  }

  /** Take the unit off the vehicle back into stock. */
  public returnInventoryUnit(id: string, data: any, actorId?: string): InventoryUnit {
    const unit = this.data.inventoryUnits?.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    if (unit.status !== 'deployed') throw new Error(`Unit ${unit.serialNumber} is not deployed (${unit.status.replace('_', ' ')}).`);
    const lastVehicleId = unit.vehicleId;
    const lastPosition = unit.position;
    const odometer = data.odometer !== undefined && data.odometer !== null && data.odometer !== '' ? Number(data.odometer) : undefined;
    const locationId = this.requireRef(this.data.locations, data.locationId?.trim() || undefined, 'Storage location')?.id;
    unit.status = 'in_stock';
    unit.vehicleId = undefined;
    unit.position = undefined;
    if (locationId) unit.locationId = locationId;
    if (data.condition && ['excellent', 'good', 'worn', 'damaged'].includes(data.condition)) unit.condition = data.condition;
    unit.updatedAt = new Date().toISOString();
    if (actorId) unit.updatedById = actorId;
    this.postUnitEvent(unit, 'returned', {
      notes: data.notes?.trim() || 'Removed from vehicle back to storage',
      vehicleId: lastVehicleId,
      position: lastPosition,
      odometer,
      locationId: unit.locationId,
    }, actorId);
    this.logAudit('UPDATE', 'INVENTORY_UNIT', id, `Unit ${unit.serialNumber} returned to stock`);
    this.save();
    liveSyncInventoryUnit(unit);
    return unit;
  }

  /** Send the unit for upkeep (retreading, rebore, repair). The deployment
   *  context is kept — a tyre may be retreaded while it stays where it was. */
  public maintainInventoryUnit(id: string, data: any, actorId?: string): InventoryUnit {
    const unit = this.data.inventoryUnits?.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    if (unit.status === 'maintenance') throw new Error(`Unit ${unit.serialNumber} is already in maintenance.`);
    if (unit.status === 'sold' || unit.status === 'scrapped') throw new Error(`Unit ${unit.serialNumber} has left the register (sold/scrapped) — maintenance is not possible.`);
    unit.status = 'maintenance';
    unit.updatedAt = new Date().toISOString();
    if (actorId) unit.updatedById = actorId;
    this.postUnitEvent(unit, 'maintenance', { notes: data?.notes?.trim() || data?.maintenanceNotes?.trim() || 'Sent for maintenance / retreading', vehicleId: unit.vehicleId, locationId: unit.locationId }, actorId);
    this.logAudit('UPDATE', 'INVENTORY_UNIT', id, `Unit ${unit.serialNumber} sent for maintenance`);
    this.save();
    liveSyncInventoryUnit(unit);
    return unit;
  }

  /** Bring a unit out of maintenance back into stock. */
  public restoreInventoryUnit(id: string, data: any, actorId?: string): InventoryUnit {
    const unit = this.data.inventoryUnits?.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    if (unit.status !== 'maintenance') throw new Error(`Unit ${unit.serialNumber} is not in maintenance.`);
    const locationId = this.requireRef(this.data.locations, data?.locationId?.trim() || undefined, 'Storage location')?.id;
    unit.status = 'in_stock';
    if (locationId) unit.locationId = locationId;
    if (data?.condition && ['excellent', 'good', 'worn', 'damaged'].includes(data.condition)) unit.condition = data.condition;
    unit.updatedAt = new Date().toISOString();
    if (actorId) unit.updatedById = actorId;
    this.postUnitEvent(unit, 'restored', {
      notes: data?.notes?.trim() || data?.maintenanceNotes?.trim() || 'Returned from maintenance',
      locationId: unit.locationId,
    }, actorId);
    this.logAudit('UPDATE', 'INVENTORY_UNIT', id, `Unit ${unit.serialNumber} restored from maintenance`);
    this.save();
    liveSyncInventoryUnit(unit);
    return unit;
  }

  /** Retire the unit permanently (beyond repair / beyond use). */
  public scrapInventoryUnit(id: string, data: any, actorId?: string): InventoryUnit {
    const unit = this.data.inventoryUnits?.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    if (unit.status === 'sold') throw new Error(`Unit ${unit.serialNumber} was already sold.`);
    if (unit.status === 'scrapped') throw new Error(`Unit ${unit.serialNumber} is already scrapped.`);
    // CLIENT DIRECTIVE (2026-11-17): an ASSIGNED unit (tyre fitted on a
    // vehicle) cannot be scrapped — it must be unloaded to stock first.
    if (unit.status === 'deployed') {
      const veh = (this.data.vehicles || []).find((v: any) => v.id === unit.vehicleId);
      throw new Error(`Unit ${unit.serialNumber} cannot be scrapped — it is still assigned to ${veh?.vehicleNo || 'its vehicle'}; unload it to spare stock first.`);
    }
    const lastVehicleId = unit.vehicleId;
    const lastPosition = unit.position;
    unit.status = 'scrapped';
    unit.vehicleId = undefined;
    unit.position = undefined;
    unit.updatedAt = new Date().toISOString();
    if (actorId) unit.updatedById = actorId;
    const item = this.findItemRaw(unit.itemId);
    this.postUnitEvent(unit, 'scrapped', {
      notes: data?.notes?.trim() || data?.reason?.trim() || `Unit ${unit.serialNumber} scrapped`,
      vehicleId: lastVehicleId,
      position: lastPosition,
      locationId: unit.locationId,
    }, actorId);
    this.logAudit('UPDATE', 'INVENTORY_UNIT', id, `Unit ${unit.serialNumber} (${item?.name}) scrapped`);
    this.save();
    liveSyncInventoryUnit(unit);
    return unit;
  }

  /** UN-SCRAP (2026-11-17) — bring a scrapped unit back to spare stock. The
   *  reverse of scrapping; a SOLD unit can never come back (no unscrap path
   *  once a unit carries a saleId). */
  public unscrapInventoryUnit(id: string, data: any, actorId?: string): InventoryUnit {
    const unit = this.data.inventoryUnits?.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    if (unit.status !== 'scrapped') throw new Error(`Unit ${unit.serialNumber} cannot be unscrapped — it is not scrapped (current: ${unit.status.replace('_', ' ')}).`);
    unit.status = 'in_stock';
    unit.updatedAt = new Date().toISOString();
    if (actorId) unit.updatedById = actorId;
    const item = this.findItemRaw(unit.itemId);
    this.postUnitEvent(unit, 'unscrapped', {
      notes: data?.notes?.trim() || `Unit ${unit.serialNumber} unscrapped — back to spare stock`,
      locationId: unit.locationId,
    }, actorId);
    this.logAudit('UPDATE', 'INVENTORY_UNIT', id, `Unit ${unit.serialNumber} (${item?.name}) unscrapped`);
    this.save();
    liveSyncInventoryUnit(unit);
    return unit;
  }

  /**
   * Remove a unit from the register. Allowed ONLY while it sits in stock with
   * no lifecycle beyond its 'entered' event — units with deployment /
   * sale / scrap history are audit records, never deletable.
   */
  public deleteInventoryUnit(id: string): boolean {
    const unit = this.data.inventoryUnits?.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    if (unit.status !== 'in_stock') {
      throw new Error(`Unit ${unit.serialNumber} has lifecycle history (${unit.status.replace('_', ' ')}) — it cannot be deleted.`);
    }
    const item = this.findItemRaw(unit.itemId);
    this.data.inventoryUnits = this.data.inventoryUnits!.filter((u) => u.id !== id);
    this.data.inventoryUnitEvents = (this.data.inventoryUnitEvents || []).filter((e) => e.unitId !== id);
    this.logAudit('DELETE', 'INVENTORY_UNIT', id, `Unit ${unit.serialNumber} of ${item?.name} removed from the register`);
    this.save();
    liveSyncInventoryUnit(unit, true);
    liveSyncInventoryUnitEventsBulk(id);
    return true;
  }

  /**
   * Sale-ladder hook (called by the sales flow later): mark the given units
   * as SOLD against one sale. Units currently deployed are released; each
   * unit gets a 'sold' event carrying the sale FK. `notes` is the caller's
   * narrative (e.g. "Sold against sale RST 00012").
   */
  public markUnitsSold(unitIds: string[], saleId: string, notes?: string, actorId?: string): InventoryUnit[] {
    if (!Array.isArray(unitIds) || unitIds.length === 0) return [];
    const sale = this.data.sales?.find((s) => s.id === saleId);
    if (!sale) throw new Error('Sale not found — cannot book the unit sale.');
    const eventNotes = notes?.trim() || `Sold against sale ${sale.saleNumber}`;
    const sold: InventoryUnit[] = [];
    for (const raw of unitIds) {
      const unit = this.data.inventoryUnits?.find((u) => u.id === raw);
      if (!unit) throw new Error('One of the units no longer exists.');
      if (unit.status === 'sold') throw new Error(`Unit ${unit.serialNumber} is already sold — a unit sale cannot be undone.`);
      const item = this.findItemRaw(unit.itemId);
      // CLIENT DIRECTIVE (2026-11-17): TYRES are sold only from SCRAP — an
      // in-stock/fitted tyre cannot be sold directly. Every other serialised
      // item keeps its pre-existing rule (in stock / deployed, never scrapped).
      if (isTyreItemName(item?.name)) {
        if (unit.status !== 'scrapped') {
          throw new Error(`Tyre ${unit.serialNumber} cannot be sold while ${unit.status.replace('_', ' ')} — mark it scrapped first; only scrapped tyres can be sold.`);
        }
      } else if (unit.status === 'scrapped') {
        throw new Error(`Unit ${unit.serialNumber} was scrapped — it cannot be sold.`);
      }
      // Capture the last context (before mutation) so the event records it.
      const ctx = { vehicleId: unit.vehicleId, locationId: unit.locationId };
      unit.status = 'sold';
      unit.saleId = saleId;
      unit.updatedAt = new Date().toISOString();
      if (actorId) unit.updatedById = actorId;
      this.postUnitEvent(unit, 'sold', { notes: eventNotes, ...ctx, saleId }, actorId);
      this.logAudit('UPDATE', 'INVENTORY_UNIT', unit.id, `Unit ${unit.serialNumber} (${item?.name}) sold via ${sale.saleNumber}`);
      liveSyncInventoryUnit(unit);
      sold.push(unit);
    }
    this.save();
    return sold;
  }

  /** Server-minted run number for production batches (BTN-26/NNN style). */
  private nextBatchNumber(): string {
    const year = new Date().getFullYear();
    const prefix = `BTN-${year}-`;
    let max = 0;
    for (const b of this.data.productionBatches || []) {
      if (!String(b.batchNumber || '').startsWith(prefix)) continue;
      const n = parseInt(b.batchNumber.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  // --- PRODUCTION BATCHES ---
  public getProductionBatches(): ProductionBatchRun[] {
    return this.data.productionBatches;
  }

  /**
   * Recipe-driven production (2026-11-12): one POST posts ONE recipe run.
   * The run is locked to the mix — the caller picks the mix + the produced
   * quantity (+ date/supervisor/notes); the server resolves every ingredient
   * quantity by THAT ROW's sizing basis (per-row, not recipe-level):
   *   - 'quantity' row: consumed = stored qty × (produced / referenceOutputQty)
   *   - 'percentage' row: consumed = percentage% × produced
   * Every consumed qty keeps its own item's unit; consumption leaves the FIFO
   * lots at blended cost and the OUTPUT lot is valued at exactly what the run
   * consumed (total consumed value / produced qty — FIFO, no averaging).
   * @param batchData { batchMixId, targetQuantity (+ optional batchNumber,
   *                   date, plantUnit, supervisorName, mixTemperatureCelsius,
   *                   notes) }
   */
  public createProductionBatch(batchData: any, actorId?: string): ProductionBatchRun {
    const mixId = String(batchData.batchMixId || '').trim();
    const mix = this.data.batchMixes?.find((m) => m.id === mixId);
    if (!mix) throw new Error('Batch mix not found — pick the recipe this run is producing.');
    if (mix.isActive === false) throw new Error('This mix is inactive — reactivate it (or pick another recipe) before recording production.');
    const producedQty = Number(batchData.targetQuantity ?? batchData.producedQuantity);
    if (!Number.isFinite(producedQty) || producedQty <= 0) throw new Error('Produced quantity must be a positive number.');
    const outputItem = this.findItemRaw(mix.outputItemId);
    if (!outputItem) throw new Error(`The mix's output item no longer exists in the items master.`);

    // One-mix yield anchors the QUANTITY-sized rows (per-row basis, 2026-11-12
    // correction — percentage rows need no anchor).
    const refQty = Number(mix.referenceOutputQty) || 0;
    const hasQtyRows = (mix.ingredients || []).some((ing) => (ing.basis || 'quantity') === 'quantity');
    if (hasQtyRows && refQty <= 0) {
      throw new Error(`Mix ${mix.mixNumber} has quantity-sized ingredients but no batch yield — fix the recipe first.`);
    }
    const qtyScale = refQty > 0 ? producedQty / refQty : 0;

    // Resolve every consumed line from the mix (locked to recipe — no client
    // quantity overrides are accepted). Service-type ingredients record on
    // the run but post NO stock movement (services have no stock ledger).
    // Sourcing locations (2026-11-13): each material line specifies WHERE its
    // qty leaves stock — the caller sends itemLocations[{itemId, locationId|
    // locationName}]; the server resolves it against the item's assigned
    // locations and the deduction applies to that location's stock bucket.
    const locChoices = new Map<string, { locationId?: string; locationName?: string }>();
    for (const e of Array.isArray(batchData.itemLocations) ? batchData.itemLocations : []) {
      if (e && e.itemId) locChoices.set(String(e.itemId), e);
    }
    const resolveSourcingLocation = (item: Item, choice?: { locationId?: string; locationName?: string }) => {
      if (!choice) return {};
      // Assigned locations only (the item's stock breakdown / legacy CSV),
      // mirroring STOCK ADJUSTMENTS — a master location the item never
      // tracks is not a valid source.
      let breakdown: ItemLocationStock[] = (item.locations || [])
        .filter((l) => l.locationName && l.locationName.trim())
        .map((l) => ({ ...l, locationName: l.locationName.trim() }));
      if (breakdown.length === 0 && item.stockLocation) {
        breakdown = item.stockLocation.split(',').map((s) => s.trim()).filter(Boolean)
          .map((name) => ({ locationName: name, currentStock: 0 }));
      }
      if (breakdown.length === 0) return {};
      let entry = choice.locationId
        ? breakdown.find((l) => l.locationId === choice.locationId)
        : undefined;
      if (!entry && choice.locationName) {
        entry = breakdown.find(
          (l) => l.locationName.toLowerCase() === String(choice.locationName).trim().toLowerCase()
        );
      }
      if (!entry) {
        throw new Error(
          `"${choice.locationName || choice.locationId}" is not a storage location assigned to ${item.name} — pick one of the item's assigned locations.`
        );
      }
      return {
        locationId: entry.locationId
          || this.data.locations?.find(
            (ml) => (ml.name || '').trim().toLowerCase() === entry!.locationName.toLowerCase()
          )?.id,
        locationName: entry.locationName,
      };
    };
    const consumedLines = (mix.ingredients || []).map((ing) => {
      const item = this.findItemRaw(ing.itemId);
      if (!item) throw new Error(`Ingredient item of mix ${mix.mixNumber} no longer exists — fix the recipe first.`);
      const rowBasis = ing.basis || 'quantity';
      const qty = rowBasis === 'percentage'
        ? (Number(ing.percentage) || 0) * (producedQty / 100)
        : (Number(ing.quantity) || 0) * qtyScale;
      const sourcing = item.type === 'service'
        ? {}
        : resolveSourcingLocation(item, locChoices.get(ing.itemId));
      return {
        itemId: ing.itemId,
        quantity: Number(qty.toFixed(4)),
        percentage: rowBasis === 'percentage' ? Number(ing.percentage) : undefined,
        ...sourcing,
      };
    });
    for (const line of consumedLines) {
      if (line.quantity <= 0) throw new Error(`Resolving the recipe against ${producedQty} ${outputItem.unit} produced a non-positive quantity for one ingredient — check the mix's batch yield / percentages.`);
    }

    const newId = `pbr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const batchNumber = String(batchData.batchNumber || '').trim() || this.nextBatchNumber();
    // PRODUCE-&-SELL-DIRECTLY (2026-11-16): a run created from a sales order
    // carries the sale FKs and SKIPS the output lot inward — the output sells
    // straight off the run (the sale line posts no dispatch either). The run
    // still snapshots its costing (output_rate = what one unit consumed).
    const directSale = Boolean(batchData.skipOutputLot || batchData.saleId);
    const newBatch: ProductionBatchRun = {
      id: newId,
      batchNumber,
      date: batchData.date || new Date().toISOString().slice(0, 10),
      plantUnit: batchData.plantUnit || '',
      targetItemId: outputItem.id,
      targetItemName: outputItem.name,
      targetQuantity: producedQty,
      unit: outputItem.unit,
      rawMaterialsConsumed: consumedLines,
      batchMixId: mix.id,
      mixName: mix.name,
      supervisorName: batchData.supervisorName?.trim() || undefined,
      mixTemperatureCelsius: batchData.mixTemperatureCelsius ? Number(batchData.mixTemperatureCelsius) : undefined,
      saleId: directSale ? String(batchData.saleId || '') || undefined : undefined,
      saleItemId: directSale ? String(batchData.saleItemId || '') || undefined : undefined,
      directSale: directSale || undefined,
      notes: batchData.notes?.trim() || undefined,
      createdAt: new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21): the session user who recorded the run
      // (a sale-driven direct run carries the sale's acting user)
      createdById: actorId || (batchData as any).createdById,
      updatedById: actorId || (batchData as any).updatedById,
    };

    // Output placement (2026-11-13): the produced lot lands in a chosen stock
    // location. When the caller omits it and the output item tracks assigned
    // locations, default to its FIRST ASSIGNED — an unscoped inward would
    // strand the increase (currentStock is recomputed from the breakdown).
    // A DIRECT-SALE run posts NO output inward at all (client rule: the output
    // is sold straight off the run) — placement resolution is skipped.
    if (!directSale) {
      const outputChoice = (batchData.outputLocationId || batchData.outputLocationName)
        ? { locationId: batchData.outputLocationId, locationName: batchData.outputLocationName }
        : (outputItem.locations || [])
            .filter((l) => l.locationName && l.locationName.trim())
            .map((l) => ({ locationId: l.locationId, locationName: l.locationName.trim() }))[0];
      const outputLoc = resolveSourcingLocation(outputItem, outputChoice);

      // Consumption first (FIFO outward) — the consumed value drives the
      // output lot's rate: exactly what the run consumed per unit (FIFO, no
      // averaging). With zero value (no costed lots anywhere) the movement
      // falls back to the item's catalog cost chain like any legacy row.
      const consumed = this.applyConsumptionMovements(newBatch);
      const outputRate = consumed.totalValue > 0 ? consumed.totalValue / producedQty : undefined;
      newBatch.outputValue = consumed.totalValue > 0 ? consumed.totalValue : undefined;
      newBatch.outputRate = outputRate;
      this.applyBatchOutputMovement(newBatch, outputRate, outputLoc.locationName);
    } else {
      // Direct-sale run: consumption still posts (real raw material leaving
      // stock); the consumed value is snapshot as the run's costing — the sale
      // revenue sits against it on the P&L without a phantom stock lot.
      const consumed = this.applyConsumptionMovements(newBatch);
      newBatch.outputValue = consumed.totalValue > 0 ? consumed.totalValue : undefined;
      newBatch.outputRate =
        newBatch.outputValue !== undefined ? newBatch.outputValue / producedQty : undefined;
    }

    this.data.productionBatches.unshift(newBatch);
    this.logAudit(
      'CREATE',
      'PRODUCTION_BATCH',
      newId,
      directSale
        ? `Produced ${newBatch.targetQuantity} ${newBatch.unit} of ${newBatch.targetItemName} via recipe ${mix.mixNumber} (${mix.name}) — DIRECT SALE (output not stocked; raw-material consumption posted)`
        : `Produced ${newBatch.targetQuantity} ${newBatch.unit} of ${newBatch.targetItemName} via recipe ${mix.mixNumber} (${mix.name})`
    );
    this.save();
    liveSyncBatch(newBatch);
    return newBatch;
  }

  /**
   * Post a batch's ledger movements (FIFO outward consumption + inward
   * output) and return the TOTAL VALUE of what was actually consumed.
   * adjustItemStock computes each outward's blended FIFO rate internally and
   * unshifts its ledger row, so the row at stockMovements[0] right after a
   * call carries that row's movement_value.
   */
  private applyConsumptionMovements(batch: ProductionBatchRun): { totalValue: number } {
    let totalConsumedValue = 0;
    for (const raw of batch.rawMaterialsConsumed) {
      // Service-type ingredients (e.g. plant hire) ride on the run document
      // but post NO stock movement — services have no stock ledger.
      if (this.findItemRaw(raw.itemId)?.type === 'service') continue;
      try {
        this.adjustItemStock(
          raw.itemId,
          -raw.quantity,
          'production_consumed',
          batch.batchNumber,
          `Consumed in batch ${batch.batchNumber}`,
          raw.locationName,
          undefined,
          undefined,
          batch.id,
        );
        const movement = this.data.stockMovements?.[0];
        totalConsumedValue += movement?.itemId === raw.itemId ? (movement.movementValue || 0) : 0;
      } catch (e) {
        // A failed product consumption aborts the run — posting a half-run
        // would silently manufacture output from nothing.
        throw new Error(`Could not consume ${raw.itemId}: ${(e as Error).message}`);
      }
    }
    return { totalValue: totalConsumedValue };
  }

  /** The run's inward movement — one lot of the produced output, placed in
   *  the chosen (or first-assigned) stock location. */
  private applyBatchOutputMovement(batch: ProductionBatchRun, outputRate?: number, locationName?: string): void {
    try {
      this.adjustItemStock(
        batch.targetItemId,
        batch.targetQuantity,
        'production_output',
        batch.batchNumber,
        'Batch output via recipe',
        locationName,
        undefined,
        outputRate,
        batch.id,
      );
    } catch (e) {
      throw new Error(`Could not post the batch output: ${(e as Error).message}`);
    }
  }

  public deleteProductionBatch(id: string): boolean {
    const index = this.data.productionBatches.findIndex((b) => b.id === id);
    if (index === -1) return false;
    const batch = this.data.productionBatches[index];
    // PRODUCE-&-SELL-DIRECTLY (client rule): a run bound to a LIVE sale is the
    // sale's production record — it can only be removed with the sale (edit /
    // cancel / delete reconcile it; see syncSaleDirectRuns).
    if (batch.saleId) {
      const sale = (this.data.sales || []).find((s) => s.id === batch.saleId);
      if (sale && sale.status !== 'cancelled') {
        throw new Error(`Run ${batch.batchNumber} is bound to sale ${sale.saleNumber} (produced & sold directly) — it cannot be deleted from here. Edit or cancel the sale instead.`);
      }
    }
    this.data.productionBatches.splice(index, 1);
    this.logAudit('DELETE', 'PRODUCTION_BATCH', id, `Deleted batch run ${batch.batchNumber}`);
    this.save();
    liveSyncBatch(batch, true);
    return true;
  }

  // --- LOGISTICS: FLEET, DRIVERS, TRIP SLIPS, TYRES ---
  public getVehicles(): Vehicle[] {
    // FK-only storage (Golden Rule §2): the driver display name resolves from
    // the employees master at READ time, so any employee rename propagates to
    // every vehicle display without touching vehicle rows. The MySQL path
    // hydrates identically via LEFT JOIN employees.
    return this.data.vehicles.map((v) => ({
      ...v,
      currentDriverName: this.data.employees.find((e) => e.id === v.currentDriverId)?.name || undefined,
    }));
  }

  public createVehicle(data: Omit<Vehicle, 'id' | 'createdAt'>, actorId?: string): Vehicle {
    // documentIds ride the create payload like createEmployee's flow — staged
    // uploads (Pending/*) registered while the form was open; strip before
    // the vehicle spread (never persisted on the row) and link below.
    const createDocIds = this.extractDocumentIds(data);
    delete (data as any).documentIds;
    // Driver display name is NEVER persisted — only the FK id (resolved by
    // JOIN at read time; see getVehicles).
    delete (data as any).currentDriverName;
    const newVeh: Vehicle = { ...data, id: `veh-${Date.now()}`, createdAt: new Date().toISOString() };
    // DONE-BY AUDIT (2026-11-21): the session user who registered the truck
    newVeh.createdById = actorId || (data as any).createdById;
    newVeh.updatedById = actorId || (data as any).updatedById;
    this.data.vehicles.unshift(newVeh);
    this.save();
    liveSyncVehicle(newVeh);
    if (createDocIds.length > 0) this.linkVehicleDocuments(newVeh.id, createDocIds);
    return newVeh;
  }

  public updateVehicle(id: string, updates: Partial<Vehicle>, actorId?: string): Vehicle {
    // Defensive strip: edit-mode uploads link immediately via the documents
    // endpoint — documentIds should never ride an update. The driver display
    // name is likewise never persisted (FK-only, JOINed at read time).
    delete (updates as any).documentIds;
    delete (updates as any).currentDriverName;
    // DONE-BY AUDIT (2026-11-21): the booking user never changes on an edit
    delete (updates as any).createdById;
    delete (updates as any).updatedById;
    delete (updates as any).createdByName;
    delete (updates as any).updatedByName;
    const idx = this.data.vehicles.findIndex((v) => v.id === id);
    if (idx === -1) throw new Error(`Vehicle ${id} not found.`);
    this.data.vehicles[idx] = { ...this.data.vehicles[idx], ...updates, ...(actorId ? { updatedById: actorId } : {}) };
    this.save();
    liveSyncVehicle(this.data.vehicles[idx]);
    return this.data.vehicles[idx];
  }

  public deleteVehicle(id: string): boolean {
    const idx = this.data.vehicles.findIndex((v) => v.id === id);
    if (idx === -1) return false;
    const veh = this.data.vehicles[idx];
    this.data.vehicles.splice(idx, 1);
    this.detachVehicleDocuments(id);
    this.save();
    liveSyncVehicle(veh, true);
    return true;
  }

  // --- VEHICLE EMI LEDGER (entries posted by the daily cron or by operators) ---

  private hydrateVehicleEmiEntry(e: VehicleEmiEntry): VehicleEmiEntry {
    return {
      ...e,
      vehicleNo: this.data.vehicles.find((v) => v.id === e.vehicleId)?.vehicleNo || e.vehicleNo,
      accountName: this.getAccountById(e.accountId)?.name || e.accountName,
    };
  }

  public getVehicleEmiEntries(vehicleId?: string): VehicleEmiEntry[] {
    const list = this.data.vehicleEmiEntries || [];
    return (vehicleId ? list.filter((e) => e.vehicleId === vehicleId) : list)
      .map((e) => this.hydrateVehicleEmiEntry(e));
  }

  public addVehicleEmiEntry(data: Omit<VehicleEmiEntry, 'id' | 'createdAt'>, actorId?: string): VehicleEmiEntry {
    if (!this.data.vehicleEmiEntries) this.data.vehicleEmiEntries = [];
    const entry: VehicleEmiEntry = {
      ...data,
      id: `vem-${this.nextLedgerMs()}`,
      createdAt: new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21): ONLY an operator's session stamps the row —
      // the daily cron posts with no actor, so auto rows stay unstamped by design.
      ...(actorId ? { createdById: actorId, updatedById: actorId } : {}),
    };
    this.data.vehicleEmiEntries.unshift(entry);
    // Debit the linked account (entry amount leaves the account's balance)
    this.recalculateAccountBalance(entry.accountId);
    this.logAudit('CREATE', 'VEHICLE_EMI', entry.id, `${data.source === 'auto' ? 'Auto-posted' : 'Recorded'} vehicle EMI ${this.formatRupee(Number(data.amount) || 0)} for ${this.data.vehicles.find((v) => v.id === data.vehicleId)?.vehicleNo || data.vehicleId} from ${this.getAccountById(data.accountId)?.name || data.accountId}`);
    this.save();
    liveSyncVehicleEmiEntry(entry);
    return entry;
  }

  public updateVehicleEmiEntry(id: string, updates: Partial<VehicleEmiEntry>, actorId?: string): VehicleEmiEntry {
    const idx = (this.data.vehicleEmiEntries || []).findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Vehicle EMI entry ${id} not found.`);
    const prev = this.data.vehicleEmiEntries[idx];
    const updated: VehicleEmiEntry = {
      ...prev,
      ...updates,
      createdAt: prev.createdAt,
      // auto rows never gain a human stamp from a bookkeeping rewrite
      ...(actorId ? { updatedById: actorId } : {}),
    };
    this.data.vehicleEmiEntries[idx] = updated;
    // Edit-by-delta: any amount/account change flows straight into the
    // balance streams on the next recalculation — the entry list is the truth.
    if (prev.accountId !== updated.accountId) {
      this.recalculateAccountBalance(prev.accountId);
    }
    this.recalculateAccountBalance(updated.accountId);
    this.logAudit('UPDATE', 'VEHICLE_EMI', id, `Edited vehicle EMI entry (amount ${this.formatRupee(Number(prev.amount) || 0)} → ${this.formatRupee(Number(updated.amount) || 0)})`);
    this.save();
    liveSyncVehicleEmiEntry(updated);
    return updated;
  }

  public deleteVehicleEmiEntry(id: string): boolean {
    const idx = (this.data.vehicleEmiEntries || []).findIndex((e) => e.id === id);
    if (idx === -1) return false;
    const removed = this.data.vehicleEmiEntries[idx];
    this.data.vehicleEmiEntries.splice(idx, 1);
    // Removing the entry reverses its debit from the account balance.
    this.recalculateAccountBalance(removed.accountId);
    this.logAudit('DELETE', 'VEHICLE_EMI', id, `Deleted vehicle EMI entry (reverses ${this.formatRupee(Number(removed.amount) || 0)} on ${this.getAccountById(removed.accountId)?.name || removed.accountId})`);
    this.save();
    liveSyncVehicleEmiEntry(removed, true);
    return true;
  }

  // --- VEHICLE EXPENSE LOG (generic + diesel entries; operators record/edit) ---

  private hydrateVehicleExpenseEntry(e: VehicleExpenseEntry): VehicleExpenseEntry {
    return {
      ...e,
      vehicleNo: this.data.vehicles.find((v) => v.id === e.vehicleId)?.vehicleNo || e.vehicleNo,
      accountName: this.getAccountById(e.accountId)?.name || e.accountName,
      // Diesel issue location (live name — renames propagate; §2)
      dieselLocationName: e.dieselLocationId
        ? (this.data.locations || []).find((l) => l.id === e.dieselLocationId)?.name || e.dieselLocationName
        : e.dieselLocationName,
    };
  }

  // ---------- APP DEFAULTS (generic key/value default store) ----------
  // The generic "every default lives in the db" table (user directive,
  // 2026-10-28): keys are read anywhere in the app (bulk diesel rows prefill
  // the diesel_rate), values are edited from Settings (manage_settings gate
  // on the route). diesel_rate seeds at '99.8'.

  public getAppDefaults(): AppDefault[] {
    return [...(this.data.appDefaults || [])];
  }

  public getAppDefault(key: string): string | undefined {
    return (this.data.appDefaults || []).find((d) => d.key === key)?.value;
  }

  public upsertAppDefault(key: string, value: string, actorId?: string): AppDefault {
    const k = String(key || '').trim();
    if (!k) throw new Error('A default needs a key.');
    const now = new Date().toISOString();
    const entry: AppDefault = {
      key: k,
      value: String(value),
      updatedAt: now,
      // DONE-BY AUDIT (2026-11-21): the operator who last saved the default
      updatedById: actorId || undefined,
    };
    const idx = (this.data.appDefaults || []).findIndex((d) => d.key === k);
    if (idx > -1) {
      this.data.appDefaults[idx] = entry;
    } else {
      (this.data.appDefaults = this.data.appDefaults || []).push(entry);
    }
    this.logAudit('UPDATE', 'APP_DEFAULT', k, `Default ${k} set to ${value}`);
    this.save();
    liveSyncAppDefault(entry);
    // DIESEL RATE PROPAGATION (2026-11-17, user directive): the global diesel
    // rate IS the diesel item's procured cost — changing it re-prices every
    // diesel item's purchasePrice (and its future opening facts).
    if (k === 'diesel_rate' && Number(entry.value) > 0) {
      const rate = Number(entry.value);
      const dieselItems = (this.data.items || []).filter(
        (i) => i.type !== 'asset' && i.isActive !== false && isDieselItemName(i.name),
      );
      for (const item of dieselItems) {
        item.purchasePrice = rate;
        item.updatedAt = now;
        this.logAudit('UPDATE', 'ITEM', item.id, `Item ${item.name} procured cost re-priced to global diesel_rate ${rate}`);
        liveSyncItem(item);
      }
      if (dieselItems.length > 0) this.save();
    }
    return entry;
  }

  public getVehicleExpenseEntries(vehicleId?: string): VehicleExpenseEntry[] {
    const list = this.data.vehicleExpenseEntries || [];
    return (vehicleId ? list.filter((e) => e.vehicleId === vehicleId) : list)
      .map((e) => this.hydrateVehicleExpenseEntry(e));
  }

  // ---------- FLEET DIESEL FROM INVENTORY (2026-11-17 client directive) ----------
  // A diesel fuel fill is ALWAYS issued from the diesel inventory item's
  // per-location stock (never "direct"). The rate is STRICTLY the global
  // diesel_rate app default (snapshotted per row) and the fill moves NO money
  // — the cash left the account when the diesel was purchased, so a diesel
  // row is a vehicle-cost record only (accountId '').

  /** The ONE diesel stock item — an active non-asset item named with the
   *  word "Diesel" (same word-match convention as tyres). */
  private resolveDieselItem(): Item | undefined {
    return this.data.items.find((i) => i.type !== 'asset' && i.isActive !== false && isDieselItemName(i.name));
  }

  /** The STRICT global ₹/litre — app_defaults 'diesel_rate'. */
  private resolveDieselRate(): number {
    const raw = Number(this.getAppDefault('diesel_rate'));
    if (!(raw > 0)) throw new Error('The global diesel rate is required — set diesel_rate (₹/litre) in Settings → App Defaults first.');
    return raw;
  }

  /** The per-location stock bucket of the diesel item, by location FK. */
  private resolveDieselBucket(item: Item, locationId?: string): { bucket: ItemLocationStock; name: string } {
    const master = locationId ? (this.data.locations || []).find((ml) => ml.id === locationId) : undefined;
    const name = master?.name || (item.locations || []).find((l) => l.locationId === locationId)?.locationName || 'the chosen location';
    const bucket = (item.locations || []).find(
      (l) => (locationId && l.locationId === locationId) ||
             (name && l.locationName?.trim().toLowerCase() === name.trim().toLowerCase()),
    );
    if (!bucket) throw new Error(`Diesel is not stocked at ${name} — receive diesel into that location first (not found).`);
    return { bucket, name };
  }

  /** Guard: the bucket must hold at least the requested litres. */
  private requireDieselStock(item: Item, locationId: string | undefined, litres: number): { bucket: ItemLocationStock; name: string } {
    const { bucket, name } = this.resolveDieselBucket(item, locationId);
    const available = Number(bucket.currentStock) || 0;
    if (litres > available) {
      throw new Error(`Diesel at ${name} is ${available.toLocaleString('en-IN')} L — cannot issue ${litres.toLocaleString('en-IN')} L. Receive the diesel inward first.`);
    }
    return { bucket, name };
  }

  /** Post the stock movement for a fill (+litres restore / −litres issue),
   *  keyed on the expense entry (referenceId), at the entry's location. */
  private postDieselMovement(entryId: string, itemId: string, locationId: string | undefined, litres: number, vehicleNo: string, notes?: string): void {
    if (!(Math.abs(litres) > 0)) return;
    const item = this.findItemRaw(itemId);
    if (!item) throw new Error('The diesel inventory item no longer exists — the fill cannot be posted.');
    const master = locationId ? (this.data.locations || []).find((ml) => ml.id === locationId) : undefined;
    const locName = master?.name || (item.locations || []).find((l) => l.locationId === locationId)?.locationName;
    const isRestore = litres > 0;
    // Reversals re-enter stock at the ORIGINAL fill's FIFO rate (same
    // pattern as dispatch_reversal), keyed on the original movement id.
    let reverseRate: number | undefined;
    let reversalKey: string | undefined;
    if (isRestore) {
      const original = (this.data.stockMovements || [])
        .filter((m) => m.referenceId === entryId && m.type === 'diesel_issue')
        .find((m) => !(this.data.stockMovements || []).some((r) => r.type === 'diesel_issue_reversal' && r.referenceNumber === m.id));
      if (original) {
        reverseRate = Number(original.rate) > 0 ? Number(original.rate) : undefined;
        reversalKey = original.id;
      }
    }
    // SIGN FIX (2026-11-17, user-reported "diesel add instead of deduct"):
    // the callers already pass the SIGNED quantity — issue = NEGATIVE litres,
    // restore = POSITIVE litres. Negating again here flipped every fill into
    // an inward movement (+litres) — diesel stock GREW instead of dropping.
    // adjustItemStock's delta is simply `litres` as received.
    this.adjustItemStock(
      itemId,
      litres,
      isRestore ? 'diesel_issue_reversal' : 'diesel_issue',
      reversalKey || entryId,
      notes?.trim() || (isRestore
        ? `Diesel issue reversal — ${vehicleNo}${litres ? ` ${litres.toFixed(2)} L re-entered` : ''}`
        : `Diesel issue — ${vehicleNo}${litres ? ` ${Math.abs(litres).toFixed(2)} L` : ''}`),
      locName,
      undefined,
      reverseRate,
      entryId,
    );
  }

  public addVehicleExpenseEntry(data: Omit<VehicleExpenseEntry, 'id' | 'createdAt'>, actorId?: string): VehicleExpenseEntry {
    if (!this.data.vehicleExpenseEntries) this.data.vehicleExpenseEntries = [];
    // documentIds ride the create payload (staged uploads on the NEW-expense
    // flow) — never persisted on the row; link below.
    const createDocIds = this.extractDocumentIds(data as any);
    delete (data as any).documentIds;
    const isDieselFill = data.entryType === 'diesel' && Boolean(data.dieselLocationId);
    if (data.entryType === 'diesel' && !data.dieselLocationId) {
      throw new Error('A diesel fill must pick the inventory location it is issued from — diesel is always taken from stock.');
    }
    const dieselLitres = isDieselFill ? Number(data.litres) || 0 : 0;
    const dieselItem = isDieselFill ? this.resolveDieselItem() : undefined;
    if (isDieselFill && !dieselItem) {
      throw new Error('No diesel item exists in inventory — create a product item named e.g. "Diesel" and receive its stock first.');
    }
    if (isDieselFill && dieselItem) {
      if (!(dieselLitres > 0)) throw new Error('The litres filled are required to issue diesel from stock.');
      this.requireDieselStock(dieselItem, data.dieselLocationId, dieselLitres);
    }
    // Diesel rows carry NO account debit (an internal issue from stock) and
    // the STRICT global rate; generic expenses keep the entered account.
    const globalRate = isDieselFill ? this.resolveDieselRate() : Number(data.ratePerLitre) || undefined;
    const entry: VehicleExpenseEntry = {
      ...data,
      id: `vxe-${this.nextLedgerMs()}`,
      accountId: isDieselFill ? '' : data.accountId,
      ...(isDieselFill && dieselItem
        ? {
            dieselItemId: dieselItem.id,
            ratePerLitre: globalRate,
            amount: Math.round(dieselLitres * (globalRate || 0) * 100) / 100,
          }
        : {}),
      createdAt: new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21): the session user who recorded the entry
      createdById: actorId || (data as any).createdById,
      updatedById: actorId || (data as any).updatedById,
    };
    if (isDieselFill && dieselItem) {
      // Stock first (adjustItemStock saves + posts the ledger row) — a failed
      // guard above already aborted before this point; the entry only lands
      // once the movement exists.
      this.postDieselMovement(entry.id, dieselItem.id, data.dieselLocationId, -dieselLitres, this.data.vehicles.find((v) => v.id === data.vehicleId)?.vehicleNo || 'vehicle');
    }
    this.data.vehicleExpenseEntries.unshift(entry);
    // The expense amount leaves the linked account's balance (balance stream);
    // a diesel issue moves no money — guard the empty accountId.
    if (entry.accountId) this.recalculateAccountBalance(entry.accountId);
    this.logAudit('CREATE', 'VEHICLE_EXPENSE', entry.id, `${entry.entryType === 'diesel' ? 'Diesel fill' + (entry.dieselItemId ? ' issued from stock' : '') : 'Vehicle'} expense ${this.formatRupee(Number(entry.amount) || 0)} for ${this.data.vehicles.find((v) => v.id === data.vehicleId)?.vehicleNo || data.vehicleId}${entry.accountId ? ` from ${this.getAccountById(entry.accountId)?.name || data.accountId}` : ' (no account debit)'}`);
    this.save();
    liveSyncVehicleExpenseEntry(entry);
    if (createDocIds.length > 0) this.linkExpenseDocuments(entry.id, createDocIds);
    return entry;
  }

  public updateVehicleExpenseEntry(id: string, updates: Partial<VehicleExpenseEntry>, actorId?: string): VehicleExpenseEntry {
    const idx = (this.data.vehicleExpenseEntries || []).findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Vehicle expense entry ${id} not found.`);
    // DONE-BY AUDIT (2026-11-21): the booking user never changes on an edit
    delete (updates as any).createdById;
    delete (updates as any).updatedById;
    delete (updates as any).createdByName;
    delete (updates as any).updatedByName;
    const prev = this.data.vehicleExpenseEntries[idx];
    // edit-mode uploads link immediately; documentIds never persist on the row
    const editDocIds = this.extractDocumentIds(updates as any);
    delete (updates as any).documentIds;
    const nextLitres = Number(updates.litres ?? prev.litres) || 0;

    // DIESEL ↔ STOCK reconciliation (2026-11-17): stock-backed diesel rows
    // re-issue the litres delta; a row edited OFF stock restores its litres;
    // a legacy (pre-inventory) diesel row adopting a location converts to a
    // stock-backed fill (full litres issue, account debit released).
    let stockRestore: { itemId: string; locationId: string | undefined; litres: number } | undefined;
    let stockIssue: { itemId: string; locationId: string | undefined; litres: number } | undefined;
    const wasStockBacked = Boolean(prev.dieselItemId);
    const becomesStockBacked =
      updates.entryType === 'diesel' && Boolean(updates.dieselLocationId ?? prev.dieselLocationId);
    const nextLocationId = updates.dieselLocationId ?? prev.dieselLocationId;

    if (wasStockBacked && updates.entryType === 'expense') {
      // Diesel row converted to a generic expense — the fill is returned to stock.
      stockRestore = { itemId: prev.dieselItemId!, locationId: prev.dieselLocationId, litres: prev.litres || 0 };
    } else if (wasStockBacked && updates.entryType !== 'expense' && (!updates.dieselLocationId && !prev.dieselLocationId)) {
      // Stock backing removed without a new location — restore the litres.
      stockRestore = { itemId: prev.dieselItemId!, locationId: prev.dieselLocationId, litres: prev.litres || 0 };
    } else if (updates.entryType === 'diesel' || (!updates.entryType && prev.entryType === 'diesel')) {
      if (wasStockBacked && nextLocationId && nextLitres > 0) {
        if (nextLocationId !== prev.dieselLocationId) {
          // Location move: restore at the OLD bucket, deduct the full fill at the NEW one.
          stockRestore = { itemId: prev.dieselItemId!, locationId: prev.dieselLocationId, litres: prev.litres || 0 };
          stockIssue = { itemId: prev.dieselItemId!, locationId: nextLocationId, litres: nextLitres };
        } else if (nextLitres !== (prev.litres || 0)) {
          // Same bucket: edit-by-delta (either direction, guarded above for +).
          const delta = nextLitres - (prev.litres || 0);
          if (delta > 0) stockIssue = { itemId: prev.dieselItemId!, locationId: nextLocationId, litres: delta };
          else stockRestore = { itemId: prev.dieselItemId!, locationId: nextLocationId, litres: -delta };
        }
      } else if (!wasStockBacked && updates.entryType === 'diesel' && updates.dieselLocationId) {
        // A legacy direct fill adopted a location — deduct the whole fill.
        stockIssue = { itemId: updates.dieselItemId ?? prev.dieselItemId, locationId: updates.dieselLocationId, litres: nextLitres };
      }
    }

    // Stock guards BEFORE any mutation: an issue needs the litres available
    // at its bucket (a restore only adds back, so it needs no guard).
    if (stockIssue) {
      const issueItem = this.findItemRaw(stockIssue.itemId);
      if (!issueItem) throw new Error('The diesel inventory item no longer exists — the fill cannot be edited.');
      this.requireDieselStock(issueItem, stockIssue.locationId, stockIssue.litres);
    }

    // STRICT global rate on EVERY diesel row (entered or edited, stock-backed
    // or legacy); the amount re-derives: amount = litres × rate (the operator
    // never prices a fill).
    const isDieselRow = updates.entryType === 'diesel' || (!updates.entryType && prev.entryType === 'diesel');
    const repriceDiesel = isDieselRow;
    const globalRate = repriceDiesel ? this.resolveDieselRate() : undefined;

    const updated: VehicleExpenseEntry = {
      ...prev,
      ...updates,
      createdAt: prev.createdAt,
      ...(isDieselRow
        ? {
            ...(updates.entryType === 'expense'
              ? {}
              : { ratePerLitre: globalRate, amount: Math.round(nextLitres * (globalRate || 0) * 100) / 100 }),
            accountId: updates.entryType === 'diesel' ? '' : (updates.entryType === 'expense' ? (updates.accountId ?? prev.accountId) : prev.accountId),
          }
        : {}),
    };
    if (actorId) updated.updatedById = actorId;
    this.data.vehicleExpenseEntries[idx] = updated;

    // Post the settled stock effects (guards already passed).
    if (stockRestore) {
      this.postDieselMovement(id, stockRestore.itemId, stockRestore.locationId, stockRestore.litres, this.data.vehicles.find((v) => v.id === updated.vehicleId)?.vehicleNo || 'vehicle', 'Diesel fill edited — litres returned to stock');
    }
    if (stockIssue) {
      this.postDieselMovement(id, stockIssue.itemId, stockIssue.locationId, -stockIssue.litres, this.data.vehicles.find((v) => v.id === updated.vehicleId)?.vehicleNo || 'vehicle', 'Diesel fill edited — litres issued from stock');
    }

    // Edit-by-delta (vehicle/account/amount change → balance streams); a
    // diesel issue moves no money, so an accountId that emptied releases the
    // old debit instead of debiting ''.
    if (prev.accountId && prev.accountId !== updated.accountId) {
      this.recalculateAccountBalance(prev.accountId);
    }
    if (updated.accountId) this.recalculateAccountBalance(updated.accountId);
    this.logAudit('UPDATE', 'VEHICLE_EXPENSE', id, `Edited vehicle expense entry (amount ${this.formatRupee(Number(prev.amount) || 0)} → ${this.formatRupee(Number(updated.amount) || 0)})${stockRestore || stockIssue ? ' with a diesel stock effect' : ''}`);
    this.save();
    liveSyncVehicleExpenseEntry(updated);
    if (editDocIds.length > 0) this.linkExpenseDocuments(id, editDocIds);
    return updated;
  }

  public deleteVehicleExpenseEntry(id: string): boolean {
    const idx = (this.data.vehicleExpenseEntries || []).findIndex((e) => e.id === id);
    if (idx === -1) return false;
    const removed = this.data.vehicleExpenseEntries[idx];
    this.data.vehicleExpenseEntries.splice(idx, 1);
    // STOCK-BACKED DIESEL: removing the fill returns its litres to the
    // location bucket it was issued from (with the ledger reversal keyed on
    // the entry).
    if (removed.dieselItemId && (removed.litres || 0) > 0) {
      this.postDieselMovement(id, removed.dieselItemId, removed.dieselLocationId, removed.litres!, this.data.vehicles.find((v) => v.id === removed.vehicleId)?.vehicleNo || 'vehicle', 'Diesel fill deleted — litres returned to stock');
    }
    // Removing the entry reverses its debit from the account balance.
    if (removed.accountId) this.recalculateAccountBalance(removed.accountId);
    this.detachExpenseDocuments(id);
    this.logAudit('DELETE', 'VEHICLE_EXPENSE', id, `Deleted vehicle expense entry${removed.dieselItemId ? ' (diesel litres returned to stock)' : ''}${removed.accountId ? ` (reverses ${this.formatRupee(Number(removed.amount) || 0)} on ${this.getAccountById(removed.accountId)?.name || removed.accountId})` : ''}`);
    this.save();
    liveSyncVehicleExpenseEntry(removed, true);
    return true;
  }

  private formatRupee(n: number): string {
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  }

  public getDrivers(): Driver[] {
    return this.data.drivers;
  }

  public createDriver(data: Omit<Driver, 'id' | 'createdAt'>): Driver {
    const newDr: Driver = { ...data, id: `dr-${Date.now()}`, createdAt: new Date().toISOString() };
    this.data.drivers.unshift(newDr);
    this.save();
    liveSyncDriver(newDr);
    return newDr;
  }

  public updateDriver(id: string, updates: Partial<Driver>): Driver {
    const idx = this.data.drivers.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error(`Driver ${id} not found.`);
    this.data.drivers[idx] = { ...this.data.drivers[idx], ...updates };
    this.save();
    liveSyncDriver(this.data.drivers[idx]);
    return this.data.drivers[idx];
  }

  public deleteDriver(id: string): boolean {
    const idx = this.data.drivers.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    const dr = this.data.drivers[idx];
    this.data.drivers.splice(idx, 1);
    this.save();
    liveSyncDriver(dr, true);
    return true;
  }

  public getTripSlips(): TripSlip[] {
    return this.visibleTripSlips();
  }

  /** Trip-slip fetch rule (2026-10-28, mirrors sales): slips DERIVED from a
   *  soft-deleted sales order (status 'deleted') don't surface; manual slips
   *  (no saleId) always stay. */
  private visibleTripSlips(): TripSlip[] {
    return (this.data.tripSlips || []).filter((t) => {
      if (!t.saleId) return true;
      const sale = (this.data.sales || []).find((s) => s.id === t.saleId);
      return !sale || sale.status !== 'deleted';
    });
  }

  /**
   * FK-only display hydration (Golden Rule §2): driver / party / material are
   * NEVER persisted display copies on the slip — the driver name joins the
   * employees master by driverId, the party name the parties master by
   * partyId, and a sale-derived slip resolves its material from the sale's
   * effective (latest) stage items. Manual (non-order) slips keep the
   * operator-entered material text.
   */
  private hydrateTripSlip(t: TripSlip): TripSlip {
    const driver = t.driverId
      ? (this.data.employees || []).find((e) => e.id === t.driverId)
      : undefined;
    const party = t.partyId
      ? (this.data.parties || []).find((p) => p.id === t.partyId)
      : undefined;
    // FK-only vehicle number (Golden Rule §2): own-fleet slips JOIN the
    // vehicles master by vehicleId; the typed plate survives only on
    // outsourced slips (no fleet row) — a dangling FK falls back to it.
    const vehicle = t.vehicleId
      ? this.data.vehicles.find((v) => v.id === t.vehicleId)
      : undefined;
    let materialName: string | undefined = t.materialName || undefined;
    if (t.saleId) {
      const sale = (this.data.sales || []).find((s) => s.id === t.saleId);
      for (const li of sale?.items || []) {
        const master = this.findItemRaw(li.itemId);
        if (master?.name) {
          materialName = master.name;
          break;
        }
      }
    }
    return {
      ...t,
      vehicleNo: vehicle?.vehicleNo || t.vehicleNo || '',
      driverName: driver?.name || undefined,
      partyName: party ? (party.tradeName || party.name) : undefined,
      materialName,
    };
  }

  /** Hydrated trip slips — for the API read paths and internal consumers. */
  public getHydratedTripSlips(): TripSlip[] {
    return this.visibleTripSlips().map((t) => this.hydrateTripSlip(t));
  }

  // --- SALE → TRIP SLIP (auto-derived dispatch trips) ---

  /** Collision-safe serial: highest TS-<year>-#### in use + 1 (min 0101). */
  private nextSlipNumber(): string {
    const year = new Date().getFullYear();
    const prefix = `TS-${year}-`;
    let max = 100;
    for (const t of this.data.tripSlips || []) {
      if (!t.slipNumber?.startsWith(prefix)) continue;
      const n = parseInt(t.slipNumber.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  /** Plant timezone (IST) HH:mm — the slip dispatch time of the day. */
  private istHHmm(): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  }

  /**
   * Auto-derive/upsert the dispatch trip slip for a sale. Every sale carries
   * a vehicle (compulsory in the Sales form): CREATE posts the slip as
   * 'loading' in the Trip Slips Log; EDIT updates the linked slip IN PLACE,
   * keyed on slip.saleId — a vehicle change moves the slip to the new truck,
   * the load weight (order-level master value), distance and site address
   * mirror the sale, and the operator-managed fields (status, time, fuel
   * issue, advance) are never clobbered. Nothing but FKs + operational trip
   * data is persisted: driver/party/material resolve from the masters at
   * read (hydrateTripSlip). A slip whose sale no longer carries a vehicle
   * is removed.
   */
  private syncSaleTripSlip(sale: Sale): void {
    const linked = (this.data.tripSlips || []).find((t) => t.saleId === sale.id);
    // No attachment at all → no trip. Two attachment modes:
    //   own fleet  — vehicleId FK (trip slip carries the FK + the assigned driver)
    //   outsourced — typed vehicleNo, no fleet FK (slip has an unassigned driver)
    const isOutsourced = !sale.vehicleId && !!sale.vehicleNo;
    if (!sale.vehicleId && !isOutsourced) {
      if (linked) this.deleteTripSlip(linked.id);
      return;
    }
    const vehicle = sale.vehicleId
      ? this.data.vehicles.find((v) => v.id === sale.vehicleId)
      : undefined;
    const driverId = vehicle?.currentDriverId || '';
    const party = this.data.parties.find((p) => p.id === sale.partyId);
    const lines = sale.items || [];
    // FK-only storage (Golden Rule §2): no persisted display copies — the
    // driver/party names resolve from the masters at read, the material from
    // the sale's items (the load weight is ONE common order-level value)
    const weightSum = Math.round((sale.weightTonnes !== undefined
      ? Number(sale.weightTonnes)
      : lines.reduce((sum, li) => sum + (Number(li.weightTonnes) || 0), 0)) * 1000) / 1000;
    const fields: Partial<TripSlip> = {
      date: sale.date,
      // Outsourced slips carry no fleet FK — the typed plate is the vehicle
      vehicleId: sale.vehicleId || '',
      vehicleNo: vehicle?.vehicleNo || sale.vehicleNo || '—',
      driverId,
      tripType: 'outward',
      saleId: sale.id, // upsert key — in-place updates match on this
      orderId: sale.id,
      orderNumber: sale.saleNumber,
      partyId: sale.partyId,
      netWeightTonnes: weightSum,
      destination: sale.siteAddress || (party ? party.tradeName || party.name : 'Site delivery'),
      distanceKm: sale.distanceKm,
      notes: sale.notes,
    };
    if (linked) {
      // In-place upsert — status/time/advances stay the operator's
      this.updateTripSlip(linked.id, fields);
    } else {
      this.createTripSlip({
        slipNumber: this.nextSlipNumber(),
        time: this.istHHmm(),
        status: 'loading',
        fuelIssuedLiters: 0,
        cashAdvanceRupees: 0,
        ...fields,
      } as Omit<TripSlip, 'id' | 'createdAt'>);
      this.logAudit('CREATE', 'TRIP_SLIP', `sale-${sale.id}`,
        `Auto-derived dispatch trip for sale ${sale.saleNumber} (${fields.vehicleNo} → ${fields.destination})`);
    }
  }

  public createTripSlip(data: Omit<TripSlip, 'id' | 'createdAt'>): TripSlip {
    const newSlip: TripSlip = { ...data, id: `ts-${Date.now()}`, createdAt: new Date().toISOString() };
    this.data.tripSlips.unshift(newSlip);

    // Sync vehicle status; drivers are employees (managed by the Employees
    // module) and only the driver FK is stored on the vehicle — the display
    // name resolves from the employees master at read time.
    const isBusy = data.status === 'transit' || data.status === 'loading';
    try {
      this.updateVehicle(data.vehicleId, {
        status: isBusy ? 'on_trip' : 'available',
        currentDriverId: data.driverId,
      });
    } catch (e) {
      console.error('Error syncing vehicle status:', e);
    }

    this.logAudit('CREATE', 'TRIP_SLIP', newSlip.id, `Created trip slip ${newSlip.slipNumber} for ${newSlip.vehicleNo}`);
    this.save();
    liveSyncTripSlip(newSlip);
    return newSlip;
  }

  public updateTripSlip(id: string, updates: Partial<TripSlip>): TripSlip {
    const idx = this.data.tripSlips.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Trip slip ${id} not found.`);
    const updated = { ...this.data.tripSlips[idx], ...updates };
    this.data.tripSlips[idx] = updated;

    const isBusy = updated.status === 'transit' || updated.status === 'loading';
    try {
      this.updateVehicle(updated.vehicleId, {
        status: isBusy ? 'on_trip' : 'available',
        currentDriverId: updated.driverId,
      });
    } catch (e) {
      console.error('Error syncing vehicle status:', e);
    }

    this.save();
    liveSyncTripSlip(updated);
    return updated;
  }

  public deleteTripSlip(id: string): boolean {
    const idx = this.data.tripSlips.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const ts = this.data.tripSlips[idx];
    this.data.tripSlips.splice(idx, 1);
    this.save();
    liveSyncTripSlip(ts, true);
    return true;
  }

  // --- TYRE STANDALONE TABLE RETIRED (2026-11-17) — tyre serials live in
  // inventory_units (deployInventoryUnit enforces the 12-position rule); the
  // old this.data.tyres mirror + CRUD is gone. The Azure `tyres` table itself
  // stays on the server, unwritten ("legacy rows ignored" per the client).

  // --- EMPLOYEES & PAYROLL ---
  public getEmployees(): Employee[] {
    return this.data.employees;
  }

  public createEmployee(data: Omit<Employee, 'id' | 'createdAt'>, actorId?: string): Employee {
    // documentIds ride the create payload like createParty's flow — staged
    // uploads (Pending/*) registered while the form was open; strip before
    // the employee spread (never persisted on the row) and link below.
    const createDocIds = this.extractDocumentIds(data);
    delete (data as any).documentIds;
    const newEmp: Employee = { ...data, id: `emp-${Date.now()}`, createdAt: new Date().toISOString() };
    // DONE-BY AUDIT (2026-11-21): the session user who onboarded the employee
    newEmp.createdById = actorId || (data as any).createdById;
    newEmp.updatedById = actorId || (data as any).updatedById;
    this.data.employees.unshift(newEmp);
    this.logAudit('CREATE', 'EMPLOYEE', newEmp.id, `Created employee ${newEmp.name} (${newEmp.role})`);
    this.save();
    liveSyncEmployee(newEmp);
    if (createDocIds.length > 0) this.linkEmployeeDocuments(newEmp.id, createDocIds);
    return newEmp;
  }

  public updateEmployee(id: string, updates: Partial<Employee>, actorId?: string): Employee {
    const idx = this.data.employees.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Employee ${id} not found.`);
    // Defensive strip: edit-mode uploads link immediately via the documents
    // endpoint, so documentIds should never ride an update — never persist it.
    delete (updates as any).documentIds;
    // DONE-BY AUDIT (2026-11-21): the booking user never changes on an edit
    delete (updates as any).createdById;
    delete (updates as any).updatedById;
    delete (updates as any).createdByName;
    delete (updates as any).updatedByName;
    this.data.employees[idx] = { ...this.data.employees[idx], ...updates, ...(actorId ? { updatedById: actorId } : {}) };
    this.save();
    liveSyncEmployee(this.data.employees[idx]);
    return this.data.employees[idx];
  }

  public deleteEmployee(id: string): boolean {
    const idx = this.data.employees.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    const emp = this.data.employees[idx];
    this.data.employees.splice(idx, 1);
    this.detachEmployeeDocuments(id);
    // The employee's vehicles lose their driver (FK released, not deleted)
    this.data.vehicles.forEach((v, i) => {
      if (v.currentDriverId === id) {
        this.data.vehicles[i] = { ...v, currentDriverId: undefined };
        liveSyncVehicle(this.data.vehicles[i]);
      }
    });
    this.save();
    liveSyncEmployee(emp, true);
    return true;
  }

  /**
   * Driver ↔ vehicle assignment (the driver-side write surface). The FK
   * lives on the vehicle row (currentDriverId) — NEVER an assigned-vehicle
   * copy on the employee. `vehicleId` CLAIMS that vehicle for the driver
   * (reassigning it from a previous driver — fleet = one active driver per
   * vehicle) and releases every other vehicle the driver held;
   * `releaseVehicleId` frees ONE vehicle the driver holds.
   */
  public assignEmployeeVehicle(
    empId: string,
    opts: { vehicleId?: string; releaseVehicleId?: string }
  ): Vehicle[] {
    const emp = this.data.employees.find((e) => e.id === empId);
    if (!emp) throw new Error(`Employee ${empId} not found.`);
    if (opts.vehicleId && !this.data.vehicles.some((v) => v.id === opts.vehicleId)) {
      throw new Error(`Vehicle ${opts.vehicleId} not found.`);
    }
    const touched: Vehicle[] = [];
    const release = (idx: number) => {
      this.data.vehicles[idx] = { ...this.data.vehicles[idx], currentDriverId: undefined };
      liveSyncVehicle(this.data.vehicles[idx]);
      touched.push(this.data.vehicles[idx]);
    };
    if (opts.releaseVehicleId) {
      const idx = this.data.vehicles.findIndex(
        (v) => v.id === opts.releaseVehicleId && v.currentDriverId === empId
      );
      if (idx !== -1) release(idx);
    } else {
      // Release the driver's other vehicles, then claim the chosen one
      this.data.vehicles.forEach((v, i) => {
        if (v.currentDriverId === empId && v.id !== opts.vehicleId) release(i);
      });
      if (opts.vehicleId) {
        const idx = this.data.vehicles.findIndex((v) => v.id === opts.vehicleId);
        if (this.data.vehicles[idx].currentDriverId !== empId) {
          this.data.vehicles[idx] = { ...this.data.vehicles[idx], currentDriverId: empId };
          liveSyncVehicle(this.data.vehicles[idx]);
          touched.push(this.data.vehicles[idx]);
        }
      }
    }
    if (touched.length > 0) this.save();
    return touched;
  }

  public getAttendance(): EmployeeAttendance[] {
    return this.data.attendance;
  }

  public recordAttendance(data: Omit<EmployeeAttendance, 'id'>, actorId?: string): EmployeeAttendance {
    // UPSERT per (employee, date): the attendance sheet saves the whole day
    // repeatedly — a re-save must merge into the existing row, not mint a
    // duplicate that prefill/one-day reads would trip over. Only PROVIDED
    // fields merge (a partial save must not null saved times) and the
    // client's optimistic id never replaces the server's.
    const { id: _postedId, ...payload } = (data as any) || {};
    const idx = this.data.attendance.findIndex(
      (a) => a.employeeId === payload.employeeId && a.date === payload.date
    );
    if (idx >= 0) {
      const merged: EmployeeAttendance = { ...this.data.attendance[idx] };
      Object.keys(payload).forEach((k) => {
        if (payload[k] !== undefined) (merged as any)[k] = payload[k];
      });
      // DONE-BY AUDIT (2026-11-21): a re-save is also a human marking the day
      // (client forgery stripped; the booking user never changes on an edit)
      delete (payload as any).createdById;
      delete (payload as any).updatedById;
      if (actorId) {
        merged.updatedById = actorId;
        if (!merged.createdById) merged.createdById = actorId;
      }
      this.data.attendance[idx] = merged;
      this.save();
      liveSyncAttendance(merged);
      return merged;
    }
    const newAtt = {
      ...payload,
      id: `att-${Date.now()}`,
      createdById: actorId || (payload as any).createdById,
      updatedById: actorId || (payload as any).updatedById,
    };
    this.data.attendance.unshift(newAtt);
    this.save();
    liveSyncAttendance(newAtt);
    return newAtt;
  }

  public getLeaves(): EmployeeLeave[] {
    return this.data.leaves;
  }

  public createLeave(data: Omit<EmployeeLeave, 'id' | 'createdAt'>, actorId?: string): EmployeeLeave {
    const newLv = {
      ...data,
      id: `lv-${Date.now()}`,
      createdAt: new Date().toISOString(),
      // DONE-BY AUDIT (2026-11-21): the session user who recorded the leave
      createdById: actorId || (data as any).createdById,
      updatedById: actorId || (data as any).updatedById,
    };
    this.data.leaves.unshift(newLv);
    this.save();
    liveSyncLeave(newLv);
    return newLv;
  }

  public getEmployeePayments(): EmployeePayment[] {
    // Both names resolve from the masters at read time (FK-only rows,
    // Golden Rule §2)
    return (this.data.employeePayments || []).map((p) => this.hydrateEmployeePayment(p));
  }

  /**
   * Payroll payments store employeeId + accountId as FKs ONLY (Golden Rule
   * §2) — neither the employee's nor the account's name ever persists on the
   * row; both resolve from the masters at read time (hydrateEmployeePayment),
   * so renames propagate everywhere (payroll list, account ledger, detail).
   */
  private hydrateEmployeePayment(pay: EmployeePayment): EmployeePayment {
    const name = this.data.employees?.find((e) => e.id === pay.employeeId)?.name;
    return {
      ...pay,
      // Master name wins; a legacy stored name is only a fallback
      employeeName: name || pay.employeeName,
      accountName: pay.accountId ? this.getAccountById(pay.accountId)?.name : undefined,
    };
  }

  public createEmployeePayment(data: Omit<EmployeePayment, 'id'>): EmployeePayment {
    // FK-only persistence — strip display names a payload may carry
    const { employeeName: _en, accountName: _an, ...persistData } = data as any;
    const newPay: EmployeePayment = { ...persistData, id: `pay-${Date.now()}`, createdAt: new Date().toISOString() };
    this.data.employeePayments.unshift(newPay);
    this.save();
    liveSyncEmployeePayment(newPay);
    // The payout leaves the chosen Cash/Bank account: reconcile its balance
    // (ledger math = opening + vouchers ± transfers ± adjustments ± payroll).
    if (newPay.accountId) this.recalculateAccountBalance(newPay.accountId);
    this.logAudit('CREATE', 'PAYROLL', newPay.id, `Recorded ${newPay.type} payout ${newPay.amount} to employee ${newPay.employeeId}${newPay.accountId ? ' from account ' + newPay.accountId : ''}.`);
    return this.hydrateEmployeePayment(newPay);
  }

  /** Removes a payroll payment and reverses it out of the account ledger. */
  public deleteEmployeePayment(id: string): boolean {
    const idx = this.data.employeePayments.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    const pay = this.data.employeePayments[idx];
    this.data.employeePayments.splice(idx, 1);
    this.save();
    liveSyncEmployeePayment(pay, true);
    if (pay.accountId) this.recalculateAccountBalance(pay.accountId);
    this.logAudit('DELETE', 'PAYROLL', pay.id, `Deleted ${pay.type} payout ${pay.amount} to employee ${pay.employeeId}.`);
    return true;
  }

  /**
   * Edits a recorded payroll payment (amount/date/type/mode/account/refs).
   * Every account touched by the move reconciles: moving a payout to another
   * account (or changing the amount) re-computes BOTH the old and new ledger.
   */
  public updateEmployeePayment(id: string, updates: Partial<EmployeePayment>): EmployeePayment {
    const idx = this.data.employeePayments.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Employee payment ${id} not found.`);
    // Display-only hydration (employeeName/accountName) never persists
    delete (updates as any).employeeName;
    delete (updates as any).accountName;
    const previous = this.data.employeePayments[idx];
    const updated: EmployeePayment = {
      ...previous,
      ...updates,
      id: previous.id,
      createdAt: previous.createdAt,
    };
    this.data.employeePayments[idx] = updated;
    this.save();
    liveSyncEmployeePayment(updated);
    new Set([previous.accountId, updated.accountId].filter(Boolean) as string[]).forEach((aid) =>
      this.recalculateAccountBalance(aid)
    );
    this.logAudit('UPDATE', 'PAYROLL', id, `Edited ${updated.type} payout (${updated.amount}) for employee ${updated.employeeId}.`);
    return this.hydrateEmployeePayment(updated);
  }

  // --- EMPLOYEE LEDGER (virtual accounts with a running balance) ---

  public getEmployeeLedgerTransactions(): EmployeeLedgerTransaction[] {
    return (this.data.employeeLedgerTransactions || []).map((t) => this.hydrateEmployeeLedgerTransaction(t));
  }

  /** FK-only persistence: employeeName/accountName resolve from the masters at read time. */
  private hydrateEmployeeLedgerTransaction(t: EmployeeLedgerTransaction): EmployeeLedgerTransaction {
    return {
      ...t,
      employeeName: this.data.employees?.find((e) => e.id === t.employeeId)?.name,
      accountName: t.accountId ? this.getAccountById(t.accountId)?.name : undefined,
    };
  }

  private getEmployeeLedgerRow(id: string): EmployeeLedgerTransaction | undefined {
    return (this.data.employeeLedgerTransactions || []).find((t) => t.id === id);
  }

  public createEmployeeLedgerTransaction(data: Partial<EmployeeLedgerTransaction>, actorId?: string): EmployeeLedgerTransaction {
    if (!this.data.employeeLedgerTransactions) this.data.employeeLedgerTransactions = [];
    // A bank account on the row is meaningful for received (add_balance pays
    // INTO the account), reduce (pays OUT) and direct (either direction) —
    // plain "Add Balance" rows from the adjust modal stay credit-only.
    const accountId =
      data.type === 'add_balance' || data.type === 'reduce_balance' || data.type === 'direct_transaction'
        ? data.accountId
        : undefined;
    const txn: EmployeeLedgerTransaction = {
      id: data.id || `elt-${this.nextLedgerMs()}`,
      employeeId: String(data.employeeId || ''),
      date: String(data.date || new Date().toISOString().split('T')[0]),
      type: data.type as EmployeeLedgerTransaction['type'],
      amount: Number(data.amount) || 0,
      reason: String(data.reason || '').trim(),
      accountId,
      // The record surface (adjust/paid/received) drives the ledger tag UI
      intent: data.intent || undefined,
      // 'received' rows book money into the account (direction = money_in)
      direction: data.direction === 'money_in' || data.direction === 'money_out' ? data.direction : undefined,
      source: data.source || 'manual',
      createdAt: data.createdAt || new Date(this.nextLedgerMs()).toISOString(),
      // DONE-BY AUDIT (2026-11-21): the accrual engine posts with no actor —
      // manual payroll rows only carry the recording operator.
      ...(actorId ? { createdById: actorId, updatedById: actorId } : {}),
    };
    if (!txn.employeeId || !txn.reason) {
      throw new Error('Employee ledger transaction needs an employee and a reason.');
    }
    if (txn.amount <= 0) {
      throw new Error('Employee ledger transaction amount must be positive.');
    }
    this.data.employeeLedgerTransactions.unshift(txn);
    this.save();
    liveSyncEmployeeLedgerTransaction(txn);
    // Only bank-linked rows move money on the Cash/Bank side (reduce pays OUT;
    // a direct transaction moves whichever direction the employer recorded)
    if (txn.accountId) this.recalculateAccountBalance(txn.accountId);
    this.logAudit('CREATE', 'EMPLOYEE_LEDGER', txn.id, `${txn.type} ${txn.amount} for employee ${txn.employeeId}: ${txn.reason}`);
    return this.hydrateEmployeeLedgerTransaction(txn);
  }

  /**
   * Edits a MANUAL ledger row. Wage accruals are engine-owned (locked) — the
   * employer re-states reality through attendance/status edits instead.
   */
  public updateEmployeeLedgerTransaction(id: string, updates: Partial<EmployeeLedgerTransaction>, actorId?: string): EmployeeLedgerTransaction {
    const txn = this.getEmployeeLedgerRow(id);
    if (!txn) throw new Error(`Employee ledger transaction ${id} not found.`);
    if (txn.source === 'accrual_engine') throw new Error('Auto wage accruals are locked; attendance controls their amount.');
    const previous = txn;
    const updated: EmployeeLedgerTransaction = {
      ...txn,
      ...updates,
      id: txn.id,
      createdAt: txn.createdAt,
      source: 'manual',
      // DONE-BY AUDIT (2026-11-21): the editing actor (booking user never moves)
      ...(actorId ? { updatedById: actorId } : {}),
    };
    this.data.employeeLedgerTransactions = this.data.employeeLedgerTransactions.map((t) => (t.id === id ? updated : t));
    this.save();
    liveSyncEmployeeLedgerTransaction(updated);
    new Set([previous.accountId, updated.accountId].filter(Boolean) as string[]).forEach((aid) =>
      this.recalculateAccountBalance(aid)
    );
    this.logAudit('UPDATE', 'EMPLOYEE_LEDGER', id, `Edited ${updated.type} (${updated.amount}) for employee ${updated.employeeId}.`);
    return this.hydrateEmployeeLedgerTransaction(updated);
  }

  /** Deletes a MANUAL ledger row and reverses its bank movement (if any). */
  public deleteEmployeeLedgerTransaction(id: string): boolean {
    const txn = this.getEmployeeLedgerRow(id);
    if (!txn) return false;
    if (txn.source === 'accrual_engine') throw new Error('Auto wage accruals are locked; attendance controls their amount.');
    this.data.employeeLedgerTransactions = (this.data.employeeLedgerTransactions || []).filter((t) => t.id !== id);
    this.save();
    liveSyncEmployeeLedgerTransaction(txn, true);
    if (txn.accountId) this.recalculateAccountBalance(txn.accountId);
    this.logAudit('DELETE', 'EMPLOYEE_LEDGER', txn.id, `Deleted ${txn.type} ${txn.amount} for employee ${txn.employeeId}.`);
    return true;
  }

  /**
   * Wage accrual engine — idempotent (deterministic row ids, re-run safe):
   *   DAILY wagers:  for every day with a marked attendance record,
   *     present / late / early_exit → full salaryBase; half_day → half;
   *     absent → no row (no pay).
   *   MONTHLY wagers: on/after the 1st, one row per employee per PREVIOUS
   *     month: full salaryBase MINUS per-day deductions for absent (full
   *     day) and half_day (half day); every other day — incl. holiday — pays.
   * Attendance edits flow through: re-running updates the locked rows' amounts.
   * Reads where ledger balance matters (GET /employees/ledger) call this first.
   */
  public async ensureWageAccruals(): Promise<void> {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const employees = this.data.employees || [];
    const attendance = this.data.attendance || [];

    for (const emp of employees) {
      const rate = Number(emp.salaryBase) || 0;
      if (rate <= 0) continue;

      if (emp.salaryType === 'daily') {
        const dailyRate = rate;
        for (const att of attendance) {
          if (att.employeeId !== emp.id) continue;
          if (att.date > todayStr) continue;
          const fullDay = att.status === 'present' || att.status === 'late' || att.status === 'early_exit' || att.status === 'holiday';
          const halfDay = att.status === 'half_day';
          const amount = fullDay ? dailyRate : halfDay ? Number((dailyRate / 2).toFixed(2)) : 0;
          const exist = (this.data.employeeLedgerTransactions || []).find(
            (t) => t.type === 'wage_accrual' && t.employeeId === emp.id && t.date === att.date
          );
          if (amount <= 0) {
            if (exist) {
              // Status changed to no-pay — drop the stale full/half row
              await this.removeAccrualRow(exist.id);
            }
            continue;
          }
          const accrual: EmployeeLedgerTransaction = {
            id: `wag-${emp.id}-${att.date}`,
            employeeId: emp.id,
            date: att.date,
            type: 'wage_accrual',
            amount,
            reason: `Daily wage — ${att.status.replace('_', ' ')}`,
            source: 'accrual_engine',
            createdAt: exist?.createdAt || new Date(this.nextLedgerMs()).toISOString(),
          };
          await this.upsertAccrualRow(accrual);
        }
      } else {
        // Monthly — CRON-STYLE, strictly on the 1st of the month only: the
        // engine does NOT post on any other day, even if the ledger is read.
        // The row (dated this month's 1st) accrues the PREVIOUS month's
        // salary: full salaryBase minus per-day deductions for absents and
        // half-days; months before the employee's joining never accrue, and
        // a mid-month joiner is prorated from his joining date.
        const firstOfThisMonth = `${todayStr.substring(0, 7)}-01`;

        // CLEANUP (safe on any day): withdraw any monthly accrual dated the
        // 1st of a month BEFORE the employee joined — salary for a month he
        // was not yet employed cannot exist (e.g. an employee added on the
        // 20th must never carry the 1st's accrual for the previous month).
        const preJoiningRows = (this.data.employeeLedgerTransactions || []).filter(
          (t) => t.type === 'wage_accrual' && t.employeeId === emp.id && emp.joiningDate > t.date
        );
        for (const bad of preJoiningRows) {
          await this.removeAccrualRow(bad.id);
        }

        // Strict gate: today must BE the 1st
        if (todayStr !== firstOfThisMonth) continue;

        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        // local-time month key — toISOString would shift the month back under
        // the IST offset (constructors are local, serialization is UTC)
        const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
        const daysInPrevMonth = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
        const prevMonthEnd = `${prevMonth}-${String(daysInPrevMonth).padStart(2, '0')}`;
        // Not employed for ANY of the previous month — nothing to accrue
        if (emp.joiningDate > prevMonthEnd) continue;
        const accrualDate = firstOfThisMonth;
        const atts = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(prevMonth));
        const absents = atts.filter((a) => a.status === 'absent').length;
        const halves = atts.filter((a) => a.status === 'half_day').length;
        const perDay = rate / daysInPrevMonth;
        // A mid-month joiner earns only from his joining date (unmarked days
        // before joining neither exist in attendance nor count as paid)
        const joinedThisMonth = emp.joiningDate >= `${prevMonth}-01`;
        const joinedDay = joinedThisMonth ? parseInt(emp.joiningDate.substring(8), 10) : 1;
        const earnedDays = daysInPrevMonth - joinedDay + 1;
        let amount = joinedThisMonth ? perDay * earnedDays : rate;
        amount -= absents * perDay + halves * (perDay / 2);
        amount = Math.max(0, Number(amount.toFixed(2)));
        const exist = (this.data.employeeLedgerTransactions || []).find(
          (t) => t.type === 'wage_accrual' && t.employeeId === emp.id && t.date === accrualDate
        );
        if (exist && amount <= 0) {
          await this.removeAccrualRow(exist.id);
          continue;
        }
        if (amount <= 0) continue;
        const monthName = prev.toLocaleString('en-IN', { month: 'long' });
        const deductionNote = absents || halves ? ` (${absents} absent, ${halves} half-day deducted)` : '';
        const prorateNote = joinedThisMonth ? `, prorated from ${emp.joiningDate}` : '';
        const accrual: EmployeeLedgerTransaction = {
          id: `wag-${emp.id}-${prevMonth}`,
          employeeId: emp.id,
          date: accrualDate,
          type: 'wage_accrual',
          amount,
          reason: `Monthly salary accrual — ${monthName} ${prev.getFullYear()}${deductionNote}${prorateNote}`,
          source: 'accrual_engine',
          createdAt: exist?.createdAt || new Date(this.nextLedgerMs()).toISOString(),
        };
        await this.upsertAccrualRow(accrual);
      }
    }
  }

  /** Inserts/refreshes a locked accrual row (amount corrections from attendance edits). */
  private async upsertAccrualRow(accrual: EmployeeLedgerTransaction) {
    const exist = (this.data.employeeLedgerTransactions || []).find((t) => t.id === accrual.id);
    if (exist) {
      if (Math.abs(exist.amount - accrual.amount) >= 0.01 || exist.reason !== accrual.reason) {
        exist.amount = accrual.amount;
        exist.reason = accrual.reason;
        this.save();
        liveSyncEmployeeLedgerTransaction(exist);
        this.logAudit('UPDATE', 'EMPLOYEE_LEDGER', exist.id, `Wage accrual re-synced to ${exist.amount} for employee ${exist.employeeId}.`);
      }
      return;
    }
    this.data.employeeLedgerTransactions.unshift(accrual);
    this.save();
    liveSyncEmployeeLedgerTransaction(accrual);
    this.logAudit('CREATE', 'EMPLOYEE_LEDGER', accrual.id, `Auto wage accrual ${accrual.amount} for employee ${accrual.employeeId}: ${accrual.reason}`);
  }

  private async removeAccrualRow(id: string) {
    const row = this.getEmployeeLedgerRow(id);
    if (!row) return;
    this.data.employeeLedgerTransactions = (this.data.employeeLedgerTransactions || []).filter((t) => t.id !== id);
    this.save();
    liveSyncEmployeeLedgerTransaction(row, true);
    this.logAudit('DELETE', 'EMPLOYEE_LEDGER', id, `Wage accrual withdrawn (attendance now no-pay) for employee ${row.employeeId}.`);
  }

  // --- ANALYTICS SUMMARY ---
  public getAnalytics() {
    const totalReceivables = this.data.parties
      .filter((p) => p.currentBalance > 0)
      .reduce((sum, p) => sum + p.currentBalance, 0);

    const totalPayables = this.data.parties
      .filter((p) => p.currentBalance < 0)
      .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

    const totalSales = this.data.transactions
      .filter((t) => t.type === 'sale_invoice')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPurchases = this.data.transactions
      .filter((t) => t.type === 'purchase_bill')
      .reduce((sum, t) => sum + t.amount, 0);

    const inventoryValuation = this.data.items.reduce((sum, item) => {
      const qty = item.currentStock || 0;
      const rate = item.purchasePrice || item.salePrice * 0.7;
      return sum + qty * rate;
    }, 0);

    const activeFleetCount = this.data.vehicles.filter((v) => v.status === 'on_trip').length;
    const totalFleetCount = this.data.vehicles.length;

    const totalBatchesCount = this.data.productionBatches.length;
    const totalProductionTonnes = this.data.productionBatches.reduce((sum, b) => sum + b.targetQuantity, 0);

    return {
      financials: {
        totalReceivables,
        totalPayables,
        netCashPosition: totalReceivables - totalPayables,
        totalSales,
        totalPurchases,
        inventoryValuation,
      },
      operations: {
        totalBatchesCount,
        totalProductionTonnes,
        activeFleetCount,
        totalFleetCount,
        fleetUtilizationRate: totalFleetCount > 0 ? Math.round((activeFleetCount / totalFleetCount) * 100) : 0,
        pendingOrdersCount: this.data.orders.filter((o) => o.status === 'pending').length,
        activeEmployeesCount: this.data.employees.filter((e) => e.status === 'active').length,
      },
      topCustomers: this.data.parties
        .filter((p) => p.type === 'customer' || p.type === 'both')
        .sort((a, b) => b.currentBalance - a.currentBalance)
        .slice(0, 5),
      topSuppliers: this.data.parties
        .filter((p) => p.type === 'vendor' || p.type === 'transporter')
        .sort((a, b) => a.currentBalance - b.currentBalance)
        .slice(0, 5),
    };
  }

  // --- DOCUMENTS (S3-uploaded files + owner mapping) ---
  // `documents` holds every file uploaded through s3Upload.ts (S3 key +
  // permanent URL + soft status); sale_order_documents / purchase_order_documents /
  // parties_documents / inventory_documents are the pure FK join tables
  // (owner id ↔ document id; the two MySQL-only tables are named
  // parties_documents and inventory_documents). S3 objects are NEVER
  // deleted by the app and no delete UI exists yet (user directive 2026-10-17):
  // the documents row carries status 'active'/'deleted' — when an owner is
  // deleted its mappings drop and any document no longer mapped anywhere flips
  // to 'deleted' (soft), its bucket file retained for audit.

  public getDocumentById(id: string): AppDocument | undefined {
    return (this.data.documents || []).find((d) => d.id === id);
  }

  public getDocumentsForSale(saleId: string): AppDocument[] {
    return this.documentsFor('sale', saleId);
  }

  public getDocumentsForPurchase(purchaseId: string): AppDocument[] {
    return this.documentsFor('purchase', purchaseId);
  }

  public getDocumentsForParty(partyId: string): AppDocument[] {
    return this.documentsFor('party', partyId);
  }

  public getDocumentsForItem(itemId: string): AppDocument[] {
    return this.documentsFor('item', itemId);
  }

  public getDocumentsForEmployee(employeeId: string): AppDocument[] {
    return this.documentsFor('employee', employeeId);
  }

  public getDocumentsForVehicle(vehicleId: string): AppDocument[] {
    return this.documentsFor('vehicle', vehicleId);
  }

  public getDocumentsForExpense(expenseId: string): AppDocument[] {
    return this.documentsFor('expense', expenseId);
  }

  private documentsFor(kind: DocLinkKind, ownerId: string): AppDocument[] {
    const links = this.docLinksFor(kind);
    const ids = (links as any[])
      .filter((l) => (kind === 'sale' ? l.saleId : kind === 'purchase' ? l.purchaseId : kind === 'party' ? l.partyId : kind === 'employee' ? l.employeeId : kind === 'vehicle' ? l.vehicleId : kind === 'expense' ? l.expenseId : l.itemId) === ownerId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((l) => l.documentId);
    return (this.data.documents || []).filter(
      (d) => ids.includes(d.id) && d.status !== 'deleted'
    );
  }

  /** The in-memory mapping rows for a documents feature kind (create-on-read). */
  private docLinksFor(kind: DocLinkKind): any[] {
    switch (kind) {
      case 'sale':
        return (this.data.saleOrderDocuments = this.data.saleOrderDocuments || []);
      case 'purchase':
        return (this.data.purchaseOrderDocuments = this.data.purchaseOrderDocuments || []);
      case 'party':
        return (this.data.partyDocuments = this.data.partyDocuments || []);
      case 'item':
        return (this.data.itemDocuments = this.data.itemDocuments || []);
      case 'employee':
        return (this.data.employeeDocuments = this.data.employeeDocuments || []);
      case 'vehicle':
        return (this.data.vehicleDocuments = this.data.vehicleDocuments || []);
      case 'expense':
        return (this.data.expenseDocuments = this.data.expenseDocuments || []);
    }
  }

  public createDocument(payload: {
    fileName: string;
    documentName?: string;
    s3Key: string;
    url: string;
    contentType?: string;
    sizeBytes?: number;
  }, uploadedById?: string): AppDocument {
    if (!this.data.documents) this.data.documents = [];
    const doc: AppDocument = {
      id: `doc-${this.nextLedgerMs()}`,
      fileName: String((payload as any).fileName || (payload as any).name || '').slice(0, 255),
      // USER-ENTERED DOCUMENT NAME (required client-side): the human label the
      // uploader typed against the upload — falls back to the file name only
      // where defensiveness matters (fallback close/registration).
      documentName: payload.documentName?.trim() || undefined,
      s3Key: String(payload.s3Key).slice(0, 512),
      url: String(payload.url),
      contentType: payload.contentType || undefined,
      sizeBytes: Number(payload.sizeBytes) || 0,
      uploadedById: uploadedById || undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.data.documents.unshift(doc);
    this.logAudit('CREATE', 'DOCUMENT', doc.id, `Uploaded document ${doc.documentName || doc.fileName}`);
    this.save();
    liveSyncDocument(doc);
    return doc;
  }

  public linkSaleDocuments(saleId: string, documentIds: string[]): number {
    return this.linkOrderDocuments('sale', saleId, documentIds);
  }

  public linkPurchaseDocuments(purchaseId: string, documentIds: string[]): number {
    return this.linkOrderDocuments('purchase', purchaseId, documentIds);
  }

  public linkPartyDocuments(partyId: string, documentIds: string[]): number {
    return this.linkOrderDocuments('party', partyId, documentIds);
  }

  public linkItemDocuments(itemId: string, documentIds: string[]): number {
    return this.linkOrderDocuments('item', itemId, documentIds);
  }

  public linkEmployeeDocuments(employeeId: string, documentIds: string[]): number {
    return this.linkOrderDocuments('employee', employeeId, documentIds);
  }

  public linkVehicleDocuments(vehicleId: string, documentIds: string[]): number {
    return this.linkOrderDocuments('vehicle', vehicleId, documentIds);
  }

  public linkExpenseDocuments(expenseId: string, documentIds: string[]): number {
    return this.linkOrderDocuments('expense', expenseId, documentIds);
  }

  /** Idempotent FK-link writer — mapping rows only (no document mutation). */
  private linkOrderDocuments(kind: DocLinkKind, ownerId: string, documentIds: string[]): number {
    if (!Array.isArray(documentIds)) return 0;
    const validIds = [...new Set(documentIds.map(String).filter(Boolean))].filter((id) =>
      (this.data.documents || []).some((d) => d.id === id && d.status === 'active')
    );
    const links = this.docLinksFor(kind);
    let added = 0;
    validIds.forEach((docId) => {
      const ownerKey = kind === 'sale' ? 'saleId' : kind === 'purchase' ? 'purchaseId' : kind === 'party' ? 'partyId' : kind === 'employee' ? 'employeeId' : kind === 'vehicle' ? 'vehicleId' : kind === 'expense' ? 'expenseId' : 'itemId';
      const exists = links.some((l: any) => l.documentId === docId && l[ownerKey] === ownerId);
      if (exists) return;
      const link = {
        id: `pdoc-${this.nextLedgerMs()}`,
        [ownerKey]: ownerId,
        documentId: docId,
        createdAt: new Date().toISOString(),
      } as any;
      links.push(link);
      added += 1;
      this.logAudit('LINK', 'DOCUMENT', docId, `Document linked to ${kind} ${ownerId}`);
      this.liveSyncDocLink(kind, link);
    });
    this.save();
    this.settlePendingDocumentMoves(kind, ownerId, validIds);
    return added;
  }

  /** Live-write one mapping row to its MySQL table (fire-and-forget). */
  private liveSyncDocLink(kind: DocLinkKind, link: any, isDelete = false): void {
    if (kind === 'sale') liveSyncSaleOrderDocLink(link as SaleOrderDocumentLink, isDelete);
    else if (kind === 'purchase') liveSyncPurchaseOrderDocLink(link as PurchaseOrderDocumentLink, isDelete);
    else if (kind === 'party') liveSyncPartyDocLink(link as PartyDocumentLink, isDelete);
    else if (kind === 'employee') liveSyncEmployeeDocLink(link as EmployeeDocumentLink, isDelete);
    else if (kind === 'vehicle') liveSyncVehicleDocLink(link as VehicleDocumentLink, isDelete);
    else if (kind === 'expense') liveSyncExpenseDocLink(link as ExpenseDocumentLink, isDelete);
    else liveSyncItemDocLink(link as ItemDocumentLink, isDelete);
  }

  /**
   * S3 MOVE-ON-LINK (user key structure): documents uploaded while creating a
   * new record live under `Pending/<uuid>.<ext>` because the owner FK id did
   * not exist yet. The moment they link, each Pending object is
   * COPIED into `<Sale|Purchase|Party|Inventory>/<ownerId>/<uuid4>.<ext>`
   * (server-side CopyObject — no re-upload) and its temp source deleted; the
   * row's s3_key and url then point at the final location. Fire-and-forget
   * like the other cloud syncs; idempotent (only Pending/* keys participate).
   */
  private settlePendingDocumentMoves(kind: DocLinkKind, ownerId: string, documentIds: string[]): void {
    const pendingIds = documentIds.filter((docId) => {
      const doc = (this.data.documents || []).find((d) => d.id === docId);
      return !!doc && doc.s3Key.startsWith('Pending/');
    });
    if (pendingIds.length === 0) return;
    pendingIds.forEach(async (docId) => {
      try {
        const doc = (this.data.documents || []).find((d) => d.id === docId);
        if (!doc) return;
        const dot = doc.s3Key.lastIndexOf('.');
        const ext = dot > -1 ? doc.s3Key.slice(dot) : '';
        const finalKey = `${orderDocumentRoot(kind)}/${ownerId}/${randomUUID()}${ext}`;
        const moved = await moveS3Object(doc.s3Key, finalKey);
        if (!moved.ok || !moved.publicUrl) {
          console.error(`[DB] Document move to final key failed for ${docId}: ${moved.error}`);
          return;
        }
        doc.s3Key = finalKey;
        doc.url = moved.publicUrl;
        this.logAudit('MOVE', 'DOCUMENT', docId, `Pending object moved to ${finalKey}`);
        this.save();
        liveSyncDocument(doc);
      } catch (e: any) {
        console.error(`[DB] Pending document move error for ${docId}:`, e.message);
      }
    });
  }

  /** documentIds riding on create/edit/stage-issue payloads (never persisted) */
  private extractDocumentIds(payload: any): string[] {
    const ids = payload && Array.isArray((payload as any).documentIds)
      ? (payload as any).documentIds.map(String).filter(Boolean)
      : [];
    return [...new Set(ids)];
  }

  public detachSaleDocuments(saleId: string): void {
    this.detachOrderDocuments('sale', saleId);
  }

  public detachPurchaseDocuments(purchaseId: string): void {
    this.detachOrderDocuments('purchase', purchaseId);
  }

  public detachEmployeeDocuments(employeeId: string): void {
    this.detachOrderDocuments('employee', employeeId);
  }

  public detachPartyDocuments(partyId: string): void {
    this.detachOrderDocuments('party', partyId);
  }

  public detachItemDocuments(itemId: string): void {
    this.detachOrderDocuments('item', itemId);
  }

  public detachVehicleDocuments(vehicleId: string): void {
    this.detachOrderDocuments('vehicle', vehicleId);
  }

  public detachExpenseDocuments(expenseId: string): void {
    this.detachOrderDocuments('expense', expenseId);
  }

  /** Cascade for owner deletion: drop mappings, soft-delete orphaned documents. */
  private detachOrderDocuments(kind: DocLinkKind, ownerId: string): void {
    const ownerKey = kind === 'sale' ? 'saleId' : kind === 'purchase' ? 'purchaseId' : kind === 'party' ? 'partyId' : kind === 'employee' ? 'employeeId' : kind === 'vehicle' ? 'vehicleId' : kind === 'expense' ? 'expenseId' : 'itemId';
    const removed = this.docLinksFor(kind).filter((l: any) => l[ownerKey] === ownerId);
    const kinds: DocLinkKind[] = ['sale', 'purchase', 'party', 'item', 'employee', 'vehicle', 'expense'];
    // Drop this kind's mapping rows for the deleted owner
    const keptForKind = this.docLinksFor(kind).filter((l: any) => l[ownerKey] !== ownerId);
    switch (kind) {
      case 'sale':
        this.data.saleOrderDocuments = keptForKind as SaleOrderDocumentLink[];
        break;
      case 'purchase':
        this.data.purchaseOrderDocuments = keptForKind as PurchaseOrderDocumentLink[];
        break;
      case 'party':
        this.data.partyDocuments = keptForKind as PartyDocumentLink[];
        break;
      case 'item':
        this.data.itemDocuments = keptForKind as ItemDocumentLink[];
        break;
      case 'employee':
        this.data.employeeDocuments = keptForKind as EmployeeDocumentLink[];
        break;
      case 'vehicle':
        this.data.vehicleDocuments = keptForKind as VehicleDocumentLink[];
        break;
      case 'expense':
        this.data.expenseDocuments = keptForKind as ExpenseDocumentLink[];
        break;
    }
    removed.forEach((l: any) => this.liveSyncDocLink(kind, l, true));

    // A document mapped to NOTHING anymore (across ALL feature kinds) =
    // soft-deleted (S3 file retained)
    const otherLinks = kinds.filter((k) => k !== kind).flatMap((k) => (this as any).docLinkRows(k));
    removed.forEach((l: any) => {
      const stillLinked = otherLinks.some((o: any) => o.documentId === l.documentId);
      const doc = (this.data.documents || []).find((d) => d.id === l.documentId);
      if (!stillLinked && doc && doc.status !== 'deleted') {
        doc.status = 'deleted';
        liveSyncDocument(doc);
      }
    });
    if (removed.length > 0) {
      this.logAudit('DELETE', 'DOCUMENT', ownerId, `${removed.length} document mapping(s) dropped from ${kind} ${ownerId} (S3 files retained)`);
    }
  }

  /** Read-only view of the mapping rows for a kind (post-mutation safe). */
  private docLinkRows(kind: DocLinkKind): any[] {
    switch (kind) {
      case 'sale':
        return this.data.saleOrderDocuments || [];
      case 'purchase':
        return this.data.purchaseOrderDocuments || [];
      case 'party':
        return this.data.partyDocuments || [];
      case 'item':
        return this.data.itemDocuments || [];
      case 'employee':
        return this.data.employeeDocuments || [];
      case 'vehicle':
        return this.data.vehicleDocuments || [];
      case 'expense':
        return this.data.expenseDocuments || [];
    }
  }

  // --- USER MANAGEMENT & AUTH ---
  public getUsers(includeSensitive = false): AppUser[] {
    if (!this.data.users) {
      this.data.users = JSON.parse(JSON.stringify(SEED_USERS));
    }
    return this.data.users.map((u) => {
      if (includeSensitive) return { ...u };
      const { passwordHash, ...safeUser } = u;
      return safeUser as AppUser;
    });
  }

  public getUserById(id: string, includeSensitive = false): AppUser | undefined {
    // NO read-path auto-heal here: finders must be pure. Status is forced to
    // 'active' or a hash minted by a GET would (a) silently un-suspend a
    // super admin on the request after `PATCH /:id/status`, and (b) mint
    // Admin@123 out of an auth'd read. The deliberate no-lockout heal for the
    // super admin lives in the login route only (auth.ts login handler) and at
    // hydration time (initFromMysql's super-admin ensure + active-hash pass).
    const user = this.data.users?.find((u) => u.id === id);
    if (!user) return undefined;
    if (includeSensitive) return { ...user };
    const { passwordHash, ...safeUser } = user;
    return safeUser as AppUser;
  }

  public getUserByUsername(username: string, includeSensitive = false): AppUser | undefined {
    // Pure finder — see getUserById for why auto-heal does not belong here.
    const normalized = username.trim().toLowerCase();
    const user = this.data.users?.find((u) => u.username.toLowerCase() === normalized);
    if (!user) return undefined;
    if (includeSensitive) return { ...user };
    const { passwordHash, ...safeUser } = user;
    return safeUser as AppUser;
  }

  public generateUniqueUsername(fullName: string, role: string = 'admin'): string {
    const cleanName = fullName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8) || 'user';
    
    let roleCode = 'adm';
    if (role === 'super_admin') roleCode = 'sup';
    else if (role === 'manager') roleCode = 'mgr';
    else if (role === 'operator') roleCode = 'ops';

    const existingUsernames = new Set((this.data.users || []).map((u) => u.username.toLowerCase()));

    let candidate = '';
    let attempts = 0;
    do {
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      candidate = `${cleanName}.${roleCode}${randSuffix}`;
      attempts++;
    } while (existingUsernames.has(candidate) && attempts < 100);

    return candidate;
  }

  public generateActivationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ACT-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  public createUser(payload: {
    fullName: string;
    email: string;
    phone?: string;
    role: UserRole;
    permissions: UserPermissions;
    notes?: string;
    customUsername?: string;
  }, opts: { skipMysqlSync?: boolean } = {}): AppUser {
    if (!this.data.users) {
      this.data.users = JSON.parse(JSON.stringify(SEED_USERS));
    }

    const username = payload.customUsername?.trim().toLowerCase() || this.generateUniqueUsername(payload.fullName, payload.role);
    const activationCode = this.generateActivationCode();

    // Monotonic clock id: concurrent creates must never share an id
    // (same class fixed for acc-/stk-adj- — sweep of bare Date.now() ids).
    const newId = `usr-${this.nextLedgerMs()}`;

    const newUser: AppUser = {
      id: newId,
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone?.trim() || '',
      username,
      role: payload.role,
      status: 'pending_setup',
      activationCode,
      permissions: { ...payload.permissions },
      createdAt: new Date().toISOString(),
      notes: payload.notes || '',
    };

    this.data.users.push(newUser);
    this.logAudit('CREATE', 'USER', newUser.id, `Created new ${newUser.role} account for ${newUser.fullName} (username: ${newUser.username}, pending setup).`);
    this.save();
    if (!opts.skipMysqlSync) {
      liveSyncUser(newUser).catch((e) => console.error('[DB] Failed liveSync for createUser:', e.message));
    }

    const { passwordHash, ...safeUser } = newUser;
    return safeUser as AppUser;
  }

  public async createUserAsync(payload: {
    fullName: string;
    email: string;
    phone?: string;
    role: UserRole;
    permissions: UserPermissions;
    notes?: string;
    customUsername?: string;
  }): Promise<AppUser> {
    // Single AWAITED sync (the sync mutation used to fire twice: once
    // fire-and-forget inside createUser, once awaited here).
    const user = this.createUser(payload, { skipMysqlSync: true });
    const fullUser = this.data.users?.find((u) => u.id === user.id);
    if (fullUser) {
      await liveSyncUser(fullUser);
    }
    return user;
  }

  public updateUser(id: string, updates: Partial<AppUser>, opts: { skipMysqlSync?: boolean } = {}): AppUser | null {
    if (!this.data.users) return null;
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index === -1) return null;

    const existing = this.data.users[index];

    // Prevent stripping super_admin if they are the only active super_admin
    if (existing.role === 'super_admin' && updates.role && updates.role !== 'super_admin') {
      const activeSuperAdmins = this.data.users.filter((u) => u.role === 'super_admin' && u.status === 'active' && u.id !== id);
      if (activeSuperAdmins.length === 0) {
        throw new Error('Cannot downgrade the only active Super Administrator.');
      }
    }

    // Same lockout class on suspend/pending: a super admin taken out of
    // 'active' is exactly as dangerous as one demoted — protect the last one.
    if (existing.role === 'super_admin' && updates.status && ['suspended', 'pending_setup'].includes(updates.status)) {
      const otherActiveSuperAdmins = this.data.users.filter(
        (u) => u.role === 'super_admin' && u.status === 'active' && u.id !== id
      );
      if (otherActiveSuperAdmins.length === 0) {
        throw new Error('Cannot deactivate the only active Super Administrator. Re-activate or provision another Super Admin first.');
      }
    }

    this.data.users[index] = {
      ...existing,
      ...updates,
      id: existing.id, // prevent changing ID
    };

    this.logAudit('UPDATE', 'USER', id, `Updated user profile for ${existing.username}.`);
    this.save();
    if (!opts.skipMysqlSync) {
      liveSyncUser(this.data.users[index]).catch((e) => console.error('[DB] Failed liveSync for updateUser:', e.message));
    }

    const { passwordHash, ...safeUser } = this.data.users[index];
    return safeUser as AppUser;
  }

  public async updateUserAsync(id: string, updates: Partial<AppUser>): Promise<AppUser | null> {
    // Single AWAITED sync (mirror of createUserAsync — the old wrapper wrote
    // to MySQL twice per mutation: once fire-and-forget, once awaited).
    const user = this.updateUser(id, updates, { skipMysqlSync: true });
    const fullUser = this.data.users?.find((u) => u.id === id);
    if (fullUser) {
      await liveSyncUser(fullUser);
    }
    return user;
  }

  public deleteUser(id: string, opts: { skipMysqlSync?: boolean } = {}): boolean {
    if (!this.data.users) return false;
    const user = this.data.users.find((u) => u.id === id);
    if (!user) return false;

    if (user.role === 'super_admin') {
      const remainingSuperAdmins = this.data.users.filter((u) => u.role === 'super_admin' && u.id !== id);
      if (remainingSuperAdmins.length === 0) {
        throw new Error('Cannot delete the last Super Administrator account.');
      }
    }

    this.data.users = this.data.users.filter((u) => u.id !== id);
    this.logAudit('DELETE', 'USER', id, `Deleted user account ${user.username} (${user.fullName}).`);
    this.save();
    if (!opts.skipMysqlSync) {
      liveSyncUser(user, true).catch((e) => console.error('[DB] Failed liveSync for deleteUser:', e.message));
    }
    return true;
  }

  public async deleteUserAsync(id: string): Promise<boolean> {
    // Single AWAITED sync (mirror of createUserAsync/updateUserAsync).
    const user = this.data.users?.find((u) => u.id === id);
    if (!user) return false;
    const res = this.deleteUser(id, { skipMysqlSync: true });
    if (res) {
      await liveSyncUser(user, true);
    }
    return res;
  }

  // --- CASH & BANK MANAGEMENT ---

  public getAccounts(): CashBankAccount[] {
    return this.data.accounts || [];
  }

  public getAccountById(id: string): CashBankAccount | undefined {
    return (this.data.accounts || []).find((a) => a.id === id);
  }

  public addAccount(accountData: Omit<CashBankAccount, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>, actorId?: string): CashBankAccount {
    if (!this.data.accounts) this.data.accounts = [];
    // Monotonic clock id: concurrent account creates must never share an id
    const newId = `acc-${this.nextLedgerMs()}`;
    const now = new Date().toISOString();
    const openingBal = Number(accountData.openingBalance) || 0;

    const newAccount: CashBankAccount = {
      ...accountData,
      id: newId,
      openingBalance: openingBal,
      currentBalance: openingBal,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      // DONE-BY AUDIT (2026-11-21)
      createdById: actorId || (accountData as any).createdById,
      updatedById: actorId || (accountData as any).updatedById,
    };

    this.data.accounts.push(newAccount);
    this.logAudit('CREATE', 'ACCOUNT', newId, `Added cash/bank account ${newAccount.name} (${newAccount.type}) with opening balance ₹${openingBal}.`);
    this.save();
    liveSyncAccount(newAccount).catch((e) => console.error('[DB] Failed liveSync for addAccount:', e.message));
    return newAccount;
  }

  public async addAccountAsync(accountData: Omit<CashBankAccount, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>, actorId?: string): Promise<CashBankAccount> {
    const acc = this.addAccount(accountData, actorId);
    await liveSyncAccount(acc);
    return acc;
  }

  public updateAccount(id: string, updates: Partial<CashBankAccount>, actorId?: string): CashBankAccount {
    if (!this.data.accounts) this.data.accounts = [];
    const index = this.data.accounts.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`Account with id ${id} not found.`);
    // DONE-BY AUDIT (2026-11-21): a master edit never rewrites the booking
    // user (strip client forgery); updatedById moves only with a real actor.
    // The internal balance rebalance (recalculateAccountBalance) calls this
    // with NO actor — a bookkeeping rewrite must not claim a human edit.
    delete (updates as any).createdById;
    delete (updates as any).updatedById;
    delete (updates as any).createdByName;
    delete (updates as any).updatedByName;

    const updated: CashBankAccount = {
      ...this.data.accounts[index],
      ...updates,
      updatedAt: new Date().toISOString(),
      ...(actorId ? { updatedById: actorId } : {}),
    };

    this.data.accounts[index] = updated;
    this.logAudit('UPDATE', 'ACCOUNT', id, `Updated account ${updated.name}.`);
    this.save();
    liveSyncAccount(updated).catch((e) => console.error('[DB] Failed liveSync for updateAccount:', e.message));
    return updated;
  }

  public async updateAccountAsync(id: string, updates: Partial<CashBankAccount>, actorId?: string): Promise<CashBankAccount> {
    const acc = this.updateAccount(id, updates, actorId);
    await liveSyncAccount(acc);
    return acc;
  }

  public deleteAccount(id: string): boolean {
    if (!this.data.accounts) return false;
    const acc = this.data.accounts.find((a) => a.id === id);
    if (!acc) return false;

    this.data.accounts = this.data.accounts.filter((a) => a.id !== id);
    this.logAudit('DELETE', 'ACCOUNT', id, `Deleted account ${acc.name}.`);
    this.save();
    liveSyncAccount(acc, true).catch((e) => console.error('[DB] Failed liveSync for deleteAccount:', e.message));
    return true;
  }

  public async deleteAccountAsync(id: string): Promise<boolean> {
    const acc = this.data.accounts?.find((a) => a.id === id);
    if (!acc) return false;
    const res = this.deleteAccount(id);
    if (res) {
      await liveSyncAccount(acc, true);
    }
    return res;
  }

  public recalculateAccountBalance(accountId: string) {
    const account = this.getAccountById(accountId);
    if (!account) return;

    let balance = Number(account.openingBalance) || 0;

    // 1. Transactions linked to this account
    const txs = (this.data.transactions || []).filter((t) => (t as any).accountId === accountId && t.status !== 'cancelled');
    for (const tx of txs) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'payment_in' || tx.type === 'sale_invoice') {
        balance += amt;
      } else if (tx.type === 'payment_out' || tx.type === 'purchase_bill') {
        balance -= amt;
      }
    }

    // 2. Transfers (From vs To)
    const transfers = this.getTransfers();
    for (const trf of transfers) {
      const amt = Number(trf.amount) || 0;
      if (trf.fromAccountId === accountId) {
        balance -= amt;
      }
      if (trf.toAccountId === accountId) {
        balance += amt;
      }
    }

    // 3. Adjustments
    const adjustments = (this.data.adjustments || []).filter((adj) => adj.accountId === accountId);
    for (const adj of adjustments) {
      const amt = Number(adj.amount) || 0;
      if (adj.type === 'increase') {
        balance += amt;
      } else if (adj.type === 'decrease') {
        balance -= amt;
      }
    }

    // 4. Payroll payouts — every recorded salary/advance/bonus/reimbursement
    // leaves its selected account (Payroll & Payments tab)
    const payouts = (this.data.employeePayments || []).filter((p) => p.accountId === accountId);
    for (const pay of payouts) {
      balance -= Number(pay.amount) || 0;
    }

    // 5. Employee ledger rows — reduce_balance pays OUT; add_balance linked
    // to an account is a RECEIPT from the employee (money IN); a bank-linked
    // direct transaction moves whichever direction was recorded. Plain
    // adjust-modal add_balance rows carry no account and move nothing here.
    const ledgerRows = (this.data.employeeLedgerTransactions || []).filter((t) => t.accountId === accountId);
    for (const t of ledgerRows) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'add_balance') {
        balance += amt;
      } else if (t.type === 'reduce_balance') {
        balance -= amt;
      } else if (t.type === 'direct_transaction') {
        balance += t.direction === 'money_in' ? amt : -amt;
      }
    }

    // 6. Vehicle EMI debits — every auto/posted loan installment against this
    // account (created/edited/deleted via the vehicle EMI ledger; the entry
    // list is the truth and edits rebalance by delta automatically).
    const vehEmiEntries = (this.data.vehicleEmiEntries || []).filter((e) => e.accountId === accountId);
    for (const e of vehEmiEntries) {
      balance -= Number(e.amount) || 0;
    }

    // 7. Vehicle expense log — generic expenses AND diesel fuel fills against
    // this account (Fleets → Expenses; the entry list is the truth — edits
    // rebalance by delta and deletes reverse their debit).
    const vehExpenses = (this.data.vehicleExpenseEntries || []).filter((e) => e.accountId === accountId);
    for (const e of vehExpenses) {
      balance -= Number(e.amount) || 0;
    }

    this.updateAccount(accountId, { currentBalance: balance });
  }

  // --- INTERNAL TRANSFERS ---

  /**
   * Transfer/adjustment records store ONLY account FKs (Golden Rule,
   * documentation §2). Display names (and the adjustment's account type)
   * are resolved from the cash_bank_accounts master at read time, so any
   * account rename propagates to every transfer/adjustment display.
   */
  private hydrateTransfer(trf: InternalTransfer): InternalTransfer {
    const from = this.getAccountById(trf.fromAccountId);
    const to = this.getAccountById(trf.toAccountId);
    return {
      ...trf,
      fromAccountName: from?.name || trf.fromAccountName || undefined,
      toAccountName: to?.name || trf.toAccountName || undefined,
    };
  }

  private hydrateAdjustment(adj: AccountAdjustment): AccountAdjustment {
    const acc = this.getAccountById(adj.accountId);
    return {
      ...adj,
      accountName: acc?.name || adj.accountName || undefined,
      accountType: acc?.type || adj.accountType || undefined,
    };
  }

  public getTransfers(): InternalTransfer[] {
    return (this.data.transfers || []).map((t) => this.hydrateTransfer(t));
  }

  public addTransfer(transferData: Omit<InternalTransfer, 'id' | 'createdAt' | 'transferNumber'>, actorId?: string): InternalTransfer {
    if (!this.data.transfers) this.data.transfers = [];
    const count = this.data.transfers.length + 1;
    const transferNumber = `TRF-26/${String(count).padStart(3, '0')}`;
    const newId = `trf-${Date.now()}`;
    const newTransfer: InternalTransfer = {
      ...transferData,
      id: newId,
      transferNumber,
      createdAt: new Date().toISOString(),
      // Accounts are referenced by FK only; display names are JOINed at read
      // time and never stored on the voucher row (documentation §2).
      fromAccountName: undefined,
      toAccountName: undefined,
      // DONE-BY AUDIT (2026-11-21)
      createdById: actorId || (transferData as any).createdById,
      updatedById: actorId || (transferData as any).updatedById,
    };

    this.data.transfers.unshift(newTransfer);
    this.recalculateAccountBalance(transferData.fromAccountId);
    this.recalculateAccountBalance(transferData.toAccountId);

    const fromAcc = this.getAccountById(transferData.fromAccountId);
    const toAcc = this.getAccountById(transferData.toAccountId);
    this.logAudit('CREATE', 'TRANSFER', newId, `Transferred ₹${transferData.amount} from ${fromAcc?.name} to ${toAcc?.name}.`);
    this.save();
    liveSyncTransfer(newTransfer).catch((e) => console.error('[DB] Failed liveSync for addTransfer:', e.message));
    return newTransfer;
  }

  public async addTransferAsync(transferData: Omit<InternalTransfer, 'id' | 'createdAt' | 'transferNumber'>, actorId?: string): Promise<InternalTransfer> {
    const trf = this.addTransfer(transferData, actorId);
    await liveSyncTransfer(trf);
    return trf;
  }

  public deleteTransfer(id: string): boolean {
    if (!this.data.transfers) return false;
    const toDelete = this.data.transfers.find((t) => t.id === id);
    if (!toDelete) return false;

    this.data.transfers = this.data.transfers.filter((t) => t.id !== id);
    this.recalculateAccountBalance(toDelete.fromAccountId);
    this.recalculateAccountBalance(toDelete.toAccountId);

    this.logAudit('DELETE', 'TRANSFER', id, `Deleted transfer ${toDelete.transferNumber}.`);
    this.save();
    liveSyncTransfer(toDelete, true).catch((e) => console.error('[DB] Failed liveSync for deleteTransfer:', e.message));
    return true;
  }

  public async deleteTransferAsync(id: string): Promise<boolean> {
    const toDelete = this.data.transfers?.find((t) => t.id === id);
    if (!toDelete) return false;
    const res = this.deleteTransfer(id);
    if (res) {
      await liveSyncTransfer(toDelete, true);
    }
    return res;
  }

  // --- ACCOUNT ADJUSTMENTS ---

  public getAdjustments(): AccountAdjustment[] {
    return (this.data.adjustments || []).map((a) => this.hydrateAdjustment(a));
  }

  public addAdjustment(adjData: Omit<AccountAdjustment, 'id' | 'createdAt' | 'adjustmentNumber' | 'previousBalance' | 'newBalance'>, actorId?: string): AccountAdjustment {
    if (!this.data.adjustments) this.data.adjustments = [];
    const account = this.getAccountById(adjData.accountId);
    const prevBal = account ? account.currentBalance : 0;
    const amt = Number(adjData.amount) || 0;
    const newBal = adjData.type === 'increase' ? prevBal + amt : prevBal - amt;

    const count = this.data.adjustments.length + 1;
    const adjustmentNumber = `ADJ-26/${String(count).padStart(3, '0')}`;
    const newId = `adj-${Date.now()}`;

    const newAdj: AccountAdjustment = {
      ...adjData,
      id: newId,
      adjustmentNumber,
      previousBalance: prevBal,
      newBalance: newBal,
      createdAt: new Date().toISOString(),
      // Account referenced by FK only; display name/type are JOINed at read
      // time and never stored on the voucher row (documentation §2).
      accountName: undefined,
      accountType: undefined,
      // DONE-BY AUDIT (2026-11-21)
      createdById: actorId || (adjData as any).createdById,
      updatedById: actorId || (adjData as any).updatedById,
    };

    this.data.adjustments.unshift(newAdj);
    this.recalculateAccountBalance(adjData.accountId);

    const acc = this.getAccountById(adjData.accountId);
    this.logAudit('CREATE', 'ADJUSTMENT', newId, `Adjusted ${acc?.name} (${adjData.type} ₹${amt}): ${adjData.reason}.`);
    this.save();
    liveSyncAdjustment(newAdj).catch((e) => console.error('[DB] Failed liveSync for addAdjustment:', e.message));
    return newAdj;
  }

  public async addAdjustmentAsync(adjData: Omit<AccountAdjustment, 'id' | 'createdAt' | 'adjustmentNumber' | 'previousBalance' | 'newBalance'>, actorId?: string): Promise<AccountAdjustment> {
    const adj = this.addAdjustment(adjData, actorId);
    await liveSyncAdjustment(adj);
    return adj;
  }

  public deleteAdjustment(id: string): boolean {
    if (!this.data.adjustments) return false;
    const toDelete = this.data.adjustments.find((a) => a.id === id);
    if (!toDelete) return false;

    this.data.adjustments = this.data.adjustments.filter((a) => a.id !== id);
    this.recalculateAccountBalance(toDelete.accountId);

    this.logAudit('DELETE', 'ADJUSTMENT', id, `Deleted adjustment ${toDelete.adjustmentNumber}.`);
    this.save();
    liveSyncAdjustment(toDelete, true).catch((e) => console.error('[DB] Failed liveSync for deleteAdjustment:', e.message));
    return true;
  }

  public async deleteAdjustmentAsync(id: string): Promise<boolean> {
    const toDelete = this.data.adjustments?.find((a) => a.id === id);
    if (!toDelete) return false;
    const res = this.deleteAdjustment(id);
    if (res) {
      await liveSyncAdjustment(toDelete, true);
    }
    return res;
  }

  // --- BACKUP & RESTORE ---
  public restoreSnapshot(snapshot: Partial<DatabaseSchema>): boolean {
    if (!snapshot || typeof snapshot !== 'object') return false;
    this.data = {
      ...this.getDefaultSchema(),
      ...snapshot,
      lastUpdated: new Date().toISOString(),
    };
    this.logAudit('RESTORE', 'DATABASE', undefined, 'Full database restore executed from backup snapshot.');
    this.persistSync();
    return true;
  }

  public resetToDefaults(): boolean {
    this.data = this.getDefaultSchema();
    this.logAudit('RESET', 'DATABASE', undefined, 'Factory defaults reset applied.');
    this.persistSync();
    return true;
  }
}

export const serverDb = new ServerLocalDatabase();
