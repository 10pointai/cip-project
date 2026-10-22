import { executeMysqlQuery, executeMysqlOne } from './queryClient';
import { isMysqlConfigured } from './connection';
import { Item, ItemCategory, ItemUnit, ItemLocation, ProductionBatchRun, Vehicle, Driver, TripSlip, Tyre, ItemStockAdjustment, StockMovementLog, Sale, Purchase } from '../../src/types';
import { serverDb } from '../db';
import { computeItemValuation } from '../inventoryValuation';
import { resolveUnitIdByCode } from './azureSync';

function parseJsonField<T>(field: any, fallback: T): T {
  if (!field) return fallback;
  if (typeof field === 'object') return field;
  try {
    return JSON.parse(field);
  } catch {
    return fallback;
  }
}

function parseNum(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

// ==========================================
// ITEMS & INVENTORY
// ==========================================

function mapItemRow(it: any): Item {
  return {
    id: it.id,
    name: it.name,
    code: it.code,
    type: it.type,
    categoryId: it.category_id,
    unitId: it.unit_id || undefined,
    // categoryName / unit are LIVE VIEW fields (Golden Rule §2) — resolved by
    // JOINs against the masters in the selecting queries.
    categoryName: it.category_display || undefined,
    unit: it.unit_display || it.unit_name_display || undefined,
    hsnSacCode: it.hsn_sac_code || undefined,
    taxRateGst: parseNum(it.tax_rate_gst, 18),
    salePrice: parseNum(it.sale_price),
    purchasePrice: parseNum(it.purchase_price),
    openingStock: it.opening_stock !== null && it.opening_stock !== undefined ? parseNum(it.opening_stock) : undefined,
    openingStockPrice: it.opening_stock_price !== null && it.opening_stock_price !== undefined ? parseNum(it.opening_stock_price) : undefined,
    openingStockDate: it.opening_stock_date || undefined,
    technicalSpecs: it.technical_specs || undefined,
    remarks: it.remarks || undefined,
    isActive: Boolean(it.is_active),
    currentStock: parseNum(it.current_stock),
    minStockLevel: parseNum(it.min_stock_level),
    maxCapacity: it.max_capacity ? parseNum(it.max_capacity) : undefined,
    lastStockUpdate: it.last_stock_update || undefined,
    movements: parseJsonField(it.movements, []),
    createdAt: it.created_at,
    updatedAt: it.updated_at,
  };
}

async function attachLocationsToItems(items: Item[]): Promise<Item[]> {
  if (items.length === 0) return items;
  try {
    const itemIds = items.map((it) => it.id);
    const placeholders = itemIds.map(() => '?').join(',');
    // Location NAME resolved with a JOIN against the item_locations master
    // (no location_name copy in the mapping table).
    const mappingRows = await executeMysqlQuery(
      `SELECT m.*, ml.name AS location_display
       FROM item_location_mapping m
       LEFT JOIN item_locations ml ON ml.id = m.location_id
       WHERE m.item_id IN (${placeholders})
       ORDER BY location_display ASC`,
      itemIds
    );

    const mapByItem = new Map<string, any[]>();
    for (const m of mappingRows) {
      const list = mapByItem.get(m.item_id) || [];
      list.push({
        locationId: m.location_id,
        locationName: m.location_display || undefined,
        openingStock: parseNum(m.opening_stock),
        currentStock: parseNum(m.current_stock),
        minStockLevel: parseNum(m.min_stock_level),
        maxCapacity: m.max_capacity !== null && m.max_capacity !== undefined ? parseNum(m.max_capacity) : undefined,
      });
      mapByItem.set(m.item_id, list);
    }

    for (const item of items) {
      const locs = mapByItem.get(item.id);
      if (locs && locs.length > 0) {
        item.locations = locs;
        item.stockLocations = locs.map((l) => l.locationName);
        item.stockLocation = item.stockLocations.join(', ');
      }
    }
  } catch (err: any) {
    console.warn('[OperationsService] Error fetching item_location_mapping:', err.message);
  }
  return items;
}

/**
 * Hydrates item.movements from the stock_movements ledger (latest 100 per item, newest first).
 * The ledger stores FKs only (item_id, location_id, party_id); names are resolved with JOINs
 * so item/location/party renames always propagate into movement history display.
 */
async function attachMovementsToItems(items: Item[]): Promise<Item[]> {
  if (items.length === 0) return items;
  try {
    const itemIds = items.map((it) => it.id);
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = await executeMysqlQuery(
      `SELECT sm.*, p.name AS party_display,
              loc.name AS location_display
       FROM stock_movements sm
       LEFT JOIN parties p ON p.id = sm.party_id
       LEFT JOIN item_locations loc ON loc.id = sm.location_id
       
       WHERE sm.item_id IN (${placeholders})
       ORDER BY sm.movement_date DESC, sm.created_at DESC`,
      itemIds
    );

    // Full per-item ledger for valuation (uncapped) + capped display history.
    const fullLedger = new Map<string, { type: string; quantity: number; rate?: number | null; date?: string }[]>();
    const movsByItem = new Map<string, StockMovementLog[]>();
    for (const m of rows) {
      const rate = m.rate !== null && m.rate !== undefined ? parseNum(m.rate) : undefined;
      const entry = {
        type: m.movement_type,
        quantity: parseNum(m.quantity),
        rate,
        date: m.movement_date || m.created_at,
      };
      if (!fullLedger.has(m.item_id)) fullLedger.set(m.item_id, []);
      fullLedger.get(m.item_id)!.push(entry);
      const list = movsByItem.get(m.item_id);
      if (!list) {
        movsByItem.set(m.item_id, []);
      } else if (list.length >= 100) {
        continue;
      }
      movsByItem.get(m.item_id)!.push({
        id: m.id,
        date: m.movement_date || m.created_at,
        type: m.movement_type,
        quantity: parseNum(m.quantity),
        balanceAfter: m.balance_after !== null && m.balance_after !== undefined ? parseNum(m.balance_after) : 0,
        rate,
        movementValue: m.movement_value !== null && m.movement_value !== undefined ? parseNum(m.movement_value) : undefined,
        valuationRateAfter: m.valuation_rate_after !== null && m.valuation_rate_after !== undefined ? parseNum(m.valuation_rate_after) : undefined,
        referenceNumber: m.reference_number || undefined,
        sourcePartyOrBatch: m.party_display || undefined,
        notes: m.notes || undefined,
      });
    }

    for (const item of items) {
      const ledgerMovs = movsByItem.get(item.id);
      if (ledgerMovs && ledgerMovs.length > 0) {
        item.movements = ledgerMovs;
      }
      // FIFO actual-cost valuation replayed server-side from the full ledger.
      const valuation = computeItemValuation(item, fullLedger.get(item.id) || []);
      if (valuation.valuationRate > 0) item.valuationRate = valuation.valuationRate;
      if (valuation.stockValue > 0) item.stockValue = valuation.stockValue;
    }
  } catch (err: any) {
    console.warn('[OperationsService] Error fetching stock_movements ledger:', err.message);
  }
  return items;
}

export async function fetchItemsDirect(filter: { categoryId?: string; type?: string; query?: string }): Promise<Item[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getItems(filter);
  }

  // Category name + unit string resolved with JOINs against the masters
  // (Golden Rule §2) so renames propagate to every item display.
  const params: any[] = [];
  let sql = `SELECT it.*, c.name AS category_display, u.code AS unit_display, u.name AS unit_name_display
             FROM items it
             LEFT JOIN item_categories c ON c.id = it.category_id
             LEFT JOIN item_units u ON u.id = it.unit_id
             WHERE 1=1`;

  if (filter.categoryId) {
    sql += ' AND it.category_id = ?';
    params.push(filter.categoryId);
  }
  if (filter.type) {
    sql += ' AND it.type = ?';
    params.push(filter.type);
  }
  if (filter.query) {
    sql += ' AND (it.name LIKE ? OR it.code LIKE ?)';
    const q = `%${filter.query}%`;
    params.push(q, q);
  }

  sql += ' ORDER BY it.name ASC';
  const rows = await executeMysqlQuery(sql, params);
  const items = rows.map(mapItemRow);
  return attachMovementsToItems(await attachLocationsToItems(items));
}

