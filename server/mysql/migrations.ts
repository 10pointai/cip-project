import { getMysqlPool, isMysqlConfigured } from './connection';
import { serverDb } from '../db';

/**
 * Backfill of actual-cost valuation inputs onto historical stock_movements
 * rows (rate, movement_value, valuation_rate_after) using FIFO LOT logic,
 * matching the live valuation engine (server/inventoryValuation.ts):
 *
 * Rate resolution per row, in order:
 *   1. adjustment vouchers: item_stock_adjustments.rate via reference_number
 *   2. order movements: the order's items[] document snapshot (purchase inward
 *      enters at the line rate; sale dispatch / reversal rows consume lots)
 *   3. fallback: the item's catalog cost chain
 * Inward rows create lots at their own rate; outward rows consume the OLDEST
 * lots first and record the blended rate of what they actually consumed.
 * Opening-type rows are skipped — opening stock is the first lot of the item.
 * Rates/values are OVERWRITTEN so re-runs converge to the engine's logic.
 */
async function backfillStockMovementCosts(conn: any): Promise<void> {
  try {
    const [itemRows]: any = await conn.query(
      'SELECT id, opening_stock, opening_stock_price, purchase_price, sale_price, current_stock FROM items'
    );
    const itemMap: Map<string, any> = new Map((itemRows || []).map((r: any) => [r.id, r]));
    const items = new Set((itemRows || []).map((r: any) => r.id));
    const fallbackRate = (id: string): number => {
      const it: any = itemMap.get(id);
      if (!it) return 0;
      return Number(it.opening_stock_price) || Number(it.purchase_price) || Number(it.sale_price) || 0;
    };

    const [adjRows]: any = await conn.query('SELECT item_id, adjustment_number, rate FROM item_stock_adjustments');
    const adjRate = new Map<string, number>();
    for (const a of adjRows || []) {
      const r = Number(a.rate) || 0;
      if (r > 0) adjRate.set(a.adjustment_number, r);
    }

    const [orderRows]: any = await conn.query('SELECT order_number, items FROM orders');
    const orderRates = new Map<string, number>(); // key: `${orderNumber}::${itemId}`
    for (const o of orderRows || []) {
      let lineItems: any[] = [];
      try {
        lineItems = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
      } catch {
        lineItems = [];
      }
      for (const li of lineItems || []) {
        const r = Number(li?.rate) || 0;
        if (r > 0 && li?.itemId) orderRates.set(`${o.order_number}::${li.itemId}`, r);
      }
    }

    const [movRows]: any = await conn.query(
      'SELECT id, item_id, movement_type, quantity, rate, reference_number, movement_date, created_at FROM stock_movements'
    );
    if (!movRows || movRows.length === 0) return;

    // Chronological replay per item so lot consumption order is right
    const byItem = new Map<string, any[]>();
    for (const m of movRows) {
      if (!byItem.has(m.item_id)) byItem.set(m.item_id, []);
      byItem.get(m.item_id)!.push(m);
    }

    let updated = 0;
    for (const [itemId, movs] of byItem) {
      if (!items.has(itemId)) continue;

      // Lots ledger: opening stock is the item's first lot (its own rate)
      const it: any = itemMap.get(itemId);
      const lots: { qty: number; rate: number }[] = [];
      const openingStock = Number(it?.opening_stock) || 0;
      if (openingStock > 0 && fallbackRate(itemId) > 0) {
        lots.push({ qty: openingStock, rate: fallbackRate(itemId) });
      }

      movs.sort((a, b) =>
        `${a.movement_date || ''}|${a.created_at || ''}`.localeCompare(
          `${b.movement_date || ''}|${b.created_at || ''}`
        )
      );

      for (const m of movs) {
        const qty = Number(m.quantity) || 0;
        const stockAfter = lots.reduce((s, l) => s + l.qty, 0);
        let rateUsed = 0;
        let consumedValue: number | null = null;

        if (m.movement_type === 'opening') {
          // Opening is the seed lot — snapshot only, don't replay again
          rateUsed = fallbackRate(itemId);
        } else if (qty > 0) {
          // New lot at its own actual rate; existing lots are never re-priced
          const adj = adjRate.get(m.reference_number || '');
          const ord = orderRates.get(`${m.reference_number || ''}::${itemId}`);
          rateUsed = rOr(adj) || rOr(ord) || rOr(m.rate) || fallbackRate(itemId);
          if (rateUsed > 0) lots.push({ qty, rate: rateUsed });
        } else if (qty < 0) {
          // Consume quantity from the oldest lots first; rates stay intact.
          // rateUsed = blended rate of the quantity actually consumed.
          let need = -qty;
          let consumed = 0;
          let value = 0;
          while (need > 0 && lots.length > 0) {
            const lot = lots[0];
            if (lot.qty <= need) {
              need -= lot.qty;
              consumed += lot.qty;
              value += lot.qty * lot.rate;
              lots.shift();
            } else {
              consumed += need;
              value += need * lot.rate;
              lot.qty -= need;
              need = 0;
            }
          }
          if (consumed > 0) {
            rateUsed = value / consumed;
            consumedValue = value;
          }
        }

        const blendedAfter = stockAfter > 0
          ? lots.reduce((s, l) => s + l.qty * l.rate, 0) / stockAfter
          : 0;
        try {
          await conn.query(
            `UPDATE stock_movements
             SET rate = ?, movement_value = ?, valuation_rate_after = ?
             WHERE id = ?`,
            [
              rateUsed > 0 ? rateUsed : null,
              m.movement_type === 'opening'
                ? (rateUsed > 0 ? Math.abs(qty) * rateUsed : null)
                : consumedValue !== null ? consumedValue : (qty > 0 && rateUsed > 0 ? Math.abs(qty) * rateUsed : null),
              blendedAfter > 0 ? blendedAfter : null,
              m.id,
            ]
          );
          updated++;
        } catch (e: any) {
          console.warn('[MySQL Migration] movement cost backfill notice:', e.message);
        }
      }
    }
    console.log(`[MySQL Migration] FIFO actual-cost backfill applied to ${updated} stock_movements rows.`);
  } catch (e: any) {
    console.warn('[MySQL Migration] stock movement cost backfill skipped:', e.message);
  }
}

function rOr(v: any): number {
  const n = Number(v);
  return n > 0 && !isNaN(n) ? n : 0;
}

/**
 * Automatically provisions the MySQL database schema and runs initial migrations
 * if tables do not exist, ensuring zero downtime and immediate table availability.
 */
