import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import {
  Party,
  Transaction,
  CompanySettings,
  Item,
  ItemCategory,
  ItemUnit,
  ItemLocation,
  ItemLocationStock,
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
  ItemStockAdjustment,
  StockMovementLog,
  AppUser,
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
  liveSyncOrder,
  liveSyncBatch,
  liveSyncAuditLog,
  liveSyncVehicle,
  liveSyncDriver,
  liveSyncTripSlip,
  liveSyncTyre,
  liveSyncEmployee,
  liveSyncAttendance,
  liveSyncLeave,
  liveSyncEmployeePayment,
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
  SEED_TYRES,
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
  orders: Order[];
  vehicles: Vehicle[];
  drivers: Driver[];
  tripSlips: TripSlip[];
  tyres: Tyre[];
  employees: Employee[];
  attendance: EmployeeAttendance[];
  leaves: EmployeeLeave[];
  employeePayments: EmployeePayment[];
  accounts: CashBankAccount[];
  transfers: InternalTransfer[];
  adjustments: AccountAdjustment[];
  stockMovements: StockMovementRecord[];
  users: AppUser[];
  auditLogs: AuditLog[];
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
  // Display names resolved via JOIN at read time (never persisted by name in MySQL)
  locationName?: string;
  partyName?: string;
}