export async function fetchItemByIdDirect(id: string): Promise<Item | null> {
  if (!isMysqlConfigured()) {
    return serverDb.getItemById(id) || null;
  }
  const row = await executeMysqlOne('SELECT * FROM items WHERE id = ?', [id]);
  if (!row) return null;
  const item = mapItemRow(row);
  const hydrated = await attachMovementsToItems(await attachLocationsToItems([item]));
  return hydrated[0] || item;
}

export async function fetchCategoriesDirect(): Promise<ItemCategory[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getCategories();
  }
  const rows = await executeMysqlQuery('SELECT * FROM item_categories ORDER BY name ASC');
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description || undefined,
    type: r.type || 'both',
    color: r.color || undefined,
    createdAt: r.created_at,
  }));
}

export async function fetchUnitsDirect(): Promise<ItemUnit[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getUnits();
  }
  const rows = await executeMysqlQuery('SELECT * FROM item_units ORDER BY name ASC');
  return rows.map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    allowDecimal: Boolean(r.allow_decimal),
    isStandard: Boolean(r.is_standard),
  }));
}

export async function fetchLocationsDirect(): Promise<ItemLocation[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getLocations();
  }
  const rows = await executeMysqlQuery('SELECT * FROM item_locations ORDER BY name ASC');
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    code: r.code || undefined,
    description: r.description || undefined,
    capacity: r.capacity || undefined,
    type: r.type || 'yard',
    isStandard: Boolean(r.is_standard),
    createdAt: r.created_at,
  }));
}