export async function runMysqlMigrations(): Promise<{ success: boolean; message: string }> {
  if (!isMysqlConfigured()) {
    return {
      success: false,
      message: 'MySQL is not configured in environment. Operating in persistent fallback mode.',
    };
  }

  const pool = getMysqlPool();
  if (!pool) {
    return { success: false, message: 'Could not acquire MySQL connection pool.' };
  }

  try {
    const conn = await pool.getConnection();

    try {
      console.log('[MySQL Migration] Ensuring schema tables exist...');

      // 1. Company Settings
      await conn.query(`
        CREATE TABLE IF NOT EXISTS company_settings (
          id VARCHAR(64) PRIMARY KEY,
          company_name VARCHAR(255) NOT NULL,
          tagline VARCHAR(255),
          trade_name VARCHAR(255),
          gstin VARCHAR(32),
          pan VARCHAR(32),
          email VARCHAR(255),
          phone VARCHAR(64),
          website VARCHAR(255),
          address_street TEXT,
          address_city VARCHAR(128),
          address_state VARCHAR(128),
          address_state_code VARCHAR(16),
          address_pincode VARCHAR(32),
          bank_name VARCHAR(128),
          bank_account_number VARCHAR(128),
          bank_ifsc_code VARCHAR(64),
          bank_branch VARCHAR(128),
          upi_id VARCHAR(128),
          financial_year VARCHAR(32),
          invoice_notes TEXT,
          updated_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 2. Users Table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(128) NOT NULL UNIQUE,
          full_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          phone VARCHAR(64),
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL DEFAULT 'operator',
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          activation_code VARCHAR(64),
          permissions JSON NOT NULL,
          notes TEXT,
          last_login VARCHAR(64),
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_role (role),
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Ensure backward-compatibility for existing users table columns
      try {
        const [existingCols]: any = await conn.query('SHOW COLUMNS FROM users');
        const colNames = (existingCols || []).map((c: any) => c.Field);
        if (!colNames.includes('activation_code')) {
          await conn.query('ALTER TABLE users ADD COLUMN activation_code VARCHAR(64) NULL AFTER status');
          console.log('[MySQL Migration] Added activation_code column to users table.');
        }
        if (!colNames.includes('notes')) {
          await conn.query('ALTER TABLE users ADD COLUMN notes TEXT NULL AFTER permissions');
          console.log('[MySQL Migration] Added notes column to users table.');
        }
      } catch (alterErr: any) {
        console.warn('[MySQL Migration] Column alter check notice:', alterErr.message);
      }

      // 3. Parties Table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS parties (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          trade_name VARCHAR(255),
          type VARCHAR(32) NOT NULL,
          category VARCHAR(128) NOT NULL,
          gstin VARCHAR(32),
          pan VARCHAR(32),
          contact_person VARCHAR(255),
          phone VARCHAR(64),
          email VARCHAR(255),
          address JSON,
          payment_terms_days INT DEFAULT 30,
          credit_limit DECIMAL(15,2) DEFAULT 0.00,
          opening_balance DECIMAL(15,2) DEFAULT 0.00,
          opening_balance_type VARCHAR(32) DEFAULT 'to_receive',
          current_balance DECIMAL(15,2) DEFAULT 0.00,
          notes TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_party_type (type),
          INDEX idx_party_category (category),
          INDEX idx_party_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 4. Categories, Units, Locations
      await conn.query(`
        CREATE TABLE IF NOT EXISTS item_categories (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          description TEXT,
          type VARCHAR(32) DEFAULT 'both',
          color VARCHAR(32),
          created_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS item_units (
          id VARCHAR(64) PRIMARY KEY,
          code VARCHAR(32) NOT NULL UNIQUE,
          name VARCHAR(128) NOT NULL,
          allow_decimal BOOLEAN DEFAULT TRUE,
          is_standard BOOLEAN DEFAULT FALSE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS item_locations (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          code VARCHAR(32),
          description TEXT,
          capacity VARCHAR(64),
          type VARCHAR(32) DEFAULT 'yard',
          is_standard BOOLEAN DEFAULT FALSE,
          created_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 5. Items
      await conn.query(`
        CREATE TABLE IF NOT EXISTS items (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(64) NOT NULL,
          type VARCHAR(32) NOT NULL,
          category_id VARCHAR(64),
          unit_id VARCHAR(64) COMMENT 'FK item_units — unit display JOINed at read, never a stored name',
          hsn_sac_code VARCHAR(32),
          tax_rate_gst DECIMAL(5,2) DEFAULT 18.00,
          sale_price DECIMAL(15,2) DEFAULT 0.00,
          purchase_price DECIMAL(15,2) DEFAULT 0.00,
          technical_specs TEXT,
          remarks TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          current_stock DECIMAL(15,3) DEFAULT 0.000,
          opening_stock DECIMAL(15,3) DEFAULT 0.000,
          opening_stock_price DECIMAL(15,2) DEFAULT NULL,
          opening_stock_date VARCHAR(32) DEFAULT NULL,
          min_stock_level DECIMAL(15,3) DEFAULT 0.000,
          max_capacity DECIMAL(15,3) DEFAULT 0.000 COMMENT 'Item-level aggregate; per-location capacity lives in item_location_mapping',
          last_stock_update VARCHAR(64),
          movements JSON COMMENT 'LEGACY-ONLY (NULL going forward; ledger is authoritative)',
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_item_code (code),
          INDEX idx_item_category (category_id),
          INDEX idx_item_unit (unit_id),
          INDEX idx_item_type (type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Ensure backward-compatibility / column type upgrades for items table
      try {
        const [itemCols]: any = await conn.query('SHOW COLUMNS FROM items');
        const colNames = (itemCols || []).map((c: any) => c.Field);
        const stockLocCol = (itemCols || []).find((c: any) => c.Field === 'stock_location');
        if (stockLocCol && !stockLocCol.Type.toLowerCase().includes('text')) {
          await conn.query('ALTER TABLE items MODIFY COLUMN stock_location TEXT NULL');
          console.log('[MySQL Migration] Altered items.stock_location column to TEXT.');
        }
        if (!colNames.includes('opening_stock')) {
          await conn.query('ALTER TABLE items ADD COLUMN opening_stock DECIMAL(15,3) DEFAULT 0.000 AFTER current_stock');
        }
        if (!colNames.includes('opening_stock_price')) {
          await conn.query('ALTER TABLE items ADD COLUMN opening_stock_price DECIMAL(15,2) DEFAULT NULL AFTER opening_stock');
        }
        if (!colNames.includes('opening_stock_date')) {
          await conn.query('ALTER TABLE items ADD COLUMN opening_stock_date VARCHAR(32) DEFAULT NULL AFTER opening_stock_price');
        }
        if (!colNames.includes('locations')) {
          await conn.query('ALTER TABLE items ADD COLUMN locations JSON NULL AFTER stock_location');
        }
        if (!colNames.includes('stock_locations')) {
          await conn.query('ALTER TABLE items ADD COLUMN stock_locations JSON NULL AFTER locations');
        }
      } catch (itemAlterErr: any) {
        console.warn('[MySQL Migration] Items column alter check notice:', itemAlterErr.message);
      }

      // 5b. Item Location Mapping Table (Normalized Relational Inventory Allocation)
      await conn.query(`
                CREATE TABLE IF NOT EXISTS item_location_mapping (
          id VARCHAR(64) PRIMARY KEY,
          item_id VARCHAR(64) NOT NULL,
          location_id VARCHAR(64) NOT NULL,
          max_capacity DECIMAL(15,3) COMMENT 'Per-location max stock capacity (from the item form)',
          opening_stock DECIMAL(15,3) NOT NULL DEFAULT 0.000,
          current_stock DECIMAL(15,3) NOT NULL DEFAULT 0.000,
          min_stock_level DECIMAL(15,3) NOT NULL DEFAULT 0.000,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64) NOT NULL,
          UNIQUE KEY uk_item_location (item_id, location_id),
          INDEX idx_ilm_item (item_id),
          INDEX idx_ilm_location (location_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Backfill from items.locations JSON if item_location_mapping is empty
      try {
        const [mappingCount]: any = await conn.query('SELECT COUNT(*) as cnt FROM item_location_mapping');
        if (mappingCount[0]?.cnt === 0) {
          const [itemRows]: any = await conn.query('SELECT id, locations FROM items WHERE locations IS NOT NULL');
          for (const row of itemRows || []) {
            let locs: any[] = [];
            try {
              locs = typeof row.locations === 'string' ? JSON.parse(row.locations) : row.locations;
            } catch {
              locs = [];
            }
            if (Array.isArray(locs) && locs.length > 0) {
              for (const l of locs) {
                const locId = l.locationId || `loc-${Math.random().toString(36).substring(2, 8)}`;
                const mappingId = `ilm-${row.id}-${locId}`;
                await conn.query(`
                  INSERT IGNORE INTO item_location_mapping
                  (id, item_id, location_id, max_capacity, opening_stock, current_stock, min_stock_level, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                  mappingId,
                  row.id,
                  locId,
                  l.maxCapacity !== undefined && l.maxCapacity !== null ? Number(l.maxCapacity) : null,
                  Number(l.openingStock) || 0,
                  Number(l.currentStock) || 0,
                  Number(l.minStockLevel) || 0,
                  new Date().toISOString(),
                  new Date().toISOString(),
                ]);
              }
            }
          }
        }
      } catch (backfillErr: any) {
        console.warn('[MySQL Migration] item_location_mapping backfill notice:', backfillErr.message);
      }

      // 6. Transactions
      await conn.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id VARCHAR(64) PRIMARY KEY,
          voucher_number VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          type VARCHAR(32) NOT NULL,
          -- FKs only (Golden Rule §2): party/account display names are JOINed
          -- from parties / cash_bank_accounts at read time — stored nowhere.
          party_id VARCHAR(64) NOT NULL,
          account_id VARCHAR(64),
          amount DECIMAL(15,2) NOT NULL,
          payment_mode VARCHAR(32),
          reference_number VARCHAR(128),
          material_or_service VARCHAR(255),
          quantity_tonnes DECIMAL(12,3),
          description TEXT NOT NULL,
          status VARCHAR(32) DEFAULT 'paid',
          due_date VARCHAR(32),
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_tx_party (party_id),
          INDEX idx_tx_date (date),
          INDEX idx_tx_type (type),
          INDEX idx_tx_voucher (voucher_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Purge any orphaned transactions whose party was deleted
      try {
        await conn.query('DELETE FROM transactions WHERE party_id NOT IN (SELECT id FROM parties)');
      } catch (cleanErr: any) {
        console.warn('[MySQL Migration] Orphaned transactions cleanup notice:', cleanErr.message);
      }

      // 7. Production Batches
      await conn.query(`
        CREATE TABLE IF NOT EXISTS production_batches (
          id VARCHAR(64) PRIMARY KEY,
          batch_number VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          plant_unit VARCHAR(128) NOT NULL,
          target_item_id VARCHAR(64) NOT NULL,
          target_item_name VARCHAR(255) NOT NULL,
          target_quantity DECIMAL(15,3) NOT NULL,
          unit VARCHAR(32) NOT NULL,
          raw_materials_consumed JSON,
          supervisor_name VARCHAR(128),
          mix_temperature_celsius INT,
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_batch_date (date),
          INDEX idx_batch_number (batch_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 8. Orders
      await conn.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id VARCHAR(64) PRIMARY KEY,
          order_number VARCHAR(64) NOT NULL,
          type VARCHAR(32) NOT NULL,
          party_id VARCHAR(64) NOT NULL,
          party_name VARCHAR(255) NOT NULL,
          date VARCHAR(32) NOT NULL,
          stage VARCHAR(64),
          status VARCHAR(32) DEFAULT 'pending',
          payment_mode VARCHAR(64) DEFAULT 'bank_transfer',
          account_id VARCHAR(64),
          account_name VARCHAR(255),
          payment_status VARCHAR(32) DEFAULT 'paid',
          items JSON,
          tax_rate_gst DECIMAL(5,2) DEFAULT 18.00,
          tax_amount DECIMAL(15,2) DEFAULT 0.00,
          total_amount DECIMAL(15,2) DEFAULT 0.00,
          notes TEXT,
          vehicle_no VARCHAR(64),
          driver_name VARCHAR(128),
          transport_charges DECIMAL(12,2) DEFAULT 0.00,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_orders_party (party_id),
          INDEX idx_orders_date (date),
          INDEX idx_orders_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Ensure backward-compatibility for orders table columns
      try {
        const [ordCols]: any = await conn.query('SHOW COLUMNS FROM orders');
        const ordColNames = (ordCols || []).map((c: any) => c.Field);
        if (!ordColNames.includes('payment_mode')) {
          await conn.query("ALTER TABLE orders ADD COLUMN payment_mode VARCHAR(64) DEFAULT 'bank_transfer' AFTER status");
          console.log('[MySQL Migration] Added payment_mode column to orders table.');
        }
        if (!ordColNames.includes('account_id')) {
          await conn.query('ALTER TABLE orders ADD COLUMN account_id VARCHAR(64) NULL AFTER payment_mode');
          console.log('[MySQL Migration] Added account_id column to orders table.');
        }
        if (!ordColNames.includes('account_name')) {
          await conn.query('ALTER TABLE orders ADD COLUMN account_name VARCHAR(255) NULL AFTER account_id');
          console.log('[MySQL Migration] Added account_name column to orders table.');
        }
        if (!ordColNames.includes('payment_status')) {
          await conn.query("ALTER TABLE orders ADD COLUMN payment_status VARCHAR(32) DEFAULT 'paid' AFTER account_name");
          console.log('[MySQL Migration] Added payment_status column to orders table.');
        }
      } catch (ordAlterErr: any) {
        console.warn('[MySQL Migration] Orders column alter check notice:', ordAlterErr.message);
      }

      // 9. Fleet (Vehicles, Drivers, TripSlips, Tyres)
      await conn.query(`
        CREATE TABLE IF NOT EXISTS vehicles (
          id VARCHAR(64) PRIMARY KEY,
          registration_number VARCHAR(64) NOT NULL UNIQUE,
          type VARCHAR(64) NOT NULL,
          capacity_tonnes DECIMAL(8,2),
          tare_weight_kg DECIMAL(10,2),
          status VARCHAR(32) DEFAULT 'available',
          assigned_driver_id VARCHAR(64),
          assigned_driver_name VARCHAR(128),
          current_odometer DECIMAL(12,2) DEFAULT 0.00,
          fuel_capacity_litres DECIMAL(8,2),
          fitness_expiry_date VARCHAR(32),
          insurance_expiry_date VARCHAR(32),
          puc_expiry_date VARCHAR(32),
          notes TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at VARCHAR(64),
          updated_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS drivers (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          phone VARCHAR(64) NOT NULL,
          license_number VARCHAR(64) NOT NULL,
          license_expiry_date VARCHAR(32),
          status VARCHAR(32) DEFAULT 'available',
          assigned_vehicle_id VARCHAR(64),
          assigned_vehicle_number VARCHAR(64),
          emergency_contact VARCHAR(64),
          address TEXT,
          date_of_joining VARCHAR(32),
          notes TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at VARCHAR(64),
          updated_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS trip_slips (
          id VARCHAR(64) PRIMARY KEY,
          slip_number VARCHAR(64) NOT NULL UNIQUE,
          date VARCHAR(32) NOT NULL,
          vehicle_id VARCHAR(64) NOT NULL,
          vehicle_number VARCHAR(64) NOT NULL,
          driver_id VARCHAR(64) NOT NULL,
          driver_name VARCHAR(128) NOT NULL,
          party_id VARCHAR(64) NOT NULL,
          party_name VARCHAR(255) NOT NULL,
          destination VARCHAR(255) NOT NULL,
          material_name VARCHAR(128) NOT NULL,
          gross_weight_kg DECIMAL(12,2) DEFAULT 0.00,
          tare_weight_kg DECIMAL(12,2) DEFAULT 0.00,
          net_weight_kg DECIMAL(12,2) DEFAULT 0.00,
          net_weight_tonnes DECIMAL(12,3) DEFAULT 0.000,
          start_odometer DECIMAL(12,2) DEFAULT 0.00,
          end_odometer DECIMAL(12,2) DEFAULT 0.00,
          distance_km DECIMAL(10,2) DEFAULT 0.00,
          fuel_issued_litres DECIMAL(10,2) DEFAULT 0.00,
          driver_advance DECIMAL(12,2) DEFAULT 0.00,
          toll_charges DECIMAL(10,2) DEFAULT 0.00,
          freight_rate_per_tonne DECIMAL(10,2) DEFAULT 0.00,
          total_freight_amount DECIMAL(12,2) DEFAULT 0.00,
          status VARCHAR(32) DEFAULT 'dispatched',
          weighbridge_slip_number VARCHAR(64),
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_trip_date (date),
          INDEX idx_trip_vehicle (vehicle_id),
          INDEX idx_trip_party (party_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS tyres (
          id VARCHAR(64) PRIMARY KEY,
          serial_number VARCHAR(64) NOT NULL UNIQUE,
          brand VARCHAR(64) NOT NULL,
          model VARCHAR(64),
          size VARCHAR(64) NOT NULL,
          status VARCHAR(32) DEFAULT 'in_use',
          mounted_vehicle_id VARCHAR(64),
          mounted_vehicle_number VARCHAR(64),
          axle_position VARCHAR(64),
          current_tread_depth_mm DECIMAL(5,2) DEFAULT 0.00,
          initial_tread_depth_mm DECIMAL(5,2) DEFAULT 15.00,
          total_km_run DECIMAL(12,2) DEFAULT 0.00,
          purchase_date VARCHAR(32),
          cost DECIMAL(12,2) DEFAULT 0.00,
          notes TEXT,
          created_at VARCHAR(64),
          updated_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 10. Employees, Attendance, Leaves, Payments
      await conn.query(`
        CREATE TABLE IF NOT EXISTS employees (
          id VARCHAR(64) PRIMARY KEY,
          employee_code VARCHAR(64) NOT NULL UNIQUE,
          name VARCHAR(128) NOT NULL,
          designation VARCHAR(128) NOT NULL,
          department VARCHAR(128) NOT NULL,
          phone VARCHAR(64) NOT NULL,
          email VARCHAR(255),
          date_of_joining VARCHAR(32) NOT NULL,
          salary_type VARCHAR(32) DEFAULT 'monthly',
          base_salary DECIMAL(12,2) DEFAULT 0.00,
          daily_wage_rate DECIMAL(10,2) DEFAULT 0.00,
          bank_details JSON,
          aadhar_number VARCHAR(32),
          pan_number VARCHAR(32),
          status VARCHAR(32) DEFAULT 'active',
          emergency_contact VARCHAR(64),
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_emp_dept (department),
          INDEX idx_emp_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS attendance (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          employee_name VARCHAR(128) NOT NULL,
          date VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL,
          in_time VARCHAR(32),
          out_time VARCHAR(32),
          work_hours DECIMAL(5,2) DEFAULT 0.00,
          overtime_hours DECIMAL(5,2) DEFAULT 0.00,
          punch_logs JSON,
          notes TEXT,
          created_at VARCHAR(64),
          updated_at VARCHAR(64),
          INDEX idx_att_date (date),
          INDEX idx_att_emp (employee_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS leaves (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          employee_name VARCHAR(128) NOT NULL,
          leave_type VARCHAR(32) NOT NULL,
          start_date VARCHAR(32) NOT NULL,
          end_date VARCHAR(32) NOT NULL,
          total_days DECIMAL(5,1) DEFAULT 1.0,
          reason TEXT,
          status VARCHAR(32) DEFAULT 'approved',
          created_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS employee_payments (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          employee_name VARCHAR(128) NOT NULL,
          date VARCHAR(32) NOT NULL,
          type VARCHAR(32) NOT NULL,
          amount DECIMAL(12,2) NOT NULL,
          payment_mode VARCHAR(32) NOT NULL,
          reference_no VARCHAR(128),
          notes TEXT,
          month_year VARCHAR(64),
          created_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 11. Evidence & Cloud Documents
      await conn.query(`
        CREATE TABLE IF NOT EXISTS evidence_folders (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          entity_type VARCHAR(32) NOT NULL,
          entity_id VARCHAR(64),
          entity_name VARCHAR(255),
          parent_id VARCHAR(64),
          is_system_generated BOOLEAN DEFAULT FALSE,
          color VARCHAR(32),
          description TEXT,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_ev_folder (entity_type, entity_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS evidence_files (
          id VARCHAR(64) PRIMARY KEY,
          folder_id VARCHAR(64) NOT NULL,
          name VARCHAR(255) NOT NULL,
          size INT NOT NULL,
          type VARCHAR(128) NOT NULL,
          gcs_uri VARCHAR(512),
          public_url TEXT,
          data_url MEDIUMTEXT,
          entity_type VARCHAR(32) NOT NULL,
          entity_id VARCHAR(64),
          entity_name VARCHAR(255),
          linked_entry_type VARCHAR(64),
          linked_entry_id VARCHAR(64),
          uploaded_by VARCHAR(128),
          description TEXT,
          tags JSON,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_ev_file_folder (folder_id),
          INDEX idx_ev_file_entity (entity_type, entity_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 12. Cash & Bank Management (Accounts, Transfers, Adjustments)
      await conn.query(`
        CREATE TABLE IF NOT EXISTS cash_bank_accounts (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(32) NOT NULL,
          account_number VARCHAR(128),
          ifsc_code VARCHAR(64),
          bank_name VARCHAR(128),
          opening_balance DECIMAL(15,2) DEFAULT 0.00,
          current_balance DECIMAL(15,2) DEFAULT 0.00,
          as_of_date VARCHAR(32) DEFAULT '2026-04-01',
          notes TEXT,
          is_default BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_acc_type (type),
          INDEX idx_acc_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS internal_transfers (
          id VARCHAR(64) PRIMARY KEY,
          transfer_number VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          from_account_id VARCHAR(64) NOT NULL,
          to_account_id VARCHAR(64) NOT NULL,
          transfer_type VARCHAR(64) NOT NULL,
          amount DECIMAL(15,2) NOT NULL,
          reference_number VARCHAR(128),
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_trf_date (date),
          INDEX idx_trf_from (from_account_id),
          INDEX idx_trf_to (to_account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS account_adjustments (
          id VARCHAR(64) PRIMARY KEY,
          adjustment_number VARCHAR(64) NOT NULL,
          account_id VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          type VARCHAR(32) NOT NULL,
          amount DECIMAL(15,2) NOT NULL,
          previous_balance DECIMAL(15,2) NOT NULL,
          new_balance DECIMAL(15,2) NOT NULL,
          reason TEXT NOT NULL,
          reference_number VARCHAR(128),
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_adj_date (date),
          INDEX idx_adj_account (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Cash & Bank FK normalization: transfers/adjustments referenced accounts
      // by name copies. Backfill any missing account ids from the copies via the
      // account master, then drop the denormalized columns (Golden Rule, §2).
      try {
        // internal_transfers
        const [trfCols]: any = await conn.query('SHOW COLUMNS FROM internal_transfers');
        const trfColNames = (trfCols || []).map((c: any) => c.Field);
        if (trfColNames.length > 0) {
          if (!trfColNames.includes('from_account_id')) {
            await conn.query('ALTER TABLE internal_transfers ADD COLUMN from_account_id VARCHAR(64) NULL AFTER date');
          }
          if (!trfColNames.includes('to_account_id')) {
            await conn.query('ALTER TABLE internal_transfers ADD COLUMN to_account_id VARCHAR(64) NULL AFTER from_account_name');
          }
          const hadFromName = trfColNames.includes('from_account_name');
          const hadToName = trfColNames.includes('to_account_name');
          if (hadFromName || hadToName) {
            if (hadFromName) {
              await conn.query(`
                UPDATE internal_transfers trf
                LEFT JOIN cash_bank_accounts fa
                  ON LOWER(TRIM(fa.name)) = LOWER(TRIM(trf.from_account_name))
                SET trf.from_account_id = fa.id
                WHERE (trf.from_account_id IS NULL OR trf.from_account_id = '') AND fa.id IS NOT NULL
              `);
              await conn.query('ALTER TABLE internal_transfers DROP COLUMN from_account_name');
            }
            if (hadToName) {
              await conn.query(`
                UPDATE internal_transfers trf
                LEFT JOIN cash_bank_accounts ta
                  ON LOWER(TRIM(ta.name)) = LOWER(TRIM(trf.to_account_name))
                SET trf.to_account_id = ta.id
                WHERE (trf.to_account_id IS NULL OR trf.to_account_id = '') AND ta.id IS NOT NULL
              `);
              await conn.query('ALTER TABLE internal_transfers DROP COLUMN to_account_name');
            }
            console.log('[MySQL Migration] internal_transfers normalized to account FKs (name columns dropped).');
          }
        }
        // account_adjustments
        const [adjCols]: any = await conn.query('SHOW COLUMNS FROM account_adjustments');
        const adjColNames = (adjCols || []).map((c: any) => c.Field);
        if (adjColNames.length > 0) {
          if (!adjColNames.includes('account_id')) {
            await conn.query('ALTER TABLE account_adjustments ADD COLUMN account_id VARCHAR(64) NULL AFTER adjustment_number');
          }
          const hadAdjName = adjColNames.includes('account_name');
          if (hadAdjName) {
            await conn.query(`
              UPDATE account_adjustments aj
              LEFT JOIN cash_bank_accounts acc
                ON LOWER(TRIM(acc.name)) = LOWER(TRIM(aj.account_name))
              SET aj.account_id = acc.id
              WHERE (aj.account_id IS NULL OR aj.account_id = '') AND acc.id IS NOT NULL
            `);
            await conn.query('ALTER TABLE account_adjustments DROP COLUMN account_name');
          }
          if (adjColNames.includes('account_type')) {
            await conn.query('ALTER TABLE account_adjustments DROP COLUMN account_type');
          }
          if (hadAdjName || adjColNames.includes('account_type')) {
            console.log('[MySQL Migration] account_adjustments normalized to account FK (name/type columns dropped).');
          }
        }
      } catch (cnfkMigErr: any) {
        console.warn('[MySQL Migration] Cash/Bank FK normalization notice:', cnfkMigErr.message);
      }

      // Ensure backward-compatibility for transactions table account columns
      try {
        const [txCols]: any = await conn.query('SHOW COLUMNS FROM transactions');
        const txColNames = (txCols || []).map((c: any) => c.Field);
        if (!txColNames.includes('account_id')) {
          await conn.query('ALTER TABLE transactions ADD COLUMN account_id VARCHAR(64) NULL AFTER date');
          console.log('[MySQL Migration] Added account_id column to transactions table.');
        }
        // account_name is NO LONGER added (§2): the account display name is
        // JOINed from cash_bank_accounts at read time.
      } catch (txAlterErr: any) {
        console.warn('[MySQL Migration] Transactions column alter check notice:', txAlterErr.message);
      }

      // transactions FK normalization: DROP the denormalized party_name /
      // account_name columns (display names JOIN from the masters at read
      // time — Golden Rule §2). Safe: ids are already populated.
      try {
        const [txCols2]: any = await conn.query('SHOW COLUMNS FROM transactions');
        const txColNames2 = (txCols2 || []).map((c: any) => c.Field);
        const txDrops = ['party_name', 'account_name'].filter((c) => txColNames2.includes(c));
        if (txDrops.length > 0) {
          await conn.query(`ALTER TABLE transactions DROP COLUMN ${txDrops.join(', DROP COLUMN ')}`);
          console.log('[MySQL Migration] transactions normalized to FKs: dropped', txDrops.join(', '));
        }
      } catch (txNormErr: any) {
        console.warn('[MySQL Migration] transactions FK normalization notice:', txNormErr.message);
      }

      // 13. Audit Logs
      await conn.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          timestamp VARCHAR(64) NOT NULL,
          action VARCHAR(32) NOT NULL,
          entity VARCHAR(64) NOT NULL,
          entity_id VARCHAR(64),
          details TEXT,
          INDEX idx_audit_time (timestamp)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 14. Item Stock Adjustments (STK-ADJ vouchers - persistent inventory adjustment records)
      // FK store: item_id + location_id only; item/location display names are JOINed at read time.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS item_stock_adjustments (
          id VARCHAR(64) PRIMARY KEY,
          adjustment_number VARCHAR(64) NOT NULL,
          item_id VARCHAR(64) NOT NULL,
          location_id VARCHAR(64),
          adjustment_date VARCHAR(32) NOT NULL,
          adjustment_type VARCHAR(16) NOT NULL,
          quantity DECIMAL(15,3) NOT NULL DEFAULT 0.000,
          rate DECIMAL(15,2) NOT NULL DEFAULT 0.00,
          total_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
          previous_stock DECIMAL(15,3) NOT NULL DEFAULT 0.000,
          new_stock DECIMAL(15,3) NOT NULL DEFAULT 0.000,
          reason VARCHAR(255),
          reference_number VARCHAR(64),
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_isa_item (item_id),
          INDEX idx_isa_number (adjustment_number),
          INDEX idx_isa_location (location_id),
          INDEX idx_isa_date (adjustment_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 15. Stock Movements Ledger (append-only: one row per stock change, never rewritten)
      // FK store: item_id / location_id / party_id; display names resolved by JOINs at read time.
      // rate / movement_value / valuation_rate_after are NUMERIC SNAPSHOTS (facts-as-of-event,
      // documented exception) — the actual-cost (weighted average) valuation inputs.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS stock_movements (
          id VARCHAR(64) PRIMARY KEY,
          item_id VARCHAR(64) NOT NULL,
          location_id VARCHAR(64),
          movement_type VARCHAR(32) NOT NULL,
          quantity DECIMAL(15,3) NOT NULL,
          balance_after DECIMAL(15,3),
          rate DECIMAL(15,4),
          movement_value DECIMAL(15,2),
          valuation_rate_after DECIMAL(15,4),
          reference_type VARCHAR(32),
          reference_number VARCHAR(64),
          party_id VARCHAR(64),
          notes TEXT,
          movement_date VARCHAR(32) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_sm_item (item_id),
          INDEX idx_sm_item_date (item_id, movement_date),
          INDEX idx_sm_location (location_id),
          INDEX idx_sm_party (party_id),
          INDEX idx_sm_ref (reference_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Migrate pre-normalization shapes of these tables (denormalized name columns -> FK cols).
      try {
        const [isaCols]: any = await conn.query('SHOW COLUMNS FROM item_stock_adjustments');
        const isaColNames = (isaCols || []).map((c: any) => c.Field);
        if (isaColNames.length > 0) {
          if (!isaColNames.includes('location_id')) {
            await conn.query('ALTER TABLE item_stock_adjustments ADD COLUMN location_id VARCHAR(64) NULL AFTER reason');
            // Backfill location_id from the old name column via the item's location mapping
            await conn.query(`
              UPDATE item_stock_adjustments isa
              LEFT JOIN item_location_mapping ilm
                ON ilm.item_id = isa.item_id AND LOWER(TRIM(ilm.location_name)) = LOWER(TRIM(isa.location))
              SET isa.location_id = ilm.location_id
              WHERE isa.location_id IS NULL AND isa.location IS NOT NULL AND isa.location <> ''
            `);
          }
          const isaDrops = ['item_name', 'item_code', 'unit', 'location'].filter((c) => isaColNames.includes(c));
          if (isaDrops.length > 0) {
            await conn.query(`ALTER TABLE item_stock_adjustments DROP COLUMN ${isaDrops.join(', DROP COLUMN ')}`);
          }
        }
      } catch (isaMigErr: any) {
        console.warn('[MySQL Migration] item_stock_adjustments normalization notice:', isaMigErr.message);
      }
      try {
        const [smCols]: any = await conn.query('SHOW COLUMNS FROM stock_movements');
        const smColNames = (smCols || []).map((c: any) => c.Field);
        if (smColNames.length > 0) {
          // Add FK columns whenever they are missing — regardless of whether the
          // legacy name columns are present (deployments may sit at any shape).
          if (!smColNames.includes('location_id')) {
            await conn.query('ALTER TABLE stock_movements ADD COLUMN location_id VARCHAR(64) NULL AFTER item_id');
          }
          if (!smColNames.includes('party_id')) {
            await conn.query('ALTER TABLE stock_movements ADD COLUMN party_id VARCHAR(64) NULL AFTER reference_number');
          }
          // Actual-cost valuation columns (FIFO lot replay inputs — numeric
          // snapshots: facts-as-of-event, per documentation §2)
          if (!smColNames.includes('rate')) {
            await conn.query('ALTER TABLE stock_movements ADD COLUMN rate DECIMAL(15,4) NULL AFTER balance_after');
          }
          if (!smColNames.includes('movement_value')) {
            await conn.query('ALTER TABLE stock_movements ADD COLUMN movement_value DECIMAL(15,2) NULL AFTER rate');
          }
          // Deployments that received the earlier avg_cost_after column are
          // renamed to valuation_rate_after (valuation is FIFO, not averaged)
          let renamedValuationColumn = false;
          if (smColNames.includes('avg_cost_after') && !smColNames.includes('valuation_rate_after')) {
            await conn.query(
              'ALTER TABLE stock_movements CHANGE COLUMN avg_cost_after valuation_rate_after DECIMAL(15,4) NULL'
            );
            renamedValuationColumn = true;
          }
          if (!smColNames.includes('valuation_rate_after')) {
            await conn.query('ALTER TABLE stock_movements ADD COLUMN valuation_rate_after DECIMAL(15,4) NULL AFTER movement_value');
          }
          // One-time (per column introduction) FIFO cost backfill: resolve each
          // historical movement's actual cost rate, value, and blended-rate
          // snapshot. OVERWRITES prior values so re-runs converge to engine logic.
          if (!smColNames.includes('movement_value') || renamedValuationColumn) {
            await backfillStockMovementCosts(conn);
          }
          if (smColNames.includes('location_name')) {
            // Backfill location_id from the old name column via the item's location mapping
            await conn.query(`
              UPDATE stock_movements sm
              LEFT JOIN item_location_mapping ilm
                ON ilm.item_id = sm.item_id AND LOWER(TRIM(ilm.location_name)) = LOWER(TRIM(sm.location_name))
              SET sm.location_id = ilm.location_id
              WHERE sm.location_id IS NULL AND sm.location_name IS NOT NULL AND sm.location_name <> ''
            `);
          }
          const smDrops = ['item_name', 'location_name', 'party_name'].filter((c) => smColNames.includes(c));
          if (smDrops.length > 0) {
            await conn.query(`ALTER TABLE stock_movements DROP COLUMN ${smDrops.join(', DROP COLUMN ')}`);
          }
        }
      } catch (smMigErr: any) {
        console.warn('[MySQL Migration] stock_movements normalization notice:', smMigErr.message);
      }

      // One-time backfill: unroll legacy items.movements JSON into the stock_movements ledger.
      // Runs only while the ledger table is still completely empty.
      try {
        const [movCount]: any = await conn.query('SELECT COUNT(*) as cnt FROM stock_movements');
        if (movCount[0]?.cnt === 0) {
          const [itemRows]: any = await conn.query('SELECT id, name, movements FROM items WHERE movements IS NOT NULL');
          let backfilled = 0;
          for (const row of itemRows || []) {
            let movs: any[] = [];
            try {
              movs = typeof row.movements === 'string' ? JSON.parse(row.movements) : row.movements;
            } catch {
              movs = [];
            }
            if (Array.isArray(movs) && movs.length > 0) {
              // movements JSON is stored newest-first; insert in chronological order
              const chronological = [...movs].reverse();
              for (const m of chronological) {
                if (!m || typeof m !== 'object') continue;
                const qty = Number(m.quantity) || 0;
                await conn.query(
                  `INSERT IGNORE INTO stock_movements (
                    id, item_id, movement_type, quantity, balance_after, reference_number, notes, movement_date, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    m.id || `stk-bf-${row.id}-${backfilled}`,
                    row.id,
                    m.type || 'opening',
                    qty,
                    m.balanceAfter !== undefined && m.balanceAfter !== null ? Number(m.balanceAfter) : null,
                    m.referenceNumber || null,
                    m.notes || null,
                    m.date || new Date().toISOString(),
                    m.date || new Date().toISOString(),
                  ]
                );
                backfilled++;
              }
            }
          }
          if (backfilled > 0) {
            console.log(`[MySQL Migration] Backfilled ${backfilled} legacy movements JSON entries into stock_movements ledger.`);
          }
        }
      } catch (backfillErr: any) {
        console.warn('[MySQL Migration] stock_movements backfill notice:', backfillErr.message);
      }

      // =====================================================================
      // ITEMS FK NORMALIZATION (Golden Rule §2, migrated 2026-10-14):
      //   - add unit_id FK and backfill it from the legacy unit code column
      //   - report any items whose unit code matched no master unit
      //   - drop the denormalized name/structure columns:
      //     category_name, unit, stock_location, stock_locations, locations
      // Per-location stock lives ONLY in item_location_mapping (see the next
      // block) — location names are JOINed from the item_locations master.
      // =====================================================================
      try {
        const [imCols]: any = await conn.query('SHOW COLUMNS FROM items');
        const imColNames = (imCols || []).map((c: any) => c.Field);
        if (imColNames.length > 0) {
          if (!imColNames.includes('unit_id')) {
            await conn.query('ALTER TABLE items ADD COLUMN unit_id VARCHAR(64) NULL AFTER category_id');
          }
          const hadUnitName = imColNames.includes('unit');
          if (hadUnitName) {
            // Backfill unit_id from the legacy unit code match
            await conn.query(`
              UPDATE items it
              LEFT JOIN item_units u1 ON LOWER(TRIM(u1.code)) = LOWER(TRIM(it.unit))
              SET it.unit_id = u1.id
              WHERE it.unit_id IS NULL AND it.unit IS NOT NULL AND it.unit <> ''
            `);
            // Name-based fallback match for rows still unresolved
            await conn.query(`
              UPDATE items it
              LEFT JOIN item_units u ON LOWER(TRIM(u.name)) = LOWER(TRIM(it.unit))
              SET it.unit_id = u.id
              WHERE it.unit_id IS NULL AND it.unit IS NOT NULL AND it.unit <> ''
            `);
            // Report unmatched units (value-free of secrets — item names only)
            const [unmatched]: any = await conn.query(
              'SELECT name, code, unit FROM items WHERE unit_id IS NULL'
            );
            if ((unmatched || []).length > 0) {
              console.warn('[MySQL Migration] WARNING: items whose unit matched NO master item_units row (their unit display will be blank until assigned):');
              for (const r of unmatched) console.warn(`   - ${r.name} (${r.code}) unit="${r.unit}"`);
            } else {
              console.log('[MySQL Migration] Unit FK backfill matched all items to master units.');
            }
            await conn.query('ALTER TABLE items DROP COLUMN unit');
          }
          const imDrops = ['category_name', 'stock_location', 'stock_locations', 'locations']
            .filter((c) => imColNames.includes(c));
          if (imDrops.length > 0) {
            await conn.query(`ALTER TABLE items DROP COLUMN ${imDrops.join(', DROP COLUMN ')}`);
            console.log('[MySQL Migration] items normalized to FKs: dropped', imDrops.join(', '));
          }
        }
      } catch (itemNormErr: any) {
        console.warn('[MySQL Migration] items FK normalization notice:', itemNormErr.message);
      }

      // =====================================================================
      // ITEM_LOCATION_MAPPING normalization: FKs only + per-location max capacity.
      // The location NAME column is dropped — names resolve via JOIN against
      // item_locations so location renames propagate to every display.
      // Runs AFTER the stock_movements blocks above (they used the legacy
      // location_name column as a backfill source).
      // =====================================================================
      try {
        const [ilmCols]: any = await conn.query('SHOW COLUMNS FROM item_location_mapping');
        const ilmColNames = (ilmCols || []).map((c: any) => c.Field);
        if (ilmColNames.length > 0) {
          if (!ilmColNames.includes('max_capacity')) {
            await conn.query(
              'ALTER TABLE item_location_mapping ADD COLUMN max_capacity DECIMAL(15,3) NULL AFTER location_id'
            );
            console.log('[MySQL Migration] Added per-location max_capacity to item_location_mapping.');
          }
          if (ilmColNames.includes('location_name')) {
            await conn.query('ALTER TABLE item_location_mapping DROP COLUMN location_name');
            console.log('[MySQL Migration] item_location_mapping normalized: location_name dropped (JOIN resolves names).');
          }
        }
      } catch (ilmNormErr: any) {
        console.warn('[MySQL Migration] item_location_mapping normalization notice:', ilmNormErr.message);
      }

      console.log('[MySQL Migration] All tables verified successfully.');
      return { success: true, message: 'All MySQL schema tables created or verified.' };
    } finally {
      conn.release();
    }
  } catch (err: any) {
    console.error('[MySQL Migration] Error executing migration:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Migrates existing data from local db.json snapshot into MySQL database.
 */
export async function seedMysqlFromSnapshot(): Promise<{ success: boolean; message: string }> {
  if (!isMysqlConfigured()) {
    return { success: false, message: 'MySQL is not configured in environment.' };
  }

  const pool = getMysqlPool();
  if (!pool) return { success: false, message: 'No connection pool' };

  try {
    const snapshot = serverDb.getFullSnapshot();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Seed settings
      if (snapshot.settings) {
        const s = snapshot.settings;
        await conn.query(
          `REPLACE INTO company_settings (
            id, company_name, tagline, trade_name, gstin, pan, email, phone, website,
            address_street, address_city, address_state, address_state_code, address_pincode,
            invoice_notes, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'default_settings',
            s.companyName,
            s.tagline || null,
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
            s.invoiceNotes || null,
            new Date().toISOString(),
          ]
        );
      }

      // Seed users
      for (const u of snapshot.users || []) {
        await conn.query(
          `INSERT IGNORE INTO users (id, username, full_name, email, phone, password_hash, role, status, activation_code, permissions, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.id,
            u.username,
            u.fullName,
            u.email,
            u.phone || null,
            u.passwordHash || '',
            u.role,
            u.status,
            u.activationCode || null,
            JSON.stringify(u.permissions),
            u.notes || null,
            u.createdAt,
          ]
        );
      }

      // Seed parties
      for (const p of snapshot.parties || []) {
        await conn.query(
          `REPLACE INTO parties (id, name, trade_name, type, category, gstin, pan, contact_person, phone, email, address, payment_terms_days, credit_limit, opening_balance, opening_balance_type, current_balance, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.name,
            p.tradeName || null,
            p.type,
            p.category,
            p.gstin || null,
            p.pan || null,
            p.contactPerson || null,
            p.phone || null,
            p.email || null,
            JSON.stringify(p.address || {}),
            p.paymentTermsDays || 30,
            p.creditLimit || 0,
            p.openingBalance || 0,
            p.openingBalanceType || 'to_receive',
            p.currentBalance || 0,
            p.notes || null,
            p.isActive ?? true,
            p.createdAt,
            p.updatedAt,
          ]
        );
      }

      // Seed items
      for (const it of snapshot.items || []) {
        await conn.query(
          // FK store (Golden Rule §2): category name / unit string / location
          // names are NEVER saved on the items row; unit_id resolved from the
          // snapshot (falling back to a master lookup by the unit code).
          `REPLACE INTO items (id, name, code, type, category_id, unit_id, hsn_sac_code, tax_rate_gst, sale_price, purchase_price, technical_specs, remarks, is_active, current_stock, min_stock_level, max_capacity, last_stock_update, movements, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            it.id,
            it.name,
            it.code,
            it.type,
            it.categoryId,
            it.unitId || null,
            it.hsnSacCode || null,
            it.taxRateGst || 18,
            it.salePrice || 0,
            it.purchasePrice || 0,
            it.technicalSpecs || null,
            it.remarks || null,
            it.isActive ?? true,
            it.currentStock || 0,
            it.minStockLevel || 0,
            it.maxCapacity || 0,
            it.lastStockUpdate || null,
            JSON.stringify(it.movements || []),
            it.createdAt,
            it.updatedAt,
          ]
        );
      }

      // Seed transactions
      for (const t of snapshot.transactions || []) {
        await conn.query(
          // FKs only (§2): no name copies stored.
          `REPLACE INTO transactions (id, voucher_number, date, type, party_id, amount, payment_mode, reference_number, material_or_service, quantity_tonnes, description, status, due_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id,
            t.voucherNumber,
            t.date,
            t.type,
            t.partyId,
            t.amount,
            t.paymentMode || null,
            t.referenceNumber || null,
            t.materialOrService || null,
            t.quantityTonnes || null,
            t.description,
            t.status || 'paid',
            t.dueDate || null,
            t.createdAt,
          ]
        );
      }

      // Seed categories
      for (const c of snapshot.categories || []) {
        await conn.query(
          `REPLACE INTO item_categories (id, name, description, type, color, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [c.id, c.name, c.description || null, (c as any).type || 'both', (c as any).color || null, c.createdAt]
        );
      }

      // Seed units
      for (const u of snapshot.units || []) {
        await conn.query(
          `REPLACE INTO item_units (id, code, name, allow_decimal, is_standard) VALUES (?, ?, ?, ?, ?)`,
          [u.id, u.code, u.name, (u as any).allowDecimal ?? true, (u as any).isStandard ?? false]
        );
      }

      // Seed locations
      for (const l of (snapshot.locations || []) as any[]) {
        await conn.query(
          `REPLACE INTO item_locations (id, name, code, description, capacity, type, is_standard, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [l.id, l.name, l.code || null, l.description || null, l.capacity || String(l.capacityTonnes || 0), l.type || 'yard', l.isStandard ?? false, l.createdAt]
        );
      }

      // Seed production batches
      for (const b of snapshot.productionBatches || []) {
        await conn.query(
          `REPLACE INTO production_batches (id, batch_number, date, plant_unit, target_item_id, target_item_name, target_quantity, unit, raw_materials_consumed, supervisor_name, mix_temperature_celsius, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            b.id,
            b.batchNumber,
            b.date || (b.createdAt ? b.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
            b.plantUnit,
            b.targetItemId,
            b.targetItemName,
            b.targetQuantity,
            b.unit,
            JSON.stringify(b.rawMaterialsConsumed || []),
            b.supervisorName || null,
            b.mixTemperatureCelsius || null,
            b.notes || null,
            b.createdAt,
          ]
        );
      }

      // Seed orders
      for (const o of snapshot.orders || []) {
        await conn.query(
          `REPLACE INTO orders (id, order_number, type, party_id, party_name, date, stage, status, payment_mode, account_id, account_name, payment_status, items, tax_rate_gst, tax_amount, total_amount, notes, vehicle_no, driver_name, transport_charges, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            o.id,
            o.orderNumber,
            (o as any).type || (o as any).partyType || 'sale',
            o.partyId,
            o.partyName,
            (o as any).date || (o as any).orderDate || new Date().toISOString().slice(0, 10),
            (o as any).stage || null,
            o.status || 'pending',
            (o as any).paymentMode || 'bank_transfer',
            (o as any).accountId || null,
            (o as any).accountName || null,
            (o as any).paymentStatus || 'paid',
            JSON.stringify(o.items || []),
            (o as any).taxRateGst || 18,
            (o as any).taxAmount || 0,
            o.totalAmount || 0,
            o.notes || null,
            (o as any).vehicleNo || null,
            (o as any).driverName || null,
            (o as any).transportCharges || 0,
            o.createdAt,
            o.updatedAt,
          ]
        );
      }

      // Seed vehicles
      for (const v of (snapshot.vehicles || []) as any[]) {
        await conn.query(
          `REPLACE INTO vehicles (id, registration_number, type, capacity_tonnes, tare_weight_kg, status, assigned_driver_id, assigned_driver_name, current_odometer, fuel_capacity_litres, fitness_expiry_date, insurance_expiry_date, puc_expiry_date, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            v.id,
            (v as any).registrationNumber || (v as any).vehicleNumber || (v as any).registrationNo || v.id,
            v.type || 'Tipper Truck (10 Wheeler)',
            v.capacityTonnes || 0,
            (v as any).tareWeightKg || 0,
            v.status || 'available',
            (v as any).assignedDriverId || (v as any).currentDriverId || null,
            (v as any).assignedDriverName || (v as any).currentDriverName || null,
            (v as any).currentOdometer || (v as any).currentOdometerKm || 0,
            (v as any).fuelCapacityLitres || 200,
            (v as any).fitnessExpiryDate || null,
            (v as any).insuranceExpiryDate || null,
            (v as any).pucExpiryDate || null,
            v.notes || null,
            (v as any).isActive ?? true,
            v.createdAt || new Date().toISOString(),
            v.updatedAt || null,
          ]
        );
      }

      // Seed drivers
      for (const d of (snapshot.drivers || []) as any[]) {
        await conn.query(
          `REPLACE INTO drivers (id, name, phone, license_number, license_expiry_date, status, assigned_vehicle_id, assigned_vehicle_number, emergency_contact, address, date_of_joining, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            d.id,
            d.name,
            d.phone,
            d.licenseNumber || (d as any).licenseNo || ('LIC-' + d.id),
            d.licenseExpiryDate || null,
            d.status || 'available',
            (d as any).assignedVehicleId || null,
            (d as any).assignedVehicleNumber || null,
            d.emergencyContact || null,
            d.address || null,
            (d as any).dateOfJoining || (d as any).joinedDate || null,
            d.notes || null,
            (d as any).isActive ?? true,
            d.createdAt || new Date().toISOString(),
            d.updatedAt || null,
          ]
        );
      }

      // Seed trip slips
      for (const ts of (snapshot.tripSlips || []) as any[]) {
        await conn.query(
          `REPLACE INTO trip_slips (id, slip_number, date, vehicle_id, vehicle_number, driver_id, driver_name, party_id, party_name, destination, material_item_id, material_name, gross_weight_kg, tare_weight_kg, net_weight_kg, net_weight_tonnes, start_odometer, end_odometer, distance_km, fuel_issued_litres, driver_advance, toll_charges, freight_rate_per_tonne, total_freight_amount, status, weighbridge_slip_number, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ts.id,
            ts.slipNumber,
            ts.date || '2026-08-08',
            ts.vehicleId || 'veh-1',
            ts.vehicleNumber || (ts as any).vehicleNo || 'MH-12-RN-8822',
            ts.driverId || 'dr-1',
            ts.driverName || 'Satnam Singh',
            ts.partyId || 'pty-nhai',
            ts.partyName || 'National Highways Authority of India (NHAI)',
            ts.destination || 'Site',
            (ts as any).materialItemId || 'item-dbm',
            ts.materialName || 'Dense Bituminous Macadam',
            ts.grossWeightKg || 0,
            ts.tareWeightKg || 0,
            ts.netWeightKg || 0,
            ts.netWeightTonnes || 0,
            ts.startOdometer || 0,
            ts.endOdometer || 0,
            ts.distanceKm || 0,
            ts.fuelIssuedLitres || (ts as any).fuelIssuedLiters || 0,
            ts.driverAdvance || (ts as any).cashAdvanceRupees || 0,
            ts.tollCharges || 0,
            ts.freightRatePerTonne || 0,
            ts.totalFreightAmount || 0,
            ts.status || 'dispatched',
            ts.weighbridgeSlipNumber || null,
            ts.notes || null,
            ts.createdAt || new Date().toISOString(),
            ts.updatedAt || null,
          ]
        );
      }

      // Seed tyres
      for (const tyr of (snapshot.tyres || []) as any[]) {
        await conn.query(
          `REPLACE INTO tyres (id, serial_number, brand, model, size, status, mounted_vehicle_id, mounted_vehicle_number, axle_position, current_tread_depth_mm, initial_tread_depth_mm, total_km_run, purchase_date, cost, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tyr.id,
            tyr.serialNumber,
            tyr.brand,
            tyr.model || null,
            tyr.size,
            tyr.status || 'in_use',
            tyr.mountedVehicleId || null,
            tyr.mountedVehicleNumber || null,
            tyr.axlePosition || null,
            tyr.currentTreadDepthMm || 0,
            tyr.initialTreadDepthMm || 15,
            tyr.totalKmRun || 0,
            tyr.purchaseDate || null,
            tyr.cost || 0,
            tyr.notes || null,
            tyr.createdAt || null,
            tyr.updatedAt || null,
          ]
        );
      }

      // Seed employees
      for (const emp of (snapshot.employees || []) as any[]) {
        await conn.query(
          `REPLACE INTO employees (id, employee_code, name, designation, department, phone, email, date_of_joining, salary_type, base_salary, daily_wage_rate, bank_details, aadhar_number, pan_number, status, emergency_contact, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            emp.id,
            emp.employeeCode || (emp as any).empCode || ('EMP-' + emp.id.toUpperCase()),
            emp.name,
            emp.designation || (emp as any).role || 'Operations Staff',
            emp.department || 'Operations',
            emp.phone,
            emp.email || null,
            emp.dateOfJoining || (emp as any).joiningDate || '2020-01-15',
            emp.salaryType || 'monthly',
            emp.baseSalary || (emp as any).salaryBase || 0,
            emp.dailyWageRate || 0,
            JSON.stringify(emp.bankDetails || {
              accountNumber: (emp as any).bankAccountNo || null,
              ifscCode: (emp as any).bankIFSC || null,
            }),
            emp.aadharNumber || null,
            emp.panNumber || null,
            emp.status || 'active',
            emp.emergencyContact || null,
            emp.notes || null,
            emp.createdAt,
            emp.updatedAt,
          ]
        );
      }

      // Seed attendance
      for (const att of (snapshot.attendance || []) as any[]) {
        await conn.query(
          `REPLACE INTO attendance (id, employee_id, employee_name, date, status, in_time, out_time, work_hours, overtime_hours, punch_logs, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            att.id,
            att.employeeId,
            att.employeeName,
            att.date,
            att.status,
            att.inTime || null,
            att.outTime || null,
            att.workHours || 0,
            att.overtimeHours || 0,
            JSON.stringify(att.punchLogs || []),
            att.notes || null,
            att.createdAt || null,
            att.updatedAt || null,
          ]
        );
      }

      // Seed leaves
      for (const lv of snapshot.leaves || []) {
        await conn.query(
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
            lv.createdAt || null,
          ]
        );
      }

      // Seed employee payments
      for (const ep of (snapshot.employeePayments || []) as any[]) {
        await conn.query(
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
            ep.createdAt || null,
          ]
        );
      }

      // Seed cash & bank accounts
      for (const acc of (snapshot.accounts || []) as any[]) {
        await conn.query(
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
            acc.updatedAt || null,
          ]
        );
      }

      // Seed internal transfers
      for (const trf of (snapshot.transfers || []) as any[]) {
        await conn.query(
          `REPLACE INTO internal_transfers (id, transfer_number, date, from_account_id, to_account_id, transfer_type, amount, reference_number, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            trf.id,
            trf.transferNumber,
            trf.date,
            trf.fromAccountId,
            trf.toAccountId,
            trf.transferType,
            trf.amount || 0,
            trf.referenceNumber || null,
            trf.notes || null,
            trf.createdAt || new Date().toISOString(),
          ]
        );
      }

      // Seed account adjustments
      for (const adj of (snapshot.adjustments || []) as any[]) {
        await conn.query(
          `REPLACE INTO account_adjustments (id, adjustment_number, account_id, date, type, amount, previous_balance, new_balance, reason, reference_number, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adj.id,
            adj.adjustmentNumber,
            adj.accountId,
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

      // Seed item stock adjustment vouchers (FK-only: item_id, location_id resolved via mapping)
      for (const adj of (snapshot.stockAdjustments || []) as any[]) {
        let locationId: string | null = adj.locationId || null;
        const adjItem = (snapshot.items || []).find((it: any) => it.id === adj.itemId) as any;
        if (!locationId && adjItem && adj.location && Array.isArray(adjItem.locations)) {
          locationId = adjItem.locations.find((l: any) => l.locationName === adj.location)?.locationId || null;
        }
        if (!locationId && adj.location) {
          // Fallback: exact master item_locations match by name
          const master = (snapshot.locations || []).find(
            (ml: any) => (ml.name || '').trim().toLowerCase() === (adj.location || '').trim().toLowerCase()
          ) as any;
          locationId = master?.id || null;
        }
        await conn.query(
          `REPLACE INTO item_stock_adjustments (id, adjustment_number, item_id, location_id, adjustment_date, adjustment_type, quantity, rate, total_value, previous_stock, new_stock, reason, reference_number, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adj.id,
            adj.adjustmentNumber,
            adj.itemId,
            locationId,
            adj.date,
            adj.type,
            adj.quantity || 0,
            adj.rate || 0,
            adj.totalValue || 0,
            adj.previousStock || 0,
            adj.newStock || 0,
            adj.reason || null,
            adj.referenceNumber || null,
            adj.notes || null,
            adj.createdAt || new Date().toISOString(),
          ]
        );
      }

      // Seed stock movements ledger from items' movement logs (best-effort restore)
      for (const item of (snapshot.items || []) as any[]) {
        if (!Array.isArray(item.movements)) continue;
        for (const mov of item.movements) {
          if (!mov || typeof mov !== 'object') continue;
          await conn.query(
            `INSERT IGNORE INTO stock_movements (id, item_id, movement_type, quantity, balance_after, reference_number, notes, movement_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              mov.id,
              item.id,
              mov.type || 'opening',
              mov.quantity || 0,
              mov.balanceAfter !== undefined && mov.balanceAfter !== null ? mov.balanceAfter : null,
              mov.referenceNumber || null,
              mov.notes || null,
              mov.date || new Date().toISOString(),
              mov.date || new Date().toISOString(),
            ]
          );
        }
      }
      // Seed movements from the sandbox stockMovements collection (ledger records with FKs)
      for (const mov of (snapshot.stockMovements || []) as any[]) {
        await conn.query(
          `INSERT IGNORE INTO stock_movements (id, item_id, location_id, movement_type, quantity, balance_after, rate, movement_value, valuation_rate_after, reference_type, reference_number, party_id, notes, movement_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mov.id,
            mov.itemId,
            mov.locationId || null,
            mov.type || 'opening',
            mov.quantity || 0,
            mov.balanceAfter !== undefined && mov.balanceAfter !== null ? mov.balanceAfter : null,
            mov.rate || null,
            mov.movementValue || null,
            mov.valuationRateAfter || null,
            mov.referenceType || null,
            mov.referenceNumber || null,
            mov.partyId || null,
            mov.notes || null,
            mov.date || new Date().toISOString(),
            mov.date || new Date().toISOString(),
          ]
        );
      }

      // Seed audit logs
      for (const aud of (snapshot.auditLogs || []).slice(-50)) {
        await conn.query(
          `REPLACE INTO audit_logs (id, timestamp, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
          [aud.id, aud.timestamp, aud.action, aud.entity, aud.entityId || null, aud.details || null]
        );
      }

      await conn.commit();
      return { success: true, message: 'MySQL successfully seeded with production data snapshot' };
    } catch (txErr: any) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err: any) {
    console.error('[MySQL Seed] Error transferring snapshot to MySQL:', err.message, err.stack);
    return { success: false, message: err.message };
  }
}
