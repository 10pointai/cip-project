import { getMysqlPool, isMysqlConfigured } from './connection';
import {
  CompanySettings,
  Party,
  Transaction,
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
  CashBankAccount,
  InternalTransfer,
  AccountAdjustment,
} from '../../src/types';
import { DatabaseSchema, AuditLog } from '../db';
import {
  SEED_SETTINGS,
  SEED_ORDERS,
  SEED_ACCOUNTS,
  SEED_TRANSFERS,
  SEED_ADJUSTMENTS,
} from '../seedData';

/**
 * Transforms raw Azure MySQL rows into standard TypeScript schema models
 */
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

let hasCheckedOrdersSeed = false;

export async function loadAllFromMysql(): Promise<DatabaseSchema | null> {
  if (!isMysqlConfigured()) return null;
  const pool = getMysqlPool();
  if (!pool) return null;

  try {
    const conn = await pool.getConnection();
    try {
      // 1. Settings
      let settings: CompanySettings = { ...SEED_SETTINGS };
      const [settingRows]: [any[], any] = await conn.query('SELECT * FROM company_settings LIMIT 1');
      if (settingRows && settingRows.length > 0) {
        const s = settingRows[0];
        settings = {
          ...SEED_SETTINGS,
          companyName: s.company_name || SEED_SETTINGS.companyName,
          tradeName: s.trade_name || SEED_SETTINGS.tradeName,
          gstin: s.gstin || SEED_SETTINGS.gstin,
          pan: s.pan || SEED_SETTINGS.pan,
          email: s.email || SEED_SETTINGS.email,
          phone: s.phone || SEED_SETTINGS.phone,
          invoiceNotes: s.invoice_notes || SEED_SETTINGS.invoiceNotes,
        };
      }

      // 2. Users
      const [userRows]: [any[], any] = await conn.query('SELECT * FROM users');
      const users: AppUser[] = userRows.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name || u.name || u.username,
        email: u.email,
        phone: u.phone || undefined,
        role: u.role,
        status: u.status,
        passwordHash: u.password_hash || u.passwordHash || undefined,
        activationCode: u.activation_code || undefined,
        permissions: parseJsonField(u.permissions, {} as any),
        notes: u.notes || undefined,
        lastLoginAt: u.last_login || u.lastLoginAt || undefined,
        createdAt: u.created_at,
      }));

      // 3. Parties
      const [partyRows]: [any[], any] = await conn.query('SELECT * FROM parties ORDER BY name ASC');
      const parties: Party[] = partyRows.map((p) => ({
        id: p.id,
        name: p.name,
        tradeName: p.trade_name || undefined,
        type: p.type,
        category: p.category,
        gstin: p.gstin || undefined,
        pan: p.pan || undefined,
        contactPerson: p.contact_person || undefined,
        phone: p.phone,
        email: p.email || undefined,
        address: parseJsonField(p.address, {
          street: '',
          city: '',
          state: '',
          pincode: '',
          stateCode: '',
        }),
        paymentTermsDays: p.payment_terms_days || 30,
        creditLimit: parseNum(p.credit_limit),
        openingBalance: parseNum(p.opening_balance),
        openingBalanceType: p.opening_balance_type || 'to_receive',
        currentBalance: parseNum(p.current_balance),
        notes: p.notes || undefined,
        isActive: Boolean(p.is_active),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));

      // 4. Items
      const [itemRows]: [any[], any] = await conn.query('SELECT * FROM items ORDER BY name ASC');
      const items: Item[] = itemRows.map((it) => ({
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
      }));

      // 4b. Load and attach normalized item location mappings
      try {
        const [ilmRows]: [any[], any] = await conn.query('SELECT * FROM item_location_mapping ORDER BY location_name ASC');
        const mappingByItem = new Map<string, any[]>();
        for (const m of ilmRows || []) {
          const list = mappingByItem.get(m.item_id) || [];
          list.push({
            locationId: m.location_id,
            locationName: m.location_name,
            openingStock: parseNum(m.opening_stock),
            currentStock: parseNum(m.current_stock),
            minStockLevel: parseNum(m.min_stock_level),
          });
          mappingByItem.set(m.item_id, list);
        }
        for (const item of items) {
          const locs = mappingByItem.get(item.id);
          if (locs && locs.length > 0) {
            item.locations = locs;
            item.stockLocations = locs.map((l) => l.locationName);
            item.stockLocation = item.stockLocations.join(', ');
          }
        }
      } catch (ilmErr: any) {
        console.warn('[Azure MySQL] Notice loading item_location_mapping:', ilmErr.message);
      }

      // 5. Transactions (filter out any orphaned transactions where party does not exist)
      const validPartyIds = new Set(parties.map((p) => p.id));
      const [txRows]: [any[], any] = await conn.query('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
      const transactions: Transaction[] = txRows
        .filter((t) => validPartyIds.has(t.party_id))
        .map((t) => ({
        id: t.id,
        voucherNumber: t.voucher_number,
        date: t.date,
        accountId: t.account_id || undefined,
        accountName: t.account_name || undefined,
        type: t.type,
        partyId: t.party_id,
        partyName: t.party_name,
        partyType: (t.party_type as any) || 'customer',
        amount: parseNum(t.amount),
        paymentMode: t.payment_mode || undefined,
        referenceNumber: t.reference_number || undefined,
        materialOrService: t.material_or_service || undefined,
        quantityTonnes: t.quantity_tonnes ? parseNum(t.quantity_tonnes) : undefined,
        description: t.description,
        status: t.status,
        dueDate: t.due_date || undefined,
        createdAt: t.created_at,
      }));

      // 6. Categories, Units, Locations
      const [catRows]: [any[], any] = await conn.query('SELECT * FROM item_categories ORDER BY name ASC');
      const categories: ItemCategory[] = catRows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description || undefined,
        type: c.type || 'both',
        color: c.color || undefined,
        createdAt: c.created_at,
      }));

      const [unitRows]: [any[], any] = await conn.query('SELECT * FROM item_units ORDER BY name ASC');
      const units: ItemUnit[] = unitRows.map((u) => ({
        id: u.id,
        code: u.code || u.symbol || u.name,
        name: u.name,
        allowDecimal: u.allow_decimal !== undefined ? Boolean(u.allow_decimal) : true,
        isStandard: Boolean(u.is_standard),
      }));

      const [locRows]: [any[], any] = await conn.query('SELECT * FROM item_locations ORDER BY name ASC');
      const locations: ItemLocation[] = locRows.map((l) => ({
        id: l.id,
        name: l.name,
        code: l.code || undefined,
        description: l.description || undefined,
        capacity: l.capacity || undefined,
        type: l.type || 'yard',
        isStandard: Boolean(l.is_standard),
        createdAt: l.created_at,
      }));

      // 7. Production Batches
      const [batchRows]: [any[], any] = await conn.query('SELECT * FROM production_batches ORDER BY date DESC, created_at DESC');
      const productionBatches: ProductionBatchRun[] = batchRows.map((b) => ({
        id: b.id,
        batchNumber: b.batch_number,
        date: b.date,
        plantUnit: b.plant_unit,
        targetItemId: b.target_item_id,
        targetItemName: b.target_item_name,
        targetQuantity: parseNum(b.target_quantity),
        unit: b.unit,
        rawMaterialsConsumed: parseJsonField(b.raw_materials_consumed, []),
        supervisorName: b.supervisor_name || 'Plant Supervisor',
        mixTemperatureCelsius: b.mix_temperature_celsius ? parseNum(b.mix_temperature_celsius) : undefined,
        notes: b.notes || undefined,
        createdAt: b.created_at,
      }));

      // 8. Orders
      const [orderRows]: [any[], any] = await conn.query('SELECT * FROM orders ORDER BY date DESC, created_at DESC');
      let orders: Order[] = orderRows.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        type: o.type,
        partyId: o.party_id,
        partyName: o.party_name,
        date: o.date,
        stage: o.stage || 'sales_order',
        status: o.status,
        paymentMode: o.payment_mode || 'bank_transfer',
        accountId: o.account_id || '',
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

      // Orders seed disabled for production
      if (!hasCheckedOrdersSeed) {
        hasCheckedOrdersSeed = true;
      }

      // 9. Vehicles & Drivers
      const [vehRows]: [any[], any] = await conn.query('SELECT * FROM vehicles ORDER BY registration_number ASC');
      const vehicles: Vehicle[] = vehRows.map((v) => ({
        id: v.id,
        vehicleNo: v.registration_number,
        type: (v.type as any) || 'tipper',
        capacityTonnes: parseNum(v.capacity_tonnes),
        ownership: (v.ownership as any) || 'owned',
        status: (v.status as any) || 'available',
        currentDriverId: v.assigned_driver_id || undefined,
        currentDriverName: v.assigned_driver_name || undefined,
        insuranceExpiry: v.insurance_expiry_date || undefined,
        fitnessExpiry: v.fitness_expiry_date || undefined,
        notes: v.notes || undefined,
        createdAt: v.created_at || new Date().toISOString(),
      }));

      const [driverRows]: [any[], any] = await conn.query('SELECT * FROM drivers ORDER BY name ASC');
      const drivers: Driver[] = driverRows.map((d) => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        licenseNo: d.license_number,
        status: (d.status as any) || 'available',
        createdAt: d.created_at || new Date().toISOString(),
      }));

      // 10. Trip Slips & Tyres
      const [tripRows]: [any[], any] = await conn.query('SELECT * FROM trip_slips ORDER BY date DESC, created_at DESC');
      const tripSlips: TripSlip[] = tripRows.map((ts) => ({
        id: ts.id,
        slipNumber: ts.slip_number,
        date: ts.date,
        time: ts.time || '10:00',
        vehicleId: ts.vehicle_id,
        vehicleNo: ts.vehicle_number,
        driverId: ts.driver_id,
        driverName: ts.driver_name,
        tripType: (ts.trip_type as any) || 'outward',
        partyName: ts.party_name,
        destination: ts.destination,
        materialName: ts.material_name,
        netWeightTonnes: parseNum(ts.net_weight_tonnes),
        status: (ts.status as any) || 'transit',
        fuelIssuedLiters: parseNum(ts.fuel_issued_litres),
        cashAdvanceRupees: parseNum(ts.driver_advance),
        notes: ts.notes || undefined,
        createdAt: ts.created_at,
      }));

      const [tyreRows]: [any[], any] = await conn.query('SELECT * FROM tyres ORDER BY serial_number ASC');
      const tyres: Tyre[] = tyreRows.map((tyr) => ({
        id: tyr.id,
        serialNumber: tyr.serial_number,
        brand: tyr.brand,
        size: tyr.size,
        type: (tyr.type as any) || 'radial',
        status: (tyr.status as any) || 'mounted',
        vehicleId: tyr.mounted_vehicle_id || undefined,
        vehicleNo: tyr.mounted_vehicle_number || undefined,
        position: tyr.axle_position || undefined,
        purchaseDate: tyr.purchase_date || '2026-04-01',
        purchaseCost: parseNum(tyr.cost),
        notes: tyr.notes || undefined,
        createdAt: tyr.created_at || new Date().toISOString(),
      }));

      // 11. Employees, Attendance, Leaves, Payments
      const [empRows]: [any[], any] = await conn.query('SELECT * FROM employees ORDER BY name ASC');
      const employees: Employee[] = empRows.map((e) => ({
        id: e.id,
        name: e.name,
        role: (e.designation as any) || 'other',
        phone: e.phone,
        email: e.email || undefined,
        joiningDate: e.date_of_joining,
        salaryBase: parseNum(e.base_salary),
        salaryType: (e.salary_type as any) || 'monthly',
        status: (e.status as any) || 'active',
        bankAccountNo: (parseJsonField(e.bank_details, {}) as any).accountNumber || undefined,
        bankIFSC: (parseJsonField(e.bank_details, {}) as any).ifscCode || undefined,
        createdAt: e.created_at,
      }));

      const [attRows]: [any[], any] = await conn.query('SELECT * FROM attendance ORDER BY date DESC');
      const attendance: EmployeeAttendance[] = attRows.map((a) => ({
        id: a.id,
        employeeId: a.employee_id,
        employeeName: a.employee_name,
        date: a.date,
        status: (a.status as any) || 'present',
        checkInTime: a.in_time || undefined,
        checkOutTime: a.out_time || undefined,
        totalHoursWorked: parseNum(a.work_hours),
        punchLogs: parseJsonField(a.punch_logs, []),
        notes: a.notes || undefined,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      }));

      const [leaveRows]: [any[], any] = await conn.query('SELECT * FROM leaves ORDER BY start_date DESC');
      const leaves: EmployeeLeave[] = leaveRows.map((l) => ({
        id: l.id,
        employeeId: l.employee_id,
        employeeName: l.employee_name,
        leaveType: (l.leave_type as any) || 'casual',
        startDate: l.start_date,
        endDate: l.end_date,
        totalDays: parseNum(l.total_days, 1),
        reason: l.reason || '',
        status: (l.status as any) || 'approved',
        createdAt: l.created_at || new Date().toISOString(),
      }));

      const [payRows]: [any[], any] = await conn.query('SELECT * FROM employee_payments ORDER BY date DESC');
      const employeePayments: EmployeePayment[] = payRows.map((p) => ({
        id: p.id,
        employeeId: p.employee_id,
        employeeName: p.employee_name,
        date: p.date,
        type: (p.type as any) || 'salary',
        amount: parseNum(p.amount),
        paymentMode: (p.payment_mode as any) || 'bank_transfer',
        referenceNo: p.reference_no || undefined,
        notes: p.notes || undefined,
        monthYear: p.month_year || undefined,
      }));

      // 12. Cash & Bank Management
      let accounts: CashBankAccount[] = [];
      try {
        const [accRows]: [any[], any] = await conn.query('SELECT * FROM cash_bank_accounts ORDER BY is_default DESC, name ASC');
        accounts = accRows.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          accountNumber: a.account_number || undefined,
          ifscCode: a.ifsc_code || undefined,
          bankName: a.bank_name || undefined,
          openingBalance: parseNum(a.opening_balance),
          currentBalance: parseNum(a.current_balance),
          asOfDate: a.as_of_date || '2026-04-01',
          notes: a.notes || undefined,
          isDefault: Boolean(a.is_default),
          isActive: Boolean(a.is_active),
          createdAt: a.created_at,
          updatedAt: a.updated_at || a.created_at,
        }));
      } catch (accErr: any) {
        console.warn('[Azure MySQL] Notice querying cash_bank_accounts:', accErr.message);
      }

      let transfers: InternalTransfer[] = [];
      try {
        const [trfRows]: [any[], any] = await conn.query('SELECT * FROM internal_transfers ORDER BY date DESC, created_at DESC');
        transfers = trfRows.map((tr) => ({
          id: tr.id,
          transferNumber: tr.transfer_number,
          date: tr.date,
          fromAccountId: tr.from_account_id,
          fromAccountName: tr.from_account_name,
          toAccountId: tr.to_account_id,
          toAccountName: tr.to_account_name,
          transferType: tr.transfer_type,
          amount: parseNum(tr.amount),
          referenceNumber: tr.reference_number || undefined,
          notes: tr.notes || undefined,
          createdAt: tr.created_at,
        }));
      } catch (trfErr: any) {
        console.warn('[Azure MySQL] Notice querying internal_transfers:', trfErr.message);
      }

      let adjustments: AccountAdjustment[] = [];
      try {
        const [adjRows]: [any[], any] = await conn.query('SELECT * FROM account_adjustments ORDER BY date DESC, created_at DESC');
        adjustments = adjRows.map((ad) => ({
          id: ad.id,
          adjustmentNumber: ad.adjustment_number,
          accountId: ad.account_id,
          accountName: ad.account_name,
          accountType: ad.account_type,
          date: ad.date,
          type: ad.type,
          amount: parseNum(ad.amount),
          previousBalance: parseNum(ad.previous_balance),
          newBalance: parseNum(ad.new_balance),
          reason: ad.reason,
          referenceNumber: ad.reference_number || undefined,
          notes: ad.notes || undefined,
          createdAt: ad.created_at,
        }));
      } catch (adjErr: any) {
        console.warn('[Azure MySQL] Notice querying account_adjustments:', adjErr.message);
      }

      // 13. Audit Logs
      const [audRows]: [any[], any] = await conn.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200');
      const auditLogs: AuditLog[] = audRows.map((aud) => ({
        id: aud.id,
        timestamp: aud.timestamp,
        userId: aud.user_id || undefined,
        userName: aud.user_name || undefined,
        action: aud.action,
        entity: aud.entity,
        entityId: aud.entity_id || undefined,
        details: aud.details,
      }));

      if (!settings) {
        return null;
      }

      console.log(`[Azure MySQL] Loaded live data from Azure: ${parties.length} parties, ${items.length} items, ${transactions.length} transactions, ${accounts.length} accounts, ${orders.length} orders.`);

      return {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        settings,
        users,
        parties,
        items,
        transactions,
        categories,
        units,
        locations,
        productionBatches,
        orders,
        vehicles,
        drivers,
        tripSlips,
        tyres,
        employees,
        attendance,
        leaves,
        employeePayments,
        accounts,
        transfers,
        adjustments,
        stockAdjustments: [],
        auditLogs,
      };
    } finally {
      conn.release();
    }
  } catch (err: any) {
    console.error('[Azure MySQL] Error loading all tables from MySQL:', err.message);
    return null;
  }
}