export async function fetchStockAdjustmentsDirect(): Promise<ItemStockAdjustment[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getStockAdjustments();
  }
  // FK store: adjustments keep item_id/location_id only; names resolved via JOIN
  // so item/location renames stay in sync everywhere.
  const rows = await executeMysqlQuery(
    `SELECT a.*, i.name AS item_name, i.code AS item_code,
            u.code AS item_unit_display, u.name AS item_unit_name,
            loc.name AS location_display
     FROM item_stock_adjustments a
     LEFT JOIN items i ON i.id = a.item_id
     LEFT JOIN item_units u ON u.id = i.unit_id
     LEFT JOIN item_locations loc ON loc.id = a.location_id
     ORDER BY a.created_at DESC, a.adjustment_date DESC`
  );
  return rows.map((a: any) => ({
    id: a.id,
    adjustmentNumber: a.adjustment_number,
    itemId: a.item_id,
    itemName: a.item_name || '',
    itemCode: a.item_code || '',
    unit: a.item_unit_display || a.item_unit_name || 'MT',
    date: a.adjustment_date,
    type: a.adjustment_type === 'decrease' ? 'decrease' : 'increase',
    quantity: parseNum(a.quantity),
    rate: parseNum(a.rate),
    totalValue: parseNum(a.total_value),
    previousStock: parseNum(a.previous_stock),
    newStock: parseNum(a.new_stock),
    reason: a.reason || '',
    location: a.location_display || undefined,
    referenceNumber: a.reference_number || undefined,
    notes: a.notes || undefined,
    createdAt: a.created_at,
  }));
}

// ==========================================
// PRODUCTION BATCHES
// ==========================================

export async function fetchBatchesDirect(): Promise<ProductionBatchRun[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getProductionBatches();
  }
  const rows = await executeMysqlQuery('SELECT * FROM production_batches ORDER BY date DESC, created_at DESC');
  return rows.map((b: any) => ({
    id: b.id,
    batchNumber: b.batch_number,
    date: b.date,
    plantUnit: b.plant_unit,
    targetItemId: b.target_item_id,
    targetItemName: b.target_item_name,
    targetQuantity: parseNum(b.target_quantity),
    unit: b.unit,
    rawMaterialsConsumed: parseJsonField(b.raw_materials_consumed, []),
    supervisorName: b.supervisor_name || undefined,
    mixTemperatureCelsius: b.mix_temperature_celsius !== null && b.mix_temperature_celsius !== undefined ? parseNum(b.mix_temperature_celsius) : undefined,
    notes: b.notes || undefined,
    createdAt: b.created_at,
  }));
}

// ==========================================
// ORDERS (LEGACY — retired for reads/writes by the relational model above)
// ==========================================

// ==========================================
// SALES & PURCHASE — RELATIONAL ORDER MODEL
// Reads/writes funnel through serverDb (server/db.ts): the sandbox is the
// working copy, its repositories apply the business logic — FK normalization,
// status computation, one-shot inventory application — and the liveSync*
// helpers persist master + items + stages to Azure MySQL (azureSync.ts).
// The client refetches GET /api/sync?fresh=true after mutations, which
// rehydrates the sandbox straight from MySQL.
// ==========================================

export async function fetchSalesDirect(): Promise<Sale[]> {
  return serverDb.getSales();
}

export async function fetchSaleByIdDirect(id: string): Promise<Sale | null> {
  return serverDb.getSaleById(id) || null;
}

export async function createSaleDirect(data: any): Promise<Sale> {
  return serverDb.createSale(data);
}

export async function updateSaleDirect(id: string, updates: any): Promise<Sale | null> {
  // redateCurrentStage: a master edit that inserts an order date re-dates the
  // edited (current) stage document with it — stage docs always show the
  // user-inserted order date, never a created/modified date.
  return serverDb.updateSale(id, updates, { redateCurrentStage: true });
}