class ServerLocalDatabase {
  private data: DatabaseSchema;
  private isLoaded = false;
  private saveTimeout: NodeJS.Timeout | null = null;

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
      orders: [],
      vehicles: JSON.parse(JSON.stringify(SEED_VEHICLES)),
      drivers: JSON.parse(JSON.stringify(SEED_DRIVERS)),
      tripSlips: JSON.parse(JSON.stringify(SEED_TRIP_SLIPS)),
      tyres: JSON.parse(JSON.stringify(SEED_TYRES)),
      employees: JSON.parse(JSON.stringify(SEED_EMPLOYEES)),
      attendance: JSON.parse(JSON.stringify(SEED_ATTENDANCE)),
      leaves: JSON.parse(JSON.stringify(SEED_LEAVES)),
      employeePayments: JSON.parse(JSON.stringify(SEED_PAYMENTS)),
      accounts: JSON.parse(JSON.stringify(SEED_ACCOUNTS)),
      transfers: JSON.parse(JSON.stringify(SEED_TRANSFERS)),
      adjustments: JSON.parse(JSON.stringify(SEED_ADJUSTMENTS)),
      users: JSON.parse(JSON.stringify(SEED_USERS)),
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
    return this.data;
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
        vehicles: this.data.vehicles.length,
        drivers: this.data.drivers.length,
        tripSlips: this.data.tripSlips.length,
        tyres: this.data.tyres.length,
        employees: this.data.employees.length,
        attendance: this.data.attendance.length,
        leaves: this.data.leaves.length,
        employeePayments: this.data.employeePayments.length,
        auditLogs: this.data.auditLogs.length,
      },
    };
  }

  // --- RECALCULATE PARTY BALANCES ---
  public recalculatePartyBalance(partyId: string): number {
    const party = this.data.parties.find((p) => p.id === partyId);
    if (!party) return 0;

    let balance = party.openingBalanceType === 'to_receive' ? party.openingBalance : -party.openingBalance;

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

  public updateSettings(updates: Partial<CompanySettings>): CompanySettings {
    this.data.settings = { ...this.data.settings, ...updates };
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

  public createParty(partyData: Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'> & { currentBalance?: number }): Party {
    const newId = `pty-${Date.now()}`;
    const initialBal =
      partyData.currentBalance !== undefined
        ? partyData.currentBalance
        : partyData.openingBalanceType === 'to_receive'
        ? partyData.openingBalance
        : -partyData.openingBalance;

    const newParty: Party = {
      ...partyData,
      id: newId,
      currentBalance: initialBal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.data.parties.unshift(newParty);
    this.logAudit('CREATE', 'PARTY', newId, `Created party ${newParty.name} (${newParty.type})`);
    this.save();
    liveSyncParty(newParty);
    return newParty;
  }

  public bulkCreateParties(partiesData: Array<Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'> & { currentBalance?: number }>): Party[] {
    const created: Party[] = [];
    const timestamp = Date.now();

    partiesData.forEach((partyData, index) => {
      const newId = `pty-${timestamp}-${index}-${Math.random().toString(36).substring(2, 7)}`;
      const initialBal =
        partyData.currentBalance !== undefined
          ? partyData.currentBalance
          : partyData.openingBalanceType === 'to_receive'
          ? partyData.openingBalance
          : -partyData.openingBalance;

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

  public updateParty(id: string, updates: Partial<Party>): Party {
    const index = this.data.parties.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Party ${id} not found.`);
    const updated = {
      ...this.data.parties[index],
      ...updates,
      updatedAt: new Date().toISOString(),
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
    this.logAudit('DELETE', 'PARTY', id, `Deleted party ${name} and related transactions`);
    this.save();
    liveSyncParty(removedParty, true);
    return true;
  }

  // --- TRANSACTIONS ---
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
    return result;
  }

  public getTransactionById(id: string): Transaction | undefined {
    return this.data.transactions.find((t) => t.id === id);
  }

  public createTransaction(data: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; createdAt?: string }, skipLiveSync: boolean = false): Transaction {
    const newId = data.id || `txn-${Date.now()}`;
    const newTxn: Transaction = {
      ...data,
      id: newId,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const existingIndex = this.data.transactions.findIndex((t) => t.id === newId);
    if (existingIndex !== -1) {
      this.data.transactions[existingIndex] = newTxn;
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

  public updateTransaction(id: string, updates: Partial<Transaction>): Transaction {
    const index = this.data.transactions.findIndex((t) => t.id === id);
    if (index === -1) throw new Error(`Transaction ${id} not found.`);
    const previous = this.data.transactions[index];
    const updated = { ...previous, ...updates };
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
    if (ledger.length === 0) return item;
    return {
      ...item,
      movements: ledger.slice(0, 100).map((m) => ({
        id: m.id,
        date: m.date,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: m.balanceAfter,
        referenceNumber: m.referenceNumber,
        sourcePartyOrBatch: m.sourcePartyOrBatch,
        notes: m.notes,
      })),
    };
  }

  private findItemRaw(id: string): Item | undefined {
    return this.data.items.find((i) => i.id === id);
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

  public createItem(data: Partial<Item>): Item {
    const newId = data.id || `itm-${Date.now()}`;
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
    };
    // Movements are ledger-only: never persist movement history on the item row.
    delete newItem.movements;
    if (existingIdx !== -1) {
      this.data.items[existingIdx] = newItem;
    } else {
      this.data.items.unshift(newItem);
    }
    this.logAudit(existingIdx !== -1 ? 'UPDATE' : 'CREATE', 'ITEM', newId, `Item ${newItem.name} (${newItem.code})`);
    this.save();
    liveSyncItem(newItem);
    return newItem;
  }

  public updateItem(id: string, updates: Partial<Item>): Item {
    const index = this.data.items.findIndex((i) => i.id === id);
    if (index === -1) {
      return this.createItem({ ...updates, id });
    }
    const existing = this.data.items[index];

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
    };
    // Movements are ledger-only: never persist movement history on the item row.
    delete updated.movements;
    this.data.items[index] = updated;
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
    this.logAudit('DELETE', 'ITEM', id, `Deleted item ${name}`);
    this.save();
    liveSyncItem(removedItem, true);
    return true;
  }

  public adjustItemStock(id: string, delta: number, logType: 'purchase_inward' | 'production_output' | 'production_consumed' | 'sale_dispatch' | 'opening' | 'adjustment_increase' | 'adjustment_decrease', refNo?: string, notes?: string, locationName?: string, partyId?: string): Item {
    const item = this.findItemRaw(id);
    if (!item) throw new Error(`Item ${id} not found.`);
    const current = item.currentStock || 0;
    const nextStock = Math.max(0, current + delta);
    const movementId = `stk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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
    if (targetLoc) {
      const locIdx = updatedLocations.findIndex((l) => l.locationName.trim().toLowerCase() === targetLoc.toLowerCase());
      if (locIdx !== -1) {
        const curLocStock = Number(updatedLocations[locIdx].currentStock) || 0;
        updatedLocations[locIdx] = {
          ...updatedLocations[locIdx],
          currentStock: Math.max(0, curLocStock + delta),
        };
        targetLocationId = updatedLocations[locIdx].locationId;
      } else if (delta > 0) {
        updatedLocations.push({
          locationName: targetLoc,
          currentStock: delta,
          openingStock: 0,
        });
      }
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

    const movement: StockMovementRecord = {
      id: movementId,
      itemId: item.id,
      locationId: targetLocationId || undefined,
      date: new Date().toISOString(),
      type: logType,
      quantity: delta,
      balanceAfter: item.currentStock,
      referenceNumber: refNo,
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
      default:
        movement.referenceType = 'order';
    }

    // Append-only ledger: one INSERT per stock change, never rewritten.
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

  public createCategory(cat: Partial<ItemCategory>): ItemCategory {
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

  public updateCategory(id: string, updates: Partial<ItemCategory>): ItemCategory {
    const idx = this.data.categories.findIndex((c) => c.id === id);
    if (idx === -1) {
      return this.createCategory({ ...updates, id });
    }
    this.data.categories[idx] = { ...this.data.categories[idx], ...updates, id };
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

  public createUnit(unit: Partial<ItemUnit>): ItemUnit {
    const newId = unit.id || `unit-${Date.now()}`;
    const existingIdx = this.data.units.findIndex((u) => u.id === newId);
    const newUnit: ItemUnit = {
      name: unit.name || '',
      code: (unit.code || '').toUpperCase().trim(),
      allowDecimal: unit.allowDecimal !== undefined ? unit.allowDecimal : true,
      isStandard: Boolean(unit.isStandard),
      ...unit,
      id: newId,
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

  public updateUnit(id: string, updates: Partial<ItemUnit>): ItemUnit {
    const idx = this.data.units.findIndex((u) => u.id === id);
    if (idx === -1) {
      return this.createUnit({ ...updates, id });
    }
    this.data.units[idx] = { ...this.data.units[idx], ...updates, id };
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

  public createLocation(loc: Partial<ItemLocation>): ItemLocation {
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

  public updateLocation(id: string, updates: Partial<ItemLocation>): ItemLocation {
    const idx = this.data.locations.findIndex((l) => l.id === id);
    if (idx === -1) {
      return this.createLocation({ ...updates, id });
    }
    this.data.locations[idx] = { ...this.data.locations[idx], ...updates, id };
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
      if (adj.locationId && Array.isArray(item.locations)) {
        locationName = item.locations.find((l) => l.locationId === adj.locationId)?.locationName || locationName;
      }
      // Master item_locations table fallback (renamed master locations propagate)
      if (adj.locationId && !locationName) {
        const masterLoc = (this.data.locations || []).find((ml) => ml.id === adj.locationId);
        locationName = masterLoc?.name || locationName;
      }
      return { ...adj, itemName: item.name, itemCode: item.code, unit: item.unit, location: locationName };
    }
    return { ...adj, location: locationName };
  }

  public getStockAdjustments(): ItemStockAdjustment[] {
    return (this.data.stockAdjustments || []).map((a) => this.hydrateStockAdjustment(a));
  }

  public createStockAdjustment(adjData: Partial<ItemStockAdjustment>): ItemStockAdjustment {
    if (!this.data.stockAdjustments) {
      this.data.stockAdjustments = [];
    }
    const newId = adjData.id || `stk-adj-${Date.now()}`;
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
    const newStock = adjData.type === 'increase' ? prevStock + qty : Math.max(0, prevStock - qty);

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
      location: adjData.location || item?.stockLocation || '',  // display field; resolved live on read
      referenceNumber: adjData.referenceNumber || '',
      notes: adjData.notes || '',
      createdAt: adjData.createdAt || new Date().toISOString(),
    };
    // Store the FK of the chosen storage location (display name is resolved at read time)
    newAdj.locationId = this.findItemRaw(newAdj.itemId)?.locations?.find(
      (l) => (l.locationName || '').trim().toLowerCase() === (newAdj.location || '').trim().toLowerCase()
    )?.locationId;
    if (!newAdj.locationId) {
      // A location typed freely without an exact item-location match: fall back to the item's own location copy
      const fallbackName = (newAdj.location || '').trim().toLowerCase();
      newAdj.locationId = (this.data.locations || []).find((ml) => ml.name?.trim().toLowerCase() === fallbackName)?.id;
    }

    this.data.stockAdjustments.unshift(newAdj);

    if (item) {
      this.adjustItemStock(
        item.id,
        adjData.type === 'increase' ? qty : -qty,
        adjData.type === 'increase' ? 'adjustment_increase' : 'adjustment_decrease',
        newAdj.adjustmentNumber,
        `[Stock Adj: ${newAdj.reason}] ${newAdj.notes || ''}`.trim(),
        newAdj.location
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
    if (item) {
      const revertDelta = adj.type === 'increase' ? -adj.quantity : adj.quantity;
      // Revert at the SAME storage the voucher touched: resolve the display name
      // live from the location FK so a rename never breaks the revert.
      const revertLocation = this.hydrateStockAdjustment(adj).location;
      this.adjustItemStock(
        item.id,
        revertDelta,
        revertDelta >= 0 ? 'adjustment_increase' : 'adjustment_decrease',
        `REV-${adj.adjustmentNumber}`,
        `Revert stock adjustment ${adj.adjustmentNumber}`,
        revertLocation
      );
    }

    this.logAudit('DELETE', 'STOCK_ADJUSTMENT', id, `Deleted stock adjustment ${adj.adjustmentNumber}`);
    this.save();
    liveSyncStockAdjustment(adj, true, adj.locationId);
    return true;
  }

  // --- ORDERS ---
  public getOrders(): Order[] {
    return this.data.orders;
  }

  public getOrderById(id: string): Order | undefined {
    return this.data.orders.find((o) => o.id === id);
  }

  private applyOrderStock(order: Order, reverse: boolean = false) {
    if (!order.items || order.items.length === 0) return;
    if (order.type === 'sales' && order.stage === 'quotation') return;
    if (order.type === 'purchase' && order.purchaseStage === 'rfq') return;
    if (order.status === 'cancelled') return;

    const multiplier = reverse ? -1 : 1;
    for (const item of order.items) {
      try {
        const isPurchase = order.type === 'purchase';
        const effectiveQty = isPurchase && order.purchaseStage === 'goods_receipt' && item.receivedQuantity !== undefined
          ? item.receivedQuantity
          : item.quantity;
        const delta = isPurchase ? (effectiveQty * multiplier) : (-item.quantity * multiplier);
        const logType = isPurchase ? (delta >= 0 ? 'purchase_inward' : 'sale_dispatch') : (delta >= 0 ? 'purchase_inward' : 'sale_dispatch');
        const refNo = isPurchase && order.receiptDetails?.grnNumber ? order.receiptDetails.grnNumber : order.orderNumber;
        const notes = reverse
          ? `Reversal of ${order.type} order ${order.orderNumber} (${order.partyName})`
          : isPurchase
            ? `${order.purchaseStage === 'goods_receipt' ? 'Goods Receipt / GRN' : 'Purchase Order'} from ${order.partyName} (${refNo})${item.location ? ` [${item.location}]` : ''}${item.shortageQuantity ? ` [Shortage: ${item.shortageQuantity} ${item.unit}]` : ''}`
            : `Dispatched to ${order.partyName} (Order ${order.orderNumber})${item.location ? ` [${item.location}]` : ''}`;
        this.adjustItemStock(item.itemId, delta, logType as any, refNo, notes, item.location, order.partyId);
      } catch (e) {
        console.error(`Failed to sync inventory for order item ${item.itemId}:`, e);
      }
    }
  }

  public createOrder(orderData: any): Order {
    const newId = orderData.id || `ord-${Date.now()}`;
    const existingIndex = this.data.orders.findIndex((o) => o.id === newId || (orderData.id && o.id === orderData.id));

    let partyName = orderData.partyName;
    if (!partyName && orderData.partyId) {
      const p = this.data.parties.find((p) => p.id === orderData.partyId);
      if (p) partyName = p.name;
    }

    const now = new Date().toISOString();
    const newOrder: Order = {
      orderNumber: orderData.orderNumber,
      type: orderData.type || 'sales',
      partyId: orderData.partyId,
      partyName: partyName || orderData.partyName || 'Party',
      date: orderData.date || now.split('T')[0],
      stage: orderData.stage || (orderData.type === 'purchase' ? undefined : 'sales_order'),
      status: orderData.status || 'pending',
      items: orderData.items || [],
      taxRateGst: orderData.taxRateGst !== undefined ? orderData.taxRateGst : 18,
      taxAmount: orderData.taxAmount || 0,
      totalAmount: orderData.totalAmount || 0,
      notes: orderData.notes,
      vehicleNo: orderData.vehicleNo,
      driverName: orderData.driverName,
      transportCharges: orderData.transportCharges || 0,
      ...orderData,
      id: newId,
      createdAt: existingIndex !== -1 ? this.data.orders[existingIndex].createdAt : orderData.createdAt || now,
      updatedAt: now,
    };

    if (existingIndex !== -1) {
      const prevOrder = this.data.orders[existingIndex];
      this.applyOrderStock(prevOrder, true);
      this.data.orders[existingIndex] = newOrder;
    } else {
      this.data.orders.unshift(newOrder);
    }

    this.applyOrderStock(newOrder, false);

    this.logAudit(existingIndex !== -1 ? 'UPDATE' : 'CREATE', 'ORDER', newId, `Booked order ${newOrder.orderNumber} for ${newOrder.partyName} (₹${newOrder.totalAmount})`);
    this.save();
    liveSyncOrder(newOrder);
    return newOrder;
  }

  public updateOrder(id: string, updates: Partial<Order>): Order {
    const index = this.data.orders.findIndex((o) => o.id === id);
    if (index === -1) {
      return this.createOrder({ ...updates, id });
    }
    const previous = this.data.orders[index];
    const updated = {
      ...previous,
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    };

    // Reverse previous stock effect if completed
    this.applyOrderStock(previous, true);

    this.data.orders[index] = updated;

    // Apply updated stock effect if completed
    this.applyOrderStock(updated, false);

    this.logAudit('UPDATE', 'ORDER', id, `Updated order ${updated.orderNumber}`);
    this.save();
    liveSyncOrder(updated);
    return updated;
  }

  public deleteOrder(id: string): boolean {
    const index = this.data.orders.findIndex((o) => o.id === id);
    if (index === -1) return false;
    const ord = this.data.orders[index];

    // Reverse stock effect if completed
    this.applyOrderStock(ord, true);

    this.data.orders.splice(index, 1);
    this.logAudit('DELETE', 'ORDER', id, `Deleted order ${ord.orderNumber}`);
    this.save();
    liveSyncOrder(ord, true);
    return true;
  }

  // --- PRODUCTION BATCHES ---
  public getProductionBatches(): ProductionBatchRun[] {
    return this.data.productionBatches;
  }

  public createProductionBatch(batchData: Omit<ProductionBatchRun, 'id' | 'createdAt'>): ProductionBatchRun {
    const newId = `pbr-${Date.now()}`;
    const newBatch: ProductionBatchRun = {
      ...batchData,
      id: newId,
      createdAt: new Date().toISOString(),
    };
    this.data.productionBatches.unshift(newBatch);

    // Deduct raw materials consumed
    for (const raw of newBatch.rawMaterialsConsumed) {
      try {
        this.adjustItemStock(raw.itemId, -raw.quantity, 'production_consumed', newBatch.batchNumber, `Consumed in batch ${newBatch.batchNumber}`);
      } catch (e) {
        console.error(`Failed to deduct raw material ${raw.itemName}:`, e);
      }
    }

    // Add finished output stock
    try {
      this.adjustItemStock(newBatch.targetItemId, newBatch.targetQuantity, 'production_output', newBatch.batchNumber, `Batch output run`);
    } catch (e) {
      console.error(`Failed to add finished item ${newBatch.targetItemName}:`, e);
    }

    this.logAudit('CREATE', 'PRODUCTION_BATCH', newId, `Produced batch ${newBatch.batchNumber} - ${newBatch.targetQuantity} ${newBatch.unit} of ${newBatch.targetItemName}`);
    this.save();
    liveSyncBatch(newBatch);
    return newBatch;
  }

  public deleteProductionBatch(id: string): boolean {
    const index = this.data.productionBatches.findIndex((b) => b.id === id);
    if (index === -1) return false;
    const batch = this.data.productionBatches[index];
    this.data.productionBatches.splice(index, 1);
    this.logAudit('DELETE', 'PRODUCTION_BATCH', id, `Deleted batch run ${batch.batchNumber}`);
    this.save();
    liveSyncBatch(batch, true);
    return true;
  }

  // --- LOGISTICS: FLEET, DRIVERS, TRIP SLIPS, TYRES ---
  public getVehicles(): Vehicle[] {
    return this.data.vehicles;
  }

  public createVehicle(data: Omit<Vehicle, 'id' | 'createdAt'>): Vehicle {
    const newVeh: Vehicle = { ...data, id: `veh-${Date.now()}`, createdAt: new Date().toISOString() };
    this.data.vehicles.unshift(newVeh);
    this.save();
    liveSyncVehicle(newVeh);
    return newVeh;
  }

  public updateVehicle(id: string, updates: Partial<Vehicle>): Vehicle {
    const idx = this.data.vehicles.findIndex((v) => v.id === id);
    if (idx === -1) throw new Error(`Vehicle ${id} not found.`);
    this.data.vehicles[idx] = { ...this.data.vehicles[idx], ...updates };
    this.save();
    liveSyncVehicle(this.data.vehicles[idx]);
    return this.data.vehicles[idx];
  }

  public deleteVehicle(id: string): boolean {
    const idx = this.data.vehicles.findIndex((v) => v.id === id);
    if (idx === -1) return false;
    const veh = this.data.vehicles[idx];
    this.data.vehicles.splice(idx, 1);
    this.save();
    liveSyncVehicle(veh, true);
    return true;
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
    return this.data.tripSlips;
  }

  public createTripSlip(data: Omit<TripSlip, 'id' | 'createdAt'>): TripSlip {
    const newSlip: TripSlip = { ...data, id: `ts-${Date.now()}`, createdAt: new Date().toISOString() };
    this.data.tripSlips.unshift(newSlip);

    // Sync vehicle & driver status
    const isBusy = data.status === 'transit' || data.status === 'loading';
    try {
      this.updateVehicle(data.vehicleId, {
        status: isBusy ? 'on_trip' : 'available',
        currentDriverId: data.driverId,
        currentDriverName: data.driverName,
      });
      this.updateDriver(data.driverId, { status: isBusy ? 'on_duty' : 'available' });
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
        currentDriverName: updated.driverName,
      });
      this.updateDriver(updated.driverId, { status: isBusy ? 'on_duty' : 'available' });
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

  public getTyres(): Tyre[] {
    return this.data.tyres;
  }

  public createTyre(data: Omit<Tyre, 'id' | 'createdAt'>): Tyre {
    const newTyre: Tyre = { ...data, id: `ty-${Date.now()}`, createdAt: new Date().toISOString() };
    this.data.tyres.unshift(newTyre);
    this.save();
    liveSyncTyre(newTyre);
    return newTyre;
  }

  public updateTyre(id: string, updates: Partial<Tyre>): Tyre {
    const idx = this.data.tyres.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Tyre ${id} not found.`);
    this.data.tyres[idx] = { ...this.data.tyres[idx], ...updates };
    this.save();
    liveSyncTyre(this.data.tyres[idx]);
    return this.data.tyres[idx];
  }

  public deleteTyre(id: string): boolean {
    const idx = this.data.tyres.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const tyr = this.data.tyres[idx];
    this.data.tyres.splice(idx, 1);
    this.save();
    liveSyncTyre(tyr, true);
    return true;
  }

  // --- EMPLOYEES & PAYROLL ---
  public getEmployees(): Employee[] {
    return this.data.employees;
  }

  public createEmployee(data: Omit<Employee, 'id' | 'createdAt'>): Employee {
    const newEmp: Employee = { ...data, id: `emp-${Date.now()}`, createdAt: new Date().toISOString() };
    this.data.employees.unshift(newEmp);
    this.save();
    liveSyncEmployee(newEmp);
    return newEmp;
  }

  public updateEmployee(id: string, updates: Partial<Employee>): Employee {
    const idx = this.data.employees.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Employee ${id} not found.`);
    this.data.employees[idx] = { ...this.data.employees[idx], ...updates };
    this.save();
    liveSyncEmployee(this.data.employees[idx]);
    return this.data.employees[idx];
  }

  public deleteEmployee(id: string): boolean {
    const idx = this.data.employees.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    const emp = this.data.employees[idx];
    this.data.employees.splice(idx, 1);
    this.save();
    liveSyncEmployee(emp, true);
    return true;
  }

  public getAttendance(): EmployeeAttendance[] {
    return this.data.attendance;
  }

  public recordAttendance(data: Omit<EmployeeAttendance, 'id'>): EmployeeAttendance {
    const newAtt = { ...data, id: `att-${Date.now()}` };
    this.data.attendance.unshift(newAtt);
    this.save();
    liveSyncAttendance(newAtt);
    return newAtt;
  }

  public getLeaves(): EmployeeLeave[] {
    return this.data.leaves;
  }

  public createLeave(data: Omit<EmployeeLeave, 'id' | 'createdAt'>): EmployeeLeave {
    const newLv = { ...data, id: `lv-${Date.now()}`, createdAt: new Date().toISOString() };
    this.data.leaves.unshift(newLv);
    this.save();
    liveSyncLeave(newLv);
    return newLv;
  }

  public getEmployeePayments(): EmployeePayment[] {
    return this.data.employeePayments;
  }

  public createEmployeePayment(data: Omit<EmployeePayment, 'id'>): EmployeePayment {
    const newPay = { ...data, id: `pay-${Date.now()}` };
    this.data.employeePayments.unshift(newPay);
    this.save();
    liveSyncEmployeePayment(newPay);
    return newPay;
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
    const user = this.data.users?.find((u) => u.id === id);
    if (!user) return undefined;
    if (!user.passwordHash && (user.role === 'super_admin' || user.username.toLowerCase() === 'admin')) {
      user.passwordHash = bcrypt.hashSync('Admin@123', 10);
      user.status = 'active';
      this.save();
    }
    if (includeSensitive) return { ...user };
    const { passwordHash, ...safeUser } = user;
    return safeUser as AppUser;
  }

  public getUserByUsername(username: string, includeSensitive = false): AppUser | undefined {
    const normalized = username.trim().toLowerCase();
    const user = this.data.users?.find((u) => u.username.toLowerCase() === normalized);
    if (!user) return undefined;
    if (!user.passwordHash && (user.role === 'super_admin' || user.username.toLowerCase() === 'admin')) {
      user.passwordHash = bcrypt.hashSync('Admin@123', 10);
      user.status = 'active';
      this.save();
    }
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
  }): AppUser {
    if (!this.data.users) {
      this.data.users = JSON.parse(JSON.stringify(SEED_USERS));
    }

    const username = payload.customUsername?.trim().toLowerCase() || this.generateUniqueUsername(payload.fullName, payload.role);
    const activationCode = this.generateActivationCode();

    const newUser: AppUser = {
      id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
    liveSyncUser(newUser).catch((e) => console.error('[DB] Failed liveSync for createUser:', e.message));

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
    const user = this.createUser(payload);
    const fullUser = this.data.users?.find((u) => u.id === user.id);
    if (fullUser) {
      await liveSyncUser(fullUser);
    }
    return user;
  }

  public updateUser(id: string, updates: Partial<AppUser>): AppUser | null {
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

    this.data.users[index] = {
      ...existing,
      ...updates,
      id: existing.id, // prevent changing ID
    };

    this.logAudit('UPDATE', 'USER', id, `Updated user profile for ${existing.username}.`);
    this.save();
    liveSyncUser(this.data.users[index]).catch((e) => console.error('[DB] Failed liveSync for updateUser:', e.message));

    const { passwordHash, ...safeUser } = this.data.users[index];
    return safeUser as AppUser;
  }

  public async updateUserAsync(id: string, updates: Partial<AppUser>): Promise<AppUser | null> {
    const user = this.updateUser(id, updates);
    const fullUser = this.data.users?.find((u) => u.id === id);
    if (fullUser) {
      await liveSyncUser(fullUser);
    }
    return user;
  }

  public deleteUser(id: string): boolean {
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
    liveSyncUser(user, true).catch((e) => console.error('[DB] Failed liveSync for deleteUser:', e.message));
    return true;
  }

  public async deleteUserAsync(id: string): Promise<boolean> {
    const user = this.data.users?.find((u) => u.id === id);
    if (!user) return false;
    const res = this.deleteUser(id);
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

  public addAccount(accountData: Omit<CashBankAccount, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>): CashBankAccount {
    if (!this.data.accounts) this.data.accounts = [];
    const newId = `acc-${Date.now()}`;
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
    };

    this.data.accounts.push(newAccount);
    this.logAudit('CREATE', 'ACCOUNT', newId, `Added cash/bank account ${newAccount.name} (${newAccount.type}) with opening balance ₹${openingBal}.`);
    this.save();
    liveSyncAccount(newAccount).catch((e) => console.error('[DB] Failed liveSync for addAccount:', e.message));
    return newAccount;
  }

  public async addAccountAsync(accountData: Omit<CashBankAccount, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>): Promise<CashBankAccount> {
    const acc = this.addAccount(accountData);
    await liveSyncAccount(acc);
    return acc;
  }

  public updateAccount(id: string, updates: Partial<CashBankAccount>): CashBankAccount {
    if (!this.data.accounts) this.data.accounts = [];
    const index = this.data.accounts.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`Account with id ${id} not found.`);

    const updated: CashBankAccount = {
      ...this.data.accounts[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.data.accounts[index] = updated;
    this.logAudit('UPDATE', 'ACCOUNT', id, `Updated account ${updated.name}.`);
    this.save();
    liveSyncAccount(updated).catch((e) => console.error('[DB] Failed liveSync for updateAccount:', e.message));
    return updated;
  }

  public async updateAccountAsync(id: string, updates: Partial<CashBankAccount>): Promise<CashBankAccount> {
    const acc = this.updateAccount(id, updates);
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

    this.updateAccount(accountId, { currentBalance: balance });
  }

  // --- INTERNAL TRANSFERS ---

  public getTransfers(): InternalTransfer[] {
    return this.data.transfers || [];
  }

  public addTransfer(transferData: Omit<InternalTransfer, 'id' | 'createdAt' | 'transferNumber'>): InternalTransfer {
    if (!this.data.transfers) this.data.transfers = [];
    const count = this.data.transfers.length + 1;
    const transferNumber = `TRF-26/${String(count).padStart(3, '0')}`;
    const newId = `trf-${Date.now()}`;
    const newTransfer: InternalTransfer = {
      ...transferData,
      id: newId,
      transferNumber,
      createdAt: new Date().toISOString(),
    };

    this.data.transfers.unshift(newTransfer);
    this.recalculateAccountBalance(transferData.fromAccountId);
    this.recalculateAccountBalance(transferData.toAccountId);

    this.logAudit('CREATE', 'TRANSFER', newId, `Transferred ₹${transferData.amount} from ${transferData.fromAccountName} to ${transferData.toAccountName}.`);
    this.save();
    liveSyncTransfer(newTransfer).catch((e) => console.error('[DB] Failed liveSync for addTransfer:', e.message));
    return newTransfer;
  }

  public async addTransferAsync(transferData: Omit<InternalTransfer, 'id' | 'createdAt' | 'transferNumber'>): Promise<InternalTransfer> {
    const trf = this.addTransfer(transferData);
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
    return this.data.adjustments || [];
  }

  public addAdjustment(adjData: Omit<AccountAdjustment, 'id' | 'createdAt' | 'adjustmentNumber' | 'previousBalance' | 'newBalance'>): AccountAdjustment {
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
    };

    this.data.adjustments.unshift(newAdj);
    this.recalculateAccountBalance(adjData.accountId);

    this.logAudit('CREATE', 'ADJUSTMENT', newId, `Adjusted ${adjData.accountName} (${adjData.type} ₹${amt}): ${adjData.reason}.`);
    this.save();
    liveSyncAdjustment(newAdj).catch((e) => console.error('[DB] Failed liveSync for addAdjustment:', e.message));
    return newAdj;
  }

  public async addAdjustmentAsync(adjData: Omit<AccountAdjustment, 'id' | 'createdAt' | 'adjustmentNumber' | 'previousBalance' | 'newBalance'>): Promise<AccountAdjustment> {
    const adj = this.addAdjustment(adjData);
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