// -------------------------------------------------------------
// ASYNC LIVE WRITE HELPERS (Fire-and-forget or awaited)
// -------------------------------------------------------------

export async function liveSyncParty(party: Party, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM parties WHERE id = ?', [party.id]);
    } else {
      await pool.query(
        `REPLACE INTO parties (id, name, trade_name, type, category, gstin, pan, contact_person, phone, email, address, payment_terms_days, credit_limit, opening_balance, opening_balance_type, current_balance, notes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          party.id,
          party.name,
          party.tradeName || null,
          party.type,
          party.category,
          party.gstin || null,
          party.pan || null,
          party.contactPerson || null,
          party.phone || '',
          party.email || null,
          JSON.stringify(party.address || {}),
          party.paymentTermsDays || 30,
          party.creditLimit || 0,
          party.openingBalance || 0,
          party.openingBalanceType || 'to_receive',
          party.currentBalance || 0,
          party.notes || null,
          party.isActive ? 1 : 0,
          party.createdAt || new Date().toISOString(),
          party.updatedAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync party:', e.message);
  }
}

export async function liveSyncItem(item: Item, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM item_location_mapping WHERE item_id = ?', [item.id]);
      await pool.query('DELETE FROM items WHERE id = ?', [item.id]);
    } else {
      const executeInsert = async (locVal: string | null) => {
        await pool.query(
          `REPLACE INTO items (
            id, name, code, type, category_id, category_name, unit, hsn_sac_code,
            tax_rate_gst, sale_price, purchase_price, opening_stock, opening_stock_price,
            opening_stock_date, technical_specs, remarks, is_active, current_stock,
            min_stock_level, max_capacity, stock_location, locations, stock_locations,
            last_stock_update, movements, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            locVal,
            JSON.stringify(item.locations || []),
            JSON.stringify(item.stockLocations || []),
            item.lastStockUpdate || null,
            JSON.stringify(item.movements || []),
            item.createdAt || new Date().toISOString(),
            item.updatedAt || new Date().toISOString(),
          ]
        );
      };

      try {
        await executeInsert(item.stockLocation || null);
      } catch (insertErr: any) {
        if (insertErr?.message && insertErr.message.includes("Data too long for column 'stock_location'")) {
          console.warn('[Azure MySQL LiveSync] Column stock_location exceeded length limit. Migrating column to TEXT...');
          try {
            await pool.query('ALTER TABLE items MODIFY COLUMN stock_location TEXT NULL');
            await executeInsert(item.stockLocation || null);
          } catch (alterErr: any) {
            console.warn('[Azure MySQL LiveSync] ALTER TABLE failed, falling back to safe truncation:', alterErr.message);
            const safeLoc = (item.stockLocation || '').slice(0, 120);
            await executeInsert(safeLoc || null);
          }
        } else {
          throw insertErr;
        }
      }

      // Sync relational item_location_mapping table
      if (item.locations !== undefined) {
        const locations = item.locations || [];
        const now = new Date().toISOString();
        if (locations.length === 0) {
          await pool.query('DELETE FROM item_location_mapping WHERE item_id = ?', [item.id]);
        } else {
          const locIds = locations.map((l) => l.locationId || `loc-${l.locationName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);
          const placeholders = locIds.map(() => '?').join(',');
          await pool.query(
            `DELETE FROM item_location_mapping WHERE item_id = ? AND location_id NOT IN (${placeholders})`,
            [item.id, ...locIds]
          );
          for (const l of locations) {
            const locId = l.locationId || `loc-${l.locationName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            const mappingId = `ilm-${item.id}-${locId}`;
            await pool.query(
              `REPLACE INTO item_location_mapping (
                id, item_id, location_id, location_name, opening_stock, current_stock, min_stock_level, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                mappingId,
                item.id,
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
      }
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync item:', e.message);
  }
}

export async function liveSyncTransaction(txn: Transaction, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM transactions WHERE id = ?', [txn.id]);
    } else {
      await pool.query(
        `REPLACE INTO transactions (id, voucher_number, date, account_id, account_name, type, party_id, party_name, amount, payment_mode, reference_number, material_or_service, quantity_tonnes, description, status, due_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          txn.id,
          txn.voucherNumber,
          txn.date,
          txn.accountId || null,
          txn.accountName || null,
          txn.type,
          txn.partyId,
          txn.partyName,
          txn.amount,
          txn.paymentMode || null,
          txn.referenceNumber || null,
          txn.materialOrService || null,
          txn.quantityTonnes || null,
          txn.description,
          txn.status || 'paid',
          txn.dueDate || null,
          txn.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync transaction:', e.message);
  }
}

export async function liveSyncOrder(order: Order, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM orders WHERE id = ?', [order.id]);
    } else {
      await pool.query(
        `REPLACE INTO orders (id, order_number, type, party_id, party_name, date, stage, status, items, tax_rate_gst, tax_amount, total_amount, notes, vehicle_no, driver_name, transport_charges, payment_mode, account_id, account_name, payment_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.id,
          order.orderNumber,
          order.type || 'sales',
          order.partyId,
          order.partyName,
          order.date,
          order.stage || 'sales_order',
          order.status || 'pending',
          JSON.stringify(order.items || []),
          order.taxRateGst || 18,
          order.taxAmount || 0,
          order.totalAmount || 0,
          order.notes || null,
          order.vehicleNo || null,
          order.driverName || null,
          order.transportCharges || 0,
          order.paymentMode || 'bank_transfer',
          order.accountId || null,
          order.accountName || null,
          order.paymentStatus || 'paid',
          order.createdAt || new Date().toISOString(),
          order.updatedAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync order:', e.message);
  }
}

export async function liveSyncBatch(batch: ProductionBatchRun, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM production_batches WHERE id = ?', [batch.id]);
    } else {
      await pool.query(
        `REPLACE INTO production_batches (id, batch_number, date, plant_unit, target_item_id, target_item_name, target_quantity, unit, raw_materials_consumed, supervisor_name, mix_temperature_celsius, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batch.id,
          batch.batchNumber,
          batch.date || batch.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
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
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync batch:', e.message);
  }
}

export async function liveSyncAuditLog(log: AuditLog) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, timestamp, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        log.id,
        log.timestamp,
        log.action,
        log.entity,
        log.entityId || null,
        log.details || '',
      ]
    );
  } catch (e: any) {
    // Non-blocking
  }
}

export async function liveSyncVehicle(v: Vehicle, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM vehicles WHERE id = ?', [v.id]);
    } else {
      await pool.query(
        `REPLACE INTO vehicles (id, registration_number, type, capacity_tonnes, tare_weight_kg, status, assigned_driver_id, assigned_driver_name, current_odometer, fuel_capacity_litres, fitness_expiry_date, insurance_expiry_date, puc_expiry_date, notes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          v.id,
          v.vehicleNo,
          v.type,
          v.capacityTonnes || 0,
          0,
          v.status || 'available',
          v.currentDriverId || null,
          v.currentDriverName || null,
          0,
          200,
          v.fitnessExpiry || null,
          v.insuranceExpiry || null,
          null,
          v.notes || null,
          1,
          v.createdAt || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync vehicle:', e.message);
  }
}

export async function liveSyncDriver(d: Driver, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM drivers WHERE id = ?', [d.id]);
    } else {
      await pool.query(
        `REPLACE INTO drivers (id, name, phone, license_number, license_expiry_date, status, assigned_vehicle_id, assigned_vehicle_number, emergency_contact, address, date_of_joining, notes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id,
          d.name,
          d.phone,
          d.licenseNo,
          null,
          d.status || 'available',
          null,
          null,
          null,
          null,
          null,
          null,
          1,
          d.createdAt || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync driver:', e.message);
  }
}

export async function liveSyncTripSlip(ts: TripSlip, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM trip_slips WHERE id = ?', [ts.id]);
    } else {
      await pool.query(
        `REPLACE INTO trip_slips (id, slip_number, date, vehicle_id, vehicle_number, driver_id, driver_name, party_id, party_name, destination, material_item_id, material_name, gross_weight_kg, tare_weight_kg, net_weight_kg, net_weight_tonnes, start_odometer, end_odometer, distance_km, fuel_issued_litres, driver_advance, toll_charges, freight_rate_per_tonne, total_freight_amount, status, weighbridge_slip_number, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ts.id,
          ts.slipNumber,
          ts.date,
          ts.vehicleId,
          ts.vehicleNo,
          ts.driverId,
          ts.driverName,
          ts.orderId || null,
          ts.partyName || null,
          ts.destination,
          ts.orderId || 'item-mat',
          ts.materialName,
          (ts.netWeightTonnes || 0) * 1000,
          0,
          (ts.netWeightTonnes || 0) * 1000,
          ts.netWeightTonnes || 0,
          0,
          0,
          0,
          ts.fuelIssuedLiters || 0,
          ts.cashAdvanceRupees || 0,
          0,
          0,
          0,
          ts.status,
          ts.slipNumber,
          ts.notes || null,
          ts.createdAt || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync trip slip:', e.message);
  }
}

export async function liveSyncTyre(tyr: Tyre, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM tyres WHERE id = ?', [tyr.id]);
    } else {
      await pool.query(
        `REPLACE INTO tyres (id, serial_number, brand, model, size, status, mounted_vehicle_id, mounted_vehicle_number, axle_position, current_tread_depth_mm, initial_tread_depth_mm, total_km_run, purchase_date, cost, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tyr.id,
          tyr.serialNumber,
          tyr.brand,
          tyr.type || 'radial',
          tyr.size,
          tyr.status,
          tyr.vehicleId || null,
          tyr.vehicleNo || null,
          tyr.position || null,
          tyr.threadDepthMm || 12,
          15,
          tyr.currentOdometer || 0,
          tyr.purchaseDate || null,
          tyr.purchaseCost || 0,
          tyr.notes || null,
          tyr.createdAt || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync tyre:', e.message);
  }
}

export async function liveSyncEmployee(emp: Employee, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM employees WHERE id = ?', [emp.id]);
    } else {
      await pool.query(
        `REPLACE INTO employees (id, employee_code, name, designation, department, phone, email, date_of_joining, salary_type, base_salary, daily_wage_rate, bank_details, aadhar_number, pan_number, status, emergency_contact, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emp.id,
          emp.id,
          emp.name,
          emp.role,
          emp.role === 'driver' ? 'Logistics' : 'Operations',
          emp.phone,
          emp.email || null,
          emp.joiningDate,
          emp.salaryType,
          emp.salaryType === 'monthly' ? emp.salaryBase : 0,
          emp.salaryType === 'daily' ? emp.salaryBase : 0,
          JSON.stringify({ accountNumber: emp.bankAccountNo, ifsc: emp.bankIFSC }),
          emp.aadhaarNo || null,
          emp.panNo || null,
          emp.status || 'active',
          null,
          null,
          emp.createdAt || new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync employee:', e.message);
  }
}

export async function liveSyncAttendance(att: EmployeeAttendance, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM attendance WHERE id = ?', [att.id]);
    } else {
      await pool.query(
        `REPLACE INTO attendance (id, employee_id, employee_name, date, status, in_time, out_time, work_hours, overtime_hours, punch_logs, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          att.id,
          att.employeeId,
          att.employeeName,
          att.date,
          att.status,
          att.checkInTime || null,
          att.checkOutTime || null,
          att.totalHoursWorked || 0,
          0,
          JSON.stringify(att.punchLogs || []),
          att.notes || null,
          att.createdAt || new Date().toISOString(),
          att.updatedAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync attendance:', e.message);
  }
}

export async function liveSyncLeave(lv: EmployeeLeave, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM leaves WHERE id = ?', [lv.id]);
    } else {
      await pool.query(
        `REPLACE INTO leaves (id, employee_id, employee_name, leave_type, start_date, end_date, total_days, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lv.id,
          lv.employeeId,
          lv.employeeName,
          lv.leaveType,
          lv.startDate,
          lv.endDate,
          lv.totalDays || 1,
          lv.reason || null,
          lv.status || 'approved',
          lv.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync leave:', e.message);
  }
}

export async function liveSyncEmployeePayment(ep: EmployeePayment, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM employee_payments WHERE id = ?', [ep.id]);
    } else {
      await pool.query(
        `REPLACE INTO employee_payments (id, employee_id, employee_name, date, type, amount, payment_mode, reference_no, notes, month_year, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ep.id,
          ep.employeeId,
          ep.employeeName,
          ep.date,
          ep.type,
          ep.amount,
          ep.paymentMode,
          ep.referenceNo || null,
          ep.notes || null,
          ep.monthYear || null,
          new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync payment:', e.message);
  }
}

export async function liveSyncSettings(s: CompanySettings) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    await pool.query(
      `REPLACE INTO company_settings (
        id, company_name, trade_name, gstin, pan, email, phone, website,
        address_street, address_city, address_state, address_state_code, address_pincode,
        invoice_notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'default',
        s.companyName,
        s.tradeName || null,
        s.gstin || null,
        s.pan || null,
        s.email || null,
        s.phone || null,
        s.website || null,
        s.registeredAddress?.street || null,
        s.registeredAddress?.city || null,
        s.registeredAddress?.state || null,
        s.registeredAddress?.stateCode || null,
        s.registeredAddress?.pincode || null,
        s.invoiceNotes || '',
        new Date().toISOString(),
      ]
    );
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync settings:', e.message);
  }
}

export async function liveSyncUser(u: AppUser, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete || (u.status as any) === 'deleted') {
      await pool.query('DELETE FROM users WHERE id = ?', [u.id]);
    } else {
      await pool.query(
        `REPLACE INTO users (id, username, full_name, email, phone, password_hash, role, status, activation_code, permissions, notes, last_login, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.id,
          u.username,
          u.fullName || u.username,
          u.email,
          u.phone || null,
          u.passwordHash || '',
          u.role,
          u.status,
          u.activationCode || null,
          JSON.stringify(u.permissions || {}),
          u.notes || null,
          u.lastLoginAt || null,
          u.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync user:', e.message);
  }
}

export async function liveSyncCategory(cat: ItemCategory, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM item_categories WHERE id = ?', [cat.id]);
    } else {
      await pool.query(
        `REPLACE INTO item_categories (id, name, description, type, color, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [cat.id, cat.name, cat.description || null, cat.type || 'both', cat.color || null, cat.createdAt || new Date().toISOString()]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync category:', e.message);
  }
}

export async function liveSyncUnit(unit: ItemUnit, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM item_units WHERE id = ?', [unit.id]);
    } else {
      await pool.query(
        `REPLACE INTO item_units (id, code, name, allow_decimal, is_standard) VALUES (?, ?, ?, ?, ?)`,
        [unit.id, unit.code, unit.name, unit.allowDecimal ? 1 : 0, unit.isStandard ? 1 : 0]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync unit:', e.message);
  }
}

export async function liveSyncLocation(loc: ItemLocation, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM item_locations WHERE id = ?', [loc.id]);
    } else {
      await pool.query(
        `REPLACE INTO item_locations (id, name, code, description, capacity, type, is_standard, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [loc.id, loc.name, loc.code || null, loc.description || null, loc.capacity || '0', loc.type || 'yard', loc.isStandard ? 1 : 0, loc.createdAt || new Date().toISOString()]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync location:', e.message);
  }
}

export async function liveSyncAccount(acc: CashBankAccount, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM cash_bank_accounts WHERE id = ?', [acc.id]);
    } else {
      await pool.query(
        `REPLACE INTO cash_bank_accounts (id, name, type, account_number, ifsc_code, bank_name, opening_balance, current_balance, as_of_date, notes, is_default, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          acc.id,
          acc.name,
          acc.type,
          acc.accountNumber || null,
          acc.ifscCode || null,
          acc.bankName || null,
          acc.openingBalance || 0,
          acc.currentBalance || 0,
          acc.asOfDate || '2026-04-01',
          acc.notes || null,
          acc.isDefault ? 1 : 0,
          acc.isActive ?? true ? 1 : 0,
          acc.createdAt || new Date().toISOString(),
          acc.updatedAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync account:', e.message);
  }
}

export async function liveSyncTransfer(trf: InternalTransfer, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM internal_transfers WHERE id = ?', [trf.id]);
    } else {
      await pool.query(
        `REPLACE INTO internal_transfers (id, transfer_number, date, from_account_id, from_account_name, to_account_id, to_account_name, transfer_type, amount, reference_number, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trf.id,
          trf.transferNumber,
          trf.date,
          trf.fromAccountId,
          trf.fromAccountName,
          trf.toAccountId,
          trf.toAccountName,
          trf.transferType,
          trf.amount || 0,
          trf.referenceNumber || null,
          trf.notes || null,
          trf.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync transfer:', e.message);
  }
}

export async function liveSyncAdjustment(adj: AccountAdjustment, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM account_adjustments WHERE id = ?', [adj.id]);
    } else {
      await pool.query(
        `REPLACE INTO account_adjustments (id, adjustment_number, account_id, account_name, account_type, date, type, amount, previous_balance, new_balance, reason, reference_number, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adj.id,
          adj.adjustmentNumber,
          adj.accountId,
          adj.accountName,
          adj.accountType,
          adj.date,
          adj.type,
          adj.amount || 0,
          adj.previousBalance || 0,
          adj.newBalance || 0,
          adj.reason,
          adj.referenceNumber || null,
          adj.notes || null,
          adj.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync adjustment:', e.message);
  }
}