export async function addSaleStageDirect(id: string, stageInput: any): Promise<Sale | null> {
  // Master date/notes/party ride along; items are NOT pushed through
  // updateSale — the new stage owns its own rows (seeded from the current
  // stage's rows, or from stageInput.items when the caller provides them).
  // Pushing items into updateSale first would overwrite the CURRENT stage's rows.
  const masterUpdates: any = {};
  if (stageInput.date) masterUpdates.date = stageInput.date;
  if (stageInput.notes !== undefined) masterUpdates.notes = stageInput.notes;
  // Party is LOCKED at creation — stage issuance never touches it.
  if (Object.keys(masterUpdates).length > 0) {
    // skipMysqlSync: addSaleStage syncs AFTER the stage save with final state
  serverDb.updateSale(id, masterUpdates, { skipMysqlSync: true });
  }
  return serverDb.addSaleStage(id, stageInput);
}

export async function deleteSaleDirect(id: string): Promise<boolean> {
  return serverDb.deleteSale(id);
}

export async function fetchPurchasesDirect(): Promise<Purchase[]> {
  return serverDb.getPurchases();
}

export async function fetchPurchaseByIdDirect(id: string): Promise<Purchase | null> {
  return serverDb.getPurchaseById(id) || null;
}

export async function createPurchaseDirect(data: any): Promise<Purchase> {
  return serverDb.createPurchase(data);
}

export async function updatePurchaseDirect(id: string, updates: any): Promise<Purchase | null> {
  // redateCurrentStage: master-edit order-date insertions re-date the current
  // stage document (mirror of updateSaleDirect — see its comment).
  return serverDb.updatePurchase(id, updates, { redateCurrentStage: true });
}

export async function addPurchaseStageDirect(id: string, stageInput: any): Promise<Purchase | null> {
  // Goods-receipt saves carry the master edits + received quantities: apply
  // them to the master items BEFORE the stage save so its totals and inward
  // use them.
  const masterUpdates: any = {};
  if (stageInput.partyId !== undefined) masterUpdates.partyId = stageInput.partyId;
  if (stageInput.date) masterUpdates.date = stageInput.date;
  if (stageInput.notes !== undefined) masterUpdates.notes = stageInput.notes;
  if (stageInput.items) masterUpdates.items = stageInput.items;
  if (Object.keys(masterUpdates).length > 0) {
    // skipMysqlSync: addPurchaseStage syncs AFTER the stage save with final state
  serverDb.updatePurchase(id, masterUpdates, { skipMysqlSync: true });
  }
  return serverDb.addPurchaseStage(id, stageInput);
}

export async function deletePurchaseDirect(id: string): Promise<boolean> {
  return serverDb.deletePurchase(id);
}

// ==========================================
// LOGISTICS: VEHICLES, DRIVERS, TRIPS, TYRES
// ==========================================

export async function fetchVehiclesDirect(): Promise<Vehicle[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getVehicles();
  }
  // Driver display name JOINs from the employees master — FK-only storage,
  // so renames/deactivation in Employees propagate to every vehicle display.
  const rows = await executeMysqlQuery(`
    SELECT v.*, e.name AS assigned_driver_name
    FROM vehicles v
    LEFT JOIN employees e ON e.id = v.assigned_driver_id
    ORDER BY v.registration_number ASC
  `);
  return rows.map((v: any) => ({
    id: v.id,
    vehicleNo: v.registration_number || v.vehicleNo || '',
    type: (v.type as any) || 'tipper',
    capacityTonnes: parseNum(v.capacity_tonnes),
    ownership: (v.ownership as any) || 'owned',
    status: (v.status as any) || 'available',
    currentDriverId: v.assigned_driver_id || v.currentDriverId || undefined,
    currentDriverName: v.assigned_driver_name || v.currentDriverName || undefined,
    insuranceExpiry: v.insurance_expiry_date || v.insuranceExpiry || undefined,
    insuranceMonthlyAmount: parseNum(v.insurance_monthly_amount) || undefined,
    fitnessExpiry: v.fitness_expiry_date || v.fitnessExpiry || undefined,
    notes: v.notes || undefined,
    createdAt: v.created_at || new Date().toISOString(),
    // EMI/financing config — persisted on the vehicle row (the auto-debit
    // cron and the EMI ledger read from these columns).
    emiDetails: {
      hasEmi: !!v.emi_has_emi,
      financierName: v.emi_financier_name || undefined,
      loanAccountNumber: v.emi_loan_account_number || undefined,
      monthlyEmiAmount: parseNum(v.emi_amount) || undefined,
      emiDueDay: Number(v.emi_due_day) || undefined,
      loanStartDate: v.emi_loan_start_date || undefined,
      loanEndDate: v.emi_loan_end_date || undefined,
      totalLoanAmount: parseNum(v.emi_total_loan_amount) || undefined,
      interestRate: parseNum(v.emi_interest_rate) || undefined,
      totalTenureMonths: Number(v.emi_tenure_months) || undefined,
      paidEmisCount: Number(v.emi_paid_count) || undefined,
      emiAccountId: v.emi_account_id || undefined,
      autoDebitAccount: v.emi_auto_debit_account || undefined,
      status: (v.emi_status as any) || undefined,
      lastPaymentDate: v.emi_last_payment_date || undefined,
      notes: v.emi_notes || undefined,
    },
  }));
}

