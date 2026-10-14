import { executeMysqlQuery, executeMysqlOne } from './queryClient';
import { isMysqlConfigured } from './connection';
import { Item, ItemCategory, ItemUnit, ItemLocation, ProductionBatchRun, Order, Vehicle, Driver, TripSlip, Tyre } from '../../src/types';
import { serverDb } from '../db';

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
    categoryName: it.category_name,
    unit: it.unit,
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
    stockLocation: it.stock_location || undefined,
    stockLocations: parseJsonField(it.stock_locations, []),
    locations: parseJsonField(it.locations, []),
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
    const mappingRows = await executeMysqlQuery(
      `SELECT id, item_id, location_id, location_name, opening_stock, current_stock, min_stock_level
       FROM item_location_mapping
       WHERE item_id IN (${placeholders})
       ORDER BY location_name ASC`,
      itemIds
    );

    const mapByItem = new Map<string, any[]>();
    for (const m of mappingRows) {
      const list = mapByItem.get(m.item_id) || [];
      list.push({
        locationId: m.location_id,
        locationName: m.location_name,
        openingStock: parseNum(m.opening_stock),
        currentStock: parseNum(m.current_stock),
        minStockLevel: parseNum(m.min_stock_level),
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

export async function fetchItemsDirect(filter: { categoryId?: string; type?: string; query?: string }): Promise<Item[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getItems(filter);
  }

  let sql = 'SELECT * FROM items WHERE 1=1';
  const params: any[] = [];

  if (filter.categoryId) {
    sql += ' AND category_id = ?';
    params.push(filter.categoryId);
  }
  if (filter.type) {
    sql += ' AND type = ?';
    params.push(filter.type);
  }
  if (filter.query) {
    sql += ' AND (name LIKE ? OR code LIKE ?)';
    const q = `%${filter.query}%`;
    params.push(q, q);
  }

  sql += ' ORDER BY name ASC';
  const rows = await executeMysqlQuery(sql, params);
  const items = rows.map(mapItemRow);
  return attachLocationsToItems(items);
}

export async function fetchItemByIdDirect(id: string): Promise<Item | null> {
  if (!isMysqlConfigured()) {
    return serverDb.getItemById(id) || null;
  }
  const row = await executeMysqlOne('SELECT * FROM items WHERE id = ?', [id]);
  if (!row) return null;
  const item = mapItemRow(row);
  const itemsWithLocs = await attachLocationsToItems([item]);
  return itemsWithLocs[0] || item;
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
// ORDERS
// ==========================================

export async function fetchOrdersDirect(): Promise<Order[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getOrders();
  }
  const rows = await executeMysqlQuery('SELECT * FROM orders ORDER BY date DESC, created_at DESC');
  return rows.map((o: any) => ({
    id: o.id,
    orderNumber: o.order_number,
    type: o.type,
    partyId: o.party_id,
    partyName: o.party_name,
    date: o.date,
    stage: o.stage || undefined,
    status: o.status || 'pending',
    paymentMode: o.payment_mode || undefined,
    accountId: o.account_id || undefined,
    accountName: o.account_name || undefined,
    paymentStatus: o.payment_status || 'paid',
    items: parseJsonField(o.items, []),
    taxRateGst: parseNum(o.tax_rate_gst, 18),
    taxAmount: parseNum(o.tax_amount),
    totalAmount: parseNum(o.total_amount),
    notes: o.notes || undefined,
    vehicleNo: o.vehicle_no || undefined,
    driverName: o.driver_name || undefined,
    transportCharges: parseNum(o.transport_charges),
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }));
}

export async function fetchOrderByIdDirect(id: string): Promise<Order | null> {
  if (!isMysqlConfigured()) {
    return serverDb.getOrderById(id) || null;
  }
  const o = await executeMysqlOne('SELECT * FROM orders WHERE id = ?', [id]);
  if (!o) return null;
  return {
    id: o.id,
    orderNumber: o.order_number,
    type: o.type,
    partyId: o.party_id,
    partyName: o.party_name,
    date: o.date,
    stage: o.stage || undefined,
    status: o.status || 'pending',
    paymentMode: o.payment_mode || undefined,
    accountId: o.account_id || undefined,
    accountName: o.account_name || undefined,
    paymentStatus: o.payment_status || 'paid',
    items: parseJsonField(o.items, []),
    taxRateGst: parseNum(o.tax_rate_gst, 18),
    taxAmount: parseNum(o.tax_amount),
    totalAmount: parseNum(o.total_amount),
    notes: o.notes || undefined,
    vehicleNo: o.vehicle_no || undefined,
    driverName: o.driver_name || undefined,
    transportCharges: parseNum(o.transport_charges),
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

// ==========================================
// LOGISTICS: VEHICLES, DRIVERS, TRIPS, TYRES
// ==========================================

export async function fetchVehiclesDirect(): Promise<Vehicle[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getVehicles();
  }
  const rows = await executeMysqlQuery('SELECT * FROM vehicles ORDER BY registration_number ASC');
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
    fitnessExpiry: v.fitness_expiry_date || v.fitnessExpiry || undefined,
    notes: v.notes || undefined,
    createdAt: v.created_at || new Date().toISOString(),
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

  // Upsert current mapped locations
  for (const l of locations) {
    const locId = l.locationId || `loc-${l.locationName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const mappingId = `ilm-${itemId}-${locId}`;
    await executeMysqlQuery(
      `INSERT INTO item_location_mapping (
        id, item_id, location_id, location_name, opening_stock, current_stock, min_stock_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        location_name = VALUES(location_name),
        opening_stock = VALUES(opening_stock),
        current_stock = VALUES(current_stock),
        min_stock_level = VALUES(min_stock_level),
        updated_at = VALUES(updated_at)`,
      [
        mappingId,
        itemId,
        locId,
        l.locationName,
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

  await executeMysqlQuery(
    `INSERT INTO items (
      id, name, code, type, category_id, category_name, unit, hsn_sac_code,
      tax_rate_gst, sale_price, purchase_price, opening_stock, opening_stock_price,
      opening_stock_date, technical_specs, remarks, is_active, current_stock,
      min_stock_level, max_capacity, stock_location, locations, stock_locations,
      last_stock_update, movements, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name=VALUES(name), code=VALUES(code), type=VALUES(type),
      category_id=VALUES(category_id), category_name=VALUES(category_name),
      unit=VALUES(unit), hsn_sac_code=VALUES(hsn_sac_code),
      tax_rate_gst=VALUES(tax_rate_gst), sale_price=VALUES(sale_price),
      purchase_price=VALUES(purchase_price),
      opening_stock=VALUES(opening_stock), opening_stock_price=VALUES(opening_stock_price),
      opening_stock_date=VALUES(opening_stock_date),
      technical_specs=VALUES(technical_specs),
      remarks=VALUES(remarks), is_active=VALUES(is_active),
      current_stock=VALUES(current_stock), min_stock_level=VALUES(min_stock_level),
      max_capacity=VALUES(max_capacity), stock_location=VALUES(stock_location),
      locations=VALUES(locations), stock_locations=VALUES(stock_locations),
      last_stock_update=VALUES(last_stock_update), movements=VALUES(movements),
      updated_at=VALUES(updated_at)`,
    [
      item.id,
      item.name,
      item.code,
      item.type,
      item.categoryId,
      item.categoryName,
      item.unit,
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
      item.stockLocation || null,
      JSON.stringify(item.locations || []),
      JSON.stringify(item.stockLocations || []),
      item.lastStockUpdate || null,
      JSON.stringify(item.movements || []),
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

  await executeMysqlQuery(
    `UPDATE items SET
      name = COALESCE(?, name),
      code = COALESCE(?, code),
      type = COALESCE(?, type),
      category_id = COALESCE(?, category_id),
      category_name = COALESCE(?, category_name),
      unit = COALESCE(?, unit),
      hsn_sac_code = COALESCE(?, hsn_sac_code),
      tax_rate_gst = COALESCE(?, tax_rate_gst),
      sale_price = COALESCE(?, sale_price),
      purchase_price = COALESCE(?, purchase_price),
      opening_stock = COALESCE(?, opening_stock),
      opening_stock_price = COALESCE(?, opening_stock_price),
      opening_stock_date = COALESCE(?, opening_stock_date),
      technical_specs = COALESCE(?, technical_specs),
      remarks = COALESCE(?, remarks),
      is_active = COALESCE(?, is_active),
      current_stock = COALESCE(?, current_stock),
      min_stock_level = COALESCE(?, min_stock_level),
      max_capacity = COALESCE(?, max_capacity),
      stock_location = COALESCE(?, stock_location),
      locations = COALESCE(?, locations),
      stock_locations = COALESCE(?, stock_locations),
      updated_at = ?
    WHERE id = ?`,
    [
      updates.name || null,
      updates.code || null,
      updates.type || null,
      updates.categoryId || null,
      updates.categoryName || null,
      updates.unit || null,
      updates.hsnSacCode || null,
      updates.taxRateGst !== undefined ? updates.taxRateGst : null,
      updates.salePrice !== undefined ? updates.salePrice : null,
      updates.purchasePrice !== undefined ? updates.purchasePrice : null,
      updates.openingStock !== undefined ? updates.openingStock : null,
      updates.openingStockPrice !== undefined ? updates.openingStockPrice : null,
      updates.openingStockDate || null,
      updates.technicalSpecs || null,
      updates.remarks || null,
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : null,
      updates.currentStock !== undefined ? updates.currentStock : null,
      updates.minStockLevel !== undefined ? updates.minStockLevel : null,
      updates.maxCapacity !== undefined ? updates.maxCapacity : null,
      updates.stockLocation || null,
      updates.locations !== undefined ? JSON.stringify(updates.locations) : null,
      updates.stockLocations !== undefined ? JSON.stringify(updates.stockLocations) : null,
      new Date().toISOString(),
      id,
    ]
  );

  if (updates.locations !== undefined) {
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

export async function createOrderDirect(orderData: any): Promise<Order> {
  const order = serverDb.createOrder(orderData);
  if (!isMysqlConfigured()) return order;

  await executeMysqlQuery(
    `INSERT INTO orders (
      id, order_number, type, party_id, party_name, date, stage, status,
      payment_mode, account_id, account_name, payment_status, items,
      tax_rate_gst, tax_amount, total_amount, notes, vehicle_no, driver_name,
      transport_charges, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      order_number=VALUES(order_number), type=VALUES(type), party_id=VALUES(party_id),
      party_name=VALUES(party_name), date=VALUES(date), stage=VALUES(stage), status=VALUES(status),
      payment_mode=VALUES(payment_mode), account_id=VALUES(account_id), account_name=VALUES(account_name),
      payment_status=VALUES(payment_status), items=VALUES(items), tax_rate_gst=VALUES(tax_rate_gst),
      tax_amount=VALUES(tax_amount), total_amount=VALUES(total_amount), notes=VALUES(notes),
      vehicle_no=VALUES(vehicle_no), driver_name=VALUES(driver_name),
      transport_charges=VALUES(transport_charges), updated_at=VALUES(updated_at)`,
    [
      order.id,
      order.orderNumber,
      order.type,
      order.partyId,
      order.partyName,
      order.date,
      order.stage || null,
      order.status || 'pending',
      order.paymentMode || null,
      order.accountId || null,
      order.accountName || null,
      order.paymentStatus || 'paid',
      JSON.stringify(order.items || []),
      order.taxRateGst || 18,
      order.taxAmount || 0,
      order.totalAmount || 0,
      order.notes || null,
      order.vehicleNo || null,
      order.driverName || null,
      order.transportCharges || 0,
      order.createdAt || new Date().toISOString(),
      order.updatedAt || new Date().toISOString(),
    ]
  );
  return order;
}

export async function updateOrderDirect(id: string, updates: any): Promise<Order | null> {
  const order = serverDb.updateOrder(id, updates);
  if (!order || !isMysqlConfigured()) return order;

  await executeMysqlQuery(
    `UPDATE orders SET
      stage = COALESCE(?, stage),
      status = COALESCE(?, status),
      payment_status = COALESCE(?, payment_status),
      notes = COALESCE(?, notes),
      updated_at = ?
    WHERE id = ?`,
    [
      updates.stage || null,
      updates.status || null,
      updates.paymentStatus || null,
      updates.notes || null,
      new Date().toISOString(),
      id,
    ]
  );
  return order;
}

export async function deleteOrderDirect(id: string): Promise<boolean> {
  const deleted = serverDb.deleteOrder(id);
  if (!isMysqlConfigured()) return deleted;
  await executeMysqlQuery('DELETE FROM orders WHERE id = ?', [id]);
  return true;
}

export async function createVehicleDirect(vehData: any): Promise<Vehicle> {
  const veh = serverDb.createVehicle(vehData);
  if (!isMysqlConfigured()) return veh;

  await executeMysqlQuery(
    `INSERT INTO vehicles (
      id, registration_number, type, capacity_tonnes, ownership, status,
      assigned_driver_id, assigned_driver_name, insurance_expiry_date,
      fitness_expiry_date, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      registration_number=VALUES(registration_number), type=VALUES(type),
      capacity_tonnes=VALUES(capacity_tonnes), ownership=VALUES(ownership),
      status=VALUES(status), assigned_driver_id=VALUES(assigned_driver_id),
      assigned_driver_name=VALUES(assigned_driver_name),
      insurance_expiry_date=VALUES(insurance_expiry_date),
      fitness_expiry_date=VALUES(fitness_expiry_date), notes=VALUES(notes)`,
    [
      veh.id,
      veh.vehicleNo,
      veh.type,
      veh.capacityTonnes || 0,
      veh.ownership || 'owned',
      veh.status || 'available',
      veh.currentDriverId || null,
      veh.currentDriverName || null,
      veh.insuranceExpiry || null,
      veh.fitnessExpiry || null,
      veh.notes || null,
      veh.createdAt || new Date().toISOString(),
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