export async function fetchDriversDirect(): Promise<Driver[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getDrivers();
  }
  const rows = await executeMysqlQuery('SELECT * FROM drivers ORDER BY name ASC');
  return rows.map((d: any) => ({
    id: d.id,
    name: d.name,
    licenseNo: d.license_number || d.licenseNo || '',
    phone: d.phone,
    status: (d.status as any) || 'available',
    createdAt: d.created_at || new Date().toISOString(),
  }));
}

export async function fetchTripSlipsDirect(): Promise<TripSlip[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getTripSlips();
  }
  const rows = await executeMysqlQuery('SELECT * FROM trip_slips ORDER BY date DESC, created_at DESC');
  return rows.map((ts: any) => ({
    id: ts.id,
    slipNumber: ts.slip_number,
    date: ts.date,
    time: ts.time || '10:00',
    vehicleId: ts.vehicle_id,
    vehicleNo: ts.vehicle_number || ts.vehicleNo || '',
    driverId: ts.driver_id,
    driverName: ts.driver_name,
    tripType: (ts.trip_type as any) || (ts.tripType as any) || 'outward',
    orderId: ts.order_id || undefined,
    orderNumber: ts.order_number || undefined,
    partyName: ts.party_name || undefined,
    materialName: ts.material_name,
    netWeightTonnes: parseNum(ts.net_weight_tonnes),
    destination: ts.destination,
    status: (ts.status as any) || 'delivered',
    fuelIssuedLiters: parseNum(ts.fuel_issued_litres || ts.fuelIssuedLiters),
    cashAdvanceRupees: parseNum(ts.driver_advance || ts.cashAdvanceRupees),
    notes: ts.notes || undefined,
    createdAt: ts.created_at,
  }));
}

export async function fetchTyresDirect(): Promise<Tyre[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getTyres();
  }
  const rows = await executeMysqlQuery('SELECT * FROM tyres ORDER BY serial_number ASC');
  return rows.map((tyr: any) => ({
    id: tyr.id,
    serialNumber: tyr.serial_number,
    brand: tyr.brand,
    size: tyr.size,
    type: (tyr.type as any) || 'radial',
    status: (tyr.status as any) || 'available',
    vehicleId: tyr.mounted_vehicle_id || tyr.vehicleId || undefined,
    vehicleNo: tyr.mounted_vehicle_number || tyr.vehicleNo || undefined,
    purchaseDate: tyr.purchase_date || tyr.purchaseDate || new Date().toISOString().split('T')[0],
    purchaseCost: parseNum(tyr.cost || tyr.purchaseCost),
    notes: tyr.notes || undefined,
    createdAt: tyr.created_at || new Date().toISOString(),
  }));
}

async function syncItemLocationMappings(itemId: string, locations: any[]) {
  if (!locations || !Array.isArray(locations)) return;
  const now = new Date().toISOString();
  
  if (locations.length === 0) {
    await executeMysqlQuery('DELETE FROM item_location_mapping WHERE item_id = ?', [itemId]);
    return;
  }

  const locIds = locations.map((l) => l.locationId || `loc-${l.locationName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);

  // Delete locations no longer associated with this item
  const placeholders = locIds.map(() => '?').join(',');
  await executeMysqlQuery(
    `DELETE FROM item_location_mapping WHERE item_id = ? AND location_id NOT IN (${placeholders})`,
    [itemId, ...locIds]
  );

  // Upsert current mapped locations (FKs only — no location_name copy;
  // numeric stock fields + optional per-location max capacity)
  for (const l of locations) {
    const locId = l.locationId || `loc-${l.locationName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const mappingId = `ilm-${itemId}-${locId}`;
    await executeMysqlQuery(
      `INSERT INTO item_location_mapping (
        id, item_id, location_id, max_capacity, opening_stock, current_stock, min_stock_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        max_capacity = VALUES(max_capacity),
        opening_stock = VALUES(opening_stock),
        current_stock = VALUES(current_stock),
        min_stock_level = VALUES(min_stock_level),
        updated_at = VALUES(updated_at)`,
      [
        mappingId,
        itemId,
        locId,
        l.maxCapacity !== undefined && l.maxCapacity !== null ? Number(l.maxCapacity) : null,
        Number(l.openingStock) || 0,
        Number(l.currentStock) || 0,
        Number(l.minStockLevel) || 0,
        now,
        now,
      ]
    );
  }
}

export async function createItemDirect(itemData: any): Promise<Item> {
  const item = serverDb.createItem(itemData);
  if (!isMysqlConfigured()) return item;

  // FK store (Golden Rule §2): categoryId + unit_id only — the category name,
  // unit string and all location data are JOINed at read time / live in
  // item_location_mapping (written below).
  const unitId = await resolveUnitIdByCode(item.unit);
  await executeMysqlQuery(
    `INSERT INTO items (
      id, name, code, type, category_id, unit_id, hsn_sac_code,
      tax_rate_gst, sale_price, purchase_price, opening_stock, opening_stock_price,
      opening_stock_date, technical_specs, remarks, is_active, current_stock,
      min_stock_level, max_capacity, last_stock_update,  created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name=VALUES(name), code=VALUES(code), type=VALUES(type),
      category_id=VALUES(category_id), unit_id=VALUES(unit_id),
      hsn_sac_code=VALUES(hsn_sac_code),
      tax_rate_gst=VALUES(tax_rate_gst), sale_price=VALUES(sale_price),
      purchase_price=VALUES(purchase_price),
      opening_stock=VALUES(opening_stock), opening_stock_price=VALUES(opening_stock_price),
      opening_stock_date=VALUES(opening_stock_date),
      technical_specs=VALUES(technical_specs),
      remarks=VALUES(remarks), is_active=VALUES(is_active),
      current_stock=VALUES(current_stock), min_stock_level=VALUES(min_stock_level),
      max_capacity=VALUES(max_capacity),
      last_stock_update=VALUES(last_stock_update),
      updated_at=VALUES(updated_at)`,
    [
      item.id,
      item.name,
      item.code,
      item.type,
      item.categoryId,
      item.unitId || unitId || null,
      item.hsnSacCode || null,
      item.taxRateGst || 18,
      item.salePrice || 0,
      item.purchasePrice || 0,
      item.openingStock !== undefined ? item.openingStock : null,
      item.openingStockPrice !== undefined ? item.openingStockPrice : null,
      item.openingStockDate || null,
      item.technicalSpecs || null,
      item.remarks || null,
      item.isActive ? 1 : 0,
      item.currentStock || 0,
      item.minStockLevel || 0,
      item.maxCapacity || null,
      item.lastStockUpdate || null,
      // Movements live in the stock_movements ledger only — never on the items row.
      item.createdAt || new Date().toISOString(),
      item.updatedAt || new Date().toISOString(),
    ]
  );

  if (item.locations && item.locations.length > 0) {
    try {
      await syncItemLocationMappings(item.id, item.locations);
    } catch (mErr: any) {
      console.warn('[OperationsService] Error syncing item_location_mapping on create:', mErr.message);
    }
  }

  return item;
}

export async function updateItemDirect(id: string, updates: any): Promise<Item | null> {
  const item = serverDb.updateItem(id, updates);
  if (!item || !isMysqlConfigured()) return item;

  // FK store + full-SET from the merged item (no COALESCE, no name copies —
  // Golden Rule §2; the mapping table below carries per-location stock).
  const unitId = await resolveUnitIdByCode(item.unit);
  await executeMysqlQuery(
    `UPDATE items SET
      name = ?,
      code = ?,
      type = ?,
      category_id = ?,
      unit_id = ?,
      hsn_sac_code = ?,
      tax_rate_gst = ?,
      sale_price = ?,
      purchase_price = ?,
      opening_stock = ?,
      opening_stock_price = ?,
      opening_stock_date = ?,
      technical_specs = ?,
      remarks = ?,
      is_active = ?,
      current_stock = ?,
      min_stock_level = ?,
      max_capacity = ?,
      movements = NULL,
      last_stock_update = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      item.name,
      item.code,
      item.type,
      item.categoryId,
      item.unitId || unitId || null,
      item.hsnSacCode || null,
      item.taxRateGst || 18,
      item.salePrice || 0,
      item.purchasePrice || 0,
      item.openingStock !== undefined ? item.openingStock : null,
      item.openingStockPrice !== undefined ? item.openingStockPrice : null,
      item.openingStockDate || null,
      item.technicalSpecs || null,
      item.remarks || null,
      item.isActive ? 1 : 0,
      item.currentStock || 0,
      item.minStockLevel || 0,
      item.maxCapacity || null,
      item.lastStockUpdate || null,
      item.updatedAt || new Date().toISOString(),
      id,
    ]
  );

  if (item.locations !== undefined) {
    try {
      await syncItemLocationMappings(id, updates.locations);
    } catch (mErr: any) {
      console.warn('[OperationsService] Error syncing item_location_mapping on update:', mErr.message);
    }
  }

  return item;
}

export async function deleteItemDirect(id: string): Promise<boolean> {
  const deleted = serverDb.deleteItem(id);
  if (!isMysqlConfigured()) return deleted;
  try {
    await executeMysqlQuery('DELETE FROM item_location_mapping WHERE item_id = ?', [id]);
  } catch (mErr: any) {
    console.warn('[OperationsService] Error deleting from item_location_mapping:', mErr.message);
  }
  await executeMysqlQuery('DELETE FROM items WHERE id = ?', [id]);
  return true;
}

export async function createBatchDirect(batchData: any): Promise<ProductionBatchRun> {
  const batch = serverDb.createProductionBatch(batchData);
  if (!isMysqlConfigured()) return batch;

  await executeMysqlQuery(
    `INSERT INTO production_batches (
      id, batch_number, date, plant_unit, target_item_id, target_item_name,
      target_quantity, unit, raw_materials_consumed, supervisor_name,
      mix_temperature_celsius, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      batch_number=VALUES(batch_number), date=VALUES(date), plant_unit=VALUES(plant_unit),
      target_item_id=VALUES(target_item_id), target_item_name=VALUES(target_item_name),
      target_quantity=VALUES(target_quantity), unit=VALUES(unit),
      raw_materials_consumed=VALUES(raw_materials_consumed), supervisor_name=VALUES(supervisor_name),
      mix_temperature_celsius=VALUES(mix_temperature_celsius), notes=VALUES(notes)`,
    [
      batch.id,
      batch.batchNumber,
      batch.date,
      batch.plantUnit,
      batch.targetItemId,
      batch.targetItemName,
      batch.targetQuantity,
      batch.unit,
      JSON.stringify(batch.rawMaterialsConsumed || []),
      batch.supervisorName || null,
      batch.mixTemperatureCelsius || null,
      batch.notes || null,
      batch.createdAt || new Date().toISOString(),
    ]
  );
  return batch;
}

export async function createVehicleDirect(vehData: any): Promise<Vehicle> {
  const veh = serverDb.createVehicle(vehData);
  if (!isMysqlConfigured()) return veh;

  await executeMysqlQuery(
    `INSERT INTO vehicles (
      id, registration_number, type, capacity_tonnes, ownership, status,
      assigned_driver_id, insurance_expiry_date, insurance_monthly_amount,
      fitness_expiry_date, notes, created_at,
      emi_has_emi, emi_financier_name, emi_loan_account_number, emi_amount,
      emi_due_day, emi_loan_start_date, emi_loan_end_date, emi_total_loan_amount,
      emi_interest_rate, emi_tenure_months, emi_paid_count, emi_account_id,
      emi_auto_debit_account, emi_status, emi_last_payment_date, emi_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      registration_number=VALUES(registration_number), type=VALUES(type),
      capacity_tonnes=VALUES(capacity_tonnes), ownership=VALUES(ownership),
      status=VALUES(status), assigned_driver_id=VALUES(assigned_driver_id),
      insurance_expiry_date=VALUES(insurance_expiry_date),
      insurance_monthly_amount=VALUES(insurance_monthly_amount),
      fitness_expiry_date=VALUES(fitness_expiry_date), notes=VALUES(notes),
      emi_has_emi=VALUES(emi_has_emi), emi_financier_name=VALUES(emi_financier_name),
      emi_loan_account_number=VALUES(emi_loan_account_number), emi_amount=VALUES(emi_amount),
      emi_due_day=VALUES(emi_due_day), emi_loan_start_date=VALUES(emi_loan_start_date),
      emi_loan_end_date=VALUES(emi_loan_end_date), emi_total_loan_amount=VALUES(emi_total_loan_amount),
      emi_interest_rate=VALUES(emi_interest_rate), emi_tenure_months=VALUES(emi_tenure_months),
      emi_paid_count=VALUES(emi_paid_count), emi_account_id=VALUES(emi_account_id),
      emi_auto_debit_account=VALUES(emi_auto_debit_account), emi_status=VALUES(emi_status),
      emi_last_payment_date=VALUES(emi_last_payment_date), emi_notes=VALUES(emi_notes)`,
    [
      veh.id,
      veh.vehicleNo,
      veh.type,
      veh.capacityTonnes || 0,
      veh.ownership || 'owned',
      veh.status || 'available',
      veh.currentDriverId || null,
      veh.insuranceExpiry || null,
      veh.insuranceMonthlyAmount ?? null,
      veh.fitnessExpiry || null,
      veh.notes || null,
      veh.createdAt || new Date().toISOString(),
      // EMI financing config
      veh.emiDetails?.hasEmi ? 1 : 0,
      veh.emiDetails?.financierName || null,
      veh.emiDetails?.loanAccountNumber || null,
      veh.emiDetails?.monthlyEmiAmount ?? null,
      veh.emiDetails?.emiDueDay ?? null,
      veh.emiDetails?.loanStartDate || null,
      veh.emiDetails?.loanEndDate || null,
      veh.emiDetails?.totalLoanAmount ?? null,
      veh.emiDetails?.interestRate ?? null,
      veh.emiDetails?.totalTenureMonths ?? null,
      veh.emiDetails?.paidEmisCount ?? null,
      veh.emiDetails?.emiAccountId || null,
      veh.emiDetails?.autoDebitAccount || null,
      veh.emiDetails?.status || null,
      veh.emiDetails?.lastPaymentDate || null,
      veh.emiDetails?.notes || null,
    ]
  );
  return veh;
}

export async function createDriverDirect(driverData: any): Promise<Driver> {
  const driver = serverDb.createDriver(driverData);
  if (!isMysqlConfigured()) return driver;

  await executeMysqlQuery(
    `INSERT INTO drivers (id, name, license_number, phone, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), license_number=VALUES(license_number), phone=VALUES(phone), status=VALUES(status)`,
    [
      driver.id,
      driver.name,
      driver.licenseNo,
      driver.phone,
      driver.status || 'available',
      driver.createdAt || new Date().toISOString(),
    ]
  );
  return driver;
}

export async function createTripSlipDirect(slipData: any): Promise<TripSlip> {
  const slip = serverDb.createTripSlip(slipData);
  if (!isMysqlConfigured()) return slip;

  await executeMysqlQuery(
    `INSERT INTO trip_slips (
      id, slip_number, date, time, vehicle_id, vehicle_number, driver_id,
      driver_name, trip_type, order_id, order_number, party_name, material_name,
      net_weight_tonnes, destination, status, fuel_issued_litres, driver_advance,
      notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      slip_number=VALUES(slip_number), date=VALUES(date), status=VALUES(status),
      net_weight_tonnes=VALUES(net_weight_tonnes), fuel_issued_litres=VALUES(fuel_issued_litres),
      driver_advance=VALUES(driver_advance), notes=VALUES(notes)`,
    [
      slip.id,
      slip.slipNumber,
      slip.date,
      slip.time || '10:00',
      slip.vehicleId,
      slip.vehicleNo,
      slip.driverId,
      slip.driverName,
      slip.tripType || 'outward',
      slip.orderId || null,
      slip.orderNumber || null,
      slip.partyName || null,
      slip.materialName,
      slip.netWeightTonnes || 0,
      slip.destination,
      slip.status || 'delivered',
      slip.fuelIssuedLiters || 0,
      slip.cashAdvanceRupees || 0,
      slip.notes || null,
      slip.createdAt || new Date().toISOString(),
    ]
  );
  return slip;
}

export async function createTyreDirect(tyreData: any): Promise<Tyre> {
  const tyre = serverDb.createTyre(tyreData);
  if (!isMysqlConfigured()) return tyre;

  await executeMysqlQuery(
    `INSERT INTO tyres (
      id, serial_number, brand, size, type, status, mounted_vehicle_id,
      mounted_vehicle_number, purchase_date, cost, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status=VALUES(status), mounted_vehicle_id=VALUES(mounted_vehicle_id),
      mounted_vehicle_number=VALUES(mounted_vehicle_number), notes=VALUES(notes)`,
    [
      tyre.id,
      tyre.serialNumber,
      tyre.brand,
      tyre.size,
      tyre.type || 'radial',
      tyre.status || 'available',
      tyre.vehicleId || null,
      tyre.vehicleNo || null,
      tyre.purchaseDate || new Date().toISOString().split('T')[0],
      tyre.purchaseCost || 0,
      tyre.notes || null,
      tyre.createdAt || new Date().toISOString(),
    ]
  );
  return tyre;
}
